import type { PlaybackProvider } from "./types";
import { useSpotifyPlaybackProvider } from "./use-spotify-playback-provider";

/**
 * Returns the active playback provider. Today that's always Spotify; step 3
 * selects per the user's connected service (Apple Music, etc.).
 */
export function usePlaybackProvider(): PlaybackProvider {
  return useSpotifyPlaybackProvider();
}
