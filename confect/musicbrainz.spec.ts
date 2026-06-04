import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

/** Effect-Schema port of `musicBrainzArtistMatchValidator` (component result). */
const MusicBrainzArtistMatch = Schema.Struct({
  spotifyArtistId: Schema.String,
  spotifyUrl: Schema.String,
  resolvedVia: Schema.Literal("spotify_url"),
  matchCount: Schema.Number,
  artist: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    sortName: Schema.NullOr(Schema.String),
    type: Schema.NullOr(Schema.String),
    country: Schema.NullOr(Schema.String),
    disambiguation: Schema.NullOr(Schema.String),
    spotifyUrl: Schema.String,
    musicBrainzUrl: Schema.String,
  }),
  links: Schema.Struct({
    homepage: Schema.NullOr(Schema.String),
    instagram: Schema.NullOr(Schema.String),
    youtube: Schema.NullOr(Schema.String),
    bandcamp: Schema.NullOr(Schema.String),
  }),
});

/** Native confect actions over the relocated musicbrainz component. */
export const musicbrainz = GroupSpec.make("musicbrainz")
  .addFunction(
    FunctionSpec.publicAction({
      name: "artistBySpotifyId",
      args: Schema.Struct({ spotifyArtistId: Schema.String }),
      returns: Schema.NullOr(MusicBrainzArtistMatch),
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "spotifyArtistIdByMusicBrainzId",
      args: Schema.Struct({ musicBrainzArtistId: Schema.String }),
      returns: Schema.NullOr(Schema.String),
    }),
  );
