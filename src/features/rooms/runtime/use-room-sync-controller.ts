import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { usePlaybackProvider } from "@/features/playback";
import type { RoomDetails, RoomSyncState } from "../client/room-types";
import { toRoomTrack } from "../client/room-utils";
import { getRoomSyncState, type ResolvedRoomPlayback } from "./room-sync";

interface UseRoomSyncControllerOptions {
  activeRoom: RoomDetails | null;
  roomId: string | null;
  resolvedPlayback: ResolvedRoomPlayback | null;
}

interface RoomSyncController {
  repairSync: () => void;
  requestSync: () => void;
  syncState: RoomSyncState;
}

export function useRoomSyncController({
  activeRoom,
  roomId,
  resolvedPlayback,
}: UseRoomSyncControllerOptions): RoomSyncController {
  const { syncTrack, togglePlay, snapshot } = usePlaybackProvider();
  const [syncNonce, setSyncNonce] = useState(0);
  const lastRequestedSyncKeyRef = useRef<string | null>(null);
  const previousRoomIdRef = useRef<string | null>(roomId);

  const activeRoomId = activeRoom?.room._id ?? null;
  const currentQueueItem = resolvedPlayback?.currentQueueItem ?? null;
  const currentQueueItemId = currentQueueItem?._id ?? null;
  const currentTrackId = currentQueueItem?.trackId ?? null;
  const currentOffsetMs = resolvedPlayback?.currentOffsetMs ?? 0;
  const startedAt = resolvedPlayback?.startedAt ?? null;
  const startOffsetMs = resolvedPlayback?.startOffsetMs ?? 0;
  const roomPaused = resolvedPlayback?.paused ?? false;
  const localTrackKey = snapshot?.trackKey ?? null;
  const localPaused = snapshot?.paused ?? true;

  const syncState = useMemo(
    () =>
      getRoomSyncState({
        hasActiveRoom: !!activeRoom,
        resolvedPlayback,
      }),
    [activeRoom, resolvedPlayback],
  );

  const requestSync = useCallback(() => {
    setSyncNonce((current) => current + 1);
  }, []);

  useEffect(() => {
    if (
      previousRoomIdRef.current &&
      !roomId &&
      !localPaused
    ) {
      void togglePlay();
    }

    previousRoomIdRef.current = roomId;
  }, [roomId, localPaused, togglePlay]);

  const runSyncToRoom = useCallback(async () => {
    if (
      !activeRoomId ||
      !currentQueueItem ||
      roomPaused
    ) {
      return;
    }

    const roomTrack = toRoomTrack(currentQueueItem);
    if (!roomTrack) {
      return;
    }

    await syncTrack(roomTrack, currentOffsetMs);
  }, [
    activeRoomId,
    currentOffsetMs,
    currentQueueItem,
    roomPaused,
    syncTrack,
  ]);

  useEffect(() => {
    if (
      !activeRoomId ||
      !currentQueueItemId ||
      roomPaused
    ) {
      return;
    }

    const syncKey = [
      activeRoomId,
      currentQueueItemId,
      startedAt ?? "none",
      startOffsetMs,
      syncNonce,
    ].join(":");

    if (lastRequestedSyncKeyRef.current === syncKey) {
      return;
    }

    lastRequestedSyncKeyRef.current = syncKey;
    void runSyncToRoom();
  }, [
    activeRoomId,
    currentQueueItemId,
    roomPaused,
    runSyncToRoom,
    startOffsetMs,
    startedAt,
    syncNonce,
  ]);

  useEffect(() => {
    if (
      !activeRoomId ||
      !currentTrackId ||
      !localTrackKey ||
      localPaused ||
      !roomPaused
    ) {
      return;
    }

    // Identity match: for Spotify the provider track key IS the queue item's
    // trackId. Step 3 (multi-provider) must compare against the *resolved*
    // provider key for the current canonical track, not the raw trackId.
    if (localTrackKey !== currentTrackId) {
      return;
    }

    void togglePlay();
  }, [
    activeRoomId,
    currentTrackId,
    roomPaused,
    localPaused,
    localTrackKey,
    togglePlay,
  ]);

  return useMemo(
    () => ({
      repairSync: () => requestSync(),
      requestSync,
      syncState,
    }),
    [requestSync, syncState],
  );
}
