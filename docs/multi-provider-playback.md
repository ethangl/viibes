# Multi-provider playback

## Why

We're treating Spotify approval as unlikely, and we don't want to be hostage to
one provider's gatekeeping. The fix is to make playback an interchangeable
adapter so a room can be hosted on whatever streaming service a user actually
has a subscription to.

This does **not** remove the subscription requirement — that's a licensing
constraint, not a Spotify-specific one. You cannot legally stream full
major-label songs to non-paying users without paying for licensing. What it
removes is the dependency on _one specific_ provider. The trade we explicitly
accepted (the "trilemma"):

- **Keep:** full-length playback + mainstream catalog
- **Give up:** free-to-listener (every user brings their own subscription)

The payoff: we launch on Apple Music (no app-review wall, just Apple Developer
Program membership), and Spotify becomes optional — usable for the ~25 users
dev-mode allows, or switched on later if approval ever comes, with no
architectural change. We stop being blocked on Spotify's decision.

### Known costs of this path

- **Catalog mismatch.** Not every track exists on every service (regional
  licensing, catalog gaps, different masters). We need a per-user "not available
  on your plan" fallback. This is the one genuinely new UX state.
- **Sync drift across heterogeneous SDKs.** Each provider's player has its own
  buffering/seek quirks. Our sync model already tolerates drift correction; the
  tax is re-validating it per provider.
- **MusicKit on the Web is still labelled Beta.** It works for production-style
  use and there's no approval gate, but it's a beta surface Apple can change.
  This is a stability risk to track, not a blocker.

## What's already portable (do not touch)

The hard part of a sync app — keeping N clients playing the same thing at the
same position — is already provider-agnostic.

- `shared/rooms-state.ts` (`resolveRoomPlaybackState`, ~lines 107–162) is pure
  clock arithmetic: `currentOffsetMs = startOffsetMs + (now − startedAt)`, with
  pause handling via `pausedAt` and automatic queue advancement when a track's
  duration is exceeded. Zero Spotify assumptions.
- `confect/tables/RoomPlaybackStates.ts` — the playback-state record
  (`startedAt`, `startOffsetMs`, `paused`, `pausedAt`, `updatedAt`) is timing
  data, not provider data. Carries over unchanged.

The server-timestamp sync model is the foundation and it stays as-is.

## Where Spotify is actually baked in

Coupling is concentrated in two seams, not smeared across the codebase.

### Seam 1 — Track identity (data layer)

Track identity is a raw Spotify ID everywhere, which is meaningless to any other
provider.

- `confect/tables/RoomQueueItems.ts` — `trackId: Schema.String` holds a raw
  Spotify ID.
- `src/features/spotify-player/use-player-playback-transport.ts:79` — builds the
  URI as `spotify:track:${request.track.id}`.
- `src/features/rooms/runtime/use-room-actions.ts` (~lines 23–31) — converts a
  `SpotifyTrack` to queue metadata, `trackId` stays the raw Spotify ID.
- No ISRC or cross-service metadata is stored anywhere today.

### Seam 2 — Playback transport (control layer)

Playback control calls Spotify endpoints directly.

- `src/features/spotify-player/use-player-playback-transport.ts` and
  `use-player-playback.ts` — `syncTrack(track, offsetMs)` and the play/pause
  path.
- `confect/spotify/playback.ts` — `playUri()`, `pausePlayback()`,
  `resumePlayback()` hit Spotify Web API endpoints with a Spotify token.
- `src/features/spotify-sdk/*` — `use-spotify-sdk.ts` loads `player.js`,
  `use-spotify-polling.ts` polls `getCurrentState()` every 500ms and normalizes
  to `SdkPlaybackState`, `use-spotify-controls.ts` exposes play/pause/seek/etc.
- `src/features/rooms/runtime/use-room-sync-controller.ts` already drives
  playback through a narrow `syncTrack()` / `togglePlay()` shape — it's _almost_
  an interface already.

## Where ISRC comes from

**Spotify hands us ISRC directly** — full track objects from `/search`,
`/playlists/{id}/items`, `/me/player/recently-played`, and artist top tracks all
include `external_ids.isrc`. The app currently fetches these payloads and
**discards ISRC at the mapping layer**: `confect/spotify/mappers.ts:52`
(`mapTrack`) doesn't read it, and the `SpotifyApiTrack` interface doesn't even
declare `external_ids`. Capturing it is the bulk of step 1.

- **Gap:** album-track enqueues hit `/albums/{id}/tracks`, which returns
  *simplified* track objects with no `external_ids`. Those rows get
  `isrc: undefined` for now; a later pass can re-fetch full track objects via
  `/tracks/{id}` or resolve by metadata.
- **MusicBrainz is _not_ the ISRC source.** The existing component
  (`confect/musicbrainz.impl.ts` + `components/musicbrainz/`) is **artist-only**
  (`artistBySpotifyId`, `spotifyArtistIdByMusicBrainzId`) — it has no
  recording/ISRC capability. Reading ISRC off Spotify's own payload is simpler
  and more reliable than building a MusicBrainz recording lookup, so step 1 does
  not touch MusicBrainz.

## The design

### Canonical track identity, keyed on ISRC

ISRC (International Standard Recording Code) is the universal per-recording ID.
Every provider's catalog API can look a track up by it (Spotify `isrc:` search,
Apple Music `filter[isrc]`, Deezer, etc.). Make it the room's notion of "a
track":

```
RoomQueueItems: {
  isrc,                 // canonical cross-service key
  title,
  artists,
  albumImageUrl,
  durationMs,
  providerHints?: {     // optional resolution cache, avoids re-resolving each play
    spotify?: string,
    apple?: string,
  },
}
```

Keep the rich display metadata we already store (it's provider-neutral). Add
`isrc` as the key and `providerHints` as a per-provider ID cache.

### Resolution runs server-side (Convex action)

ISRC → provider-track-id resolution is a **server concern**, not part of the
client player. A Convex action takes `(isrc, provider)` and returns a
`providerTrackId | null` by hitting that provider's catalog API:

```ts
// confect action (sketch)
resolveTrack(isrc: string, provider: "spotify" | "apple"):
  Promise<string | null>
```

Why server-side:

- **Centralized tokens.** Provider catalog credentials stay on the server; the
  client never holds catalog-search tokens.
- **Shared cache.** The result is written back to the queue item's
  `providerHints[provider]`. One resolution then serves *every* user in the room
  on that provider — the action checks the cache first and only calls the
  provider API on a miss.
- **Decouples the client player.** The client `PlaybackProvider` never resolves;
  it only plays a `providerTrackId` it's handed.

`null` is cached too (negative result), so a known-unavailable track doesn't get
re-queried per user.

### `PlaybackProvider` interface (client)

With resolution moved server-side, the client interface is purely transport over
an already-resolved `providerTrackId`:

```ts
interface PlaybackState {
  positionMs: number;
  durationMs: number;
  paused: boolean;
  trackKey: string | null; // provider track id currently loaded
}

interface PlaybackProvider {
  play(providerTrackId: string, offsetMs: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  seek(ms: number): Promise<void>;
  getState(): PlaybackState | null; // normalized
  disconnect(): void;
}
```

- `SpotifyProvider` is a near-mechanical wrap of what exists today
  (`use-spotify-controls`, `use-spotify-polling`, the URI builder).
- `AppleMusicProvider` is the new implementation over MusicKit JS.
- `useRoomSyncController` resolves the current canonical track for the user's
  provider via the Convex action, then drives `provider.play(providerTrackId)`
  instead of calling `syncTrack()` directly — otherwise identical regardless of
  provider.

### The unavailable-track state

The resolution action returning `null` (track not on this user's service) is the
one genuinely new behavior. The room keeps playing on the master clock; that
user sees "not available on Apple Music" and sits the track out, rejoining on
the next one. Design this deliberately — it's the cost of the multi-provider
path.

## Rollout order

Each step leaves the app fully working. Steps 1–2 are pure refactors and ship
before MusicKit is involved at all.

1. ~~**Add `isrc` to the schema + capture it natively from Spotify.**~~ **DONE
   (merged).** Stopped discarding `external_ids.isrc` in `mapTrack`, plumbed it
   through `SpotifyTrack` → `SpotifyTrackSchema` (return boundary) → enqueue
   args → the `roomQueueItems` row (optional field; album-track adds and
   pre-existing rows are left `undefined`). No MusicBrainz, no behavior change.
2. ~~**Extract `SpotifyProvider` behind the `PlaybackProvider` interface** and
   route `useRoomSyncController` through it.~~ **DONE (in working tree, not yet
   merged).** New neutral `src/features/playback/` holds `PlaybackProvider`
   (`syncTrack` / `togglePlay` / normalized `snapshot`), with
   `useSpotifyPlaybackProvider` wrapping the existing web-player context and
   `usePlaybackProvider` selecting it. `useRoomSyncController` now imports only
   `@/features/playback` — no Spotify import. Web-player context and the broader
   player UI (queue/shuffle/browse) untouched. No behavior change.

   **Carry-forward for step 3:** the controller's identity check
   (`localTrackKey !== currentTrackId`) currently works because the Spotify
   provider key equals the queue item's `trackId`. With a second provider it
   must compare against the *resolved* provider key for the current canonical
   track (the server-side `resolveTrack` result), not the raw `trackId`. Marked
   with a comment at the comparison site.
3. **Add `AppleMusicProvider` (MusicKit JS)** plus per-user provider
   connection/selection and the unavailable-track UX.

## Decisions

- **Resolution runs through a Convex action**, caching results into the queue
  item's `providerHints` (see "Resolution runs server-side" above). Settled.
- **Canonical catalog source will likely shift to Apple Music** (its song
  objects expose ISRC directly, which removes the MusicBrainz hop for new
  tracks) — *contingent on its search API actually being better than Spotify's*.
  This is unverified and may not hold. Until evaluated, Spotify stays the search
  source and MusicBrainz backfills ISRC. Decouple this from playback: the
  catalog source only affects how tracks get *added* to a queue, not how they
  play, so it can change later without touching the provider layer.

## Open questions / to verify before step 3

- Confirm current MusicKit on the Web terms (still Beta?) and that full-song
  playback requires an active Apple Music subscription per listener.
- **Evaluate the Apple Music search API vs. Spotify's** before committing to the
  catalog-source switch above — relevance, latency, ISRC coverage, rate limits.
