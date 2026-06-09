import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";

import authConfig from "../convex/auth.config";
import { components } from "../convex/_generated/api";
import { crossDomain } from "./betterAuthCrossDomain";

type GeneratedComponents = typeof import("../convex/_generated/api").components;

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} for Convex Better Auth.`);
  }

  return value;
}

/**
 * Google is an optional identity provider until its OAuth client is configured;
 * register it only when both env vars are present (`requireEnv` would otherwise
 * throw and break startup before the client is set up).
 */
function googleProvider(): {
  google?: { clientId: string; clientSecret: string };
} {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return {};
  }
  return { google: { clientId, clientSecret } };
}

export const authComponent = createClient(
  (components as GeneratedComponents).betterAuth,
);

export const createAuth = (ctx: Parameters<typeof authComponent.adapter>[0]) =>
  betterAuth({
    secret: requireEnv("BETTER_AUTH_SECRET"),
    baseURL: requireEnv("CONVEX_SITE_URL"),
    database: authComponent.adapter(ctx),
    trustedOrigins: [requireEnv("SITE_URL")],
    account: {
      accountLinking: {
        trustedProviders: ["google"],
      },
    },
    // Identity is Google or email/password — never Apple (MusicKit grants
    // playback, not identity) and never Spotify (fully retired). Email/password
    // works without mail infra for now; verification and reset land when an
    // email sender is wired.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    plugins: [
      crossDomain({ siteUrl: requireEnv("SITE_URL") }),
      convex({ authConfig }),
      // Guest sessions: join a room and listen with no account; upgrade to a
      // Google/email account later to claim a username and create rooms.
      anonymous(),
    ],
    socialProviders: {
      ...googleProvider(),
    },
  });

export const { getAuthUser } = authComponent.clientApi();

export async function requireAuthUser(ctx: unknown) {
  const user = await authComponent.getAuthUser(
    ctx as Parameters<typeof authComponent.getAuthUser>[0],
  );
  if (!user) {
    throw new Error("Unauthorized");
  }

  return user;
}
