import type { ChatMessage, DisplayMessage } from './types.js';
import {
  saveSession as idbSaveSession,
  loadSession as idbLoadSession,
  listSessions as idbListSessions,
  deleteSession as idbDeleteSession,
  type PersistedSession,
} from '../persistence.js';

// ---------------------------------------------------------------------------
// Re-export the PersistedSession type as SavedSession for backwards compat
// ---------------------------------------------------------------------------

export type SavedSession = PersistedSession;

// ---------------------------------------------------------------------------
// Public API — now async, backed by IndexedDB
// ---------------------------------------------------------------------------

export async function saveSession(
  vineId: string,
  displayMessages: readonly DisplayMessage[],
  chatMessages: readonly ChatMessage[],
): Promise<void> {
  await idbSaveSession(vineId, displayMessages, chatMessages);
}

export async function loadSession(vineId: string): Promise<SavedSession | null> {
  const result = await idbLoadSession(vineId);
  return result ?? null;
}

export async function listSessions(): Promise<readonly SavedSession[]> {
  return idbListSessions();
}

export async function deleteSession(vineId: string): Promise<void> {
  await idbDeleteSession(vineId);
}
