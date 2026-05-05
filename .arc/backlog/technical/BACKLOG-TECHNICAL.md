# Technical Backlog

**Purpose:** Organized collection of technical work ideas and plans — infrastructure, tooling,
modernization, and quality improvements.

**Processing:** When ready to work on an item, create a PRD/plan in `.arc/active/technical/` and
begin the standard workflow.

---

## High Priority

*[No high-priority items — current work is captured in active work units.]*

---

## Medium Priority

### CI/CD Improvements

- **Lifecycle-aware link reanchoring for movable ARC artifacts**
    - Problem: In `pm.mode: arc-in-git`, lifecycle workflows move PRDs, task lists, atomic
      companions, plan docs, and archives between `backlog/`, `active/`, and
      `reference/archive/`. Markdown links inside moved files can go stale because relative paths
      are anchored to the source file's old directory. The pre-commit link validator catches the
      failure, but recovery is manual and interrupts activation/archive flow.
    - Approach: Explore a combined helper + lifecycle command improvement:
        1. Add a constrained link-reanchor helper that accepts explicit move pairs (or reads them
           from staged `git mv` state), parses Markdown links/reference definitions, and rewrites
           only targets that resolve to moved ARC artifacts.
        2. Integrate that helper into future lifecycle CLI commands for activation/archive so
           `npx arc` can perform `git mv`, status/PM updates, and link reanchoring as one
           operation.
    - Notes: Keep this structural, not a broad grep/replace. The helper should support `--check`
      and `--write`, preserve filename-only references, and remain scoped to arc-in-git lifecycle
      moves. This complements, rather than replaces, the markdown link validator guardrail.
    - Effort estimate: M (helper + tests); L if bundled with full activation/archive CLI commands

- **Enhanced link validation — reference-style compliance + hook hardening**
    - Problem: Two related gaps surfaced when Marksman LSP integration revealed mixed link styles
      and stale cross-file references the existing `validate-links.sh` pre-commit hook didn't
      catch:
        - DEV-RULES.PROJECT § Documentation Standards prefers reference-style for cross-file
          links, but the codebase is mixed today.
        - The hook validates only staged files. When a file is moved/renamed (e.g., archival
          operations), broken outgoing links from un-staged files go undetected — a real example
          surfaced as a stale `prd-work-status-restructure.md` reference long after archival.
    - Approach (two lobes; can split into separate WUs if sizing demands):
        1. Reference-style compliance sweep (one-time content fix). Audit `.arc/` and the
           `packages/arc-framework/arc/` mirror; convert inline `[text](../path/to/file.md)`
           cross-file links to reference-style with the `---` + link block at EOF. Same-directory
           or one-level-up targets may stay inline per the rule.
        2. Hook hardening (recurring guard) — `validate-links.sh`:
            - Add `npm run lint:links` for whole-tree scans; wire into Tier 3 quality gates and
              GitHub Actions.
            - When a commit deletes or renames a `.md`, expand the candidate set to include any
              `.md` containing a link to the affected path. Closes the "moved file, broken link
              from elsewhere" gap.
            - Optional: anchor validation — for `file.md#section` targets, verify a heading slug
              matches `section` in the target file.
            - Optional cleanups: case-sensitive reference-usage matching (today's `grep -qiE`
              accepts `[Foo][BAR]` against `[bar]:` definitions); detect duplicate `[same-key]:`
              definitions in the same file.
    - Notes: Lobe 1 is a clean atomic-tier item. Lobe 2 splits into additive subtasks. The
      original CI-only framing of this entry expands here because the local pre-commit hook is
      the better place for fast feedback; CI wiring becomes a natural follow-on once the local
      command exists.
    - Effort estimate: M (S for hook hardening; S–M for the sweep depending on link volume)

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

### Planning Methodology Refinements

These two pair naturally as a single atomic-tier WU since both touch planning-time docs
(template-prd, strategy-work-planning, plan-doc convention, `1_create-prd` workflow).

- **Adopt `## Related Work Units` cross-linking convention**
    - Problem: ARC has no first-class notation for "these WUs are halves of a logical whole" or for
      upstream/downstream WU dependencies. Cross-links live ad-hoc in PRD bodies; relationships
      aren't discoverable from a known location.
    - Approach: Add a `## Related Work Units` section to both `template-prd.md` and the standard
      plan-doc format, with three buckets — Upstream/Prerequisite, Downstream/Follow-on, and
      Sibling/Parallel (same logical whole). Wire population guidance into `1_create-prd.md` and
      the `arc-plan` skill so the section gets populated at plan time and carried into the PRD.
      Status files inherit the relationships at activation.
    - Research: [research-wu-grouping-patterns][research-grouping] — survey of 10 patterns (epics,
      SAFe capabilities, stacked PRs, sub-issues, naming conventions, etc.) with fit assessment
      against ARC's grain. Concludes lightweight doc convention is the right shape.
    - Effort estimate: S (atomic-tier — template + plan-doc convention + workflow + skill edits)

- **Codify PR-sized boundary estimation in `strategy-work-planning.md`**
    - Problem: Soft 6-7 phase target for WUs lacks codified estimation guidance. Planning works
      from intuition; size-risk surfaces at integration time rather than at planning time when
      splitting is cheap.
    - Approach: Add a "Reviewability and Work-Unit Sizing" section to the discovery checklist with
      5 estimation cues (file-breadth, test-surface, dependency-direction, explainability test,
      system-interaction count) and a smell-test checklist (too-big / too-small / right-sized
      signals). Wire reference into `1_create-prd.md` discovery step and `2_generate-tasks.md`
      validation. Empirical anchor: 200-400 LOC review-effectiveness sweet spot.
    - Research: [research-pr-sizing-and-wu-boundary-estimation][research-sizing] — synthesizes
      SmartBear/Cisco, Google (Sadowski et al.), Microsoft (Bacchelli & Bird), and GitHub-scale
      studies, plus SPIDR/INVEST methodological frames. Includes draft section text ready to lift.
    - Effort estimate: S (atomic-tier — strategy edit + workflow cross-references)

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

### Test Infrastructure

- **Unify subprocess CLI test helpers (`runArc` + `runCli`)**
    - Problem: Two near-overlapping subprocess helpers exist —
      `__tests__/e2e/helpers.ts:runArc` (PTY-emulated via `script` on Linux,
      injects `NO_COLOR=1`, 30s default timeout, catches errors and maps to
      result) and `__tests__/helpers/run-cli.ts:runCli` (`stdio: "pipe"`,
      no env injection, 10s default timeout, rejects on spawn-error/timeout).
      Both spawn `node dist/cli.js`; the genuinely-different concern is
      invocation mode (TTY for interactive Clack flows vs. pipe for stdout
      purity contracts). Today, picking the wrong helper at a new test site
      is easy and the failure mode (Clack short-circuits to non-interactive,
      or PTY output contaminates a purity assertion) is confusing.
      Shared `CLI_PATH` constant + prebuild guard already extracted to
      `__tests__/helpers/cli-spawn.ts` during 2.R.3.c.2 — that captured the
      genuinely-shared duplication. The remaining consolidation is the
      ergonomic / single-import-surface question.
    - Approach: Collapse to one helper with explicit `mode: "tty" | "pipe"`
      parameter. Reconcile per-mode defaults (timeout, env injection, error
      handling) as part of the API design — current asymmetries are tuned per
      use case and can't be silently merged. Migrate ~80 `runArc` call sites
      across 10 e2e test files + 6 `runCli` call sites; cwd-position mismatch
      (positional vs. options-object) means every site touches its arg list.
    - Notes: Not blocking — both helpers work today. Benefit is ergonomic and
      makes the TTY-vs-pipe choice explicit at the call site instead of
      implicit-in-import. Cost is real (86 sites + behavioral matrix
      decisions). Path-independent: doing it later is no worse than doing it
      now. Captured during 2.R.3.c.2 after option B (shared core extraction)
      was selected over option C (full unification) for that task's scope.
    - Effort estimate: M (helper redesign + 86-site migration + new unit
      coverage for the mode parameter and default-merge behavior)

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
- ~~CI/TTY auto-detection~~ — WU4 Phase 6 (`tasks-beta-readiness.md`, Task 6.3.b)
- ~~Changelog / what's-new mechanism (MW-M06)~~ — WU4 Phase 6 (`tasks-beta-readiness.md`, Task 6.12)
- ~~Methodology Update Dependency Checklist / Guard~~ — Methodology Maturation
  (`prd-methodology-maturation.md`, Reqs 1-3)
- ~~Methodology Specification Layer~~ — Methodology Maturation
  (`prd-methodology-maturation.md`, Reqs 4-6)

---

**Last reviewed:** 2026-05-05

---

[research-grouping]: ../../reference/research/research-wu-grouping-patterns.md
[research-sizing]: ../../reference/research/research-pr-sizing-and-wu-boundary-estimation.md
