import type { PortalColorTheme } from '../store/PortalTypes';

const THEME_FREQUENCIES: Record<PortalColorTheme, { low: number; high: number }> = {
  violet: { low: 240, high: 690 },
  amber: { low: 210, high: 590 },
  mint: { low: 280, high: 760 },
};

export class PortalAudio {
  private ctx: AudioContext | null = null;
  private _volume = 0.55;
  private noiseBuffer: AudioBuffer | null = null;
  private enterBuffer: AudioBuffer | null = null;
  private exitBuffer: AudioBuffer | null = null;
  private _loadStarted = false;

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
  }

  playPlacement(theme: PortalColorTheme) {
    if (this._volume <= 0.001) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const palette = THEME_FREQUENCIES[theme];
    this.playNoiseBurst(now, 0.07, this._volume * 0.05, palette.high * 1.35, 0.1);
    this.playTone('triangle', palette.low * 1.2, palette.high * 0.96, now, 0.06, this._volume * 0.16, -0.18);
    this.playTone('sine', palette.high * 0.92, palette.high * 1.08, now + 0.032, 0.11, this._volume * 0.14, 0.18);
  }

  playTeleport(theme: PortalColorTheme, speed: number) {
    if (this._volume <= 0.001) return;
    const ctx = this.ensureContext();
    const now = ctx.currentTime;
    const speedFactor = Math.max(0.8, Math.min(1.9, 0.85 + speed / 18));

    if (this.enterBuffer || this.exitBuffer) {
      if (this.enterBuffer) this.playBuffer(this.enterBuffer, now, speedFactor);
      if (this.exitBuffer) this.playBuffer(this.exitBuffer, now + 0.1, speedFactor);
    } else {
      // Synthesized fallback
      const palette = THEME_FREQUENCIES[theme];
      this.playNoiseBurst(now, 0.09, this._volume * 0.08, palette.low * 1.8, -0.18);
      this.playNoiseBurst(now + 0.03, 0.12, this._volume * 0.06, palette.high * 1.1 * speedFactor, 0.22);
      this.playTone('triangle', palette.low * 0.9, palette.low * 0.42, now, 0.09, this._volume * 0.13, -0.28);
      this.playTone('sine', palette.high * 0.74 * speedFactor, palette.high * 1.22 * speedFactor, now + 0.028, 0.16, this._volume * 0.2, 0.3);
      this.playTone('triangle', palette.high * 0.58, palette.high * 0.88, now + 0.044, 0.08, this._volume * 0.08, 0.08);
    }
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    this.startLoadingBuffers();
    return this.ctx;
  }

  private startLoadingBuffers() {
    if (this._loadStarted) return;
    this._loadStarted = true;
    const ctx = this.ctx!;

    const load = async (url: string): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        return null;
      }
    };

    void Promise.all([
      load('/audio/portal-enter.ogg'),
      load('/audio/portal-exit.ogg'),
    ]).then(([enter, exit]) => {
      this.enterBuffer = enter;
      this.exitBuffer = exit;
    });
  }

  private playBuffer(buffer: AudioBuffer, startTime: number, rate = 1.0) {
    const ctx = this.ensureContext();
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    gain.gain.value = this._volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime);
    src.onended = () => { src.disconnect(); gain.disconnect(); };
  }

  private getNoiseBuffer(): AudioBuffer {
    const ctx = this.ensureContext();
    if (this.noiseBuffer) return this.noiseBuffer;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.25), ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < channel.length; i++) {
      channel[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private playTone(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    startTime: number,
    duration: number,
    peakGain: number,
    pan = 0,
  ) {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    let panner: StereoPannerNode | null = null;

    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + Math.min(0.02, duration * 0.35));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startTime);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }

    osc.connect(gain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
  }

  private playNoiseBurst(
    startTime: number,
    duration: number,
    peakGain: number,
    cutoff: number,
    pan = 0,
  ) {
    const ctx = this.ensureContext();
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    let panner: StereoPannerNode | null = null;

    source.buffer = this.getNoiseBuffer();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(Math.max(120, cutoff), startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.42), startTime + duration);
    filter.Q.value = 0.9;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peakGain), startTime + Math.min(0.02, duration * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    source.connect(filter);
    filter.connect(gain);
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), startTime);
      gain.connect(panner);
      panner.connect(ctx.destination);
    } else {
      gain.connect(ctx.destination);
    }

    source.start(startTime);
    source.stop(startTime + duration + 0.04);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
      panner?.disconnect();
    };
  }
}
