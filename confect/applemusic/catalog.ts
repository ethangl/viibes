/**
 * Minimal Apple Music catalog client for server-side ISRC resolution.
 *
 * Apple developer tokens are app-level (not per-user) and valid up to ~6 months,
 * so we consume a pre-generated token from the environment rather than signing
 * one at runtime (no crypto in the Convex isolate). Catalog ISRC lookups need
 * only the developer token — a Music User Token is for personalized/library data.
 */

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

export interface AppleLookupResult {
  /** False when no developer token is configured — caller must NOT cache this. */
  configured: boolean;
  /** Apple catalog song id, or null when the ISRC isn't in the catalog. */
  songId: string | null;
}

/**
 * Look up an Apple Music catalog song id by ISRC. Uses the
 * "Get Multiple Catalog Songs by ISRC" filter endpoint and returns the first
 * match. Returns `{ configured: false }` (without throwing) when unconfigured so
 * the caller can skip caching until credentials exist.
 */
export async function lookupAppleSongIdByIsrc(
  isrc: string,
  config: AppleCatalogConfig = readAppleCatalogConfig(),
): Promise<AppleLookupResult> {
  const { developerToken, storefront, fetchImpl } = config;
  if (!developerToken) {
    return { configured: false, songId: null };
  }

  const url = `${APPLE_MUSIC_API}/catalog/${storefront}/songs?filter[isrc]=${encodeURIComponent(
    isrc,
  )}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${developerToken}` },
    });
  } catch (cause) {
    console.error("[apple-catalog] request failed", { isrc, cause });
    return { configured: true, songId: null };
  }

  if (!response.ok) {
    console.error("[apple-catalog] non-ok response", {
      isrc,
      status: response.status,
    });
    return { configured: true, songId: null };
  }

  const body = (await response.json()) as {
    data?: { id?: string }[];
  };
  return { configured: true, songId: body.data?.[0]?.id ?? null };
}
