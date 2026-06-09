import { LogInIcon, LogOutIcon } from "lucide-react";
import { FC } from "react";

import { useAppAuth, useAppCapabilities } from "@/app/app-runtime";
import { Avatar } from "@/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthenticatedSession } from "@/hooks/use-authenticated-session";

export const UserMenu: FC = () => {
  const session = useAuthenticatedSession();
  const { signOut, signIn } = useAppAuth();
  // canCreateRoom is true only for a real (non-guest) account, so it doubles as
  // "is signed in" here.
  const { canCreateRoom: isSignedIn } = useAppCapabilities();

  const startGoogleAuth = () =>
    void signIn.social({
      provider: "google",
      callbackURL: "/",
      errorCallbackURL: "/?authProvider=google",
    });

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
        {isSignedIn ? (
          <DropdownMenuItem onClick={() => signOut()}>
            <LogOutIcon /> Sign Out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={startGoogleAuth}>
            <LogInIcon /> Sign in with Google
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
