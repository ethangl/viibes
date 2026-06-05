import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { SpotifyAuthRequired, SpotifyUnavailable } from "./spotify/errors";
import {
  mutArray,
  SpotifyAlbumDetailsSchema,
  SpotifyAlbumReleasePageSchema,
  SpotifyArtistPageDataSchema,
  SpotifyArtistSchema,
  SpotifyFavoriteArtistsPageSchema,
  SpotifyPlaybackCurrentlyPlayingResultSchema,
  SpotifyPlaybackResultSchema,
  SpotifyPlaylistSchema,
  SpotifyPlaylistsPageSchema,
  SpotifyRecentlyPlayedPageResultSchema,
  SpotifySearchResultsSchema,
  SpotifyTrackSchema,
} from "./spotify/schemas";

/**
 * The Spotify group. Each cached read is a PUBLIC action that delegates to the
 * `@convex-dev/action-cache` component, which on a miss runs the matching
 * INTERNAL `load*` action. Internal actions run the pure-Effect request loop
 * (`auth-loop/`) with live layers. Playback commands are uncached.
 */
const ReleaseGroup = Schema.Literal("album", "single");
const RepeatState = Schema.Literal("track", "context", "off");
const TrackArray = mutArray(SpotifyTrackSchema);

// Shared error union for every Spotify-touching function. Confect encodes these
// into a `ConvexError` the client can read (vs orDie's opaque UnknownException).
// A 401/expired token → `SpotifyAuthRequired` ("Reconnect Spotify"); anything
// else → `SpotifyUnavailable`. Loaders carry it too so the typed failure
// survives the action-cache `runAction` boundary back to the public action.
const SpotifyError = Schema.Union(SpotifyAuthRequired, SpotifyUnavailable);

export const spotify = GroupSpec.make("spotify")
  // ── search ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "search",
      args: Schema.Struct({ query: Schema.String }),
      returns: SpotifySearchResultsSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "searchTracks",
      args: Schema.Struct({ query: Schema.String }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadSearchResults",
      args: Schema.Struct({ query: Schema.String }),
      returns: SpotifySearchResultsSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadSearchTracks",
      args: Schema.Struct({ query: Schema.String }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  // ── artists ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "artistPage",
      args: Schema.Struct({ artistId: Schema.String }),
      returns: Schema.NullOr(SpotifyArtistPageDataSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "artistReleasesPage",
      args: Schema.Struct({
        artistId: Schema.String,
        includeGroups: ReleaseGroup,
        limit: Schema.optional(Schema.Number),
        offset: Schema.optional(Schema.Number),
      }),
      returns: SpotifyAlbumReleasePageSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "topArtists",
      args: Schema.Struct({ limit: Schema.optional(Schema.Number) }),
      returns: mutArray(SpotifyArtistSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "favoriteArtists",
      args: Schema.Struct({
        after: Schema.optional(Schema.String),
        limit: Schema.optional(Schema.Number),
        forceRefresh: Schema.optional(Schema.Boolean),
      }),
      returns: SpotifyFavoriteArtistsPageSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadArtistPage",
      args: Schema.Struct({
        artistId: Schema.String,
        cacheScope: Schema.String,
      }),
      returns: Schema.NullOr(SpotifyArtistPageDataSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadArtistReleasesPage",
      args: Schema.Struct({
        artistId: Schema.String,
        includeGroups: ReleaseGroup,
        limit: Schema.Number,
        offset: Schema.Number,
        cacheScope: Schema.String,
      }),
      returns: SpotifyAlbumReleasePageSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadTopArtists",
      args: Schema.Struct({ limit: Schema.Number, cacheScope: Schema.String }),
      returns: mutArray(SpotifyArtistSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadFavoriteArtists",
      args: Schema.Struct({
        limit: Schema.Number,
        after: Schema.NullOr(Schema.String),
        cacheScope: Schema.String,
      }),
      returns: SpotifyFavoriteArtistsPageSchema,
      error: SpotifyError,
    }),
  )
  // ── albums ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "album",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: Schema.NullOr(SpotifyAlbumDetailsSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "albumTracks",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadAlbum",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: Schema.NullOr(SpotifyAlbumDetailsSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadAlbumTracks",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  // ── recently played ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "recentlyPlayed",
      args: Schema.Struct({
        before: Schema.optional(Schema.Number),
        forceRefresh: Schema.optional(Schema.Boolean),
        limit: Schema.optional(Schema.Number),
      }),
      returns: SpotifyRecentlyPlayedPageResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadRecentlyPlayed",
      args: Schema.Struct({
        before: Schema.NullOr(Schema.Number),
        limit: Schema.Number,
        cacheScope: Schema.String,
      }),
      returns: SpotifyRecentlyPlayedPageResultSchema,
      error: SpotifyError,
    }),
  )
  // ── playlists ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "playlistsPage",
      args: Schema.Struct({
        limit: Schema.optional(Schema.Number),
        offset: Schema.optional(Schema.Number),
        forceRefresh: Schema.optional(Schema.Boolean),
      }),
      returns: SpotifyPlaylistsPageSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playlist",
      args: Schema.Struct({ playlistId: Schema.String }),
      returns: Schema.NullOr(SpotifyPlaylistSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playlistTracks",
      args: Schema.Struct({ playlistId: Schema.String }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadPlaylistsPage",
      args: Schema.Struct({
        limit: Schema.Number,
        offset: Schema.Number,
        cacheScope: Schema.String,
      }),
      returns: SpotifyPlaylistsPageSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadPlaylist",
      args: Schema.Struct({
        playlistId: Schema.String,
        cacheScope: Schema.String,
      }),
      returns: Schema.NullOr(SpotifyPlaylistSchema),
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadPlaylistTracks",
      args: Schema.Struct({
        playlistId: Schema.String,
        cacheScope: Schema.String,
      }),
      returns: TrackArray,
      error: SpotifyError,
    }),
  )
  // ── playback (uncached) ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackCurrentlyPlaying",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackCurrentlyPlayingResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackPlay",
      args: Schema.Struct({
        uri: Schema.String,
        deviceId: Schema.optional(Schema.String),
        offsetMs: Schema.optional(Schema.Number),
      }),
      returns: SpotifyPlaybackResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackResume",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackPause",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackSetRepeat",
      args: Schema.Struct({
        state: RepeatState,
        deviceId: Schema.optional(Schema.String),
      }),
      returns: SpotifyPlaybackResultSchema,
      error: SpotifyError,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackSetVolume",
      args: Schema.Struct({ percent: Schema.Number }),
      returns: SpotifyPlaybackResultSchema,
      error: SpotifyError,
    }),
  )
  // ── cache management ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "clearCache",
      args: Schema.Struct({}),
      returns: Schema.Null,
    }),
  );
