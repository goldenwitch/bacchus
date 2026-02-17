import type { ChatMessage, DisplayMessage } from './types.js';

// ---------------------------------------------------------------------------
// Saved session shape
// ---------------------------------------------------------------------------

/** Serialisable snapshot of a single chat session. */
export interface SavedSession {
  readonly vineId: string;
  readonly displayMessages: readonly DisplayMessage[];
  readonly chatMessages: readonly ChatMessage[];
  readonly savedAt: number; // epoch ms
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'bacchus:chat-sessions';
const MAX_SESSIONS = 5;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a chat session for the given vineId.
 *
 * Upserts the session in the circular buffer (max {@link MAX_SESSIONS}).
 * Oldest sessions are evicted when the limit is exceeded.
 */
export function saveSession(
  vineId: string,
  displayMessages: readonly DisplayMessage[],
  chatMessages: readonly ChatMessage[],
): void {
  const sessions = loadAll();
  const idx = sessions.findIndex((s) => s.vineId === vineId);
  const entry: SavedSession = {
    vineId,
    displayMessages,
    chatMessages,
    savedAt: Date.now(),
  };

  if (idx >= 0) {
    sessions[idx] = entry;
  } else {
    sessions.push(entry);
  }

  // Evict oldest beyond the limit
  sessions.sort((a, b) => b.savedAt - a.savedAt);
  const trimmed = sessions.slice(0, MAX_SESSIONS);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/**
 * Load a previously saved session for the given vineId, or `null` if none.
 */
export function loadSession(vineId: string): SavedSession | null {
  const sessions = loadAll();
  return sessions.find((s) => s.vineId === vineId) ?? null;
}

/**
 * List all saved sessions (most recent first).
 */
export function listSessions(): readonly SavedSession[] {
  return loadAll().sort((a, b) => b.savedAt - a.savedAt);
}

/**
 * Delete the session for a specific vineId.
 */
export function deleteSession(vineId: string): void {
  const sessions = loadAll().filter((s) => s.vineId !== vineId);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadAll(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Basic shape validation
    return parsed.filter(
      (s: unknown): s is SavedSession =>
        typeof s === 'object' &&
        s !== null &&
        'vineId' in s &&
        'displayMessages' in s &&
        'chatMessages' in s &&
        'savedAt' in s,
    );
  } catch {
    return [];
  }
}
