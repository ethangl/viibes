import { FunctionImpl, GroupImpl } from "@confect/server";
import {
  anyApi,
  type FunctionReference,
} from "convex/server";
import { Effect, Layer, Option } from "effect";

import type { Id } from "../convex/_generated/dataModel";
import api from "./_generated/api";
import { ActionCtx, DatabaseReader, DatabaseWriter } from "./_generated/services";
import { lookupAppleSongIdByIsrc } from "./applemusic/catalog";
import {
  chooseResolution,
  type PlaybackProviderId,
  type ProviderHints,
} from "./playback/resolution";

interface ResolutionInputsWire {
  isrc: string | null;
  trackId: string;
  providerHints: ProviderHints;
}

// ── Internal function references (anyApi paths cast; matches spotify.impl) ─────
const r = anyApi.playback;
const inputsRef = r.queueItemResolutionInputs as FunctionReference<
  "query",
  "internal",
  { queueItemId: Id<"roomQueueItems"> },
  ResolutionInputsWire | null
>;
const cacheRef = r.cacheProviderHint as FunctionReference<
  "mutation",
  "internal",
  {
    queueItemId: Id<"roomQueueItems">;
    provider: PlaybackProviderId;
    providerTrackId: string | null;
  },
  null
>;

const requireIdentity = async (ctx: ActionCtx) => {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Unauthorized");
  }
  return identity;
};

const readQueueItem = (queueItemId: Id<"roomQueueItems">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomQueueItems")
      .get(queueItemId)
      .pipe(
        Effect.map(Option.some),
        Effect.catchTag("GetByIdFailure", () => Effect.succeedNone),
      );
  });

const queueItemResolutionInputs = FunctionImpl.make(
  api,
  "playback",
  "queueItemResolutionInputs",
  ({ queueItemId }) =>
    Effect.gen(function* () {
      const item = yield* readQueueItem(queueItemId);
      if (Option.isNone(item)) return null;
      return {
        isrc: item.value.isrc ?? null,
        trackId: item.value.trackId,
        providerHints: item.value.providerHints ?? {},
      };
    }).pipe(Effect.orDie),
);

const cacheProviderHint = FunctionImpl.make(
  api,
  "playback",
  "cacheProviderHint",
  ({ queueItemId, provider, providerTrackId }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const item = yield* readQueueItem(queueItemId);
      if (Option.isNone(item)) return null;

      const nextHints: ProviderHints = { ...(item.value.providerHints ?? {}) };
      nextHints[provider] = providerTrackId;
      yield* writer
        .table("roomQueueItems")
        .patch(queueItemId, { providerHints: nextHints });
      return null;
    }).pipe(Effect.orDie),
);

const resolveTrack = FunctionImpl.make(
  api,
  "playback",
  "resolveTrack",
  ({ queueItemId, provider }) =>
    Effect.gen(function* () {
      const ctx = yield* ActionCtx;
      return yield* Effect.tryPromise(async () => {
        await requireIdentity(ctx);

        const inputs = await ctx.runQuery(inputsRef, { queueItemId });
        if (!inputs) return null;

        const decision = chooseResolution(provider, {
          isrc: inputs.isrc,
          trackId: inputs.trackId,
          hints: inputs.providerHints,
        });

        switch (decision.kind) {
          case "cached":
            return decision.providerTrackId;
          case "resolved":
            await ctx.runMutation(cacheRef, {
              queueItemId,
              provider,
              providerTrackId: decision.providerTrackId,
            });
            return decision.providerTrackId;
          case "unavailable":
            await ctx.runMutation(cacheRef, {
              queueItemId,
              provider,
              providerTrackId: null,
            });
            return null;
          case "needsAppleFetch": {
            const { configured, songId } = await lookupAppleSongIdByIsrc(
              decision.isrc,
            );
            // Don't poison the cache with a null before credentials exist —
            // only persist a real (configured) lookup result.
            if (!configured) return null;
            await ctx.runMutation(cacheRef, {
              queueItemId,
              provider: "apple",
              providerTrackId: songId,
            });
            return songId;
          }
        }
      });
    }).pipe(Effect.orDie),
);

export const playback = GroupImpl.make(api, "playback").pipe(
  Layer.provide(queueItemResolutionInputs),
  Layer.provide(cacheProviderHint),
  Layer.provide(resolveTrack),
);
