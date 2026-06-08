import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { SpotifyTrack } from "@/features/spotify-client/types";
import { ApplePlaylist } from "./apple-playlist";

const playlist = { id: "p.1", name: "Road Trip", image: null, description: null };
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
  getAppleLibraryPlaylist: () => Promise.resolve(playlist),
  getAppleLibraryPlaylistTracks: () => Promise.resolve(tracks),
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

describe("ApplePlaylist", () => {
  it("renders the playlist's tracks and an enqueue-all action", async () => {
    render(
      <MemoryRouter initialEntries={["/apple-playlist/p.1"]}>
        <Routes>
          <Route path="/apple-playlist/:playlistId" element={<ApplePlaylist />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Road Trip" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 songs")).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Queue Road Trip" }),
    ).toBeInTheDocument();
  });
});
