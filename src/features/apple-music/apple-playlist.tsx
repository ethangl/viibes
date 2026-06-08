import { FC, useCallback } from "react";
import { useParams } from "react-router-dom";

import { SidebarContent } from "@/components/sidebar";
import type { SpotifyTrack } from "@/features/spotify-client/types";
import { SpotifyHeader } from "@/features/spotify-shell/spotify-header";
import { Tracks } from "@/features/spotify-tracks";
import { useStableAction } from "@/hooks/use-stable-action";
import { AppleEnqueuePlaylistButton } from "./apple-enqueue-playlist-button";
import {
  getAppleLibraryPlaylist,
  getAppleLibraryPlaylistTracks,
  type ApplePlaylist as ApplePlaylistData,
} from "./apple-library-client";

export const ApplePlaylist: FC = () => {
  const { playlistId } = useParams();

  const { data: playlist } = useStableAction<ApplePlaylistData | null>({
    enabled: Boolean(playlistId),
    keepDataOnLoad: false,
    load: useCallback(
      async () => (playlistId ? getAppleLibraryPlaylist(playlistId) : null),
      [playlistId],
    ),
  });

  const { data: tracks } = useStableAction<SpotifyTrack[]>({
    enabled: Boolean(playlistId),
    keepDataOnLoad: false,
    load: useCallback(
      async () => (playlistId ? getAppleLibraryPlaylistTracks(playlistId) : []),
      [playlistId],
    ),
  });

  if (!playlist) {
    return null;
  }

  return (
    <>
      <SpotifyHeader href="/apple-playlists" title="Playlist" />
      <SidebarContent>
        <Tracks
          title={playlist.name}
          description={`${tracks?.length ?? 0} songs`}
          action={
            <AppleEnqueuePlaylistButton
              tracks={tracks ?? []}
              name={playlist.name}
            />
          }
          tracks={tracks ?? []}
        />
      </SidebarContent>
    </>
  );
};
