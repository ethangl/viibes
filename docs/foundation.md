# viibes foundation

## Product

Social, synchronized listening **rooms**. **Apple Music** is the playback
provider. Anyone can join a room and listen; an **account** (opt-in) unlocks
creating rooms and claiming a username.

## Why this shape — the constraints that forced it

- **Spotify is abandoned as a foundation.** It won't approve the app (stuck in
  dev-mode, ~5-user cap as of the Feb 2026 API changes). Nothing real can depend
  on it. It survives only as a legacy playback adapter behind the provider
  interface — no identity, no fallback, no user relies on it.
- **Apple plays music but isn't an identity provider.** MusicKit `authorize()`
  grants *playback* (a Music User Token) and library/playlist access — but no
  account, no stable user id, no email/name. So identity can't come from Apple
  either.
- **Therefore identity is decoupled from the music service.** The music
  connection (MusicKit) and the account (Google / email-password) are orthogonal.

## Identity model

- **Guest by default.** A silent anonymous Better Auth session is enough to join
  a room, appear in presence, and listen. The one explicit flow a listener does
  is **connect Apple Music** (the MusicKit consent) to hear audio.
- **Account, opt-in.** **Google OAuth** or **email/password** → durable
  identity, which unlocks a **claimed username**, **creating rooms**, following,
  persistence. The anonymous session upgrades in place (Better Auth anonymous →
  linked). Identity is *never* Apple and *never* Spotify, so the baseline
  listener only ever does one flow.
- **Capability gates** (not a login wall): join + listen = any session + Apple
  Music connected; create room / claim username = upgraded account.

### Three distinct tokens (don't conflate them)

| Token | Scope | Where | Status |
|---|---|---|---|
| App developer token | App-level, catalog/ISRC resolution | Convex env `APPLE_MUSIC_DEVELOPER_TOKEN` | ✅ set |
| MusicKit user token | Per-user, playback + playlists | Client (MusicKit, localStorage) | ✅ proven (probe) |
| Identity | Per-user account | Better Auth (Google / email-password) | 🔨 in progress |

## Playback model

- Each listener plays on **their own** MusicKit instance; rooms stay in sync via
  the server-timestamp master clock in `shared/rooms-state.ts` (provider-neutral,
  unchanged since the start).
- A canonical track is keyed on **ISRC**; the provider's track id is resolved
  **server-side** (`playback.resolveTrack` + the `providerHints` cache on
  `roomQueueItems`). In an all-Apple world this largely collapses to "the Apple
  id is the track id"; the resolution layer remains for Spotify-origin tracks
  during the transition and for any legacy adapter.
- The `PlaybackProvider` interface (`src/features/playback`) isolates the player
  from room sync; `AppleMusicProvider` (over MusicKit JS) is the real one.

## What's built

- **ISRC capture** from Spotify payloads → `roomQueueItems.isrc`.
- **`PlaybackProvider` interface** + Spotify implementation (`src/features/playback`).
- **Server resolution** (3-1): `playback.resolveTrack` + `providerHints` +
  Apple catalog client (`confect/applemusic/catalog.ts`). Token generator at
  `scripts/generate-apple-token.mjs`.
- **MusicKit JS integration** (3-2): `src/features/apple-music/use-musickit.ts`
  + `playback.appleDeveloperToken`; verified end-to-end via the dev probe at
  `/dev/apple-music` (subscriber playback confirmed working).
- **Auth providers** (step 1, just landed): anonymous sessions + Google +
  email/password added to Better Auth (server `auth/betterAuth.ts`, client
  `src/lib/convex-auth-client.ts`). **Additive and inert** — existing Spotify
  login still works; nothing switches over until the shell is reworked.

## Build sequence (revised foundation)

1. ✅ **Auth providers** — anonymous + Google + email/password added (server +
   client), Spotify untouched. Additive, non-breaking. **← just done.**
2. **Shell & capabilities** — create a silent anonymous session on load; drop
   the Spotify-login gate so everyone's in; add capability checks
   (`canCreateRoom` / `canClaimUsername` = upgraded account); new sign-in /
   upgrade UI offering Google + email/password.
3. **Apple playback** — `AppleMusicProvider` behind the interface; controller
   resolves the current track via `resolveTrack` and plays the resolved id (fixes
   the step-2 carry-forward); each listener on MusicKit; unavailable-track UX;
   remove the dev probe.
4. **Account / username UX** — the upgrade flow + username claim.
5. **Retire Spotify** — remove it as identity; decide whether to keep the
   playback adapter at all.

## Setup still owed (on the Apple/Google/email side)

- **Google OAuth client** → set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in
  Convex env. Until both are set, Google sign-in is simply not registered (the
  config skips it gracefully).
- **Email sender** (Resend, etc.) for email/password verification + reset —
  deferred. Email/password currently works with `requireEmailVerification:
  false`; no reset flow until a sender is wired.
- ✅ `APPLE_MUSIC_DEVELOPER_TOKEN` — done.

## Open risks

- **MusicKit on the Web is beta** — surface can change; we don't control it.
- **Better Auth + Convex schema:** adding the anonymous plugin (and
  email/password) may require the `@convex-dev/better-auth` component to pick up
  new user/account fields — **verify on the first `convex dev` run** after this
  step; a schema/codegen step may be needed.
- **Anonymous accounts are device-bound** until upgraded (no cross-device /
  recovery) — accepted tradeoff; optional account-securing comes with step 4.

## Verified — June 2026 (catalog/API facts)

- **Spotify Feb 2026 API changes:** Dev Mode caps at 5 users/app + requires owner
  Premium; search `limit` max 50 → 10; `GET /artists/{id}/top-tracks`, batch
  `GET /tracks`/`GET /albums`, browse/new-releases removed; `external_ids` (ISRC)
  removed then **reverted March 2026** (still available). The live app uses none
  of the removed endpoints (checked).
- **Apple Music search** is the stronger catalog: `term`/`types`/`limit` (up to
  25)/`offset`; 20 req/sec per user; flat (not dev/prod-gated).
- **Apple batch ISRC lookup:** `GET /v1/catalog/{storefront}/songs?filter[isrc]=…`,
  up to 25 ISRCs per request — one round-trip resolves a queue.
