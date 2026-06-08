import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoomsContext } from "@/features/rooms/runtime/rooms-context";
import type { SpotifySearchResults } from "@/features/spotify-client/types";
import { SearchProvider } from "./search-provider";
import { SpotifySearch } from "./spotify-search";

type RoomsValue = NonNullable<React.ContextType<typeof RoomsContext>>;

const mockPlayTrack = vi.fn();
const mockScrollTo = vi.fn();

// The active search handler for the current render; each test supplies its own
// catalog response.
let searchHandler: (query: string) => Promise<{ tracks: unknown[] }> = () =>
  Promise.resolve({ tracks: [] });

// Stable identity across renders — the real `useAction` is memoized, and the
// SearchProvider effect depends on it; a fresh function each render would loop.
const mockSearchAction = (args: { query: string }) => searchHandler(args.query);

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock("convex/react", () => ({
  useAction: () => mockSearchAction,
}));

vi.mock("@/features/spotify-player", () => ({
  useWebPlayerActions: () => ({
    playTrack: (...args: unknown[]) => mockPlayTrack(...args),
  }),
  useWebPlayer: () => ({
    playTrack: (...args: unknown[]) => mockPlayTrack(...args),
    currentTrack: null,
    sdkState: null,
    paused: true,
    progressMs: 0,
    durationMs: 0,
    volume: 1,
    expanded: false,
    palette: [],
    queue: [],
    queueIndex: 0,
    shuffled: false,
    hasQueue: false,
    isAuthenticated: true,
    nextTrack: vi.fn(),
    prevTrack: vi.fn(),
    togglePlay: vi.fn(),
    toggleShuffle: vi.fn(),
    setVolume: vi.fn(),
    setExpanded: vi.fn(),
    spotify: {
      init: vi.fn(),
      waitForReady: vi.fn(),
      play: vi.fn(),
      setRepeat: vi.fn(),
    },
  }),
}));

vi.mock("@/hooks/use-debounce", () => ({
  useDebounce: (value: string) => value,
}));

interface SearchOverrides {
  searchResults?: (query: string) => Promise<SpotifySearchResults>;
}

function renderSearch(
  overrides: {
    search?: SearchOverrides;
  } = {},
  options?: { extraUi?: React.ReactNode; rooms?: RoomsValue },
) {
  const searchResults =
    overrides.search?.searchResults ??
    vi.fn().mockResolvedValue({
      tracks: [],
      artists: [],
    });

  searchHandler = searchResults;

  const searchUi = (
    <SearchProvider>
      <SpotifySearch />
      {options?.extraUi}
    </SearchProvider>
  );

  return render(
    <MemoryRouter initialEntries={["/home"]}>
      {options?.rooms ? (
        <RoomsContext.Provider value={options.rooms}>
          {searchUi}
        </RoomsContext.Provider>
      ) : (
        searchUi
      )}
    </MemoryRouter>,
  );
}

function createRoomsValue(overrides: Partial<RoomsValue> = {}): RoomsValue {
  const now = Date.now();

  return {
    activeRoom: {
      room: {
        _id: "room-1" as never,
        slug: "room-1",
        name: "Room 1",
        description: null,
        visibility: "public",
        ownerUserId: "user-1",
        createdAt: now,
        archivedAt: null,
      },
      viewerFollowsRoom: true,
      viewerMembership: {
        _id: "membership-1",
        role: "member",
        active: true,
        joinedAt: now,
        leftAt: null,
      },
      memberCount: 1,
      presentCount: 1,
      presentUsers: [],
      roleHolders: [],
      queueLength: 0,
      queue: [],
      playback: {
        currentQueueItemId: null,
        currentQueueItem: null,
        startedAt: null,
        startOffsetMs: 0,
        paused: true,
        pausedAt: null,
        updatedAt: now,
        canEnqueue: true,
        canManageQueue: false,
        canControlPlayback: false,
      },
    },
    activeRoomLoading: false,
    clearQueue: vi.fn().mockResolvedValue(undefined),
    closeRoom: vi.fn().mockResolvedValue(undefined),
    createRoom: vi.fn().mockResolvedValue("room-1" as never),
    enqueueTrack: vi.fn().mockResolvedValue(undefined),
    enqueueTracks: vi.fn().mockResolvedValue(undefined),
    followRoom: vi.fn().mockResolvedValue(undefined),
    moveQueueItem: vi.fn().mockResolvedValue(undefined),
    openRoom: vi.fn().mockResolvedValue(undefined),
    playbackConnection: {
      status: "idle",
      connect: vi.fn().mockResolvedValue(undefined),
    },
    autoplayBlocked: false,
    startPlayback: vi.fn(),
    removeQueueItem: vi.fn().mockResolvedValue(undefined),
    repairSync: vi.fn(),
    resolvedPlayback: null,
    rooms: [],
    roomsLoading: false,
    skipRoom: vi.fn().mockResolvedValue(undefined),
    syncState: {
      code: "idle",
      label: "Idle",
      driftMs: null,
    },
    unfollowRoom: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function NavigateButton() {
  const navigate = useNavigate();

  return (
    <button onClick={() => navigate("/artist/artist-1")}>Go to artist</button>
  );
}

function LocationDisplay() {
  const location = useLocation();

  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

function getSearchInput() {
  return screen.getByPlaceholderText("Search Apple Music for songs...");
}

function getCommandItem(label: string) {
  const item = screen.getByText(label).closest('[data-slot="command-item"]');
  if (!item) {
    throw new Error(`Could not find command item for ${label}`);
  }
  return item;
}

async function searchFor(query: string) {
  fireEvent.keyDown(document, { key: "k", metaKey: true });
  fireEvent.change(getSearchInput(), { target: { value: query } });
}

describe("search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    window.scrollTo = mockScrollTo;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders songs from a catalog search response", async () => {
    renderSearch({
      search: {
        searchResults: vi.fn().mockResolvedValue({
          tracks: [
            {
              id: "track-1",
              name: "Panopticon",
              artist: "ISIS",
              albumName: "Oceanic",
              albumImage: "track.jpg",
              durationMs: 320000,
              isrc: "USRC10000001",
            },
          ],
          artists: [],
        }),
      },
    });
    await searchFor("isis");

    await waitFor(() => {
      expect(screen.getByText("Songs")).toBeInTheDocument();
    });

    expect(screen.getByText("Panopticon")).toBeInTheDocument();
    expect(screen.getByText("ISIS")).toBeInTheDocument();
  });

  it("queues a selected track from catalog search", async () => {
    const track = {
      id: "track-1",
      name: "Panopticon",
      artist: "ISIS",
      albumName: "Oceanic",
      albumImage: "track.jpg",
      durationMs: 320000,
    };
    const enqueueTrack = vi.fn().mockResolvedValue(undefined);

    renderSearch(
      {
        search: {
          searchResults: vi.fn().mockResolvedValue({
            tracks: [track],
            artists: [],
          }),
        },
      },
      {
        rooms: createRoomsValue({ enqueueTrack }),
      },
    );
    await searchFor("isis");

    await waitFor(() => {
      expect(screen.getByText("Panopticon")).toBeInTheDocument();
    });

    fireEvent.click(getCommandItem("Panopticon"));

    expect(enqueueTrack).toHaveBeenCalledWith(track, "room-1");
    expect(mockPlayTrack).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText("Search Apple Music for songs..."),
      ).not.toBeInTheDocument();
    });
  });

  it("shows a friendly error message when search fails", async () => {
    renderSearch({
      search: {
        searchResults: vi
          .fn()
          .mockRejectedValue(new Error("Could not search Spotify right now.")),
      },
    });
    await searchFor("isis");

    await waitFor(() => {
      expect(
        screen.getByText("Could not search Spotify right now."),
      ).toBeInTheDocument();
    });
  });

  it("clears the search query when navigation changes the url", async () => {
    renderSearch(
      {
        search: {
          searchResults: vi.fn().mockResolvedValue({
            tracks: [
              {
                id: "track-1",
                name: "Panopticon",
                artist: "ISIS",
                albumName: "Oceanic",
                albumImage: "track.jpg",
                durationMs: 320000,
                isrc: "USRC10000001",
              },
            ],
            artists: [],
          }),
        },
      },
      { extraUi: <NavigateButton /> },
    );

    await searchFor("isis");

    await waitFor(() => {
      expect(screen.getByText("Panopticon")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Go to artist"));

    await waitFor(() => {
      expect(getSearchInput()).toHaveValue("");
    });

    expect(screen.queryByText("Panopticon")).not.toBeInTheDocument();
    expect(mockScrollTo).toHaveBeenCalledWith(0, 0);
  });

  it.skip("preserves roomId when opening an artist from search results", async () => {
    const searchResults = vi.fn().mockResolvedValue({
      tracks: [],
      artists: [
        {
          id: "artist-1",
          name: "Mastodon",
          image: "artist.jpg",
          followerCount: 0,
          genres: ["sludge metal"],
        },
      ],
    });

    searchHandler = searchResults;

    render(
      <MemoryRouter initialEntries={["/home?roomId=room-1"]}>
        <SearchProvider>
          <SpotifySearch />
          <LocationDisplay />
        </SearchProvider>
      </MemoryRouter>,
    );

    await searchFor("mastodon");

    await waitFor(() => {
      expect(screen.getByText("Mastodon")).toBeInTheDocument();
    });

    fireEvent.click(getCommandItem("Mastodon"));

    await waitFor(() => {
      expect(screen.getByTestId("location-display")).toHaveTextContent(
        "/artist/artist-1?roomId=room-1",
      );
    });
  });
});
