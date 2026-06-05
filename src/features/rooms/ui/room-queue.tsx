import {
  ArrowDownIcon,
  ArrowUpIcon,
  GhostIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { listItemClassName } from "@/components/list";
import { Square } from "@/components/square";
import { Button } from "@/components/ui/button";
import { useSearch } from "@/features/spotify-search/search-provider";
import { TrackCell } from "@/features/spotify-tracks/track-cell";
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session";
import { cn } from "@/lib/utils";
import type { RoomDetails } from "../client/room-types";
import {
  getVisibleRoomQueue,
  ResolvedRoomPlayback,
} from "../runtime/room-sync";
import { useRooms } from "../runtime/rooms-provider";

export function RoomQueue({
  limit,
  room,
  resolvedPlayback,
}: {
  limit?: number;
  room: RoomDetails;
  resolvedPlayback: ResolvedRoomPlayback | null;
}) {
  const session = useAuthenticatedSession();
  const { moveQueueItem, removeQueueItem } = useRooms();
  const { setOpen } = useSearch();

  const canManageOwnQueueItems = !!room.viewerMembership;
  const currentQueueItemId = resolvedPlayback?.currentQueueItemId ?? null;
  const roomQueue = getVisibleRoomQueue(room, resolvedPlayback);

  const visibleQueue = (
    currentQueueItemId
      ? roomQueue.filter((queueItem) => queueItem._id !== currentQueueItemId)
      : roomQueue
  ).slice(0, limit);

  return (
    <ol className="p-2 space-y-1">
      {visibleQueue.map((queueItem, index) => {
        const canMoveUp = room.playback.canManageQueue && index > 0;
        const canMoveDown =
          room.playback.canManageQueue && index < visibleQueue.length - 1;
        const canRemove =
          canManageOwnQueueItems &&
          (room.playback.canManageQueue ||
            queueItem.addedByUserId === session.user.id);

        return (
          <TrackCell
            key={queueItem._id}
            count={index + 1}
            track={{
              id: queueItem.trackId,
              name: queueItem.trackName,
              artist: queueItem.trackArtists.join(","),
              albumImage: queueItem.trackImageUrl,
              durationMs: queueItem.trackDurationMs,
            }}
          >
            <div className="flex items-center gap-1">
              {canMoveUp ? (
                <Button
                  size="icon-sm"
                  onClick={() =>
                    void moveQueueItem(room.room._id, queueItem._id, index - 1)
                  }
                >
                  <ArrowUpIcon />
                </Button>
              ) : null}
              {canMoveDown ? (
                <Button
                  size="icon-sm"
                  onClick={() =>
                    void moveQueueItem(room.room._id, queueItem._id, index + 1)
                  }
                >
                  <ArrowDownIcon />
                </Button>
              ) : null}
              {canRemove ? (
                <Button
                  size="icon-sm"
                  onClick={() =>
                    void removeQueueItem(room.room._id, queueItem._id)
                  }
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
          </TrackCell>
        );
      })}
      <div
        onClick={() => setOpen(true)}
        className={cn(listItemClassName, "w-full")}
      >
        <div className="flex items-center -space-x-2">
          <Square className="bg-section-color/10 font-bold rounded-l-2xl h-10 pr-2 text-xs tracking-tight w-12">
            <PlusIcon size="16" />
          </Square>
          <Square className="bg-section-color rounded-2xl size-10 shadow-lg shadow-black/25">
            <GhostIcon />
          </Square>
        </div>
        Add to Queue
      </div>
    </ol>
  );
}
