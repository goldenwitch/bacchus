import { PROVIDERS, type ProviderType } from './providers.js';

/**
 * Read the API key for a given provider.
 *
 * Resolution order:
 *  1. Build-time env var injected by Vite (e.g. `VITE_ANTHROPIC_API_KEY`,
 *     sourced from the root `.env` file written by `setup.ps1 -Key`).
 *     When present this is the authoritative source — it is also synced
 *     to localStorage so a stale UI-entered key can never shadow it.
 *  2. localStorage (set via the Chat Panel UI)
 *  3. `null` — the Chat Panel will show the key-entry prompt
 */
export function getApiKey(provider: ProviderType = 'anthropic'): string | null {
  const config = PROVIDERS[provider];

  // Build-time env var is authoritative when present.
  const envKey = (import.meta.env as Record<string, string | undefined>)[
    config.envVar
  ];
  if (envKey) {
    // Sync to localStorage so the UI always sees the latest key and any
    // previously-stored key is replaced.
    try {
      localStorage.setItem(config.storageKey, envKey);
    } catch {
      // localStorage unavailable — the key still works in-memory
    }
    return envKey;
  }

  // No env key — fall back to a key entered via the Chat Panel UI.
  try {
    const stored = localStorage.getItem(config.storageKey);
    if (stored) return stored;
  } catch {
    // localStorage unavailable (e.g. SSR or restrictive iframe)
  }

  return null;
}

/**
 * Store an API key for a provider (typically entered via the Chat Panel UI).
 */
export function setApiKey(
  key: string,
  provider: ProviderType = 'anthropic',
): void {
  const config = PROVIDERS[provider];
  localStorage.setItem(config.storageKey, key);
}

/**
 * Remove the stored API key for a provider from localStorage.
 */
export function clearApiKey(provider: ProviderType = 'anthropic'): void {
  const config = PROVIDERS[provider];
  try {
    localStorage.removeItem(config.storageKey);
  } catch {
    // localStorage unavailable
  }
}
