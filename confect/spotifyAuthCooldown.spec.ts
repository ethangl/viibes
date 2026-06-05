import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

/**
 * These are INTERNAL functions: `convex/http.ts` calls
 * `internal.spotifyAuthCooldown.get` and
 * `auth/betterAuth.ts` calls `internal.spotifyAuthCooldown.set` via vanilla
 * `ctx.runQuery`/`ctx.runMutation`. Because those callers are plain Convex (not
 * confect clients), the return of `get` is `Schema.NullOr` (NOT `Schema.Option`)
 * so the wire shape stays `{ expiresAt, retryAfterSeconds } | null` exactly as
 * before — no caller changes needed.
 */
export const Cooldown = Schema.Struct({
  expiresAt: Schema.Number,
  retryAfterSeconds: Schema.Number,
});

export const spotifyAuthCooldown = GroupSpec.make("spotifyAuthCooldown")
  .addFunction(
    FunctionSpec.internalMutation({
      name: "set",
      args: Schema.Struct({
        key: Schema.String,
        expiresAt: Schema.Number,
        retryAfterSeconds: Schema.Number,
      }),
      returns: Schema.Null,
    }),
  )
  .addFunction(
    FunctionSpec.internalQuery({
      name: "get",
      args: Schema.Struct({ key: Schema.String }),
      returns: Schema.NullOr(Cooldown),
    }),
  )
  .addFunction(
    FunctionSpec.internalMutation({
      name: "clear",
      args: Schema.Struct({ key: Schema.String }),
      returns: Schema.Null,
    }),
  );
