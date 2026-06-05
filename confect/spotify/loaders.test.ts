import { Effect, Layer, Ref } from "effect";
import { describe, expect, it } from "vitest";

import {
  CoalescerLive,
  CooldownInMemory,
  SpotifyHttp,
  type SpotifyResponse,
  TokenSource,
} from "../../auth-loop/services";
import { getAlbumTracks } from "./albums";
import {
  getArtistPageDataResult,
  getArtistPageMarket,
  getFavoriteArtists,
  getTopArtists,
} from "./artists";
import { getPlaylist, getUserPlaylists } from "./playlists";
import { loadRecentlyPlayedResult } from "./tracks";

// ── Fake SpotifyHttp that replays a scripted response queue ──────────────────
// The endpoint logic runs `spotifyRequest` against the `SpotifyHttp` service;
// here we feed it canned responses instead of real fetches. The auth-loop turns
// status 429 into `SpotifyRateLimited`, 404 into `SpotifyRequestFailed`, etc.
type Scripted = { status: number; body?: unknown; retryAfterSeconds?: number };

const httpLayer = (responses: Scripted[]) =>
  Layer.effect(
    SpotifyHttp,
    Effect.gen(function* () {
      const queue = yield* Ref.make(responses);
      return SpotifyHttp.of({
        send: () =>
          Effect.gen(function* () {
            const remaining = yield* Ref.get(queue);
            const [next, ...rest] = remaining;
            yield* Ref.set(queue, rest);
            const scripted = next ?? { status: 200, body: null };
            return {
              status: scripted.status,
              ok: scripted.status >= 200 && scripted.status < 300,
              retryAfterSeconds: scripted.retryAfterSeconds ?? null,
              body:
                scripted.body === undefined
                  ? ""
                  : JSON.stringify(scripted.body),
            } satisfies SpotifyResponse;
          }),
      });
    }),
  );

const staticToken = Layer.succeed(
  TokenSource,
  TokenSource.of({
    get: Effect.succeed("spotify-token"),
    refresh: Effect.succeed("spotify-token"),
  }),
);

const run = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    | SpotifyHttp
    | TokenSource
    | import("../../auth-loop/services").Cooldown
    | import("../../auth-loop/services").Coalescer
  >,
  responses: Scripted[],
): Promise<A> =>
  Effect.runPromise(
    Effect.provide(
      effect,
      Layer.mergeAll(
        httpLayer(responses),
        staticToken,
        CooldownInMemory,
        CoalescerLive,
      ),
    ),
  );

// ── Logic behaviors via the fake http layer ──────────────────────────────────
describe("spotify loader logic", () => {
  it("returns a rate-limited fallback for recently played", async () => {
    await expect(
      run(loadRecentlyPlayedResult(null, 25), [{ status: 429 }]),
    ).resolves.toEqual({
      page: {
        items: [],
        limit: 25,
        total: 0,
        nextCursor: null,
        hasMore: false,
      },
      rateLimited: true,
    });
  });

  it("maps recently played paging metadata", async () => {
    const result = await run(loadRecentlyPlayedResult(null, 25), [
      {
        status: 200,
        body: {
          items: [
            {
              played_at: "2024-01-01T00:00:00Z",
              track: {
                id: "track-1",
                name: "Weight",
                artists: [{ id: "a1", name: "ISIS" }],
                album: { name: "Panopticon", images: [{ url: "c.jpg" }] },
                duration_ms: 640000,
              },
            },
          ],
          limit: 25,
          next: "https://api.spotify.com/v1/me/player/recently-played?before=123",
          cursors: { before: "123" },
        },
      },
    ]);
    expect(result.rateLimited).toBe(false);
    expect(result.page.items).toHaveLength(1);
    expect(result.page.nextCursor).toBe(123);
    expect(result.page.hasMore).toBe(true);
  });

  it("returns null for a missing playlist (404)", async () => {
    await expect(run(getPlaylist("missing"), [{ status: 404 }])).resolves.toBeNull();
  });

  it("maps a playlist summary", async () => {
    await expect(
      run(getPlaylist("playlist-1"), [
        {
          status: 200,
          body: {
            id: "playlist-1",
            name: "Playlist One",
            description: null,
            images: [{ url: "p.jpg" }],
            owner: { display_name: "User One" },
            public: true,
            tracks: { total: 20 },
          },
        },
      ]),
    ).resolves.toEqual({
      id: "playlist-1",
      name: "Playlist One",
      description: null,
      image: "p.jpg",
      owner: "User One",
      public: true,
      trackCount: 20,
    });
  });

  it("maps playlist page paging metadata", async () => {
    const page = await run(getUserPlaylists(10, 0), [
      {
        status: 200,
        body: {
          items: [
            {
              id: "playlist-1",
              name: "Playlist One",
              description: null,
              images: [{ url: "p.jpg" }],
              owner: { display_name: "User One" },
              public: true,
              tracks: { total: 5 },
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
          next: null,
        },
      },
    ]);
    expect(page.items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(page.total).toBe(1);
  });

  it("maps favorite artists cursor paging metadata", async () => {
    const page = await run(getFavoriteArtists(50, null), [
      {
        status: 200,
        body: {
          artists: {
            items: [
              {
                id: "artist-1",
                name: "ISIS",
                images: [{ url: "a.jpg" }],
                followers: { total: 1234 },
                genres: ["metal"],
              },
            ],
            limit: 50,
            total: 1,
            next: "https://api.spotify.com/v1/me/following?after=cursor-1",
            cursors: { after: "cursor-1" },
          },
        },
      },
    ]);
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBe("cursor-1");
    expect(page.hasMore).toBe(true);
  });

  it("loads top artists", async () => {
    const artists = await run(getTopArtists(10), [
      {
        status: 200,
        body: {
          items: [
            {
              id: "artist-1",
              name: "ISIS",
              images: [{ url: "a.jpg" }],
              followers: { total: 1234 },
              genres: ["metal"],
            },
          ],
        },
      },
    ]);
    expect(artists).toEqual([
      {
        id: "artist-1",
        name: "ISIS",
        image: "a.jpg",
        followerCount: 1234,
        genres: ["metal"],
      },
    ]);
  });

  it("swallows a rate-limited profile market lookup (marketless fallback)", async () => {
    // getArtistPageMarket treats a 429 as a soft error and returns null market.
    await expect(
      run(getArtistPageMarket(), [{ status: 429 }]),
    ).resolves.toBeNull();
  });

  it("fails when Spotify cannot find the artist (404)", async () => {
    await expect(
      run(getArtistPageDataResult("missing", "US"), [{ status: 404 }]),
    ).rejects.toBeDefined();
  });

  it("returns album tracks for a found album", async () => {
    const tracks = await run(getAlbumTracks("album-1"), [
      {
        status: 200,
        body: {
          id: "album-1",
          name: "Oceanic",
          images: [{ url: "album.jpg" }],
          tracks: {
            items: [
              {
                id: "track-1",
                name: "Weight",
                artists: [{ id: "artist-1", name: "ISIS" }],
                duration_ms: 640000,
              },
            ],
          },
        },
      },
    ]);
    expect(tracks).toEqual([
      {
        id: "track-1",
        name: "Weight",
        artist: "ISIS",
        albumName: "Oceanic",
        albumImage: "album.jpg",
        durationMs: 640000,
      },
    ]);
  });
});
