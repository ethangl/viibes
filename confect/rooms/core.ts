import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { Clock, Effect, Option, Schema } from "effect";

import { requireAuthUser } from "../../auth/betterAuth";
import type { DataModel, Id } from "../../convex/_generated/dataModel";
import { DatabaseReader } from "../_generated/services";
import { RoomActivityEvents } from "../tables/RoomActivityEvents";
import { RoomMemberships } from "../tables/RoomMemberships";
import { Rooms } from "../tables/Rooms";
import { Users } from "../tables/Users";
import { Unauthorized } from "./errors";

/**
 * Native confect helpers for the rooms group. DB reads go through the
 * `DatabaseReader` service; auth needs the raw Convex ctx (`.auth`), so handlers
 * yield their `QueryCtx`/`MutationCtx` service and pass it to `requireRoomAuth`.
 * Read helpers fold their infra errors (decode/index) to defects with `orDie`,
 * so the only typed error that escapes is the intentional `Unauthorized`.
 * Snapshot builders are pure (ported verbatim, with array copies since confect
 * `Doc` arrays are `readonly` while the return schemas are mutable).
 */
export type RoomCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

// Doc types come from the confect table schemas (what DatabaseReader returns),
// not convex's `Doc` — their optional fields differ under exactOptionalPropertyTypes.
type RoomDoc = Schema.Schema.Type<typeof Rooms.Doc>;
type RoomMembershipDoc = Schema.Schema.Type<typeof RoomMemberships.Doc>;
type RoomActivityEventDoc = Schema.Schema.Type<typeof RoomActivityEvents.Doc>;
type UserDoc = Schema.Schema.Type<typeof Users.Doc>;

export type RoomAuth = { tokenIdentifier: string; userId: string };
export type VisibleRoomContext = {
  auth: RoomAuth;
  room: RoomDoc;
  roleMembership: RoomMembershipDoc | null;
};

// ── Pure snapshot builders ───────────────────────────────────────────────────
export function buildRoomSnapshot(room: RoomDoc) {
  return {
    _id: room._id,
    slug: room.slug,
    name: room.name,
    description: room.description ?? null,
    visibility: room.visibility,
    ownerUserId: room.ownerUserId,
    createdAt: room.createdAt,
    archivedAt: room.archivedAt,
  };
}

export function buildMembershipSnapshot(membership: RoomMembershipDoc | null) {
  if (!membership) return null;
  return {
    _id: membership._id,
    role: membership.role,
    active: membership.active,
    joinedAt: membership.joinedAt,
    leftAt: membership.leftAt,
  };
}

export function buildRoomUserSnapshot(userId: string, user: UserDoc | null) {
  return { userId, name: user?.name ?? userId, image: user?.image ?? null };
}

export function compareRoomUserNames(
  left: { userId: string; name: string },
  right: { userId: string; name: string },
  viewerUserId: string,
) {
  if (left.userId === viewerUserId) return -1;
  if (right.userId === viewerUserId) return 1;
  return left.name.localeCompare(right.name);
}

export function getRoomRoleRank(role: RoomMembershipDoc["role"]) {
  switch (role) {
    case "owner":
      return 0;
    case "moderator":
      return 1;
    default:
      return 2;
  }
}

export function isModeratorRole(roleMembership: RoomMembershipDoc | null) {
  return (
    roleMembership?.role === "owner" || roleMembership?.role === "moderator"
  );
}

function buildActivityTrackSnapshot(event: RoomActivityEventDoc) {
  if (
    !event.queueItemId ||
    !event.trackId ||
    !event.trackName ||
    !event.trackArtists ||
    event.trackDurationMs === undefined
  ) {
    throw new Error("Room activity event is missing track metadata.");
  }
  return {
    queueItemId: event.queueItemId,
    trackId: event.trackId,
    trackName: event.trackName,
    trackArtists: [...event.trackArtists],
    trackImageUrl: event.trackImageUrl ?? null,
    trackDurationMs: event.trackDurationMs,
  };
}

export function buildActivityEventSnapshot(
  event: RoomActivityEventDoc,
  actor: ReturnType<typeof buildRoomUserSnapshot> | null,
) {
  const base = {
    _id: event._id,
    roomId: event.roomId,
    createdAt: event.createdAt,
    actor,
  };
  switch (event.kind) {
    case "chat_message":
      return { ...base, kind: "chat_message" as const, body: event.body ?? "" };
    case "user_entered":
      return { ...base, kind: "user_entered" as const };
    case "user_left":
      return { ...base, kind: "user_left" as const };
    case "queue_added":
      return {
        ...base,
        kind: "queue_added" as const,
        track: buildActivityTrackSnapshot(event),
      };
    case "track_started":
      return {
        ...base,
        kind: "track_started" as const,
        track: buildActivityTrackSnapshot(event),
      };
  }
}

// ── Auth (raw ctx) — only typed error in the read paths ──────────────────────
export const requireRoomAuth = (
  ctx: RoomCtx,
): Effect.Effect<RoomAuth, Unauthorized> =>
  Effect.gen(function* () {
    const identity = yield* Effect.promise(() => ctx.auth.getUserIdentity());
    if (!identity) {
      return yield* Effect.fail(new Unauthorized());
    }
    const user = yield* Effect.tryPromise({
      try: () => requireAuthUser(ctx),
      catch: () => new Unauthorized(),
    });
    const userId =
      typeof user.userId === "string" && user.userId.length > 0
        ? user.userId
        : String(user._id);
    return { tokenIdentifier: identity.tokenIdentifier, userId };
  });

// ── Read helpers (infra errors → defects) ────────────────────────────────────
const roomDocById = (id: Id<"rooms">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const room = yield* reader
      .table("rooms")
      .get(id)
      .pipe(
        Effect.map(Option.some),
        Effect.catchTag("GetByIdFailure", () => Effect.succeedNone),
      );
    return Option.flatMap(room, (r) =>
      r.archivedAt !== null ? Option.none<RoomDoc>() : Option.some(r),
    );
  }).pipe(Effect.orDie);

const roomBySlug = (slug: string) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const room = yield* reader
      .table("rooms")
      .index("by_slug", (q) => q.eq("slug", slug))
      .first();
    return Option.flatMap(room, (r) =>
      r.archivedAt !== null ? Option.none<RoomDoc>() : Option.some(r),
    );
  }).pipe(Effect.orDie);

export const getActiveMembership = (
  roomId: Id<"rooms">,
  tokenIdentifier: string,
) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomMemberships")
      .index("by_roomId_and_userTokenIdentifier_and_active", (q) =>
        q
          .eq("roomId", roomId)
          .eq("userTokenIdentifier", tokenIdentifier)
          .eq("active", true),
      )
      .first();
  }).pipe(Effect.orDie);

export const getRoomFollow = (roomId: Id<"rooms">, userId: string) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomFollows")
      .index("by_roomId_and_userId", (q) =>
        q.eq("roomId", roomId).eq("userId", userId),
      )
      .first();
  }).pipe(Effect.orDie);

export const getUsersByUserId = (userIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const uniqueUserIds = [...new Set(userIds)];
    const users = yield* Effect.forEach(uniqueUserIds, (userId) =>
      reader
        .table("users")
        .index("by_userId", (q) => q.eq("userId", userId))
        .first()
        .pipe(Effect.map(Option.getOrNull)),
    );
    return new Map(uniqueUserIds.map((userId, i) => [userId, users[i] ?? null]));
  }).pipe(Effect.orDie);

export const getVisibleRoomContext = (
  ctx: RoomCtx,
  roomId: Id<"rooms"> | undefined,
  slug: string | undefined,
) =>
  Effect.gen(function* () {
    const auth = yield* requireRoomAuth(ctx);
    if ((roomId ? 1 : 0) + (slug ? 1 : 0) !== 1) {
      throw new Error("Provide exactly one room identifier.");
    }
    const room = roomId ? yield* roomDocById(roomId) : yield* roomBySlug(slug!);
    if (Option.isNone(room)) return Option.none<VisibleRoomContext>();

    const roleMembership = Option.getOrNull(
      yield* getActiveMembership(room.value._id, auth.tokenIdentifier),
    );
    if (
      room.value.visibility === "private" &&
      room.value.ownerUserTokenIdentifier !== auth.tokenIdentifier &&
      !roleMembership
    ) {
      return Option.none<VisibleRoomContext>();
    }
    return Option.some({ auth, room: room.value, roleMembership });
  });

const ROOM_ACTIVITY_PAGE_SIZE = 100;

// ── Query handlers ───────────────────────────────────────────────────────────
export const listRooms = (ctx: RoomCtx) =>
  Effect.gen(function* () {
    const auth = yield* requireRoomAuth(ctx);
    return yield* Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const publicRooms = yield* reader
        .table("rooms")
        .index("by_visibility_and_archivedAt", (q) =>
          q.eq("visibility", "public").eq("archivedAt", null),
        )
        .collect();
      const roleMemberships = yield* reader
        .table("roomMemberships")
        .index("by_userTokenIdentifier_and_active", (q) =>
          q.eq("userTokenIdentifier", auth.tokenIdentifier).eq("active", true),
        )
        .collect();
      const follows = yield* reader
        .table("roomFollows")
        .index("by_userId", (q) => q.eq("userId", auth.userId))
        .collect();
      const roleRooms = yield* Effect.forEach(roleMemberships, (m) =>
        roomDocById(m.roomId),
      );

      const roomsById = new Map<Id<"rooms">, RoomDoc>();
      for (const room of publicRooms) roomsById.set(room._id, room);
      for (const room of roleRooms) {
        if (Option.isSome(room)) roomsById.set(room.value._id, room.value);
      }
      const roleMembershipsByRoomId = new Map(
        roleMemberships.map((m) => [m.roomId, m]),
      );
      const followedRoomIds = new Set(follows.map((f) => f.roomId));

      return [...roomsById.values()].map((room) => ({
        room: buildRoomSnapshot(room),
        viewerFollowsRoom: followedRoomIds.has(room._id),
        viewerMembership: buildMembershipSnapshot(
          roleMembershipsByRoomId.get(room._id) ?? null,
        ),
      }));
    }).pipe(Effect.orDie);
  });

export const listRoomActivity = (
  ctx: RoomCtx,
  args: { roomId: Id<"rooms">; since: number; limit?: number | undefined },
) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, undefined);
    if (Option.isNone(context)) {
      return [] as ReturnType<typeof buildActivityEventSnapshot>[];
    }
    return yield* Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const now = yield* Clock.currentTimeMillis;
      const limit = Math.max(
        1,
        Math.min(Math.trunc(args.limit ?? ROOM_ACTIVITY_PAGE_SIZE), ROOM_ACTIVITY_PAGE_SIZE),
      );
      const since = Number.isFinite(args.since) ? args.since : now;
      const events = yield* reader
        .table("roomActivityEvents")
        .index(
          "by_roomId_and_createdAt",
          (q) => q.eq("roomId", context.value.room._id).gt("createdAt", since),
          "asc",
        )
        .take(limit);
      const actorUserIds = events.flatMap((e) =>
        e.actorUserId ? [e.actorUserId] : [],
      );
      const usersByUserId = yield* getUsersByUserId(actorUserIds);
      return events.map((event) =>
        buildActivityEventSnapshot(
          event,
          event.actorUserId
            ? buildRoomUserSnapshot(
                event.actorUserId,
                usersByUserId.get(event.actorUserId) ?? null,
              )
            : null,
        ),
      );
    }).pipe(Effect.orDie);
  });
