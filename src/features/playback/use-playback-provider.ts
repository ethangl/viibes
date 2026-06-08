import {
  useApplePlaybackProvider,
  type ApplePlaybackProvider,
} from "./use-apple-playback-provider";

/**
 * Returns the active playback provider. As of the Apple pivot this is Apple
 * Music (Spotify survives only as a legacy adapter behind the interface). The
 * returned value is the full {@link ApplePlaybackProvider} so callers that need
 * the connection surface (`status`/`connect`) can reach it; room sync only uses
 * the provider-neutral {@link PlaybackProvider} slice.
 */
export function usePlaybackProvider(): ApplePlaybackProvider {
  return useApplePlaybackProvider();
}
