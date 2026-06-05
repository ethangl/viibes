import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer, Option } from "effect";

import api from "./_generated/api";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";

/**
 * `users.upsert`, a native confect Effect handler: the DB is reached via the
 * `DatabaseReader`/`DatabaseWriter` services rather than `ctx.db`. Infra
 * failures (decode/encode) are folded to defects with `orDie` — there's no
 * user-facing failure mode here.
 */
const upsert = FunctionImpl.make(
  api,
  "users",
  "upsert",
  ({ userId, name, image }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const writer = yield* DatabaseWriter;

      const existing = yield* reader
        .table("users")
        .index("by_userId", (q) => q.eq("userId", userId))
        .first();

      if (Option.isSome(existing)) {
        // Patch includes `image` even when undefined: confect treats an
        // `undefined` value as "remove field", so a sync that no longer has an
        // image clears a previously stored avatar instead of leaving it stale.
        yield* writer.table("users").patch(existing.value._id, {
          userId,
          name,
          image,
        });
        return existing.value._id;
      }

      // Insert omits an absent image so the field is absent (not stored as null).
      return yield* writer.table("users").insert({
        userId,
        name,
        ...(image !== undefined ? { image } : {}),
      });
    }).pipe(Effect.orDie),
);

export const users = GroupImpl.make(api, "users").pipe(Layer.provide(upsert));
