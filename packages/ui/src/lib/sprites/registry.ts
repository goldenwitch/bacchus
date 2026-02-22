import type { Task } from '@bacchus/core';
import { getSpriteUri } from '@bacchus/core';

// Import the default sprite SVG as raw text (Vite raw import)
import defaultSpriteSvg from './bubble.svg?raw';

/**
 * Registry for SVG sprite symbols.
 *
 * Manages the default built-in sprite and any custom sprites loaded from URIs.
 * Each sprite is stored as raw SVG text containing a <symbol> element.
 */

/** Cache of loaded sprite SVG text, keyed by URI */
const spriteCache = new Map<string, string>();

/** Set of URIs currently being loaded */
const loadingSet = new Set<string>();

/** Callbacks waiting for a sprite to load */
const loadCallbacks = new Map<string, Array<() => void>>();

/**
 * Initialize the registry with the built-in default sprite.
 * Call once at app startup.
 */
export function initSpriteRegistry(): void {
  spriteCache.set('default', defaultSpriteSvg);
}

/**
 * Get the sprite symbol ID to use for a given task.
 *
 * If the task has a @sprite annotation, returns that URI as the key.
 * Otherwise returns 'default'.
 */
export function getSpriteKey(task: Task): string {
  return getSpriteUri(task) ?? 'default';
}

/**
 * Check if a sprite is loaded and available.
 */
export function isSpriteLoaded(key: string): boolean {
  return spriteCache.has(key);
}

/**
 * Get the raw SVG text for a loaded sprite.
 * Returns undefined if not loaded yet.
 */
export function getSpriteSvg(key: string): string | undefined {
  return spriteCache.get(key);
}

/**
 * Get all currently loaded sprite entries as [key, svgText] pairs.
 * Used by GraphView to inject <symbol> defs into the SVG.
 */
export function getAllSprites(): ReadonlyMap<string, string> {
  return spriteCache;
}

/**
 * Load a custom sprite from a URI.
 *
 * Fetches the SVG file, validates it contains a <symbol> element,
 * and caches it. Returns a promise that resolves when loaded.
 *
 * If the sprite is already loaded or currently loading, returns
 * immediately or waits for the existing load.
 */
export async function loadSprite(uri: string): Promise<void> {
  if (spriteCache.has(uri)) return;

  if (loadingSet.has(uri)) {
    // Already loading — wait for it
    return new Promise<void>((resolve) => {
      const callbacks = loadCallbacks.get(uri) ?? [];
      callbacks.push(resolve);
      loadCallbacks.set(uri, callbacks);
    });
  }

  loadingSet.add(uri);

  try {
    const response = await fetch(uri);
    if (!response.ok) {
      console.warn(
        `Failed to load sprite from ${uri}: ${String(response.status)}`,
      );
      return;
    }

    const svgText = await response.text();

    // Basic validation: must contain a <symbol element
    if (!svgText.includes('<symbol')) {
      console.warn(
        `Sprite at ${uri} does not contain a <symbol> element, wrapping it.`,
      );
      // Wrap the SVG content in a symbol with a generated ID
      const symbolId = `sprite-custom-${uri.replace(/[^a-zA-Z0-9]/g, '-')}`;
      const wrapped = `<svg xmlns="http://www.w3.org/2000/svg"><symbol id="${symbolId}" viewBox="0 0 100 100">${svgText}</symbol></svg>`;
      spriteCache.set(uri, wrapped);
    } else {
      spriteCache.set(uri, svgText);
    }
  } catch (err) {
    console.warn(`Error loading sprite from ${uri}:`, err);
  } finally {
    loadingSet.delete(uri);
    // Notify waiters
    const callbacks = loadCallbacks.get(uri) ?? [];
    for (const cb of callbacks) cb();
    loadCallbacks.delete(uri);
  }
}

/**
 * Extract all <symbol> elements from loaded sprites as raw SVG strings.
 *
 * This is used by GraphView to inject symbol defs into the main SVG.
 * Returns an array of SVG <symbol> element strings.
 */
export function extractSymbolDefs(): string[] {
  const symbols: string[] = [];

  for (const [, svgText] of spriteCache) {
    // Extract <symbol ...>...</symbol> elements
    const symbolRegex = /<symbol[^>]*>[\s\S]*?<\/symbol>/gi;
    let match;
    while ((match = symbolRegex.exec(svgText)) !== null) {
      symbols.push(match[0]);
    }
  }

  return symbols;
}
