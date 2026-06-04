import { authComponent, createAuth, requireAuthUser } from "../../auth/betterAuth";

const SPOTIFY_ACCESS_TOKEN_EXPIRY_SKEW_MS = 30_000;
const SPOTIFY_ACCESS_TOKEN_FALLBACK_TTL_MS = 60_000;

const spotifyAccessTokenCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();
const spotifyAccessTokenInFlight = new Map<string, Promise<string>>();

function normalizeExpiry(expiresAt: Date | number | null | undefined) {
  if (expiresAt instanceof Date) {
    return expiresAt.getTime();
  }

  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) {
    return Date.now() + SPOTIFY_ACCESS_TOKEN_FALLBACK_TTL_MS;
  }

  return expiresAt > 1_000_000_000_000 ? expiresAt : expiresAt * 1000;
}

function getCachedSpotifyAccessToken(userId: string) {
  const cached = spotifyAccessTokenCache.get(userId);
  if (!cached) {
    return null;
  }

  if (Date.now() < cached.expiresAt - SPOTIFY_ACCESS_TOKEN_EXPIRY_SKEW_MS) {
    return cached.accessToken;
  }

  spotifyAccessTokenCache.delete(userId);
  return null;
}

async function requireSpotifySession(ctx: unknown) {
  const user = await requireAuthUser(ctx);
  const userId = String(user._id);
  const cachedAccessToken = getCachedSpotifyAccessToken(userId);
  if (cachedAccessToken) {
    return {
      user,
      accessToken: cachedAccessToken,
    };
  }

  let inFlight = spotifyAccessTokenInFlight.get(userId);
  if (!inFlight) {
    inFlight = (async () => {
      const { auth, headers } = await authComponent.getAuth(
        createAuth,
        ctx as Parameters<typeof authComponent.getAuth>[1],
      );

      const authApi = auth.api as {
        getAccessToken(args: {
          body: { providerId: string };
          headers: Headers;
        }): Promise<{
          accessToken?: string | null;
          accessTokenExpiresAt?: Date | number | null;
        } | null>;
      };

      const tokens = await authApi.getAccessToken({
        body: { providerId: "spotify" },
        headers,
      });

      if (!tokens?.accessToken) {
        throw new Error("Missing Spotify access token.");
      }

      spotifyAccessTokenCache.set(userId, {
        accessToken: tokens.accessToken,
        expiresAt: normalizeExpiry(tokens.accessTokenExpiresAt),
      });
      return tokens.accessToken;
    })()
      .catch((error) => {
        spotifyAccessTokenCache.delete(userId);
        throw error;
      })
      .finally(() => {
        if (spotifyAccessTokenInFlight.get(userId) === inFlight) {
          spotifyAccessTokenInFlight.delete(userId);
        }
      });
    spotifyAccessTokenInFlight.set(userId, inFlight);
  }

  try {
    const accessToken = await inFlight;
    return {
      user,
      accessToken,
    };
  } catch {
    throw new Error("Reconnect Spotify to continue.");
  }
}

export async function requireSpotifyAccessToken(ctx: unknown) {
  const session = await requireSpotifySession(ctx);
  return session.accessToken;
}
