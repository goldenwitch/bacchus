#Requires -Version 7.0
<#
.SYNOPSIS
    Idempotent setup script for the Bacchus workspace.
.DESCRIPTION
    Ensures all prerequisites are installed and the workspace is ready for
    development. Safe to re-run at any time — every step checks current state
    before acting.

    Prerequisites installed/verified:
      - Node.js >= 20.x (LTS)
      - Corepack (ships with Node.js, manages Yarn)
      - Yarn 4 (Berry) via Corepack
      - All workspace dependencies via `yarn install`
      - Yarn SDK for VS Code (PnP support)
      - Husky Git hooks

    Use the -Integration switch to configure an Anthropic API key for
    running chat integration tests against the live Claude API.

    Exit codes:
      0 — success
      1 — a prerequisite is missing or a step failed
.PARAMETER Integration
    Prompt for an Anthropic API key and store it in a .env file so that
    integration tests can call the live Claude API.
#>

param(
    [switch]$Integration
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$Message) Write-Host "`n▸ $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Skip { param([string]$Message) Write-Host "  – $Message (already done)" -ForegroundColor DarkGray }
function Write-Fail { param([string]$Message) Write-Host "  ✗ $Message" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# 1. Node.js
# ---------------------------------------------------------------------------
Write-Step 'Checking Node.js'

$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Fail 'Node.js is not installed. Install Node.js >= 20 LTS from https://nodejs.org and re-run this script.'
    exit 1
}

$nodeVersion = (node --version) -replace '^v', ''
$nodeMajor   = [int]($nodeVersion -split '\.')[0]

if ($nodeMajor -lt 20) {
    Write-Fail "Node.js v$nodeVersion found — v20+ required. Update from https://nodejs.org and re-run."
    exit 1
}

Write-Ok "Node.js v$nodeVersion"

# ---------------------------------------------------------------------------
# 2. Corepack
# ---------------------------------------------------------------------------
Write-Step 'Enabling Corepack'

$corepackPath = Get-Command corepack -ErrorAction SilentlyContinue
if (-not $corepackPath) {
    Write-Fail 'Corepack not found. It ships with Node.js >= 16 — ensure your Node.js installation is complete.'
    exit 1
}

# `corepack enable` is idempotent — safe to call every time.
corepack enable
if ($LASTEXITCODE -ne 0) {
    Write-Fail 'corepack enable failed. You may need to run this script as Administrator.'
    exit 1
}

Write-Ok 'Corepack enabled'

# ---------------------------------------------------------------------------
# 3. Yarn (via Corepack)
# ---------------------------------------------------------------------------
Write-Step 'Preparing Yarn via Corepack'

# `corepack prepare` reads the packageManager field in package.json and
# downloads the correct Yarn version if it's not already cached.
# If package.json doesn't exist yet, we just verify yarn is reachable.
if (Test-Path (Join-Path $PSScriptRoot 'package.json')) {
    corepack prepare --activate 2>$null
}

$yarnVersion = (yarn --version 2>$null)
if (-not $yarnVersion) {
    Write-Fail 'Yarn is not reachable after enabling Corepack. Check your PATH and try again.'
    exit 1
}

$yarnMajor = [int]($yarnVersion -split '\.')[0]
if ($yarnMajor -lt 4) {
    Write-Fail "Yarn $yarnVersion found — Yarn 4+ required. Set `"packageManager`" in package.json to `"yarn@4.x.x`" and re-run."
    exit 1
}

Write-Ok "Yarn $yarnVersion"

# ---------------------------------------------------------------------------
# 4. Install dependencies
# ---------------------------------------------------------------------------
Write-Step 'Installing workspace dependencies'

Push-Location $PSScriptRoot
try {
    yarn install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'yarn install failed. Check the output above for details.'
        exit 1
    }
    Write-Ok 'Dependencies installed'
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 5. VS Code SDK (Yarn PnP support)
# ---------------------------------------------------------------------------
Write-Step 'Setting up Yarn SDK for VS Code'

$sdkDir = Join-Path $PSScriptRoot '.yarn' 'sdks'
if (Test-Path $sdkDir) {
    Write-Skip 'Yarn SDK already configured'
} else {
    Push-Location $PSScriptRoot
    try {
        yarn dlx @yarnpkg/sdks vscode
        if ($LASTEXITCODE -ne 0) {
            Write-Fail 'Yarn SDK setup failed.'
            exit 1
        }
        Write-Ok 'Yarn SDK installed'
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 6. Husky Git hooks
# ---------------------------------------------------------------------------
Write-Step 'Setting up Husky Git hooks'

$hooksPath = git config --get core.hooksPath 2>$null
if ($hooksPath -eq '.husky/_') {
    Write-Skip 'Husky hooks already initialized'
} else {
    Push-Location $PSScriptRoot
    try {
        yarn husky
        if ($LASTEXITCODE -ne 0) {
            Write-Fail 'Husky setup failed. Ensure husky is listed in devDependencies.'
            exit 1
        }
        Write-Ok 'Husky hooks installed'
    } finally {
        Pop-Location
    }
}

# ---------------------------------------------------------------------------
# 7. Playwright browsers (for e2e tests)
# ---------------------------------------------------------------------------
Write-Step 'Installing Playwright browsers'

# Only install Chromium — sufficient for e2e and much faster than all browsers.
# This is idempotent: Playwright skips downloads for already-installed browsers.
Push-Location $PSScriptRoot
try {
    yarn playwright install chromium
    if ($LASTEXITCODE -ne 0) {
        Write-Fail 'Playwright browser installation failed.'
        exit 1
    }
    Write-Ok 'Playwright Chromium browser installed'
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 8. Integration test configuration (optional)
# ---------------------------------------------------------------------------
if ($Integration) {
    Write-Step 'Configuring Anthropic API key for integration tests'

    $envFile = Join-Path $PSScriptRoot '.env'
    $existingKey = $null

    if (Test-Path $envFile) {
        $match = Select-String -Path $envFile -Pattern '^ANTHROPIC_API_KEY=' -ErrorAction SilentlyContinue
        if ($match) {
            $existingKey = ($match.Line -split '=', 2)[1]
        }
    }

    if ($existingKey) {
        $masked = $existingKey.Substring(0, [Math]::Min(8, $existingKey.Length)) + '...' 
        Write-Host "  Existing key found: $masked" -ForegroundColor Yellow
        $overwrite = Read-Host '  Overwrite? (y/N)'
        if ($overwrite -ne 'y') {
            Write-Skip 'Keeping existing API key'
        } else {
            $existingKey = $null  # Force re-prompt below
        }
    }

    if (-not $existingKey) {
        $key = Read-Host '  Enter your Anthropic API key (sk-ant-...)'
        if (-not $key) {
            Write-Fail 'No API key provided — skipping integration setup.'
        } else {
            # Write or replace the key in the .env file
            if (Test-Path $envFile) {
                $lines = Get-Content $envFile
                $found = $false
                $newLines = $lines | ForEach-Object {
                    if ($_ -match '^ANTHROPIC_API_KEY=') {
                        $found = $true
                        "ANTHROPIC_API_KEY=$key"
                    } else {
                        $_
                    }
                }
                if (-not $found) {
                    $newLines += "ANTHROPIC_API_KEY=$key"
                }
                $newLines | Set-Content $envFile
            } else {
                "ANTHROPIC_API_KEY=$key" | Set-Content $envFile
            }
            Write-Ok 'API key saved to .env (git-ignored)'
            Write-Host '  Integration tests will now run when you execute: yarn test' -ForegroundColor DarkCyan
        }
    }
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
Write-Host "`n✅ Setup complete. You're ready to develop." -ForegroundColor Green
Write-Host @"

  Quick reference:
    yarn vitest run            Run unit tests
    yarn vitest run --coverage Run tests with coverage
    tsc --noEmit               Type-check (no emit)
    yarn lint                  Lint all packages
    yarn e2e                   Run e2e tests (Playwright)
    yarn e2e:chat              Run chat e2e tests (mocked)
    yarn e2e:chat:live         Run chat e2e tests (live API)
"@

if (-not $Integration) {
    Write-Host @"

  To enable integration tests (requires an Anthropic API key):
    ./setup.ps1 -Integration
"@
}
