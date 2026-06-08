import type { Id } from "../../../../convex/_generated/dataModel";

export type RoomId = Id<"rooms">;
export type RoomQueueItemId = Id<"roomQueueItems">;
export type RoomActivityEventId = Id<"roomActivityEvents">;

export type RoomVisibility = "public" | "private";
export type RoomRole = "owner" | "moderator" | "member";

export interface RoomSnapshot {
  _id: RoomId;
  slug: string;
  name: string;
  description: string | null;
  visibility: RoomVisibility;
  ownerUserId: string;
  createdAt: number;
  archivedAt: number | null;
}

export interface RoomMembershipSnapshot {
  _id: string;
  role: RoomRole;
  active: boolean;
  joinedAt: number;
  leftAt: number | null;
}

export interface RoomUserSnapshot {
  userId: string;
  name: string;
  image: string | null;
}

export interface RoomRoleHolderSnapshot extends RoomUserSnapshot {
  role: RoomRole;
}

export interface RoomQueueItem {
  _id: RoomQueueItemId;
  roomId: RoomId;
  position: number;
  trackId: string;
  trackName: string;
  trackArtists: string[];
  trackImageUrl: string | null;
  trackDurationMs: number;
  addedByUserId: string;
  addedAt: number;
}

export interface RoomActivityTrack {
  queueItemId: RoomQueueItemId;
  trackId: string;
  trackName: string;
  trackArtists: string[];
  trackImageUrl: string | null;
  trackDurationMs: number;
}

interface RoomActivityEventBase {
  _id: RoomActivityEventId;
  roomId: RoomId;
  createdAt: number;
  actor: RoomUserSnapshot | null;
}

export interface RoomChatMessageEvent extends RoomActivityEventBase {
  kind: "chat_message";
  body: string;
}

export interface RoomUserEnteredEvent extends RoomActivityEventBase {
  kind: "user_entered";
}

export interface RoomUserLeftEvent extends RoomActivityEventBase {
  kind: "user_left";
}

export interface RoomQueueAddedEvent extends RoomActivityEventBase {
  kind: "queue_added";
  track: RoomActivityTrack;
}

export interface RoomTrackStartedEvent extends RoomActivityEventBase {
  kind: "track_started";
  track: RoomActivityTrack;
}

export type RoomActivityEvent =
  | RoomChatMessageEvent
  | RoomUserEnteredEvent
  | RoomUserLeftEvent
  | RoomQueueAddedEvent
  | RoomTrackStartedEvent;

export interface RoomSummary {
  room: RoomSnapshot;
  viewerFollowsRoom: boolean;
  viewerMembership: RoomMembershipSnapshot | null;
}

export interface RoomPlaybackSnapshot {
  currentQueueItemId: RoomQueueItemId | null;
  currentQueueItem: RoomQueueItem | null;
  startedAt: number | null;
  startOffsetMs: number;
  paused: boolean;
  pausedAt: number | null;
  updatedAt: number;
  canEnqueue: boolean;
  canManageQueue: boolean;
  canControlPlayback: boolean;
}

export interface RoomDetails {
  room: RoomSnapshot;
  viewerFollowsRoom: boolean;
  viewerMembership: RoomMembershipSnapshot | null;
  memberCount: number;
  presentCount: number;
  presentUsers: RoomUserSnapshot[];
  roleHolders: RoomRoleHolderSnapshot[];
  queueLength: number;
  queue: RoomQueueItem[];
  playback: RoomPlaybackSnapshot;
}

export type RoomSyncCode =
  | "idle"
  | "queue_empty"
  | "paused"
  | "syncing"
  | "synced"
  | "track_unavailable";

export interface RoomSyncState {
  code: RoomSyncCode;
  label: string;
  driftMs: number | null;
}
