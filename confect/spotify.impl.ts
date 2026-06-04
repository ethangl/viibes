import { ActionCache } from "@convex-dev/action-cache";
import { FunctionImpl, GroupImpl } from "@confect/server";
import {
  anyApi,
  type DefaultFunctionArgs,
  type FunctionReference,
} from "convex/server";
import { Effect, Layer } from "effect";

import { requireAuthUser } from "../auth/betterAuth";
import { components } from "../convex/_generated/api";
import api from "./_generated/api";
import { ActionCtx } from "./_generated/services";
import { getAlbum, getAlbumTracks, toAlbumError } from "./spotify/albums";
import {
  getArtistPageDataResult,
  getArtistPageMarket,
  getArtistReleasesPage,
  getFavoriteArtists,
  getTopArtists,
  toArtistRequestError,
} from "./spotify/artists";
import { DAY_IN_MS, DEFAULT_LIMIT, DEFAULT_OFFSET } from "./spotify/constants";
import { SpotifyLive } from "./spotify/live";
import {
  getCurrentlyPlaying,
  pausePlayback,
  playUri,
  resumePlayback,
  setRepeatMode,
  setVolumePercent,
} from "./spotify/playback";
import {
  getPlaylist,
  getPlaylistTracks,
  getUserPlaylists,
  toPlaylistsError,
} from "./spotify/playlists";
import { searchSpotify, searchTracksByName, toSearchError } from "./spotify/search";
import {
  loadRecentlyPlayedResult,
  toTracksError,
} from "./spotify/tracks";
import { requireSpotifyAccessToken } from "./spotify/session";
import type {
  SpotifyAlbumDetails,
  SpotifyAlbumRelease,
  SpotifyArtist,
  SpotifyArtistPageData,
  SpotifyArtistReleaseGroup,
  SpotifyFavoriteArtistsPage,
  SpotifyPage,
  SpotifyPlaylist,
  SpotifyPlaylistsPage,
  SpotifyRecentlyPlayedPageResult,
  SpotifySearchResults,
  SpotifyTrack,
} from "./spotify/types";

const SPOTIFY_AUTH_COOLDOWN_KEY = "spotify-auth-cooldown";

// ── Function references (anyApi paths cast; never import typed `internal`) ────
type Ref<Args extends DefaultFunctionArgs, Ret> = FunctionReference<
  "action",
  "internal",
  Args,
  Ret
>;
const r = anyApi.spotify;

const loadSearchResultsRef = r.loadSearchResults as Ref<
  { query: string },
  SpotifySearchResults
>;
const loadSearchTracksRef = r.loadSearchTracks as Ref<
  { query: string },
  SpotifyTrack[]
>;
const loadArtistPageRef = r.loadArtistPage as Ref<
  { artistId: string; cacheScope: string },
  SpotifyArtistPageData | null
>;
const loadArtistReleasesPageRef = r.loadArtistReleasesPage as Ref<
  {
    artistId: string;
    includeGroups: SpotifyArtistReleaseGroup;
    limit: number;
    offset: number;
    cacheScope: string;
  },
  SpotifyPage<SpotifyAlbumRelease>
>;
const loadTopArtistsRef = r.loadTopArtists as Ref<
  { limit: number; cacheScope: string },
  SpotifyArtist[]
>;
const loadFavoriteArtistsRef = r.loadFavoriteArtists as Ref<
  { limit: number; after: string | null; cacheScope: string },
  SpotifyFavoriteArtistsPage
>;
const loadAlbumRef = r.loadAlbum as Ref<
  { albumId: string },
  SpotifyAlbumDetails | null
>;
const loadAlbumTracksRef = r.loadAlbumTracks as Ref<
  { albumId: string },
  SpotifyTrack[]
>;
const loadRecentlyPlayedRef = r.loadRecentlyPlayed as Ref<
  { before: number | null; limit: number; cacheScope: string },
  SpotifyRecentlyPlayedPageResult
>;
const loadPlaylistsPageRef = r.loadPlaylistsPage as Ref<
  { limit: number; offset: number; cacheScope: string },
  SpotifyPlaylistsPage
>;
const loadPlaylistRef = r.loadPlaylist as Ref<
  { playlistId: string; cacheScope: string },
  SpotifyPlaylist | null
>;
const loadPlaylistTracksRef = r.loadPlaylistTracks as Ref<
  { playlistId: string; cacheScope: string },
  SpotifyTrack[]
>;
const cooldownClearRef = anyApi.spotifyAuthCooldown.clear as FunctionReference<
  "mutation",
  "internal",
  { key: string },
  null
>;

// ── Action caches ────────────────────────────────────────────────────────────
const cache = components.actionCache;
const spotifySearchResultsCache = new ActionCache(cache, {
  action: loadSearchResultsRef,
  name: "spotify-search-results-v2",
  ttl: DAY_IN_MS,
});
const spotifySearchTracksCache = new ActionCache(cache, {
  action: loadSearchTracksRef,
  name: "spotify-search-tracks-v1",
  ttl: DAY_IN_MS,
});
const spotifyArtistPageCache = new ActionCache(cache, {
  action: loadArtistPageRef,
  name: "spotify-artist-page-v2",
  ttl: DAY_IN_MS,
});
const spotifyArtistReleasesPageCache = new ActionCache(cache, {
  action: loadArtistReleasesPageRef,
  name: "spotify-artist-releases-page-v1",
  ttl: DAY_IN_MS,
});
const spotifyTopArtistsCache = new ActionCache(cache, {
  action: loadTopArtistsRef,
  name: "spotify-top-artists-v1",
  ttl: DAY_IN_MS,
});
const spotifyFavoriteArtistsCache = new ActionCache(cache, {
  action: loadFavoriteArtistsRef,
  name: "spotify-favorite-artists-v2",
  ttl: DAY_IN_MS,
});
const spotifyAlbumCache = new ActionCache(cache, {
  action: loadAlbumRef,
  name: "spotify-album-v2",
  ttl: DAY_IN_MS,
});
const spotifyAlbumTracksCache = new ActionCache(cache, {
  action: loadAlbumTracksRef,
  name: "spotify-album-tracks-v1",
  ttl: DAY_IN_MS,
});
const spotifyRecentlyPlayedCache = new ActionCache(cache, {
  action: loadRecentlyPlayedRef,
  name: "spotify-recently-played-v2",
  ttl: DAY_IN_MS,
});
const spotifyPlaylistsPageCache = new ActionCache(cache, {
  action: loadPlaylistsPageRef,
  name: "spotify-playlists-page-v2",
  ttl: DAY_IN_MS,
});
const spotifyPlaylistCache = new ActionCache(cache, {
  action: loadPlaylistRef,
  name: "spotify-playlist-v1",
  ttl: DAY_IN_MS,
});
const spotifyPlaylistTracksCache = new ActionCache(cache, {
  action: loadPlaylistTracksRef,
  name: "spotify-playlist-tracks-v1",
  ttl: DAY_IN_MS,
});

// ── Internal load actions (run on cache miss) ────────────────────────────────
const loadSearchResults = FunctionImpl.make(
  api,
  "spotify",
  "loadSearchResults",
  ({ query }) =>
    searchSpotify(query).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSearchError),
      Effect.orDie,
    ),
);
const loadSearchTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadSearchTracks",
  ({ query }) =>
    searchTracksByName(query).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSearchError),
      Effect.orDie,
    ),
);
const loadArtistPage = FunctionImpl.make(
  api,
  "spotify",
  "loadArtistPage",
  ({ artistId }) =>
    Effect.gen(function* () {
      const market = yield* getArtistPageMarket();
      const { page } = yield* getArtistPageDataResult(artistId, market);
      return page;
    }).pipe(
      Effect.catchIf(
        (error) =>
          error._tag === "SpotifyRequestFailed" && error.status === 404,
        () => Effect.succeed<SpotifyArtistPageData | null>(null),
      ),
      Effect.provide(SpotifyLive),
      Effect.mapError(toArtistRequestError("Could not load artist right now.")),
      Effect.orDie,
    ),
);
const loadArtistReleasesPage = FunctionImpl.make(
  api,
  "spotify",
  "loadArtistReleasesPage",
  ({ artistId, includeGroups, limit, offset }) =>
    Effect.gen(function* () {
      const market = yield* getArtistPageMarket();
      return yield* getArtistReleasesPage(artistId, includeGroups, {
        market,
        limit,
        offset,
      });
    }).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(
        toArtistRequestError("Could not load artist releases right now."),
      ),
      Effect.orDie,
    ),
);
const loadTopArtists = FunctionImpl.make(
  api,
  "spotify",
  "loadTopArtists",
  ({ limit }) =>
    getTopArtists(limit).pipe(
      Effect.provide(SpotifyLive),
      Effect.catchAll(() => Effect.succeed<SpotifyArtist[]>([])),
    ),
);
const loadFavoriteArtists = FunctionImpl.make(
  api,
  "spotify",
  "loadFavoriteArtists",
  ({ limit, after }) =>
    getFavoriteArtists(limit, after).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(
        toArtistRequestError("Could not load favorite artists right now."),
      ),
      Effect.orDie,
    ),
);
const loadAlbum = FunctionImpl.make(api, "spotify", "loadAlbum", ({ albumId }) =>
  getAlbum(albumId).pipe(
    Effect.provide(SpotifyLive),
    Effect.mapError(toAlbumError("Could not load album.")),
    Effect.orDie,
  ),
);
const loadAlbumTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadAlbumTracks",
  ({ albumId }) =>
    getAlbumTracks(albumId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toAlbumError("Could not load album tracks.")),
      Effect.orDie,
    ),
);
const loadRecentlyPlayed = FunctionImpl.make(
  api,
  "spotify",
  "loadRecentlyPlayed",
  ({ before, limit }) =>
    loadRecentlyPlayedResult(before, limit).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(
        toTracksError("Could not load your recent tracks right now."),
      ),
      Effect.orDie,
    ),
);
const loadPlaylistsPage = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylistsPage",
  ({ limit, offset }) =>
    getUserPlaylists(limit, offset).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toPlaylistsError("Could not load playlists.")),
      Effect.orDie,
    ),
);
const loadPlaylist = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylist",
  ({ playlistId }) =>
    getPlaylist(playlistId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toPlaylistsError("Could not load playlist.")),
      Effect.orDie,
    ),
);
const loadPlaylistTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylistTracks",
  ({ playlistId }) =>
    getPlaylistTracks(playlistId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toPlaylistsError("Could not load playlist tracks.")),
      Effect.orDie,
    ),
);

// ── Public actions ───────────────────────────────────────────────────────────
// Auth-gate, then delegate to the read-through cache. User-scoped reads pass
// `cacheScope = user._id` so the cache key is per-user.

const search = FunctionImpl.make(api, "spotify", "search", ({ query }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise(async () => {
      await requireAuthUser(ctx);
      return spotifySearchResultsCache.fetch(ctx, { query });
    });
  }).pipe(Effect.orDie),
);
const searchTracks = FunctionImpl.make(
  api,
  "spotify",
  "searchTracks",
  ({ query }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        await requireAuthUser(ctx);
        return spotifySearchTracksCache.fetch(ctx, { query });
      });
    }).pipe(Effect.orDie),
);
const artistPage = FunctionImpl.make(
  api,
  "spotify",
  "artistPage",
  ({ artistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyArtistPageCache.fetch(ctx, {
          artistId,
          cacheScope: String(user._id),
        });
      });
    }).pipe(Effect.orDie),
);
const artistReleasesPage = FunctionImpl.make(
  api,
  "spotify",
  "artistReleasesPage",
  ({ artistId, includeGroups, limit, offset }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyArtistReleasesPageCache.fetch(ctx, {
          artistId,
          includeGroups,
          limit: limit ?? DEFAULT_LIMIT,
          offset: offset ?? DEFAULT_OFFSET,
          cacheScope: String(user._id),
        });
      });
    }).pipe(Effect.orDie),
);
const topArtists = FunctionImpl.make(api, "spotify", "topArtists", ({ limit }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise(async () => {
      const user = await requireAuthUser(ctx);
      return spotifyTopArtistsCache.fetch(ctx, {
        limit: limit ?? DEFAULT_LIMIT,
        cacheScope: String(user._id),
      });
    });
  }).pipe(Effect.orDie),
);
const favoriteArtists = FunctionImpl.make(
  api,
  "spotify",
  "favoriteArtists",
  ({ after, limit, forceRefresh }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyFavoriteArtistsCache.fetch(
          ctx,
          {
            after: after ?? null,
            limit: limit ?? DEFAULT_LIMIT,
            cacheScope: String(user._id),
          },
          forceRefresh ? { force: true } : undefined,
        );
      });
    }).pipe(Effect.orDie),
);
const album = FunctionImpl.make(api, "spotify", "album", ({ albumId }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise(async () => {
      await requireAuthUser(ctx);
      return spotifyAlbumCache.fetch(ctx, { albumId });
    });
  }).pipe(Effect.orDie),
);
const albumTracks = FunctionImpl.make(
  api,
  "spotify",
  "albumTracks",
  ({ albumId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        await requireAuthUser(ctx);
        return spotifyAlbumTracksCache.fetch(ctx, { albumId });
      });
    }).pipe(Effect.orDie),
);
const recentlyPlayed = FunctionImpl.make(
  api,
  "spotify",
  "recentlyPlayed",
  ({ before, forceRefresh, limit }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyRecentlyPlayedCache.fetch(
          ctx,
          {
            before: before ?? null,
            limit: limit ?? DEFAULT_LIMIT,
            cacheScope: String(user._id),
          },
          forceRefresh ? { force: true } : undefined,
        );
      });
    }).pipe(Effect.orDie),
);
const playlistsPage = FunctionImpl.make(
  api,
  "spotify",
  "playlistsPage",
  ({ limit, offset, forceRefresh }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyPlaylistsPageCache.fetch(
          ctx,
          {
            limit: limit ?? DEFAULT_LIMIT,
            offset: offset ?? DEFAULT_OFFSET,
            cacheScope: String(user._id),
          },
          forceRefresh ? { force: true } : undefined,
        );
      });
    }).pipe(Effect.orDie),
);
const playlist = FunctionImpl.make(
  api,
  "spotify",
  "playlist",
  ({ playlistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyPlaylistCache.fetch(ctx, {
          playlistId,
          cacheScope: String(user._id),
        });
      });
    }).pipe(Effect.orDie),
);
const playlistTracks = FunctionImpl.make(
  api,
  "spotify",
  "playlistTracks",
  ({ playlistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        const user = await requireAuthUser(ctx);
        return spotifyPlaylistTracksCache.fetch(ctx, {
          playlistId,
          cacheScope: String(user._id),
        });
      });
    }).pipe(Effect.orDie),
);

// Playback (uncached): fetch the token, run the playback effect.
const withAccessToken = <A>(run: (token: string) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    const token = yield* Effect.tryPromise(() =>
      requireSpotifyAccessToken(ctx),
    );
    return yield* run(token);
  }).pipe(Effect.orDie);

const playbackCurrentlyPlaying = FunctionImpl.make(
  api,
  "spotify",
  "playbackCurrentlyPlaying",
  () => withAccessToken((token) => getCurrentlyPlaying(token)),
);
const playbackPlay = FunctionImpl.make(
  api,
  "spotify",
  "playbackPlay",
  ({ uri, deviceId, offsetMs }) =>
    withAccessToken((token) => playUri(uri, token, deviceId, offsetMs)),
);
const playbackResume = FunctionImpl.make(
  api,
  "spotify",
  "playbackResume",
  () => withAccessToken((token) => resumePlayback(token)),
);
const playbackPause = FunctionImpl.make(
  api,
  "spotify",
  "playbackPause",
  () => withAccessToken((token) => pausePlayback(token)),
);
const playbackSetRepeat = FunctionImpl.make(
  api,
  "spotify",
  "playbackSetRepeat",
  ({ state, deviceId }) =>
    withAccessToken((token) => setRepeatMode(state, token, deviceId)),
);
const playbackSetVolume = FunctionImpl.make(
  api,
  "spotify",
  "playbackSetVolume",
  ({ percent }) => withAccessToken((token) => setVolumePercent(percent, token)),
);

const clearCache = FunctionImpl.make(api, "spotify", "clearCache", () =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise(async () => {
      await requireAuthUser(ctx);
      await Promise.all([
        spotifySearchResultsCache.removeAllForName(ctx),
        spotifySearchTracksCache.removeAllForName(ctx),
        spotifyArtistPageCache.removeAllForName(ctx),
        spotifyArtistReleasesPageCache.removeAllForName(ctx),
        spotifyTopArtistsCache.removeAllForName(ctx),
        spotifyFavoriteArtistsCache.removeAllForName(ctx),
        spotifyAlbumCache.removeAllForName(ctx),
        spotifyAlbumTracksCache.removeAllForName(ctx),
        spotifyRecentlyPlayedCache.removeAllForName(ctx),
        spotifyPlaylistsPageCache.removeAllForName(ctx),
        spotifyPlaylistCache.removeAllForName(ctx),
        spotifyPlaylistTracksCache.removeAllForName(ctx),
        ctx.runMutation(cooldownClearRef, { key: SPOTIFY_AUTH_COOLDOWN_KEY }),
      ]);
      return null;
    });
  }).pipe(Effect.orDie),
);

// All function-impl layers, merged then provided in one shot. (`.pipe` caps at
// ~20 args, and there are 31 functions, so we merge rather than chain provides.)
const functions = Layer.mergeAll(
  search,
  searchTracks,
  loadSearchResults,
  loadSearchTracks,
  artistPage,
  artistReleasesPage,
  topArtists,
  favoriteArtists,
  loadArtistPage,
  loadArtistReleasesPage,
  loadTopArtists,
  loadFavoriteArtists,
  album,
  albumTracks,
  loadAlbum,
  loadAlbumTracks,
  recentlyPlayed,
  loadRecentlyPlayed,
  playlistsPage,
  playlist,
  playlistTracks,
  loadPlaylistsPage,
  loadPlaylist,
  loadPlaylistTracks,
  playbackCurrentlyPlaying,
  playbackPlay,
  playbackResume,
  playbackPause,
  playbackSetRepeat,
  playbackSetVolume,
  clearCache,
);

export const spotify = GroupImpl.make(api, "spotify").pipe(
  Layer.provide(functions),
);
