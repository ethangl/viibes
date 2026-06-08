import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useOptionalRooms } from "../runtime/rooms-context";

/**
 * Surfaces the gestures room audio needs:
 *  1. Connect Apple Music — MusicKit `authorize()` must run from a user click.
 *  2. Start listening — after a reload the browser blocks playback until the
 *     listener interacts (the autoplay policy), even when already authorized.
 * Renders nothing once connected and playing. Lives in the room view; the rest
 * of the player UI is still Spotify-shaped.
 */
export function AppleConnectBanner() {
  const rooms = useOptionalRooms();
  const [connecting, setConnecting] = useState(false);

  if (!rooms) {
    return null;
  }

  const { status, connect } = rooms.playbackConnection;

  if (status !== "authorized") {
    const handleConnect = async () => {
      setConnecting(true);
      try {
        await connect();
      } finally {
        setConnecting(false);
      }
    };

    const busy = connecting || status === "loading";

    return (
      <Banner
        title="Connect Apple Music"
        description={
          status === "error"
            ? "Couldn’t connect. Make sure you have an Apple Music subscription, then try again."
            : "Connect to hear what the room is playing."
        }
        action={busy ? "Connecting…" : "Connect Apple Music"}
        disabled={busy}
        onClick={() => void handleConnect()}
      />
    );
  }

  if (rooms.autoplayBlocked) {
    return (
      <Banner
        title="Start listening"
        description="Your browser paused playback until you tap. Press play to join the room."
        action="Start listening"
        onClick={() => rooms.startPlayback()}
      />
    );
  }

  return null;
}

function Banner({
  title,
  description,
  action,
  disabled = false,
  onClick,
}: {
  title: string;
  description: string;
  action: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/5 p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button size="sm" disabled={disabled} onClick={onClick}>
        {action}
      </Button>
    </div>
  );
}
