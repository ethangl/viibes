import { DatabaseSchema } from "@confect/server";

import { RoomActivityEvents } from "./tables/RoomActivityEvents";
import { RoomFollows } from "./tables/RoomFollows";
import { RoomMemberships } from "./tables/RoomMemberships";
import { RoomPlaybackStates } from "./tables/RoomPlaybackStates";
import { RoomPresenceSessions } from "./tables/RoomPresenceSessions";
import { RoomQueueItems } from "./tables/RoomQueueItems";
import { Rooms } from "./tables/Rooms";
import { Users } from "./tables/Users";

/**
 * The whole-database schema. `confect codegen` reads this default export and
 * regenerates `convex/schema.ts` (which just re-exports
 * `.convexSchemaDefinition`).
 */
export default DatabaseSchema.make()
  .addTable(Users)
  .addTable(Rooms)
  .addTable(RoomMemberships)
  .addTable(RoomFollows)
  .addTable(RoomQueueItems)
  .addTable(RoomPlaybackStates)
  .addTable(RoomActivityEvents)
  .addTable(RoomPresenceSessions);
