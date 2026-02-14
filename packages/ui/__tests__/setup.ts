import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock AudioContext globally for all tests
// ---------------------------------------------------------------------------
const mockGainNode = {
  gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const mockAudioContext = {
  state: 'running',
  currentTime: 0,
  sampleRate: 44100,
  destination: {},
  resume: vi.fn().mockResolvedValue(undefined),
  createGain: vi.fn(() => ({
    ...mockGainNode,
    gain: { ...mockGainNode.gain },
  })),
  createOscillator: vi.fn(() => ({
    type: 'sine',
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createBufferSource: vi.fn(() => ({
    buffer: null,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createBiquadFilter: vi.fn(() => ({
    type: 'bandpass',
    frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    Q: { value: 0, setValueAtTime: vi.fn() },
    connect: vi.fn(),
  })),
  createBuffer: vi.fn((_ch: number, length: number, sampleRate: number) => ({
    getChannelData: vi.fn(() => new Float32Array(length)),
    numberOfChannels: _ch,
    length,
    sampleRate,
    duration: length / sampleRate,
  })),
};

vi.stubGlobal('AudioContext', vi.fn(() => ({ ...mockAudioContext })));

// ---------------------------------------------------------------------------
// Mock localStorage
// ---------------------------------------------------------------------------
const storage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => { storage[key] = val; }),
  removeItem: vi.fn((key: string) => { delete storage[key]; }),
});
