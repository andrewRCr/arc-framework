# Technical Backlog

**Purpose:** Organized collection of technical work ideas and plans — infrastructure, tooling,
modernization, and quality improvements.

**Processing:** When ready to work on an item, create a PRD/plan in `.arc/active/technical/` and
begin the standard workflow.

---

## High Priority

### CI/TTY Auto-Detection for Non-Interactive Mode

- **CI/TTY auto-detection**
    - Problem: `arc init` requires `--yes` flag for non-interactive use; standard practice is to
      auto-detect CI environments (`CI=true`) and non-TTY stdin
    - Approach: Check `process.env.CI === 'true'` or `!process.stdin.isTTY` at command entry; imply
      `--yes` behavior when detected
    - Impact: Better CI/CD integration, standard CLI behavior
    - Effort estimate: S

---

## Medium Priority

### CI/CD Improvements

- **Enhanced link validation**
    - Problem: Current CI doesn't catch all broken internal links
    - Approach: Add sophisticated link checking to GitHub Actions

- **Automated template instantiation testing**
    - Problem: No CI verification that templates work when instantiated
    - Approach: CI that creates and validates instantiated templates
    - Notes: May evolve into CLI integration tests during WU3

### Standalone Binary Distribution (Non-npm Install Channels)

- **Standalone binary for non-Node environments**
    - Problem: ARC CLI requires Node.js via npm, which limits reach to environments without Node
      installed. Not beta-blocking (npm was good enough for Claude Code's first years across all
      project types), but worth addressing as adoption grows beyond JS/TS-primary shops.
    - Research findings: Polyglot dev tools (lefthook, mise, just, gh) that succeed cross-ecosystem
      ship standalone binaries. TypeScript CLIs can produce these via `bun compile` or `vercel/pkg`.
      Distribution channels in order of reach: GitHub releases + curl install script, then Homebrew
      formula, then system package managers (apt, winget, scoop).
    - Approach: Investigate `bun compile` to produce single-file executables from the TypeScript CLI.
      Ship via GitHub releases with an install script. Consider a `.arc-version` file convention
      (like `.tool-versions` for mise/asdf) for team version pinning.
    - Precedent: Claude Code followed this exact trajectory — npm-only initially, added brew/curl/
      winget/irm later as adoption broadened.
    - Effort estimate: M–L (build pipeline, cross-platform testing, install script, docs)

### Beta Audit Deferral (WU5 Phase 5)

Deferred from the beta readiness audit (`analysis-beta-readiness-audit.md`) Phase 6
remediation — needs a design pass before implementation.

- **[MW-M06] No changelog / what's-new mechanism** — `arc update` shows counts ("5 updated,
    1 conflict") but no semantic explanation of what changed. Needs design: what format, where
    does changelog content live, how is it generated (commit log? curated notes?).
    - Trigger: every `arc update`
    - Impact: adopter doesn't know what changed or why

---

## Lower Priority / Ideas

### CLI Test Coverage Gaps (Post-WU3)

Lower-priority test gaps identified during WU3 integration code review. None are blocking;
all are hardening for edge cases unlikely to surface in normal use.

- **Template rendering edge cases** (unit)
    - Unbalanced `arc:if`/`arc:endif` directives (stack underflow recovery)
    - Deeply nested conditionals
    - Tokens containing regex metacharacters
- **Filesystem edge cases** (unit/integration)
    - Symlinks in `.arc/` directory (circular symlinks, external targets)
    - Race conditions between `readdir()` and `readFile()` in status/diff
    - Very large `.arc/` directories (1000+ files performance)
- **Network error simulation** (unit)
    - `checkLatestVersion` with timeout, invalid JSON, partial response
- **Concurrent operations** (integration)
    - Parallel init + update, multiple developers syncing simultaneously
- **CLI entry point wiring** (unit)
    - `writeGitNote` stdin write failures (process closes stdin early)
    - `readGitNote` with corrupt refs or missing commits
    - Spinner lifecycle edge cases (exception during spinner.start/stop)

### Compatibility Testing Across Agent Platforms

- ARC claims agent-agnosticism but isn't tested across platforms
- Context: WU1 ADR 3 assesses agent-agnosticism; this would be the validation layer
- Priority: Post-1.0

---

## Completed (Reference)

Items that have been implemented or superseded by active work units.

- ~~General Refinement Pass~~ — Completed February 2026, merged via PR #3.
  Archive: `.arc/reference/archive/2026-q1/technical/01_content-refinement-pass/`
- ~~Structural Readiness Pass~~ — Completed February 2026, merged via PR #4.
  Archive: `.arc/reference/archive/2026-q1/technical/02_structural-readiness-pass/`
- ~~Structural analysis pass~~ — WU2 Cluster M (`plan-wu2-methodology-completion.md`)
- ~~README.md refresh~~ — WU5 (`plan-wu5-public-release.md`)
- ~~Migration tools for template updates~~ — WU3 (`prd-cli-implementation.md`)
- ~~Profile system enhancements~~ — WU3 interactive init
- ~~Documentation site~~ — WU5 docs site
- ~~Community contribution pipeline~~ — WU4 contributor support (ADR-014), WU5 community infrastructure

---

**Last reviewed:** 2026-02-22
