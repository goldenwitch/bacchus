# VINE Format Specification

The `.vine` format is versioned. Each version lives in its own document under `docs/VINE/`.

## Versions

| Version                      | Status  |
| ---------------------------- | ------- |
| [v1.0.0](VINE/v1.0.0.md)    | Current |

## Version Detection

Every `.vine` file begins with a magic line: `vine <semver>`. A parser reads only this first line to dispatch to the correct version-specific reader. Files without a valid magic line are rejected.

## Adding a New Version

See the [VINE Versioning Guide](VINE-VERSIONING.md) for the full checklist.
