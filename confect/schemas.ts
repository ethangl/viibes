import { Schema } from "effect";

/**
 * Shared literal-union schemas. Reused by both table definitions and function
 * specs (args/returns), so they live in one place.
 */
export const RoomVisibility = Schema.Literal("public", "private");
export type RoomVisibility = typeof RoomVisibility.Type;

export const RoomRole = Schema.Literal("owner", "moderator", "member");
export type RoomRole = typeof RoomRole.Type;

export const RoomActivityKind = Schema.Literal(
  "queue_added",
  "track_started",
  "chat_message",
  "user_entered",
  "user_left",
);
export type RoomActivityKind = typeof RoomActivityKind.Type;
