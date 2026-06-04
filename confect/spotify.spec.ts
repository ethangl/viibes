import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

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
 * The Spotify group, ported from `convex/spotify.ts` + `convex/spotify/*`.
 * Each cached read is a PUBLIC action that delegates to the
 * `@convex-dev/action-cache` component, which on a miss runs the matching
 * INTERNAL `load*` action. Internal actions run the pure-Effect request loop
 * (`auth-loop/`) with live layers. Playback commands are uncached.
 */
const ReleaseGroup = Schema.Literal("album", "single");
const RepeatState = Schema.Literal("track", "context", "off");
const TrackArray = mutArray(SpotifyTrackSchema);

export const spotify = GroupSpec.make("spotify")
  // ── search ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "search",
      args: Schema.Struct({ query: Schema.String }),
      returns: SpotifySearchResultsSchema,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "searchTracks",
      args: Schema.Struct({ query: Schema.String }),
      returns: TrackArray,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadSearchResults",
      args: Schema.Struct({ query: Schema.String }),
      returns: SpotifySearchResultsSchema,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadSearchTracks",
      args: Schema.Struct({ query: Schema.String }),
      returns: TrackArray,
    }),
  )
  // ── artists ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "artistPage",
      args: Schema.Struct({ artistId: Schema.String }),
      returns: Schema.NullOr(SpotifyArtistPageDataSchema),
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
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "topArtists",
      args: Schema.Struct({ limit: Schema.optional(Schema.Number) }),
      returns: mutArray(SpotifyArtistSchema),
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
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadTopArtists",
      args: Schema.Struct({ limit: Schema.Number, cacheScope: Schema.String }),
      returns: mutArray(SpotifyArtistSchema),
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
    }),
  )
  // ── albums ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "album",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: Schema.NullOr(SpotifyAlbumDetailsSchema),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "albumTracks",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: TrackArray,
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadAlbum",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: Schema.NullOr(SpotifyAlbumDetailsSchema),
    }),
  )
  .addFunction(
    FunctionSpec.internalAction({
      name: "loadAlbumTracks",
      args: Schema.Struct({ albumId: Schema.String }),
      returns: TrackArray,
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
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playlist",
      args: Schema.Struct({ playlistId: Schema.String }),
      returns: Schema.NullOr(SpotifyPlaylistSchema),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playlistTracks",
      args: Schema.Struct({ playlistId: Schema.String }),
      returns: TrackArray,
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
    }),
  )
  // ── playback (uncached) ──
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackCurrentlyPlaying",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackCurrentlyPlayingResultSchema,
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
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackResume",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackResultSchema,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackPause",
      args: Schema.Struct({}),
      returns: SpotifyPlaybackResultSchema,
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
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "playbackSetVolume",
      args: Schema.Struct({ percent: Schema.Number }),
      returns: SpotifyPlaybackResultSchema,
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
