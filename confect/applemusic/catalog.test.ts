import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  lookupAppleSongIdByIsrc,
  searchAppleCatalog,
  type AppleCatalogConfig,
} from "./catalog";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const configWith = (
  fetchImpl: typeof fetch,
  developerToken: string | null = "dev-token",
): AppleCatalogConfig => ({
  developerToken,
  storefront: "us",
  fetchImpl,
});

describe("lookupAppleSongIdByIsrc", () => {
  it("returns not-configured without fetching when no token is set", async () => {
    const fetchImpl = vi.fn();
    const result = await Effect.runPromise(
      lookupAppleSongIdByIsrc(
        "USRC17607839",
        configWith(fetchImpl as unknown as typeof fetch, null),
      ),
    );
    expect(result).toEqual({ configured: false, songId: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the first matching song id and queries the ISRC filter endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ id: "apple-song-9" }, { id: "apple-song-10" }] }),
    );
    const result = await Effect.runPromise(
      lookupAppleSongIdByIsrc(
        "USRC17607839",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(result).toEqual({ configured: true, songId: "apple-song-9" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=USRC17607839",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("returns configured with null when the catalog has no match", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const result = await Effect.runPromise(
      lookupAppleSongIdByIsrc(
        "USRC17607839",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(result).toEqual({ configured: true, songId: null });
  });

  it("treats a non-ok response as a (cacheable) miss", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 429));
    const result = await Effect.runPromise(
      lookupAppleSongIdByIsrc(
        "USRC17607839",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(result).toEqual({ configured: true, songId: null });
  });
});

describe("searchAppleCatalog", () => {
  it("returns nothing without fetching when no token is set", async () => {
    const fetchImpl = vi.fn();
    const tracks = await Effect.runPromise(
      searchAppleCatalog(
        "daft punk",
        configWith(fetchImpl as unknown as typeof fetch, null),
      ),
    );
    expect(tracks).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps catalog songs and queries the song search endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        results: {
          songs: {
            data: [
              {
                id: "apple-song-1",
                attributes: {
                  name: "Get Lucky",
                  artistName: "Daft Punk",
                  albumName: "Random Access Memories",
                  durationInMillis: 369_000,
                  isrc: "USQX91300108",
                  artwork: { url: "https://art/{w}x{h}bb.jpg" },
                },
              },
            ],
          },
        },
      }),
    );

    const tracks = await Effect.runPromise(
      searchAppleCatalog(
        "get lucky",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );

    expect(tracks).toEqual([
      {
        id: "apple-song-1",
        name: "Get Lucky",
        artist: "Daft Punk",
        albumName: "Random Access Memories",
        albumImage: "https://art/200x200bb.jpg",
        durationMs: 369_000,
        isrc: "USQX91300108",
      },
    ]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/search?term=get+lucky&types=songs&limit=10",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("returns an empty list on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));
    const tracks = await Effect.runPromise(
      searchAppleCatalog(
        "anything",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(tracks).toEqual([]);
  });

  it("returns an empty list when the fetch itself throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const tracks = await Effect.runPromise(
      searchAppleCatalog(
        "anything",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(tracks).toEqual([]);
  });
});
