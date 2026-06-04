import { Schema } from "effect";

/**
 * Typed errors for the rooms group — the confect end-to-end replacement for the
 * `throw new Error(...)`s in the original `convex/rooms.ts`. Each carries a
 * `message` (except the no-arg cases) so the client can surface it directly
 * from `error.data.message` with minimal change. Per-function error unions are
 * declared in `rooms.spec.ts`.
 */

/** No authenticated user. (was: "Unauthorized") */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {},
) {}

/** Room missing / archived / not visible to the viewer. (was: "Room not found.") */
export class RoomNotFound extends Schema.TaggedError<RoomNotFound>()(
  "RoomNotFound",
  {},
) {}

/** Caller lacks the required role/permission. (role gate, moderator gate, owner-only removal) */
export class Forbidden extends Schema.TaggedError<Forbidden>()("Forbidden", {
  message: Schema.String,
}) {}

/** Bad input — name/track/duration/chat validation, identifier count, empty playlist. */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
  "InvalidInput",
  { message: Schema.String },
) {}

/** A referenced entity (queue item, current track) does not exist. */
export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  message: Schema.String,
}) {}

/** Operation not valid in the current state (remove current track, nothing to resume). */
export class Conflict extends Schema.TaggedError<Conflict>()("Conflict", {
  message: Schema.String,
}) {}
