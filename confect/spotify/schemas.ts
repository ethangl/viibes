import { Schema } from "effect";

/**
 * Effect-Schema ports of viibes's `convex/spotify/validators.ts`. These are
 * the `returns` schemas for the confect spotify actions. Translation rules:
 * `v.object`→`Schema.Struct`, `v.union(x, v.null())`→`Schema.NullOr`,
 * `v.array`→`mutArray`, `v.optional`→`Schema.optional`.
 *
 * The decoded types intentionally line up with `./types.ts` (the mappers'
 * output), so a mapped value satisfies the matching schema's encoded form.
 *
 * Arrays use `mutArray` (a MUTABLE array) rather than `Schema.Array` (which is
 * `readonly`): vanilla Convex `v.array` generated mutable `T[]`, and the
 * frontend's local types are mutable, so mutable keeps the client unchanged.
 * (Readonly struct *properties* are assignable to mutable ones in TS, so only
 * arrays need this.)
 */
export const mutArray = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.mutable(Schema.Array(item));

export const SpotifyTrackSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  artist: Schema.String,
  albumName: Schema.String,
  albumImage: Schema.NullOr(Schema.String),
  durationMs: Schema.Number,
});

export const SpotifyArtistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
  followerCount: Schema.Number,
  genres: mutArray(Schema.String),
});

export const SpotifyPlaylistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String),
  owner: Schema.NullOr(Schema.String),
  public: Schema.Boolean,
  trackCount: Schema.Number,
});

export const SpotifyRecentlyPlayedItemSchema = Schema.Struct({
  playedAt: Schema.String,
  track: SpotifyTrackSchema,
});

export const SpotifyAlbumReleaseSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
  releaseDate: Schema.NullOr(Schema.String),
  totalTracks: Schema.Number,
  albumType: Schema.NullOr(Schema.String),
});

export const SpotifyAlbumArtistSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
});

export const SpotifyAlbumDetailsSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
  releaseDate: Schema.NullOr(Schema.String),
  totalTracks: Schema.Number,
  albumType: Schema.NullOr(Schema.String),
  artists: mutArray(SpotifyAlbumArtistSchema),
  tracks: mutArray(SpotifyTrackSchema),
});

const pageSchema = <A, I, R>(item: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    items: mutArray(item),
    offset: Schema.Number,
    limit: Schema.Number,
    total: Schema.Number,
    nextOffset: Schema.NullOr(Schema.Number),
    hasMore: Schema.Boolean,
  });

const cursorPageSchema = <A, I, R, CA, CI, CR>(
  item: Schema.Schema<A, I, R>,
  cursor: Schema.Schema<CA, CI, CR>,
) =>
  Schema.Struct({
    items: mutArray(item),
    limit: Schema.Number,
    total: Schema.Number,
    nextCursor: Schema.NullOr(cursor),
    hasMore: Schema.Boolean,
  });

export const SpotifyFavoriteArtistsPageSchema = cursorPageSchema(
  SpotifyArtistSchema,
  Schema.String,
);

export const SpotifyPlaylistsPageSchema = pageSchema(SpotifyPlaylistSchema);

export const SpotifyAlbumReleasePageSchema = pageSchema(
  SpotifyAlbumReleaseSchema,
);

export const SpotifyRecentlyPlayedPageSchema = cursorPageSchema(
  SpotifyRecentlyPlayedItemSchema,
  Schema.Number,
);

export const SpotifyRecentlyPlayedPageResultSchema = Schema.Struct({
  page: SpotifyRecentlyPlayedPageSchema,
  rateLimited: Schema.Boolean,
});

export const SpotifySearchResultsSchema = Schema.Struct({
  tracks: mutArray(SpotifyTrackSchema),
  artists: mutArray(SpotifyArtistSchema),
});

export const SpotifyArtistPageDataSchema = Schema.Struct({
  artist: SpotifyArtistSchema,
  topTracks: mutArray(SpotifyTrackSchema),
  albums: SpotifyAlbumReleasePageSchema,
  singles: SpotifyAlbumReleasePageSchema,
});

export const SpotifyPlaybackResultSchema = Schema.Struct({
  ok: Schema.Boolean,
  retryAfterSeconds: Schema.optional(Schema.Number),
  status: Schema.Number,
});

const SpotifyPlaybackStateSchema = Schema.NullOr(
  Schema.Struct({
    is_playing: Schema.Boolean,
    progress_ms: Schema.Number,
    item: Schema.NullOr(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        duration_ms: Schema.Number,
        artists: Schema.optional(
          mutArray(Schema.Struct({ name: Schema.String })),
        ),
      }),
    ),
  }),
);

export const SpotifyPlaybackCurrentlyPlayingResultSchema = Schema.Struct({
  retryAfterSeconds: Schema.optional(Schema.Number),
  status: Schema.Number,
  playback: SpotifyPlaybackStateSchema,
});
