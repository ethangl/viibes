import { createBrowserRouter, Outlet } from "react-router-dom";

import { AppleAlbum } from "@/features/apple-music/apple-album";
import { AppleArtist } from "@/features/apple-music/apple-artist";
import { ApplePlaylist } from "@/features/apple-music/apple-playlist";
import { ApplePlaylists } from "@/features/apple-music/apple-playlists";
import { AppleRecent } from "@/features/apple-music/apple-recent";
import { ArtistProvider } from "@/features/artist";
import { Artist } from "@/features/artist/artist";
import { Release } from "@/features/release/release";
import { ReleaseProvider } from "@/features/release/release-provider";
import { Playlist } from "@/features/spotify-playlists/playlist";
import { SpotifyActivity } from "@/features/spotify-shell";
import { ArtistResolveRoute, HomeRoute, NotFoundRoute } from "@/routes";
import { AppShell } from "./app-shell";
import { AuthedLayout } from "./authed-layout";
import { RequireAuthenticatedSession } from "./require-authenticated-session";

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomeRoute /> },
      {
        element: <RequireAuthenticatedSession />,
        children: [
          {
            element: <AuthedLayout />,
            children: [
              { path: "home", element: <SpotifyActivity /> },
              { path: "apple-artist/:artistId", element: <AppleArtist /> },
              { path: "apple-album/:albumId", element: <AppleAlbum /> },
              { path: "apple-playlists", element: <ApplePlaylists /> },
              { path: "apple-playlist/:playlistId", element: <ApplePlaylist /> },
              { path: "apple-recent", element: <AppleRecent /> },
              {
                path: "artist/resolve/:musicBrainzArtistId",
                element: <ArtistResolveRoute />,
              },
              {
                path: "artist/:artistId",
                element: (
                  <ArtistProvider>
                    <Outlet />
                  </ArtistProvider>
                ),
                children: [
                  {
                    index: true,
                    element: <Artist />,
                  },
                  {
                    path: "release/:releaseId",
                    element: (
                      <ReleaseProvider>
                        <Release />
                      </ReleaseProvider>
                    ),
                  },
                ],
              },
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
