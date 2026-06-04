import { Impl } from "@confect/server";
import { Layer } from "effect";

import api from "./_generated/api";
import { spotify } from "./spotify.impl";
import { spotifyAuthCooldown } from "./spotifyAuthCooldown.impl";

/** Master implementation layer — wires every group impl together. */
export default Impl.make(api).pipe(
  Layer.provide(spotifyAuthCooldown),
  Layer.provide(spotify),
  Impl.finalize,
);
