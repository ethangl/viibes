import { api } from "@api";
import { useAction } from "convex/react";
import { useCallback } from "react";

import { useStableAction } from "@/hooks/use-stable-action";
import type { LastFmArtistMatch } from "./types";

export function useLastFmArtist({
  artistName,
  musicBrainzId,
}: {
  artistName: string;
  musicBrainzId: string | null;
}) {
  const normalizedArtistName = artistName.trim();
  const artistDetails = useAction(api.lastfm.artistDetails);

  const { data } = useStableAction<LastFmArtistMatch>({
    enabled: normalizedArtistName !== "",
    load: useCallback(async () => {
      return await artistDetails({
        artistName: normalizedArtistName,
        musicBrainzId,
      });
    }, [artistDetails, musicBrainzId, normalizedArtistName]),
  });

  return data;
}
