# Contributing to Bacchus

Thank you for your interest in contributing!

## Prerequisites

- Node.js >= 20.x LTS
- PowerShell (ships with Windows; install PowerShell Core on macOS/Linux)
- Git

> **Note:** This project uses **Yarn Berry (v4) with Plug'n'Play** (PnP).
> There is no `node_modules` directory — dependencies are resolved from
> `.yarn/cache` zip archives. The setup script installs the Yarn SDK for
> VS Code so that editor features (IntelliSense, go-to-definition) work
> correctly with PnP.

## Getting Started

1. Fork and clone the repository
2. Run the setup script:
   ```powershell
   ./setup.ps1
   ```
3. Start the development server:
   ```powershell
   yarn workspace @bacchus/ui dev
   ```

## Development Workflow

### Running Tests

```powershell
yarn test              # Run all tests
yarn test:coverage     # Run with coverage report
```

### Integration Tests (Vitest)

The chat feature includes integration tests that call the live Anthropic (Claude)
API. These are **skipped by default** when no API key is present.

To enable them locally:

```powershell
./setup.ps1 -Integration
```

This prompts for your Anthropic API key and stores it in a `.env` file
(git-ignored). Once configured, integration tests run automatically alongside
unit tests when you execute `yarn test`.

In CI, integration tests run **only on push to `main`** using the
`ANTHROPIC_API_KEY` repository secret (not on pull requests, to conserve API
credits).

### E2E Tests (Playwright)

Browser e2e tests live in `packages/ui/e2e/` and use Playwright. There are two
categories:

| Category        | Spec file                                                           | API key needed?                                     | Runs in CI          |
| --------------- | ------------------------------------------------------------------- | --------------------------------------------------- | ------------------- |
| **Mocked chat** | `chat-mocked.spec.ts`                                               | No (SSE responses are intercepted via `page.route`) | Always              |
| **Live chat**   | `chat-live.spec.ts`                                                 | Yes (`ANTHROPIC_API_KEY`)                           | Push to `main` only |
| **Other e2e**   | `graph-render`, `interactions`, `file-input`, `animations`, `sound` | No                                                  | Always              |

Run e2e tests:

```powershell
# All e2e tests (excluding live-agent)
yarn workspace @bacchus/ui e2e

# Chat mocked tests only
yarn workspace @bacchus/ui e2e:chat

# Chat live-agent tests (requires ANTHROPIC_API_KEY)
$env:ANTHROPIC_API_KEY = 'sk-ant-...'
yarn workspace @bacchus/ui e2e:chat:live
```

The mocked tests use SSE response helpers in `e2e/helpers/sse-mock.ts` that
build well-formed Anthropic SSE streams and route them through Playwright's
`page.route()` — no real API calls are made. The live tests call the real
Anthropic API from the browser and use generous timeouts (60–180 s).

**Where does the secret come from?**

- **Locally**: Store in a `.env` file via `./setup.ps1 -Integration`, or set
  the `ANTHROPIC_API_KEY` environment variable in your shell.
- **CI**: Set as a GitHub Actions **repository secret** named
  `ANTHROPIC_API_KEY`. The live-agent tests and Vitest integration tests both
  read this same variable. CI runs them only on push to `main` to conserve
  API credits.

### Code Quality

```powershell
yarn typecheck         # TypeScript type checking
yarn lint              # ESLint (errors will block commits)
yarn format:check      # Verify Prettier formatting without writing
yarn format            # Auto-fix Prettier formatting
```

#### Pre-commit hook

A **Husky** pre-commit hook runs `lint-staged` automatically on every commit.
It applies Prettier formatting and ESLint auto-fix to staged files. If any
lint error cannot be auto-fixed the commit will be rejected.

To reproduce exactly what the hook runs:

```powershell
yarn lint-staged       # Run the same checks the pre-commit hook runs
```

If you want to validate **all** files (not just staged ones) before committing,
run the full suite:

```powershell
yarn typecheck && yarn lint && yarn format:check && yarn test
```

> **Tip:** Most lint errors can be auto-fixed. Run `yarn lint --fix` to let
> ESLint resolve what it can, then address any remaining issues manually.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure all checks pass (`yarn typecheck && yarn lint && yarn format:check && yarn test`)
4. Open a PR against `main`
5. Wait for CI to pass and address any review feedback

## Code Style

- **TypeScript**: Strict mode, no `any` types
- **Formatting**: Prettier (auto-applied via pre-commit hooks)
- **Linting**: ESLint with @typescript-eslint strict preset
- **Testing**: Vitest with 90%+ coverage target

## Project Structure

- `packages/core/` - VINE parser, validator, and query API
- `packages/ui/` - Svelte-based visualization app
- `docs/` - Design specifications
- `examples/` - Sample .vine files

## Questions?

Open an issue for bugs, feature requests, or questions.
