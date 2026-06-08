import { act, renderHook } from "@testing-library/react";
import type { ContextType, PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import { RoomsContext } from "@/features/rooms/runtime/rooms-context";
import type { ResolvedRoomPlayback } from "@/features/rooms/runtime/room-sync";
import type {
  RoomDetails,
  RoomId,
  RoomQueueItem,
  RoomQueueItemId,
} from "@/features/rooms/client/room-types";
import type { Track } from "@/features/spotify-client/types";
import {
  WebPlayerActionsContext,
  WebPlayerStateContext,
} from "./use-web-player";
import { useNowPlaying } from "./use-now-playing";

type WebPlayerActions = NonNullable<
  ContextType<typeof WebPlayerActionsContext>
>;
type WebPlayerState = NonNullable<ContextType<typeof WebPlayerStateContext>>;
type RoomsValue = NonNullable<ContextType<typeof RoomsContext>>;

function createActions(overrides: Partial<WebPlayerActions> = {}): WebPlayerActions {
  return {
    isAuthenticated: true,
    nextTrack: vi.fn().mockResolvedValue(undefined),
    playTrack: vi.fn().mockResolvedValue(undefined),
    playTracks: vi.fn().mockResolvedValue(undefined),
    prevTrack: vi.fn().mockResolvedValue(undefined),
    setExpanded: vi.fn(),
    setVolume: vi.fn().mockResolvedValue(undefined),
    spotify: {
      init: vi.fn(),
      play: vi.fn().mockResolvedValue({ ok: true, status: 200 }),
      setRepeat: vi.fn().mockResolvedValue(undefined),
      waitForReady: vi.fn().mockResolvedValue(null),
    },
    syncTrack: vi.fn().mockResolvedValue(undefined),
    togglePlay: vi.fn().mockResolvedValue(undefined),
    toggleShuffle: vi.fn(),
    ...overrides,
  };
}

function createState(overrides: Partial<WebPlayerState> = {}): WebPlayerState {
  return {
    currentTrack: null,
    durationMs: 0,
    expanded: false,
    hasQueue: false,
    palette: ["#000", "#222", "#444"],
    paused: false,
    progressMs: 0,
    queue: [],
    queueIndex: 0,
    sdkState: null,
    shuffled: false,
    volume: 50,
    ...overrides,
  };
}

function createRoomsValue(overrides: Partial<RoomsValue> = {}): RoomsValue {
  return {
    activeRoom: null,
    activeRoomLoading: false,
    clearQueue: vi.fn().mockResolvedValue(undefined),
    closeRoom: vi.fn().mockResolvedValue(undefined),
    createRoom: vi.fn().mockResolvedValue(null),
    enqueueTrack: vi.fn().mockResolvedValue(undefined),
    enqueueTracks: vi.fn().mockResolvedValue(undefined),
    followRoom: vi.fn().mockResolvedValue(undefined),
    moveQueueItem: vi.fn().mockResolvedValue(undefined),
    openRoom: vi.fn().mockResolvedValue(undefined),
    playbackConnection: {
      status: "idle",
      connect: vi.fn().mockResolvedValue(undefined),
    },
    autoplayBlocked: false,
    startPlayback: vi.fn(),
    removeQueueItem: vi.fn().mockResolvedValue(undefined),
    repairSync: vi.fn(),
    resolvedPlayback: null,
    rooms: [],
    roomsLoading: false,
    skipRoom: vi.fn().mockResolvedValue(undefined),
    syncState: {
      code: "idle",
      driftMs: null,
      label: "Not listening to a room",
    },
    unfollowRoom: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createRoomQueueItem(
  overrides: Partial<RoomQueueItem> = {},
): RoomQueueItem {
  return {
    _id: "queue-1" as RoomQueueItemId,
    addedAt: 0,
    addedByUserId: "user-1",
    position: 0,
    roomId: "room-1" as RoomId,
    trackArtists: ["Room Artist"],
    trackDurationMs: 210000,
    trackId: "room-track",
    trackImageUrl: "https://example.com/room-track.jpg",
    trackName: "Room Track",
    ...overrides,
  };
}

function createRoomDetails({
  canControlPlayback = true,
  currentQueueItem,
  queue,
}: {
  canControlPlayback?: boolean;
  currentQueueItem?: RoomQueueItem | null;
  queue?: RoomQueueItem[];
} = {}): RoomDetails {
  const resolvedCurrentQueueItem = currentQueueItem ?? createRoomQueueItem();
  const resolvedQueue = queue ?? [resolvedCurrentQueueItem];

  return {
    memberCount: 1,
    playback: {
      canControlPlayback,
      canEnqueue: true,
      canManageQueue: true,
      currentQueueItem: resolvedCurrentQueueItem,
      currentQueueItemId: resolvedCurrentQueueItem?._id ?? null,
      paused: false,
      pausedAt: null,
      startOffsetMs: 0,
      startedAt: 0,
      updatedAt: 0,
    },
    presentCount: 1,
    presentUsers: [],
    queue: resolvedQueue,
    queueLength: resolvedQueue.length,
    roleHolders: [],
    room: {
      _id: resolvedCurrentQueueItem?.roomId ?? ("room-1" as RoomId),
      archivedAt: null,
      createdAt: 0,
      description: null,
      name: "Party Room",
      ownerUserId: "user-1",
      slug: "party-room",
      visibility: "public",
    },
    viewerFollowsRoom: true,
    viewerMembership: null,
  };
}

function createResolvedRoomPlayback(
  overrides: Partial<ResolvedRoomPlayback> = {},
): ResolvedRoomPlayback {
  const currentQueueItem =
    overrides.currentQueueItem === undefined
      ? createRoomQueueItem()
      : overrides.currentQueueItem;

  return {
    currentOffsetMs: 45000,
    currentQueueItem,
    currentQueueItemId: currentQueueItem?._id ?? null,
    paused: false,
    pausedAt: null,
    startOffsetMs: 0,
    startedAt: 0,
    ...overrides,
  };
}

function createWrapper({
  actions = createActions(),
  rooms = null,
  state = createState(),
}: {
  actions?: WebPlayerActions;
  rooms?: RoomsValue | null;
  state?: WebPlayerState;
}) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <WebPlayerActionsContext.Provider value={actions}>
        <WebPlayerStateContext.Provider value={state}>
          <RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
        </WebPlayerStateContext.Provider>
      </WebPlayerActionsContext.Provider>
    );
  };
}

describe("useNowPlaying", () => {
  it("uses SDK-backed web player data when no room is active", () => {
    const currentTrack: Track = {
      albumImage: "https://example.com/track.jpg",
      artist: "Artist A",
      durationMs: 170000,
      id: "track-a",
      name: "Track A",
    };

    const { result } = renderHook(() => useNowPlaying(), {
      wrapper: createWrapper({
        state: createState({
          currentTrack,
          durationMs: 160000,
          hasQueue: true,
          progressMs: 5000,
          sdkState: {
            duration: 180000,
            paused: false,
            position: 12000,
            trackId: currentTrack.id,
          },
        }),
      }),
    });

    expect(result.current.isRoomMode).toBe(false);
    expect(result.current.roomPlayback).toBeNull();
    expect(result.current.displayName).toBe("Track A");
    expect(result.current.displayArtist).toBe("Artist A");
    expect(result.current.compactDisplayArtist).toBe("Artist A");
    expect(result.current.displayImage).toBe("https://example.com/track.jpg");
    expect(result.current.displayProgress).toBe(12000);
    expect(result.current.displayDuration).toBe(180000);
    expect(result.current.displayTrackId).toBe("track-a");
    expect(result.current.hasQueue).toBe(true);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.pct).toBeCloseTo(6.67, 2);
  });

  it("prefers active-room track metadata and shared room actions", async () => {
    const currentQueueItem = createRoomQueueItem();
    const queuedUpNext = createRoomQueueItem({
      _id: "queue-2" as RoomQueueItemId,
      position: 1,
      trackId: "room-track-2",
      trackImageUrl: "https://example.com/room-track-2.jpg",
      trackName: "Room Track 2",
    });
    const closeRoom = vi.fn().mockResolvedValue(undefined);
    const skipRoom = vi.fn().mockResolvedValue(undefined);
    const roomDetails = createRoomDetails({
      currentQueueItem,
      queue: [currentQueueItem, queuedUpNext],
    });

    const { result } = renderHook(() => useNowPlaying(), {
      wrapper: createWrapper({
        rooms: createRoomsValue({
          activeRoom: roomDetails,
          closeRoom,
          resolvedPlayback: createResolvedRoomPlayback({
            currentOffsetMs: 90000,
            currentQueueItem,
          }),
          skipRoom,
        }),
        state: createState({
          currentTrack: null,
          hasQueue: false,
        }),
      }),
    });

    expect(result.current.isRoomMode).toBe(true);
    expect(result.current.displayName).toBe("Room Track");
    expect(result.current.displayArtist).toBe("Party Room • Room Artist");
    expect(result.current.compactDisplayArtist).toBe("Party Room");
    expect(result.current.displayImage).toBe(
      "https://example.com/room-track.jpg",
    );
    expect(result.current.displayProgress).toBe(90000);
    expect(result.current.displayDuration).toBe(210000);
    expect(result.current.displayTrackId).toBe("room-track");
    expect(result.current.hasQueue).toBe(true);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.roomPlayback?.canSkip).toBe(true);

    await act(async () => {
      result.current.roomPlayback?.toggleListening();
      result.current.roomPlayback?.skip();
    });

    expect(closeRoom).toHaveBeenCalledTimes(1);
    expect(skipRoom).toHaveBeenCalledWith(roomDetails.room._id);
  });

  it("repairs room sync instead of closing the room when playback is paused", () => {
    const currentQueueItem = createRoomQueueItem();
    const closeRoom = vi.fn().mockResolvedValue(undefined);
    const repairSync = vi.fn();

    const { result } = renderHook(() => useNowPlaying(), {
      wrapper: createWrapper({
        rooms: createRoomsValue({
          activeRoom: createRoomDetails({
            currentQueueItem,
          }),
          closeRoom,
          repairSync,
          resolvedPlayback: createResolvedRoomPlayback({
            currentQueueItem,
            paused: true,
          }),
        }),
      }),
    });

    act(() => {
      result.current.roomPlayback?.toggleListening();
    });

    expect(repairSync).toHaveBeenCalledTimes(1);
    expect(closeRoom).not.toHaveBeenCalled();
  });
});
