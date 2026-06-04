import { FunctionSpec, GenericId, GroupSpec } from "@confect/core";
import { Schema } from "effect";

/** Native confect mutation (Effect handler over DatabaseReader/Writer). */
export const users = GroupSpec.make("users").addFunction(
  FunctionSpec.publicMutation({
    name: "upsert",
    args: Schema.Struct({
      userId: Schema.String,
      name: Schema.String,
      image: Schema.optional(Schema.String),
    }),
    returns: GenericId.GenericId("users"),
  }),
);
