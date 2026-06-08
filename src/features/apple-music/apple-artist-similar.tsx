import { api } from "@api";
import { useAction } from "convex/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import { Button } from "@/components/ui/button";
import type { LastFmSimilarArtist } from "@/features/artist/types";

/**
 * Similar artists (from Last.fm, name-keyed). Clicking resolves the name against
 * the Apple catalog and navigates to that artist's Apple page — keeping the
 * browse experience entirely on Apple (no Spotify routes / MusicBrainz ids).
 */
export function AppleArtistSimilar({
  similarArtists,
}: {
  similarArtists: LastFmSimilarArtist[];
}) {
  const search = useAction(api.playback.searchCatalog);
  const navigate = useNavigate();
  const [resolvingName, setResolvingName] = useState<string | null>(null);

  if (similarArtists.length === 0) {
    return null;
  }

  const resolve = async (name: string) => {
    if (resolvingName) return;
    setResolvingName(name);
    try {
      const { artists } = await search({ query: name });
      const match = artists[0];
      if (match) {
        navigate(`/apple-artist/${match.id}`);
      }
    } finally {
      setResolvingName(null);
    }
  };

  return (
    <Section>
      <SectionHeader>
        <SectionTitle>Similar Artists</SectionTitle>
      </SectionHeader>
      <SectionContent className="flex flex-wrap gap-2">
        {similarArtists.map((similarArtist) => (
          <Button
            key={`${similarArtist.name}:${similarArtist.musicBrainzId ?? "none"}`}
            size="xs"
            disabled={resolvingName !== null}
            onClick={() => void resolve(similarArtist.name)}
          >
            {similarArtist.name}
          </Button>
        ))}
      </SectionContent>
    </Section>
  );
}
