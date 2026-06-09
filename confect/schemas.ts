import { Schema } from "effect";

/**
 * A MUTABLE array schema, as opposed to `Schema.Array` (which is `readonly`):
 * vanilla Convex `v.array` generates mutable `T[]`, and the frontend's local
 * types are mutable, so this keeps decoded values assignable to client types.
 * (Readonly struct *properties* are assignable to mutable ones in TS, so only
 * arrays need this.)
 */
export const mutArray = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.mutable(Schema.Array(item));

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
