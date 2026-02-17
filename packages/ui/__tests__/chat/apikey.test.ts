import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiKey, setApiKey } from '../../src/lib/chat/apikey.js';

describe('apikey', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus:anthropic-key');
    // Remove any env key — delete so it doesn't become the string "undefined"
    delete (import.meta.env as Record<string, string | undefined>)
      .VITE_ANTHROPIC_API_KEY;
  });

  it('returns key from localStorage when present', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stored');
    expect(getApiKey()).toBe('sk-stored');
  });

  it('falls back to VITE_ANTHROPIC_API_KEY env var', () => {
    (
      import.meta.env as Record<string, string | undefined>
    ).VITE_ANTHROPIC_API_KEY = 'sk-env';
    expect(getApiKey()).toBe('sk-env');
  });

  it('returns null when neither source has a key', () => {
    expect(getApiKey()).toBeNull();
  });

  it('returns null when localStorage throws', () => {
    // Temporarily replace localStorage with one that throws
    const real = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError');
      },
    });

    expect(getApiKey()).toBeNull();

    // Restore
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: real,
    });
  });

  it('prefers localStorage over env var', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stored');
    (
      import.meta.env as Record<string, string | undefined>
    ).VITE_ANTHROPIC_API_KEY = 'sk-env';
    expect(getApiKey()).toBe('sk-stored');
  });

  it('setApiKey stores the key in localStorage', () => {
    setApiKey('sk-new-key');
    expect(localStorage.getItem('bacchus:anthropic-key')).toBe('sk-new-key');
  });
});
