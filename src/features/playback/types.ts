import type { Track } from "@/features/spotify-client/types";

/**
 * Provider-neutral track identity. Today this is the existing `Track` (which now
 * carries `isrc` from step 1); `id` is the *provider* track id. When a second
 * provider lands (step 3), resolution from the canonical `isrc` to a
 * provider-specific id happens server-side before a track reaches the provider.
 */
export type CanonicalTrack = Track;

export type PlaybackProviderId = "spotify" | "apple";

/** Normalized view of a provider's local player. */
export interface PlaybackSnapshot {
  /** The provider track id currently loaded, or null when nothing is loaded. */
  trackKey: string | null;
  paused: boolean;
  positionMs: number;
  durationMs: number;
}

/** Connection state for a provider that requires an explicit user gesture to
 * become playable (Apple Music's MusicKit `authorize()`). Spotify needs none. */
export type PlaybackConnectionStatus =
  | "idle"
  | "loading"
  | "ready" // configured, not yet authorized
  | "authorized"
  | "error";

/** The surface the room UI uses to prompt "Connect Apple Music". */
export interface PlaybackConnection {
  status: PlaybackConnectionStatus;
  /** Configure + authorize the provider. Must run from a user gesture. */
  connect: () => Promise<void>;
}

/**
 * The slice of a music provider that room sync drives. Deliberately narrow: it
 * covers "play this track at this offset" and "toggle play/pause" plus a
 * normalized snapshot — not the full player UI (queue, shuffle, browse), which
 * stays provider-specific for now.
 */
export interface PlaybackProvider {
  /** Which provider this is — the controller resolves the track id for it. */
  id: PlaybackProviderId;
  /**
   * Start (or re-sync) local playback to `track` at `offsetMs`. `track.id` is
   * the *resolved* provider track id (the controller resolves the canonical
   * track for `id` before calling), so each provider just plays `track.id`.
   */
  syncTrack: (track: CanonicalTrack, offsetMs: number) => Promise<void>;
  /** Toggle local play/pause. */
  togglePlay: () => Promise<void>;
  /** Normalized snapshot of the local player, or null when inactive. */
  snapshot: PlaybackSnapshot | null;
}
