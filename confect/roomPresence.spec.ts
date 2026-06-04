import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { RoomNotFound, Unauthorized } from "./rooms/errors";

const HeartbeatResult = Schema.Struct({
  roomToken: Schema.String,
  sessionToken: Schema.String,
});

/**
 * Presence group, native confect. The handlers (in `roomPresence/core.ts`)
 * drive the `@convex-dev/presence` component via the raw `MutationCtx` and share
 * `getVisibleRoomContext`/`insertRoomPresenceActivity` with the rooms group.
 */
export const roomPresence = GroupSpec.make("roomPresence")
  .addFunction(
    FunctionSpec.publicMutation({
      name: "heartbeat",
      args: Schema.Struct({
        roomId: GenericId.GenericId("rooms"),
        sessionId: Schema.String,
        interval: Schema.Number,
      }),
      returns: HeartbeatResult,
      error: Schema.Union(Unauthorized, RoomNotFound),
    }),
  )
  .addFunction(
    FunctionSpec.publicMutation({
      name: "disconnect",
      args: Schema.Struct({ sessionToken: Schema.String }),
      returns: Schema.Null,
    }),
  );
