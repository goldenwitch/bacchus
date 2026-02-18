const STORAGE_KEY = 'bacchus:anthropic-key';

/**
 * Read the active Anthropic API key.
 *
 * Resolution order:
 *  1. Build-time env var injected by Vite (`VITE_ANTHROPIC_API_KEY`,
 *     sourced from the root `.env` file written by `setup.ps1 -Key`).
 *     When present this is the authoritative source — it is also synced
 *     to localStorage so a stale UI-entered key can never shadow it.
 *  2. localStorage (set via the Chat Panel UI)
 *  3. `null` — the Chat Panel will show the key-entry prompt
 */
export function getApiKey(): string | null {
  // Build-time env var is authoritative when present.
  const envKey = (import.meta.env as Record<string, string | undefined>)
    .VITE_ANTHROPIC_API_KEY;
  if (envKey) {
    // Sync to localStorage so the UI always sees the latest key and any
    // previously-stored key is replaced.
    try {
      localStorage.setItem(STORAGE_KEY, envKey);
    } catch {
      // localStorage unavailable — the key still works in-memory
    }
    return envKey;
  }

  // No env key — fall back to a key entered via the Chat Panel UI.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage unavailable (e.g. SSR or restrictive iframe)
  }

  return null;
}

/**
 * Store an Anthropic API key (typically entered via the Chat Panel UI).
 */
export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

/**
 * Remove the stored API key from localStorage.
 */
export function clearApiKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable
  }
}
