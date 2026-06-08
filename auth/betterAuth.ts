import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { createClient } from "@convex-dev/better-auth";
import { isRunMutationCtx } from "@convex-dev/better-auth/utils";
import { convex } from "@convex-dev/better-auth/plugins";

import authConfig from "../convex/auth.config";
import { components, internal } from "../convex/_generated/api";
import { crossDomain } from "./betterAuthCrossDomain";

type GeneratedComponents = typeof import("../convex/_generated/api").components;
const SPOTIFY_AUTH_COOLDOWN_KEY = "spotify-auth-cooldown";

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

async function setSpotifyAuthCooldown(
  ctx: Parameters<typeof authComponent.adapter>[0],
  retryAfterSeconds: number,
) {
  if (!isRunMutationCtx(ctx)) {
    return;
  }

  const safeRetryAfterSeconds = Math.max(Math.ceil(retryAfterSeconds), 0);
  await ctx.runMutation(internal.spotifyAuthCooldown.set, {
    key: SPOTIFY_AUTH_COOLDOWN_KEY,
    expiresAt: Date.now() + safeRetryAfterSeconds * 1000,
    retryAfterSeconds: safeRetryAfterSeconds,
  });
}

async function fetchSpotifyProfile(
  ctx: Parameters<typeof authComponent.adapter>[0],
  accessToken: string,
) {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();

  if (res.ok) {
    return text ? JSON.parse(text) : null;
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const retryAfterSeconds = Number(retryAfter);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      await setSpotifyAuthCooldown(ctx, retryAfterSeconds);
    }
    console.error(
      `[better-auth] Spotify profile lookup rate limited retry_after=${retryAfter ?? "unknown"}`,
    );
    return null;
  }

  console.error(
    `[better-auth] Spotify profile lookup failed status=${res.status} body=${text.slice(0, 200)}`,
  );
  return null;
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
        trustedProviders: ["spotify", "google"],
      },
    },
    // Identity is Google or email/password — never Apple (MusicKit grants
    // playback, not identity) and never Spotify (kept only as a legacy playback
    // connection). Email/password works without mail infra for now; verification
    // and reset land when an email sender is wired.
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
      spotify: {
        clientId: requireEnv("SPOTIFY_CLIENT_ID"),
        clientSecret: requireEnv("SPOTIFY_CLIENT_SECRET"),
        pkce: false,
        scope: [
          "user-read-email",
          "user-read-private",
          "user-follow-read",
          "user-top-read",
          "user-read-playback-state",
          "user-modify-playback-state",
          "user-read-recently-played",
          "playlist-read-private",
          "playlist-read-collaborative",
          "streaming",
        ],
        async getUserInfo(token) {
          if (!token.accessToken) return null;
          const profile = await fetchSpotifyProfile(ctx, token.accessToken);
          if (!profile) return null;

          return {
            user: {
              id: profile.id,
              name: profile.display_name || profile.id,
              email: profile.email,
              image: profile.images?.[0]?.url,
              emailVerified: false,
            },
            data: profile,
          };
        },
      },
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
