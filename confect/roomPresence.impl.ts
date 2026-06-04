import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { MutationCtx } from "./_generated/services";
import { presenceDisconnect, presenceHeartbeat } from "./roomPresence/core";

const heartbeat = FunctionImpl.make(api, "roomPresence", "heartbeat", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* presenceHeartbeat(ctx, args);
  }),
);

const disconnect = FunctionImpl.make(
  api,
  "roomPresence",
  "disconnect",
  (args) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;
      return yield* presenceDisconnect(ctx, args);
    }),
);

export const roomPresence = GroupImpl.make(api, "roomPresence").pipe(
  Layer.provide(Layer.mergeAll(heartbeat, disconnect)),
);
