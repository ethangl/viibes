import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  getAppleAlbum,
  getAppleArtist,
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
    const results = await Effect.runPromise(
      searchAppleCatalog(
        "daft punk",
        configWith(fetchImpl as unknown as typeof fetch, null),
      ),
    );
    expect(results).toEqual({ tracks: [], artists: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps songs + artists and queries the combined search endpoint", async () => {
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
          artists: {
            data: [
              {
                id: "apple-artist-1",
                attributes: {
                  name: "Daft Punk",
                  artwork: { url: "https://artist/{w}x{h}bb.jpg" },
                },
              },
            ],
          },
        },
      }),
    );

    const results = await Effect.runPromise(
      searchAppleCatalog(
        "get lucky",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );

    expect(results).toEqual({
      tracks: [
        {
          id: "apple-song-1",
          name: "Get Lucky",
          artist: "Daft Punk",
          albumName: "Random Access Memories",
          albumImage: "https://art/200x200bb.jpg",
          durationMs: 369_000,
          isrc: "USQX91300108",
        },
      ],
      artists: [
        {
          id: "apple-artist-1",
          name: "Daft Punk",
          image: "https://artist/200x200bb.jpg",
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/search?term=get+lucky&types=songs%2Cartists&limit=10",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("returns empty results on a non-ok response", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));
    const results = await Effect.runPromise(
      searchAppleCatalog(
        "anything",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(results).toEqual({ tracks: [], artists: [] });
  });

  it("returns empty results when the fetch itself throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const results = await Effect.runPromise(
      searchAppleCatalog(
        "anything",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(results).toEqual({ tracks: [], artists: [] });
  });
});

describe("getAppleArtist", () => {
  it("returns null without fetching when no token is set", async () => {
    const fetchImpl = vi.fn();
    const detail = await Effect.runPromise(
      getAppleArtist(
        "apple-artist-1",
        configWith(fetchImpl as unknown as typeof fetch, null),
      ),
    );
    expect(detail).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps the artist, top songs, albums, and singles from the views endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: "apple-artist-1",
            attributes: {
              name: "Daft Punk",
              artwork: { url: "https://artist/{w}x{h}bb.jpg" },
            },
            views: {
              "top-songs": {
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
              "full-albums": {
                data: [
                  {
                    id: "apple-album-1",
                    attributes: {
                      name: "Random Access Memories",
                      releaseDate: "2013-05-17",
                      trackCount: 13,
                      artwork: { url: "https://album/{w}x{h}bb.jpg" },
                    },
                  },
                ],
              },
              singles: {
                data: [
                  {
                    id: "apple-single-1",
                    attributes: {
                      name: "Instant Crush",
                      releaseDate: "2013-09-03",
                      trackCount: 1,
                      artwork: { url: "https://single/{w}x{h}bb.jpg" },
                    },
                  },
                ],
              },
            },
          },
        ],
      }),
    );

    const detail = await Effect.runPromise(
      getAppleArtist(
        "apple-artist-1",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );

    expect(detail).toEqual({
      artist: {
        id: "apple-artist-1",
        name: "Daft Punk",
        image: "https://artist/200x200bb.jpg",
      },
      topSongs: [
        {
          id: "apple-song-1",
          name: "Get Lucky",
          artist: "Daft Punk",
          albumName: "Random Access Memories",
          albumImage: "https://art/200x200bb.jpg",
          durationMs: 369_000,
          isrc: "USQX91300108",
        },
      ],
      albums: [
        {
          id: "apple-album-1",
          name: "Random Access Memories",
          image: "https://album/200x200bb.jpg",
          releaseDate: "2013-05-17",
          trackCount: 13,
        },
      ],
      singles: [
        {
          id: "apple-single-1",
          name: "Instant Crush",
          image: "https://single/200x200bb.jpg",
          releaseDate: "2013-09-03",
          trackCount: 1,
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/artists/apple-artist-1?views=top-songs,full-albums,singles",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("defaults albums and singles to empty arrays when the views are absent", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [{ id: "apple-artist-1", attributes: { name: "Daft Punk" } }],
      }),
    );

    const detail = await Effect.runPromise(
      getAppleArtist(
        "apple-artist-1",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );

    expect(detail).toMatchObject({ topSongs: [], albums: [], singles: [] });
  });

  it("returns null when the artist is not found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const detail = await Effect.runPromise(
      getAppleArtist(
        "missing",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(detail).toBeNull();
  });
});

describe("getAppleAlbum", () => {
  it("returns null without fetching when no token is set", async () => {
    const fetchImpl = vi.fn();
    const detail = await Effect.runPromise(
      getAppleAlbum(
        "apple-album-1",
        configWith(fetchImpl as unknown as typeof fetch, null),
      ),
    );
    expect(detail).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps the album and its tracks from the album endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            id: "apple-album-1",
            attributes: {
              name: "Random Access Memories",
              artistName: "Daft Punk",
              artwork: { url: "https://album/{w}x{h}bb.jpg" },
            },
            relationships: {
              artists: { data: [{ id: "apple-artist-1" }] },
              tracks: {
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
          },
        ],
      }),
    );

    const detail = await Effect.runPromise(
      getAppleAlbum(
        "apple-album-1",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );

    expect(detail).toEqual({
      album: {
        id: "apple-album-1",
        name: "Random Access Memories",
        artistName: "Daft Punk",
        artistId: "apple-artist-1",
        image: "https://album/200x200bb.jpg",
      },
      tracks: [
        {
          id: "apple-song-1",
          name: "Get Lucky",
          artist: "Daft Punk",
          albumName: "Random Access Memories",
          albumImage: "https://art/200x200bb.jpg",
          durationMs: 369_000,
          isrc: "USQX91300108",
        },
      ],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/albums/apple-album-1",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("returns null when the album is not found", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const detail = await Effect.runPromise(
      getAppleAlbum("missing", configWith(fetchImpl as unknown as typeof fetch)),
    );
    expect(detail).toBeNull();
  });

  it("folds a failed request to null", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 500));
    const detail = await Effect.runPromise(
      getAppleAlbum(
        "apple-album-1",
        configWith(fetchImpl as unknown as typeof fetch),
      ),
    );
    expect(detail).toBeNull();
  });
});
