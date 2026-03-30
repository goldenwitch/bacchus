import type { ChatService } from './types.js';

/**
 * Supported LLM provider identifiers.
 */
export type ProviderType = 'anthropic' | 'openai' | 'gemini';

/**
 * Static configuration for each provider — drives the UI and key management.
 */
export interface ProviderConfig {
  readonly label: string;
  readonly placeholder: string;
  readonly storageKey: string;
  readonly envVar: string;
  readonly defaultModel: string;
}

/**
 * Configuration map for all supported providers.
 */
export const PROVIDERS: Readonly<Record<ProviderType, ProviderConfig>> = {
  anthropic: {
    label: 'Anthropic',
    placeholder: 'sk-ant-...',
    storageKey: 'bacchus:anthropic-key',
    envVar: 'VITE_ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-4-6',
  },
  openai: {
    label: 'OpenAI',
    placeholder: 'sk-...',
    storageKey: 'bacchus:openai-key',
    envVar: 'VITE_OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
  },
  gemini: {
    label: 'Gemini',
    placeholder: 'AI...',
    storageKey: 'bacchus:gemini-key',
    envVar: 'VITE_GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
  },
} as const;

/** All provider keys in display order. */
export const PROVIDER_IDS: readonly ProviderType[] = [
  'anthropic',
  'openai',
  'gemini',
] as const;

const ACTIVE_PROVIDER_KEY = 'bacchus:active-provider';

/**
 * Read the user's selected provider from localStorage.
 * Falls back to `'anthropic'` when nothing is stored.
 */
export function getActiveProvider(): ProviderType {
  try {
    const stored = localStorage.getItem(ACTIVE_PROVIDER_KEY);
    if (stored && stored in PROVIDERS) return stored as ProviderType;
  } catch {
    // localStorage unavailable
  }
  return 'anthropic';
}

/**
 * Persist the user's selected provider to localStorage.
 */
export function setActiveProvider(provider: ProviderType): void {
  try {
    localStorage.setItem(ACTIVE_PROVIDER_KEY, provider);
  } catch {
    // localStorage unavailable
  }
}

/**
 * Create a {@link ChatService} instance for the given provider.
 */
export async function createChatService(
  provider: ProviderType,
  apiKey: string,
): Promise<ChatService> {
  switch (provider) {
    case 'anthropic': {
      const { AnthropicChatService } = await import('./anthropic.js');
      return new AnthropicChatService({ apiKey });
    }
    case 'openai': {
      const { OpenAIChatService } = await import('./openai.js');
      return new OpenAIChatService({ apiKey });
    }
    case 'gemini': {
      const { GeminiChatService } = await import('./gemini.js');
      return new GeminiChatService({ apiKey });
    }
  }
}
