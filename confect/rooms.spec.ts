import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { Unauthorized } from "./rooms/errors";
import { mutArray, RoomActivityEvent, RoomSummary } from "./rooms/schemas";
import type {
  clearQueue,
  create,
  enqueueTrack,
  enqueueTracks,
  follow,
  get,
  moveQueueItem,
  pause,
  play,
  recordCurrentTrackStarted,
  removeQueueItem,
  resume,
  sendChatMessage,
  skip,
  unfollow,
} from "./rooms";

/**
 * The rooms group. Being converted to native confect Effect functions one at a
 * time — converted ones use `publicQuery`/`publicMutation` with Effect Schema
 * args/returns + typed errors; the rest are still PLAIN Convex (registered via
 * `convex*`). Mixing both provenances in one group is supported.
 *
 * Native so far: list, listActivity.
 */
export const rooms = GroupSpec.make("rooms")
  .addFunction(
    FunctionSpec.publicQuery({
      name: "list",
      args: Schema.Struct({}),
      returns: mutArray(RoomSummary),
      error: Unauthorized,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "listActivity",
      args: Schema.Struct({
        roomId: GenericId.GenericId("rooms"),
        since: Schema.Number,
        limit: Schema.optional(Schema.Number),
      }),
      returns: mutArray(RoomActivityEvent),
      error: Unauthorized,
    }),
  )
  .addFunction(FunctionSpec.convexPublicQuery<typeof get>()("get"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof create>()("create"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof follow>()("follow"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof unfollow>()("unfollow"))
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof sendChatMessage>()(
      "sendChatMessage",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof recordCurrentTrackStarted>()(
      "recordCurrentTrackStarted",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof enqueueTrack>()("enqueueTrack"),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof enqueueTracks>()("enqueueTracks"),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof removeQueueItem>()(
      "removeQueueItem",
    ),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof moveQueueItem>()("moveQueueItem"),
  )
  .addFunction(
    FunctionSpec.convexPublicMutation<typeof clearQueue>()("clearQueue"),
  )
  .addFunction(FunctionSpec.convexPublicMutation<typeof play>()("play"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof pause>()("pause"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof resume>()("resume"))
  .addFunction(FunctionSpec.convexPublicMutation<typeof skip>()("skip"));
