import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer, Option } from "effect";

import api from "./_generated/api";
import { DatabaseReader, DatabaseWriter } from "./_generated/services";

/**
 * `users.upsert`, ported from the plain-Convex version to a native confect
 * Effect handler: the DB is reached via the `DatabaseReader`/`DatabaseWriter`
 * services rather than `ctx.db`. Infra failures (decode/encode) are folded to
 * defects with `orDie` — there's no user-facing failure mode here.
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

      const payload = {
        userId,
        name,
        ...(image !== undefined ? { image } : {}),
      };

      if (Option.isSome(existing)) {
        yield* writer.table("users").patch(existing.value._id, payload);
        return existing.value._id;
      }

      return yield* writer.table("users").insert(payload);
    }).pipe(Effect.orDie),
);

export const users = GroupImpl.make(api, "users").pipe(Layer.provide(upsert));
