import { GenericId } from "@confect/core";
import { Schema } from "effect";

import { RoomRole, RoomVisibility } from "../schemas";

/**
 * Effect-Schema return types for the rooms group, mirroring
 * `src/features/rooms/client/room-types.ts`. Arrays use `mutArray` (mutable)
 * so the generated client types match the frontend's existing mutable types.
 */
export const mutArray = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.mutable(Schema.Array(item));

const RoomId = GenericId.GenericId("rooms");
const QueueItemId = GenericId.GenericId("roomQueueItems");
const ActivityEventId = GenericId.GenericId("roomActivityEvents");

export const RoomSnapshot = Schema.Struct({
  _id: RoomId,
  slug: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  visibility: RoomVisibility,
  ownerUserId: Schema.String,
  createdAt: Schema.Number,
  archivedAt: Schema.NullOr(Schema.Number),
});

export const RoomMembershipSnapshot = Schema.Struct({
  _id: Schema.String,
  role: RoomRole,
  active: Schema.Boolean,
  joinedAt: Schema.Number,
  leftAt: Schema.NullOr(Schema.Number),
});

export const RoomUserSnapshot = Schema.Struct({
  userId: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
});

export const RoomRoleHolderSnapshot = Schema.Struct({
  ...RoomUserSnapshot.fields,
  role: RoomRole,
});

export const RoomQueueItem = Schema.Struct({
  _id: QueueItemId,
  roomId: RoomId,
  position: Schema.Number,
  trackId: Schema.String,
  trackName: Schema.String,
  trackArtists: mutArray(Schema.String),
  trackImageUrl: Schema.NullOr(Schema.String),
  trackDurationMs: Schema.Number,
  addedByUserId: Schema.String,
  addedAt: Schema.Number,
});

export const RoomActivityTrack = Schema.Struct({
  queueItemId: QueueItemId,
  trackId: Schema.String,
  trackName: Schema.String,
  trackArtists: mutArray(Schema.String),
  trackImageUrl: Schema.NullOr(Schema.String),
  trackDurationMs: Schema.Number,
});

const activityBase = {
  _id: ActivityEventId,
  roomId: RoomId,
  createdAt: Schema.Number,
  actor: Schema.NullOr(RoomUserSnapshot),
};

export const RoomActivityEvent = Schema.Union(
  Schema.Struct({
    ...activityBase,
    kind: Schema.Literal("chat_message"),
    body: Schema.String,
  }),
  Schema.Struct({ ...activityBase, kind: Schema.Literal("user_entered") }),
  Schema.Struct({ ...activityBase, kind: Schema.Literal("user_left") }),
  Schema.Struct({
    ...activityBase,
    kind: Schema.Literal("queue_added"),
    track: RoomActivityTrack,
  }),
  Schema.Struct({
    ...activityBase,
    kind: Schema.Literal("track_started"),
    track: RoomActivityTrack,
  }),
);

export const RoomSummary = Schema.Struct({
  room: RoomSnapshot,
  viewerFollowsRoom: Schema.Boolean,
  viewerMembership: Schema.NullOr(RoomMembershipSnapshot),
});

export const RoomPlaybackSnapshot = Schema.Struct({
  currentQueueItemId: Schema.NullOr(QueueItemId),
  currentQueueItem: Schema.NullOr(RoomQueueItem),
  startedAt: Schema.NullOr(Schema.Number),
  startOffsetMs: Schema.Number,
  paused: Schema.Boolean,
  pausedAt: Schema.NullOr(Schema.Number),
  updatedAt: Schema.Number,
  canEnqueue: Schema.Boolean,
  canManageQueue: Schema.Boolean,
  canControlPlayback: Schema.Boolean,
});

export const RoomDetails = Schema.Struct({
  room: RoomSnapshot,
  viewerFollowsRoom: Schema.Boolean,
  viewerMembership: Schema.NullOr(RoomMembershipSnapshot),
  memberCount: Schema.Number,
  presentCount: Schema.Number,
  presentUsers: mutArray(RoomUserSnapshot),
  roleHolders: mutArray(RoomRoleHolderSnapshot),
  queueLength: Schema.Number,
  queue: mutArray(RoomQueueItem),
  playback: RoomPlaybackSnapshot,
});

// ── Mutation result schemas ──────────────────────────────────────────────────
export const CreateResult = Schema.Struct({ roomId: RoomId, slug: Schema.String });
export const FollowResult = Schema.Struct({
  roomId: RoomId,
  followId: GenericId.GenericId("roomFollows"),
});
export const UnfollowResult = Schema.Struct({
  roomId: RoomId,
  unfollowed: Schema.Boolean,
});
export const SendChatResult = Schema.Struct({
  roomId: RoomId,
  eventId: ActivityEventId,
});
export const RecordTrackStartedResult = Schema.Struct({
  roomId: RoomId,
  queueItemId: QueueItemId,
  eventId: Schema.optional(ActivityEventId),
  recorded: Schema.Boolean,
});
export const EnqueueTrackResult = Schema.Struct({
  roomId: RoomId,
  queueItemId: QueueItemId,
  position: Schema.Number,
});
export const EnqueueTracksResult = Schema.Struct({
  count: Schema.Number,
  roomId: RoomId,
});
export const RemoveQueueItemResult = Schema.Struct({
  roomId: RoomId,
  queueItemId: QueueItemId,
  nextQueueItemId: Schema.NullOr(QueueItemId),
});
export const MoveQueueItemResult = Schema.Struct({
  roomId: RoomId,
  queueItemId: QueueItemId,
  targetIndex: Schema.Number,
});
export const ClearQueueResult = Schema.Struct({
  roomId: RoomId,
  removedCount: Schema.Number,
});
export const PlayResult = Schema.Struct({
  roomId: RoomId,
  currentQueueItemId: QueueItemId,
  offsetMs: Schema.Number,
});
export const PauseResult = Schema.Struct({
  roomId: RoomId,
  currentQueueItemId: Schema.NullOr(QueueItemId),
  offsetMs: Schema.Number,
});
export const ResumeResult = Schema.Struct({
  roomId: RoomId,
  currentQueueItemId: QueueItemId,
  offsetMs: Schema.Number,
});
export const SkipResult = Schema.Struct({
  roomId: RoomId,
  currentQueueItemId: Schema.NullOr(QueueItemId),
});
