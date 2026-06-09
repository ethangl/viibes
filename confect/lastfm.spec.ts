import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { mutArray } from "./schemas";

/** Effect-Schema port of `lastFmArtistMatchValidator` (component result). */
const LastFmArtistMatch = Schema.Struct({
  artistName: Schema.String,
  musicBrainzId: Schema.NullOr(Schema.String),
  resolvedVia: Schema.Literal("musicbrainz_id", "artist_name"),
  lastFmUrl: Schema.NullOr(Schema.String),
  stats: Schema.Struct({
    listeners: Schema.NullOr(Schema.Number),
    playcount: Schema.NullOr(Schema.Number),
  }),
  bio: Schema.Struct({
    summary: Schema.NullOr(Schema.String),
    published: Schema.NullOr(Schema.String),
  }),
  topTags: mutArray(
    Schema.Struct({ name: Schema.String, url: Schema.NullOr(Schema.String) }),
  ),
  similarArtists: mutArray(
    Schema.Struct({
      name: Schema.String,
      musicBrainzId: Schema.NullOr(Schema.String),
      url: Schema.NullOr(Schema.String),
    }),
  ),
});

/** Native confect action over the relocated lastfm component. */
export const lastfm = GroupSpec.make("lastfm").addFunction(
  FunctionSpec.publicAction({
    name: "artistDetails",
    args: Schema.Struct({
      artistName: Schema.NullOr(Schema.String),
      musicBrainzId: Schema.NullOr(Schema.String),
    }),
    returns: Schema.NullOr(LastFmArtistMatch),
  }),
);
