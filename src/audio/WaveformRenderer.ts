import { TIMESTEP } from '../constants';

/**
 * Renders an audio waveform onto a canvas element that sits behind the timeline scrubber.
 * Downsamples AudioBuffer peaks to match the pixel width of the timeline.
 */
export class WaveformRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private peaks: Float32Array | null = null;
  private sampleRate = 0;
  private audioDuration = 0; // seconds

  // Colors
  private barColor = 'rgba(0,0,0,0.15)';
  private playedColor = 'rgba(0,0,0,0.3)';
  private durationBarColor = 'rgba(0,0,0,0.06)';
  private durationPlayedColor = 'rgba(0,0,0,0.1)';
  private beatColor = 'rgba(0,0,0,0.35)';
  private beatSubColor = 'rgba(0,0,0,0.12)';

  // Beat grid
  private _bpm = 0;
  private _beatOffset = 0; // seconds — aligns beat grid to audio offset
  private _beatSnap = 1; // 0=off, 1=beat, 2=half, 4=quarter

  // Dirty tracking — skip redraws when nothing changed
  private lastFrame = -1;
  private lastMaxFrame = -1;
  private lastWidth = 0;
  private lastBpm = -1;
  private lastBeatOffset = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  get bpm(): number { return this._bpm; }
  set bpm(v: number) {
    this._bpm = Math.max(0, v);
    this.lastBpm = -1; // force redraw
  }

  get beatOffset(): number { return this._beatOffset; }
  set beatOffset(v: number) {
    this._beatOffset = v;
    this.lastBeatOffset = -1;
  }

  get beatSnap(): number { return this._beatSnap; }
  set beatSnap(v: number) { this._beatSnap = v; }

  /**
   * Snap a physics frame to the nearest beat (or sub-beat).
   * Returns the snapped frame, or the original if BPM is 0 or snap is off.
   */
  snapFrameToBeat(frame: number): number {
    if (this._bpm <= 0 || this._beatSnap <= 0) return frame;

    const fps = 1000 / TIMESTEP;
    const seconds = frame / fps;
    const beatInterval = 60 / (this._bpm * this._beatSnap);
    const offsetSeconds = this._beatOffset;

    // Find nearest beat grid line
    const relativeTime = seconds - offsetSeconds;
    const nearestBeatIndex = Math.round(relativeTime / beatInterval);
    const snappedSeconds = nearestBeatIndex * beatInterval + offsetSeconds;
    return Math.max(0, Math.round(snappedSeconds * fps));
  }

  /** Get frames-per-beat for display (e.g. "24 frames/beat") */
  get framesPerBeat(): number {
    if (this._bpm <= 0) return 0;
    const fps = 1000 / TIMESTEP;
    return (60 / this._bpm) * fps;
  }

  /** Set audio duration without peak data (e.g. for YouTube) — draws a duration bar */
  setDuration(seconds: number): void {
    this.audioDuration = seconds;
    this.peaks = null;
    this.lastFrame = -1; // force redraw
    this.draw(0, 0);
  }

  get hasPeaks(): boolean {
    return this.peaks !== null && this.peaks.length > 0;
  }

  get hasAudio(): boolean {
    return this.audioDuration > 0;
  }

  /** Extract peak data from an AudioBuffer (mono-mixed, absolute peaks) */
  loadBuffer(buffer: AudioBuffer): void {
    this.sampleRate = buffer.sampleRate;
    this.audioDuration = buffer.duration;

    // Mix all channels to mono absolute peaks
    const length = buffer.length;
    const peaks = new Float32Array(length);
    const numChannels = buffer.numberOfChannels;

    for (let ch = 0; ch < numChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > peaks[i]) peaks[i] = abs;
      }
    }

    this.peaks = peaks;
    this.lastFrame = -1; // force redraw
    this.draw(0, 0);
  }

  /** Clear waveform data */
  clear(): void {
    this.peaks = null;
    this.audioDuration = 0;
    this.lastFrame = -1;
    this.lastMaxFrame = -1;
    this.lastWidth = 0;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the waveform, downsampled to fit the canvas width.
   * @param currentFrame Current physics frame (for playhead coloring)
   * @param maxFrame Maximum frame on the timeline (determines visible range)
   */
  draw(currentFrame: number, maxFrame: number): void {
    const { canvas, ctx, peaks } = this;

    // Match canvas pixel size to its CSS size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    // Skip redraw if nothing changed
    if (
      currentFrame === this.lastFrame &&
      maxFrame === this.lastMaxFrame &&
      w === this.lastWidth &&
      this._bpm === this.lastBpm &&
      this._beatOffset === this.lastBeatOffset
    ) {
      return;
    }
    this.lastFrame = currentFrame;
    this.lastMaxFrame = maxFrame;
    this.lastWidth = w;
    this.lastBpm = this._bpm;
    this.lastBeatOffset = this._beatOffset;

    ctx.clearRect(0, 0, w, h);

    // Timeline range in seconds — minimum 30s (1200 frames at 40fps)
    const fps = 1000 / TIMESTEP;
    const displayMax = Math.max(maxFrame, 1200);
    const timelineSeconds = displayMax / fps;

    const currentSeconds = currentFrame / fps;
    const playheadX = Math.round((currentSeconds / timelineSeconds) * w);

    if (peaks && peaks.length > 0) {
      // Draw waveform peaks (local audio)
      const totalAudioSamples = peaks.length;
      const audioSeconds = this.audioDuration;

      const samplesPerPixel = (audioSeconds / timelineSeconds) * (totalAudioSamples / w);
      const audioPixels = Math.min(w, Math.round((audioSeconds / timelineSeconds) * w));

      const halfH = h / 2;

      for (let px = 0; px < audioPixels; px++) {
        const sampleStart = Math.floor(px * samplesPerPixel);
        const sampleEnd = Math.min(Math.floor((px + 1) * samplesPerPixel), totalAudioSamples);

        let peak = 0;
        for (let s = sampleStart; s < sampleEnd; s++) {
          if (peaks[s] > peak) peak = peaks[s];
        }

        const barH = peak * halfH * 0.9;
        if (barH < 0.5) continue;

        ctx.fillStyle = px <= playheadX ? this.playedColor : this.barColor;
        ctx.fillRect(px, halfH - barH, Math.max(1, dpr), barH * 2);
      }
    } else if (this.audioDuration > 0) {
      // No peaks (YouTube) — draw a simple audio duration bar
      const audioPixels = Math.min(w, Math.round((this.audioDuration / timelineSeconds) * w));
      const barH = Math.round(h * 0.4);
      const barY = Math.round((h - barH) / 2);

      // Played portion
      const playedPx = Math.min(playheadX, audioPixels);
      if (playedPx > 0) {
        ctx.fillStyle = this.durationPlayedColor;
        ctx.fillRect(0, barY, playedPx, barH);
      }
      // Remaining portion
      if (audioPixels > playedPx) {
        ctx.fillStyle = this.durationBarColor;
        ctx.fillRect(playedPx, barY, audioPixels - playedPx, barH);
      }
    }

    // Draw beat grid markers
    this.drawBeatGrid(ctx, w, h, timelineSeconds, dpr);
  }

  private drawBeatGrid(
    ctx: CanvasRenderingContext2D,
    w: number, h: number,
    timelineSeconds: number,
    dpr: number,
  ): void {
    if (this._bpm <= 0) return;

    const beatInterval = 60 / this._bpm; // seconds per beat
    const offsetSeconds = this._beatOffset;

    // Draw sub-beats first (behind main beats)
    if (this._beatSnap > 1) {
      const subInterval = beatInterval / this._beatSnap;
      ctx.fillStyle = this.beatSubColor;
      let t = offsetSeconds >= 0 ? offsetSeconds % subInterval : offsetSeconds;
      while (t < timelineSeconds) {
        if (t >= 0) {
          // Skip positions that land on main beats
          const relToBeat = (t - offsetSeconds) / beatInterval;
          if (Math.abs(relToBeat - Math.round(relToBeat)) > 0.01) {
            const px = Math.round((t / timelineSeconds) * w);
            if (px >= 0 && px < w) {
              ctx.fillRect(px, h * 0.3, Math.max(1, dpr), h * 0.4);
            }
          }
        }
        t += subInterval;
      }
    }

    // Draw main beat lines
    ctx.fillStyle = this.beatColor;
    let t = offsetSeconds >= 0 ? offsetSeconds % beatInterval : offsetSeconds;
    let beatNum = 0;
    while (t < timelineSeconds) {
      if (t >= 0) {
        const px = Math.round((t / timelineSeconds) * w);
        if (px >= 0 && px < w) {
          // Downbeat (every 4 beats) gets full height, others shorter
          const isDownbeat = beatNum % 4 === 0;
          const lineH = isDownbeat ? h : h * 0.6;
          const lineY = (h - lineH) / 2;
          ctx.fillRect(px, lineY, Math.max(1, dpr), lineH);
        }
      }
      t += beatInterval;
      beatNum++;
    }
  }
}
