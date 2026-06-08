import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { LastFmArtistMatch } from "@/features/artist/types";
import { AppleArtist } from "./apple-artist";

const artistDetail = {
  artist: { id: "apple-artist-1", name: "Daft Punk", image: null },
  topSongs: [
    {
      id: "apple-song-1",
      name: "Get Lucky",
      artist: "Daft Punk",
      albumName: "Random Access Memories",
      albumImage: null,
      durationMs: 369_000,
      isrc: "USQX91300108",
    },
  ],
  albums: [
    {
      id: "apple-album-1",
      name: "Random Access Memories",
      image: null,
      releaseDate: "2013-05-17",
      trackCount: 13,
    },
  ],
  singles: [
    {
      id: "apple-single-1",
      name: "Instant Crush",
      image: null,
      releaseDate: "2013-09-03",
      trackCount: 1,
    },
  ],
};

// Stable identity across renders — useAppleArtist's effect depends on the action
// ref; a fresh function each render would loop (see migration-state gotcha).
const mockAction = (args: { artistId?: string; query?: string }) => {
  if ("artistId" in args) return Promise.resolve(artistDetail);
  if ("query" in args) return Promise.resolve({ tracks: [], artists: [] });
  return Promise.resolve(null);
};

vi.mock("convex/react", () => ({ useAction: () => mockAction }));

// The sidebar shell needs a SidebarStateContext provider it can't get in a unit
// render; stub it to plain passthroughs so the data-driven sections stay real.
vi.mock("@/features/spotify-shell/spotify-header", () => ({
  SpotifyHeader: ({ title }: { title: ReactNode }) => <h1>{title}</h1>,
}));
vi.mock("@/components/sidebar", () => ({
  SidebarContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const lastFmArtist: LastFmArtistMatch = {
  artistName: "Daft Punk",
  musicBrainzId: null,
  resolvedVia: "artist_name",
  lastFmUrl: "https://last.fm/music/Daft+Punk",
  stats: { listeners: null, playcount: null },
  bio: { summary: "A French electronic music duo.", published: null },
  topTags: [],
  similarArtists: [{ name: "Justice", musicBrainzId: null, url: null }],
};

vi.mock("@/features/artist/use-lastfm-artist", () => ({
  useLastFmArtist: () => lastFmArtist,
}));

function renderArtist() {
  return render(
    <MemoryRouter initialEntries={["/apple-artist/apple-artist-1"]}>
      <Routes>
        <Route path="/apple-artist/:artistId" element={<AppleArtist />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppleArtist", () => {
  it("renders the artist's top songs, albums, singles, bio, and similar artists", async () => {
    renderArtist();

    expect(
      await screen.findByRole("heading", { name: "Daft Punk", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();

    expect(screen.getByText("Singles")).toBeInTheDocument();
    expect(screen.getByText("Instant Crush")).toBeInTheDocument();

    expect(screen.getByText("Albums")).toBeInTheDocument();
    expect(screen.getByText("Random Access Memories")).toBeInTheDocument();

    expect(screen.getByText("About")).toBeInTheDocument();
    expect(
      screen.getByText("A French electronic music duo."),
    ).toBeInTheDocument();

    expect(screen.getByText("Similar Artists")).toBeInTheDocument();
    expect(screen.getByText("Justice")).toBeInTheDocument();
  });

  it("links albums and singles to their Apple album pages", async () => {
    renderArtist();

    const albumLink = await screen.findByRole("link", {
      name: /Random Access Memories/,
    });
    expect(albumLink).toHaveAttribute("href", "/apple-album/apple-album-1");

    const singleLink = screen.getByRole("link", { name: /Instant Crush/ });
    expect(singleLink).toHaveAttribute("href", "/apple-album/apple-single-1");
  });
});
