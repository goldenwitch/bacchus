import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Bacchus VINE');
  output.appendLine('Bacchus VINE extension activated.');

  // ── Commands ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('bacchus.showGraph', () => {
      void vscode.window.showInformationMessage(
        'Bacchus: Graph visualization coming soon.',
      );
    }),
  );

  // ── MCP server definition provider ─────────────────────────────────
  const didChange = new vscode.EventEmitter<void>();
  context.subscriptions.push(didChange);

  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider('bacchus-vine.mcp', {
      onDidChangeMcpServerDefinitions: didChange.event,

      provideMcpServerDefinitions: async () => {
        const serverPath = context.asAbsolutePath('dist/server.js');
        output.appendLine(`MCP server path: ${serverPath}`);
        const def = new vscode.McpStdioServerDefinition(
          'bacchus-vine',
          process.execPath,
          [serverPath],
        );
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder) {
          def.cwd = folder.uri;
          output.appendLine(`MCP server cwd: ${folder.uri.fsPath}`);
        }
        return [def];
      },

      resolveMcpServerDefinition: async (server) => {
        output.appendLine('MCP server resolving…');
        return server;
      },
    }),
  );

  context.subscriptions.push(output);
}

export function deactivate(): void {
  // MCP server lifecycle managed by VS Code — nothing to clean up.
}
