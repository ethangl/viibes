import { ChevronsDownIcon, PauseIcon, PlayIcon } from "lucide-react";

import { AlbumArt } from "@/components/album-art";
import { Button } from "@/components/ui/button";
import { RoomPlayerPanel } from "@/features/rooms/ui/room-player-panel";
import { usePlayerExpanded } from "./player-expanded-context";
import { PlayerWrapper } from "./player-wrapper";
import { RepairSyncButton } from "./repair-sync-button";
import { SkipForwardButton } from "./skip-forward-button";
import { useNowPlaying } from "./use-now-playing";

function formatTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function StandardPlayer() {
  const nowPlaying = useNowPlaying();
  const roomPlayback = nowPlaying.roomPlayback;
  const { expanded, setExpanded } = usePlayerExpanded();

  return (
    <PlayerWrapper toggled={expanded}>
      <div className="p-7 pb-2 rounded-3xl">
        <AlbumArt
          src={nowPlaying.displayImage}
          className="mb-9 mx-auto size-80"
        />
        <header className="mb-5 mix-blend-plus-darker dark:mix-blend-plus-lighter space-y-6">
          <div className="space-y-0.5">
            <h2 className="text-lg truncate">{nowPlaying.displayName}</h2>
            <h5 className="font-medium opacity-33 text-sm truncate">
              {nowPlaying.displayArtist}
            </h5>
          </div>
          <div className="space-y-2 ">
            <div className="h-1 relative">
              <div className="absolute bg-black dark:bg-white inset-0 opacity-10 rounded" />
              <div
                className="h-full bg-black dark:bg-white duration-300 min-w-1 rounded transition-[width]"
                style={{ width: `${nowPlaying.pct}%` }}
              />
            </div>
            <div className="flex font-medium items-center justify-between opacity-33 tabular-nums text-[11px]">
              <span>{formatTime(nowPlaying.displayProgress)}</span>
              <span>{formatTime(nowPlaying.displayDuration)}</span>
            </div>
          </div>
        </header>

        <nav className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-8 mix-blend-plus-darker dark:mix-blend-plus-lighter">
          <div className="flex flex-auto gap-3 items-center justify-end" />
          <Button
            variant="overlay"
            size="icon-2xl"
            disabled={!roomPlayback?.canToggleListening}
            onClick={() => roomPlayback?.toggleListening()}
          >
            {roomPlayback?.paused ? (
              <PlayIcon fill="currentColor" strokeWidth={0} />
            ) : (
              <PauseIcon fill="currentColor" strokeWidth={0} />
            )}
          </Button>
          <div className="flex flex-auto gap-3 items-center justify-start">
            <SkipForwardButton />
          </div>
        </nav>

        <footer className="grid grid-cols-[auto_1fr] gap-1 items-center -mx-3">
          <Button
            variant="overlay"
            size="icon-xl"
            onClick={() => setExpanded(false)}
            className="-ml-1.5"
          >
            <ChevronsDownIcon />
          </Button>
          <RepairSyncButton />
        </footer>
        <div className="hidden">
          {nowPlaying.isRoomMode && <RoomPlayerPanel />}
        </div>
      </div>
    </PlayerWrapper>
  );
}
