import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { QueryCtx } from "./_generated/services";
import { listRoomActivity, listRooms } from "./rooms/core";
import {
  clearQueue,
  create,
  enqueueTrack,
  enqueueTracks,
  follow,
  get,
  moveQueueItem,
  pause,
  play,
  recordCurrentTrackStarted,
  removeQueueItem,
  resume,
  sendChatMessage,
  skip,
  unfollow,
} from "./rooms";

// Native confect handlers (yield the ctx service, delegate to the Effect core).
const list = FunctionImpl.make(api, "rooms", "list", () =>
  Effect.gen(function* () {
    const ctx = yield* QueryCtx;
    return yield* listRooms(ctx);
  }),
);

const listActivity = FunctionImpl.make(api, "rooms", "listActivity", (args) =>
  Effect.gen(function* () {
    const ctx = yield* QueryCtx;
    return yield* listRoomActivity(ctx, args);
  }),
);

// Remaining functions are still plain Convex values (impl = the function value).
const fns = Layer.mergeAll(
  list,
  listActivity,
  FunctionImpl.make(api, "rooms", "get", get),
  FunctionImpl.make(api, "rooms", "create", create),
  FunctionImpl.make(api, "rooms", "follow", follow),
  FunctionImpl.make(api, "rooms", "unfollow", unfollow),
  FunctionImpl.make(api, "rooms", "sendChatMessage", sendChatMessage),
  FunctionImpl.make(
    api,
    "rooms",
    "recordCurrentTrackStarted",
    recordCurrentTrackStarted,
  ),
  FunctionImpl.make(api, "rooms", "enqueueTrack", enqueueTrack),
  FunctionImpl.make(api, "rooms", "enqueueTracks", enqueueTracks),
  FunctionImpl.make(api, "rooms", "removeQueueItem", removeQueueItem),
  FunctionImpl.make(api, "rooms", "moveQueueItem", moveQueueItem),
  FunctionImpl.make(api, "rooms", "clearQueue", clearQueue),
  FunctionImpl.make(api, "rooms", "play", play),
  FunctionImpl.make(api, "rooms", "pause", pause),
  FunctionImpl.make(api, "rooms", "resume", resume),
  FunctionImpl.make(api, "rooms", "skip", skip),
);

export const rooms = GroupImpl.make(api, "rooms").pipe(Layer.provide(fns));
