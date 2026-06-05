import { describe, expect, it } from "vitest";

import { chooseResolution } from "./resolution";

describe("chooseResolution", () => {
  const base = { isrc: "USRC17607839", trackId: "spotify-track-1", hints: {} };

  it("resolves Spotify to the origin trackId without a fetch", () => {
    expect(chooseResolution("spotify", base)).toEqual({
      kind: "resolved",
      providerTrackId: "spotify-track-1",
    });
  });

  it("requests an Apple catalog fetch when the ISRC is present and uncached", () => {
    expect(chooseResolution("apple", base)).toEqual({
      kind: "needsAppleFetch",
      isrc: "USRC17607839",
    });
  });

  it("reports Apple unavailable when there is no ISRC to look up", () => {
    expect(chooseResolution("apple", { ...base, isrc: null })).toEqual({
      kind: "unavailable",
    });
  });

  it("returns a cached positive hint without re-resolving", () => {
    expect(
      chooseResolution("apple", { ...base, hints: { apple: "apple-song-9" } }),
    ).toEqual({ kind: "cached", providerTrackId: "apple-song-9" });
  });

  it("returns a cached negative hint (null) without re-fetching", () => {
    expect(
      chooseResolution("apple", { ...base, hints: { apple: null } }),
    ).toEqual({ kind: "cached", providerTrackId: null });
  });

  it("prefers a cached Spotify hint over identity resolution", () => {
    expect(
      chooseResolution("spotify", { ...base, hints: { spotify: "other-id" } }),
    ).toEqual({ kind: "cached", providerTrackId: "other-id" });
  });
});
