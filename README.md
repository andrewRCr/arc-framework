# ARC Framework — Development Repository

[![CI](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml/badge.svg)](https://github.com/andrewRCr/arc-agentic-dev-framework/actions/workflows/ci.yml)

This is the internal development repository for the ARC Framework — a structured methodology
for spec-driven development with AI agents and human developers.

The public release will be a separate repository containing `.arc/` and a fresh README. This
repo is the authoring environment where the framework methodology is developed, tested
(self-hosted), and iterated on.

## Repository Structure

- **`.arc/`** — The deployable template system (what ships to adopters)
- **`.arc-internal/`** — Framework development workspace (internal use only)
- **`README-ASPIRATIONAL.md`** — Draft public-facing README (updated periodically)

## Quick Start (Development)

```bash
npm install          # Install markdownlint-cli2 (pinned local dependency)
npm run -s lint:md   # Run quality gates (zero-tolerance markdown linting)
```

## License

Licensed under the Apache License 2.0. See `LICENSE` for details.
