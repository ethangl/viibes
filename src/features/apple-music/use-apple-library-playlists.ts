import { useCallback } from "react";

import { useStableAction } from "@/hooks/use-stable-action";
import {
  getAppleLibraryPlaylists,
  type ApplePlaylist,
} from "./apple-library-client";

/**
 * Loads the listener's Apple Music library playlists. Disabled until Apple is
 * connected (the Music User Token is required), so callers pass the authorized
 * flag from `playbackConnection.status`.
 */
export function useAppleLibraryPlaylists(enabled: boolean) {
  return useStableAction<ApplePlaylist[]>({
    enabled,
    load: useCallback(async () => getAppleLibraryPlaylists(), []),
  });
}
