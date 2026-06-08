import { useState } from "react";

import { useMusicKit, type MusicKitSearchResult } from "./use-musickit";

/**
 * Dev-only harness to verify MusicKit JS works end-to-end in a real browser
 * with a signed-in Apple Music subscriber, before wiring Apple into the room
 * playback architecture (3-3). Mounted at `/dev/apple-music`. Remove once the
 * provider integration is verified.
 */
export function AppleMusicProbe() {
  const mk = useMusicKit();
  const [term, setTerm] = useState("Get Lucky Daft Punk");
  const [results, setResults] = useState<MusicKitSearchResult[]>([]);

  const runSearch = () => {
    void mk.searchSongs(term).then(setResults);
  };

  return (
    <div style={{ padding: 24, maxWidth: 600, fontFamily: "system-ui" }}>
      <h1>Apple Music probe (dev)</h1>
      <p>
        status: <strong>{mk.status}</strong>
        {mk.error ? ` — ${mk.error}` : ""}
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => void mk.configure()}>1. Configure</button>
        <button onClick={() => void mk.authorize()}>2. Authorize</button>
        <button onClick={() => void mk.resume()}>Play</button>
        <button onClick={() => void mk.pause()}>Pause</button>
        <button
          onClick={() => void mk.seek((mk.snapshot?.positionMs ?? 0) + 15000)}
        >
          +15s
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          style={{ flex: 1 }}
        />
        <button onClick={runSearch}>Search</button>
      </div>

      <ul>
        {results.map((result) => (
          <li key={result.id}>
            {result.name} — {result.artist}{" "}
            <button onClick={() => void mk.playSong(result.id)}>play</button>
          </li>
        ))}
      </ul>

      <pre style={{ marginTop: 16, background: "#f5f5f5", padding: 12 }}>
        {JSON.stringify(mk.snapshot, null, 2)}
      </pre>
    </div>
  );
}
