import { LogOutIcon } from "lucide-react";

import { useAppAuth } from "@/app/app-runtime";
import { Avatar } from "@/components/avatar";
import { SidebarFooter } from "@/components/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClearSpotifyCacheButton } from "@/features/spotify-shell/clear-spotify-cache-button";
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session";

export function SpotifyFooter() {
  const session = useAuthenticatedSession();
  const { signOut } = useAppAuth();

  return (
    <SidebarFooter>
      <span />
      <DropdownMenu>
        <DropdownMenuTrigger>
          <Avatar
            id={session.user.id}
            image={session.user.image || null}
            name={session.user.name}
            sizeClassName="size-8 text-xl"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <ClearSpotifyCacheButton />
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOutIcon /> Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
}
