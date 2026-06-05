import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LoginButton } from "@/features/auth";
import { useAppCapabilities } from "./app-runtime";

export function ReconnectDialog() {
  const { spotifyConnection } = useAppCapabilities();

  const canBrowsePersonalSpotify = spotifyConnection === "connected";
  const isCheckingSpotifyConnection = spotifyConnection === "unknown";

  return (
    <AlertDialog open={!canBrowsePersonalSpotify}>
      <AlertDialogContent>
        {isCheckingSpotifyConnection ? (
          <AlertDialogHeader>
            <AlertDialogTitle>
              Checking your Spotify connection
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your app session is active. We&apos;re confirming Spotify access
              before we turn on personal activity and playback controls.
            </AlertDialogDescription>
          </AlertDialogHeader>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Reconnect Spotify to restore personal features
              </AlertDialogTitle>
              <AlertDialogDescription>
                Your app session is still active, but Spotify access is
                unavailable right now. Reconnecting should bring back recent
                plays, playlists, and playback controls.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <LoginButton />
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
