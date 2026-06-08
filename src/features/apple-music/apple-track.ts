import type { SpotifyTrack } from "@/features/spotify-client/types";

/** A catalog song, shaped exactly as the queue needs it (mirrors CatalogTrack). */
export interface AppleTrack {
  id: string;
  name: string;
  artist: string;
  albumName: string;
  albumImage: string | null;
  durationMs: number;
  isrc: string | null;
}

/**
 * Map catalog songs to the `SpotifyTrack` shape the shared `Tracks` UI renders.
 * A null ISRC is dropped (the field is optional on `SpotifyTrack`).
 */
export function toSpotifyTracks(
  tracks: readonly AppleTrack[],
): SpotifyTrack[] {
  return tracks.map((song) => ({
    id: song.id,
    name: song.name,
    artist: song.artist,
    albumName: song.albumName,
    albumImage: song.albumImage,
    durationMs: song.durationMs,
    ...(song.isrc ? { isrc: song.isrc } : {}),
  }));
}
