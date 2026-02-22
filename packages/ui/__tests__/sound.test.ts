import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMockAudioContext() {
  const gainNode = {
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const oscillator = {
    type: 'sine',
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const bufferSource = {
    buffer: null as unknown,
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  const biquadFilter = {
    type: 'bandpass',
    frequency: {
      value: 0,
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    Q: { value: 0, setValueAtTime: vi.fn() },
    connect: vi.fn(),
  };

  return {
    __gainNode: gainNode,
    __oscillator: oscillator,
    __bufferSource: bufferSource,
    __biquadFilter: biquadFilter,
    state: 'running' as string,
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => ({ ...gainNode, gain: { ...gainNode.gain } })),
    createOscillator: vi.fn(() => ({
      ...oscillator,
      frequency: { ...oscillator.frequency },
    })),
    createBufferSource: vi.fn(() => ({ ...bufferSource })),
    createBiquadFilter: vi.fn(() => ({
      ...biquadFilter,
      frequency: { ...biquadFilter.frequency },
      Q: { ...biquadFilter.Q },
    })),
    createBuffer: vi.fn(
      (channels: number, length: number, sampleRate: number) => ({
        getChannelData: vi.fn(() => new Float32Array(length)),
        numberOfChannels: channels,
        length,
        sampleRate,
        duration: length / sampleRate,
      }),
    ),
  };
}

let mockCtx: ReturnType<typeof createMockAudioContext>;

beforeEach(() => {
  vi.resetModules();

  mockCtx = createMockAudioContext();
  vi.stubGlobal(
    'AudioContext',
    vi.fn(() => mockCtx),
  );

  const storage: Record<string, string> = {};
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage[key] ?? null),
    setItem: vi.fn((key: string, val: string) => {
      storage[key] = val;
    }),
    removeItem: vi.fn((key: string) => {
      delete storage[key];
    }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadSound() {
  return await import('../src/lib/sound.js');
}

describe('initAudio', () => {
  it('creates AudioContext and master GainNode', async () => {
    const sound = await loadSound();
    sound.initAudio();

    expect(AudioContext).toHaveBeenCalledTimes(1);
    expect(mockCtx.createGain).toHaveBeenCalled();
  });
});

describe('playPop', () => {
  it('creates oscillator with sine type after init', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playPop();

    expect(mockCtx.createOscillator).toHaveBeenCalled();
    // The oscillator returned by createOscillator should have sine type
    const osc = mockCtx.createOscillator.mock.results.find(
      (r) => r.type === 'return',
    )?.value;
    expect(osc).toBeDefined();
    expect(osc.type).toBe('sine');
  });
});

describe('playHover', () => {
  it('creates oscillator at 880Hz after init', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playHover();

    expect(mockCtx.createOscillator).toHaveBeenCalled();
    const osc = mockCtx.createOscillator.mock.results.find(
      (r) => r.type === 'return',
    )?.value;
    expect(osc).toBeDefined();
    // frequency.setValueAtTime should have been called with 880
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
  });
});

describe('playWhoosh', () => {
  it('creates buffer source and biquad filter after init', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playWhoosh();

    expect(mockCtx.createBufferSource).toHaveBeenCalled();
    expect(mockCtx.createBiquadFilter).toHaveBeenCalled();
  });
});

describe('isMuted / setMuted', () => {
  it('returns false initially', async () => {
    const sound = await loadSound();
    expect(sound.isMuted()).toBe(false);
  });

  it('returns true after setMuted(true) and persists to localStorage', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.setMuted(true);

    expect(sound.isMuted()).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bacchus-ui-muted',
      'true',
    );
  });
});

describe('play functions before init (no AudioContext)', () => {
  it('no-op when AudioContext is unavailable', async () => {
    const sound = await loadSound();
    // Do NOT call initAudio — ctx is null

    // Should not throw
    sound.playPop();
    sound.playHover();
    sound.playWhoosh();

    // No oscillator or buffer source should have been created on the mock
    // (because initAudio was never called, so the module's internal ctx is null)
    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
  });
});

describe('play functions when muted', () => {
  it('no-op when muted (ready() returns false)', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.setMuted(true);

    // Reset call counts after init
    mockCtx.createOscillator.mockClear();
    mockCtx.createBufferSource.mockClear();

    sound.playPop();
    sound.playHover();
    sound.playWhoosh();

    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    expect(mockCtx.createBufferSource).not.toHaveBeenCalled();
  });
});

describe('sound spec compliance', () => {
  it('playPop sweeps frequency from 600 to 200 Hz', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playPop();
    const osc = mockCtx.createOscillator.mock.results[0]?.value;
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
      600,
      expect.any(Number),
    );
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      200,
      expect.any(Number),
    );
  });

  it('playPop has 5ms attack and 150ms decay', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playPop();
    const gain = mockCtx.createGain.mock.results[1]?.value; // index 1 = pop's gain (0 = master)
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 0.005);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      0.005 + 0.15,
    );
  });

  it('playHover is 880Hz sine with 3ms attack and 60ms decay', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playHover();
    const osc = mockCtx.createOscillator.mock.results[0]?.value;
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, 0);
    const gain = mockCtx.createGain.mock.results[1]?.value;
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 0.003);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      0.003 + 0.06,
    );
  });

  it('playWhoosh bandpass sweeps 200 to 800 Hz', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playWhoosh();
    const filter = mockCtx.createBiquadFilter.mock.results[0]?.value;
    expect(filter.frequency.setValueAtTime).toHaveBeenCalledWith(200, 0);
    expect(filter.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      800,
      expect.any(Number),
    );
  });

  it('playWhoosh has 10ms attack and 300ms decay', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.playWhoosh();
    const gain = mockCtx.createGain.mock.results[1]?.value;
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 0.01);
    expect(gain.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
      0,
      0.01 + 0.3,
    );
  });

  it('master gain is 0.3 when unmuted', async () => {
    const sound = await loadSound();
    sound.initAudio();
    const masterGain = mockCtx.createGain.mock.results[0]?.value;
    expect(masterGain.gain.value).toBe(0.3);
  });

  it('initAudio resumes suspended AudioContext', async () => {
    mockCtx.state = 'suspended';
    const sound = await loadSound();
    sound.initAudio();
    expect(mockCtx.resume).toHaveBeenCalled();
  });
});

describe('setVolume / getVolume', () => {
  it('sets and gets volume', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.setVolume(0.7);
    expect(sound.getVolume()).toBe(0.7);
  });

  it('clamps volume to [0, 1]', async () => {
    const sound = await loadSound();
    sound.setVolume(2);
    expect(sound.getVolume()).toBe(1);
    sound.setVolume(-1);
    expect(sound.getVolume()).toBe(0);
  });

  it('mutes when volume set to 0', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.setVolume(0);
    expect(sound.isMuted()).toBe(true);
  });

  it('unmutes when volume set above 0 while muted', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.setMuted(true);
    expect(sound.isMuted()).toBe(true);
    sound.setVolume(0.5);
    expect(sound.isMuted()).toBe(false);
  });

  it('updates masterGain when initialized', async () => {
    const sound = await loadSound();
    sound.initAudio();
    const masterGain = mockCtx.createGain.mock.results[0]?.value;
    sound.setVolume(0.8);
    expect(masterGain.gain.value).toBe(0.8);
  });

  it('persists volume to localStorage', async () => {
    const sound = await loadSound();
    sound.setVolume(0.6);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'bacchus-ui-volume',
      '0.6',
    );
  });
});

describe('initAudio error handling', () => {
  it('handles AudioContext constructor failure gracefully', async () => {
    vi.stubGlobal(
      'AudioContext',
      vi.fn(() => {
        throw new Error('AudioContext not supported');
      }),
    );
    const sound = await loadSound();

    expect(() => sound.initAudio()).not.toThrow();

    // play functions should be no-ops
    expect(() => sound.playPop()).not.toThrow();
    expect(() => sound.playHover()).not.toThrow();
    expect(() => sound.playWhoosh()).not.toThrow();
  });
});

describe('initAudio idempotency', () => {
  it('does not create a second AudioContext on repeat call', async () => {
    const sound = await loadSound();
    sound.initAudio();
    sound.initAudio();
    expect(AudioContext).toHaveBeenCalledTimes(1);
  });
});

describe('loadVolumeState', () => {
  it('reads persisted volume from localStorage on init', async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string) => {
        if (key === 'bacchus-ui-volume') return '0.6';
        return null;
      },
    );
    const sound = await loadSound();
    sound.initAudio();
    const masterGain = mockCtx.createGain.mock.results[0]?.value;
    expect(masterGain.gain.value).toBe(0.6);
    expect(sound.getVolume()).toBe(0.6);
  });
});

describe('play functions with AudioContext in suspended state', () => {
  it('attempts to resume suspended context before playing', async () => {
    const sound = await loadSound();
    sound.initAudio();
    // After init, set state to suspended
    mockCtx.state = 'suspended';
    mockCtx.resume.mockClear();

    sound.playPop();
    expect(mockCtx.resume).toHaveBeenCalled();
  });
});

describe('play functions catch blocks', () => {
  it('playPop swallows errors from createOscillator', async () => {
    const sound = await loadSound();
    sound.initAudio();
    mockCtx.createOscillator.mockImplementation(() => {
      throw new Error('oscillator failed');
    });
    expect(() => sound.playPop()).not.toThrow();
  });

  it('playHover swallows errors from createOscillator', async () => {
    const sound = await loadSound();
    sound.initAudio();
    mockCtx.createOscillator.mockImplementation(() => {
      throw new Error('oscillator failed');
    });
    expect(() => sound.playHover()).not.toThrow();
  });

  it('playWhoosh swallows errors from createBufferSource', async () => {
    const sound = await loadSound();
    sound.initAudio();
    mockCtx.createBufferSource.mockImplementation(() => {
      throw new Error('buffer source failed');
    });
    expect(() => sound.playWhoosh()).not.toThrow();
  });
});
