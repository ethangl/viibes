/**
 * Minimal hand-written types for the MusicKit JS v3 global. There's no official
 * npm types package, and we only touch a small slice of the (beta) surface.
 */

export interface MusicKitNowPlayingItem {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
    durationInMillis?: number;
  };
}

export interface MusicKitSearchResponse {
  data?: {
    results?: {
      songs?: {
        data?: {
          id: string;
          attributes?: { name?: string; artistName?: string };
        }[];
      };
    };
  };
}

export interface MusicKitSetQueueOptions {
  song?: string;
  songs?: string[];
  startPlaying?: boolean;
  startTime?: number;
}

export interface MusicKitInstance {
  isAuthorized: boolean;
  playbackState: number;
  currentPlaybackTime: number;
  currentPlaybackDuration: number;
  nowPlayingItem: MusicKitNowPlayingItem | null;
  storefrontId?: string;
  authorize(): Promise<string>;
  unauthorize(): Promise<void>;
  setQueue(options: MusicKitSetQueueOptions): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekToTime(seconds: number): Promise<void>;
  addEventListener(name: string, callback: (event: unknown) => void): void;
  removeEventListener(name: string, callback: (event: unknown) => void): void;
  api: {
    music(
      path: string,
      queryParameters?: Record<string, unknown>,
    ): Promise<MusicKitSearchResponse>;
  };
}

export interface MusicKitGlobal {
  configure(config: {
    developerToken: string;
    app: { name: string; build: string };
  }): Promise<MusicKitInstance>;
  getInstance(): MusicKitInstance | undefined;
  PlaybackStates: Record<string, number>;
}

declare global {
  interface Window {
    MusicKit?: MusicKitGlobal;
  }
}
