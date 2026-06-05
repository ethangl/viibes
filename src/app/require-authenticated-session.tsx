import { Navigate, Outlet, useLocation } from "react-router-dom";

import { RoomsProvider } from "@/features/rooms";
import { WebPlayerProvider } from "@/features/spotify-player";

import { SearchProvider } from "@/features/spotify-search/search-provider";
import { SpotifySearch } from "@/features/spotify-search/spotify-search";
import { SpotifyActivityProvider } from "@/features/spotify-shell";
import { useAppAuth } from "./app-runtime";
import { AuthPendingState } from "./auth-pending-state";
import { ReconnectDialog } from "./reconnect-dialog";

export function RequireAuthenticatedSession() {
  const location = useLocation();
  const { isPending, session } = useAppAuth();

  if (isPending) {
    return (
      <AuthPendingState
        title="Loading your app session"
        description="We’re checking whether your Spotify session is ready before we open the signed-in app."
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

  return (
    <SpotifyActivityProvider>
      <WebPlayerProvider>
        <RoomsProvider>
          <SearchProvider>
            <Outlet />
            <SpotifySearch />
            <ReconnectDialog />
          </SearchProvider>
        </RoomsProvider>
      </WebPlayerProvider>
    </SpotifyActivityProvider>
  );
}
