import { Spec } from "@confect/core";

import { lastfm } from "./lastfm.spec";
import { musicbrainz } from "./musicbrainz.spec";
import { playback } from "./playback.spec";
import { profile } from "./profile.spec";
import { roomPresence } from "./roomPresence.spec";
import { rooms } from "./rooms.spec";
import { spotify } from "./spotify.spec";
import { spotifyAuthCooldown } from "./spotifyAuthCooldown.spec";
import { users } from "./users.spec";

/** Master spec — `confect codegen` reads this default export. */
export default Spec.make()
  .add(spotifyAuthCooldown)
  .add(spotify)
  .add(rooms)
  .add(roomPresence)
  .add(playback)
  .add(lastfm)
  .add(musicbrainz)
  .add(users)
  .add(profile);
