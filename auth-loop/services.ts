import {
  Clock,
  Context,
  Deferred,
  Effect,
  HashMap,
  Layer,
  Option,
  Ref,
} from "effect";

import { SpotifyNetworkError, SpotifyUnauthorized } from "./errors";

/**
 * The dependencies of the request loop, expressed as Effect *services* (Context
 * tags). This is the dependency-inversion that makes the loop testable: the
 * loop never touches `fetch`, the clock, or Better Auth directly — it asks for
 * `SpotifyHttp`, `Cooldown`, `TokenSource`. Production provides the "Live"
 * layers; tests provide fakes. Same loop code in both.
 */

export interface SpotifyResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly retryAfterSeconds: number | null;
  readonly body: string;
}

export interface SpotifyRequestInput {
  readonly path: string;
  readonly method: string;
  readonly token: string;
  readonly body?: string;
}

// ── Network boundary ───────────────────────────────────────────────────────

export class SpotifyHttp extends Context.Tag("SpotifyHttp")<
  SpotifyHttp,
  {
    readonly send: (
      input: SpotifyRequestInput,
    ) => Effect.Effect<SpotifyResponse, SpotifyNetworkError>;
  }
>() {}

const SPOTIFY_API = "https://api.spotify.com/v1";

/**
 * Per-request log line, ported from ironman's `spotify/client.ts`. AGENTS.md
 * relies on this to spot 429s in ordinary usage ("if we are seeing Spotify
 * 429s ... the query design is wrong"), so the boundary must surface
 * status + retry-after. Skipped under test to keep output quiet.
 */
function logSpotifyRequest(details: {
  path: string;
  method: string;
  status: number;
  durationMs: number;
  retryAfterSeconds: number | null;
}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const parts = [
    `[spotify] ${details.method} ${details.path}`,
    `status=${details.status}`,
    `duration=${details.durationMs}ms`,
  ];
  if (details.retryAfterSeconds) {
    parts.push(`retry_after=${details.retryAfterSeconds}s`);
  }
  console.info(parts.join(" "));
}

/** Real implementation over `fetch`. (Untested here — that's the point: the
 *  loop's behavior is tested against a fake; this just adapts the boundary.) */
export const SpotifyHttpLive = Layer.succeed(
  SpotifyHttp,
  SpotifyHttp.of({
    send: ({ path, method, token, body }) =>
      Effect.tryPromise({
        try: async () => {
          const startedAt = Date.now();
          const res = await fetch(`${SPOTIFY_API}${path}`, {
            method,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            ...(body === undefined ? {} : { body }),
          });
          const retryAfterSeconds =
            Number(res.headers.get("retry-after")) || null;
          logSpotifyRequest({
            path,
            method,
            status: res.status,
            durationMs: Date.now() - startedAt,
            retryAfterSeconds,
          });
          return {
            status: res.status,
            ok: res.ok,
            retryAfterSeconds,
            body: await res.text(),
          } satisfies SpotifyResponse;
        },
        catch: (cause) => new SpotifyNetworkError({ cause }),
      }),
  }),
);

// ── Access-token source ──────────────────────────────────────────────────────

export class TokenSource extends Context.Tag("TokenSource")<
  TokenSource,
  {
    /** Current cached access token (acquires one if needed). */
    readonly get: Effect.Effect<string, SpotifyUnauthorized>;
    /** Force a refresh; subsequent `get` returns the new token. */
    readonly refresh: Effect.Effect<string, SpotifyUnauthorized>;
  }
>() {}

// ── Rate-limit cooldown store ────────────────────────────────────────────────

export class Cooldown extends Context.Tag("Cooldown")<
  Cooldown,
  {
    readonly getRetryAfter: (
      key: string,
    ) => Effect.Effect<Option.Option<number>>;
    readonly set: (
      key: string,
      retryAfterSeconds: number | null,
    ) => Effect.Effect<void>;
  }
>() {}

const FALLBACK_COOLDOWN_MS = 5_000;

/** In-memory cooldown (per-runtime). A production layer would back `get`/`set`
 *  with the confect `spotifyCooldown` table we built in the other half of the
 *  spike — same interface, durable storage. */
export const CooldownInMemory = Layer.effect(
  Cooldown,
  Effect.gen(function* () {
    // key -> nextAllowedAt (epoch ms)
    const ref = yield* Ref.make(HashMap.empty<string, number>());

    return Cooldown.of({
      getRetryAfter: (key) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const map = yield* Ref.get(ref);
          const at = HashMap.get(map, key);
          if (Option.isNone(at)) return Option.none<number>();
          if (now >= at.value) {
            yield* Ref.update(ref, HashMap.remove(key));
            return Option.none<number>();
          }
          return Option.some(Math.max(1, Math.ceil((at.value - now) / 1000)));
        }),
      set: (key, retryAfterSeconds) =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const durationMs =
            retryAfterSeconds && retryAfterSeconds > 0
              ? retryAfterSeconds * 1000
              : FALLBACK_COOLDOWN_MS;
          yield* Ref.update(ref, HashMap.set(key, now + durationMs));
        }),
    });
  }),
);

// ── GET single-flight coalescer ──────────────────────────────────────────────

/**
 * Coalesces concurrent calls sharing a key onto one in-flight effect, dropping
 * the entry once it settles (so a later call re-runs). Replaces ironman's
 * `runDedupedGetRequest` Map-of-promises with `Ref.modify` (atomic
 * check-and-claim) + `Deferred` (the shared result) + `onExit` (cleanup).
 */
export class Coalescer extends Context.Tag("Coalescer")<
  Coalescer,
  {
    readonly single: <A, E, R>(
      key: string,
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>;
  }
>() {}

export const CoalescerLive = Layer.effect(
  Coalescer,
  Effect.gen(function* () {
    const ref = yield* Ref.make(
      HashMap.empty<string, Deferred.Deferred<unknown, unknown>>(),
    );

    type Decision = {
      readonly lead: boolean;
      readonly d: Deferred.Deferred<unknown, unknown>;
    };
    type Entries = HashMap.HashMap<string, Deferred.Deferred<unknown, unknown>>;

    const single = <A, E, R>(
      key: string,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E, R> =>
      Effect.gen(function* () {
        const fresh = yield* Deferred.make<A, E>();
        const erased = fresh as unknown as Deferred.Deferred<unknown, unknown>;

        // Atomically either claim the key (lead) or find the in-flight one.
        const decision = yield* Ref.modify(
          ref,
          (map): readonly [Decision, Entries] => {
            const existing = HashMap.get(map, key);
            if (Option.isSome(existing)) {
              return [{ lead: false, d: existing.value }, map];
            }
            return [{ lead: true, d: erased }, HashMap.set(map, key, erased)];
          },
        );

        if (!decision.lead) {
          return yield* (Deferred.await(decision.d) as Effect.Effect<A, E>);
        }

        return yield* effect.pipe(
          Effect.onExit((exit) =>
            Deferred.done(fresh, exit).pipe(
              Effect.zipRight(Ref.update(ref, HashMap.remove(key))),
            ),
          ),
        );
      });

    return Coalescer.of({ single });
  }),
);

/** All in-memory layers wired together — convenient default for tests/demos. */
export const AuthLoopDefault = Layer.mergeAll(CooldownInMemory, CoalescerLive);
