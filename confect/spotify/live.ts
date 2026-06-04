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
 * layer construction. Better Auth refreshes under the hood, so `refresh`
 * re-fetches. Token-fetch failures collapse to `SpotifyUnauthorized` (the loop
 * then surfaces it; there is no refresh token to retry with here).
 */
const TokenSourceFromBetterAuth = Layer.effect(
  TokenSource,
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;

    const load = Effect.tryPromise({
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
        };
        const tokens = await authApi.getAccessToken({
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

    return TokenSource.of({ get: load, refresh: load });
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
