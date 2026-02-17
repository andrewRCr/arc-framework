# Public Release Repository Strategy

## Overview

Planning document for the repository structure supporting ARC Framework's public release.

**Status:** Evolving — delivery mechanism has shifted from "copy directory" to package manager install.
See `feature/plan-distribution-and-update-system.md` for the distribution system design.

**Created:** 2025-10-11
**Updated:** 2026-02-17

---

## Repository Structure (Still Valid)

### Development Repository (private)

- **Name**: `arc-framework-dev` (rename from current `arc-agentic-dev-framework`)
- **Purpose**: Ongoing framework development, self-hosted ARC methodology
- **Contains**: Full `.arc-internal/` workspace, development history, work context
- **Access**: Private

### Public Repository (public)

- **Name**: TBD (possibly `arc-framework` or keep `arc-agentic-dev-framework`)
- **Purpose**: Clean, user-facing framework + npm package source
- **Contains**: Framework files, CLI source, documentation, no development artifacts
- **Access**: Public

## What Has Changed

The original plan assumed users would "just copy `.arc/` directory and start using." This has
evolved significantly:

- **Distribution**: Package manager install (`npx arc-framework init`) instead of manual copy
- **Updates**: Three-way merge system instead of manual sync
- **Customization**: Interactive init with conditional content instead of manual template editing
- **Agent tooling**: Selective install of `.claude/`, `.codex/`, `.gemini/` directories

## What Remains Valid

- Dual-repo concept (dev + public) — still the right approach
- Clean public presentation without development artifacts
- GitHub as primary platform

## Prerequisites (Updated)

1. ✅ **Terminology Refactoring** — Complete
2. ✅ **Template System Consolidation** — Complete (via CineXplorer sync)
3. ✅ **Framework Defaults Integration** — Complete (battle-tested through multiple projects)
4. 🔄 **Structural Optimization** — In planning (distribution readiness)
5. ⏳ **Distribution CLI** — Not started
6. ⏳ **Documentation Polish** — Not started

## Migration Process

Deferred until distribution CLI is functional. The public repo will contain:

- Framework source files (what gets installed)
- CLI source code
- npm package configuration
- User-facing documentation (README, getting started, examples)
- No `.arc-internal/` content

---

## Related Documents

- Distribution system: `../feature/plan-distribution-and-update-system.md`
- Roadmap: `../ROADMAP.md`
