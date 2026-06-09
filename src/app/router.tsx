import { createBrowserRouter } from "react-router-dom";

import { AppleAlbum } from "@/features/apple-music/apple-album";
import { AppleArtist } from "@/features/apple-music/apple-artist";
import { AppleActivity } from "@/features/apple-music/apple-home";
import { ApplePlaylist } from "@/features/apple-music/apple-playlist";
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
              { path: "apple-home", element: <AppleActivity /> },
              { path: "apple-artist/:artistId", element: <AppleArtist /> },
              { path: "apple-album/:albumId", element: <AppleAlbum /> },
              { path: "apple-playlist/:playlistId", element: <ApplePlaylist /> },
            ],
          },
        ],
      },
      { path: "*", element: <NotFoundRoute /> },
    ],
  },
]);
