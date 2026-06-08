/**
 * Apple Music **library** reads (the user's playlists). Unlike catalog reads
 * (server-side, app developer token), library data needs the per-user Music
 * User Token — which only lives client-side in MusicKit. So these run in the
 * browser against the configured singleton (`window.MusicKit.getInstance()`,
 * stood up once by `RoomsProvider`); MusicKit attaches the user token to
 * `/v1/me/...` requests automatically. Return empty/null when MusicKit isn't
 * present yet (not configured / not connected) — callers gate on auth status.
 *
 * Library song resources carry no ISRC, and `chooseResolution("apple", …)` needs
 * one (it returns `unavailable` otherwise). So playlist tracks are resolved in
 * two steps — read the library tracks for their catalog ids, then batch-fetch
 * the catalog songs by id to recover ISRC + clean metadata — yielding tracks
 * that enqueue/play through the same path as search-added Apple tracks.
 */

import type { SpotifyTrack } from "@/features/spotify-client/types";
import type { MusicKitInstance } from "./musickit-types";

const ARTWORK_SIZE = 200;
const CATALOG_BATCH = 100;

export interface ApplePlaylist {
  id: string;
  name: string;
  image: string | null;
  description: string | null;
}

/** Resolve Apple's `{w}x{h}` artwork URL template to a concrete size. */
function artworkUrl(template: string | undefined): string | null {
  if (!template) return null;
  return template
    .replace("{w}", String(ARTWORK_SIZE))
    .replace("{h}", String(ARTWORK_SIZE));
}

/** The configured MusicKit singleton, or null when it isn't available yet. */
function getInstance(): MusicKitInstance | null {
  if (typeof window === "undefined") return null;
  return window.MusicKit?.getInstance() ?? null;
}

interface Artwork {
  url?: string;
}

/**
 * MusicKit's `api.music()` wraps the Apple API response *body* under `.data`
 * (see `searchSongs`, which reads `response.data?.results?...`). So a list
 * endpoint nests as `response.data.data` (envelope → body → resource array).
 */
interface MusicKitResponse<TBody> {
  data?: TBody;
}

interface ResourceList<TResource> {
  data?: TResource[];
  /** Full path (query included) to the next page, when more remain. */
  next?: string;
}

interface LibraryPlaylistResource {
  id: string;
  attributes?: {
    name?: string;
    artwork?: Artwork;
    description?: { standard?: string };
  };
}

function mapPlaylist(resource: LibraryPlaylistResource): ApplePlaylist {
  return {
    id: resource.id,
    name: resource.attributes?.name ?? "(unknown)",
    image: artworkUrl(resource.attributes?.artwork?.url),
    description: resource.attributes?.description?.standard ?? null,
  };
}

export async function getAppleLibraryPlaylists(): Promise<ApplePlaylist[]> {
  const music = getInstance();
  if (!music) return [];
  const response = await music.api.music<
    MusicKitResponse<ResourceList<LibraryPlaylistResource>>
  >("/v1/me/library/playlists", { limit: 100 });
  return (response.data?.data ?? []).map(mapPlaylist);
}

export async function getAppleLibraryPlaylist(
  id: string,
): Promise<ApplePlaylist | null> {
  const music = getInstance();
  if (!music) return null;
  const response = await music.api.music<
    MusicKitResponse<ResourceList<LibraryPlaylistResource>>
  >(`/v1/me/library/playlists/${encodeURIComponent(id)}`);
  const resource = response.data?.data?.[0];
  return resource ? mapPlaylist(resource) : null;
}

interface LibrarySongResource {
  id: string;
  attributes?: { playParams?: { catalogId?: string } };
}

interface CatalogSongResource {
  id: string;
  /** "songs" for catalog songs; recently-played can also include music-videos. */
  type?: string;
  attributes?: {
    name?: string;
    artistName?: string;
    albumName?: string;
    durationInMillis?: number;
    isrc?: string;
    artwork?: Artwork;
  };
}

function mapCatalogSong(song: CatalogSongResource): SpotifyTrack {
  const attributes = song.attributes ?? {};
  return {
    id: song.id,
    name: attributes.name ?? "(unknown)",
    artist: attributes.artistName ?? "",
    albumName: attributes.albumName ?? "",
    albumImage: artworkUrl(attributes.artwork?.url),
    durationMs: attributes.durationInMillis ?? 0,
    ...(attributes.isrc ? { isrc: attributes.isrc } : {}),
  };
}

export async function getAppleLibraryPlaylistTracks(
  id: string,
): Promise<SpotifyTrack[]> {
  const music = getInstance();
  if (!music) return [];

  // 1. Page the library tracks, collecting catalog ids in playlist order.
  //    Library-only songs (user uploads) have no catalog id — they can't play
  //    in a room, so we drop them.
  const catalogIds: string[] = [];
  let path: string | undefined = `/v1/me/library/playlists/${encodeURIComponent(
    id,
  )}/tracks`;
  let params: Record<string, unknown> | undefined = { limit: 100 };
  while (path) {
    const page: MusicKitResponse<ResourceList<LibrarySongResource>> =
      await music.api.music<MusicKitResponse<ResourceList<LibrarySongResource>>>(
        path,
        params,
      );
    for (const track of page.data?.data ?? []) {
      const catalogId = track.attributes?.playParams?.catalogId;
      if (catalogId) catalogIds.push(catalogId);
    }
    path = page.data?.next;
    params = undefined; // `next` already carries the paging query.
  }
  if (catalogIds.length === 0) return [];

  // 2. Batch-fetch the catalog songs by id (≤100/req) to recover ISRC.
  const storefront = music.storefrontId ?? "us";
  const byId = new Map<string, SpotifyTrack>();
  for (let i = 0; i < catalogIds.length; i += CATALOG_BATCH) {
    const chunk = catalogIds.slice(i, i + CATALOG_BATCH);
    const response = await music.api.music<
      MusicKitResponse<ResourceList<CatalogSongResource>>
    >(`/v1/catalog/${storefront}/songs`, { ids: chunk.join(",") });
    for (const song of response.data?.data ?? []) {
      byId.set(song.id, mapCatalogSong(song));
    }
  }

  // 3. Re-project in playlist order, dropping ids the catalog didn't return.
  return catalogIds
    .map((catalogId) => byId.get(catalogId))
    .filter((track): track is SpotifyTrack => track !== undefined);
}

/**
 * The listener's recently-played tracks. Unlike library playlists, this endpoint
 * returns catalog song resources directly — they already carry ISRC + clean
 * metadata, so no catalog batch is needed. `types: "songs"` filters out
 * music-videos; we re-check `type` defensively before mapping.
 */
export async function getAppleRecentlyPlayed(): Promise<SpotifyTrack[]> {
  const music = getInstance();
  if (!music) return [];
  const response = await music.api.music<
    MusicKitResponse<ResourceList<CatalogSongResource>>
  >("/v1/me/recent/played/tracks", { limit: 30, types: "songs" });
  return (response.data?.data ?? [])
    .filter((resource) => resource.type === undefined || resource.type === "songs")
    .map(mapCatalogSong);
}
