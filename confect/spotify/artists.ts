import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
import {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "../../auth-loop/errors";
import { DEFAULT_LIMIT, DEFAULT_OFFSET } from "./constants";
import {
  isSpotifyAlbum,
  isSpotifyTrack,
  mapAlbumRelease,
  mapArtist,
  mapTrack,
  type SpotifyAlbum,
  type SpotifyApiArtist,
  type SpotifyApiTrack,
} from "./mappers";
import {
  createEmptySpotifyPage,
  createSpotifyPage,
  type SpotifyOffsetPagingResponse,
} from "./pagination";
import type {
  SpotifyAlbumRelease,
  SpotifyArtist,
  SpotifyArtistPageData,
  SpotifyArtistReleaseGroup,
  SpotifyFavoriteArtistsPage,
  SpotifyPage,
  SpotifyTrack,
} from "./types";

interface SearchResponse {
  tracks?: { items?: Array<SpotifyApiTrack | null> };
}
type ArtistResponse = SpotifyApiArtist;
type ArtistAlbumsResponse = SpotifyOffsetPagingResponse<SpotifyAlbum>;
interface TopArtistsResponse {
  items?: SpotifyApiArtist[];
}
interface FollowedArtistsResponse {
  artists?: {
    cursors?: { after?: string | null };
    items?: SpotifyApiArtist[];
    limit?: number;
    next?: string | null;
    total?: number;
  };
}

export interface ArtistPageDataResult {
  page: SpotifyArtistPageData;
  usedReleaseFallback: boolean;
}

type LoopError =
  | SpotifyRateLimited
  | SpotifyRequestFailed
  | SpotifyUnauthorized
  | SpotifyNetworkError;

// `true` for failures the original treated as "soft" (anything except an auth
// failure): they fall back to an empty result instead of propagating.
const isSoftReleaseError = (error: LoopError): boolean =>
  error._tag === "SpotifyRateLimited" ||
  error._tag === "SpotifyNetworkError" ||
  (error._tag === "SpotifyRequestFailed" &&
    error.status !== 401 &&
    error.status !== 403);

function getSpotifyNextArtistCursor(next: string | null | undefined) {
  if (!next) return null;
  try {
    return new URL(next).searchParams.get("after");
  } catch {
    return null;
  }
}

const searchArtistTracks = (
  artistId: string,
  artistName: string,
  market?: string | null,
) => {
  const params = new URLSearchParams({
    q: `artist:${artistName}`,
    type: "track",
    limit: "10",
    ...(market ? { market } : {}),
  });
  return spotifyRequest<SearchResponse>(`/search?${params.toString()}`).pipe(
    Effect.map((data): SpotifyTrack[] => {
      const seen = new Set<string>();
      return (data?.tracks?.items ?? [])
        .filter(isSpotifyTrack)
        .filter((track) =>
          track.artists?.some((artist) => artist.id === artistId),
        )
        .sort((left, right) => {
          const leftPrimary = left.artists?.[0]?.id === artistId ? 1 : 0;
          const rightPrimary = right.artists?.[0]?.id === artistId ? 1 : 0;
          if (leftPrimary !== rightPrimary) return rightPrimary - leftPrimary;
          return (right.popularity ?? 0) - (left.popularity ?? 0);
        })
        .filter((track) => {
          if (seen.has(track.id)) return false;
          seen.add(track.id);
          return true;
        })
        .slice(0, 10)
        .map(mapTrack);
    }),
  );
};

export const getSpotifyProfileMarket = () =>
  spotifyRequest<{ country?: string }>("/me").pipe(
    Effect.map((data) => data?.country ?? null),
  );

export const getTopArtists = (limit = 20) =>
  spotifyRequest<TopArtistsResponse>(`/me/top/artists?limit=${limit}`).pipe(
    Effect.map((data): SpotifyArtist[] => (data?.items ?? []).map(mapArtist)),
  );

export const getFavoriteArtists = (limit = 50, after?: string | null) => {
  const params = new URLSearchParams({ type: "artist", limit: String(limit) });
  if (after) params.set("after", after);
  return spotifyRequest<FollowedArtistsResponse>(
    `/me/following?${params.toString()}`,
  ).pipe(
    Effect.map((data): SpotifyFavoriteArtistsPage => {
      const artists = (data?.artists?.items ?? []).map(mapArtist);
      const nextCursor =
        getSpotifyNextArtistCursor(data?.artists?.next) ??
        (data?.artists?.next ? data?.artists?.cursors?.after ?? null : null);
      const hasMore = nextCursor !== null || Boolean(data?.artists?.next);
      return {
        items: artists,
        limit: data?.artists?.limit ?? limit,
        total: data?.artists?.total ?? artists.length,
        nextCursor,
        hasMore,
      };
    }),
  );
};

export const getArtistReleasesPage = (
  artistId: string,
  includeGroups: SpotifyArtistReleaseGroup,
  options: { limit?: number; offset?: number; market?: string | null } = {},
) => {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const offset = options.offset ?? DEFAULT_OFFSET;
  const releasesQuery = new URLSearchParams({
    include_groups: includeGroups,
    limit: String(limit),
    offset: String(offset),
    ...(options.market ? { market: options.market } : {}),
  }).toString();
  return spotifyRequest<ArtistAlbumsResponse>(
    `/artists/${artistId}/albums?${releasesQuery}`,
  ).pipe(
    Effect.map((data): SpotifyPage<SpotifyAlbumRelease> => {
      const items = (data?.items ?? [])
        .filter(isSpotifyAlbum)
        .map(mapAlbumRelease)
        .filter((album) => album.id !== "");
      return createSpotifyPage(data, items, limit, offset);
    }),
  );
};

/** Soft errors → empty page + fallback. */
const getArtistReleasesResult = (
  artistId: string,
  includeGroups: SpotifyArtistReleaseGroup,
  market?: string | null,
) =>
  getArtistReleasesPage(
    artistId,
    includeGroups,
    market === undefined ? {} : { market },
  ).pipe(
    Effect.map((page) => ({ page, usedFallback: false })),
    Effect.catchIf(isSoftReleaseError, () =>
      Effect.succeed({
        page: createEmptySpotifyPage<SpotifyAlbumRelease>(),
        usedFallback: true,
      }),
    ),
  );

export const getArtistPageDataResult = (
  artistId: string,
  market?: string | null,
) =>
  Effect.gen(function* () {
    const artistData = yield* spotifyRequest<ArtistResponse>(
      `/artists/${artistId}`,
    );
    if (!artistData) {
      return yield* Effect.fail(
        new SpotifyRequestFailed({
          status: 404,
          body: `Artist ${artistId} not found`,
        }),
      );
    }
    const topTracks = yield* searchArtistTracks(
      artistId,
      artistData.name,
      market,
    );
    const albumsResult = yield* getArtistReleasesResult(
      artistId,
      "album",
      market,
    );
    const singlesResult = yield* getArtistReleasesResult(
      artistId,
      "single",
      market,
    );
    return {
      page: {
        artist: mapArtist(artistData),
        topTracks,
        albums: albumsResult.page,
        singles: singlesResult.page,
      },
      usedReleaseFallback:
        albumsResult.usedFallback || singlesResult.usedFallback,
    };
  });

/** The `.page` of the result. */
export const getArtistPageData = (artistId: string, market?: string | null) =>
  getArtistPageDataResult(artistId, market).pipe(Effect.map((r) => r.page));

/** Soft errors → null market. */
export const getArtistPageMarket = () =>
  getSpotifyProfileMarket().pipe(
    Effect.catchIf(isSoftReleaseError, () =>
      Effect.succeed<string | null>(null),
    ),
  );
