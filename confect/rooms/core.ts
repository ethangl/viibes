import { Presence } from "@convex-dev/presence";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { Clock, Effect, Option, Schema } from "effect";

import { requireAuthUser } from "../../auth/betterAuth";
import { components } from "../../convex/_generated/api";
import type { DataModel, Id } from "../../convex/_generated/dataModel";
import {
  moveRoomQueueItemIds,
  normalizeRoomPlaybackForContinuousStream,
  resolveRoomPlaybackState,
} from "../../shared/rooms-state";
import { DatabaseReader, DatabaseWriter } from "../_generated/services";
import { RoomActivityEvents } from "../tables/RoomActivityEvents";
import { RoomMemberships } from "../tables/RoomMemberships";
import { RoomPlaybackStates } from "../tables/RoomPlaybackStates";
import { RoomQueueItems } from "../tables/RoomQueueItems";
import { Rooms } from "../tables/Rooms";
import { Users } from "../tables/Users";
import {
  Conflict,
  Forbidden,
  InvalidInput,
  NotFound,
  RoomNotFound,
  Unauthorized,
} from "./errors";

/**
 * Native confect helpers for the rooms group. DB reads go through the
 * `DatabaseReader` service; auth needs the raw Convex ctx (`.auth`), so handlers
 * yield their `QueryCtx`/`MutationCtx` service and pass it to `requireRoomAuth`.
 * Read helpers fold their infra errors (decode/index) to defects with `orDie`,
 * so the only typed error that escapes is the intentional `Unauthorized`.
 * Snapshot builders are pure (with array copies since confect `Doc` arrays are
 * `readonly` while the return schemas are mutable).
 */
export type RoomCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

// Doc types come from the confect table schemas (what DatabaseReader returns),
// not convex's `Doc` — their optional fields differ under exactOptionalPropertyTypes.
type RoomDoc = Schema.Schema.Type<typeof Rooms.Doc>;
type RoomMembershipDoc = Schema.Schema.Type<typeof RoomMemberships.Doc>;
type RoomActivityEventDoc = Schema.Schema.Type<typeof RoomActivityEvents.Doc>;
type RoomQueueItemDoc = Schema.Schema.Type<typeof RoomQueueItems.Doc>;
type RoomPlaybackStateDoc = Schema.Schema.Type<typeof RoomPlaybackStates.Doc>;
type UserDoc = Schema.Schema.Type<typeof Users.Doc>;

const roomPresence = new Presence<string, string>(components.presence);

export type RoomAuth = {
  tokenIdentifier: string;
  userId: string;
  /** True for guest (anonymous) sessions — gated out of account-only actions. */
  isAnonymous: boolean;
};
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

export function buildQueueItemSnapshot(
  queueItem: RoomQueueItemDoc,
  position: number = queueItem.position,
) {
  return {
    _id: queueItem._id,
    roomId: queueItem.roomId,
    position,
    trackId: queueItem.trackId,
    trackName: queueItem.trackName,
    trackArtists: [...queueItem.trackArtists],
    trackImageUrl: queueItem.trackImageUrl ?? null,
    trackDurationMs: queueItem.trackDurationMs,
    addedByUserId: queueItem.addedByUserId,
    addedAt: queueItem.addedAt,
  };
}

function hasStartedRoomPlayback(
  playbackState: Pick<RoomPlaybackStateDoc, "currentQueueItemId" | "startedAt">,
) {
  return (
    playbackState.currentQueueItemId !== null ||
    playbackState.startedAt !== null
  );
}

// Pure playback projection.
export function resolveRoomPlaybackProjection(
  queueItems: readonly RoomQueueItemDoc[],
  playbackState: Pick<
    RoomPlaybackStateDoc,
    "currentQueueItemId" | "startedAt" | "startOffsetMs" | "paused" | "pausedAt"
  >,
  now: number,
) {
  const effectivePlaybackState = normalizeRoomPlaybackForContinuousStream(
    queueItems,
    playbackState,
    now,
  );
  const resolvedPlaybackState = resolveRoomPlaybackState(
    queueItems,
    effectivePlaybackState,
    now,
  );

  if (!hasStartedRoomPlayback(effectivePlaybackState)) {
    return {
      currentQueueItem: null,
      currentQueueItemId: null,
      playedQueueItems: [] as RoomQueueItemDoc[],
      resolvedPlaybackState,
      visibleQueueItems: [...queueItems],
    };
  }

  const currentQueueItemIndex = queueItems.findIndex(
    (queueItem) => queueItem._id === resolvedPlaybackState.currentQueueItemId,
  );

  if (currentQueueItemIndex < 0) {
    return {
      currentQueueItem: null,
      currentQueueItemId: null,
      playedQueueItems: [...queueItems],
      resolvedPlaybackState,
      visibleQueueItems: [] as RoomQueueItemDoc[],
    };
  }

  return {
    currentQueueItem: queueItems[currentQueueItemIndex] ?? null,
    currentQueueItemId: queueItems[currentQueueItemIndex]?._id ?? null,
    playedQueueItems: queueItems.slice(0, currentQueueItemIndex),
    resolvedPlaybackState,
    visibleQueueItems: queueItems.slice(currentQueueItemIndex + 1),
  };
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
    const isAnonymous =
      (user as { isAnonymous?: boolean }).isAnonymous === true;
    return { tokenIdentifier: identity.tokenIdentifier, userId, isAnonymous };
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

export const getActiveQueueItems = (roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomQueueItems")
      .index("by_roomId_and_removedAt_and_position", (q) =>
        q.eq("roomId", roomId).eq("removedAt", null),
      )
      .collect();
  }).pipe(Effect.orDie);

export const getPlaybackStateDoc = (roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const playbackState = yield* reader
      .table("roomPlaybackStates")
      .index("by_roomId", (q) => q.eq("roomId", roomId))
      .first();
    if (Option.isNone(playbackState)) {
      return yield* Effect.die(new Error("Room playback state not found."));
    }
    return playbackState.value;
  }).pipe(Effect.orDie);

export const getActiveRoomMemberships = (roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader
      .table("roomMemberships")
      .index("by_roomId_and_active", (q) =>
        q.eq("roomId", roomId).eq("active", true),
      )
      .collect();
  }).pipe(Effect.orDie);

export const getUsersByUserId = (userIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const uniqueUserIds = [...new Set(userIds)];
    const users = yield* Effect.forEach(
      uniqueUserIds,
      (userId) =>
        reader
          .table("users")
          .index("by_userId", (q) => q.eq("userId", userId))
          .first()
          .pipe(Effect.map(Option.getOrNull)),
      { concurrency: "unbounded" },
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
      // Independent reads — run concurrently (parity with the pre-migration
      // `Promise.all`).
      const [publicRooms, roleMemberships, follows] = yield* Effect.all(
        [
          reader
            .table("rooms")
            .index("by_visibility_and_archivedAt", (q) =>
              q.eq("visibility", "public").eq("archivedAt", null),
            )
            .collect(),
          reader
            .table("roomMemberships")
            .index("by_userTokenIdentifier_and_active", (q) =>
              q
                .eq("userTokenIdentifier", auth.tokenIdentifier)
                .eq("active", true),
            )
            .collect(),
          reader
            .table("roomFollows")
            .index("by_userId", (q) => q.eq("userId", auth.userId))
            .collect(),
        ],
        { concurrency: "unbounded" },
      );
      const roleRooms = yield* Effect.forEach(
        roleMemberships,
        (m) => roomDocById(m.roomId),
        { concurrency: "unbounded" },
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

export const getRoomDetails = (
  ctx: RoomCtx,
  args: { roomId?: Id<"rooms"> | undefined; slug?: string | undefined },
) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, args.slug);
    if (Option.isNone(context)) return null;
    const { auth, room, roleMembership } = context.value;

    const now = yield* Clock.currentTimeMillis;
    // Independent reads — run concurrently (parity with the pre-migration
    // `Promise.all`; serializing them adds round-trips on this hot query).
    const [queueItems, playbackState, activeRoleMemberships, follow] =
      yield* Effect.all(
        [
          getActiveQueueItems(room._id),
          getPlaybackStateDoc(room._id),
          getActiveRoomMemberships(room._id),
          getRoomFollow(room._id, auth.userId),
        ],
        { concurrency: "unbounded" },
      );

    const projection = resolveRoomPlaybackProjection(
      queueItems,
      playbackState,
      now,
    );

    const roleMembershipsByUserId = activeRoleMemberships.reduce<
      Map<string, RoomMembershipDoc>
    >((memberships, membership) => {
      const existingMembership = memberships.get(membership.userId);
      if (
        !existingMembership ||
        getRoomRoleRank(membership.role) <
          getRoomRoleRank(existingMembership.role) ||
        (membership.role === existingMembership.role &&
          membership.joinedAt < existingMembership.joinedAt)
      ) {
        memberships.set(membership.userId, membership);
      }
      return memberships;
    }, new Map());

    const roleHolders = [...roleMembershipsByUserId.values()];
    const presentUsersInRoom = yield* Effect.promise(() =>
      roomPresence.listRoom(ctx, room._id, true),
    );
    const usersByUserId = yield* getUsersByUserId([
      ...roleHolders.map((roleMembership) => roleMembership.userId),
      ...presentUsersInRoom.map((presentUser) => presentUser.userId),
    ]);

    const presentUsers = presentUsersInRoom
      .map((presentUser) =>
        buildRoomUserSnapshot(
          presentUser.userId,
          usersByUserId.get(presentUser.userId) ?? null,
        ),
      )
      .sort((left, right) => compareRoomUserNames(left, right, auth.userId));
    const sortedRoleHolders = roleHolders
      .map((roleMembership) => ({
        ...buildRoomUserSnapshot(
          roleMembership.userId,
          usersByUserId.get(roleMembership.userId) ?? null,
        ),
        role: roleMembership.role,
      }))
      .sort((left, right) => {
        const roleDelta =
          getRoomRoleRank(left.role) - getRoomRoleRank(right.role);
        if (roleDelta !== 0) return roleDelta;
        return compareRoomUserNames(left, right, auth.userId);
      });

    return {
      room: buildRoomSnapshot(room),
      viewerFollowsRoom: Option.isSome(follow),
      viewerMembership: buildMembershipSnapshot(roleMembership),
      memberCount: sortedRoleHolders.length,
      presentCount: presentUsers.length,
      presentUsers,
      roleHolders: sortedRoleHolders,
      queueLength: projection.visibleQueueItems.length,
      queue: projection.visibleQueueItems.map((queueItem, index) =>
        buildQueueItemSnapshot(queueItem, index),
      ),
      playback: {
        currentQueueItemId: projection.currentQueueItemId,
        currentQueueItem: projection.currentQueueItem
          ? buildQueueItemSnapshot(projection.currentQueueItem)
          : null,
        startedAt: projection.currentQueueItem
          ? projection.resolvedPlaybackState.startedAt
          : null,
        startOffsetMs: projection.currentQueueItem
          ? projection.resolvedPlaybackState.startOffsetMs
          : 0,
        paused: projection.currentQueueItem
          ? projection.resolvedPlaybackState.paused
          : true,
        pausedAt: projection.currentQueueItem
          ? projection.resolvedPlaybackState.pausedAt
          : playbackState.pausedAt,
        updatedAt: playbackState.updatedAt,
        canEnqueue: roleMembership !== null,
        canManageQueue: isModeratorRole(roleMembership),
        canControlPlayback: isModeratorRole(roleMembership),
      },
    };
  });

// ── Mutation domain (DatabaseWriter) ─────────────────────────────────────────
const CHAT_MESSAGE_MAX_LENGTH = 1_000;

type RoomActivityActor = { tokenIdentifier: string; userId: string } | null;
type RoomActivityTrackInput = {
  queueItemId: Id<"roomQueueItems">;
  trackId: string;
  trackName: string;
  trackArtists: string[];
  trackImageUrl?: string | null;
  trackDurationMs: number;
};
type NormalizedTrack = {
  trackId: string;
  isrc?: string;
  trackName: string;
  trackArtists: string[];
  trackImageUrl?: string;
  trackDurationMs: number;
};
// ── Pure mutation helpers (validation fails with typed errors) ───────────────
function clampPlaybackOffset(offsetMs: number, durationMs: number) {
  if (!Number.isFinite(offsetMs)) return 0;
  return Math.max(0, Math.min(Math.trunc(offsetMs), Math.max(durationMs - 1, 0)));
}

function slugifyRoomName(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "room";
}

const normalizeQueuedTrack = (input: {
  trackId: string;
  isrc?: string | undefined;
  trackName: string;
  trackArtists: string[];
  trackImageUrl?: string | undefined;
  trackDurationMs: number;
}): Effect.Effect<NormalizedTrack, InvalidInput> =>
  Effect.gen(function* () {
    const trackId = input.trackId.trim();
    const trackName = input.trackName.trim();
    if (!trackId || !trackName) {
      return yield* Effect.fail(
        new InvalidInput({ message: "Tracks need both an id and a name." }),
      );
    }
    if (input.trackDurationMs <= 0) {
      return yield* Effect.fail(
        new InvalidInput({
          message: "Track duration must be greater than zero.",
        }),
      );
    }
    const isrc = input.isrc?.trim().toUpperCase();
    return {
      trackArtists: input.trackArtists,
      trackDurationMs: input.trackDurationMs,
      trackId,
      // Conditional so the field is absent (not `undefined`) when missing —
      // required under exactOptionalPropertyTypes.
      ...(isrc ? { isrc } : {}),
      ...(input.trackImageUrl ? { trackImageUrl: input.trackImageUrl } : {}),
      trackName,
    };
  });

const normalizeChatMessageBody = (
  body: string,
): Effect.Effect<string, InvalidInput> =>
  Effect.gen(function* () {
    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return yield* Effect.fail(
        new InvalidInput({ message: "Write a message before sending it." }),
      );
    }
    if (trimmedBody.length > CHAT_MESSAGE_MAX_LENGTH) {
      return yield* Effect.fail(
        new InvalidInput({
          message: "Keep chat messages under 1,000 characters.",
        }),
      );
    }
    return trimmedBody;
  });

function buildActivityTrackFields(track: RoomActivityTrackInput) {
  return {
    queueItemId: track.queueItemId,
    trackId: track.trackId,
    trackName: track.trackName,
    trackArtists: track.trackArtists,
    ...(track.trackImageUrl ? { trackImageUrl: track.trackImageUrl } : {}),
    trackDurationMs: track.trackDurationMs,
  };
}

function buildActivityTrackFromQueueItem(
  queueItem: RoomQueueItemDoc,
): RoomActivityTrackInput {
  return {
    queueItemId: queueItem._id,
    trackId: queueItem.trackId,
    trackName: queueItem.trackName,
    trackArtists: [...queueItem.trackArtists],
    trackImageUrl: queueItem.trackImageUrl ?? null,
    trackDurationMs: queueItem.trackDurationMs,
  };
}

// ── Auth contexts for write paths (typed RoomNotFound/Forbidden) ─────────────
const getRoomOrThrow = (roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const room = yield* roomDocById(roomId);
    if (Option.isNone(room)) return yield* Effect.fail(new RoomNotFound());
    return room.value;
  });

const requireActiveRoomRoleContext = (ctx: RoomCtx, roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const auth = yield* requireRoomAuth(ctx);
    const room = yield* getRoomOrThrow(roomId);
    const roleMembership = Option.getOrNull(
      yield* getActiveMembership(room._id, auth.tokenIdentifier),
    );
    if (!roleMembership) {
      return yield* Effect.fail(
        new Forbidden({ message: "You need a room role to do that." }),
      );
    }
    return { auth, room, roleMembership };
  });

const requireModeratorContext = (ctx: RoomCtx, roomId: Id<"rooms">) =>
  Effect.gen(function* () {
    const roomRoleContext = yield* requireActiveRoomRoleContext(ctx, roomId);
    if (!isModeratorRole(roomRoleContext.roleMembership)) {
      return yield* Effect.fail(
        new Forbidden({
          message: "Only room owners and moderators can do that.",
        }),
      );
    }
    return roomRoleContext;
  });

const uniqueRoomSlug = (preferredSlug: string) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    let slug = preferredSlug;
    let suffix = 2;
    for (;;) {
      const existing = yield* reader
        .table("rooms")
        .index("by_slug", (q) => q.eq("slug", slug))
        .first();
      if (Option.isNone(existing)) return slug;
      slug = `${preferredSlug}-${suffix}`;
      suffix += 1;
    }
  }).pipe(Effect.orDie);

// ── Write helpers (infra → defects) ──────────────────────────────────────────
const insertRoomActivityEventOnce = (event: {
  roomId: Id<"rooms">;
  kind: "queue_added" | "track_started" | "user_entered" | "user_left";
  createdAt: number;
  actorUserId: string | null;
  actorUserTokenIdentifier: string | null;
  queueItemId?: Id<"roomQueueItems">;
  trackId?: string;
  trackName?: string;
  trackArtists?: string[];
  trackImageUrl?: string;
  trackDurationMs?: number;
  dedupeKey: string;
}) =>
  Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    const writer = yield* DatabaseWriter;
    const existing = yield* reader
      .table("roomActivityEvents")
      .index("by_roomId_and_dedupeKey", (q) =>
        q.eq("roomId", event.roomId).eq("dedupeKey", event.dedupeKey),
      )
      .first();
    if (Option.isSome(existing)) return existing.value._id;
    return yield* writer.table("roomActivityEvents").insert(event);
  }).pipe(Effect.orDie);

const insertQueueAddedActivity = (
  roomId: Id<"rooms">,
  actor: RoomActivityActor,
  track: RoomActivityTrackInput,
  createdAt: number,
) =>
  insertRoomActivityEventOnce({
    roomId,
    kind: "queue_added",
    createdAt,
    actorUserId: actor?.userId ?? null,
    actorUserTokenIdentifier: actor?.tokenIdentifier ?? null,
    ...buildActivityTrackFields(track),
    dedupeKey: `queue_added:${track.queueItemId}`,
  });

const insertTrackStartedActivity = (
  roomId: Id<"rooms">,
  actor: RoomActivityActor,
  track: RoomActivityTrackInput,
  createdAt: number,
) =>
  insertRoomActivityEventOnce({
    roomId,
    kind: "track_started",
    createdAt,
    actorUserId: actor?.userId ?? null,
    actorUserTokenIdentifier: actor?.tokenIdentifier ?? null,
    ...buildActivityTrackFields(track),
    dedupeKey: `track_started:${track.queueItemId}`,
  });

export const insertRoomPresenceActivity = (input: {
  roomId: Id<"rooms">;
  actor: Exclude<RoomActivityActor, null>;
  kind: "user_entered" | "user_left";
  createdAt: number;
  sessionToken: string;
}) =>
  insertRoomActivityEventOnce({
    roomId: input.roomId,
    kind: input.kind,
    createdAt: input.createdAt,
    actorUserId: input.actor.userId,
    actorUserTokenIdentifier: input.actor.tokenIdentifier,
    dedupeKey: `${input.kind}:${input.sessionToken}`,
  });

const insertQueuedTracks = (
  roomId: Id<"rooms">,
  auth: RoomAuth,
  tracks: ReadonlyArray<NormalizedTrack>,
  startPosition: number,
  now: number,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const queueItemIds: Id<"roomQueueItems">[] = [];
    for (const [index, track] of tracks.entries()) {
      const queueItemId = yield* writer.table("roomQueueItems").insert({
        roomId,
        position: startPosition + index,
        trackId: track.trackId,
        ...(track.isrc ? { isrc: track.isrc } : {}),
        trackName: track.trackName,
        trackArtists: track.trackArtists,
        ...(track.trackImageUrl ? { trackImageUrl: track.trackImageUrl } : {}),
        trackDurationMs: track.trackDurationMs,
        addedByUserId: auth.userId,
        addedByUserTokenIdentifier: auth.tokenIdentifier,
        addedAt: now,
        removedAt: null,
      });
      yield* insertQueueAddedActivity(roomId, auth, { queueItemId, ...track }, now);
      queueItemIds.push(queueItemId);
    }
    return queueItemIds;
  }).pipe(Effect.orDie);

const syncRoomPlaybackState = (
  playbackState: RoomPlaybackStateDoc,
  patch: Partial<
    Pick<
      RoomPlaybackStateDoc,
      | "currentQueueItemId"
      | "startedAt"
      | "startOffsetMs"
      | "paused"
      | "pausedAt"
      | "updatedAt"
    >
  >,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    yield* writer.table("roomPlaybackStates").patch(playbackState._id, patch);
  }).pipe(Effect.orDie);

const normalizeQueuePositions = (queueItems: readonly RoomQueueItemDoc[]) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    for (const [index, queueItem] of queueItems.entries()) {
      if (queueItem.position === index) continue;
      yield* writer.table("roomQueueItems").patch(queueItem._id, {
        position: index,
      });
    }
  }).pipe(Effect.orDie);

const compactRoomQueuePlayback = (
  playbackState: RoomPlaybackStateDoc,
  queueItems: readonly RoomQueueItemDoc[],
  now: number,
) =>
  Effect.gen(function* () {
    const writer = yield* DatabaseWriter;
    const projection = resolveRoomPlaybackProjection(
      queueItems,
      playbackState,
      now,
    );

    if (!hasStartedRoomPlayback(playbackState)) {
      return { ...projection, queueItems: [...queueItems] };
    }

    for (const playedQueueItem of projection.playedQueueItems) {
      yield* writer.table("roomQueueItems").patch(playedQueueItem._id, {
        removedAt: now,
      });
    }

    const retainedQueueItems = projection.currentQueueItem
      ? [projection.currentQueueItem, ...projection.visibleQueueItems]
      : [];
    yield* normalizeQueuePositions(retainedQueueItems);

    const desiredCurrentQueueItemId = projection.currentQueueItem?._id ?? null;
    const desiredStartedAt = projection.currentQueueItem
      ? projection.resolvedPlaybackState.startedAt
      : null;
    const desiredStartOffsetMs = projection.currentQueueItem
      ? projection.resolvedPlaybackState.startOffsetMs
      : 0;
    const desiredPaused = projection.currentQueueItem
      ? projection.resolvedPlaybackState.paused
      : true;
    const desiredPausedAt = projection.currentQueueItem
      ? projection.resolvedPlaybackState.pausedAt
      : now;

    if (
      projection.currentQueueItem &&
      playbackState.currentQueueItemId !== desiredCurrentQueueItemId
    ) {
      yield* insertTrackStartedActivity(
        playbackState.roomId,
        null,
        buildActivityTrackFromQueueItem(projection.currentQueueItem),
        desiredStartedAt ?? now,
      );
    }

    if (
      playbackState.currentQueueItemId !== desiredCurrentQueueItemId ||
      playbackState.startedAt !== desiredStartedAt ||
      playbackState.startOffsetMs !== desiredStartOffsetMs ||
      playbackState.paused !== desiredPaused ||
      playbackState.pausedAt !== desiredPausedAt
    ) {
      yield* syncRoomPlaybackState(playbackState, {
        currentQueueItemId: desiredCurrentQueueItemId,
        startedAt: desiredStartedAt,
        startOffsetMs: desiredStartOffsetMs,
        paused: desiredPaused,
        pausedAt: desiredPausedAt,
        updatedAt: now,
      });
    }

    return {
      ...projection,
      currentQueueItemId: desiredCurrentQueueItemId,
      queueItems: retainedQueueItems,
      resolvedPlaybackState: {
        ...projection.resolvedPlaybackState,
        currentQueueItemId: desiredCurrentQueueItemId,
        startedAt: desiredStartedAt,
        startOffsetMs: desiredStartOffsetMs,
        paused: desiredPaused,
        pausedAt: desiredPausedAt,
        currentOffsetMs: projection.currentQueueItem
          ? projection.resolvedPlaybackState.currentOffsetMs
          : 0,
      },
      visibleQueueItems: projection.currentQueueItem
        ? retainedQueueItems.slice(1)
        : retainedQueueItems,
    };
  }).pipe(Effect.orDie);

const loadCompactedRoomState = <A extends { room: RoomDoc }, E, R>(
  roomContextEffect: Effect.Effect<A, E, R>,
  now: number,
) =>
  Effect.gen(function* () {
    const roomContext = yield* roomContextEffect;
    const queueItems = yield* getActiveQueueItems(roomContext.room._id);
    const playbackState = yield* getPlaybackStateDoc(roomContext.room._id);
    const projection = yield* compactRoomQueuePlayback(
      playbackState,
      queueItems,
      now,
    );
    return { now, playbackState, projection, roomContext };
  });

// ── Mutation handlers ────────────────────────────────────────────────────────
export const createRoom = (
  ctx: RoomCtx,
  args: {
    name: string;
    slug?: string | undefined;
    description?: string | undefined;
    visibility?: "public" | "private" | undefined;
  },
) =>
  Effect.gen(function* () {
    const auth = yield* requireRoomAuth(ctx);
    // Creating a room requires a real account — guests (anonymous sessions) can
    // join + listen but never own data, so the account upgrade stays clean.
    if (auth.isAnonymous) {
      return yield* Effect.fail(new Unauthorized());
    }
    const name = args.name.trim();
    if (!name) {
      return yield* Effect.fail(
        new InvalidInput({ message: "Room name is required." }),
      );
    }
    const description = args.description?.trim();
    return yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const now = yield* Clock.currentTimeMillis;
      const slug = yield* uniqueRoomSlug(slugifyRoomName(args.slug ?? name));
      const roomId = yield* writer.table("rooms").insert({
        slug,
        name,
        ...(description ? { description } : {}),
        visibility: args.visibility ?? "public",
        ownerUserId: auth.userId,
        ownerUserTokenIdentifier: auth.tokenIdentifier,
        createdAt: now,
        archivedAt: null,
      });
      yield* writer.table("roomMemberships").insert({
        roomId,
        userId: auth.userId,
        userTokenIdentifier: auth.tokenIdentifier,
        role: "owner",
        active: true,
        joinedAt: now,
        leftAt: null,
      });
      yield* writer.table("roomPlaybackStates").insert({
        roomId,
        currentQueueItemId: null,
        startedAt: null,
        startOffsetMs: 0,
        paused: true,
        pausedAt: now,
        updatedAt: now,
      });
      return { roomId, slug };
    }).pipe(Effect.orDie);
  });

export const followRoom = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, undefined);
    if (Option.isNone(context)) return yield* Effect.fail(new RoomNotFound());
    const { room, auth } = context.value;

    const existingFollow = yield* getRoomFollow(room._id, auth.userId);
    if (Option.isSome(existingFollow)) {
      return { roomId: room._id, followId: existingFollow.value._id };
    }
    return yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const now = yield* Clock.currentTimeMillis;
      const followId = yield* writer.table("roomFollows").insert({
        roomId: room._id,
        userId: auth.userId,
        followedAt: now,
      });
      return { roomId: room._id, followId };
    }).pipe(Effect.orDie);
  });

export const unfollowRoom = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const auth = yield* requireRoomAuth(ctx);
    const existingFollow = yield* getRoomFollow(args.roomId, auth.userId);
    if (Option.isNone(existingFollow)) {
      return { roomId: args.roomId, unfollowed: false };
    }
    return yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      yield* writer.table("roomFollows").delete(existingFollow.value._id);
      return { roomId: args.roomId, unfollowed: true };
    }).pipe(Effect.orDie);
  });

export const sendChatMessage = (
  ctx: RoomCtx,
  args: { roomId: Id<"rooms">; body: string },
) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, undefined);
    if (Option.isNone(context)) return yield* Effect.fail(new RoomNotFound());
    const { room, auth } = context.value;

    const body = yield* normalizeChatMessageBody(args.body);
    return yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      const now = yield* Clock.currentTimeMillis;
      const eventId = yield* writer.table("roomActivityEvents").insert({
        roomId: room._id,
        kind: "chat_message",
        createdAt: now,
        actorUserId: auth.userId,
        actorUserTokenIdentifier: auth.tokenIdentifier,
        body,
        dedupeKey: `chat_message:${auth.tokenIdentifier}:${now}`,
      });
      return { roomId: room._id, eventId };
    }).pipe(Effect.orDie);
  });

export const recordCurrentTrackStarted = (
  ctx: RoomCtx,
  args: { roomId: Id<"rooms">; queueItemId: Id<"roomQueueItems"> },
) =>
  Effect.gen(function* () {
    const context = yield* getVisibleRoomContext(ctx, args.roomId, undefined);
    if (Option.isNone(context)) return yield* Effect.fail(new RoomNotFound());
    const { room } = context.value;

    const now = yield* Clock.currentTimeMillis;
    const queueItems = yield* getActiveQueueItems(room._id);
    const playbackState = yield* getPlaybackStateDoc(room._id);
    const projection = resolveRoomPlaybackProjection(
      queueItems,
      playbackState,
      now,
    );
    if (projection.currentQueueItem?._id !== args.queueItemId) {
      return {
        roomId: room._id,
        queueItemId: args.queueItemId,
        recorded: false,
      };
    }

    const eventId = yield* insertTrackStartedActivity(
      room._id,
      null,
      buildActivityTrackFromQueueItem(projection.currentQueueItem),
      projection.resolvedPlaybackState.startedAt ?? now,
    );

    return {
      roomId: room._id,
      queueItemId: args.queueItemId,
      eventId,
      recorded: true,
    };
  });

export const enqueueTrack = (
  ctx: RoomCtx,
  args: {
    roomId: Id<"rooms">;
    trackId: string;
    isrc?: string | undefined;
    trackName: string;
    trackArtists: string[];
    trackImageUrl?: string | undefined;
    trackDurationMs: number;
  },
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: roleContext } =
      yield* loadCompactedRoomState(
        requireActiveRoomRoleContext(ctx, args.roomId),
        now,
      );
    const track = yield* normalizeQueuedTrack(args);
    const [queueItemId] = yield* insertQueuedTracks(
      roleContext.room._id,
      roleContext.auth,
      [track],
      projection.queueItems.length,
      now,
    );
    if (!queueItemId) {
      return yield* Effect.die(new Error("Track could not be queued."));
    }

    if (projection.queueItems.length === 0) {
      yield* syncRoomPlaybackState(playbackState, {
        currentQueueItemId: queueItemId,
        startedAt: now,
        startOffsetMs: 0,
        paused: false,
        pausedAt: null,
        updatedAt: now,
      });
      yield* insertTrackStartedActivity(
        roleContext.room._id,
        roleContext.auth,
        { queueItemId, ...track },
        now,
      );
    }

    return {
      roomId: roleContext.room._id,
      queueItemId,
      position: projection.visibleQueueItems.length,
    };
  });

export const enqueueTracks = (
  ctx: RoomCtx,
  args: {
    roomId: Id<"rooms">;
    tracks: ReadonlyArray<{
      trackId: string;
      isrc?: string | undefined;
      trackName: string;
      trackArtists: string[];
      trackImageUrl?: string | undefined;
      trackDurationMs: number;
    }>;
  },
) =>
  Effect.gen(function* () {
    if (args.tracks.length === 0) {
      return yield* Effect.fail(
        new InvalidInput({
          message: "Add at least one track to queue a playlist.",
        }),
      );
    }

    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: roleContext } =
      yield* loadCompactedRoomState(
        requireActiveRoomRoleContext(ctx, args.roomId),
        now,
      );
    const tracks = yield* Effect.forEach(args.tracks, (track) =>
      normalizeQueuedTrack(track),
    );
    const queueItemIds = yield* insertQueuedTracks(
      roleContext.room._id,
      roleContext.auth,
      tracks,
      projection.queueItems.length,
      now,
    );

    if (projection.queueItems.length === 0 && queueItemIds[0] && tracks[0]) {
      yield* syncRoomPlaybackState(playbackState, {
        currentQueueItemId: queueItemIds[0],
        startedAt: now,
        startOffsetMs: 0,
        paused: false,
        pausedAt: null,
        updatedAt: now,
      });
      yield* insertTrackStartedActivity(
        roleContext.room._id,
        roleContext.auth,
        { queueItemId: queueItemIds[0], ...tracks[0] },
        now,
      );
    }

    return { count: queueItemIds.length, roomId: roleContext.room._id };
  });

export const removeQueueItem = (
  ctx: RoomCtx,
  args: { roomId: Id<"rooms">; queueItemId: Id<"roomQueueItems"> },
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { projection, roomContext: roleContext } =
      yield* loadCompactedRoomState(
        requireActiveRoomRoleContext(ctx, args.roomId),
        now,
      );
    const queueItem = projection.visibleQueueItems.find(
      (item) => item._id === args.queueItemId,
    );
    if (!queueItem) {
      if (projection.currentQueueItem?._id === args.queueItemId) {
        return yield* Effect.fail(
          new Conflict({
            message:
              "Remove tracks from the up-next queue, not the current track.",
          }),
        );
      }
      return yield* Effect.fail(
        new NotFound({ message: "Queue item not found." }),
      );
    }

    if (
      !isModeratorRole(roleContext.roleMembership) &&
      queueItem.addedByUserTokenIdentifier !== roleContext.auth.tokenIdentifier
    ) {
      return yield* Effect.fail(
        new Forbidden({
          message: "Only the user who enqueued this track can remove it.",
        }),
      );
    }

    return yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      yield* writer.table("roomQueueItems").patch(queueItem._id, {
        removedAt: now,
      });
      const remainingVisibleQueueItems = projection.visibleQueueItems.filter(
        (item) => item._id !== queueItem._id,
      );
      yield* normalizeQueuePositions(
        projection.currentQueueItem
          ? [projection.currentQueueItem, ...remainingVisibleQueueItems]
          : remainingVisibleQueueItems,
      );
      return {
        roomId: roleContext.room._id,
        queueItemId: queueItem._id,
        nextQueueItemId: remainingVisibleQueueItems[0]?._id ?? null,
      };
    }).pipe(Effect.orDie);
  });

export const moveQueueItem = (
  ctx: RoomCtx,
  args: {
    roomId: Id<"rooms">;
    queueItemId: Id<"roomQueueItems">;
    targetIndex: number;
  },
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );

    const visibleQueueItemIds = projection.visibleQueueItems.map(
      (queueItem) => queueItem._id,
    );
    if (!visibleQueueItemIds.includes(args.queueItemId)) {
      return yield* Effect.fail(
        new NotFound({ message: "Queue item not found." }),
      );
    }
    const reorderedQueueItemIds = moveRoomQueueItemIds(
      visibleQueueItemIds,
      args.queueItemId,
      args.targetIndex,
    );
    const reorderedQueueItems: RoomQueueItemDoc[] = [];
    for (const queueItemId of reorderedQueueItemIds) {
      const queueItem = projection.visibleQueueItems.find(
        (item) => item._id === queueItemId,
      );
      if (!queueItem) {
        return yield* Effect.fail(
          new NotFound({ message: "Queue item not found." }),
        );
      }
      reorderedQueueItems.push(queueItem);
    }

    yield* normalizeQueuePositions(
      projection.currentQueueItem
        ? [projection.currentQueueItem, ...reorderedQueueItems]
        : reorderedQueueItems,
    );

    return {
      roomId: moderatorContext.room._id,
      queueItemId: args.queueItemId,
      targetIndex: Math.max(
        0,
        Math.min(Math.trunc(args.targetIndex), reorderedQueueItems.length - 1),
      ),
    };
  });

export const clearQueue = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );

    yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      for (const queueItem of projection.visibleQueueItems) {
        yield* writer.table("roomQueueItems").patch(queueItem._id, {
          removedAt: now,
        });
      }
    }).pipe(Effect.orDie);

    if (!projection.currentQueueItem) {
      yield* syncRoomPlaybackState(playbackState, {
        currentQueueItemId: null,
        startedAt: null,
        startOffsetMs: 0,
        paused: true,
        pausedAt: now,
        updatedAt: now,
      });
    }

    return {
      roomId: moderatorContext.room._id,
      removedCount: projection.visibleQueueItems.length,
    };
  });

export const play = (
  ctx: RoomCtx,
  args: {
    roomId: Id<"rooms">;
    queueItemId?: Id<"roomQueueItems"> | undefined;
    offsetMs?: number | undefined;
  },
) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );
    const playbackQueueItems = projection.currentQueueItem
      ? [projection.currentQueueItem, ...projection.visibleQueueItems]
      : projection.visibleQueueItems;
    const currentQueueItemId =
      args.queueItemId ??
      projection.currentQueueItem?._id ??
      (playbackQueueItems[0]?._id ?? null);

    if (!currentQueueItemId) {
      return yield* Effect.fail(
        new Conflict({
          message: "Select a queued track to restart room playback.",
        }),
      );
    }

    const currentQueueItemIndex = playbackQueueItems.findIndex(
      (queueItem) => queueItem._id === currentQueueItemId,
    );
    const currentQueueItem =
      currentQueueItemIndex >= 0
        ? playbackQueueItems[currentQueueItemIndex] ?? null
        : null;

    if (!currentQueueItem) {
      return yield* Effect.fail(
        new NotFound({ message: "Queue item not found." }),
      );
    }

    const offsetMs = clampPlaybackOffset(
      args.offsetMs ??
        (projection.currentQueueItem?._id === currentQueueItemId
          ? projection.resolvedPlaybackState.currentOffsetMs
          : 0),
      currentQueueItem.trackDurationMs,
    );

    yield* Effect.gen(function* () {
      const writer = yield* DatabaseWriter;
      for (const skippedQueueItem of playbackQueueItems.slice(
        0,
        currentQueueItemIndex,
      )) {
        yield* writer.table("roomQueueItems").patch(skippedQueueItem._id, {
          removedAt: now,
        });
      }
    }).pipe(Effect.orDie);

    yield* normalizeQueuePositions(
      playbackQueueItems.slice(currentQueueItemIndex),
    );

    yield* syncRoomPlaybackState(playbackState, {
      currentQueueItemId,
      startedAt: now,
      startOffsetMs: offsetMs,
      paused: false,
      pausedAt: null,
      updatedAt: now,
    });

    if (projection.currentQueueItemId !== currentQueueItemId) {
      yield* insertTrackStartedActivity(
        moderatorContext.room._id,
        moderatorContext.auth,
        buildActivityTrackFromQueueItem(currentQueueItem),
        now,
      );
    }

    return { roomId: moderatorContext.room._id, currentQueueItemId, offsetMs };
  });

export const pause = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );
    const currentQueueItemId = projection.currentQueueItemId;

    yield* syncRoomPlaybackState(playbackState, {
      currentQueueItemId,
      startedAt: currentQueueItemId ? now : null,
      startOffsetMs: currentQueueItemId
        ? projection.resolvedPlaybackState.currentOffsetMs
        : 0,
      paused: true,
      pausedAt: now,
      updatedAt: now,
    });

    return {
      roomId: moderatorContext.room._id,
      currentQueueItemId,
      offsetMs: projection.currentQueueItem
        ? projection.resolvedPlaybackState.currentOffsetMs
        : 0,
    };
  });

export const resume = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );
    const currentQueueItemId = projection.currentQueueItemId;

    if (!currentQueueItemId) {
      return yield* Effect.fail(
        new Conflict({ message: "There is no active room track to resume." }),
      );
    }

    yield* syncRoomPlaybackState(playbackState, {
      currentQueueItemId,
      startedAt: now,
      startOffsetMs: projection.resolvedPlaybackState.currentOffsetMs,
      paused: false,
      pausedAt: null,
      updatedAt: now,
    });

    return {
      roomId: moderatorContext.room._id,
      currentQueueItemId,
      offsetMs: projection.resolvedPlaybackState.currentOffsetMs,
    };
  });

export const skip = (ctx: RoomCtx, args: { roomId: Id<"rooms"> }) =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis;
    const { playbackState, projection, roomContext: moderatorContext } =
      yield* loadCompactedRoomState(
        requireModeratorContext(ctx, args.roomId),
        now,
      );
    const nextQueueItem = projection.visibleQueueItems[0] ?? null;

    if (projection.currentQueueItem) {
      yield* Effect.gen(function* () {
        const writer = yield* DatabaseWriter;
        yield* writer
          .table("roomQueueItems")
          .patch(projection.currentQueueItem!._id, { removedAt: now });
      }).pipe(Effect.orDie);
    }

    yield* normalizeQueuePositions(
      nextQueueItem
        ? [nextQueueItem, ...projection.visibleQueueItems.slice(1)]
        : [],
    );

    yield* syncRoomPlaybackState(playbackState, {
      currentQueueItemId: nextQueueItem?._id ?? null,
      startedAt: nextQueueItem ? now : null,
      startOffsetMs: 0,
      paused: projection.resolvedPlaybackState.paused || !nextQueueItem,
      pausedAt:
        projection.resolvedPlaybackState.paused || !nextQueueItem ? now : null,
      updatedAt: now,
    });

    if (nextQueueItem) {
      yield* insertTrackStartedActivity(
        moderatorContext.room._id,
        moderatorContext.auth,
        buildActivityTrackFromQueueItem(nextQueueItem),
        now,
      );
    }

    return {
      roomId: moderatorContext.room._id,
      currentQueueItemId: nextQueueItem?._id ?? null,
    };
  });
