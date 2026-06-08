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

/**
 * Search the Apple Music catalog for songs by free text. Catalog search needs
 * only the app-level developer token, so it works for any listener (no Music
 * User Token / connection required). Yields `[]` when unconfigured or on
 * failure — search is best-effort and uncached, so there's no negative cache to
 * poison.
 */
export function searchAppleCatalog(
  query: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Effect.Effect<CatalogTrack[]> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return Effect.succeed([]);
  }

  const params = new URLSearchParams({
    term: query,
    types: "songs",
    limit: String(SEARCH_LIMIT),
  });
  const path = `/catalog/${storefront}/search?${params.toString()}`;

  return appleRequest<{
    results?: { songs?: { data?: CatalogSongResource[] } };
  }>(path, developerToken, fetchImpl).pipe(
    Effect.map((body) =>
      (body.results?.songs?.data ?? []).map(mapCatalogSong),
    ),
    Effect.tapError((error) =>
      Effect.sync(() =>
        console.error("[apple-catalog] search failed", { query, error }),
      ),
    ),
    Effect.catchAll(() => Effect.succeed<CatalogTrack[]>([])),
  );
}
