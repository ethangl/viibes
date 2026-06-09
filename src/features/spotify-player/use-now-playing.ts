import { toRoomTrack, useOptionalRooms } from "@/features/rooms";

// Static decorative palette for the player swirl. Playback is room-synced via
// Apple MusicKit, which exposes no track color palette; derive from room art
// later if desired.
const DEFAULT_PALETTE = ["#1f2430", "#2a2433", "#24302f"] as const;

export function useNowPlaying() {
  const rooms = useOptionalRooms();
  const activeRoom = rooms?.activeRoom ?? null;
  const resolvedPlayback = rooms?.resolvedPlayback ?? null;
  const roomTrack = toRoomTrack(resolvedPlayback?.currentQueueItem ?? null);
  const roomName = activeRoom?.room.name ?? "";
  const isRoomMode = activeRoom !== null;
  const roomPaused = resolvedPlayback?.paused ?? false;
  const hasRoomTrack = !!resolvedPlayback?.currentQueueItem;
  const canControlPlayback = !!activeRoom?.playback.canControlPlayback;

  const displayProgress = resolvedPlayback?.currentOffsetMs ?? 0;
  const displayDuration = roomTrack?.durationMs ?? 0;
  const pct =
    displayDuration > 0 ? (displayProgress / displayDuration) * 100 : 0;
  const displayName = roomTrack?.name ?? roomName;
  const displayArtist = roomTrack
    ? `${roomName} • ${roomTrack.artist}`
    : roomName;
  const compactDisplayArtist = roomName;
  const displayImage = roomTrack?.albumImage ?? null;
  const displayTrackId = roomTrack?.id ?? "";
  const isPlaying = hasRoomTrack;

  const toggleRoomListening = () => {
    if (!activeRoom) {
      return;
    }

    if (!resolvedPlayback?.currentQueueItem) {
      return;
    }

    if (roomPaused) {
      rooms?.repairSync?.();
      return;
    }

    if (!rooms?.closeRoom) {
      return;
    }

    void rooms.closeRoom();
  };

  const skipRoomTrack = () => {
    if (!activeRoom || !rooms?.skipRoom) {
      return;
    }

    void rooms.skipRoom(activeRoom.room._id);
  };

  const roomPlayback = activeRoom
    ? {
        activeRoom,
        canControlPlayback,
        canSkip: canControlPlayback && hasRoomTrack,
        canToggleListening: hasRoomTrack,
        hasTrack: hasRoomTrack,
        paused: roomPaused,
        skip: skipRoomTrack,
        track: roomTrack,
        toggleListening: toggleRoomListening,
      }
    : null;

  return {
    activeRoom,
    compactDisplayArtist,
    displayProgress,
    displayDuration,
    pct,
    isPlaying,
    isRoomMode,
    displayName,
    displayArtist,
    displayImage,
    displayTrackId,
    palette: DEFAULT_PALETTE,
    roomPlayback,
  };
}
