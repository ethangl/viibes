import { api } from "@api";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";

import type { SpotifyTrack } from "@/features/spotify-client/types";
import { getConvexErrorMessage } from "@/lib/convex-error";
import type { RoomId, RoomQueueItemId } from "../client/room-types";

function reportRoomError(error: unknown) {
  toast.error(getConvexErrorMessage(error, "Something went wrong."));
}

function getRequiredRoomId(roomId: RoomId | null | undefined) {
  if (roomId) {
    return roomId;
  }

  toast.error("Open a room with queue permissions before you add tracks.");
  return null;
}

function toQueuedTrack(track: SpotifyTrack) {
  return {
    trackId: track.id,
    trackName: track.name,
    trackArtists: [track.artist],
    trackImageUrl: track.albumImage ?? undefined,
    trackDurationMs: track.durationMs,
  };
}

interface UseRoomActionsOptions {
  roomId: RoomId | null;
  closeRoom: () => Promise<void>;
  openRoom: (roomId: RoomId) => Promise<void>;
}

export function useRoomActions({
  roomId,
  closeRoom,
  openRoom,
}: UseRoomActionsOptions) {
  const createRoomMutation = useMutation(api.rooms.create);
  const followRoomMutation = useMutation(api.rooms.follow);
  const unfollowRoomMutation = useMutation(api.rooms.unfollow);
  const enqueueTrackMutation = useMutation(api.rooms.enqueueTrack);
  const enqueueTracksMutation = useMutation(api.rooms.enqueueTracks);
  const removeQueueItemMutation = useMutation(api.rooms.removeQueueItem);
  const moveQueueItemMutation = useMutation(api.rooms.moveQueueItem);
  const clearQueueMutation = useMutation(api.rooms.clearQueue);
  const skipRoomMutation = useMutation(api.rooms.skip);

  const createRoom = useCallback(
    async ({ name, description }: { name: string; description?: string }) => {
      try {
        const result = await createRoomMutation({
          name,
          description: description?.trim() || undefined,
        });
        const roomId = result.roomId as RoomId;
        await openRoom(roomId);
        return roomId;
      } catch (error) {
        reportRoomError(error);
        return null;
      }
    },
    [createRoomMutation, openRoom],
  );

  const followRoom = useCallback(
    async (roomId: RoomId) => {
      try {
        await followRoomMutation({ roomId });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [followRoomMutation],
  );

  const unfollowRoom = useCallback(
    async (roomId: RoomId) => {
      try {
        await unfollowRoomMutation({ roomId });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [unfollowRoomMutation],
  );

  const enqueueTrack = useCallback(
    async (track: SpotifyTrack, nextRoomId?: RoomId | null) => {
      const targetRoomId = getRequiredRoomId(nextRoomId ?? roomId);
      if (!targetRoomId) {
        return;
      }

      try {
        await enqueueTrackMutation({
          roomId: targetRoomId,
          ...toQueuedTrack(track),
        });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [enqueueTrackMutation, roomId],
  );

  const enqueueTracks = useCallback(
    async (tracks: SpotifyTrack[], nextRoomId?: RoomId | null) => {
      const targetRoomId = getRequiredRoomId(nextRoomId ?? roomId);
      if (!targetRoomId) {
        return;
      }

      if (tracks.length === 0) {
        toast.error("That playlist does not have any playable tracks.");
        return;
      }

      try {
        await enqueueTracksMutation({
          roomId: targetRoomId,
          tracks: tracks.map(toQueuedTrack),
        });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [enqueueTracksMutation, roomId],
  );

  const removeQueueItem = useCallback(
    async (roomId: RoomId, queueItemId: RoomQueueItemId) => {
      try {
        await removeQueueItemMutation({ roomId, queueItemId });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [removeQueueItemMutation],
  );

  const moveQueueItem = useCallback(
    async (
      roomId: RoomId,
      queueItemId: RoomQueueItemId,
      targetIndex: number,
    ) => {
      try {
        await moveQueueItemMutation({ roomId, queueItemId, targetIndex });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [moveQueueItemMutation],
  );

  const clearQueue = useCallback(
    async (roomId: RoomId) => {
      try {
        await clearQueueMutation({ roomId });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [clearQueueMutation],
  );

  const skipRoom = useCallback(
    async (roomId: RoomId) => {
      try {
        await skipRoomMutation({ roomId });
      } catch (error) {
        reportRoomError(error);
      }
    },
    [skipRoomMutation],
  );

  return {
    closeRoom,
    clearQueue,
    createRoom,
    enqueueTrack,
    enqueueTracks,
    followRoom,
    moveQueueItem,
    openRoom,
    removeQueueItem,
    skipRoom,
    unfollowRoom,
  };
}
