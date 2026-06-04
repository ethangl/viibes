import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
import type {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "../../auth-loop/errors";
import { DEFAULT_LIMIT, DEFAULT_OFFSET } from "./constants";
import {
  isSpotifyTrack,
  mapPlaylist,
  mapTrack,
  type SpotifyApiPlaylist,
  type SpotifyApiTrack,
} from "./mappers";
import {
  createSpotifyPage,
  type SpotifyOffsetPagingResponse,
} from "./pagination";
import type {
  SpotifyPlaylist,
  SpotifyPlaylistsPage,
  SpotifyTrack,
} from "./types";

type PlaylistSummaryItem = {
  id: string;
  name: string;
  description: string | null;
  images?: { url: string }[];
  items?: { total?: number };
  tracks?: { total?: number };
  owner?: { display_name?: string | null };
  public: boolean;
};
type PlaylistSummaryResponse = SpotifyOffsetPagingResponse<PlaylistSummaryItem>;
interface PlaylistTracksResponse {
  items?: {
    track?: SpotifyApiTrack | null;
    item?: SpotifyApiTrack | null;
  }[];
}

type LoopError =
  | SpotifyRateLimited
  | SpotifyRequestFailed
  | SpotifyUnauthorized
  | SpotifyNetworkError;

/** Ported from `getUserPlaylists`. */
export const getUserPlaylists = (
  limit = DEFAULT_LIMIT,
  offset = DEFAULT_OFFSET,
) =>
  spotifyRequest<PlaylistSummaryResponse>(
    `/me/playlists?limit=${limit}&offset=${offset}`,
  ).pipe(
    Effect.map((data): SpotifyPlaylistsPage => {
      const items = (data?.items ?? [])
        .filter(
          (playlist): playlist is PlaylistSummaryItem => playlist !== null,
        )
        .map((playlist) => ({
          ...mapPlaylist(playlist as SpotifyApiPlaylist),
          trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
        }));
      return createSpotifyPage(data, items, limit, offset);
    }),
  );

/** Ported from `getPlaylist`. 404 → null. */
export const getPlaylist = (playlistId: string) =>
  spotifyRequest<SpotifyApiPlaylist>(
    `/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),public,tracks(total)`,
  ).pipe(
    Effect.map((playlist): SpotifyPlaylist | null =>
      !playlist?.id ? null : mapPlaylist(playlist),
    ),
    Effect.catchIf(
      (error): error is SpotifyRequestFailed =>
        error._tag === "SpotifyRequestFailed" && error.status === 404,
      () => Effect.succeed<SpotifyPlaylist | null>(null),
    ),
  );

/** Ported from `getPlaylistTracks`. */
export const getPlaylistTracks = (playlistId: string) =>
  spotifyRequest<PlaylistTracksResponse>(
    `/playlists/${playlistId}/items?limit=100`,
  ).pipe(
    Effect.map((data): SpotifyTrack[] =>
      !data?.items
        ? []
        : data.items
            .map((entry) => entry.track ?? entry.item)
            .filter(isSpotifyTrack)
            .map(mapTrack),
    ),
  );

/** Ported from `toPlaylistsError`. */
export const toPlaylistsError =
  (fallback: string) =>
  (error: LoopError): Error => {
    if (
      error._tag === "SpotifyUnauthorized" ||
      (error._tag === "SpotifyRequestFailed" &&
        (error.status === 401 || error.status === 403))
    ) {
      return new Error("Reconnect Spotify to load your listening activity.");
    }
    if (error._tag === "SpotifyRateLimited") {
      return new Error("Spotify is rate limiting activity requests right now.");
    }
    return new Error(fallback);
  };
