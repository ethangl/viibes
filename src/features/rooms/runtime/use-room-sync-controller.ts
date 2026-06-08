import { api } from "@api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { PlaybackProvider } from "@/features/playback";
import type { RoomDetails, RoomSyncState } from "../client/room-types";
import { toRoomTrack } from "../client/room-utils";
import { getRoomSyncState, type ResolvedRoomPlayback } from "./room-sync";

interface UseRoomSyncControllerOptions {
  activeRoom: RoomDetails | null;
  roomId: string | null;
  resolvedPlayback: ResolvedRoomPlayback | null;
  /** The active playback provider (shared with the player UI). */
  provider: PlaybackProvider;
  /**
   * Whether the provider can actually produce audio yet. Spotify is always
   * ready; Apple is only ready once the listener connects MusicKit. Playback is
   * gated on this so the first sync waits for — and re-fires on — connection.
   */
  ready: boolean;
}

interface RoomSyncController {
  repairSync: () => void;
  requestSync: () => void;
  syncState: RoomSyncState;
  /**
   * Playback is ready but the browser blocked it pending a user gesture (the
   * autoplay policy — e.g. on a page reload before any interaction). The UI
   * shows a "Start listening" tap, which calls {@link RoomSyncController.startPlayback}.
   */
  autoplayBlocked: boolean;
  /** Start playback from a user gesture (clears {@link RoomSyncController.autoplayBlocked}). */
  startPlayback: () => void;
}

/** True once the user has interacted with the page (autoplay is then allowed). */
function hasUserActivation(): boolean {
  if (typeof navigator === "undefined") return true;
  const activation = navigator.userActivation;
  // Browsers without the API (older Safari) — let the play attempt itself decide.
  if (!activation) return true;
  return activation.hasBeenActive;
}

/** Whether an error is the browser refusing to play without a user gesture. */
function isAutoplayError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /didn['’]?t interact|user (gesture|activation)|NotAllowed|play\(\) failed/i.test(
    message,
  );
}

/**
 * Resolution of the current queue item to the active provider's track id. For
 * Spotify this is identity (the queue item's `trackId`); for Apple it's the
 * catalog id fetched server-side via `playback.resolveTrack`. `null` track id
 * means the canonical track has no equivalent on the provider (unavailable).
 */
interface TrackResolution {
  queueItemId: string;
  providerId: PlaybackProvider["id"];
  status: "pending" | "ready" | "unavailable";
  trackId: string | null;
}

export function useRoomSyncController({
  activeRoom,
  roomId,
  resolvedPlayback,
  provider,
  ready,
}: UseRoomSyncControllerOptions): RoomSyncController {
  const { id: providerId, syncTrack, togglePlay, snapshot } = provider;
  const resolveTrack = useAction(api.playback.resolveTrack);
  const [syncNonce, setSyncNonce] = useState(0);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [resolution, setResolution] = useState<TrackResolution | null>(null);
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

  // Resolve the current queue item to a provider track id whenever it (or the
  // provider) changes. Spotify is identity and resolves synchronously; Apple
  // hits the server (`resolveTrack`), so the resolution carries a `pending`
  // status until it returns.
  useEffect(() => {
    if (!currentQueueItemId || !currentTrackId) {
      setResolution(null);
      return;
    }

    if (providerId === "spotify") {
      setResolution({
        queueItemId: currentQueueItemId,
        providerId,
        status: "ready",
        trackId: currentTrackId,
      });
      return;
    }

    let cancelled = false;
    setResolution({
      queueItemId: currentQueueItemId,
      providerId,
      status: "pending",
      trackId: null,
    });
    void resolveTrack({ queueItemId: currentQueueItemId, provider: providerId })
      .then((trackId) => {
        if (cancelled) return;
        setResolution({
          queueItemId: currentQueueItemId,
          providerId,
          status: trackId === null ? "unavailable" : "ready",
          trackId,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setResolution({
          queueItemId: currentQueueItemId,
          providerId,
          status: "unavailable",
          trackId: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currentQueueItemId, currentTrackId, providerId, resolveTrack]);

  // The resolution is only meaningful for the queue item / provider it was made
  // for; otherwise treat the current track as still resolving.
  const resolutionMatches =
    resolution !== null &&
    resolution.queueItemId === currentQueueItemId &&
    resolution.providerId === providerId;
  const resolvedStatus = resolutionMatches ? resolution.status : "pending";
  const resolvedTrackId = resolutionMatches ? resolution.trackId : null;

  const syncState = useMemo(
    () =>
      getRoomSyncState({
        hasActiveRoom: !!activeRoom,
        resolvedPlayback,
        trackUnavailable: resolvedStatus === "unavailable",
      }),
    [activeRoom, resolvedPlayback, resolvedStatus],
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
      roomPaused ||
      !ready ||
      resolvedStatus !== "ready" ||
      resolvedTrackId === null
    ) {
      return;
    }

    const roomTrack = toRoomTrack(currentQueueItem);
    if (!roomTrack) {
      return;
    }

    // The autoplay policy blocks play() until the user interacts with the page
    // (e.g. on a reload before any click). Surface a gesture prompt rather than
    // letting the play attempt fail in the console.
    if (!hasUserActivation()) {
      setAutoplayBlocked(true);
      return;
    }

    try {
      // `syncTrack` plays `track.id` verbatim, so hand it the *resolved*
      // provider id rather than the queue item's origin (Spotify) trackId.
      await syncTrack({ ...roomTrack, id: resolvedTrackId }, currentOffsetMs);
      setAutoplayBlocked(false);
    } catch (error) {
      // Fallback for browsers without the userActivation API: catch the play()
      // rejection and prompt for a gesture. Surface anything else.
      if (isAutoplayError(error)) {
        setAutoplayBlocked(true);
      } else {
        console.error("Room playback sync failed", error);
      }
    }
  }, [
    activeRoomId,
    currentOffsetMs,
    currentQueueItem,
    ready,
    resolvedStatus,
    resolvedTrackId,
    roomPaused,
    syncTrack,
  ]);

  useEffect(() => {
    if (
      !activeRoomId ||
      !currentQueueItemId ||
      roomPaused ||
      !ready ||
      resolvedStatus !== "ready" ||
      resolvedTrackId === null
    ) {
      return;
    }

    const syncKey = [
      activeRoomId,
      currentQueueItemId,
      resolvedTrackId,
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
    ready,
    resolvedStatus,
    resolvedTrackId,
    roomPaused,
    runSyncToRoom,
    startOffsetMs,
    startedAt,
    syncNonce,
  ]);

  useEffect(() => {
    if (
      !activeRoomId ||
      !localTrackKey ||
      localPaused ||
      !roomPaused ||
      !ready ||
      resolvedStatus !== "ready" ||
      resolvedTrackId === null
    ) {
      return;
    }

    // Resume only when the local player is already on the room's current track.
    // Compare against the *resolved* provider key, not the queue item's origin
    // trackId — for Apple those differ.
    if (localTrackKey !== resolvedTrackId) {
      return;
    }

    void togglePlay();
  }, [
    activeRoomId,
    ready,
    resolvedStatus,
    resolvedTrackId,
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
      autoplayBlocked,
      // Called from a click, so the play() runs inside a user gesture and the
      // autoplay policy allows it. The sync effect already recorded this track's
      // key, so it won't double-fire.
      startPlayback: () => void runSyncToRoom(),
    }),
    [autoplayBlocked, requestSync, runSyncToRoom, syncState],
  );
}
