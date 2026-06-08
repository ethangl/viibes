import { GenericId } from "@confect/core";
import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

const QueueItemId = GenericId.GenericId("roomQueueItems");

/** The two providers we can resolve a canonical track into today. */
export const PlaybackProvider = Schema.Literal("spotify", "apple");

const ProviderHints = Schema.Struct({
  apple: Schema.optional(Schema.NullOr(Schema.String)),
  spotify: Schema.optional(Schema.NullOr(Schema.String)),
});

/** Inputs the resolver needs from a queue item (internal read). */
const QueueItemResolutionInputs = Schema.Struct({
  isrc: Schema.NullOr(Schema.String),
  trackId: Schema.String,
  providerHints: ProviderHints,
});

/**
 * Server-side track resolution. `resolveTrack` turns a queue item + a provider
 * into that provider's track id (or null when unavailable), caching the result
 * onto the row's `providerHints` so one lookup serves everyone in the room. The
 * query/mutation are internal helpers the action orchestrates across the
 * action → query/mutation boundary.
 */
export const playback = GroupSpec.make("playback")
  .addFunction(
    FunctionSpec.internalQuery({
      name: "queueItemResolutionInputs",
      args: Schema.Struct({ queueItemId: QueueItemId }),
      returns: Schema.NullOr(QueueItemResolutionInputs),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "cacheProviderHint",
      args: Schema.Struct({
        queueItemId: QueueItemId,
        provider: PlaybackProvider,
        providerTrackId: Schema.NullOr(Schema.String),
      }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.publicAction({
      name: "resolveTrack",
      args: Schema.Struct({
        queueItemId: QueueItemId,
        provider: PlaybackProvider,
      }),
      returns: Schema.NullOr(Schema.String),
    }),
  )
  .addFunction(
    // The Apple developer token MusicKit JS needs client-side to configure.
    // Auth-gated so it isn't baked into the public bundle; null when unset.
    FunctionSpec.publicAction({
      name: "appleDeveloperToken",
      args: Schema.Struct({}),
      returns: Schema.NullOr(Schema.String),
    }),
  );
