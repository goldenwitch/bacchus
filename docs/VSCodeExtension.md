# Bacchus VINE — VS Code Extension

## Overview

The `bacchus-vine` VS Code extension bundles the VINE MCP server for automatic AI tool discovery. Once installed, every VINE MCP tool is immediately available to GitHub Copilot (agent mode) and other AI assistants — no manual configuration required.

---

## Features

### MCP Server Definition Provider

The extension registers an MCP server definition provider (`bacchus-vine.mcp`) so VS Code and AI assistants can discover and invoke all VINE tools automatically. The provider points to the bundled `dist/server.js` — the `@bacchus/mcp` server compiled into the extension package.

### `bacchus.showGraph` Command

Opens graph visualization for VINE files. Currently shows a placeholder info message ("Graph visualization coming soon."). A future release will add a webview-based interactive graph view.

### Activation

The extension uses the `onStartupFinished` activation event — it activates automatically after VS Code finishes starting. No manual activation or workspace trust is needed.

---

## MCP Integration

The extension uses the VS Code Language Model API to wire the VINE MCP server:

1. `vscode.lm.registerMcpServerDefinitionProvider('bacchus-vine.mcp', ...)` registers the server.
2. `provideMcpServerDefinitions` returns a `McpStdioServerDefinition` pointing to `dist/server.js`, launched via the current Node.js process (`process.execPath`).
3. Communication uses **stdio transport** — VS Code spawns a Node.js child process and talks JSON-RPC over stdin/stdout.
4. The provider sets the working directory (`cwd`) to the first workspace folder so relative `.vine` paths resolve correctly.
5. `resolveMcpServerDefinition` passes the definition through unchanged.

All tools from `@bacchus/mcp` are automatically available through this provider:

| Category  | Tools |
| --------- | ----- |
| Read-only | `vine_validate`, `vine_show`, `vine_list`, `vine_get_task`, `vine_get_descendants`, `vine_search` |
| Execution | `vine_next_tasks` |
| Mutations | `vine_add_task`, `vine_remove_task`, `vine_set_status`, `vine_update_task`, `vine_add_dependency`, `vine_remove_dependency` |
| Ref nodes | `vine_add_ref`, `vine_expand_ref`, `vine_update_ref_uri`, `vine_get_refs` |

See [MCP.md](MCP.md) for full tool documentation.

---

## Installation & Activation

| Requirement | Value |
| ----------- | ----- |
| VS Code     | `^1.99.0` |
| Node.js     | 22+ (used as the MCP server runtime) |
| Workspace   | Folder containing `.vine` files |

The extension is not published to the VS Code Marketplace yet. Install from a `.vsix` file:

```powershell
# Build the VSIX package
yarn workspace bacchus-vine package

# Install in VS Code
code --install-extension packages/vscode/bacchus-vine-1.0.0.vsix
```

The extension activates automatically on startup — no manual steps needed.

---

## Build & Development

| Script | Command | Description |
| ------ | ------- | ----------- |
| Build  | `yarn workspace bacchus-vine build` | One-shot production bundle |
| Watch  | `yarn workspace bacchus-vine watch` | Incremental rebuilds during development |
| Package | `yarn workspace bacchus-vine package` | Produces a `.vsix` file via `vsce` |

### Bundle Output

The esbuild configuration ([esbuild.mjs](../packages/vscode/esbuild.mjs)) produces two bundles:

| Output | Entry Point | Description |
| ------ | ----------- | ----------- |
| `dist/extension.js` | `src/extension.ts` | Extension host code |
| `dist/server.js` | `../mcp/src/index.ts` | Bundled MCP server (from `@bacchus/mcp`) |

### esbuild Configuration

- **Format**: ESM
- **Platform**: Node.js (target `node22`)
- **Externals**: `vscode` (provided by the extension host)
- **Plugins**: `@yarnpkg/esbuild-plugin-pnp` for Yarn PnP resolution, plus a custom `ts-ext` plugin that resolves `.js` imports to `.ts` source files
- **Sourcemaps**: enabled

---

## Testing

### Unit Tests

[extension.test.ts](../packages/vscode/__tests__/extension.test.ts) — mocks the `vscode` module and verifies:

- `bacchus.showGraph` command registration
- Output channel creation (`Bacchus VINE`)
- MCP server definition provider registration with correct ID (`bacchus-vine.mcp`)
- `provideMcpServerDefinitions` returns a definition pointing to `dist/server.js`
- CWD is set to the first workspace folder
- `resolveMcpServerDefinition` passes the server through
- Subscriptions include all disposables (command, EventEmitter, MCP provider, output channel)
- `deactivate()` does not throw

### MCP Protocol Tests

[mcp-protocol.test.ts](../packages/vscode/__tests__/mcp-protocol.test.ts) — end-to-end communication with the bundled server over stdio:

- Builds `dist/server.js` if needed, then spawns it via `StdioClientTransport`
- Verifies `tools/list` returns all 17 tools
- Exercises read-only tools (`vine_validate`, `vine_show`, `vine_list`) against temp `.vine` files
- Exercises mutation tools (`vine_set_status`) and verifies the file is modified on disk
- Tests error responses for nonexistent files

### VS Code Integration Tests

[integration/extension.test.mjs](../packages/vscode/__tests__/integration/extension.test.mjs) — runs inside the VS Code Electron host via `@vscode/test-electron`:

- Confirms the extension (`goldenwitch.bacchus-vine`) is found and activates
- Verifies `bacchus.showGraph` command is registered
- Checks `contributes.mcpServerDefinitionProviders` in the manifest declares `bacchus-vine.mcp`

Run integration tests:

```powershell
yarn workspace bacchus-vine test:integration
```

### Test Workspace

The [test-workspace/](../packages/vscode/test-workspace/) directory contains sample `.vine` files used by tests: `construction.vine`, `final.vine`, `interior.vine`, `planning.vine`, `site-prep.vine`, `tiny-home.vine`, `welcome.vine`, and a `GUIDE.md`.

---

## Configuration

No user-facing configuration settings are exposed. The extension works out of the box with the following requirements:

| Requirement | Details |
| ----------- | ------- |
| VS Code | `^1.99.0` with MCP server definition provider API support |
| Node.js | 22+ (ships with recent VS Code) |
| Workspace | A folder open in VS Code; `.vine` files are resolved relative to the first workspace folder |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│  VS Code                                         │
│  ┌────────────────────────────────────────────┐  │
│  │  Extension Host                            │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  bacchus-vine extension              │  │  │
│  │  │  (dist/extension.js)                 │  │  │
│  │  │                                      │  │  │
│  │  │  ┌─────────────────────────────────┐ │  │  │
│  │  │  │ MCP Server Definition Provider  │ │  │  │
│  │  │  │ id: bacchus-vine.mcp            │ │  │  │
│  │  │  └───────────┬─────────────────────┘ │  │  │
│  │  └──────────────┼──────────────────────-┘  │  │
│  └─────────────────┼─────────────────────────-┘  │
│                    │ stdio (JSON-RPC)             │
│                    ▼                              │
│  ┌─────────────────────────────────────────────┐ │
│  │  Node.js child process                      │ │
│  │  dist/server.js (@bacchus/mcp)              │ │
│  │                                             │ │
│  │  MCP SDK ─► Tool Handlers ─► @bacchus/core  │ │
│  │                                    │        │ │
│  │                                io.ts        │ │
│  │                                    │        │ │
│  │                              .vine files    │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```
