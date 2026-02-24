import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run() {
  const ext = vscode.extensions.getExtension('goldenwitch.bacchus-vine');
  assert.ok(ext, 'Extension should be found');

  if (!ext.isActive) {
    await ext.activate();
  }
  assert.ok(ext.isActive, 'Extension should be active');

  // Verify command registration
  const commands = await vscode.commands.getCommands(true);
  assert.ok(
    commands.includes('bacchus.showGraph'),
    'showGraph command should be registered',
  );

  // Verify programmatic MCP server definition provider in manifest
  const providers =
    ext.packageJSON?.contributes?.mcpServerDefinitionProviders;
  assert.ok(
    providers,
    'contributes.mcpServerDefinitionProviders should exist',
  );
  assert.ok(
    providers.some((p) => p.id === 'bacchus-vine.mcp'),
    'bacchus-vine.mcp provider should be declared',
  );
}
