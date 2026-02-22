import { openDB, type IDBPDatabase } from 'idb';
import type { ChatMessage, DisplayMessage } from './chat/types.js';

// ---------------------------------------------------------------------------
// Database schema
// ---------------------------------------------------------------------------

const DB_NAME = 'bacchus-db';
const DB_VERSION = 1;

/** Persisted application state for a single graph. */
export interface PersistedAppState {
  readonly vineId: string;
  readonly vineText: string;
  readonly camera: {
    readonly x: number;
    readonly y: number;
    readonly k: number;
  };
  readonly focusedTaskId: string | null;
  readonly chatOpen: boolean;
  readonly inputDraft: string;
  readonly savedAt: number;
}

/** Persisted chat session for a single graph. */
export interface PersistedSession {
  readonly vineId: string;
  readonly displayMessages: readonly DisplayMessage[];
  readonly chatMessages: readonly ChatMessage[];
  readonly savedAt: number;
}

// ---------------------------------------------------------------------------
// Database initialisation
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db: IDBPDatabase) {
        if (!db.objectStoreNames.contains('appState')) {
          db.createObjectStore('appState', { keyPath: 'vineId' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'vineId' });
        }
      },
    });
  }
  // dbPromise is guaranteed non-null here — assigned in the if-block above
  return dbPromise;
}

// ---------------------------------------------------------------------------
// App state persistence
// ---------------------------------------------------------------------------

export async function saveAppState(state: PersistedAppState): Promise<void> {
  try {
    const db = await getDb();
    await db.put('appState', state);
  } catch {
    // IndexedDB unavailable — silently ignore
  }
}

export async function loadAppState(
  vineId: string,
): Promise<PersistedAppState | undefined> {
  try {
    const db = await getDb();
    return (await db.get('appState', vineId)) as PersistedAppState | undefined;
  } catch {
    return undefined;
  }
}

/**
 * Load the most recently saved app state (any vineId).
 */
export async function loadLatestAppState(): Promise<
  PersistedAppState | undefined
> {
  try {
    const db = await getDb();
    const all = (await db.getAll('appState')) as PersistedAppState[];
    if (all.length === 0) return undefined;
    all.sort(
      (a: PersistedAppState, b: PersistedAppState) => b.savedAt - a.savedAt,
    );
    return all[0];
  } catch {
    return undefined;
  }
}

export async function deleteAppState(vineId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('appState', vineId);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Chat session persistence
// ---------------------------------------------------------------------------

export async function saveSession(
  vineId: string,
  displayMessages: readonly DisplayMessage[],
  chatMessages: readonly ChatMessage[],
): Promise<void> {
  try {
    const db = await getDb();
    const entry: PersistedSession = {
      vineId,
      displayMessages,
      chatMessages,
      savedAt: Date.now(),
    };
    await db.put('sessions', entry);
  } catch {
    // IndexedDB unavailable — silently ignore
  }
}

export async function loadSession(
  vineId: string,
): Promise<PersistedSession | undefined> {
  try {
    const db = await getDb();
    return (await db.get('sessions', vineId)) as PersistedSession | undefined;
  } catch {
    return undefined;
  }
}

export async function deleteSession(vineId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete('sessions', vineId);
  } catch {
    // ignore
  }
}

export async function listSessions(): Promise<PersistedSession[]> {
  try {
    const db = await getDb();
    const all = await db.getAll('sessions');
    return (all as PersistedSession[]).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Migration: move chat sessions from localStorage to IndexedDB
// ---------------------------------------------------------------------------

const OLD_STORAGE_KEY = 'bacchus:chat-sessions';
const MIGRATION_FLAG = 'bacchus:idb-migrated';

export async function migrateFromLocalStorage(): Promise<void> {
  try {
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    const raw = localStorage.getItem(OLD_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(MIGRATION_FLAG, '1');
      return;
    }
    const db = await getDb();
    const tx = db.transaction('sessions', 'readwrite');
    for (const s of parsed) {
      if (
        typeof s === 'object' &&
        s !== null &&
        'vineId' in s &&
        'displayMessages' in s &&
        'chatMessages' in s
      ) {
        await tx.store.put(s);
      }
    }
    await tx.done;
    localStorage.removeItem(OLD_STORAGE_KEY);
    localStorage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Migration failed — will retry next load
  }
}
