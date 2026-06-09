import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

import { getConvexSiteUrl } from "@/lib/convex-env";

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

export const {
  signIn: convexSignIn,
  signOut: convexSignOut,
  useSession: useConvexSession,
} = convexAuthClient;
