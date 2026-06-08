import { RefreshCwIcon } from "lucide-react";

import { AppLink } from "@/components/app-link";
import { LoadMoreButton } from "@/components/load-more-button";
import { SidebarContent } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Artists } from "@/features/artist";
import {
  useSpotifyFavoriteArtists,
  useSpotifyPlaylists,
  useSpotifyRecentlyPlayed,
} from "@/features/spotify-library";
import { Playlists } from "@/features/spotify-playlists";
import { Tracks } from "@/features/spotify-tracks";
import { SpotifyHeader } from "./spotify-header";

export function SpotifyActivity() {
  const {
    loadMoreRecentTracks,
    loading: recentTracksLoading,
    recentTracks,
    recentTracksHasMore,
    recentTracksLoadingMore,
  } = useSpotifyRecentlyPlayed();
  const {
    favoriteArtists,
    favoriteArtistsHasMore,
    favoriteArtistsLoading,
    favoriteArtistsLoadingMore,
    loadFavoriteArtists,
    loadMoreFavoriteArtists,
  } = useSpotifyFavoriteArtists();
  const {
    loadMorePlaylists,
    playlists,
    playlistsHasMore,
    playlistsLoading,
    playlistsLoadingMore,
    loadPlaylists,
  } = useSpotifyPlaylists();

  const hasPlaylists = playlists.length > 0;
  const hasFavoriteArtists = favoriteArtists.length > 0;

  return (
    <>
      <SpotifyHeader title="Spotify" />
      <SidebarContent>
        {/* Interim entry to the Apple Music library (parity build); folds into
            the Apple home dashboard when the shell rework lands. */}
        <div className="px-4 pt-2">
          <Button
            size="xs"
            nativeButton={false}
            render={<AppLink href="/apple-playlists">Apple Music Playlists →</AppLink>}
          />
        </div>
        <Playlists
          title="Your Playlists"
          playlists={playlists}
          action={
            <Button
              variant="overlay"
              size="icon"
              disabled={playlistsLoading || playlistsLoadingMore}
              onClick={() => void loadPlaylists(hasPlaylists)}
            >
              <RefreshCwIcon
                className={playlistsLoading ? "animate-spin" : undefined}
              />
            </Button>
          }
          paginate={
            playlistsHasMore && (
              <LoadMoreButton
                disabled={playlistsLoading || playlistsLoadingMore}
                loading={playlistsLoadingMore}
                onClick={() => void loadMorePlaylists()}
              />
            )
          }
        />
        <Artists
          title="Your Favorite Artists"
          artists={favoriteArtists}
          action={
            <Button
              variant="overlay"
              size="icon"
              disabled={favoriteArtistsLoading || favoriteArtistsLoadingMore}
              onClick={() => void loadFavoriteArtists(hasFavoriteArtists)}
            >
              <RefreshCwIcon
                className={favoriteArtistsLoading ? "animate-spin" : undefined}
              />
            </Button>
          }
          paginate={
            favoriteArtistsHasMore && (
              <LoadMoreButton
                disabled={favoriteArtistsLoading || favoriteArtistsLoadingMore}
                loading={favoriteArtistsLoadingMore}
                onClick={() => void loadMoreFavoriteArtists()}
              />
            )
          }
        />
        <Tracks
          title="Recent Tracks"
          getTrackKey={(_track, index) => {
            const recentTrack = recentTracks[index];
            return recentTrack
              ? `${recentTrack.track.id}:${recentTrack.playedAt}`
              : index;
          }}
          tracks={recentTracks.map(({ track }) => track)}
          paginate={
            recentTracksHasMore && (
              <LoadMoreButton
                disabled={recentTracksLoading || recentTracksLoadingMore}
                loading={recentTracksLoadingMore}
                onClick={() => void loadMoreRecentTracks()}
              />
            )
          }
        />
      </SidebarContent>
    </>
  );
}
