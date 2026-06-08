import { useCallback, useMemo } from "react";

import { useMusicKit, type MusicKitStatus } from "@/features/apple-music/use-musickit";
import type { CanonicalTrack, PlaybackProvider } from "./types";

export interface ApplePlaybackProvider extends PlaybackProvider {
  /** Connection state — the room UI surfaces a "Connect Apple Music" prompt. */
  status: MusicKitStatus;
  /** Configure + authorize MusicKit. Must be called from a user gesture. */
  connect: () => Promise<void>;
}

/**
 * Apple implementation of `PlaybackProvider`, over the proven `use-musickit`
 * hook. `syncTrack` receives an already-resolved Apple catalog id in `track.id`
 * (the controller resolves the canonical track via `playback.resolveTrack`
 * before calling), so this just plays it.
 */
export function useApplePlaybackProvider(): ApplePlaybackProvider {
  const { status, snapshot, configure, authorize, playSong, pause, resume } =
    useMusicKit();

  const syncTrack = useCallback(
    async (track: CanonicalTrack, offsetMs: number) => {
      await playSong(track.id, offsetMs);
    },
    [playSong],
  );

  const togglePlay = useCallback(async () => {
    if (snapshot?.paused === false) await pause();
    else await resume();
  }, [snapshot?.paused, pause, resume]);

  const connect = useCallback(async () => {
    await configure();
    await authorize();
  }, [configure, authorize]);

  return useMemo(
    () => ({ id: "apple" as const, syncTrack, togglePlay, snapshot, status, connect }),
    [syncTrack, togglePlay, snapshot, status, connect],
  );
}
