import { Schema } from "effect";

/**
 * Typed errors for the spotify group. Confect encodes these through each
 * function's `error:` schema into a `ConvexError`, so the client can read
 * `error.data._tag` / `error.data.message` directly (see
 * `src/features/spotify-client/spotify-error.ts`). Without an `error:` schema
 * confect `orDie`s every failure into an opaque `UnknownException`, which is
 * why a Spotify 401 used to surface to the UI as a dead screen with no message.
 *
 * Per-function error unions are declared in `spotify.spec.ts`.
 */

/** Spotify token expired/revoked and could not be refreshed — user must reconnect. */
export class SpotifyAuthRequired extends Schema.TaggedError<SpotifyAuthRequired>()(
  "SpotifyAuthRequired",
  { message: Schema.String },
) {}

/** Any other Spotify failure (rate limited, upstream 5xx, network). */
export class SpotifyUnavailable extends Schema.TaggedError<SpotifyUnavailable>()(
  "SpotifyUnavailable",
  { message: Schema.String },
) {}
