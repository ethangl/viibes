import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAppleLibraryPlaylists,
  getAppleLibraryPlaylistTracks,
} from "./apple-library-client";

type MusicHandler = (
  path: string,
  params?: Record<string, unknown>,
) => unknown;

function installMusicKit(handler: MusicHandler) {
  const music = {
    storefrontId: "us",
    api: { music: vi.fn(async (path: string, params?: Record<string, unknown>) =>
      handler(path, params),
    ) },
  };
  (window as unknown as { MusicKit?: unknown }).MusicKit = {
    getInstance: () => music,
  };
  return music;
}

afterEach(() => {
  delete (window as unknown as { MusicKit?: unknown }).MusicKit;
});

describe("getAppleLibraryPlaylists", () => {
  it("returns [] when MusicKit isn't available", async () => {
    expect(await getAppleLibraryPlaylists()).toEqual([]);
  });

  it("maps library playlists", async () => {
    // MusicKit's api.music wraps the API body under `.data`, so a list nests as
    // response.data.data.
    installMusicKit((path) => {
      expect(path).toBe("/v1/me/library/playlists");
      return {
        data: {
          data: [
            {
              id: "p.1",
              attributes: {
                name: "Road Trip",
                artwork: { url: "https://art/{w}x{h}.jpg" },
                description: { standard: "Songs for the highway" },
              },
            },
            { id: "p.2", attributes: { name: "Focus" } },
          ],
        },
      };
    });

    expect(await getAppleLibraryPlaylists()).toEqual([
      {
        id: "p.1",
        name: "Road Trip",
        image: "https://art/200x200.jpg",
        description: "Songs for the highway",
      },
      { id: "p.2", name: "Focus", image: null, description: null },
    ]);
  });
});

describe("getAppleLibraryPlaylistTracks", () => {
  it("pages library tracks, drops uploads without a catalog id, then resolves catalog songs in order", async () => {
    const music = installMusicKit((path, params) => {
      if (path === "/v1/me/library/playlists/p.1/tracks") {
        return {
          data: {
            data: [
              { id: "l.1", attributes: { playParams: { catalogId: "100" } } },
              { id: "l.2", attributes: { playParams: {} } }, // upload, no catalogId
              { id: "l.3", attributes: { playParams: { catalogId: "200" } } },
            ],
            next: "/v1/me/library/playlists/p.1/tracks?offset=3",
          },
        };
      }
      if (path === "/v1/me/library/playlists/p.1/tracks?offset=3") {
        return {
          data: {
            data: [
              { id: "l.4", attributes: { playParams: { catalogId: "300" } } },
            ],
          },
        };
      }
      if (path === "/v1/catalog/us/songs") {
        const ids = String((params as { ids: string }).ids).split(",");
        return {
          data: {
            data: ids.map((id) => ({
              id,
              attributes: {
                name: `Song ${id}`,
                artistName: "Artist",
                albumName: "Album",
                durationInMillis: 1000,
                isrc: `ISRC${id}`,
                artwork: { url: "https://art/{w}x{h}.jpg" },
              },
            })),
          },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const tracks = await getAppleLibraryPlaylistTracks("p.1");

    expect(tracks.map((t) => t.id)).toEqual(["100", "200", "300"]);
    expect(tracks[0]).toEqual({
      id: "100",
      name: "Song 100",
      artist: "Artist",
      albumName: "Album",
      albumImage: "https://art/200x200.jpg",
      durationMs: 1000,
      isrc: "ISRC100",
    });
    // One catalog batch for 3 ids (≤100).
    const catalogCalls = music.api.music.mock.calls.filter(
      (c) => c[0] === "/v1/catalog/us/songs",
    );
    expect(catalogCalls).toHaveLength(1);
    expect(catalogCalls[0][1]).toEqual({ ids: "100,200,300" });
  });

  it("chunks catalog lookups into batches of 100", async () => {
    const catalogIds = Array.from({ length: 150 }, (_, i) => `c${i}`);
    const music = installMusicKit((path, params) => {
      if (path === "/v1/me/library/playlists/big/tracks") {
        return {
          data: {
            data: catalogIds.map((catalogId, i) => ({
              id: `l${i}`,
              attributes: { playParams: { catalogId } },
            })),
          },
        };
      }
      if (path === "/v1/catalog/us/songs") {
        const ids = String((params as { ids: string }).ids).split(",");
        return {
          data: { data: ids.map((id) => ({ id, attributes: { name: id } })) },
        };
      }
      throw new Error(`unexpected path ${path}`);
    });

    const tracks = await getAppleLibraryPlaylistTracks("big");

    expect(tracks).toHaveLength(150);
    const catalogCalls = music.api.music.mock.calls.filter(
      (c) => c[0] === "/v1/catalog/us/songs",
    );
    expect(catalogCalls).toHaveLength(2);
    expect(String(catalogCalls[0][1]?.ids).split(",")).toHaveLength(100);
    expect(String(catalogCalls[1][1]?.ids).split(",")).toHaveLength(50);
  });
});
