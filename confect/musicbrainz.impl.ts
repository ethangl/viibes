import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import { components } from "../convex/_generated/api";
import api from "./_generated/api";
import { ActionCtx } from "./_generated/services";

/** Native confect actions delegating to the relocated musicbrainz component. */
const artistBySpotifyId = FunctionImpl.make(
  api,
  "musicbrainz",
  "artistBySpotifyId",
  ({ spotifyArtistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(() =>
        ctx.runAction(components.musicbrainz.artists.artistBySpotifyId, {
          spotifyArtistId,
        }),
      );
    }).pipe(Effect.orDie),
);

const spotifyArtistIdByMusicBrainzId = FunctionImpl.make(
  api,
  "musicbrainz",
  "spotifyArtistIdByMusicBrainzId",
  ({ musicBrainzArtistId }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(() =>
        ctx.runAction(
          components.musicbrainz.artists.spotifyArtistIdByMusicBrainzId,
          { musicBrainzArtistId },
        ),
      );
    }).pipe(Effect.orDie),
);

export const musicbrainz = GroupImpl.make(api, "musicbrainz").pipe(
  Layer.provide(artistBySpotifyId),
  Layer.provide(spotifyArtistIdByMusicBrainzId),
);
