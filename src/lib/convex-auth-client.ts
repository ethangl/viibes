import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

import { getConvexSiteUrl } from "@/lib/convex-env";
const SPOTIFY_AUTH_COOLDOWN_ENDPOINT = "/api/spotify-auth/cooldown";

export const convexAuthClient = createAuthClient({
  baseURL: getConvexSiteUrl("Convex Better Auth"),
  plugins: [convexClient(), crossDomainClient(), anonymousClient()],
});

export async function convexLinkSocialAccount({
  callbackURL,
  errorCallbackURL,
  provider,
}: {
  callbackURL?: string;
  errorCallbackURL?: string;
  provider: string;
}) {
  const result = await convexAuthClient.$fetch("/link-social", {
    method: "POST",
    body: {
      callbackURL,
      errorCallbackURL,
      provider,
      disableRedirect: true,
    },
  });
  const payload =
    result &&
    typeof result === "object" &&
    "data" in result &&
    result.data &&
    typeof result.data === "object"
      ? result.data
      : result;

  if (
    payload &&
    typeof payload === "object" &&
    "url" in payload &&
    typeof payload.url === "string" &&
    payload.url.length > 0
  ) {
    window.location.assign(payload.url);
  }

  return result;
}

export async function fetchSpotifyAuthCooldown() {
  const response = await fetch(
    new URL(
      SPOTIFY_AUTH_COOLDOWN_ENDPOINT,
      getConvexSiteUrl("Spotify auth cooldown"),
    ).toString(),
  );

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as {
    cooldownUntil?: number | null;
    retryAfterSeconds?: number | null;
  };

  return {
    cooldownUntil:
      typeof payload.cooldownUntil === "number" &&
      Number.isFinite(payload.cooldownUntil)
        ? payload.cooldownUntil
        : null,
    retryAfterSeconds:
      typeof payload.retryAfterSeconds === "number" &&
      Number.isFinite(payload.retryAfterSeconds)
        ? payload.retryAfterSeconds
        : null,
  };
}

export const {
  signIn: convexSignIn,
  signOut: convexSignOut,
  useSession: useConvexSession,
} = convexAuthClient;
