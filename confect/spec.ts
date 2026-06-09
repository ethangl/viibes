import { Spec } from "@confect/core";

import { lastfm } from "./lastfm.spec";
import { musicbrainz } from "./musicbrainz.spec";
import { playback } from "./playback.spec";
import { profile } from "./profile.spec";
import { roomPresence } from "./roomPresence.spec";
import { rooms } from "./rooms.spec";
import { users } from "./users.spec";

/** Master spec — `confect codegen` reads this default export. */
export default Spec.make()
  .add(rooms)
  .add(roomPresence)
  .add(playback)
  .add(lastfm)
  .add(musicbrainz)
  .add(users)
  .add(profile);
