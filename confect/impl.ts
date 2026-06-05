import { Impl } from "@confect/server";
import { Layer } from "effect";

import api from "./_generated/api";
import { lastfm } from "./lastfm.impl";
import { musicbrainz } from "./musicbrainz.impl";
import { playback } from "./playback.impl";
import { profile } from "./profile.impl";
import { roomPresence } from "./roomPresence.impl";
import { rooms } from "./rooms.impl";
import { spotify } from "./spotify.impl";
import { spotifyAuthCooldown } from "./spotifyAuthCooldown.impl";
import { users } from "./users.impl";

/** Master implementation layer — wires every group impl together. */
export default Impl.make(api).pipe(
  Layer.provide(spotifyAuthCooldown),
  Layer.provide(spotify),
  Layer.provide(rooms),
  Layer.provide(roomPresence),
  Layer.provide(playback),
  Layer.provide(lastfm),
  Layer.provide(musicbrainz),
  Layer.provide(users),
  Layer.provide(profile),
  Impl.finalize,
);
