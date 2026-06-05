/**
 * Pure track-resolution logic, shared by `playback.resolveTrack`. Kept free of
 * Convex/Effect so it's trivially unit-testable: given what we know about a
 * queue item (its canonical ISRC, its origin `trackId`, and any cached hints),
 * decide how to produce the requested provider's track id.
 */

export type PlaybackProviderId = "spotify" | "apple";

export interface ProviderHints {
  apple?: string | null;
  spotify?: string | null;
}

export interface ResolutionInputs {
  /** Canonical recording id; may be absent (album-track adds, legacy rows). */
  isrc: string | null;
  /** The id the track was added with — a Spotify track id today. */
  trackId: string;
  /** Previously cached per-provider results. */
  hints: ProviderHints;
}

export type Resolution =
  /** Already known (string id, or null = known-unavailable). No write needed. */
  | { kind: "cached"; providerTrackId: string | null }
  /** Freshly derived id to return and persist as a positive hint. */
  | { kind: "resolved"; providerTrackId: string }
  /** Apple id must be fetched from the catalog by ISRC, then cached. */
  | { kind: "needsAppleFetch"; isrc: string }
  /** Cannot resolve (no ISRC to look up). Persist a negative hint. */
  | { kind: "unavailable" };

export function chooseResolution(
  provider: PlaybackProviderId,
  inputs: ResolutionInputs,
): Resolution {
  const cached = inputs.hints[provider];
  if (cached !== undefined) {
    return { kind: "cached", providerTrackId: cached };
  }

  if (provider === "spotify") {
    // Every queue item originates from Spotify today, so its `trackId` *is* the
    // Spotify track id — identity resolution, no catalog call. When the canonical
    // catalog source moves to Apple, items will need an origin marker and this
    // branch generalizes to "requested provider === origin provider".
    return { kind: "resolved", providerTrackId: inputs.trackId };
  }

  if (inputs.isrc) {
    return { kind: "needsAppleFetch", isrc: inputs.isrc };
  }

  return { kind: "unavailable" };
}
