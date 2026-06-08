import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { SpotifyTrack } from "@/features/spotify-client/types";
import { AppleRecent } from "./apple-recent";

const tracks: SpotifyTrack[] = [
  {
    id: "100",
    name: "Get Lucky",
    artist: "Daft Punk",
    albumName: "Random Access Memories",
    albumImage: null,
    durationMs: 369_000,
    isrc: "ISRC100",
  },
];

vi.mock("./apple-library-client", () => ({
  getAppleRecentlyPlayed: () => Promise.resolve(tracks),
}));

// Apple is connected for this render.
vi.mock("@/features/rooms", () => ({
  useOptionalRooms: () => ({ playbackConnection: { status: "authorized" } }),
}));

// The sidebar shell needs a SidebarStateContext provider it can't get in a unit
// render; stub it to plain passthroughs so the track list stays real.
vi.mock("@/features/spotify-shell/spotify-header", () => ({
  SpotifyHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
}));
vi.mock("@/components/sidebar", () => ({
  SidebarContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

describe("AppleRecent", () => {
  it("renders the listener's recently-played tracks", async () => {
    render(
      <MemoryRouter>
        <AppleRecent />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Recently Played" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
  });
});
