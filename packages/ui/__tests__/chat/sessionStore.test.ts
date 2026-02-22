import { describe, it, expect } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
} from '../../src/lib/chat/sessionStore.js';
import type { DisplayMessage } from '../../src/lib/chat/types.js';
import type { ChatMessage } from '../../src/lib/chat/types.js';

function makeDisplay(text: string): DisplayMessage {
  return { type: 'user', content: text };
}

function makeChat(text: string): ChatMessage {
  return { role: 'user', content: text };
}

// Use unique vineIds per test to avoid cross-test interference in shared IDB

describe('sessionStore', () => {
  it('saves and loads a session', async () => {
    await saveSession('ss-save-1', [makeDisplay('hello')], [makeChat('hello')]);
    const loaded = await loadSession('ss-save-1');
    expect(loaded).not.toBeNull();
    expect(loaded?.vineId).toBe('ss-save-1');
    expect(loaded?.displayMessages).toHaveLength(1);
    expect(loaded?.chatMessages).toHaveLength(1);
    expect(loaded?.savedAt).toBeGreaterThan(0);
  });

  it('returns null for unknown vineId', async () => {
    expect(await loadSession('ss-nonexistent')).toBeNull();
  });

  it('upserts existing sessions', async () => {
    await saveSession(
      'ss-upsert-1',
      [makeDisplay('first')],
      [makeChat('first')],
    );
    await saveSession(
      'ss-upsert-1',
      [makeDisplay('second')],
      [makeChat('second')],
    );

    const loaded = await loadSession('ss-upsert-1');
    expect(loaded?.displayMessages[0]).toEqual(makeDisplay('second'));
  });

  it('lists sessions sorted by most recent first', async () => {
    // Small delays to get distinct savedAt timestamps
    await saveSession('ss-sort-a', [makeDisplay('a')], []);
    await new Promise((r) => setTimeout(r, 15));
    await saveSession('ss-sort-b', [makeDisplay('b')], []);
    await new Promise((r) => setTimeout(r, 15));
    await saveSession('ss-sort-c', [makeDisplay('c')], []);

    const sessions = await listSessions();
    const ours = sessions.filter((s) => s.vineId.startsWith('ss-sort-'));
    expect(ours).toHaveLength(3);
    // Most recently saved should be first
    expect(ours[0]?.vineId).toBe('ss-sort-c');
  });

  it('deletes a session', async () => {
    await saveSession('ss-del-1', [makeDisplay('hello')], []);
    expect(await loadSession('ss-del-1')).not.toBeNull();

    await deleteSession('ss-del-1');
    expect(await loadSession('ss-del-1')).toBeNull();
  });

  it('handles empty store for unknown key', async () => {
    expect(await loadSession('ss-empty-unknown')).toBeNull();
  });
});
