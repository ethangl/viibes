import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { RoomVisibility } from "./schemas";
import {
  Conflict,
  Forbidden,
  InvalidInput,
  NotFound,
  RoomNotFound,
  Unauthorized,
} from "./rooms/errors";
import {
  ClearQueueResult,
  CreateResult,
  EnqueueTrackResult,
  EnqueueTracksResult,
  FollowResult,
  MoveQueueItemResult,
  mutArray,
  PauseResult,
  PlayResult,
  RecordTrackStartedResult,
  RemoveQueueItemResult,
  ResumeResult,
  RoomActivityEvent,
  RoomDetails,
  RoomSummary,
  SendChatResult,
  SkipResult,
  UnfollowResult,
} from "./rooms/schemas";

const RoomId = GenericId.GenericId("rooms");
const QueueItemId = GenericId.GenericId("roomQueueItems");

const QueuedTrackInput = Schema.Struct({
  trackId: Schema.String,
  trackName: Schema.String,
  trackArtists: mutArray(Schema.String),
  trackImageUrl: Schema.optional(Schema.String),
  trackDurationMs: Schema.Number,
});

/**
 * The rooms group — fully native confect Effect functions: `publicQuery`/
 * `publicMutation` with Effect Schema args/returns and typed errors (the
 * end-to-end replacement for `throw new Error(...)`). Error unions are declared
 * per function; the handlers in `rooms.impl.ts` delegate to `rooms/core.ts`.
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
        roomId: RoomId,
        since: Schema.Number,
        limit: Schema.optional(Schema.Number),
      }),
      returns: mutArray(RoomActivityEvent),
      error: Unauthorized,
    }),
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "get",
      args: Schema.Struct({
        roomId: Schema.optional(RoomId),
        slug: Schema.optional(Schema.String),
      }),
      returns: Schema.NullOr(RoomDetails),
      error: Unauthorized,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "create",
      args: Schema.Struct({
        name: Schema.String,
        slug: Schema.optional(Schema.String),
        description: Schema.optional(Schema.String),
        visibility: Schema.optional(RoomVisibility),
      }),
      returns: CreateResult,
      error: Schema.Union(Unauthorized, InvalidInput),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "follow",
      args: Schema.Struct({ roomId: RoomId }),
      returns: FollowResult,
      error: Schema.Union(Unauthorized, RoomNotFound),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "unfollow",
      args: Schema.Struct({ roomId: RoomId }),
      returns: UnfollowResult,
      error: Unauthorized,
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "sendChatMessage",
      args: Schema.Struct({ roomId: RoomId, body: Schema.String }),
      returns: SendChatResult,
      error: Schema.Union(Unauthorized, RoomNotFound, InvalidInput),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "recordCurrentTrackStarted",
      args: Schema.Struct({ roomId: RoomId, queueItemId: QueueItemId }),
      returns: RecordTrackStartedResult,
      error: Schema.Union(Unauthorized, RoomNotFound),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "enqueueTrack",
      args: Schema.Struct({
        roomId: RoomId,
        trackId: Schema.String,
        trackName: Schema.String,
        trackArtists: mutArray(Schema.String),
        trackImageUrl: Schema.optional(Schema.String),
        trackDurationMs: Schema.Number,
      }),
      returns: EnqueueTrackResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden, InvalidInput),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "enqueueTracks",
      args: Schema.Struct({
        roomId: RoomId,
        tracks: Schema.Array(QueuedTrackInput),
      }),
      returns: EnqueueTracksResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden, InvalidInput),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "removeQueueItem",
      args: Schema.Struct({ roomId: RoomId, queueItemId: QueueItemId }),
      returns: RemoveQueueItemResult,
      error: Schema.Union(
        Unauthorized,
        RoomNotFound,
        Forbidden,
        Conflict,
        NotFound,
      ),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "moveQueueItem",
      args: Schema.Struct({
        roomId: RoomId,
        queueItemId: QueueItemId,
        targetIndex: Schema.Number,
      }),
      returns: MoveQueueItemResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden, NotFound),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "clearQueue",
      args: Schema.Struct({ roomId: RoomId }),
      returns: ClearQueueResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "play",
      args: Schema.Struct({
        roomId: RoomId,
        queueItemId: Schema.optional(QueueItemId),
        offsetMs: Schema.optional(Schema.Number),
      }),
      returns: PlayResult,
      error: Schema.Union(
        Unauthorized,
        RoomNotFound,
        Forbidden,
        Conflict,
        NotFound,
      ),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "pause",
      args: Schema.Struct({ roomId: RoomId }),
      returns: PauseResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "resume",
      args: Schema.Struct({ roomId: RoomId }),
      returns: ResumeResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden, Conflict),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "skip",
      args: Schema.Struct({ roomId: RoomId }),
      returns: SkipResult,
      error: Schema.Union(Unauthorized, RoomNotFound, Forbidden),
    }),
  );
