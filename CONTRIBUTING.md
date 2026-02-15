# Contributing to Bacchus

Thank you for your interest in contributing!

## Prerequisites

- Node.js >= 22.x LTS
- PowerShell (ships with Windows; install PowerShell Core on macOS/Linux)
- Git

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

### Code Quality
```powershell
yarn typecheck         # TypeScript type checking
yarn lint              # ESLint
yarn format            # Prettier formatting
```

Pre-commit hooks automatically run formatting, linting, and type-checking.

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure all checks pass (`yarn typecheck && yarn lint && yarn test`)
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
