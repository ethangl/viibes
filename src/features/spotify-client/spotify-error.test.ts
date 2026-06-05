import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { getSpotifyErrorMessage, isSpotifyAuthRequired } from "./spotify-error";

describe("spotify-error", () => {
  it("reads the message from a SpotifyAuthRequired ConvexError", () => {
    const error = new ConvexError({
      _tag: "SpotifyAuthRequired",
      message: "Reconnect Spotify to continue.",
    });
    expect(getSpotifyErrorMessage(error, "fallback")).toBe(
      "Reconnect Spotify to continue.",
    );
    expect(isSpotifyAuthRequired(error)).toBe(true);
  });

  it("reads the message from a SpotifyUnavailable ConvexError", () => {
    const error = new ConvexError({
      _tag: "SpotifyUnavailable",
      message: "Could not load this playlist.",
    });
    expect(getSpotifyErrorMessage(error, "fallback")).toBe(
      "Could not load this playlist.",
    );
    expect(isSpotifyAuthRequired(error)).toBe(false);
  });

  it("is not auth-required for a plain Error and uses the fallback", () => {
    expect(isSpotifyAuthRequired(new Error("boom"))).toBe(false);
    expect(getSpotifyErrorMessage(new Error(""), "fallback")).toBe("fallback");
    expect(isSpotifyAuthRequired(undefined)).toBe(false);
  });
});
