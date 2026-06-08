import { CircleQuestionMarkIcon } from "lucide-react";
import { useParams } from "react-router-dom";

import { SidebarContent } from "@/components/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { SpotifyHeader } from "@/features/spotify-shell/spotify-header";
import { Tracks } from "@/features/spotify-tracks";
import { toSpotifyTracks } from "./apple-track";
import { useAppleAlbum } from "./use-apple-album";

export function AppleAlbum() {
  const { albumId = "" } = useParams();
  const state = useAppleAlbum(albumId);

  if (state.status === "loading") {
    return (
      <>
        <SpotifyHeader href="/home" title={<Spinner />} />
        <SidebarContent />
      </>
    );
  }

  if (state.status === "not_found" || state.status === "error") {
    return (
      <>
        <SpotifyHeader href="/home" title={<CircleQuestionMarkIcon />} />
        <SidebarContent>
          <p className="py-32 text-center text-muted-foreground">
            {state.status === "not_found"
              ? "That album could not be found on Apple Music."
              : "Couldn’t load this album. Try again."}
          </p>
        </SidebarContent>
      </>
    );
  }

  const { album, tracks } = state.detail;
  const backHref = album.artistId ? `/apple-artist/${album.artistId}` : "/home";

  return (
    <>
      <SpotifyHeader
        href={backHref}
        title={album.name}
        subtitle={album.artistName}
      />
      <SidebarContent>
        <Tracks
          title={album.name}
          description={album.artistName}
          tracks={toSpotifyTracks(tracks)}
        />
      </SidebarContent>
    </>
  );
}
