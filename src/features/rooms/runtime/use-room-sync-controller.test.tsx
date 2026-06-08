import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybackProvider, PlaybackProviderId } from "@/features/playback";
import type { RoomDetails } from "../client/room-types";
import { resolveRoomPlayback } from "./room-sync";
import { useRoomSyncController } from "./use-room-sync-controller";

const syncTrack = vi.fn<(track: { id: string }, offsetMs?: number) => Promise<void>>();
const togglePlay = vi.fn<() => Promise<void>>();
const resolveTrack =
  vi.fn<
    (args: {
      queueItemId: string;
      provider: PlaybackProviderId;
    }) => Promise<string | null>
  >();

vi.mock("convex/react", () => ({
  useAction: () => resolveTrack,
}));

let mockSnapshot:
  | {
      durationMs: number;
      paused: boolean;
      positionMs: number;
      trackKey: string;
    }
  | null = null;

function makeProvider(id: PlaybackProviderId): PlaybackProvider {
  return {
    id,
    syncTrack,
    togglePlay,
    get snapshot() {
      return mockSnapshot;
    },
  };
}

function createRoomDetails(): RoomDetails {
  return {
    room: {
      _id: "room-1" as never,
      slug: "night-shift",
      name: "Night Shift",
      description: "After-hours queue",
      visibility: "public",
      ownerUserId: "user-1",
      createdAt: 1_000,
      archivedAt: null,
    },
    viewerFollowsRoom: false,
    viewerMembership: {
      _id: "membership-1",
      role: "member",
      active: true,
      joinedAt: 1_000,
      leftAt: null,
    },
    memberCount: 2,
    presentCount: 1,
    presentUsers: [
      {
        userId: "user-1",
        name: "User One",
        image: null,
      },
    ],
    roleHolders: [
      {
        userId: "user-1",
        name: "User One",
        image: null,
        role: "member",
      },
      {
        userId: "user-2",
        name: "User Two",
        image: null,
        role: "moderator",
      },
    ],
    queueLength: 2,
    queue: [
      {
        _id: "queue-1" as never,
        roomId: "room-1" as never,
        position: 0,
        trackId: "track-1",
        trackName: "Track One",
        trackArtists: ["Artist One"],
        trackImageUrl: null,
        trackDurationMs: 180_000,
        addedByUserId: "user-1",
        addedAt: 1_000,
      },
      {
        _id: "queue-2" as never,
        roomId: "room-1" as never,
        position: 1,
        trackId: "track-2",
        trackName: "Track Two",
        trackArtists: ["Artist Two"],
        trackImageUrl: null,
        trackDurationMs: 180_000,
        addedByUserId: "user-2",
        addedAt: 2_000,
      },
    ],
    playback: {
      currentQueueItemId: "queue-1" as never,
      currentQueueItem: {
        _id: "queue-1" as never,
        roomId: "room-1" as never,
        position: 0,
        trackId: "track-1",
        trackName: "Track One",
        trackArtists: ["Artist One"],
        trackImageUrl: null,
        trackDurationMs: 180_000,
        addedByUserId: "user-1",
        addedAt: 1_000,
      },
      startedAt: 10_000,
      startOffsetMs: 0,
      paused: false,
      pausedAt: null,
      updatedAt: 10_000,
      canEnqueue: true,
      canManageQueue: false,
      canControlPlayback: false,
    },
  };
}

describe("useRoomSyncController", () => {
  beforeEach(() => {
    syncTrack.mockReset();
    syncTrack.mockResolvedValue(undefined);
    togglePlay.mockReset();
    togglePlay.mockResolvedValue(undefined);
    resolveTrack.mockReset();
    resolveTrack.mockResolvedValue(null);
    mockSnapshot = {
      durationMs: 180_000,
      paused: false,
      positionMs: 30_000,
      trackKey: "track-1",
    };
  });

  it("follows room updates until the room closes, then stops local playback", async () => {
    const initialRoom = createRoomDetails();
    const nextRoom = {
      ...createRoomDetails(),
      playback: {
        ...createRoomDetails().playback,
        currentQueueItemId: "queue-2" as never,
        currentQueueItem: {
          _id: "queue-2" as never,
          roomId: "room-1" as never,
          position: 1,
          trackId: "track-2",
          trackName: "Track Two",
          trackArtists: ["Artist Two"],
          trackImageUrl: null,
          trackDurationMs: 180_000,
          addedByUserId: "user-2",
          addedAt: 2_000,
        },
        startedAt: 205_000,
        updatedAt: 205_000,
      },
    };

    const followedNonMemberRoom: RoomDetails = {
      ...createRoomDetails(),
      viewerFollowsRoom: true,
      viewerMembership: null,
    };

    type HookProps = {
      activeRoom: RoomDetails | null;
      resolvedPlayback: ReturnType<typeof resolveRoomPlayback>;
    };

    const spotifyProvider = makeProvider("spotify");

    const { result, rerender } = renderHook<
      ReturnType<typeof useRoomSyncController>,
      HookProps
    >(
      ({ activeRoom, resolvedPlayback }: HookProps) =>
        useRoomSyncController({
          activeRoom,
          roomId: activeRoom?.room._id ?? null,
          resolvedPlayback,
          provider: spotifyProvider,
          ready: true,
        }),
      {
        initialProps: {
          activeRoom: initialRoom,
          resolvedPlayback: resolveRoomPlayback(initialRoom, 40_000),
        } satisfies HookProps,
      },
    );

    await waitFor(() => {
      expect(syncTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "track-1" }),
        30_000,
      );
    });

    syncTrack.mockClear();

    rerender({
      activeRoom: nextRoom,
      resolvedPlayback: resolveRoomPlayback(nextRoom, 220_000),
    });

    await waitFor(() => {
      expect(syncTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "track-2" }),
        15_000,
      );
    });

    expect(result.current.syncState).toMatchObject({
      code: "synced",
      label: "Following room",
    });

    syncTrack.mockClear();
    togglePlay.mockClear();

    rerender({
      activeRoom: null,
      resolvedPlayback: null,
    });

    await waitFor(() => {
      expect(togglePlay).toHaveBeenCalledTimes(1);
    });

    expect(syncTrack).not.toHaveBeenCalled();
    expect(result.current.syncState).toMatchObject({
      code: "idle",
      label: "Not listening to a room",
    });

    syncTrack.mockClear();
    togglePlay.mockClear();

    rerender({
      activeRoom: followedNonMemberRoom,
      resolvedPlayback: resolveRoomPlayback(followedNonMemberRoom, 40_000),
    });

    await waitFor(() => {
      expect(syncTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "track-1" }),
        30_000,
      );
    });

    // Spotify resolves by identity — no server round-trip.
    expect(resolveTrack).not.toHaveBeenCalled();
  });

  it("plays the server-resolved Apple catalog id, not the origin trackId", async () => {
    resolveTrack.mockResolvedValue("apple-song-1");
    const room = createRoomDetails();

    renderHook(() =>
      useRoomSyncController({
        activeRoom: room,
        roomId: room.room._id,
        resolvedPlayback: resolveRoomPlayback(room, 40_000),
        provider: makeProvider("apple"),
        ready: true,
      }),
    );

    await waitFor(() => {
      expect(resolveTrack).toHaveBeenCalledWith({
        queueItemId: "queue-1",
        provider: "apple",
      });
    });

    await waitFor(() => {
      expect(syncTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "apple-song-1" }),
        30_000,
      );
    });
  });

  it("waits for the provider to be ready, then plays once it connects", async () => {
    resolveTrack.mockResolvedValue("apple-song-1");
    const room = createRoomDetails();
    const appleProvider = makeProvider("apple");

    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useRoomSyncController({
          activeRoom: room,
          roomId: room.room._id,
          resolvedPlayback: resolveRoomPlayback(room, 40_000),
          provider: appleProvider,
          ready,
        }),
      { initialProps: { ready: false } },
    );

    // Resolution still happens up front, but nothing plays until connected.
    await waitFor(() => {
      expect(resolveTrack).toHaveBeenCalled();
    });
    expect(syncTrack).not.toHaveBeenCalled();

    // Connecting Apple Music flips `ready` true — playback fires.
    rerender({ ready: true });

    await waitFor(() => {
      expect(syncTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "apple-song-1" }),
        30_000,
      );
    });
  });

  it("flags autoplay-blocked when play() is refused, then resumes from a gesture", async () => {
    // First play() is refused by the autoplay policy (no interaction yet).
    syncTrack.mockRejectedValueOnce(
      new DOMException(
        "play() failed because the user didn't interact with the document first",
        "NotAllowedError",
      ),
    );
    const room = createRoomDetails();

    const { result } = renderHook(() =>
      useRoomSyncController({
        activeRoom: room,
        roomId: room.room._id,
        resolvedPlayback: resolveRoomPlayback(room, 40_000),
        provider: makeProvider("spotify"),
        ready: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.autoplayBlocked).toBe(true);
    });

    // The gesture-driven retry succeeds and clears the flag.
    await act(async () => {
      result.current.startPlayback();
    });

    await waitFor(() => {
      expect(result.current.autoplayBlocked).toBe(false);
    });
    expect(syncTrack).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "track-1" }),
      30_000,
    );
  });

  it("marks the track unavailable and skips playback when Apple has no match", async () => {
    resolveTrack.mockResolvedValue(null);
    const room = createRoomDetails();

    const { result } = renderHook(() =>
      useRoomSyncController({
        activeRoom: room,
        roomId: room.room._id,
        resolvedPlayback: resolveRoomPlayback(room, 40_000),
        provider: makeProvider("apple"),
        ready: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.syncState).toMatchObject({
        code: "track_unavailable",
      });
    });

    expect(syncTrack).not.toHaveBeenCalled();
  });
});
