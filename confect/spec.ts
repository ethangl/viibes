import { Spec } from "@confect/core";

import { spotify } from "./spotify.spec";
import { spotifyAuthCooldown } from "./spotifyAuthCooldown.spec";

/**
 * Master spec — `confect codegen` reads this default export. Groups are added
 * here as they are ported. (Remaining: rest of spotify, rooms, userProfiles,
 * users, profile, lastfm, musicbrainz.)
 */
export default Spec.make().add(spotifyAuthCooldown).add(spotify);
