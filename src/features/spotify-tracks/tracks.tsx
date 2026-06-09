import { FC, ReactNode } from "react";

import { List } from "@/components/list";
import {
  Section,
  SectionDescription,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import type { SpotifyTrack } from "@/features/spotify-client/types";
import { EnqueueTrackButton } from "./enqueue-track-button";
import { TrackCell } from "./track-cell";

export type TracksProps = {
  action?: ReactNode;
  description?: string | null;
  getTrackKey?: (track: SpotifyTrack, index: number) => React.Key;
  paginate?: ReactNode;
  renderTrackAction?: (track: SpotifyTrack) => ReactNode;
  tracks: SpotifyTrack[];
  title?: string;
};

export const Tracks: FC<TracksProps> = ({
  action,
  description,
  getTrackKey,
  paginate,
  title,
  tracks,
}) => {
  if (tracks.length === 0) {
    return null;
  }

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>
          {title}
          {action}
        </SectionTitle>
        {description && <SectionDescription>{description}</SectionDescription>}
      </SectionHeader>
      <List count={tracks.length}>
        {tracks.map((track, index) => (
          <TrackCell
            key={getTrackKey?.(track, index) ?? track.id}
            track={track}
          >
            <EnqueueTrackButton track={track} />
          </TrackCell>
        ))}
        {paginate}
      </List>
    </Section>
  );
};
