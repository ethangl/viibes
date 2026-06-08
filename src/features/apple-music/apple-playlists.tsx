import { useState } from "react";

import { List } from "@/components/list";
import { Section, SectionHeader, SectionTitle } from "@/components/section";
import { SidebarContent } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useOptionalRooms } from "@/features/rooms";
import { PlaylistCell } from "@/features/spotify-playlists/playlist-cell";
import { SpotifyHeader } from "@/features/spotify-shell/spotify-header";
import { useAppleLibraryPlaylists } from "./use-apple-library-playlists";

export function ApplePlaylists() {
  const rooms = useOptionalRooms();
  const connection = rooms?.playbackConnection ?? null;
  const authorized = connection?.status === "authorized";
  const { data: playlists, loading } = useAppleLibraryPlaylists(authorized);
  const [connecting, setConnecting] = useState(false);

  if (!authorized) {
    return (
      <>
        <SpotifyHeader href="/home" title="Your Playlists" />
        <SidebarContent>
          <div className="flex flex-col items-start gap-3 px-4 py-8">
            <p className="text-sm text-muted-foreground">
              Connect Apple Music to see your playlists.
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
      <SpotifyHeader href="/home" title="Your Playlists" />
      <SidebarContent>
        {loading && !playlists ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <Section>
            <SectionHeader>
              <SectionTitle>Your Playlists</SectionTitle>
            </SectionHeader>
            <List count={playlists?.length ?? 0}>
              {(playlists ?? []).map((playlist) => (
                <PlaylistCell
                  key={playlist.id}
                  href={`/apple-playlist/${playlist.id}`}
                  image={playlist.image}
                  name={playlist.name}
                  subtitle={playlist.description ?? undefined}
                />
              ))}
            </List>
          </Section>
        )}
      </SidebarContent>
    </>
  );
}
