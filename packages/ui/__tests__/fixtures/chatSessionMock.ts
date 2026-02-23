import { vi } from 'vitest';

/**
 * Creates a mock ChatSession stub for component tests.
 * Mirrors the public interface of `ChatSession` from `../../src/lib/chat/session.ts`.
 */
export function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    displayMessages: [] as unknown[],
    isLoading: false,
    apiKey: null as string | null,
    inputDraft: '',
    onStateChange: null as (() => void) | null,
    onGraphUpdate: null as ((g: unknown) => void) | null,
    vineId: null as string | null,
    isReady: false,
    initOrchestrator: vi.fn(),
    setGraph: vi.fn(),
    saveApiKey: vi.fn(),
    processMessage: vi.fn().mockResolvedValue(undefined),
    getChatMessages: vi.fn().mockReturnValue([]),
    setChatMessages: vi.fn(),
    clear: vi.fn(),
    ...overrides,
  };
}
