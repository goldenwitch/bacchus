import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getApiKey, setApiKey, clearApiKey } from '../../src/lib/chat/apikey.js';

describe('apikey', () => {
  beforeEach(() => {
    localStorage.removeItem('bacchus:anthropic-key');
    // Remove any env key — delete so it doesn't become the string "undefined"
    delete (import.meta.env as Record<string, string | undefined>)
      .VITE_ANTHROPIC_API_KEY;
  });

  it('returns key from localStorage when no env key is set', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stored');
    expect(getApiKey()).toBe('sk-stored');
  });

  it('returns env var when set', () => {
    (
      import.meta.env as Record<string, string | undefined>
    ).VITE_ANTHROPIC_API_KEY = 'sk-env';
    expect(getApiKey()).toBe('sk-env');
  });

  it('returns null when neither source has a key', () => {
    expect(getApiKey()).toBeNull();
  });

  it('returns null when localStorage throws and no env key', () => {
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

  it('prefers env var over localStorage', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stored');
    (
      import.meta.env as Record<string, string | undefined>
    ).VITE_ANTHROPIC_API_KEY = 'sk-env';
    expect(getApiKey()).toBe('sk-env');
  });

  it('syncs env var to localStorage, replacing stale key', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stale');
    (
      import.meta.env as Record<string, string | undefined>
    ).VITE_ANTHROPIC_API_KEY = 'sk-env';
    getApiKey();
    expect(localStorage.getItem('bacchus:anthropic-key')).toBe('sk-env');
  });

  it('setApiKey stores the key in localStorage', () => {
    setApiKey('sk-new-key');
    expect(localStorage.getItem('bacchus:anthropic-key')).toBe('sk-new-key');
  });

  it('clearApiKey removes the key from localStorage', () => {
    localStorage.setItem('bacchus:anthropic-key', 'sk-stored');
    clearApiKey();
    expect(localStorage.getItem('bacchus:anthropic-key')).toBeNull();
  });
});
