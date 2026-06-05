import { Effect, Option, Schedule } from "effect";

import {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "./errors";
import {
  Coalescer,
  Cooldown,
  SpotifyHttp,
  type SpotifyResponse,
  TokenSource,
} from "./services";

export interface RequestOptions {
  readonly method?: string;
  readonly body?: string;
}

/** Exponential backoff, capped at 3 retries — used only for transient 5xx. */
const TRANSIENT_RETRY = Schedule.exponential("100 millis").pipe(
  Schedule.intersect(Schedule.recurs(3)),
);

const isTransient = (
  error:
    | SpotifyRateLimited
    | SpotifyRequestFailed
    | SpotifyUnauthorized
    | SpotifyNetworkError,
): boolean => error._tag === "SpotifyRequestFailed" && error.status >= 500;

const parseBody = <T>(res: SpotifyResponse): T | null => {
  if (res.body.length === 0) return null;
  try {
    return JSON.parse(res.body) as T;
  } catch {
    // The original tolerated non-JSON success bodies by returning null.
    return null;
  }
};

/**
 * The Spotify request loop. Compare to viibes's `spotifyFetch`: the same
 * behaviors (cooldown gate, 429 → set cooldown, JSON tolerance, GET dedupe)
 * plus the auth loop the original delegated elsewhere (401 → refresh → retry)
 * and transient-error backoff — all expressed declaratively in the error
 * channel instead of with throw/catch + mutable Maps.
 */
export const spotifyRequest = <T = unknown>(
  path: string,
  options: RequestOptions = {},
): Effect.Effect<
  T | null,
  | SpotifyRateLimited
  | SpotifyRequestFailed
  | SpotifyUnauthorized
  | SpotifyNetworkError,
  SpotifyHttp | TokenSource | Cooldown | Coalescer
> =>
  Effect.gen(function* () {
    const method = options.method ?? "GET";
    const key = `${method}:${path}`;

    const cooldown = yield* Cooldown;
    const http = yield* SpotifyHttp;
    const tokens = yield* TokenSource;

    // A single round-trip: cooldown gate → token → send → interpret status.
    const fetchOnce: Effect.Effect<
      T | null,
      | SpotifyRateLimited
      | SpotifyRequestFailed
      | SpotifyUnauthorized
      | SpotifyNetworkError
    > = Effect.gen(function* () {
      const active = yield* cooldown.getRetryAfter(key);
      if (Option.isSome(active)) {
        return yield* Effect.fail(
          new SpotifyRateLimited({ retryAfterSeconds: active.value }),
        );
      }

      const token = yield* tokens.get;
      const res = yield* http.send({
        path,
        method,
        token,
        ...(options.body === undefined ? {} : { body: options.body }),
      });

      if (res.status === 204 || res.status === 202) return null;
      if (res.ok) return parseBody<T>(res);

      if (res.status === 429) {
        yield* cooldown.set(key, res.retryAfterSeconds);
        return yield* Effect.fail(
          new SpotifyRateLimited({ retryAfterSeconds: res.retryAfterSeconds }),
        );
      }
      if (res.status === 401) {
        return yield* Effect.fail(new SpotifyUnauthorized());
      }
      return yield* Effect.fail(
        new SpotifyRequestFailed({ status: res.status, body: res.body }),
      );
    });

    // 401 → refresh the token once, then retry exactly once (the inner
    // fetchOnce is *not* re-wrapped, so a second 401 propagates).
    const withRefresh = fetchOnce.pipe(
      Effect.catchTag("SpotifyUnauthorized", () =>
        tokens.refresh.pipe(Effect.zipRight(fetchOnce)),
      ),
    );

    // Transient 5xx → exponential backoff, bounded.
    const withRetry = withRefresh.pipe(
      Effect.retry({ schedule: TRANSIENT_RETRY, while: isTransient }),
    );

    // Concurrent identical GETs share one in-flight request.
    if (method === "GET") {
      const coalescer = yield* Coalescer;
      return yield* coalescer.single(key, withRetry);
    }
    return yield* withRetry;
  });

/**
 * Like viibes's `spotifyFetchOptional`: swallow any failure and return a
 * fallback. Note the error channel becomes `never` — the type proves there's
 * nothing left to handle.
 */
export const spotifyRequestOptional = <T>(
  path: string,
  fallback: T,
  options: RequestOptions = {},
): Effect.Effect<T, never, SpotifyHttp | TokenSource | Cooldown | Coalescer> =>
  spotifyRequest<T>(path, options).pipe(
    Effect.map((value) => value ?? fallback),
    Effect.catchAll(() => Effect.succeed(fallback)),
  );
