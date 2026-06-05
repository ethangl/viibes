import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { LoginButton } from "@/features/auth";
import { useAppCapabilities } from "./app-runtime";

export function ReconnectDialog() {
  const { spotifyConnection } = useAppCapabilities();

  if (spotifyConnection === "connected") {
    return null;
  }

  if (spotifyConnection === "unknown") {
    return (
      <div className="fixed bg-background/90 duration-555 flex items-center justify-center left-1/2 rounded-2xl size-8 starting:opacity-0 top-1/2 transition-opacity -translate-x-1/2 -translate-y-1/2 z-100">
        <Spinner />
      </div>
    );
  }

  return (
    <AlertDialog open={spotifyConnection === "disconnected"}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reconnect Spotify</AlertDialogTitle>
          <AlertDialogDescription>
            Your app session is still active, but Spotify access is unavailable.
            Reconnecting should bring back recent plays, playlists, and playback
            controls.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <LoginButton />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
