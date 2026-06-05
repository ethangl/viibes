import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const RoomQueueItems = Table.make(
  "roomQueueItems",
  Schema.Struct({
    roomId: GenericId.GenericId("rooms"),
    position: Schema.Number,
    trackId: Schema.String,
    // Canonical cross-service recording id. Optional: absent on pre-existing
    // rows and on tracks added from album context (simplified Spotify objects).
    isrc: Schema.optional(Schema.String),
    // Per-provider resolution cache (ISRC → that provider's track id), shared
    // across everyone in the room. A present string is the resolved id; null is
    // a negative result (known-unavailable on that provider); an absent field
    // means "not resolved yet". Written by `playback.resolveTrack`.
    providerHints: Schema.optional(
      Schema.Struct({
        apple: Schema.optional(Schema.NullOr(Schema.String)),
        spotify: Schema.optional(Schema.NullOr(Schema.String)),
      }),
    ),
    trackName: Schema.String,
    trackArtists: Schema.Array(Schema.String),
    trackImageUrl: Schema.optional(Schema.String),
    trackDurationMs: Schema.Number,
    addedByUserId: Schema.String,
    addedByUserTokenIdentifier: Schema.String,
    addedAt: Schema.Number,
    removedAt: Schema.NullOr(Schema.Number),
  }),
)
  .index("by_roomId_and_removedAt_and_position", [
    "roomId",
    "removedAt",
    "position",
  ])
  .index("by_roomId_and_addedAt", ["roomId", "addedAt"]);
