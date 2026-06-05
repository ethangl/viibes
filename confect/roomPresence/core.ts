import { Presence } from "@convex-dev/presence";
import type { GenericMutationCtx } from "convex/server";
import { Clock, Effect, Option, Schema } from "effect";

import { components } from "../../convex/_generated/api";
import type { DataModel, Id } from "../../convex/_generated/dataModel";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import {
  getVisibleRoomContext,
  insertRoomPresenceActivity,
} from "../rooms/core";
import { RoomNotFound } from "../rooms/errors";
import { RoomPresenceSessions } from "../tables/RoomPresenceSessions";

/**
 * Native confect presence handlers. The `@convex-dev/presence` component is
 * driven through the raw Convex
 * `MutationCtx` (its API needs `ctx`); our own `roomPresenceSessions` tracking
 * goes through `DatabaseReader`/`DatabaseWriter`. Reuses the native
 * `getVisibleRoomContext`/`insertRoomPresenceActivity` from `rooms/core`.
 */
type PresenceCtx = GenericMutationCtx<DataModel>;
type RoomPresenceSessionDoc = Schema.Schema.Type<
  typeof RoomPresenceSessions.Doc
>;

const roomPresence = new Presence<string, string>(components.presence);

const getActiveTrackedPresenceSessions = (
  roomId: Id<"rooms">,
  userId: string,
) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomPresenceSessions")
      .index("by_roomId_and_userId_and_leftAt", (q) =>
        q.eq("roomId", roomId).eq("userId", userId).eq("leftAt", null),
      )
      .collect();
  }).pipe(Effect.orDie);

const getTrackedPresenceSession = (
  roomId: Id<"rooms">,
  userId: string,
  sessionId: string,
) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomPresenceSessions")
      .index("by_roomId_and_userId_and_sessionId", (q) =>
        q.eq("roomId", roomId).eq("userId", userId).eq("sessionId", sessionId),
      )
      .first();
  }).pipe(Effect.orDie);

const isUserOnlineInRoom = (
  ctx: PresenceCtx,
  roomId: Id<"rooms">,
  userId: string,
) =>
  Effect.promise(() => roomPresence.listRoom(ctx, roomId, true)).pipe(
    Effect.map((onlineUsers) =>
      onlineUsers.some((onlineUser) => onlineUser.userId === userId),
    ),
  );

const closeTrackedPresenceSessions = (
  sessions: readonly RoomPresenceSessionDoc[],
  leftAt: number,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    for (const session of sessions) {
      if (session.leftAt !== null) continue;
      yield* writer.table("roomPresenceSessions").patch(session._id, { leftAt });
    }
  }).pipe(Effect.orDie);

export const presenceHeartbeat = (
  ctx: PresenceCtx,
  args: { roomId: Id<"rooms">; sessionId: string; interval: number },
) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, undefined);
    if (Option.isNone(context)) return yield* Effect.fail(new RoomNotFound());
    const { room, auth } = context.value;

    const now = yield* Clock.currentTimeMillis;
    const trackedSession = Option.getOrNull(
      yield* getTrackedPresenceSession(room._id, auth.userId, args.sessionId),
    );
    const isSilentResume = trackedSession?.leftAt === null;
    const wasOnline = yield* isUserOnlineInRoom(ctx, room._id, auth.userId);
    if (!wasOnline && !isSilentResume) {
      yield* closeTrackedPresenceSessions(
        yield* getActiveTrackedPresenceSessions(room._id, auth.userId),
        now,
      );
    }

    const result = yield* Effect.promise(() =>
      roomPresence.heartbeat(
        ctx,
        room._id,
        auth.userId,
        args.sessionId,
        args.interval,
      ),
    );

    if (!trackedSession) {
      yield* Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        yield* writer.table("roomPresenceSessions").insert({
          roomId: room._id,
          userId: auth.userId,
          userTokenIdentifier: auth.tokenIdentifier,
          sessionId: args.sessionId,
          sessionToken: result.sessionToken,
          enteredAt: now,
          leftAt: null,
        });
      }).pipe(Effect.orDie);
    } else if (
      trackedSession.sessionToken !== result.sessionToken ||
      trackedSession.leftAt !== null
    ) {
      yield* Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        yield* writer.table("roomPresenceSessions").patch(trackedSession._id, {
          sessionToken: result.sessionToken,
          leftAt: null,
        });
      }).pipe(Effect.orDie);
    }

    const activeSessions = yield* getActiveTrackedPresenceSessions(
      room._id,
      auth.userId,
    );
    if (!wasOnline && !isSilentResume && activeSessions.length === 1) {
      yield* insertRoomPresenceActivity({
        roomId: room._id,
        actor: auth,
        kind: "user_entered",
        createdAt: now,
        sessionToken: result.sessionToken,
      });
    }

    return result;
  });

export const presenceDisconnect = (
  ctx: PresenceCtx,
  args: { sessionToken: string },
) =>
  Effect.gen(function* () {
    const trackedSession = Option.getOrNull(
      yield* Effect.gen(function* () {
        const reader = yield* DatabaseReader;
        return yield* reader
          .table("roomPresenceSessions")
          .index("by_sessionToken", (q) =>
            q.eq("sessionToken", args.sessionToken),
          )
          .first();
      }).pipe(Effect.orDie),
    );
    const wasOnline =
      trackedSession?.leftAt === null
        ? yield* isUserOnlineInRoom(
            ctx,
            trackedSession.roomId,
            trackedSession.userId,
          )
        : false;

    const result = yield* Effect.promise(() =>
      roomPresence.disconnect(ctx, args.sessionToken),
    );

    if (!trackedSession || trackedSession.leftAt !== null) return result;

    const now = yield* Clock.currentTimeMillis;
    yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      yield* writer.table("roomPresenceSessions").patch(trackedSession._id, {
        leftAt: now,
      });
    }).pipe(Effect.orDie);
    const isOnline = yield* isUserOnlineInRoom(
      ctx,
      trackedSession.roomId,
      trackedSession.userId,
    );

    if (wasOnline && !isOnline) {
      yield* insertRoomPresenceActivity({
        roomId: trackedSession.roomId,
        actor: {
          tokenIdentifier: trackedSession.userTokenIdentifier,
          userId: trackedSession.userId,
        },
        kind: "user_left",
        createdAt: now,
        sessionToken: trackedSession.sessionToken,
      });
    }

    return result;
  });
