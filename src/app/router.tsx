import { createBrowserRouter } from "react-router-dom";

import { AppleAlbum } from "@/features/apple-music/apple-album";
import { AppleArtist } from "@/features/apple-music/apple-artist";
import { AppleActivity } from "@/features/apple-music/apple-home";
import { ApplePlaylist } from "@/features/apple-music/apple-playlist";
import { Playlist } from "@/features/spotify-playlists/playlist";
import { SpotifyActivity, SpotifyActivityProvider } from "@/features/spotify-shell";
import { HomeRoute, NotFoundRoute } from "@/routes";
import { AppShell } from "./app-shell";
import { AuthedLayout } from "./authed-layout";
import { RequireAuthenticatedSession } from "./require-authenticated-session";
import { RouteErrorBoundary } from "./route-error-boundary";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <HomeRoute /> },
      {
        element: <RequireAuthenticatedSession />,
        children: [
          {
            element: <AuthedLayout />,
            children: [
              {
                path: "home",
                element: (
                  <SpotifyActivityProvider>
                    <SpotifyActivity />
                  </SpotifyActivityProvider>
                ),
              },
              { path: "apple-home", element: <AppleActivity /> },
              { path: "apple-artist/:artistId", element: <AppleArtist /> },
              { path: "apple-album/:albumId", element: <AppleAlbum /> },
              { path: "apple-playlist/:playlistId", element: <ApplePlaylist /> },
              {
                path: "playlist/:playlistId",
                element: <Playlist />,
              },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);
