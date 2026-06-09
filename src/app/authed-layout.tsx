import { FC } from "react";
import { Outlet } from "react-router-dom";

import { Main, MainWrapper } from "@/components/main";
import { Sidebar, SidebarWrapper } from "@/components/sidebar";
import { Chat } from "@/features/chat/chat";
import { useRoomPageState } from "@/features/rooms/runtime/use-room-page-state";
import { Room } from "@/features/rooms/ui/room";
import { RoomCreateForm } from "@/features/rooms/ui/room-create-form";
import { RoomHeader } from "@/features/rooms/ui/room-header";
import { Rooms } from "@/features/rooms/ui/rooms";
import { RoomsHeader } from "@/features/rooms/ui/rooms-header";
import { MiniPlayer } from "@/features/spotify-player/mini-player";
import { Player } from "@/features/spotify-player/player";
import { PlayerWrapper } from "@/features/spotify-player/player-wrapper2";
import { useNowPlaying } from "@/features/spotify-player/use-now-playing";

export const AuthedLayout: FC = () => {
  const { isPlaying } = useNowPlaying();
  const { roomId } = useRoomPageState();
  return (
    <div className="absolute gap-3 grid grid-cols-[auto_1fr_auto] inset-0 items-stretch p-3 overflow-x-auto scrollbar-none">
      <Sidebar>
        <SidebarWrapper style={{ "--section-color": "var(--color-red-400)" }}>
          <Outlet />
        </SidebarWrapper>
      </Sidebar>
      <Main className={isPlaying ? "gap-3" : "gap-0"}>
        <MainWrapper>
          {roomId ? (
            <>
              <RoomHeader roomId={roomId} />
              <Room roomId={roomId} />
            </>
          ) : (
            <>
              <RoomsHeader />
              <Rooms />
            </>
          )}
        </MainWrapper>
        <PlayerWrapper>
          <MiniPlayer />
        </PlayerWrapper>
      </Main>
      {roomId ? <Chat roomId={roomId} /> : <RoomCreateForm />}
      <Player />
    </div>
  );
};
