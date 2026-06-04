export interface SpotifyTrack {
  id: string;
  name: string;
  artist: string;
  albumName: string;
  albumImage: string | null;
  durationMs: number;
}

export interface SpotifyArtist {
  id: string;
  name: string;
  image: string | null;
  followerCount: number;
  genres: string[];
}

export interface SpotifyAlbumRelease {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  totalTracks: number;
  albumType: string | null;
}

export interface SpotifyAlbumArtist {
  id: string;
  name: string;
}

export interface SpotifyAlbumDetails {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  totalTracks: number;
  albumType: string | null;
  artists: SpotifyAlbumArtist[];
  tracks: SpotifyTrack[];
}

export type SpotifyArtistReleaseGroup = "album" | "single";

export interface SpotifyPageInfo {
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
}

export interface SpotifyPage<T> extends SpotifyPageInfo {
  items: T[];
}

export interface SpotifyCursorPageInfo<TCursor extends string | number> {
  limit: number;
  total: number;
  nextCursor: TCursor | null;
  hasMore: boolean;
}

export interface SpotifyCursorPage<T, TCursor extends string | number>
  extends SpotifyCursorPageInfo<TCursor> {
  items: T[];
}

export type SpotifyFavoriteArtistsPage = SpotifyCursorPage<SpotifyArtist, string>;

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  owner: string | null;
  public: boolean;
  trackCount: number;
}

export type SpotifyPlaylistsPage = SpotifyPage<SpotifyPlaylist>;

export interface SpotifyRecentlyPlayedItem {
  playedAt: string;
  track: SpotifyTrack;
}

export type SpotifyRecentlyPlayedPage = SpotifyCursorPage<
  SpotifyRecentlyPlayedItem,
  number
>;

export interface SpotifyRecentlyPlayedPageResult {
  page: SpotifyRecentlyPlayedPage;
  rateLimited: boolean;
}

export interface SpotifySearchResults {
  tracks: SpotifyTrack[];
  artists: SpotifyArtist[];
}

export interface SpotifyArtistPageData {
  artist: SpotifyArtist;
  topTracks: SpotifyTrack[];
  albums: SpotifyPage<SpotifyAlbumRelease>;
  singles: SpotifyPage<SpotifyAlbumRelease>;
}

export interface PlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: {
    id: string;
    name: string;
    duration_ms: number;
    artists: { name: string }[];
  } | null;
}

export interface PlaybackResult {
  ok: boolean;
  retryAfterSeconds?: number;
  status: number;
}

export interface PlaybackCurrentlyPlayingResult {
  retryAfterSeconds?: number;
  status: number;
  playback: PlaybackState | null;
}
