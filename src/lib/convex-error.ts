import { ConvexError } from "convex/values";

/**
 * Extract a user-facing message from an error thrown by a Convex call.
 *
 * The confect backend encodes its typed errors (e.g. `InvalidInput`,
 * `Forbidden`, `Conflict`) into a `ConvexError` whose `.data` is
 * `{ _tag, message }`. The plain `Error.message` of such an error is the
 * JSON-stringified `.data` blob, so reading `error.message` directly surfaces
 * raw JSON in the UI. This reads `error.data.message` first, then falls back to
 * a plain `Error.message`, then to the supplied fallback.
 */
export function getConvexErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string" && data.length > 0) {
      return data;
    }
    if (
      data !== null &&
      typeof data === "object" &&
      "message" in data &&
      typeof (data as { message: unknown }).message === "string" &&
      (data as { message: string }).message.length > 0
    ) {
      return (data as { message: string }).message;
    }
    // A ConvexError's `.message` is the JSON-stringified `.data`, so falling
    // through to it would surface the very blob we want to avoid. Use the
    // fallback instead.
    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
