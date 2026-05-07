// Per-vehicle sound effects using Web Audio API.
// Default sounds are synthesized procedurally; users can override per vehicle.

interface VehicleAudioConfig {
  noiseFilterType: BiquadFilterType;
  noiseFilterQ: number;
  freqAtSpeed: (s: number) => number;
  oscType?: OscillatorType;
  oscFreqAtSpeed?: (s: number) => number;
  // Fraction of mix volume assigned to oscillator (vs noise)
  oscMix?: number;
  gainAtSpeed: (s: number) => number;
}

// Speed units: world-units/second × 40 (TIMESTEP=25ms → ×40 = units/s)
// Typical comfortable riding: s ≈ 10–25. Fast: s ≈ 30–60.
const CONFIGS: Record<string, VehicleAudioConfig> = {
  sled: {
    // Brown-ish snow sound: lowpass white noise, soft and wide
    noiseFilterType: 'lowpass',
    noiseFilterQ: 0.7,
    freqAtSpeed: (s) => 140 + Math.pow(Math.min(s / 30, 1), 0.55) * 1300,
    gainAtSpeed: (s) => Math.pow(Math.min(s / 14, 1), 0.55) * 0.34,
  },
  bird: {
    // Airy high flutter: bandpass noise in treble range + light sine wobble
    noiseFilterType: 'bandpass',
    noiseFilterQ: 1.3,
    freqAtSpeed: (s) => 1800 + Math.min(s / 30, 1) * 4200,
    oscType: 'sine',
    oscFreqAtSpeed: (s) => 880 + s * 24,
    oscMix: 0.22,
    gainAtSpeed: (s) => Math.pow(Math.min(s / 10, 1), 0.6) * 0.15,
  },
  truck: {
    // Deep rumble: lowpass noise at very low cutoff + sawtooth engine hum
    noiseFilterType: 'lowpass',
    noiseFilterQ: 0.9,
    freqAtSpeed: (s) => 55 + Math.min(s / 30, 1) * 240,
    oscType: 'sawtooth',
    oscFreqAtSpeed: (s) => 36 + Math.min(s, 28) * 3.2,
    oscMix: 0.68,
    gainAtSpeed: (s) => 0.055 + Math.pow(Math.min(s / 20, 1), 0.7) * 0.28,
  },
  buggy: {
    // Mid-range engine rev: bandpass noise + prominent sawtooth
    noiseFilterType: 'bandpass',
    noiseFilterQ: 1.6,
    freqAtSpeed: (s) => 160 + Math.min(s / 30, 1) * 760,
    oscType: 'sawtooth',
    oscFreqAtSpeed: (s) => 65 + Math.min(s, 32) * 7.2,
    oscMix: 0.72,
    gainAtSpeed: (s) => Math.pow(Math.min(s / 9, 1), 0.5) * 0.24,
  },
  rollercoaster: {
    // Metallic rail clatter: narrow bandpass noise, higher Q for resonance
    noiseFilterType: 'bandpass',
    noiseFilterQ: 3.0,
    freqAtSpeed: (s) => 480 + Math.min(s / 30, 1) * 2200,
    gainAtSpeed: (s) => Math.pow(Math.min(s / 8, 1), 0.5) * 0.32,
  },
};

interface VoiceNodes {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode | null;
  sourceGain: GainNode | null;
  osc: OscillatorNode | null;
  oscGain: GainNode | null;
  mixGain: GainNode;
  vehicleId: string;
  isCustom: boolean;
}

export class VehicleSfx {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voice: VoiceNodes | null = null;
  private customBuffers = new Map<string, AudioBuffer>();
  private customNames = new Map<string, string>();
  private mutedVehicles = new Set<string>();
  private wreckBuffer: AudioBuffer | null = null;
  private _wreckLoadStarted = false;
  private currentVehicleId = 'sled';
  private _volume = 0.20;
  private _playing = false;

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
    }
  }

  setMuted(vehicleId: string, muted: boolean) {
    if (muted) {
      this.mutedVehicles.add(vehicleId);
      if (vehicleId === this.currentVehicleId && this.voice) {
        this.stopVoice();
      }
    } else {
      this.mutedVehicles.delete(vehicleId);
      if (vehicleId === this.currentVehicleId && this._playing && !this.voice) {
        this.startVoice(vehicleId);
      }
    }
  }

  isMuted(vehicleId: string): boolean {
    return this.mutedVehicles.has(vehicleId);
  }

  /** Play the wreck one-shot — ignores per-vehicle mute, respects master volume. */
  playWreck() {
    if (this._volume <= 0.001) return;
    this.startLoadingWreck();
    if (this.wreckBuffer) {
      this.playWreckBuffer();
    } else {
      // OGG not decoded yet — synthesized crash as immediate fallback
      this.playWreckSynthesized();
    }
  }

  private playWreckBuffer() {
    const ctx = this.ensureCtx();
    const src = ctx.createBufferSource();
    src.buffer = this.wreckBuffer!;
    const gain = ctx.createGain();
    gain.gain.value = this._volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start();
    src.onended = () => { src.disconnect(); gain.disconnect(); };
  }

  private playWreckSynthesized() {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    const vol = this._volume;

    // Sharp noise burst
    const noise = ctx.createBufferSource();
    noise.buffer = this.buildNoiseBuffer();
    const nfilt = ctx.createBiquadFilter();
    nfilt.type = 'bandpass';
    nfilt.frequency.value = 700;
    nfilt.Q.value = 0.4;
    const ngain = ctx.createGain();
    ngain.gain.setValueAtTime(vol * 0.8, now);
    ngain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
    noise.connect(nfilt);
    nfilt.connect(ngain);
    ngain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.32);
    noise.onended = () => { noise.disconnect(); nfilt.disconnect(); ngain.disconnect(); };

    // Low thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
    const ogain = ctx.createGain();
    ogain.gain.setValueAtTime(vol * 0.6, now);
    ogain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(ogain);
    ogain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
    osc.onended = () => { osc.disconnect(); ogain.disconnect(); };
  }

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private ensureMaster(): GainNode {
    const ctx = this.ensureCtx();
    if (!this.masterGain) {
      this.masterGain = ctx.createGain();
      this.masterGain.gain.value = this._volume;
      this.masterGain.connect(ctx.destination);
    }
    return this.masterGain;
  }

  private buildNoiseBuffer(): AudioBuffer {
    const ctx = this.ensureCtx();
    if (this.noiseBuffer) return this.noiseBuffer;
    // 6s of white noise, long enough to avoid obvious looping artifacts
    const samples = Math.floor(ctx.sampleRate * 6);
    const buf = ctx.createBuffer(1, samples, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < samples; i++) {
      ch[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private startLoadingWreck() {
    if (this._wreckLoadStarted) return;
    this._wreckLoadStarted = true;
    const ctx = this.ensureCtx();
    void fetch('/audio/wreck.ogg')
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(buf => buf ? ctx.decodeAudioData(buf) : null)
      .then(decoded => { if (decoded) this.wreckBuffer = decoded; })
      .catch(() => {});
  }

  start(vehicleId: string) {
    this._playing = true;
    this.currentVehicleId = vehicleId;
    if (!this.mutedVehicles.has(vehicleId)) {
      this.startVoice(vehicleId);
    }
    this.startLoadingWreck();
  }

  stop() {
    this._playing = false;
    this.stopVoice();
  }

  setVehicle(vehicleId: string) {
    this.currentVehicleId = vehicleId;
    if (this._playing) {
      this.stopVoice();
      if (!this.mutedVehicles.has(vehicleId)) {
        this.startVoice(vehicleId);
      }
    }
  }

  /**
   * Called every render frame while playing.
   * Speed in world-units/sec×40. onLine = sled touching any line.
   * onAccLine = touching an acceleration line (boosts pitch/rate slightly).
   */
  update(speed: number, onLine: boolean, onAccLine: boolean) {
    if (this.mutedVehicles.has(this.currentVehicleId)) return;
    const v = this.voice;
    if (!v || !this.ctx) return;
    const now = this.ctx.currentTime;
    const smooth = 0.07;
    const config = CONFIGS[v.vehicleId] ?? CONFIGS.sled;

    // Silence when airborne; boost effective speed on acc lines for a livelier sound
    const effectiveSpeed = onAccLine ? speed * 1.15 : speed;
    const targetGain = onLine ? config.gainAtSpeed(effectiveSpeed) : 0;
    v.mixGain.gain.setTargetAtTime(targetGain, now, smooth);

    const accRate = onAccLine ? 1.08 : 1.0;

    if (v.isCustom) {
      v.source.playbackRate.setTargetAtTime(accRate, now, smooth);
    } else {
      const freq = config.freqAtSpeed(effectiveSpeed);
      if (v.filter) {
        v.filter.frequency.setTargetAtTime(Math.max(30, freq), now, smooth);
      }
      if (v.osc && config.oscFreqAtSpeed) {
        v.osc.frequency.setTargetAtTime(Math.max(20, config.oscFreqAtSpeed(effectiveSpeed)), now, smooth);
      }
    }
  }

  setCustomBuffer(vehicleId: string, buffer: AudioBuffer, name: string) {
    this.customBuffers.set(vehicleId, buffer);
    this.customNames.set(vehicleId, name);
    if (this._playing && this.currentVehicleId === vehicleId && !this.mutedVehicles.has(vehicleId)) {
      this.stopVoice();
      this.startVoice(vehicleId);
    }
  }

  clearCustom(vehicleId: string) {
    this.customBuffers.delete(vehicleId);
    this.customNames.delete(vehicleId);
    if (this._playing && this.currentVehicleId === vehicleId && !this.mutedVehicles.has(vehicleId)) {
      this.stopVoice();
      this.startVoice(vehicleId);
    }
  }

  getCustomName(vehicleId: string): string | null {
    return this.customNames.get(vehicleId) ?? null;
  }

  hasCustom(vehicleId: string): boolean {
    return this.customBuffers.has(vehicleId);
  }

  /** Decode an ArrayBuffer into an AudioBuffer (call after loading from IndexedDB). */
  async decodeAudio(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensureCtx();
    return ctx.decodeAudioData(data.slice(0));
  }

  private startVoice(vehicleId: string) {
    this.stopVoice();
    const ctx = this.ensureCtx();
    const master = this.ensureMaster();
    const config = CONFIGS[vehicleId] ?? CONFIGS.sled;
    const customBuf = this.customBuffers.get(vehicleId);

    const mixGain = ctx.createGain();
    mixGain.gain.value = 0; // update() will ramp this up
    mixGain.connect(master);

    if (customBuf) {
      const src = ctx.createBufferSource();
      src.buffer = customBuf;
      src.loop = true;
      src.connect(mixGain);
      src.start();
      this.voice = { source: src, filter: null, sourceGain: null, osc: null, oscGain: null, mixGain, vehicleId, isCustom: true };
      return;
    }

    // Default synthesis
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this.buildNoiseBuffer();
    noiseSrc.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = config.noiseFilterType;
    filter.Q.value = config.noiseFilterQ;
    filter.frequency.value = config.freqAtSpeed(0);

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 1 - (config.oscMix ?? 0);

    noiseSrc.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(mixGain);
    noiseSrc.start();

    let osc: OscillatorNode | null = null;
    let oscGain: GainNode | null = null;
    if (config.oscType) {
      osc = ctx.createOscillator();
      osc.type = config.oscType;
      osc.frequency.value = config.oscFreqAtSpeed ? config.oscFreqAtSpeed(0) : 80;
      oscGain = ctx.createGain();
      oscGain.gain.value = config.oscMix ?? 0;
      osc.connect(oscGain);
      oscGain.connect(mixGain);
      osc.start();
    }

    this.voice = { source: noiseSrc, filter, sourceGain: noiseGain, osc, oscGain, mixGain, vehicleId, isCustom: false };
  }

  private stopVoice() {
    const v = this.voice;
    if (!v) return;
    this.voice = null;

    if (this.ctx) {
      const now = this.ctx.currentTime;
      v.mixGain.gain.setTargetAtTime(0, now, 0.04);
    }

    setTimeout(() => {
      try { v.source.stop(); } catch { /* already stopped */ }
      try { v.osc?.stop(); } catch {}
      for (const node of [v.source, v.filter, v.sourceGain, v.osc, v.oscGain, v.mixGain]) {
        try { (node as AudioNode | null)?.disconnect(); } catch {}
      }
    }, 150);
  }
}
