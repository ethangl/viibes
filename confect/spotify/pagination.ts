import { DEFAULT_LIMIT, DEFAULT_OFFSET } from "./constants";
import type { SpotifyPage } from "./types";

export interface SpotifyOffsetPagingResponse<TItem> {
  items?: Array<TItem | null>;
  limit?: number;
  next?: string | null;
  offset?: number;
  previous?: string | null;
  total?: number;
}

function getSpotifyNextOffset(next: string | null | undefined) {
  if (!next) {
    return null;
  }

  try {
    const url = new URL(next);
    const value = url.searchParams.get("offset");
    if (!value) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createSpotifyPage<TItem>(
  response: SpotifyOffsetPagingResponse<unknown> | null | undefined,
  items: TItem[],
  limit = DEFAULT_LIMIT,
  offset = DEFAULT_OFFSET,
): SpotifyPage<TItem> {
  const normalizedLimit = response?.limit ?? limit;
  const normalizedOffset = response?.offset ?? offset;
  const total = response?.total ?? normalizedOffset + items.length;
  const nextOffset =
    getSpotifyNextOffset(response?.next) ??
    (response?.next ? normalizedOffset + items.length : null);
  const hasMore =
    nextOffset !== null || total > normalizedOffset + items.length;

  return {
    items,
    offset: normalizedOffset,
    limit: normalizedLimit,
    total,
    nextOffset:
      nextOffset ?? (hasMore ? normalizedOffset + items.length : null),
    hasMore,
  };
}

export function createEmptySpotifyPage<TItem>(
  limit = DEFAULT_LIMIT,
  offset = DEFAULT_OFFSET,
): SpotifyPage<TItem> {
  return {
    items: [],
    offset,
    limit,
    total: 0,
    nextOffset: null,
    hasMore: false,
  };
}
