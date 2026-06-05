import { Effect } from "effect";

import { spotifyRequest } from "../../auth-loop/client";
import { DEFAULT_LIMIT } from "./constants";
import { mapTrack, type SpotifyApiTrack } from "./mappers";
import type {
  SpotifyCursorPage,
  SpotifyRecentlyPlayedItem,
  SpotifyRecentlyPlayedPageResult,
} from "./types";

interface RecentlyPlayedResponse {
  cursors?: { after?: string | null; before?: string | null };
  limit?: number;
  items?: { played_at: string; track: SpotifyApiTrack }[];
  next?: string | null;
  total?: number;
}

// Errors that survive after the rate-limit case is handled inline.
// ── Pure cursor-page helpers (ported verbatim) ───────────────────────────────

function parseSpotifyNumberCursor(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getSpotifyNextCursor(next: string | null | undefined, key: string) {
  if (!next) return null;
  try {
    return parseSpotifyNumberCursor(new URL(next).searchParams.get(key));
  } catch {
    return null;
  }
}

function createSpotifyCursorPage<TItem>(
  response: RecentlyPlayedResponse | null | undefined,
  items: TItem[],
  limit = DEFAULT_LIMIT,
): SpotifyCursorPage<TItem, number> {
  const normalizedLimit = response?.limit ?? limit;
  const total = response?.total ?? items.length;
  const nextCursor =
    getSpotifyNextCursor(response?.next, "before") ??
    parseSpotifyNumberCursor(response?.cursors?.before);
  const hasMore = nextCursor !== null || Boolean(response?.next);
  return { items, limit: normalizedLimit, total, nextCursor, hasMore };
}

function createEmptySpotifyCursorPage<TItem>(
  limit = DEFAULT_LIMIT,
): SpotifyCursorPage<TItem, number> {
  return { items: [], limit, total: 0, nextCursor: null, hasMore: false };
}

// ── Effect logic ─────────────────────────────────────────────────────────────

/** Ported from `getRecentlyPlayedPage`. */
export const getRecentlyPlayedPage = (
  limit = DEFAULT_LIMIT,
  before?: number | null,
) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before !== null && before !== undefined) {
    params.set("before", String(before));
  }
  return spotifyRequest<RecentlyPlayedResponse>(
    `/me/player/recently-played?${params.toString()}`,
  ).pipe(
    Effect.map(
      (data): SpotifyCursorPage<SpotifyRecentlyPlayedItem, number> => {
        const items = (data?.items ?? []).map((item) => ({
          playedAt: item.played_at,
          track: mapTrack(item.track),
        }));
        return createSpotifyCursorPage(data, items, limit);
      },
    ),
  );
};

/**
 * Ported from `loadRecentlyPlayedResult`. A rate-limit (429 or active cooldown)
 * resolves to an empty page with `rateLimited: true` instead of failing — the
 * UI shows the flag. Other failures stay in the error channel.
 */
export const loadRecentlyPlayedResult = (
  before: number | null,
  limit = DEFAULT_LIMIT,
) =>
  getRecentlyPlayedPage(limit, before).pipe(
    Effect.map(
      (page): SpotifyRecentlyPlayedPageResult => ({ page, rateLimited: false }),
    ),
    Effect.catchTag("SpotifyRateLimited", () =>
      Effect.succeed<SpotifyRecentlyPlayedPageResult>({
        page: createEmptySpotifyCursorPage(limit),
        rateLimited: true,
      }),
    ),
  );