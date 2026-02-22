import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  saveAppState,
  loadAppState,
  loadLatestAppState,
  deleteAppState,
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  migrateFromLocalStorage,
  type PersistedAppState,
} from '../src/lib/persistence.js';

function makeAppState(
  vineId: string,
  overrides?: Partial<PersistedAppState>,
): PersistedAppState {
  return {
    vineId,
    vineText: `vine 1.0.0\n---\n[root] Root (notstarted)\nA task.\n`,
    camera: { x: 0, y: 0, k: 1 },
    focusedTaskId: null,
    chatOpen: false,
    inputDraft: '',
    savedAt: Date.now(),
    ...overrides,
  };
}

describe('persistence — app state', () => {
  it('saves and loads app state', async () => {
    const state = makeAppState('app-save-1');
    await saveAppState(state);

    const loaded = await loadAppState('app-save-1');
    expect(loaded).toBeDefined();
    expect(loaded?.vineId).toBe('app-save-1');
    expect(loaded?.vineText).toBe(state.vineText);
    expect(loaded?.camera).toEqual({ x: 0, y: 0, k: 1 });
  });

  it('returns undefined for unknown vineId', async () => {
    const loaded = await loadAppState('app-nonexistent');
    expect(loaded).toBeUndefined();
  });

  it('upserts existing app state', async () => {
    await saveAppState(makeAppState('app-upsert-1', { inputDraft: 'first' }));
    await saveAppState(makeAppState('app-upsert-1', { inputDraft: 'second' }));

    const loaded = await loadAppState('app-upsert-1');
    expect(loaded?.inputDraft).toBe('second');
  });

  it('deletes app state', async () => {
    await saveAppState(makeAppState('app-del-1'));
    expect(await loadAppState('app-del-1')).toBeDefined();

    await deleteAppState('app-del-1');
    expect(await loadAppState('app-del-1')).toBeUndefined();
  });

  it('loads the most recent app state', async () => {
    // Use timestamps far in the future to ensure these are the most recent
    // even with other test data in the shared IDB.
    const future = Date.now() + 1_000_000;
    await saveAppState(
      makeAppState('app-latest-a', { savedAt: future + 1000 }),
    );
    await saveAppState(
      makeAppState('app-latest-b', { savedAt: future + 3000 }),
    );
    await saveAppState(
      makeAppState('app-latest-c', { savedAt: future + 2000 }),
    );

    const latest = await loadLatestAppState();
    expect(latest).toBeDefined();
    expect(latest?.vineId).toBe('app-latest-b');
  });

  it('returns a result from loadLatestAppState', async () => {
    // After previous tests stored data, loadLatestAppState should return something.
    const result = await loadLatestAppState();
    expect(result).toBeDefined();
    expect(result?.vineId).toBeDefined();
  });
});

describe('persistence — sessions', () => {
  it('saves and loads a session', async () => {
    await saveSession(
      'p-sess-1',
      [{ type: 'user', content: 'hi' }],
      [{ role: 'user', content: 'hi' }],
    );
    const loaded = await loadSession('p-sess-1');
    expect(loaded).toBeDefined();
    expect(loaded?.vineId).toBe('p-sess-1');
    expect(loaded?.displayMessages).toHaveLength(1);
    expect(loaded?.chatMessages).toHaveLength(1);
    expect(loaded?.savedAt).toBeGreaterThan(0);
  });

  it('returns undefined for unknown session', async () => {
    const loaded = await loadSession('p-sess-nonexistent');
    expect(loaded).toBeUndefined();
  });

  it('deletes a session', async () => {
    await saveSession('p-sess-del-1', [{ type: 'user', content: 'hi' }], []);
    expect(await loadSession('p-sess-del-1')).toBeDefined();
    await deleteSession('p-sess-del-1');
    expect(await loadSession('p-sess-del-1')).toBeUndefined();
  });

  it('lists sessions sorted by most recent', async () => {
    await saveSession('p-list-a', [{ type: 'user', content: 'a' }], []);
    await new Promise((r) => setTimeout(r, 15));
    await saveSession('p-list-b', [{ type: 'user', content: 'b' }], []);
    await new Promise((r) => setTimeout(r, 15));
    await saveSession('p-list-c', [{ type: 'user', content: 'c' }], []);

    const all = await listSessions();
    const ours = all.filter((s) => s.vineId.startsWith('p-list-'));
    expect(ours).toHaveLength(3);
    expect(ours[0]?.vineId).toBe('p-list-c');
  });
});

describe('persistence — migrateFromLocalStorage', () => {
  const OLD_STORAGE_KEY = 'bacchus:chat-sessions';
  const MIGRATION_FLAG = 'bacchus:idb-migrated';

  beforeEach(() => {
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.removeItem(MIGRATION_FLAG);
  });

  it('sets migration flag when no old data exists', async () => {
    await migrateFromLocalStorage();
    expect(localStorage.getItem(MIGRATION_FLAG)).toBe('1');
  });

  it('skips if already migrated', async () => {
    localStorage.setItem(MIGRATION_FLAG, '1');
    // Even with old data present, migration should be a no-op.
    localStorage.setItem(
      OLD_STORAGE_KEY,
      JSON.stringify([
        { vineId: 'migrated-skip', displayMessages: [], chatMessages: [] },
      ]),
    );

    await migrateFromLocalStorage();
    // Old data should still be there (not cleaned up since migration was skipped).
    expect(localStorage.getItem(OLD_STORAGE_KEY)).not.toBeNull();
  });

  it('migrates valid sessions from localStorage to IDB', async () => {
    const sessions = [
      {
        vineId: 'migrated-1',
        displayMessages: [{ type: 'user', content: 'hello' }],
        chatMessages: [{ role: 'user', content: 'hello' }],
      },
      { vineId: 'migrated-2', displayMessages: [], chatMessages: [] },
    ];
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(sessions));

    await migrateFromLocalStorage();

    // Migration flag should be set.
    expect(localStorage.getItem(MIGRATION_FLAG)).toBe('1');
    // Old data should be removed.
    expect(localStorage.getItem(OLD_STORAGE_KEY)).toBeNull();
    // Sessions should be loadable from IDB.
    const loaded1 = await loadSession('migrated-1');
    expect(loaded1).toBeDefined();
    expect(loaded1?.displayMessages).toHaveLength(1);
    const loaded2 = await loadSession('migrated-2');
    expect(loaded2).toBeDefined();
  });

  it('handles non-array JSON gracefully', async () => {
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify('not-an-array'));
    await migrateFromLocalStorage();
    expect(localStorage.getItem(MIGRATION_FLAG)).toBe('1');
  });

  it('skips invalid entries in the array', async () => {
    const mixed = [
      { vineId: 'valid-entry', displayMessages: [], chatMessages: [] },
      'not-an-object',
      42,
      null,
      { noVineId: true },
    ];
    localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(mixed));

    await migrateFromLocalStorage();

    expect(localStorage.getItem(MIGRATION_FLAG)).toBe('1');
    const loaded = await loadSession('valid-entry');
    expect(loaded).toBeDefined();
  });
});
