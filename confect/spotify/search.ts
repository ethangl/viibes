import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
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

export const searchTracksByName = (query: string) =>
  spotifyRequest<SearchResponse>(
    `/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
  ).pipe(
    Effect.map(
      (data): SpotifyTrack[] =>
        (data?.tracks?.items ?? []).filter(isSpotifyTrack).map(mapTrack),
    ),
  );