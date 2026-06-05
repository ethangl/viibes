import { ConvexError } from "convex/values";

import { getConvexErrorMessage } from "@/lib/convex-error";

/**
 * The confect spotify actions encode typed failures into a `ConvexError` whose
 * `.data` is `{ _tag, message }` (see `confect/spotify/errors.ts`):
 * `SpotifyAuthRequired` (token dead → reconnect) or `SpotifyUnavailable`. These
 * read that payload so screens can show a real message + a reconnect affordance
 * instead of a blank screen.
 */

/** User-facing message for any error thrown by a spotify Convex action. */
export function getSpotifyErrorMessage(error: unknown, fallback: string): string {
  return getConvexErrorMessage(error, fallback);
}

/** True when the failure is a dead/expired Spotify token (user must reconnect). */
export function isSpotifyAuthRequired(error: unknown): boolean {
  if (!(error instanceof ConvexError)) {
    return false;
  }
  const data: unknown = error.data;
  return (
    data !== null &&
    typeof data === "object" &&
    "_tag" in data &&
    (data as { _tag?: unknown })._tag === "SpotifyAuthRequired"
  );
}
