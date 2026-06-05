import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAppAuth, useAppCapabilities } from "@/app/app-runtime";
import type { Track } from "@/features/spotify-client/types";
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session";
import { usePalette } from "../palette/use-palette";
import { useSpotify } from "../spotify-sdk/use-spotify";
import { usePlayerPlayback } from "./use-player-playback";
import {
  WebPlayerActionsContext,
  WebPlayerStateContext,
} from "./use-web-player";

export function WebPlayerProvider({ children }: { children: React.ReactNode }) {
  const session = useAuthenticatedSession();
  const { getSpotifyAccessToken } = useAppAuth();
  const { canControlPlayback } = useAppCapabilities();
  const tokenRef = useRef<string | null>(null);

  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [progressMs, setProgressMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    tokenRef.current = null;
  }, [session.user.id]);

  const refreshAccessToken = useCallback(async () => {
    const token = await getSpotifyAccessToken();
    tokenRef.current = token;
    return token;
  }, [getSpotifyAccessToken]);

  const getAccessToken = useCallback(async () => {
    if (tokenRef.current) {
      return tokenRef.current;
    }

    return refreshAccessToken();
  }, [refreshAccessToken]);

  const spotify = useSpotify({
    getAccessToken: refreshAccessToken,
    tokenRef,
    trackId: currentTrack?.id ?? null,
  });
  const {
    sdkState,
    init: initSpotify,
    waitForReady,
    play,
    resume,
    pause,
    setVolume: setSpotifyVolume,
    setRepeat,
  } = spotify;

  useEffect(() => {
    if (!sdkState) {
      return;
    }

    setProgressMs(sdkState.position);
    setDurationMs(sdkState.duration);
  }, [sdkState]);

  const {
    hasQueue,
    nextTrack,
    paused,
    playTrack,
    playTracks,
    prevTrack,
    queue,
    queueIndex,
    setVolume,
    shuffled,
    syncTrack,
    togglePlay,
    toggleShuffle,
    volume,
  } = usePlayerPlayback({
    canControlPlayback,
    currentTrack,
    getAccessToken,
    initSpotify,
    pause,
    play,
    progressMs,
    resume,
    sdkState,
    setCurrentTrack,
    setSpotifyVolume,
    waitForReady,
  });

  const artworkUrl = currentTrack?.albumImage ?? null;
  const palette = usePalette(artworkUrl);

  const actions = useMemo(
    () => ({
      isAuthenticated: canControlPlayback,
      playTrack,
      playTracks,
      syncTrack,
      nextTrack,
      prevTrack,
      togglePlay,
      toggleShuffle,
      setVolume,
      setExpanded,
      spotify: {
        init: initSpotify,
        waitForReady,
        play,
        setRepeat,
      },
    }),
    [
      canControlPlayback,
      playTrack,
      playTracks,
      syncTrack,
      nextTrack,
      prevTrack,
      togglePlay,
      toggleShuffle,
      setVolume,
      setExpanded,
      initSpotify,
      waitForReady,
      play,
      setRepeat,
    ],
  );

  const state = useMemo(
    () => ({
      currentTrack,
      sdkState,
      paused,
      progressMs,
      durationMs,
      volume,
      expanded,
      palette,
      queue,
      queueIndex,
      shuffled,
      hasQueue,
    }),
    [
      currentTrack,
      sdkState,
      paused,
      progressMs,
      durationMs,
      volume,
      expanded,
      palette,
      queue,
      queueIndex,
      shuffled,
      hasQueue,
    ],
  );

  return (
    <WebPlayerActionsContext.Provider value={actions}>
      <WebPlayerStateContext.Provider value={state}>
        {children}
      </WebPlayerStateContext.Provider>
    </WebPlayerActionsContext.Provider>
  );
}
