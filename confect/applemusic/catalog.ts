/**
 * Minimal Apple Music catalog client for server-side catalog reads (ISRC
 * resolution + free-text song search).
 *
 * Apple developer tokens are app-level (not per-user) and valid up to ~6 months,
 * so we consume a pre-generated token from the environment rather than signing
 * one at runtime (no crypto in the Convex isolate). Catalog reads need only the
 * developer token — a Music User Token is for personalized/library data.
 *
 * Unlike the Spotify client (`spotifyRequest`), there's no auth loop, cooldown,
 * or retry to compose, so the only Effect machinery here is the request helper
 * and a typed error channel. Both public reads are *total* — failures are
 * logged and folded into an empty/soft result, since catalog reads are
 * best-effort (search) or must not poison the resolution cache (lookup).
 */

import { Data, Effect } from "effect";

const APPLE_MUSIC_API = "https://api.music.apple.com/v1";
const DEFAULT_STOREFRONT = "us";

export interface AppleCatalogConfig {
  developerToken: string | null;
  storefront: string;
  fetchImpl: typeof fetch;
}

export function readAppleCatalogConfig(): AppleCatalogConfig {
  return {
    developerToken: process.env.APPLE_MUSIC_DEVELOPER_TOKEN ?? null,
    storefront: process.env.APPLE_MUSIC_STOREFRONT ?? DEFAULT_STOREFRONT,
    fetchImpl: fetch,
  };
}

/** The fetch itself threw, or the body wasn't JSON — no usable HTTP result. */
export class AppleCatalogNetworkError extends Data.TaggedError(
  "AppleCatalogNetworkError",
)<{
  readonly cause: unknown;
}> {}

/** A non-2xx response from the catalog API. */
export class AppleCatalogRequestFailed extends Data.TaggedError(
  "AppleCatalogRequestFailed",
)<{
  readonly status: number;
}> {}

type AppleCatalogError = AppleCatalogNetworkError | AppleCatalogRequestFailed;

/** One authenticated GET against the catalog API, decoded as JSON. */
const appleRequest = <T>(
  path: string,
  developerToken: string,
  fetchImpl: typeof fetch,
): Effect.Effect<T, AppleCatalogError> =>
  Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () =>
        fetchImpl(`${APPLE_MUSIC_API}${path}`, {
          headers: { Authorization: `Bearer ${developerToken}` },
        }),
      catch: (cause) => new AppleCatalogNetworkError({ cause }),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        new AppleCatalogRequestFailed({ status: response.status }),
      );
    }

    return yield* Effect.tryPromise({
      try: () => response.json() as Promise<T>,
      catch: (cause) => new AppleCatalogNetworkError({ cause }),
    });
  });

export interface AppleLookupResult {
  /** False when no developer token is configured — caller must NOT cache this. */
  configured: boolean;
  /** Apple catalog song id, or null when the ISRC isn't in the catalog. */
  songId: string | null;
}

/**
 * Look up an Apple Music catalog song id by ISRC, via the "Get Multiple Catalog
 * Songs by ISRC" filter endpoint (first match wins). Yields
 * `{ configured: false }` when unconfigured so the caller skips caching until
 * credentials exist; any request failure folds to a cacheable `{ configured:
 * true, songId: null }` miss.
 */
export function lookupAppleSongIdByIsrc(
  isrc: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Effect.Effect<AppleLookupResult> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return Effect.succeed({ configured: false, songId: null });
  }

  const path = `/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(
    isrc,
  )}`;

  return appleRequest<{ data?: { id?: string }[] }>(
    path,
    developerToken,
    fetchImpl,
  ).pipe(
    Effect.map(
      (body): AppleLookupResult => ({
        configured: true,
        songId: body.data?.[0]?.id ?? null,
      }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() =>
        console.error("[apple-catalog] lookup failed", { isrc, error }),
      ),
    ),
    Effect.catchAll(() =>
      Effect.succeed<AppleLookupResult>({ configured: true, songId: null }),
    ),
  );
}

/** A catalog artist, mapped for the search row + artist page header. */
export interface CatalogArtist {
  id: string;
  name: string;
  image: string | null;
}

/** Combined song+artist search results (one catalog round-trip). */
export interface CatalogSearchResults {
  tracks: CatalogTrack[];
  artists: CatalogArtist[];
}

/** An album or single in an artist's discography (the releases sections). */
export interface CatalogRelease {
  id: string;
  name: string;
  image: string | null;
  releaseDate: string | null;
  trackCount: number;
}

/** An artist plus their top songs and discography, for the catalog artist page. */
export interface CatalogArtistDetail {
  artist: CatalogArtist;
  topSongs: CatalogTrack[];
  albums: CatalogRelease[];
  singles: CatalogRelease[];
}

/** An album plus its tracks, for the catalog album page. */
export interface CatalogAlbumDetail {
  album: {
    id: string;
    name: string;
    artistName: string;
    /** Primary artist's catalog id (back-navigation), or null when absent. */
    artistId: string | null;
    image: string | null;
  };
  tracks: CatalogTrack[];
}

/** A catalog song mapped to the provider-neutral track shape the queue uses. */
export interface CatalogTrack {
  /** Apple catalog song id — the id playback resolves/plays directly. */
  id: string;
  name: string;
  artist: string;
  albumName: string;
  albumImage: string | null;
  durationMs: number;
  /** Canonical recording id; Apple populates this for catalog songs. */
  isrc: string | null;
}

const SEARCH_LIMIT = 10;
const ARTWORK_SIZE = 200;

interface CatalogSongResource {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    artwork?: { url?: string };
  };
}

interface CatalogArtistResource {
  id: string;
  attributes?: {
    name?: string;
    artwork?: { url?: string };
  };
}

interface CatalogAlbumResource {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    releaseDate?: string;
    trackCount?: number;
    artwork?: { url?: string };
  };
}

function mapCatalogRelease(album: CatalogAlbumResource): CatalogRelease {
  return {
    id: album.id,
    name: album.attributes?.name ?? "(unknown)",
    image: artworkUrl(album.attributes?.artwork?.url),
    releaseDate: album.attributes?.releaseDate ?? null,
    trackCount: album.attributes?.trackCount ?? 0,
  };
}

function mapCatalogArtist(artist: CatalogArtistResource): CatalogArtist {
  return {
    id: artist.id,
    name: artist.attributes?.name ?? "(unknown)",
    image: artworkUrl(artist.attributes?.artwork?.url),
  };
}

/** Resolve Apple's `{w}x{h}` artwork URL template to a concrete size. */
function artworkUrl(template: string | undefined): string | null {
  if (!template) return null;
  return template
    .replace("{w}", String(ARTWORK_SIZE))
    .replace("{h}", String(ARTWORK_SIZE));
}

function mapCatalogSong(song: CatalogSongResource): CatalogTrack {
  const attributes = song.attributes ?? {};
  return {
    id: song.id,
    name: attributes.name ?? "(unknown)",
    artist: attributes.artistName ?? "",
    albumName: attributes.albumName ?? "",
    albumImage: artworkUrl(attributes.artwork?.url),
    durationMs: attributes.durationInMillis ?? 0,
    isrc: attributes.isrc ?? null,
  };
}

const EMPTY_SEARCH_RESULTS: CatalogSearchResults = { tracks: [], artists: [] };

/**
 * Search the Apple Music catalog for songs and artists by free text, in one
 * round-trip. Catalog search needs only the app-level developer token, so it
 * works for any listener (no Music User Token / connection required). Yields
 * empty results when unconfigured or on failure — search is best-effort and
 * uncached, so there's no negative cache to poison.
 */
export function searchAppleCatalog(
  query: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Effect.Effect<CatalogSearchResults> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return Effect.succeed(EMPTY_SEARCH_RESULTS);
  }

  const params = new URLSearchParams({
    term: query,
    types: "songs,artists",
    limit: String(SEARCH_LIMIT),
  });
  const path = `/catalog/${storefront}/search?${params.toString()}`;

  return appleRequest<{
    results?: {
      songs?: { data?: CatalogSongResource[] };
      artists?: { data?: CatalogArtistResource[] };
    };
  }>(path, developerToken, fetchImpl).pipe(
    Effect.map(
      (body): CatalogSearchResults => ({
        tracks: (body.results?.songs?.data ?? []).map(mapCatalogSong),
        artists: (body.results?.artists?.data ?? []).map(mapCatalogArtist),
      }),
    ),
    Effect.tapError((error) =>
      Effect.sync(() =>
        console.error("[apple-catalog] search failed", { query, error }),
      ),
    ),
    Effect.catchAll(() => Effect.succeed(EMPTY_SEARCH_RESULTS)),
  );
}

/**
 * Fetch a catalog artist plus their top songs (for the artist page). Yields
 * `null` when unconfigured, not found, or on failure — the caller renders a
 * not-found state. Dev-token only.
 */
export function getAppleArtist(
  artistId: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Effect.Effect<CatalogArtistDetail | null> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return Effect.succeed(null);
  }

  const path = `/catalog/${storefront}/artists/${encodeURIComponent(
    artistId,
  )}?views=top-songs,full-albums,singles`;

  return appleRequest<{
    data?: Array<
      CatalogArtistResource & {
        views?: {
          "top-songs"?: { data?: CatalogSongResource[] };
          "full-albums"?: { data?: CatalogAlbumResource[] };
          singles?: { data?: CatalogAlbumResource[] };
        };
      }
    >;
  }>(path, developerToken, fetchImpl).pipe(
    Effect.map((body): CatalogArtistDetail | null => {
      const resource = body.data?.[0];
      if (!resource) return null;
      return {
        artist: mapCatalogArtist(resource),
        topSongs: (resource.views?.["top-songs"]?.data ?? []).map(
          mapCatalogSong,
        ),
        albums: (resource.views?.["full-albums"]?.data ?? []).map(
          mapCatalogRelease,
        ),
        singles: (resource.views?.singles?.data ?? []).map(mapCatalogRelease),
      };
    }),
    Effect.tapError((error) =>
      Effect.sync(() =>
        console.error("[apple-catalog] artist fetch failed", {
          artistId,
          error,
        }),
      ),
    ),
    Effect.catchAll(() => Effect.succeed(null)),
  );
}

/**
 * Fetch a catalog album plus its tracks (for the album page). Yields `null`
 * when unconfigured, not found, or on failure — the caller renders a not-found
 * state. Tracks ride along on the album's `tracks` relationship. Dev-token only.
 */
export function getAppleAlbum(
  albumId: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Effect.Effect<CatalogAlbumDetail | null> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return Effect.succeed(null);
  }

  const path = `/catalog/${storefront}/albums/${encodeURIComponent(albumId)}`;

  return appleRequest<{
    data?: Array<
      CatalogAlbumResource & {
        relationships?: {
          tracks?: { data?: CatalogSongResource[] };
          artists?: { data?: { id?: string }[] };
        };
      }
    >;
  }>(path, developerToken, fetchImpl).pipe(
    Effect.map((body): CatalogAlbumDetail | null => {
      const resource = body.data?.[0];
      if (!resource) return null;
      return {
        album: {
          id: resource.id,
          name: resource.attributes?.name ?? "(unknown)",
          artistName: resource.attributes?.artistName ?? "",
          artistId: resource.relationships?.artists?.data?.[0]?.id ?? null,
          image: artworkUrl(resource.attributes?.artwork?.url),
        },
        tracks: (resource.relationships?.tracks?.data ?? []).map(
          mapCatalogSong,
        ),
      };
    }),
    Effect.tapError((error) =>
      Effect.sync(() =>
        console.error("[apple-catalog] album fetch failed", { albumId, error }),
      ),
    ),
    Effect.catchAll(() => Effect.succeed(null)),
  );
}
