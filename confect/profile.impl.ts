import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer, Option } from "effect";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";

/** `profile.get`, a native confect Effect query over DatabaseReader. */
const get = FunctionImpl.make(
  api,
  "profile",
  "get",
  ({ userId, fallbackName, fallbackImage }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const existing = yield* reader
        .table("users")
        .index("by_userId", (q) => q.eq("userId", userId))
        .first();
      const user = Option.getOrNull(existing);

      const profileUser = user
        ? { id: user.userId, name: user.name, image: user.image ?? null }
        : fallbackName
          ? { id: userId, name: fallbackName, image: fallbackImage ?? null }
          : null;

      return profileUser ? { user: profileUser } : null;
    }).pipe(Effect.orDie),
);

export const profile = GroupImpl.make(api, "profile").pipe(Layer.provide(get));
