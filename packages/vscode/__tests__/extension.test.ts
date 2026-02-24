import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  appendLine: vi.fn(),
  dispose: vi.fn(),
  createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
  showInformationMessage: vi.fn(),
  registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
  registerMcpServerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
  McpStdioServerDefinition: vi.fn(),
  eventFn: vi.fn(),
}));

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: mocks.createOutputChannel,
    showInformationMessage: mocks.showInformationMessage,
  },
  commands: {
    registerCommand: mocks.registerCommand,
  },
  lm: {
    registerMcpServerDefinitionProvider:
      mocks.registerMcpServerDefinitionProvider,
  },
  workspace: {
    workspaceFolders: [
      {
        uri: { fsPath: '/mock/workspace', scheme: 'file' },
        name: 'mock',
        index: 0,
      },
    ],
  },
  EventEmitter: vi.fn(() => ({
    event: mocks.eventFn,
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  McpStdioServerDefinition: mocks.McpStdioServerDefinition,
}));

import { activate, deactivate } from '../src/extension.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callActivate() {
  const subscriptions: { dispose(): void }[] = [];
  const context = {
    subscriptions,
    asAbsolutePath: (p: string) => `/mock/ext/${p}`,
  } as unknown as import('vscode').ExtensionContext;
  activate(context);
  return { subscriptions, context };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('activate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createOutputChannel.mockReturnValue({
      appendLine: mocks.appendLine,
      dispose: mocks.dispose,
    });
  });

  it('registers the showGraph command', () => {
    callActivate();
    expect(mocks.registerCommand).toHaveBeenCalledWith(
      'bacchus.showGraph',
      expect.any(Function),
    );
  });

  it('creates an output channel', () => {
    callActivate();
    expect(mocks.createOutputChannel).toHaveBeenCalledWith('Bacchus VINE');
  });

  it('pushes disposables to subscriptions', () => {
    const { subscriptions } = callActivate();
    // command + EventEmitter + MCP provider + output channel
    expect(subscriptions.length).toBeGreaterThanOrEqual(4);
  });

  it('logs activation message', () => {
    callActivate();
    expect(mocks.appendLine).toHaveBeenCalledWith(
      'Bacchus VINE extension activated.',
    );
  });

  // ── MCP provider registration ──────────────────────────────────────

  it('registers the MCP server definition provider', () => {
    callActivate();
    expect(mocks.registerMcpServerDefinitionProvider).toHaveBeenCalledWith(
      'bacchus-vine.mcp',
      expect.objectContaining({
        onDidChangeMcpServerDefinitions: mocks.eventFn,
        provideMcpServerDefinitions: expect.any(Function),
        resolveMcpServerDefinition: expect.any(Function),
      }),
    );
  });

  it('provideMcpServerDefinitions returns a server pointing to dist/server.js', async () => {
    callActivate();
    const provider = mocks.registerMcpServerDefinitionProvider.mock
      .calls[0][1] as {
      provideMcpServerDefinitions: () => Promise<unknown[]>;
    };
    const defs = await provider.provideMcpServerDefinitions();
    expect(defs).toHaveLength(1);
    expect(mocks.McpStdioServerDefinition).toHaveBeenCalledWith(
      'bacchus-vine',
      process.execPath,
      ['/mock/ext/dist/server.js'],
    );
  });

  it('sets cwd on the MCP server definition from the first workspace folder', async () => {
    callActivate();
    const provider = mocks.registerMcpServerDefinitionProvider.mock
      .calls[0][1] as {
      provideMcpServerDefinitions: () => Promise<unknown[]>;
    };
    const defs = await provider.provideMcpServerDefinitions();
    const def = defs[0] as Record<string, unknown>;
    expect(def).toHaveProperty('cwd');
    expect(def.cwd).toEqual({ fsPath: '/mock/workspace', scheme: 'file' });
  });

  it('resolveMcpServerDefinition passes the server through', async () => {
    callActivate();
    const provider = mocks.registerMcpServerDefinitionProvider.mock
      .calls[0][1] as {
      resolveMcpServerDefinition: (s: unknown) => Promise<unknown>;
    };
    const sentinel = { label: 'test' };
    const resolved = await provider.resolveMcpServerDefinition(sentinel);
    expect(resolved).toBe(sentinel);
  });
});

describe('deactivate', () => {
  it('does not throw', () => {
    expect(() => deactivate()).not.toThrow();
  });
});
