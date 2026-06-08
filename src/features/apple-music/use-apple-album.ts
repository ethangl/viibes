import { api } from "@api";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

import type { AppleTrack } from "./apple-track";

export interface AppleAlbumDetail {
  album: {
    id: string;
    name: string;
    artistName: string;
    artistId: string | null;
    image: string | null;
  };
  tracks: readonly AppleTrack[];
}

export type AppleAlbumState =
  | { status: "loading" }
  | { status: "ready"; detail: AppleAlbumDetail }
  | { status: "not_found" }
  | { status: "error" };

/**
 * Loads an Apple catalog album + its tracks (dev-token only, no connection
 * required). One-shot fetch per `albumId`. Mirrors {@link useAppleArtist}.
 */
export function useAppleAlbum(albumId: string): AppleAlbumState {
  const fetchAlbum = useAction(api.playback.album);
  const [state, setState] = useState<AppleAlbumState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    void fetchAlbum({ albumId })
      .then((detail) => {
        if (cancelled) return;
        setState(
          detail ? { status: "ready", detail } : { status: "not_found" },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setState({ status: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [albumId, fetchAlbum]);

  return state;
}
