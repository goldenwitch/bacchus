# VINE Format Specification

The `.vine` format is versioned. Each version lives in its own document under `docs/VINE/`.

## Versions

| Version                  | Status  | Headline Features                                     |
| ------------------------ | ------- | ----------------------------------------------------- |
| [v1.1.0](VINE/v1.1.0.md) | Current | Reference nodes, prefix metadata, slash-separated IDs |
| [v1.0.0](VINE/v1.0.0.md) |         |                                                       |

## Version Detection

Every `.vine` file begins with a magic line: `vine <semver>`. A parser reads only this first line to dispatch to the correct version-specific reader. Files without a valid magic line are rejected.

## Adding a New Version

See the [VINE Versioning Guide](VINE-VERSIONING.md) for the full checklist.
