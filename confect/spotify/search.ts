import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
import type {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "../../auth-loop/errors";
import {
  isSpotifyArtist,
  isSpotifyTrack,
  mapArtist,
  mapTrack,
  type SpotifyApiArtist,
  type SpotifyApiTrack,
} from "./mappers";
import type { SpotifySearchResults, SpotifyTrack } from "./types";

interface SearchResponse {
  tracks?: { items?: Array<SpotifyApiTrack | null> };
  artists?: { items?: Array<SpotifyApiArtist | null> };
}

/** Ported from `searchSpotify` in `convex/spotify/search.ts`. */
export const searchSpotify = (query: string) =>
  spotifyRequest<SearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=track,artist&limit=6`,
  ).pipe(
    Effect.map(
      (data): SpotifySearchResults => ({
        tracks: (data?.tracks?.items ?? [])
          .filter(isSpotifyTrack)
          .map(mapTrack),
        artists: (data?.artists?.items ?? [])
          .filter(isSpotifyArtist)
          .map(mapArtist),
      }),
    ),
  );

/** Ported from `searchTracksByName` in `convex/spotify/search.ts`. */
export const searchTracksByName = (query: string) =>
  spotifyRequest<SearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
  ).pipe(
    Effect.map(
      (data): SpotifyTrack[] =>
        (data?.tracks?.items ?? []).filter(isSpotifyTrack).map(mapTrack),
    ),
  );

/**
 * Ported from `toSearchError`. Collapses the loop's tagged errors into the same
 * user-facing messages the original threw (which the frontend already handles).
 */
export const toSearchError = (
  error:
    | SpotifyRateLimited
    | SpotifyRequestFailed
    | SpotifyUnauthorized
    | SpotifyNetworkError,
): Error => {
  if (error._tag === "SpotifyUnauthorized") {
    return new Error("Reconnect Spotify to search.");
  }
  if (
    error._tag === "SpotifyRequestFailed" &&
    (error.status === 401 || error.status === 403)
  ) {
    return new Error("Reconnect Spotify to search.");
  }
  if (error._tag === "SpotifyRateLimited") {
    return new Error("Spotify is rate limiting search right now.");
  }
  return new Error("Could not search Spotify right now.");
};
