# Technical Backlog - ARC Framework

**Purpose:** Organized collection of technical work ideas — infrastructure, tooling, and
quality improvements.

**Processing:** Items added from planning discussions, discovery during active work, or backlog review.

---

## Completed

### General Refinement Pass — ✅ Complete

- **Status:** Completed February 2026 — merged via PR #3
- **Archive:** `.arc-internal/reference/archive/2026-q1/technical/01_content-refinement-pass/`

### Structural Readiness Pass — ✅ Complete

- **Status:** Completed February 2026 — merged via PR #4
- **Archive:** `.arc-internal/reference/archive/2026-q1/technical/02_structural-readiness-pass/`

---

## Unscheduled (Not Captured in 1.0 Work Units)

### CI/CD Improvements

- **Enhanced link validation**
    - Problem: Current CI doesn't catch all broken internal links
    - Approach: Add sophisticated link checking to GitHub Actions

- **Automated template instantiation testing**
    - Problem: No CI verification that templates work when instantiated
    - Approach: CI that creates and validates instantiated templates
    - Note: May evolve into CLI integration tests during WU3

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

### CI/TTY Auto-Detection for Non-Interactive Mode

- **Problem:** `arc init` requires `--yes` flag for non-interactive use; increasingly standard for CLI
  tools to auto-detect CI environments (`CI=true`) and non-TTY stdin and suppress prompts automatically
- **Scope:** Small (~5 lines of detection logic) but has UX decisions: warn vs. silent, apply to all
  commands vs. init only, interaction with explicit `--yes` flag
- **Approach:** Check `process.env.CI === 'true'` or `!process.stdin.isTTY` at command entry; imply
  `--yes` behavior when detected. Only `init` currently has interactive prompts.
- **Context:** Discovered during WU4 Phase 1 when `--yes` mode wasn't fully non-interactive (identity
  prompt bypassed the flag — fixed). Research confirmed CI/TTY detection is standard practice across
  npm, Terraform, Yeoman, and others.

### Compatibility Testing Across Agent Platforms

- Problem: ARC claims agent-agnosticism but isn't tested across platforms
- Context: WU1 ADR 3 assesses agent-agnosticism; this would be the validation layer
- Priority: Post-1.0

---

## Superseded by 1.0 Work Units

- ~~Structural analysis pass~~ → WU2 Cluster M (`plan-wu2-methodology-completion.md`)
- ~~README.md refresh~~ → WU5 (`plan-wu5-public-release.md`)
- ~~Migration tools for template updates~~ → WU3 (`prd-cli-implementation.md`)
- ~~Profile system enhancements~~ → WU3 interactive init
- ~~Documentation site~~ → WU5 docs site
- ~~Community contribution pipeline~~ → WU4 contributor support (ADR-014), WU5 community infrastructure

---

**Last reviewed:** 2026-02-22
