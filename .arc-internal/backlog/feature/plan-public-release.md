# Plan: Public Release & Adoption

## Overview

Planning document for ARC Framework's public release, external documentation, and adoption
materials. Covers Phase D of the framework roadmap.

**Status:** Initial planning (expanded from repository strategy)
**Created:** 2025-10-11
**Updated:** 2026-02-20

---

## Repository Structure

### Development Repository (private)

- **Name**: `arc-framework-dev` (rename from current `arc-agentic-dev-framework`)
- **Purpose**: Ongoing framework development, self-hosted ARC methodology
- **Contains**: Full `.arc-internal/` workspace, development history, work context
- **Access**: Private

### Public Repository (public)

- **Name**: TBD (possibly `arc-framework`)
- **Purpose**: Clean, user-facing framework + npm package source
- **Contains**: Framework files, CLI source, documentation, no development artifacts
- **Access**: Public

### Migration Process

Deferred until distribution CLI is functional. The public repo will contain:

- Framework source files (what gets installed)
- CLI source code
- npm package configuration
- User-facing documentation (README, examples)
- No `.arc-internal/` content

## External Documentation Site

### Decision

Conceptual orientation, philosophy, examples, and adoption materials live on an external
documentation site rather than in-repo. The repository stays lean and operational — everything
in `.arc/` serves active development. The repo README links to the docs site for deeper
understanding.

**Tooling:** MkDocs Material + GitHub Pages.

- Markdown-native — content authoring identical to framework docs
- Professional defaults with minimal configuration (single `mkdocs.yml`)
- Built-in search, navigation, dark mode, responsive layout
- GitHub Action deploys on push — near-zero maintenance
- Versioned docs supported (tied to framework releases)
- Free hosting on GitHub Pages

### Content Scope

The docs site covers material that doesn't belong in the operational repo:

- **Conceptual orientation** — "How ARC Works": sessions, task-driven workflow, strategies,
  quality gates, agent collaboration model. The mental model content originally considered for
  an in-repo `getting-started.md`, moved external to keep the repo operational.
- **Philosophy deep-dives** — Why task-driven? Why sessions? Why agent-agnostic? Why
  markdown-only? Depth that would bloat in-repo docs.
- **Fully-formed examples** — What DEVELOPMENT-RULES looks like for a Django project, a React
  app, a data pipeline. Constitutional doc examples that help adopters understand the target,
  not just the template.
- **Tutorials / walkthroughs** — First ARC session walkthrough, creating your first task list,
  setting up quality gates for your stack.
- **Comparison / positioning** — ARC vs just using CLAUDE.md, vs Cursor rules, vs other
  frameworks. Helps with the "is this for me?" decision.

### Relationship to Repo

- **Repo README** — Value proposition, philosophy summary, "is this for me?" + prominent link
  to docs site for deeper content
- **`.arc/README.md`** — Directory overview (operational, stays in-repo)
- **No in-repo orientation doc** — The docs site replaces the originally-considered
  `getting-started.md`. The repo contains only operational docs that agents and developers use
  during active work.
- **Post-install flow** — CLI `init` output references the docs site for orientation. The agent
  can also provide orientation organically during the first session.

### Effort

Setup is trivial — `mkdocs.yml`, directory of `.md` files, one GitHub Action. The real work is
content creation, which needs to happen regardless of platform. Can be built independently of
CLI work.

## README Refresh

The repo root README needs a wholesale rewrite before public release.

**Current state:** Outdated — emojis, old structure references, developer-focused rather than
adoption-focused.

**Target:** Value proposition, philosophy, "is this for me?" framing. Links to docs site for
deeper content, to `.arc/README.md` for directory structure.

**Starting point:** `arc-portfolio` repo has substantial framework description in `projects.ts`
— written from a portfolio angle but provides good content foundation. Needs reframing toward
user-facing focus.

## Philosophy & Positioning Guidance

ARC's single-threaded, human-in-the-loop approach is opinionated but public-facing materials
should not position it as the exclusively correct way to work with AI agents. Delegated and
multi-agent workflows have legitimate uses depending on work type and quality/maintainability
standards.

**Principle for all adoption materials:** "Here's our approach and why" — not "the only
approach." Acknowledge the spectrum of AI collaboration patterns and position ARC's choices
within it.

**Applies to:** Repo README, docs site philosophy content, any comparison/positioning material.

(Origin: 2026-02-19 planning discussion around team adaptation and single-threading model.)

## Community Infrastructure

Pre-release setup for the public repo:

- Issue templates (bug report, feature request, question)
- Contribution guidelines
- Code of conduct
- PR template
- Discussion forums (GitHub Discussions) — optional, evaluate need

## Prerequisites

1. ✅ **Framework maturation** — Battle-tested through multiple projects
2. 🔄 **Structural readiness pass** — In progress
3. ⏳ **Distribution CLI** — Phase C, prerequisite for public release
4. ⏳ **Documentation site setup** — MkDocs Material + GitHub Pages
5. ⏳ **README rewrite** — Can proceed independently
6. ⏳ **Content creation** — Docs site content (orientation, philosophy, examples, tutorials)

---

## Related Documents

- Distribution & CLI plan: `plan-distribution-and-update-system.md`
- Roadmap: `../ROADMAP.md`
