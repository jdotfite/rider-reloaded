import { TIMESTEP } from '../constants';

/**
 * Web Audio API player synced to the physics clock.
 * Handles file loading, playback rate, volume, offset, drift correction, and seeking.
 */
export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  // Playback state
  private _playing = false;
  private _volume = 0.8;
  private _offset = 0; // seconds — user-configurable song offset
  private _playbackRate = 1.0;

  // Clip region (trim)
  private _clipStart = 0;       // seconds — start of playable region
  private _clipEnd = Infinity;  // seconds — end of playable region
  private clipStopTimer: ReturnType<typeof setTimeout> | null = null;

  // Timing
  private startContextTime = 0; // AudioContext.currentTime when playback started
  private startOffset = 0; // position in the buffer when playback started (seconds)

  // Drift correction
  private static readonly DRIFT_THRESHOLD = 0.025; // 25ms

  // Metadata
  name = '';
  duration = 0; // seconds

  get loaded(): boolean {
    return this.buffer !== null;
  }

  /** Expose the decoded AudioBuffer for waveform rendering */
  get audioBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  get playing(): boolean {
    return this._playing;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  get offset(): number {
    return this._offset;
  }

  set offset(v: number) {
    this._offset = v;
  }

  get clipStart(): number { return this._clipStart; }
  get clipEnd(): number { return this._clipEnd; }

  setClip(start: number, end: number) {
    this._clipStart = Math.max(0, start);
    this._clipEnd = end <= 0 || !Number.isFinite(end) ? Infinity : end;
    if (this._clipEnd !== Infinity && this._clipEnd <= this._clipStart) {
      this._clipEnd = Infinity;
    }
  }

  resetClip() {
    this._clipStart = 0;
    this._clipEnd = Infinity;
    if (this.clipStopTimer) { clearTimeout(this.clipStopTimer); this.clipStopTimer = null; }
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(rate: number) {
    this._playbackRate = rate;
    if (this.source) {
      this.source.playbackRate.value = rate;
    }
  }

  /** Current playback position in seconds (relative to song start, ignoring offset) */
  get currentTime(): number {
    if (!this.ctx || !this._playing) return this.startOffset;
    const elapsed = (this.ctx.currentTime - this.startContextTime) * this._playbackRate;
    return this.startOffset + elapsed;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  /** Load audio from an ArrayBuffer (from file or fetch) */
  async loadBuffer(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
    const ctx = this.ensureContext();
    this.stop();
    this.buffer = await ctx.decodeAudioData(arrayBuffer);
    this.duration = this.buffer.duration;
    this.name = fileName;
    this.startOffset = 0;
  }

  /** Load audio from a File object */
  async loadFile(file: File): Promise<void> {
    const arrayBuffer = await file.arrayBuffer();
    await this.loadBuffer(arrayBuffer, file.name);
  }

  /** Load audio from a URL (direct audio link) */
  async loadUrl(url: string, displayName?: string): Promise<void> {
    const ctx = this.ensureContext();
    this.stop();

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    this.buffer = await ctx.decodeAudioData(arrayBuffer);
    this.duration = this.buffer.duration;
    this.name = displayName || 'Audio';
    this.startOffset = 0;
  }

  /** Start or resume playback from the current position */
  play(): void {
    if (!this.buffer || this._playing) return;
    const ctx = this.ensureContext();

    // Resume suspended context (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    // Clamp start offset to clip region
    if (this._clipStart > 0 && this.startOffset < this._clipStart) {
      this.startOffset = this._clipStart;
    }

    this.createSource();
    const songPosition = this.startOffset + this._offset;
    const effectiveEnd = this._clipEnd !== Infinity ? this._clipEnd : this.duration;

    if (songPosition >= effectiveEnd) {
      // Past end of clip — nothing to play
      return;
    }

    if (songPosition < 0) {
      // Offset pushes us before the song start — schedule delayed start
      this.source!.start(ctx.currentTime + Math.abs(songPosition) / this._playbackRate, 0);
    } else {
      this.source!.start(0, songPosition);
    }

    this.startContextTime = ctx.currentTime;
    this._playing = true;

    // Schedule auto-stop at clip end
    if (this.clipStopTimer) { clearTimeout(this.clipStopTimer); this.clipStopTimer = null; }
    if (this._clipEnd !== Infinity) {
      const remaining = (effectiveEnd - Math.max(0, songPosition)) / this._playbackRate;
      if (remaining > 0) {
        this.clipStopTimer = setTimeout(() => {
          this.clipStopTimer = null;
          if (this._playing) {
            this.pause();
            this.startOffset = this._clipStart;
          }
        }, remaining * 1000);
      }
    }
  }

  /** Pause playback, preserving position */
  pause(): void {
    if (!this._playing) return;
    // Save current position
    this.startOffset = this.currentTime;
    this.destroySource();
    this._playing = false;
  }

  /** Stop playback and reset to beginning */
  stop(): void {
    this.destroySource();
    this._playing = false;
    this.startOffset = 0;
  }

  /** Seek to a specific physics frame */
  seekToFrame(frame: number): void {
    const seconds = (frame * TIMESTEP) / 1000;
    this.seekToTime(seconds);
  }

  /** Seek to a specific time in seconds */
  seekToTime(seconds: number): void {
    const wasPlaying = this._playing;
    if (wasPlaying) {
      if (this.clipStopTimer) { clearTimeout(this.clipStopTimer); this.clipStopTimer = null; }
      this.destroySource();
      this._playing = false;
    }
    // Clamp to clip region
    const effectiveEnd = this._clipEnd !== Infinity ? this._clipEnd : this.duration;
    this.startOffset = Math.max(this._clipStart, Math.min(seconds, effectiveEnd));
    if (wasPlaying) {
      this.play();
    }
  }

  /**
   * Drift correction — call each frame during playback.
   * Compares audio position to physics time and re-syncs if needed.
   */
  syncToFrame(frame: number): void {
    if (!this._playing || !this.ctx) return;

    const physicsTime = (frame * TIMESTEP) / 1000; // seconds
    const audioTime = this.currentTime;
    const drift = Math.abs(audioTime - physicsTime);

    if (drift > AudioPlayer.DRIFT_THRESHOLD) {
      // Re-sync by seeking
      this.seekToTime(physicsTime);
    }
  }

  /**
   * Play a short audio preview at a specific frame position (for scrubbing).
   * Plays ~150ms then stops. Debounced — calling again cancels the previous preview.
   */
  private scrubTimer: ReturnType<typeof setTimeout> | null = null;
  scrubPreview(frame: number): void {
    if (!this.buffer) return;
    const seconds = (frame * TIMESTEP) / 1000 + this._offset;
    if (seconds < 0 || seconds >= this.duration) return;

    // Cancel any existing preview
    if (this.scrubTimer) { clearTimeout(this.scrubTimer); this.scrubTimer = null; }

    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') ctx.resume();

    // Destroy existing source and create a fresh one for the preview
    this.destroySource();
    this._playing = false;

    this.createSource();
    this.source!.start(0, seconds);
    this.startContextTime = ctx.currentTime;
    this.startOffset = seconds;
    this._playing = true;

    // Auto-stop after 150ms
    this.scrubTimer = setTimeout(() => {
      this.scrubTimer = null;
      this.destroySource();
      this._playing = false;
      this.startOffset = seconds;
    }, 150);
  }

  /** Remove the loaded audio */
  unload(): void {
    this.stop();
    if (this.clipStopTimer) { clearTimeout(this.clipStopTimer); this.clipStopTimer = null; }
    this.buffer = null;
    this.duration = 0;
    this.name = '';
    this.startOffset = 0;
    this.resetClip();
  }

  private createSource(): void {
    if (!this.ctx || !this.buffer) return;
    this.destroySource();

    this.source = this.ctx.createBufferSource();
    this.source.buffer = this.buffer;
    this.source.playbackRate.value = this._playbackRate;
    this.source.onended = () => {
      // Natural end of playback
      if (this._playing) {
        this._playing = false;
        this.startOffset = this.duration;
      }
    };

    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this._volume;

    this.source.connect(this.gainNode);
    this.gainNode.connect(this.ctx.destination);
  }

  private destroySource(): void {
    if (this.source) {
      try { this.source.stop(); } catch { /* already stopped */ }
      this.source.disconnect();
      this.source = null;
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
  }
}
