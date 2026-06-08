import { resolveRoomPlaybackState } from "@shared/rooms-state";

import type {
  RoomDetails,
  RoomQueueItem,
  RoomSyncState,
} from "../client/room-types";

export interface ResolvedRoomPlayback {
  currentQueueItem: RoomQueueItem | null;
  currentQueueItemId: RoomQueueItem["_id"] | null;
  currentOffsetMs: number;
  paused: boolean;
  pausedAt: number | null;
  startedAt: number | null;
  startOffsetMs: number;
}

function buildPlaybackQueue(roomDetails: RoomDetails) {
  return roomDetails.playback.currentQueueItem
    ? [
        roomDetails.playback.currentQueueItem,
        ...roomDetails.queue.filter(
          (queueItem) =>
            queueItem._id !== roomDetails.playback.currentQueueItemId,
        ),
      ]
    : roomDetails.queue;
}

function normalizeVisibleQueue(queue: RoomQueueItem[]) {
  return queue.map((queueItem, index) => ({
    ...queueItem,
    position: index,
  }));
}

export function resolveRoomPlayback(
  roomDetails: RoomDetails | null,
  now: number,
): ResolvedRoomPlayback | null {
  if (!roomDetails) {
    return null;
  }

  if (
    roomDetails.playback.currentQueueItemId === null &&
    roomDetails.playback.currentQueueItem === null &&
    roomDetails.playback.startedAt === null
  ) {
    return {
      currentQueueItem: null,
      currentQueueItemId: null,
      currentOffsetMs: 0,
      paused: true,
      pausedAt: roomDetails.playback.pausedAt,
      startedAt: null,
      startOffsetMs: 0,
    };
  }

  const playbackQueue = buildPlaybackQueue(roomDetails);

  const resolvedPlayback = resolveRoomPlaybackState(
    playbackQueue.map((queueItem, index) => ({
      ...queueItem,
      position: index,
    })),
    {
      currentQueueItemId: roomDetails.playback.currentQueueItemId,
      startedAt: roomDetails.playback.startedAt,
      startOffsetMs: roomDetails.playback.startOffsetMs,
      paused: roomDetails.playback.paused,
      pausedAt: roomDetails.playback.pausedAt,
    },
    now,
  );

  return {
    ...resolvedPlayback,
    currentQueueItem:
      playbackQueue.find(
        (queueItem) => queueItem._id === resolvedPlayback.currentQueueItemId,
      ) ?? null,
  };
}

export function getVisibleRoomQueue(
  roomDetails: RoomDetails | null,
  resolvedPlayback: ResolvedRoomPlayback | null,
) {
  if (!roomDetails) {
    return [];
  }

  if (!resolvedPlayback?.currentQueueItemId) {
    return normalizeVisibleQueue(roomDetails.queue);
  }

  const playbackQueue = buildPlaybackQueue(roomDetails);
  const currentQueueItemIndex = playbackQueue.findIndex(
    (queueItem) => queueItem._id === resolvedPlayback.currentQueueItemId,
  );

  if (currentQueueItemIndex < 0) {
    return normalizeVisibleQueue(
      roomDetails.queue.filter(
        (queueItem) => queueItem._id !== resolvedPlayback.currentQueueItemId,
      ),
    );
  }

  return normalizeVisibleQueue(playbackQueue.slice(currentQueueItemIndex + 1));
}

export function getRoomSyncState({
  hasActiveRoom,
  resolvedPlayback,
  trackUnavailable = false,
}: {
  hasActiveRoom: boolean;
  resolvedPlayback: ResolvedRoomPlayback | null;
  /** The current track can't be resolved for the active provider (no match). */
  trackUnavailable?: boolean;
}): RoomSyncState {
  if (!hasActiveRoom || !resolvedPlayback) {
    return {
      code: "idle",
      label: "Not listening to a room",
      driftMs: null,
    };
  }

  if (!resolvedPlayback.currentQueueItem) {
    return {
      code: "queue_empty",
      label: "Queue is empty",
      driftMs: null,
    };
  }

  if (resolvedPlayback.paused) {
    return {
      code: "paused",
      label: "Playback stopped",
      driftMs: null,
    };
  }

  if (trackUnavailable) {
    return {
      code: "track_unavailable",
      label: "This track isn’t on Apple Music",
      driftMs: null,
    };
  }

  return {
    code: "synced",
    label: "Following room",
    driftMs: null,
  };
}
