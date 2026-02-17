import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
} from '../../src/lib/chat/sessionStore.js';
import type { DisplayMessage } from '../../src/lib/chat/types.js';
import type { ChatMessage } from '../../src/lib/chat/types.js';

const STORAGE_KEY = 'bacchus:chat-sessions';

function makeDisplay(text: string): DisplayMessage {
  return { type: 'user', content: text };
}

function makeChat(text: string): ChatMessage {
  return { role: 'user', content: text };
}

describe('sessionStore', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves and loads a session', () => {
    saveSession('root-1', [makeDisplay('hello')], [makeChat('hello')]);
    const loaded = loadSession('root-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.vineId).toBe('root-1');
    expect(loaded?.displayMessages).toHaveLength(1);
    expect(loaded?.chatMessages).toHaveLength(1);
    expect(loaded?.savedAt).toBeGreaterThan(0);
  });

  it('returns null for unknown vineId', () => {
    expect(loadSession('nonexistent')).toBeNull();
  });

  it('upserts existing sessions', () => {
    saveSession('root-1', [makeDisplay('first')], [makeChat('first')]);
    saveSession('root-1', [makeDisplay('second')], [makeChat('second')]);

    const sessions = listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.displayMessages[0]).toEqual(makeDisplay('second'));
  });

  it('evicts oldest sessions beyond the limit of 5', () => {
    for (let i = 0; i < 7; i++) {
      vi.advanceTimersByTime(1000);
      saveSession(`vine-${String(i)}`, [makeDisplay(`msg-${String(i)}`)], []);
    }

    const sessions = listSessions();
    expect(sessions.length).toBeLessThanOrEqual(5);

    // The two oldest (vine-0, vine-1) should have been evicted
    expect(loadSession('vine-0')).toBeNull();
    expect(loadSession('vine-1')).toBeNull();
    // The most recent should still exist
    expect(loadSession('vine-6')).not.toBeNull();
  });

  it('lists sessions sorted by most recent first', () => {
    saveSession('a', [makeDisplay('a')], []);
    vi.advanceTimersByTime(1000);
    saveSession('b', [makeDisplay('b')], []);
    vi.advanceTimersByTime(1000);
    saveSession('c', [makeDisplay('c')], []);

    const sessions = listSessions();
    expect(sessions).toHaveLength(3);
    // Most recently saved should be first
    expect(sessions[0]?.vineId).toBe('c');
  });

  it('deletes a session', () => {
    saveSession('root-1', [makeDisplay('hello')], []);
    expect(loadSession('root-1')).not.toBeNull();

    deleteSession('root-1');
    expect(loadSession('root-1')).toBeNull();
  });

  it('handles corrupt localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'not valid json');
    expect(loadSession('any')).toBeNull();
    expect(listSessions()).toEqual([]);
  });

  it('handles empty localStorage', () => {
    expect(listSessions()).toEqual([]);
    expect(loadSession('any')).toBeNull();
  });
});
