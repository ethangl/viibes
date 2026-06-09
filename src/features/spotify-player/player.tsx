import { FC } from "react";

import { cn } from "@/lib/utils";
import { usePlayerExpanded } from "./player-expanded-context";
import { StandardPlayer } from "./standard-player";

export const Player: FC = () => {
  const { expanded, setExpanded } = usePlayerExpanded();
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 pointer-events-none transition-all z-45",
          expanded && "backdrop-blur-xs pointer-events-auto",
        )}
        onClick={() => setExpanded(false)}
      />
      <StandardPlayer />
    </>
  );
};
