const STORAGE_KEY = 'bacchus:anthropic-key';

/**
 * Read the stored Anthropic API key.
 */
export function getApiKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
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
