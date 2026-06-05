import { describe, expect, it, vi } from "vitest";

import {
  lookupAppleSongIdByIsrc,
  type AppleCatalogConfig,
} from "./catalog";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

const configWith = (
  fetchImpl: typeof fetch,
  developerToken: string | null = "dev-token",
): AppleCatalogConfig => ({
  developerToken,
  storefront: "us",
  fetchImpl,
});

describe("lookupAppleSongIdByIsrc", () => {
  it("returns not-configured without fetching when no token is set", async () => {
    const fetchImpl = vi.fn();
    const result = await lookupAppleSongIdByIsrc(
      "USRC17607839",
      configWith(fetchImpl as unknown as typeof fetch, null),
    );
    expect(result).toEqual({ configured: false, songId: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns the first matching song id and queries the ISRC filter endpoint", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ id: "apple-song-9" }, { id: "apple-song-10" }] }),
    );
    const result = await lookupAppleSongIdByIsrc(
      "USRC17607839",
      configWith(fetchImpl as unknown as typeof fetch),
    );
    expect(result).toEqual({ configured: true, songId: "apple-song-9" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.music.apple.com/v1/catalog/us/songs?filter[isrc]=USRC17607839",
      { headers: { Authorization: "Bearer dev-token" } },
    );
  });

  it("returns configured with null when the catalog has no match", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }));
    const result = await lookupAppleSongIdByIsrc(
      "USRC17607839",
      configWith(fetchImpl as unknown as typeof fetch),
    );
    expect(result).toEqual({ configured: true, songId: null });
  });

  it("treats a non-ok response as a (cacheable) miss", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, false, 429));
    const result = await lookupAppleSongIdByIsrc(
      "USRC17607839",
      configWith(fetchImpl as unknown as typeof fetch),
    );
    expect(result).toEqual({ configured: true, songId: null });
  });
});
