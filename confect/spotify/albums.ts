import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
import type {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "../../auth-loop/errors";
import type {
  Coalescer,
  Cooldown,
  SpotifyHttp,
  TokenSource,
} from "../../auth-loop/services";
import {
  mapAlbumDetails,
  mapTrack,
  type SpotifyAlbum,
  type SpotifyApiTrack,
} from "./mappers";
import type { SpotifyOffsetPagingResponse } from "./pagination";
import type { SpotifyAlbumDetails, SpotifyTrack } from "./types";

const SPOTIFY_ALBUM_TRACKS_PAGE_LIMIT = 50;

type AlbumTrackItem =
  | (Omit<SpotifyApiTrack, "album"> & { album?: SpotifyAlbum })
  | null;
type AlbumTracksPageResponse = SpotifyOffsetPagingResponse<AlbumTrackItem>;
interface AlbumDetailsResponse extends SpotifyAlbum {
  tracks?: AlbumTracksPageResponse;
}

type LoopError =
  | SpotifyRateLimited
  | SpotifyRequestFailed
  | SpotifyUnauthorized
  | SpotifyNetworkError;
type LoopServices = SpotifyHttp | TokenSource | Cooldown | Coalescer;

function mapAlbumTrackItems(
  items: Array<AlbumTrackItem | null> | undefined,
  album: SpotifyAlbum,
): SpotifyTrack[] {
  return (items ?? [])
    .filter(
      (track): track is Omit<SpotifyApiTrack, "album"> => !!track && !!track.id,
    )
    .map((track) => mapTrack({ ...track, album }));
}

const fetchAlbumDetails = (albumId: string) =>
  spotifyRequest<AlbumDetailsResponse>(`/albums/${albumId}`);

/**
 * Walk the album's track pages. Faithful Effect translation of the original's
 * `while (hasMore)` loop: each step fetches a page and recurses until the offset
 * stops advancing or Spotify reports no `next`.
 */
const fetchRemainingTracks = (
  albumId: string,
  album: SpotifyAlbum,
  offset: number,
  total: number,
  acc: SpotifyTrack[],
): Effect.Effect<SpotifyTrack[], LoopError, LoopServices> =>
  Effect.gen(function* () {
    const page = yield* spotifyRequest<AlbumTracksPageResponse>(
      `/albums/${albumId}/tracks?limit=${SPOTIFY_ALBUM_TRACKS_PAGE_LIMIT}&offset=${offset}`,
    );
    const pageItems = page?.items ?? [];
    const next = [...acc, ...mapAlbumTrackItems(pageItems, album)];

    const nextOffset = (page?.offset ?? offset) + pageItems.length;
    // Stop if the cursor didn't advance (no items / stuck offset). This guards
    // against a non-terminating loop while still honoring `next` below — the
    // caller only recurses here when there's more to fetch.
    if (nextOffset <= offset) {
      return next;
    }
    const nextTotal = page?.total ?? total;
    const continues = Boolean(page?.next) || nextOffset < nextTotal;
    return continues
      ? yield* fetchRemainingTracks(albumId, album, nextOffset, nextTotal, next)
      : next;
  });

const getAlbumTracksFromDetails = (
  albumId: string,
  data: AlbumDetailsResponse,
) =>
  Effect.gen(function* () {
    // `data` is the album detail response; `mapTrack` only reads its name/images,
    // so we can use it directly as the per-track album without re-projecting it
    // (which would trip exactOptionalPropertyTypes on the optional fields).
    const album: SpotifyAlbum = data;
    const firstPageItems = data.tracks?.items ?? [];
    const tracks = mapAlbumTrackItems(firstPageItems, album);
    const offset = (data.tracks?.offset ?? 0) + firstPageItems.length;
    const total = data.tracks?.total ?? firstPageItems.length;
    const hasMore = Boolean(data.tracks?.next) || offset < total;
    return hasMore
      ? yield* fetchRemainingTracks(albumId, album, offset, total, tracks)
      : tracks;
  });

/** Ported from `getAlbum`. 404 → null (the album doesn't exist). */
export const getAlbum = (albumId: string) =>
  fetchAlbumDetails(albumId).pipe(
    Effect.flatMap((data) => {
      if (!data?.id) return Effect.succeed<SpotifyAlbumDetails | null>(null);
      return getAlbumTracksFromDetails(albumId, data).pipe(
        Effect.map(
          (tracks): SpotifyAlbumDetails => ({ ...mapAlbumDetails(data), tracks }),
        ),
      );
    }),
    Effect.catchIf(
      (error): error is SpotifyRequestFailed =>
        error._tag === "SpotifyRequestFailed" && error.status === 404,
      () => Effect.succeed<SpotifyAlbumDetails | null>(null),
    ),
  );

/** Ported from `getAlbumTracks`. Missing album → empty list. */
export const getAlbumTracks = (albumId: string) =>
  fetchAlbumDetails(albumId).pipe(
    Effect.flatMap((data) =>
      !data?.id
        ? Effect.succeed<SpotifyTrack[]>([])
        : getAlbumTracksFromDetails(albumId, data),
    ),
  );
