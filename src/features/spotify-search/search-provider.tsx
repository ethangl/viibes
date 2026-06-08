import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useAction } from "convex/react";

import type {
  SpotifySearchResults,
  SpotifyTrack,
} from "@/features/spotify-client/types";
import { useDebounce } from "@/hooks/use-debounce";
import { api } from "@api";

const EMPTY_RESULTS: SpotifySearchResults = {
  tracks: [],
  artists: [],
};

interface CatalogTrack {
  id: string;
  name: string;
  artist: string;
  albumName: string;
  albumImage: string | null;
  durationMs: number;
  isrc: string | null;
}

/** Map an Apple catalog song onto the track shape the queue/UI consume. */
function toTrack(song: CatalogTrack): SpotifyTrack {
  return {
    id: song.id,
    name: song.name,
    artist: song.artist,
    albumName: song.albumName,
    albumImage: song.albumImage,
    durationMs: song.durationMs,
    // exactOptionalPropertyTypes: omit `isrc` entirely rather than set undefined.
    ...(song.isrc ? { isrc: song.isrc } : {}),
  };
}

type SearchState = {
  error: string | null;
  loading: boolean;
  results: SpotifySearchResults;
};

const IDLE_SEARCH_STATE: SearchState = {
  error: null,
  loading: false,
  results: EMPTY_RESULTS,
};

interface SearchContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  query: string;
  setQuery: (query: string) => void;
  results: SpotifySearchResults;
  loading: boolean;
  error: string | null;
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within a SearchProvider");
  return ctx;
}

export function SearchProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const searchCatalog = useAction(api.playback.searchCatalog);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState(IDLE_SEARCH_STATE);
  const debouncedQuery = useDebounce(query, 300);
  const lastLocationKeyRef = useRef(location.key);
  const trimmedQuery = query.trim();
  const canSearch =
    trimmedQuery !== "" && debouncedQuery.trim() === trimmedQuery;

  useEffect(() => {
    if (lastLocationKeyRef.current === location.key) {
      return;
    }

    lastLocationKeyRef.current = location.key;
    window.scrollTo(0, 0);
    setQuery("");
    setSearchState(IDLE_SEARCH_STATE);
  }, [location.key]);

  useEffect(() => {
    if (!canSearch) {
      setSearchState(IDLE_SEARCH_STATE);
      return;
    }

    let cancelled = false;

    setSearchState({
      error: null,
      loading: true,
      results: EMPTY_RESULTS,
    });

    void searchCatalog({ query: trimmedQuery })
      .then((nextResults) => {
        if (cancelled) {
          return;
        }

        // Apple catalog search returns songs only; the artist row stays empty
        // until/if we add Apple artist search.
        setSearchState({
          error: null,
          loading: false,
          results: { tracks: nextResults.tracks.map(toTrack), artists: [] },
        });
      })
      .catch((nextError) => {
        if (cancelled) {
          return;
        }

        setSearchState({
          error:
            nextError instanceof Error
              ? nextError.message
              : "Could not search Apple Music right now.",
          loading: false,
          results: EMPTY_RESULTS,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [canSearch, searchCatalog, trimmedQuery]);

  const value = useMemo(
    () => ({
      open,
      error: canSearch ? searchState.error : null,
      loading: canSearch ? searchState.loading : false,
      query,
      results: canSearch ? searchState.results : EMPTY_RESULTS,
      setOpen,
      setQuery,
    }),
    [canSearch, open, query, searchState],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}
