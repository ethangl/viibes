import { useState } from "react";

import { SidebarContent } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { useOptionalRooms } from "@/features/rooms";
import { SpotifyHeader } from "@/features/spotify-shell/spotify-header";
import { Tracks } from "@/features/spotify-tracks";
import { useAppleRecentlyPlayed } from "./use-apple-recently-played";

export function AppleRecent() {
  const rooms = useOptionalRooms();
  const connection = rooms?.playbackConnection ?? null;
  const authorized = connection?.status === "authorized";
  const { data: tracks } = useAppleRecentlyPlayed(authorized);
  const [connecting, setConnecting] = useState(false);

  if (!authorized) {
    return (
      <>
        <SpotifyHeader href="/home" title="Recently Played" />
        <SidebarContent>
          <div className="flex flex-col items-start gap-3 px-4 py-8">
            <p className="text-sm text-muted-foreground">
              Connect Apple Music to see your recently played tracks.
            </p>
            {connection ? (
              <Button
                disabled={connecting}
                onClick={() => {
                  setConnecting(true);
                  void connection.connect().finally(() => setConnecting(false));
                }}
              >
                Connect Apple Music
              </Button>
            ) : null}
          </div>
        </SidebarContent>
      </>
    );
  }

  return (
    <>
      <SpotifyHeader href="/home" title="Recently Played" />
      <SidebarContent>
        <Tracks
          title="Recently Played"
          tracks={tracks ?? []}
          getTrackKey={(track, index) => `${track.id}:${index}`}
        />
      </SidebarContent>
    </>
  );
}
