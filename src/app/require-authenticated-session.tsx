import { Navigate, Outlet, useLocation } from "react-router-dom";

import { RoomsProvider } from "@/features/rooms";

import { SearchProvider } from "@/features/spotify-search/search-provider";
import { SpotifySearch } from "@/features/spotify-search/spotify-search";
import { useAppAuth } from "./app-runtime";
import { AuthPendingState } from "./auth-pending-state";

export function RequireAuthenticatedSession() {
  const location = useLocation();
  const { isPending, session } = useAppAuth();

  if (isPending) {
    return (
      <AuthPendingState
        title="Loading your app session"
        description="Getting your session ready before we open the app."
      />
    );
  }

  if (!session) {
    return (
      <Navigate
        to={{
          pathname: "/",
          search: location.search,
        }}
        replace
      />
    );
  }

  // Guest-default: no Spotify-specific providers gate the app. The Spotify
  // library dashboard provider (`SpotifyActivityProvider`) is scoped to the
  // legacy `/home` route, and the Spotify reconnect nag is gone — Spotify is
  // now opt-in legacy, not a requirement.
  return (
    <RoomsProvider>
      <SearchProvider>
        <Outlet />
        <SpotifySearch />
      </SearchProvider>
    </RoomsProvider>
  );
}
