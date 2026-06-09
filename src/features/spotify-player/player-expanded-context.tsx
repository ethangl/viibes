import {
  createContext,
  useContext,
  useMemo,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

type PlayerExpandedValue = {
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
};

const PlayerExpandedContext = createContext<PlayerExpandedValue | null>(null);

/**
 * Holds the bottom player's expanded/collapsed state. Previously this lived on
 * the Spotify web-player context; it's UI-only and shared between the MiniPlayer
 * (expand), the StandardPlayer (collapse), and the Player overlay (backdrop).
 */
export const PlayerExpandedProvider: FC<PropsWithChildren> = ({ children }) => {
  const [expanded, setExpanded] = useState(false);
  const value = useMemo(() => ({ expanded, setExpanded }), [expanded]);

  return (
    <PlayerExpandedContext.Provider value={value}>
      {children}
    </PlayerExpandedContext.Provider>
  );
};

export function usePlayerExpanded(): PlayerExpandedValue {
  const value = useContext(PlayerExpandedContext);
  if (!value) {
    throw new Error(
      "usePlayerExpanded must be used within a PlayerExpandedProvider.",
    );
  }

  return value;
}
