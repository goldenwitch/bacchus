const STORAGE_KEY = 'bacchus:anthropic-key';

/**
 * Read the stored Anthropic API key.
 *
 * Resolution order:
 *  1. localStorage (set via the Chat Panel UI)
 *  2. Build-time env var injected by Vite (`VITE_ANTHROPIC_API_KEY`,
 *     sourced from the root `.env` file written by `setup.ps1 -Integration`)
 *  3. `null` — the Chat Panel will show the key-entry prompt
 */
export function getApiKey(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    // localStorage unavailable (e.g. SSR or restrictive iframe)
  }

  // Fall back to the build-time env var supplied via Vite's `define` config.
  const envKey = (import.meta.env as Record<string, string | undefined>)
    .VITE_ANTHROPIC_API_KEY;
  if (envKey) return envKey;

  return null;
}

/**
 * Store an Anthropic API key.
 */
export function setApiKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

/**
 * Remove the stored API key.
 */
export function clearApiKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
