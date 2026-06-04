import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { MutationCtx, QueryCtx } from "./_generated/services";
import {
  clearQueue,
  createRoom,
  enqueueTrack,
  enqueueTracks,
  followRoom,
  getRoomDetails,
  listRoomActivity,
  listRooms,
  moveQueueItem,
  pause,
  play,
  recordCurrentTrackStarted,
  removeQueueItem,
  resume,
  sendChatMessage,
  skip,
  unfollowRoom,
} from "./rooms/core";

// Native confect handlers — yield the ctx service and delegate to the Effect
// core in `rooms/core.ts` (reads via DatabaseReader, writes via DatabaseWriter).
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

const get = FunctionImpl.make(api, "rooms", "get", (args) =>
  Effect.gen(function* () {
    const ctx = yield* QueryCtx;
    return yield* getRoomDetails(ctx, args);
  }),
);

const create = FunctionImpl.make(api, "rooms", "create", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* createRoom(ctx, args);
  }),
);

const follow = FunctionImpl.make(api, "rooms", "follow", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* followRoom(ctx, args);
  }),
);

const unfollow = FunctionImpl.make(api, "rooms", "unfollow", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* unfollowRoom(ctx, args);
  }),
);

const sendChat = FunctionImpl.make(api, "rooms", "sendChatMessage", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* sendChatMessage(ctx, args);
  }),
);

const recordTrackStarted = FunctionImpl.make(
  api,
  "rooms",
  "recordCurrentTrackStarted",
  (args) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;
      return yield* recordCurrentTrackStarted(ctx, args);
    }),
);

const enqueueTrack_ = FunctionImpl.make(api, "rooms", "enqueueTrack", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* enqueueTrack(ctx, args);
  }),
);

const enqueueTracks_ = FunctionImpl.make(
  api,
  "rooms",
  "enqueueTracks",
  (args) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;
      return yield* enqueueTracks(ctx, args);
    }),
);

const removeQueueItem_ = FunctionImpl.make(
  api,
  "rooms",
  "removeQueueItem",
  (args) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;
      return yield* removeQueueItem(ctx, args);
    }),
);

const moveQueueItem_ = FunctionImpl.make(
  api,
  "rooms",
  "moveQueueItem",
  (args) =>
    Effect.gen(function* () {
      const ctx = yield* MutationCtx;
      return yield* moveQueueItem(ctx, args);
    }),
);

const clearQueue_ = FunctionImpl.make(api, "rooms", "clearQueue", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* clearQueue(ctx, args);
  }),
);

const play_ = FunctionImpl.make(api, "rooms", "play", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* play(ctx, args);
  }),
);

const pause_ = FunctionImpl.make(api, "rooms", "pause", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* pause(ctx, args);
  }),
);

const resume_ = FunctionImpl.make(api, "rooms", "resume", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* resume(ctx, args);
  }),
);

const skip_ = FunctionImpl.make(api, "rooms", "skip", (args) =>
  Effect.gen(function* () {
    const ctx = yield* MutationCtx;
    return yield* skip(ctx, args);
  }),
);

const fns = Layer.mergeAll(
  list,
  listActivity,
  get,
  create,
  follow,
  unfollow,
  sendChat,
  recordTrackStarted,
  enqueueTrack_,
  enqueueTracks_,
  removeQueueItem_,
  moveQueueItem_,
  clearQueue_,
  play_,
  pause_,
  resume_,
  skip_,
);

export const rooms = GroupImpl.make(api, "rooms").pipe(Layer.provide(fns));
