import { ChevronsUpIcon } from "lucide-react";

import { AlbumArt } from "@/components/album-art";
import { StopButton } from "@/components/stop-button";
import { usePlayerExpanded } from "./player-expanded-context";
import { SkipForwardButton } from "./skip-forward-button";
import { useNowPlaying } from "./use-now-playing";

export function MiniPlayer() {
  const { displayArtist, displayImage, displayName } = useNowPlaying();
  const { setExpanded } = usePlayerExpanded();

  return (
    <div className="backdrop-blur-xl backdrop-invert-10 backdrop-contrast-120 backdrop-saturate-120 bg-linear-to-b from-black/33 to-black/11 gap-4 grid grid-cols-[1fr_auto] items-center m-1 overflow-hidden p-1 rounded-2xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.222),0_1px_1.5px_rgba(255,255,255,0.222)]">
      <title>{`${displayName} : ${displayArtist}`}</title>
      {displayImage && <link rel="icon" href={displayImage} />}
      <button
        className="group gap-4 grid grid-cols-[auto_1fr] items-center z-1"
        onClick={() => setExpanded(true)}
      >
        <div className="group relative z-1">
          <AlbumArt src={displayImage} className="rounded-xl size-12">
            <div className="absolute backdrop-blur-none group-hover:backdrop-blur-md duration-444 inset-0 opacity-0 group-hover:opacity-100 pointer-events-none transition-all">
              <ChevronsUpIcon className="absolute inset-0 m-auto size-5 text-white" />
            </div>
          </AlbumArt>
        </div>
        <div className="block mix-blend-plus-lighter space-y-1 text-left transition-opacity truncate z-0">
          <h4 className="font-medium leading-tight truncate">{displayName}</h4>
          <p className="text-[11px] leading-tight opacity-50 truncate">
            {displayArtist}
          </p>
        </div>
      </button>
      <nav className="flex flex-none items-center transition-opacity z-0">
        <StopButton />
        <SkipForwardButton />
      </nav>
    </div>
  );
}
