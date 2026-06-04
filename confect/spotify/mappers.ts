import type {
  SpotifyAlbumArtist,
  SpotifyAlbumDetails,
  SpotifyAlbumRelease,
  SpotifyArtist,
  SpotifyPlaylist,
  SpotifyTrack,
} from "./types";

export interface SpotifyImage {
  url: string;
}

export interface SpotifyApiArtist {
  id?: string;
  name: string;
  genres?: string[];
  images?: SpotifyImage[];
  followers?: { total?: number };
}

export interface SpotifyAlbum {
  id?: string;
  name?: string;
  album_type?: string;
  images?: SpotifyImage[];
  release_date?: string;
  total_tracks?: number;
  artists?: SpotifyApiArtist[];
}

export interface SpotifyApiTrack {
  id: string;
  name: string;
  artists?: SpotifyApiArtist[];
  album?: SpotifyAlbum;
  duration_ms: number;
  popularity?: number;
}

export interface SpotifyApiPlaylist {
  id: string;
  name: string;
  description: string | null;
  images?: SpotifyImage[];
  owner?: { display_name?: string | null };
  public?: boolean;
  items?: { total?: number };
  tracks?: { total?: number };
}

export function mapTrack(track: SpotifyApiTrack): SpotifyTrack {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists?.map((artist) => artist.name).join(", ") ?? "",
    albumName: track.album?.name ?? "",
    albumImage: track.album?.images?.[0]?.url ?? null,
    durationMs: track.duration_ms,
  };
}

export function mapArtist(artist: SpotifyApiArtist): SpotifyArtist {
  return {
    id: artist.id ?? artist.name,
    name: artist.name,
    image: artist.images?.[0]?.url ?? null,
    followerCount: artist.followers?.total ?? 0,
    genres: artist.genres ?? [],
  };
}

export function mapAlbumArtist(artist: SpotifyApiArtist): SpotifyAlbumArtist {
  return {
    id: artist.id ?? artist.name,
    name: artist.name,
  };
}

export function mapPlaylist(playlist: SpotifyApiPlaylist): SpotifyPlaylist {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    image: playlist.images?.[0]?.url ?? null,
    owner: playlist.owner?.display_name ?? null,
    public: playlist.public ?? true,
    trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
  };
}

export function mapAlbumRelease(album: SpotifyAlbum): SpotifyAlbumRelease {
  return {
    id: album.id ?? album.name ?? "",
    name: album.name ?? "Untitled release",
    image: album.images?.[0]?.url ?? null,
    releaseDate: album.release_date ?? null,
    totalTracks: album.total_tracks ?? 0,
    albumType: album.album_type ?? null,
  };
}

export function mapAlbumDetails(album: SpotifyAlbum): SpotifyAlbumDetails {
  return {
    id: album.id ?? album.name ?? "",
    name: album.name ?? "Untitled release",
    image: album.images?.[0]?.url ?? null,
    releaseDate: album.release_date ?? null,
    totalTracks: album.total_tracks ?? 0,
    albumType: album.album_type ?? null,
    artists: (album.artists ?? []).map(mapAlbumArtist),
    tracks: [],
  };
}

export function isSpotifyTrack(
  track: SpotifyApiTrack | null | undefined,
): track is SpotifyApiTrack {
  return !!track;
}

export function isSpotifyArtist(
  artist: SpotifyApiArtist | null | undefined,
): artist is SpotifyApiArtist {
  return !!artist;
}

export function isSpotifyPlaylist(
  playlist: SpotifyApiPlaylist | null | undefined,
): playlist is SpotifyApiPlaylist {
  return !!playlist;
}

export function isSpotifyAlbum(
  album: SpotifyAlbum | null | undefined,
): album is SpotifyAlbum {
  return !!album;
}
