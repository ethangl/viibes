import { api } from "@api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PlaybackSnapshot } from "@/features/playback";
import type { MusicKitGlobal, MusicKitInstance } from "./musickit-types";

const MUSICKIT_V3_SRC = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
const SNAPSHOT_EVENTS = [
  "playbackStateDidChange",
  "playbackTimeDidChange",
  "nowPlayingItemDidChange",
] as const;

let scriptPromise: Promise<MusicKitGlobal> | null = null;

/** Inject the MusicKit JS v3 script once and resolve when the global is ready. */
function loadMusicKitScript(): Promise<MusicKitGlobal> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("MusicKit requires a browser."));
  }
  if (window.MusicKit) return Promise.resolve(window.MusicKit);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<MusicKitGlobal>((resolve, reject) => {
    const onLoaded = () => {
      if (window.MusicKit) resolve(window.MusicKit);
      else reject(new Error("MusicKit loaded without a global."));
    };
    document.addEventListener("musickitloaded", onLoaded, { once: true });
    const script = document.createElement("script");
    script.src = MUSICKIT_V3_SRC;
    script.async = true;
    script.onerror = () => reject(new Error("MusicKit script failed to load."));
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export type MusicKitStatus =
  | "idle"
  | "loading"
  | "ready" // configured, not yet authorized
  | "authorized"
  | "error";

export interface MusicKitSearchResult {
  id: string;
  name: string;
  artist: string;
}

/**
 * MusicKit JS v3 integration: load + configure (developer token from the
 * server), authorize the listener (subscriber required for full playback), and
 * drive playback while exposing a normalized {@link PlaybackSnapshot}.
 * `useApplePlaybackProvider` sits on top of it as the room playback provider.
 */
export function useMusicKit() {
  const fetchToken = useAction(api.playback.appleDeveloperToken);
  const musicRef = useRef<MusicKitInstance | null>(null);
  const configurePromiseRef = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState<MusicKitStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PlaybackSnapshot | null>(null);

  const recomputeSnapshot = useCallback(() => {
    const music = musicRef.current;
    if (!music) {
      setSnapshot(null);
      return;
    }
    const playing = window.MusicKit?.PlaybackStates?.playing ?? 2;
    setSnapshot({
      trackKey: music.nowPlayingItem?.id ?? null,
      paused: music.playbackState !== playing,
      positionMs: Math.round((music.currentPlaybackTime ?? 0) * 1000),
      durationMs: Math.round((music.currentPlaybackDuration ?? 0) * 1000),
    });
  }, []);

  const configure = useCallback(async (): Promise<void> => {
    if (musicRef.current) return;
    // Reuse an in-flight configure so a connect() click during the mount-time
    // configure awaits the same run rather than racing ahead to authorize().
    if (configurePromiseRef.current) return configurePromiseRef.current;

    const run = (async () => {
      setStatus("loading");
      setError(null);
      try {
        const token = await fetchToken({});
        if (!token) {
          setStatus("error");
          setError("Apple Music isn't configured (no developer token).");
          return;
        }
        const MusicKit = await loadMusicKitScript();
        const music = await MusicKit.configure({
          developerToken: token,
          app: { name: "viibes", build: "1.0.0" },
        });
        musicRef.current = music;
        for (const event of SNAPSHOT_EVENTS) {
          music.addEventListener(event, recomputeSnapshot);
        }
        recomputeSnapshot();
        // `configure` restores the persisted Music User Token, so a listener
        // who authorized on a previous visit comes back already authorized — no
        // second connect. A fresh listener lands on "ready" until they connect.
        setStatus(music.isAuthorized ? "authorized" : "ready");
      } catch (cause) {
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "MusicKit error.");
      } finally {
        configurePromiseRef.current = null;
      }
    })();
    configurePromiseRef.current = run;
    return run;
  }, [fetchToken, recomputeSnapshot]);

  // Configure once on mount to restore any prior authorization (the Music User
  // Token lives in localStorage). Silent — `authorize()` (the popup) still
  // needs a user gesture and only runs via `connect()`.
  useEffect(() => {
    void configure();
  }, [configure]);

  const authorize = useCallback(async () => {
    const music = musicRef.current;
    if (!music) return;
    try {
      await music.authorize();
      setStatus("authorized");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
    }
  }, []);

  const playSong = useCallback(
    async (catalogId: string, offsetMs = 0) => {
      const music = musicRef.current;
      if (!music) return;
      await music.setQueue({
        song: catalogId,
        startPlaying: true,
        startTime: offsetMs / 1000,
      });
      recomputeSnapshot();
    },
    [recomputeSnapshot],
  );

  const pause = useCallback(async () => {
    await musicRef.current?.pause();
    recomputeSnapshot();
  }, [recomputeSnapshot]);

  const resume = useCallback(async () => {
    await musicRef.current?.play();
    recomputeSnapshot();
  }, [recomputeSnapshot]);

  const seek = useCallback(
    async (ms: number) => {
      await musicRef.current?.seekToTime(ms / 1000);
      recomputeSnapshot();
    },
    [recomputeSnapshot],
  );

  const searchSongs = useCallback(
    async (term: string): Promise<MusicKitSearchResult[]> => {
      const music = musicRef.current;
      if (!music) return [];
      const storefront = music.storefrontId ?? "us";
      const response = await music.api.music(
        `/v1/catalog/${storefront}/search`,
        { term, types: "songs", limit: 5 },
      );
      const songs = response.data?.results?.songs?.data ?? [];
      return songs.map((song) => ({
        id: song.id,
        name: song.attributes?.name ?? "(unknown)",
        artist: song.attributes?.artistName ?? "",
      }));
    },
    [],
  );

  // Advance positionMs while playing — playbackTimeDidChange can be throttled.
  useEffect(() => {
    if (snapshot?.paused !== false) return;
    const id = setInterval(recomputeSnapshot, 1000);
    return () => clearInterval(id);
  }, [snapshot?.paused, recomputeSnapshot]);

  useEffect(() => {
    return () => {
      const music = musicRef.current;
      if (!music) return;
      for (const event of SNAPSHOT_EVENTS) {
        music.removeEventListener(event, recomputeSnapshot);
      }
    };
  }, [recomputeSnapshot]);

  return {
    status,
    error,
    snapshot,
    configure,
    authorize,
    playSong,
    pause,
    resume,
    seek,
    searchSongs,
  };
}
