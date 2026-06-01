# Draft: Standalone Binary Distribution (non-npm install channels)

- **Origin:** [internal] — routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass
  (2026-06-01). Distinct from `release-lifecycle` (which is release *aggregation* and explicitly excludes
  publish/distribution mechanics), so it lands as its own WU within the release-readiness cohort.
- **Purpose:** Broaden ARC CLI reach beyond npm/Node by shipping standalone binaries through the install
  channels polyglot dev tools converge on.

---

## Problem / Motivation

The ARC CLI requires Node.js via npm, limiting reach to environments without Node. Not release-blocking, but
worth addressing as adoption grows beyond JS/TS-primary shops.

## Research findings (captured)

Polyglot dev tools that succeed cross-ecosystem (lefthook, mise, just, gh) ship standalone binaries; TypeScript
CLIs can produce these via `bun compile` or `vercel/pkg`. Distribution by reach: GitHub releases + curl install
script → Homebrew → system package managers (apt, winget, scoop). Precedent: Claude Code went npm-only first,
added brew/curl/winget later.

## Scope (iterate into a plan)

- Investigate `bun compile` for single-file executables (vs. `vercel/pkg`).
- Ship via GitHub releases with an install script.
- Consider a `.arc-version` pinning convention.
- Cross-platform build + test matrix (the build pipeline is the bulk of the cost).

## Scope Estimate

Medium–Large (build pipeline + cross-platform testing + install script + docs). Post-1.0; sequence within the
release-readiness cohort once a versioned release model exists to attach binaries to.
