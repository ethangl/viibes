import { Data } from "effect";

/**
 * Typed errors for the Spotify request loop. In viibes these were all one
 * `SpotifyApiError` (a JS class with a numeric `status`) that callers had to
 * `instanceof`-check and branch on. Here each failure mode is its own tagged
 * type, so the error channel tells you exactly what can go wrong and
 * `Effect.catchTag` lets you handle one case without touching the others.
 */

/** 429 (or an active local cooldown). Carries Spotify's Retry-After hint. */
export class SpotifyRateLimited extends Data.TaggedError("SpotifyRateLimited")<{
  readonly retryAfterSeconds: number | null;
}> {}

/** 401 — the access token was missing/expired/revoked. Triggers a refresh. */
export class SpotifyUnauthorized extends Data.TaggedError(
  "SpotifyUnauthorized",
)<{}> {}

/** Any other non-2xx response. */
export class SpotifyRequestFailed extends Data.TaggedError(
  "SpotifyRequestFailed",
)<{
  readonly status: number;
  readonly body: string;
}> {}

/** The fetch itself threw (DNS, socket, etc.) — never got an HTTP status. */
export class SpotifyNetworkError extends Data.TaggedError(
  "SpotifyNetworkError",
)<{
  readonly cause: unknown;
}> {}
