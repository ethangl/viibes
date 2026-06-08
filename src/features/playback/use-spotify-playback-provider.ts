import { useMemo } from "react";

import {
  useWebPlayerActions,
  useWebPlayerState,
} from "@/features/spotify-player";
import type { PlaybackProvider, PlaybackSnapshot } from "./types";

/**
 * Spotify implementation of `PlaybackProvider`, backed by the existing web
 * player context. For Spotify the provider track id is the Spotify track id, so
 * `snapshot.trackKey` is `sdkState.trackId` verbatim.
 */
export function useSpotifyPlaybackProvider(): PlaybackProvider {
  const { syncTrack, togglePlay } = useWebPlayerActions();
  const { sdkState } = useWebPlayerState();

  const snapshot: PlaybackSnapshot | null = useMemo(
    () =>
      sdkState
        ? {
            trackKey: sdkState.trackId,
            paused: sdkState.paused,
            positionMs: sdkState.position,
            durationMs: sdkState.duration,
          }
        : null,
    [sdkState],
  );

  return useMemo(
    () => ({ id: "spotify" as const, syncTrack, togglePlay, snapshot }),
    [syncTrack, togglePlay, snapshot],
  );
}
