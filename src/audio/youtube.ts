/**
 * YouTube audio playback via the official IFrame Player API.
 * Creates a hidden YouTube player synced to the physics clock.
 */

import { TIMESTEP } from '../constants';

/** Extract a YouTube video ID from various URL formats */
export function parseYouTubeId(input: string): string | null {
  const trimmed = input.trim();

  // Already just an ID (11 chars, alphanumeric + dash/underscore)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    // youtu.be/VIDEO_ID
    if (url.hostname === 'youtu.be') {
      return url.pathname.slice(1).split('/')[0] || null;
    }
    // youtube.com/watch?v=VIDEO_ID or music.youtube.com
    if (url.hostname.includes('youtube.com')) {
      return url.searchParams.get('v') || null;
    }
  } catch {
    // Not a valid URL
  }

  return null;
}

// IFrame API type declarations
declare global {
  interface Window {
    YT: {
      Player: new (
        el: string | HTMLElement,
        opts: YTPlayerOptions,
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
        BUFFERING: number;
      };
    };
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface YTPlayerOptions {
  width?: number;
  height?: number;
  videoId?: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (e: { target: YTPlayer }) => void;
    onStateChange?: (e: { data: number }) => void;
    onError?: (e: { data: number }) => void;
  };
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(volume: number): void;
  getVolume(): number;
  setPlaybackRate(rate: number): void;
  getPlaybackRate(): number;
  getAvailablePlaybackRates(): number[];
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoData(): { title: string; video_id: string };
  loadVideoById(videoId: string): void;
  destroy(): void;
}

let apiLoaded = false;
let apiReady = false;
let apiReadyCallbacks: (() => void)[] = [];

function ensureYTApi(): Promise<void> {
  if (apiReady) return Promise.resolve();

  return new Promise((resolve) => {
    apiReadyCallbacks.push(resolve);

    if (!apiLoaded) {
      apiLoaded = true;
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);

      window.onYouTubeIframeAPIReady = () => {
        apiReady = true;
        for (const cb of apiReadyCallbacks) cb();
        apiReadyCallbacks = [];
      };
    }
  });
}

/**
 * YouTube player that wraps the IFrame API.
 * Provides play/pause/stop/seek/speed/volume synced to the physics clock.
 */
export class YouTubePlayer {
  private player: YTPlayer | null = null;
  private container: HTMLElement;
  private _ready = false;
  private _volume = 80;
  private _offset = 0; // seconds
  private _playbackRate = 1.0;
  private _videoId = '';

  // Drift correction — YT player has inherent latency, use a generous threshold
  // to avoid constant re-seeking which causes crackling
  private static readonly DRIFT_THRESHOLD = 0.15; // 150ms
  private lastSyncCheck = 0;
  private static readonly SYNC_INTERVAL = 500; // only check drift every 500ms

  name = '';
  duration = 0;

  onReady: (() => void) | null = null;
  onError: ((msg: string) => void) | null = null;

  get loaded(): boolean {
    return this._ready && this._videoId !== '';
  }

  get videoId(): string {
    return this._videoId;
  }

  get playing(): boolean {
    if (!this.player) return false;
    return this.player.getPlayerState() === window.YT.PlayerState.PLAYING;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(100, v));
    this.player?.setVolume(this._volume);
  }

  get offset(): number {
    return this._offset;
  }

  set offset(v: number) {
    this._offset = v;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(rate: number) {
    this._playbackRate = rate;
    if (this.player) {
      // YT only supports specific rates — pick nearest
      const available = this.player.getAvailablePlaybackRates();
      const nearest = available.reduce((best, r) =>
        Math.abs(r - rate) < Math.abs(best - rate) ? r : best
      );
      this.player.setPlaybackRate(nearest);
    }
  }

  constructor() {
    // Create a hidden container for the iframe
    this.container = document.createElement('div');
    this.container.id = 'yt-player-container';
    this.container.style.cssText =
      'position:fixed; top:-9999px; left:-9999px; width:320px; height:180px; overflow:hidden; pointer-events:none;';
    document.body.appendChild(this.container);
  }

  /** Load a YouTube video by ID */
  async load(videoId: string): Promise<void> {
    this._videoId = videoId;
    this._ready = false;

    await ensureYTApi();

    return new Promise((resolve, reject) => {
      // Destroy existing player
      if (this.player) {
        this.player.destroy();
        this.player = null;
      }

      // Create a fresh div (YT API replaces it with an iframe)
      const el = document.createElement('div');
      el.id = 'yt-player';
      this.container.innerHTML = '';
      this.container.appendChild(el);

      this.player = new window.YT.Player('yt-player', {
        width: 320,
        height: 180,
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          playsinline: 1,
          fs: 0,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            this._ready = true;
            this.duration = e.target.getDuration();
            const data = e.target.getVideoData();
            this.name = data.title || `YouTube: ${videoId}`;
            e.target.setVolume(this._volume);
            this.onReady?.();
            resolve();
          },
          onError: (e) => {
            const codes: Record<number, string> = {
              2: 'Invalid video ID',
              5: 'HTML5 player error',
              100: 'Video not found or private',
              101: 'Video not embeddable',
              150: 'Video not embeddable',
            };
            const msg = codes[e.data] || `YouTube error code ${e.data}`;
            this.onError?.(msg);
            reject(new Error(msg));
          },
        },
      });
    });
  }

  play(): void {
    if (!this.player || !this._ready) return;
    this.player.playVideo();
  }

  pause(): void {
    if (!this.player) return;
    this.player.pauseVideo();
  }

  stop(): void {
    if (!this.player) return;
    this.player.pauseVideo();
    this.player.seekTo(0, true);
  }

  seekToFrame(frame: number): void {
    const seconds = (frame * TIMESTEP) / 1000 + this._offset;
    this.seekToTime(Math.max(0, seconds));
  }

  seekToTime(seconds: number): void {
    if (!this.player) return;
    this.player.seekTo(seconds, true);
  }

  /** Drift correction — compare YT player position to physics time */
  syncToFrame(frame: number): void {
    if (!this.player || !this._ready) return;
    if (this.player.getPlayerState() !== window.YT.PlayerState.PLAYING) return;

    // Throttle checks to avoid constant re-seeking
    const now = performance.now();
    if (now - this.lastSyncCheck < YouTubePlayer.SYNC_INTERVAL) return;
    this.lastSyncCheck = now;

    const physicsTime = (frame * TIMESTEP) / 1000 + this._offset;
    const ytTime = this.player.getCurrentTime();
    const drift = Math.abs(ytTime - physicsTime);

    if (drift > YouTubePlayer.DRIFT_THRESHOLD) {
      this.player.seekTo(Math.max(0, physicsTime), true);
    }
  }

  unload(): void {
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this._ready = false;
    this._videoId = '';
    this.name = '';
    this.duration = 0;
  }
}
