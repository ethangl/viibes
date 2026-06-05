import { FC, useCallback } from "react";
import { useParams } from "react-router-dom";

import { SidebarContent } from "@/components/sidebar";
import { LoginButton } from "@/features/auth";
import { getSpotifyErrorMessage } from "@/features/spotify-client/spotify-error";
import type {
  SpotifyPlaylist,
  SpotifyTrack,
} from "@/features/spotify-client/types";
import { Tracks } from "@/features/spotify-tracks";
import { useStableAction } from "@/hooks/use-stable-action";
import { SpotifyHeader } from "../spotify-shell/spotify-header";
import { EnqueuePlaylistButton } from "./enqueue-playlist-button";
import {
  getSpotifyPlaylist,
  getSpotifyPlaylistTracks,
} from "./spotify-playlist-client";

export const Playlist: FC = () => {
  const { playlistId } = useParams();

  const { data: playlist, error: playlistError } =
    useStableAction<SpotifyPlaylist | null>({
      enabled: Boolean(playlistId),
      keepDataOnLoad: false,
      load: useCallback(async () => {
        if (!playlistId) {
          return null;
        }

        return await getSpotifyPlaylist(playlistId);
      }, [playlistId]),
      mapError: useCallback(
        (error: unknown) =>
          getSpotifyErrorMessage(error, "Could not load this playlist."),
        [],
      ),
    });

  const { data: tracks } = useStableAction<SpotifyTrack[]>({
    enabled: Boolean(playlistId),
    keepDataOnLoad: false,
    load: useCallback(async () => {
      if (!playlistId) {
        return [];
      }

      return await getSpotifyPlaylistTracks(playlistId);
    }, [playlistId]),
  });

  if (!playlist) {
    // A failed load used to render a blank screen (the action's real error was
    // an opaque UnknownException). Now the typed error surfaces a message and a
    // reconnect affordance for the "Reconnect Spotify" case.
    if (playlistError) {
      return (
        <>
          <SpotifyHeader href="/home" title="Playlist" />
          <SidebarContent>
            <div className="flex flex-col items-start gap-3 px-4 py-8">
              <p className="text-sm text-muted-foreground">{playlistError}</p>
              <LoginButton />
            </div>
          </SidebarContent>
        </>
      );
    }

    return null;
  }

  return (
    <>
      <SpotifyHeader href="/home" title="Playlist" />
      <SidebarContent>
        <Tracks
          title={playlist.name}
          description={
            playlist.owner
              ? `${tracks?.length} songs by ${playlist.owner}`
              : `${tracks?.length} songs`
          }
          action={<EnqueuePlaylistButton playlist={playlist} />}
          tracks={tracks ?? []}
        />
      </SidebarContent>
    </>
  );
};
