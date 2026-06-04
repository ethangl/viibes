import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import { components } from "../convex/_generated/api";
import api from "./_generated/api";
import { ActionCtx } from "./_generated/services";

/**
 * `lastfm.artistDetails`, native confect action. Reads the API key from env and
 * delegates to the relocated lastfm component via the raw action ctx
 * (`ctx.runAction` with the component ref — components need a vanilla ctx).
 */
const artistDetails = FunctionImpl.make(
  api,
  "lastfm",
  "artistDetails",
  ({ artistName, musicBrainzId }) =>
    Effect.gen(function* () {
      const apiKey =
        process.env.LASTFM_API_KEY ?? process.env.LAST_FM_API_KEY ?? null;
      if (!apiKey) return null;

      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(() =>
        ctx.runAction(components.lastfm.artists.artistDetails, {
          apiKey,
          artistName,
          musicBrainzId,
        }),
      );
    }).pipe(Effect.orDie),
);

export const lastfm = GroupImpl.make(api, "lastfm").pipe(
  Layer.provide(artistDetails),
);
