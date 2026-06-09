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
import { useNowPlaying } from "./use-now-playing";

type RoomsValue = NonNullable<ContextType<typeof RoomsContext>>;

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

function createWrapper(rooms: RoomsValue | null = null) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <RoomsContext.Provider value={rooms}>{children}</RoomsContext.Provider>
    );
  };
}

describe("useNowPlaying", () => {
  it("returns idle state when no room is active", () => {
    const { result } = renderHook(() => useNowPlaying(), {
      wrapper: createWrapper(null),
    });

    expect(result.current.isRoomMode).toBe(false);
    expect(result.current.roomPlayback).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.displayName).toBe("");
    expect(result.current.displayImage).toBeNull();
    expect(result.current.pct).toBe(0);
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
      wrapper: createWrapper(
        createRoomsValue({
          activeRoom: roomDetails,
          closeRoom,
          resolvedPlayback: createResolvedRoomPlayback({
            currentOffsetMs: 90000,
            currentQueueItem,
          }),
          skipRoom,
        }),
      ),
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
      wrapper: createWrapper(
        createRoomsValue({
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
      ),
    });

    act(() => {
      result.current.roomPlayback?.toggleListening();
    });

    expect(repairSync).toHaveBeenCalledTimes(1);
    expect(closeRoom).not.toHaveBeenCalled();
  });
});
