import { LogOutIcon } from "lucide-react";
import { FC } from "react";

import { useAppAuth } from "@/app/app-runtime";
import { Avatar } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClearSpotifyCacheButton } from "@/features/spotify-shell/clear-spotify-cache-button";
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session";

export const UserMenu: FC = () => {
  const session = useAuthenticatedSession();
  const { signOut } = useAppAuth();
  return (
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
  );
};
