import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RoomDetails } from "../client/room-types";
import { resolveRoomPlayback } from "./room-sync";
import { useRoomSyncController } from "./use-room-sync-controller";

const syncTrack = vi.fn<(track: { id: string }, offsetMs?: number) => Promise<void>>();
const togglePlay = vi.fn<() => Promise<void>>();

let mockSnapshot:
  | {
      durationMs: number;
      paused: boolean;
      positionMs: number;
      trackKey: string;
    }
  | null = null;

vi.mock("@/features/playback", () => ({
  usePlaybackProvider: () => ({
    syncTrack,
    togglePlay,
    snapshot: mockSnapshot,
  }),
}));

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

    const { result, rerender } = renderHook<
      ReturnType<typeof useRoomSyncController>,
      HookProps
    >(
      ({ activeRoom, resolvedPlayback }: HookProps) =>
        useRoomSyncController({
          activeRoom,
          roomId: activeRoom?.room._id ?? null,
          resolvedPlayback,
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
  });
});
