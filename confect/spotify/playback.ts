import { Effect } from "effect";

import { SPOTIFY_API } from "./constants";
import type {
  PlaybackCurrentlyPlayingResult,
  PlaybackResult,
  PlaybackState,
} from "./types";

// ── Pure helpers ─────────────────────────────────────────────────────────────

function getRetryAfterSeconds(response: Response) {
  const value = Number(response.headers.get("retry-after"));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function normalizePositionMs(positionMs?: number) {
  if (typeof positionMs !== "number" || !Number.isFinite(positionMs)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(positionMs));
}

function normalizePlaybackState(raw: unknown): PlaybackState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const playback = raw as {
    is_playing?: unknown;
    progress_ms?: unknown;
    item?: {
      id?: unknown;
      name?: unknown;
      duration_ms?: unknown;
      artists?: { name?: unknown }[];
    } | null;
  };
  const item = playback.item;
  return {
    is_playing: playback.is_playing === true,
    progress_ms:
      typeof playback.progress_ms === "number" ? playback.progress_ms : 0,
    item:
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.duration_ms === "number"
        ? {
            id: item.id,
            name: item.name,
            duration_ms: item.duration_ms,
            artists: Array.isArray(item.artists)
              ? item.artists
                  .map((artist) =>
                    typeof artist?.name === "string"
                      ? { name: artist.name }
                      : null,
                  )
                  .filter((artist): artist is { name: string } => !!artist)
              : [],
          }
        : null,
  };
}

const playbackResult = (
  res: Response,
): PlaybackResult => {
  const retryAfterSeconds = getRetryAfterSeconds(res);
  return {
    ok: res.ok || res.status === 204,
    status: res.status,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
  };
};

// ── Playback commands (uncached, direct fetch). Effect wrappers that mirror the
//    originals' "return a status object, swallow network errors" behavior. ─────

/** Any failure → `{ status: 0, playback: null }`. */
export const getCurrentlyPlaying = (
  token: string,
): Effect.Effect<PlaybackCurrentlyPlayingResult> =>
  Effect.tryPromise(async (): Promise<PlaybackCurrentlyPlayingResult> => {
    const res = await fetch(`${SPOTIFY_API}/me/player/currently-playing`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const retryAfterSeconds = getRetryAfterSeconds(res);
    if (!res.ok && res.status !== 204 && res.status !== 202) {
      return {
        status: res.status,
        playback: null,
        ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
      };
    }
    if (res.status === 204 || res.status === 202) {
      return { status: res.status, playback: null };
    }
    const text = await res.text();
    return {
      status: res.status,
      playback: text ? normalizePlaybackState(JSON.parse(text)) : null,
    };
  }).pipe(
    Effect.catchAll(() =>
      Effect.succeed<PlaybackCurrentlyPlayingResult>({
        status: 0,
        playback: null,
      }),
    ),
  );

export const playUri = (
  uri: string,
  token: string,
  deviceId?: string,
  offsetMs?: number,
): Effect.Effect<PlaybackResult> =>
  Effect.promise(async () => {
    const query = deviceId ? `?device_id=${deviceId}` : "";
    const positionMs = normalizePositionMs(offsetMs);
    const res = await fetch(`${SPOTIFY_API}/me/player/play${query}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [uri],
        ...(positionMs === undefined ? {} : { position_ms: positionMs }),
      }),
    });
    return playbackResult(res);
  });

export const resumePlayback = (token: string): Effect.Effect<PlaybackResult> =>
  Effect.promise(async () => {
    const res = await fetch(`${SPOTIFY_API}/me/player/play`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    });
    return playbackResult(res);
  });

const playbackCommandWithFallback = (
  run: () => Promise<Response>,
): Effect.Effect<PlaybackResult> =>
  Effect.tryPromise(async () => playbackResult(await run())).pipe(
    Effect.catchAll(() => Effect.succeed<PlaybackResult>({ ok: false, status: 0 })),
  );

export const pausePlayback = (token: string): Effect.Effect<PlaybackResult> =>
  playbackCommandWithFallback(() =>
    fetch(`${SPOTIFY_API}/me/player/pause`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );

export const setVolumePercent = (
  percent: number,
  token: string,
): Effect.Effect<PlaybackResult> =>
  playbackCommandWithFallback(() =>
    fetch(`${SPOTIFY_API}/me/player/volume?volume_percent=${percent}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );

export const setRepeatMode = (
  state: "track" | "context" | "off",
  token: string,
  deviceId?: string,
): Effect.Effect<PlaybackResult> => {
  const query = deviceId ? `&device_id=${deviceId}` : "";
  return playbackCommandWithFallback(() =>
    fetch(`${SPOTIFY_API}/me/player/repeat?state=${state}${query}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
};
