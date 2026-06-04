import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

/** Native confect query. Same shape as the original: a profile or null. */
const ProfileResult = Schema.NullOr(
  Schema.Struct({
    user: Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      image: Schema.NullOr(Schema.String),
    }),
  }),
);

export const profile = GroupSpec.make("profile").addFunction(
  FunctionSpec.publicQuery({
    name: "get",
    args: Schema.Struct({
      userId: Schema.String,
      fallbackName: Schema.optional(Schema.String),
      fallbackImage: Schema.optional(Schema.String),
    }),
    returns: ProfileResult,
  }),
);
