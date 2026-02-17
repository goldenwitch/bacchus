// ---------------------------------------------------------------------------
// Sound engine – Web Audio API synthesizer (singleton, no audio files needed)
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

// ---------------------------------------------------------------------------
// Mute state (persisted to localStorage)
// ---------------------------------------------------------------------------

const MUTE_KEY = 'bacchus-ui-muted';
const VOLUME_KEY = 'bacchus-ui-volume';

let volume = 0.3; // default volume level (0–1)
let muted = loadMuteState();

function loadMuteState(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function loadVolumeState(): number {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored !== null) {
      const val = parseFloat(stored);
      if (!Number.isNaN(val) && val >= 0 && val <= 1) return val;
    }
  } catch {
    // ignore
  }
  return 0.3;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, String(value));
  } catch {
    // localStorage unavailable – ignore
  }
  if (masterGain) {
    masterGain.gain.value = muted ? 0 : volume;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setVolume(level: number): void {
  volume = Math.max(0, Math.min(1, level));
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // localStorage unavailable – ignore
  }
  if (volume === 0) {
    setMuted(true);
  } else {
    if (muted) setMuted(false);
    if (masterGain) {
      masterGain.gain.value = volume;
    }
  }
}

export function getVolume(): number {
  return volume;
}

// ---------------------------------------------------------------------------
// AudioContext lifecycle
// ---------------------------------------------------------------------------

function createNoiseBuffer(audioCtx: AudioContext): AudioBuffer {
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate; // 1 second of noise
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export function initAudio(): void {
  if (ctx) return;

  try {
    ctx = new AudioContext();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);

    // Read persisted state
    muted = loadMuteState();
    volume = loadVolumeState();
    masterGain.gain.value = muted ? 0 : volume;

    // Pre-generate white noise buffer
    noiseBuffer = createNoiseBuffer(ctx);

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  } catch {
    // AudioContext unavailable (SSR, unsupported browser) – stay silent
    ctx = null;
    masterGain = null;
    noiseBuffer = null;
  }
}

// ---------------------------------------------------------------------------
// Utility – ensure context is usable
// ---------------------------------------------------------------------------

function ready(): boolean {
  if (!ctx || !masterGain) return false;
  if (muted) return false;
  if (ctx.state === 'suspended') {
    void ctx.resume();
  }
  return ctx.state !== 'closed';
}

// ---------------------------------------------------------------------------
// playPop – short sine sweep 600 → 200 Hz
// ---------------------------------------------------------------------------

export function playPop(): void {
  try {
    if (!ready()) return;
    const ac = ctx as AudioContext;
    const master = masterGain as GainNode;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.005); // 5ms attack
    gain.gain.linearRampToValueAtTime(0, now + 0.005 + 0.15); // 150ms decay

    osc.connect(gain);
    gain.connect(master);

    osc.start(now);
    osc.stop(now + 0.005 + 0.15 + 0.01); // small tail to avoid click
  } catch {
    // fire-and-forget
  }
}

// ---------------------------------------------------------------------------
// playHover – quiet 880 Hz blip
// ---------------------------------------------------------------------------

export function playHover(): void {
  try {
    if (!ready()) return;
    const ac = ctx as AudioContext;
    const master = masterGain as GainNode;
    const now = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.003); // 3ms attack
    gain.gain.linearRampToValueAtTime(0, now + 0.003 + 0.06); // 60ms decay

    osc.connect(gain);
    gain.connect(master);

    osc.start(now);
    osc.stop(now + 0.003 + 0.06 + 0.01);
  } catch {
    // fire-and-forget
  }
}

// ---------------------------------------------------------------------------
// playWhoosh – bandpass-filtered white noise sweep
// ---------------------------------------------------------------------------

export function playWhoosh(): void {
  try {
    if (!ready() || !noiseBuffer) return;
    const ac = ctx as AudioContext;
    const master = masterGain as GainNode;
    const now = ac.currentTime;

    const source = ac.createBufferSource();
    source.buffer = noiseBuffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(1, now);
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.3);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.8, now + 0.01); // 10ms attack
    gain.gain.linearRampToValueAtTime(0, now + 0.01 + 0.3); // 300ms decay

    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);

    source.start(now);
    source.stop(now + 0.01 + 0.3 + 0.01);
  } catch {
    // fire-and-forget
  }
}
