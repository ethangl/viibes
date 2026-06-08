import { CircleQuestionMarkIcon } from "lucide-react";
import { useParams } from "react-router-dom";

import { SidebarContent } from "@/components/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { ArtistLastFmOverview, Releases } from "@/features/artist";
import { useLastFmArtist } from "@/features/artist/use-lastfm-artist";
import type {
  SpotifyAlbumRelease,
  SpotifyPage,
} from "@/features/spotify-client/types";
import { SpotifyHeader } from "@/features/spotify-shell/spotify-header";
import { Tracks } from "@/features/spotify-tracks";
import { AppleArtistSimilar } from "./apple-artist-similar";
import { toSpotifyTracks } from "./apple-track";
import { useAppleArtist, type AppleRelease } from "./use-apple-artist";

/** Adapt Apple releases to the `Releases` component's (paginated) Spotify shape. */
function toReleasePage(
  releases: readonly AppleRelease[],
): SpotifyPage<SpotifyAlbumRelease> {
  return {
    items: releases.map((release) => ({
      id: release.id,
      name: release.name,
      image: release.image,
      releaseDate: release.releaseDate,
      totalTracks: release.trackCount,
      albumType: null,
    })),
    offset: 0,
    limit: releases.length,
    total: releases.length,
    nextOffset: null,
    hasMore: false,
  };
}

export function AppleArtist() {
  const { artistId = "" } = useParams();
  const state = useAppleArtist(artistId);

  // Last.fm enrichment (bio + similar artists) is keyed on the artist's name, so
  // it ports straight from the Spotify page; only meaningful once the artist loads.
  const artistName = state.status === "ready" ? state.detail.artist.name : "";
  const lastFmArtist = useLastFmArtist({ artistName, musicBrainzId: null });

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
              ? "That artist could not be found on Apple Music."
              : "Couldn’t load this artist. Try again."}
          </p>
        </SidebarContent>
      </>
    );
  }

  const { artist, topSongs, albums, singles } = state.detail;

  return (
    <>
      <SpotifyHeader href="/home" title={artist.name} />
      <SidebarContent>
        <Tracks title="Top Tracks" tracks={toSpotifyTracks(topSongs)} />
        <Releases
          title="Singles"
          page={toReleasePage(singles)}
          hrefFor={(release) => `/apple-album/${release.id}`}
        />
        <Releases
          title="Albums"
          page={toReleasePage(albums)}
          hrefFor={(release) => `/apple-album/${release.id}`}
        />
        <ArtistLastFmOverview artist={lastFmArtist} />
        <AppleArtistSimilar
          similarArtists={lastFmArtist?.similarArtists ?? []}
        />
      </SidebarContent>
    </>
  );
}
