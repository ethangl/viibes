import { FunctionImpl, GroupImpl } from "@confect/server";
import { Clock, Effect, Layer, Option } from "effect";

import api from "./_generated/api";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";

/**
 * Implementations for the internal cooldown functions. Mirrors viibes's
 * `convex/spotifyAuthCooldown.ts`. DB failures are folded to defects with
 * `Effect.orDie` (these functions declare no typed error channel).
 */

/** The raw cooldown row for a key, as an `Option<Doc>`. */
const findByKey = (key: string) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("spotifyAuthCooldowns")
      .index("by_key", (q) => q.eq("key", key))
      .first();
  });

const set = FunctionImpl.make(
  api,
  "spotifyAuthCooldown",
  "set",
  ({ key, expiresAt, retryAfterSeconds }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const existing = yield* findByKey(key);

      yield* Option.match(existing, {
        onNone: () =>
          writer
            .table("spotifyAuthCooldowns")
            .insert({ key, expiresAt, retryAfterSeconds }),
        onSome: (doc) =>
          writer
            .table("spotifyAuthCooldowns")
            .patch(doc._id, { expiresAt, retryAfterSeconds }),
      });

      return null;
    }).pipe(Effect.orDie),
);

const get = FunctionImpl.make(api, "spotifyAuthCooldown", "get", ({ key }) =>
  Effect.gen(function* () {
    const existing = yield* findByKey(key);
    // Real time (opts out of query caching) — matches the original, which read
    // `Date.now()`. A bare `Date.now()` here would return 0.
    const now = yield* Clock.currentTimeMillis;

    if (Option.isNone(existing) || existing.value.expiresAt <= now) {
      return null;
    }

    return {
      expiresAt: existing.value.expiresAt,
      retryAfterSeconds: existing.value.retryAfterSeconds,
    };
  }).pipe(Effect.orDie),
);

const clear = FunctionImpl.make(
  api,
  "spotifyAuthCooldown",
  "clear",
  ({ key }) =>
    Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const existing = yield* findByKey(key);

      yield* Option.match(existing, {
        onNone: () => Effect.void,
        onSome: (doc) => writer.table("spotifyAuthCooldowns").delete(doc._id),
      });

      return null;
    }).pipe(Effect.orDie),
);

export const spotifyAuthCooldown = GroupImpl.make(
  api,
  "spotifyAuthCooldown",
).pipe(Layer.provide(set), Layer.provide(get), Layer.provide(clear));
