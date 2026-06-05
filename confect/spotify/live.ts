import { Effect, Layer } from "effect";

import { authComponent, createAuth } from "../../auth/betterAuth";
import { SpotifyUnauthorized } from "../../auth-loop/errors";
import {
  CoalescerLive,
  CooldownInMemory,
  SpotifyHttpLive,
  TokenSource,
} from "../../auth-loop/services";
import { ActionCtx } from "../_generated/services";

/**
 * Live `TokenSource` for the Spotify request loop: the per-user access token
 * from Better Auth (same path as ironman's `spotifySession.ts`). It needs the
 * caller's request context, so it captures confect's `ActionCtx` service at
 * layer construction.
 *
 * `get` returns Better Auth's current access token (auto-refreshed only when it
 * considers the token expired). `refresh` forces an OAuth refresh-token
 * exchange — distinct from `get` so the loop's 401 path can recover a token
 * Spotify rejected but Better Auth still thinks is valid. Token-fetch failures
 * collapse to `SpotifyUnauthorized`; if the refresh token itself is dead, the
 * loop surfaces it and the action maps it to "Reconnect Spotify".
 */
const TokenSourceFromBetterAuth = Layer.effect(
  TokenSource,
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;

    const acquire = (mode: "get" | "refresh") =>
      Effect.tryPromise({
        try: async () => {
          const { auth, headers } = await authComponent.getAuth(
            createAuth,
            ctx as unknown as Parameters<typeof authComponent.getAuth>[1],
          );
          const authApi = auth.api as {
            getAccessToken(args: {
              body: { providerId: string };
              headers: Headers;
            }): Promise<{ accessToken?: string | null } | null>;
            refreshToken(args: {
              body: { providerId: string };
              headers: Headers;
            }): Promise<{ accessToken?: string | null } | null>;
          };
          const tokens =
            mode === "refresh"
              ? await authApi.refreshToken({
                  body: { providerId: "spotify" },
                  headers,
                })
              : await authApi.getAccessToken({
                  body: { providerId: "spotify" },
                  headers,
                });
          if (!tokens?.accessToken) {
            throw new Error("Missing Spotify access token.");
          }
          return tokens.accessToken;
        },
        catch: () => new SpotifyUnauthorized(),
      });

    return TokenSource.of({
      get: acquire("get"),
      refresh: acquire("refresh"),
    });
  }),
);

/**
 * Everything `spotifyRequest` needs, minus `ActionCtx` (supplied by the confect
 * action runtime). Cooldown + coalescer are in-memory per invocation — matching
 * the best-effort module-level Maps in ironman's `spotify/client.ts`; durable
 * read caching is the action-cache layer above, not this.
 */
export const SpotifyLive = Layer.mergeAll(
  SpotifyHttpLive,
  TokenSourceFromBetterAuth,
  CooldownInMemory,
  CoalescerLive,
);
