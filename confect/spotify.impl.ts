import { ActionCache } from "@convex-dev/action-cache";
import { FunctionImpl, GroupImpl } from "@confect/server";
import {
  anyApi,
  type DefaultFunctionArgs,
  type FunctionReference,
} from "convex/server";
import { ConvexError } from "convex/values";
import { Effect, Layer } from "effect";

import type {
  SpotifyNetworkError,
  SpotifyRateLimited,
  SpotifyRequestFailed,
  SpotifyUnauthorized,
} from "../auth-loop/errors";
import { components } from "../convex/_generated/api";
import api from "./_generated/api";
import { ActionCtx } from "./_generated/services";
import { getAlbum, getAlbumTracks } from "./spotify/albums";
import {
  getArtistPageDataResult,
  getArtistPageMarket,
  getArtistReleasesPage,
  getFavoriteArtists,
  getTopArtists,
} from "./spotify/artists";
import { DAY_IN_MS, DEFAULT_LIMIT, DEFAULT_OFFSET } from "./spotify/constants";
import { SpotifyAuthRequired, SpotifyUnavailable } from "./spotify/errors";
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
} from "./spotify/playlists";
import { searchSpotify, searchTracksByName } from "./spotify/search";
import { loadRecentlyPlayedResult } from "./spotify/tracks";
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

// ── Typed-error mapping ──────────────────────────────────────────────────────
// Loaders fail with these typed errors (declared in spotify.spec.ts) so confect
// encodes them into a ConvexError the client can read, instead of orDie's
// opaque UnknownException. A 401/403/Unauthorized means the token is dead →
// the user must reconnect; anything else is transient/unavailable.
type SpotifyLoopError =
  | SpotifyRateLimited
  | SpotifyRequestFailed
  | SpotifyUnauthorized
  | SpotifyNetworkError;

const toSpotifyError =
  (fallback: string) =>
  (error: SpotifyLoopError): SpotifyAuthRequired | SpotifyUnavailable => {
    if (
      error._tag === "SpotifyUnauthorized" ||
      (error._tag === "SpotifyRequestFailed" &&
        (error.status === 401 || error.status === 403))
    ) {
      return new SpotifyAuthRequired({
        message: "Reconnect Spotify to continue.",
      });
    }
    return new SpotifyUnavailable({ message: fallback });
  };

// On a cache miss the loader's typed failure crosses the action-cache
// `runAction` boundary as a ConvexError; map it back into the typed channel so
// the public action re-surfaces it (rather than orDie's opaque failure).
const fromConvexError = (
  cause: unknown,
): SpotifyAuthRequired | SpotifyUnavailable => {
  if (cause instanceof ConvexError) {
    const data = cause.data as { _tag?: string; message?: string } | null;
    if (data?._tag === "SpotifyAuthRequired") {
      return new SpotifyAuthRequired({
        message: data.message ?? "Reconnect Spotify to continue.",
      });
    }
    if (data?._tag === "SpotifyUnavailable") {
      return new SpotifyUnavailable({
        message: data.message ?? "Spotify is unavailable right now.",
      });
    }
  }
  return new SpotifyUnavailable({
    message: "Spotify is unavailable right now.",
  });
};

// ── Internal load actions (run on cache miss) ────────────────────────────────
const loadSearchResults = FunctionImpl.make(
  api,
  "spotify",
  "loadSearchResults",
  ({ query }) =>
    searchSpotify(query).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not search Spotify right now.")),
    ),
);
const loadSearchTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadSearchTracks",
  ({ query }) =>
    searchTracksByName(query).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not search Spotify right now.")),
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
      Effect.mapError(toSpotifyError("Could not load artist right now.")),
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
        toSpotifyError("Could not load artist releases right now."),
      ),
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
        toSpotifyError("Could not load favorite artists right now."),
      ),
    ),
);
const loadAlbum = FunctionImpl.make(api, "spotify", "loadAlbum", ({ albumId }) =>
  getAlbum(albumId).pipe(
    Effect.provide(SpotifyLive),
    Effect.mapError(toSpotifyError("Could not load album.")),
  ),
);
const loadAlbumTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadAlbumTracks",
  ({ albumId }) =>
    getAlbumTracks(albumId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not load album tracks.")),
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
        toSpotifyError("Could not load your recent tracks right now."),
      ),
    ),
);
const loadPlaylistsPage = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylistsPage",
  ({ limit, offset }) =>
    getUserPlaylists(limit, offset).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not load playlists.")),
    ),
);
const loadPlaylist = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylist",
  ({ playlistId }) =>
    getPlaylist(playlistId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not load playlist.")),
    ),
);
const loadPlaylistTracks = FunctionImpl.make(
  api,
  "spotify",
  "loadPlaylistTracks",
  ({ playlistId }) =>
    getPlaylistTracks(playlistId).pipe(
      Effect.provide(SpotifyLive),
      Effect.mapError(toSpotifyError("Could not load playlist tracks.")),
    ),
);

// ── Public actions ───────────────────────────────────────────────────────────
// Auth-gate, then delegate to the read-through cache. User-scoped reads pass
// `cacheScope = identity.subject` so the cache key is per-user.
//
// Auth uses the verified JWT identity (`ctx.auth.getUserIdentity()` — no DB
// round-trip) rather than `requireAuthUser` (a ~50ms betterAuth component
// query). A cached read only needs proof of auth + a stable per-user partition
// key, both of which the JWT already carries; `subject` is the stable
// better-auth user id.
const requireIdentity = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity;
};

const search = FunctionImpl.make(api, "spotify", "search", ({ query }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise({
      try: async () => {
        await requireIdentity(ctx);
        return spotifySearchResultsCache.fetch(ctx, { query });
      },
      catch: fromConvexError,
    });
  }),
);
const searchTracks = FunctionImpl.make(
  api,
  "spotify",
  "searchTracks",
  ({ query }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          await requireIdentity(ctx);
          return spotifySearchTracksCache.fetch(ctx, { query });
        },
        catch: fromConvexError,
      });
    }),
);
const artistPage = FunctionImpl.make(
  api,
  "spotify",
  "artistPage",
  ({ artistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyArtistPageCache.fetch(ctx, {
            artistId,
            cacheScope: subject,
          });
        },
        catch: fromConvexError,
      });
    }),
);
const artistReleasesPage = FunctionImpl.make(
  api,
  "spotify",
  "artistReleasesPage",
  ({ artistId, includeGroups, limit, offset }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyArtistReleasesPageCache.fetch(ctx, {
            artistId,
            includeGroups,
            limit: limit ?? DEFAULT_LIMIT,
            offset: offset ?? DEFAULT_OFFSET,
            cacheScope: subject,
          });
        },
        catch: fromConvexError,
      });
    }),
);
const topArtists = FunctionImpl.make(api, "spotify", "topArtists", ({ limit }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise({
      try: async () => {
        const { subject } = await requireIdentity(ctx);
        return spotifyTopArtistsCache.fetch(ctx, {
          limit: limit ?? DEFAULT_LIMIT,
          cacheScope: subject,
        });
      },
      catch: fromConvexError,
    });
  }),
);
const favoriteArtists = FunctionImpl.make(
  api,
  "spotify",
  "favoriteArtists",
  ({ after, limit, forceRefresh }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyFavoriteArtistsCache.fetch(
            ctx,
            {
              after: after ?? null,
              limit: limit ?? DEFAULT_LIMIT,
              cacheScope: subject,
            },
            forceRefresh ? { force: true } : undefined,
          );
        },
        catch: fromConvexError,
      });
    }),
);
const album = FunctionImpl.make(api, "spotify", "album", ({ albumId }) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    return yield* Effect.tryPromise({
      try: async () => {
        await requireIdentity(ctx);
        return spotifyAlbumCache.fetch(ctx, { albumId });
      },
      catch: fromConvexError,
    });
  }),
);
const albumTracks = FunctionImpl.make(
  api,
  "spotify",
  "albumTracks",
  ({ albumId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          await requireIdentity(ctx);
          return spotifyAlbumTracksCache.fetch(ctx, { albumId });
        },
        catch: fromConvexError,
      });
    }),
);
const recentlyPlayed = FunctionImpl.make(
  api,
  "spotify",
  "recentlyPlayed",
  ({ before, forceRefresh, limit }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyRecentlyPlayedCache.fetch(
            ctx,
            {
              before: before ?? null,
              limit: limit ?? DEFAULT_LIMIT,
              cacheScope: subject,
            },
            forceRefresh ? { force: true } : undefined,
          );
        },
        catch: fromConvexError,
      });
    }),
);
const playlistsPage = FunctionImpl.make(
  api,
  "spotify",
  "playlistsPage",
  ({ limit, offset, forceRefresh }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyPlaylistsPageCache.fetch(
            ctx,
            {
              limit: limit ?? DEFAULT_LIMIT,
              offset: offset ?? DEFAULT_OFFSET,
              cacheScope: subject,
            },
            forceRefresh ? { force: true } : undefined,
          );
        },
        catch: fromConvexError,
      });
    }),
);
const playlist = FunctionImpl.make(
  api,
  "spotify",
  "playlist",
  ({ playlistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyPlaylistCache.fetch(ctx, {
            playlistId,
            cacheScope: subject,
          });
        },
        catch: fromConvexError,
      });
    }),
);
const playlistTracks = FunctionImpl.make(
  api,
  "spotify",
  "playlistTracks",
  ({ playlistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise({
        try: async () => {
          const { subject } = await requireIdentity(ctx);
          return spotifyPlaylistTracksCache.fetch(ctx, {
            playlistId,
            cacheScope: subject,
          });
        },
        catch: fromConvexError,
      });
    }),
);

// Playback (uncached): fetch the token, run the playback effect. A token
// failure surfaces as SpotifyAuthRequired so the UI can prompt a reconnect.
const withAccessToken = <A>(run: (token: string) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const ctx = yield* ActionCtx;
    const token = yield* Effect.tryPromise({
      try: () => requireSpotifyAccessToken(ctx),
      catch: () =>
        new SpotifyAuthRequired({ message: "Reconnect Spotify to continue." }),
    });
    return yield* run(token);
  });

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
      await requireIdentity(ctx);
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
