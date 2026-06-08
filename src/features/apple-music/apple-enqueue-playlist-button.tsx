import { ListPlusIcon } from "lucide-react";
import { FC, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useOptionalRooms } from "@/features/rooms";
import type { SpotifyTrack } from "@/features/spotify-client/types";

export type AppleEnqueuePlaylistButtonProps = {
  /** Tracks the detail page already loaded for display. */
  tracks: SpotifyTrack[];
  name: string;
};

/**
 * Enqueue a whole Apple playlist into the active room. Unlike the Spotify
 * button (which lazily loads tracks via a Convex action), the Apple detail page
 * has already fetched + ISRC-resolved the tracks for display, so we enqueue
 * those directly.
 */
export const AppleEnqueuePlaylistButton: FC<AppleEnqueuePlaylistButtonProps> = ({
  tracks,
  name,
}) => {
  const rooms = useOptionalRooms();
  const activeRoom = rooms?.activeRoom ?? null;
  const enqueueTracks = rooms?.enqueueTracks;
  const [enqueuing, setEnqueuing] = useState(false);

  const canEnqueueToActiveRoom =
    !!activeRoom?.playback.canEnqueue && !!enqueueTracks;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            disabled={!canEnqueueToActiveRoom || enqueuing || tracks.length === 0}
            onClick={() => {
              if (!enqueueTracks) {
                return;
              }
              setEnqueuing(true);
              void enqueueTracks(tracks).finally(() => setEnqueuing(false));
            }}
            aria-label={`Queue ${name}`}
          >
            <ListPlusIcon />
          </Button>
        }
      />
      <TooltipContent>
        {canEnqueueToActiveRoom ? "Add Playlist to Queue" : "Enter a room!"}
      </TooltipContent>
    </Tooltip>
  );
};
