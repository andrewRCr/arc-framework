# Analysis: Beta Readiness Audit

**Work Unit:** `tasks-beta-readiness.md` (Phase 5)
**Date:** 2026-03-25
**Scope:** CLI codebase, git hooks, and ARC methodology documents.

---

## Executive Summary

Twelve parallel audit workstreams (6 CLI, 6 methodology scenarios) reviewed the entire CLI
package (`packages/arc-framework/`), git hooks, shared libraries, and the full ARC workflow
document set. The codebase is well-structured with good test coverage (~470 tests) and the
methodology routing is sound end-to-end for the power user path. However, the audit surfaced
significant issues concentrated in two areas: **git hooks** (first thing every adopter touches)
and **default-config documentation** (the path every new adopter follows).

**Finding counts:**

| Area         | High   | Medium | Low     | Total    |
|--------------|--------|--------|---------|----------|
| CLI / Hooks  | 14     | 42     | 25      | 81       |
| Methodology  | 4      | 18     | 30+     | 52+      |
| **Combined** | **18** | **60** | **55+** | **133+** |

**Top 7 issues for beta (ordered by adopter impact):**

1. **Single-line commits silently blocked** — `commit-msg` hook crashes under `set -e` when
   commit has no body (CM-H01)
2. **Hook checks read working tree, not staging area** — false negatives when index and working
   tree diverge, false positives from pre-existing content (PC-H01, PC-H03, PC-H04)
3. **`pm.mode: none` has dead ends** — the default config path hits 3 workflow gaps where
   guidance assumes arc-in-git artifacts exist (MW-H01, MW-H02, MW-H03)
4. **Update experience undocumented** — no entry-point doc, workflow, or pre/post guidance for
   `arc update` (MW-H04)
5. **No git repo check** — `arc init` and `arc join` proceed without verifying git repo,
   producing cryptic errors deep in the pipeline (I-H01)
6. **`arc user load` overwrites without backup** — local edits silently replaced, stale files
   accumulate (UL-H01, UL-H02)
7. **CRLF breaks config parsing** — Windows editors writing CRLF to `arc-config.yml` produce
   invisible `\r` in parsed values, breaking condition matching (CP-M02)

---

## Part 1: CLI Findings

### 1.1 Git Hooks

The hook system is the first thing adopters interact with on every commit. Four high-severity
bugs make it the highest-priority area.

#### High

**[CM-H01]** `commit-msg:285` · `grep -vc '^$'` kills hook under `set -e` for single-line commits

The body-length check runs `echo "$body" | grep -vc '^$'`. When body is empty (single-line
commit), grep finds zero non-matching lines, exits with status 1. Under `set -e`, this silently
kills the hook with exit code 1 — no error message, just a blocked commit. Every single-line
commit is affected.

Fix: `body_lines=$(echo "$body" | grep -vc '^$' || true)`

**[PC-H01]** `pre-commit:64-69, 103, 136, 247` · File content checks read working tree, not
staged content

Checks 2 (large files), 4 (conflict markers), 5 (debug statements), and 9 (meta-references)
all use `grep` / `wc` on the working-tree file. When the staging area and working tree diverge
(partial staging, post-stage edits), the hook validates the wrong content. Files staged-then-deleted
from working tree cause silent failures.

Fix: Use `git show ":$file"` or `git diff --cached` to inspect staged content.

**[PC-H03]** `pre-commit:130-136` · Debug statement check scans entire file, not staged diff

If a file already contains `console.log` in committed lines, staging any unrelated change to
that file triggers the debug warning. This produces persistent false positives on files with
legitimate logging.

Fix: Check only added lines via `git diff --cached -p`.

**[PC-H04]** `pre-commit:239-252` · Meta-reference check scans entire file, not staged diff

Same issue as PC-H03 but for meta-project references. Combined with XC-M05 (template ships
`\.arc/` in default patterns), new adopters with any file referencing `.arc/` paths will get
false positives on every commit touching that file.

#### Medium

**[CM-M04]** `commit-msg:165-169` · Task filename pattern `tasks-[a-z0-9-]+\.md` rejects
uppercase — `tasks-Auth-System.md` fails validation with unhelpful error.

**[CM-M05]** `commit-msg:171-178` · Task file existence check only searches three hardcoded
directories (`active/feature`, `active/technical`, `active/incidental`). Custom work-unit type
directories produce incorrect warnings.

**[CM-M07]** `commit-msg:81,126` · Invalid custom regex in `commit.custom_pattern` or
`commit.context_pattern` causes silent hook death under `set -e`. No validation or trap.

**[CM-M08]** `commit-msg:132` · Unknown `commit.context_footer` value (e.g., typo
`reccommended`) silently applies `required` validation via the `*` fallback case.

**[PC-M01]** `pre-commit:120-148` · Hook flags itself for debug patterns when the hook file is
staged (self-referential `console.log` in pattern list). Known issue, documented in
SESSION-NOTES.

**[PC-M03]** `pre-commit:42` · Detached HEAD silently bypasses branch protection.
Undocumented but likely intentional for rebase scenarios.

**[PC-M05]** `pre-commit:198-229` · Task numbering regex for bold formatting is fragile —
works but relies on implicit assumptions about markdown structure.

**[XC-M01]** Both hooks · `set -e` throughout creates maintenance hazard — any new code without
`|| true` guards silently aborts the hook.

**[XC-M02]** Both hooks · Contributor check skips are silent — no message tells contributors
which checks were skipped, making behavior undiscoverable.

**[XC-M05]** Template vs dev config drift · Template ships `\.arc/` in `hooks.meta_ref_patterns`
(removed from dev repo). New adopters get false positives on any code referencing `.arc/` paths.

**[LIB-M01]** `arc-lib.sh:53` · `grep -E "^${key}:"` treats dots in config keys as regex
wildcards. No ambiguous keys exist currently, but latent bug.

#### Low

**[CM-L01]** Subject length check runs even when `commit.format: any`.

**[PC-M02]** `numfmt` is Linux-only (macOS fallback works but may show stderr).

**[PC-L03]** Debug check test-file exclusion is hardcoded, not using configurable
`hooks.test_patterns`.

**[XC-L01]** Color output is unconditional — ANSI codes in CI/IDE logs.

**[XC-L02]** `README.md` says subject warns at 50 chars, hook warns at 60.

---

### 1.2 Update, Status, and Diff

The three-way merge system is the most complex code path. Two high-severity issues affect
update reliability.

#### High

**[U-H01]** `update.ts:246-404` · No atomicity or rollback for partial writes

The update loop writes files sequentially, then writes manifest and pristine store at the end.
A crash or interruption after writing some `.arc/` files but before writing the new manifest
leaves an inconsistent state: disk files have new content but manifest references old hashes.
The next `arc update` would see hash mismatches and trigger incorrect merges.

**[U-H02]** `update.ts:287-294` · Pristine repair stores adopter's modified file as new
pristine baseline

When pristine is missing for a file, the code uses the adopter's current file as the base for
future merges. On the next update, framework changes that pre-date the corruption are invisible
to the three-way merge — they're treated as the common ancestor. The correct behavior would be
to use the newly rendered framework content as pristine and skip the merge for this cycle.

**[X-H01]** `manifest/store.ts` + `update.ts:393-407` · Single-file pristine store

All pristine file contents are stored in one `pristine.json`. A single corrupted byte makes all
baselines unavailable. The file grows linearly with managed file count and must be fully
parsed/serialized on every update.

#### Medium

**[U-M01]** No downgrade prevention — running an older CLI version's `arc update` silently
overwrites newer framework content.

**[U-M02]** No handling for files that change classification between versions.

**[U-M03]** Corrupted `pristine.json` is silently discarded (empty catch) — triggers pristine
repair for every file with no user explanation.

**[U-M04]** Skill regeneration always overwrites user modifications. Warnings are generated but
never surfaced in the update summary.

**[S-M01]** `arc status` hash comparison uses manifest's `pristine_hash`, not actual pristine
store content. Can report incorrect state after a crashed update.

**[S-M02]** Version comparison is string equality, not semver. A downgraded CLI shows "update
available" misleadingly.

**[D-M01]** Corrupted `pristine.json` silently makes all diffs unavailable — same root cause as
U-M03.

**[D-M02]** Missing files are silently skipped in `arc diff` (but shown in `arc status`).

**[X-M02]** No manifest schema version field — format changes between versions produce opaque
errors instead of migration paths.

**[X-M05]** Windows path separators — `path.relative()` returns backslashes on Windows but
manifest keys use forward slashes. `arc status` would report all files as "missing" and "new"
on Windows.

#### Low

**[U-L02]** Scaffolded files get a meaningless `pristine_hash` in manifest.

**[U-L03]** Update summary doesn't show version change (e.g., "Updated v0.4→v0.5").

**[S-L01]** Status labels (`M`, `!`, `?`) have no legend in output.

**[D-L01]** No summary count line in diff output.

---

### 1.3 Init and Join

#### High

**[I-H01]** `cli.ts` (init and join actions) · No git repo check before proceeding

Neither `arc init` nor `arc join` calls `checkGitAvailable()` or `isGitRepo()` (both exist and
are exported). Running outside a git repo produces cryptic errors deep in the pipeline when git
config operations fail.

#### Medium

**[I-M01]** `--tools bogus` accepted without validation — invalid tool names silently produce no
skill output.

**[I-M02]** `--yes --name ""` accepted — empty project name propagates into rendered templates.

**[I-M03]** Missing template file produces raw ENOENT instead of user-friendly error.

**[I-M04]** `arc join` passes empty `existingDirs` to skill generation — ignores pre-existing
native skill directories, diverging from `arc init` behavior.

**[I-M05]** `--contributor` flag silently ignored in interactive mode — only applies in `--yes`
branch.

**[I-M06]** No test for `arc join` idempotency (re-join by same user).

**[I-M07]** No test for `pm.mode=external` permutation.

**[X-M01]** In `--yes` mode with no `arc.identity` and no `user.name`, identity resolves to
`null` and user directory creation is silently skipped.

#### Low

**[I-L01]** Integration test `skipPristine` option is silently ignored (wrong key name).

**[I-L04]** `parseArcConfig` regex doesn't handle YAML-quoted values — `"arc-in-git"` parsed
with quotes.

---

### 1.4 User Portability

#### High

**[UL-H01]** `user.ts:196-197` + `user-sync.ts:219-228` · Load overwrites local files without
merge, backup, or confirmation

`deserialize` unconditionally writes every file from the manifest. Local edits since last save
are silently replaced. Combined with ancestor walking (loading potentially stale data from old
commits), this is a real data-loss scenario.

**[UL-H02]** `user.ts:196-197` · Load does not remove stale files

Files deleted and re-saved are not cleaned up on load. The local directory accumulates orphaned
files, diverging from the saved state.

**[CC-H01]** `user-sync.ts:serialize` + `cli.ts:114-129` · Subdirectories silently dropped

`readUserDir` only reads files (`isFile()`). Subdirectories and their contents are silently lost
on save/load round-trip with no warning.

#### Medium

**[UL-M01]** `HEAD~N` ancestor walking follows only first parents — notes on merged-in branches
are never found.

**[UL-M02]** Sequential process spawns for ancestor walking (up to 40 git invocations).

**[UP-M01]** Push is non-force — fails on diverged remote with raw git error.

**[UP-M02]** Pull overwrites local notes without warning.

**[UP-M03]** No user-friendly error when remote doesn't exist.

**[SY-M01/M02]** `arc sync` doesn't set non-zero exit code on partial failure.

**[CC-M03]** `writeGitNote` stdin backpressure not handled — risk of corrupt notes for large
manifests.

#### Low

**[US-L01]** Forward-slash path separator hardcoded in serialize (Windows mixed-separator risk).

**[UA-L01]** `arc user add` is not idempotent — silently overwrites existing user files.

---

### 1.5 Log

#### High

**[L-H02]** `log.ts:122-123` · `--limit 0` returns all commits (0 is falsy, skips `-n` flag).

#### Medium

**[L-M01]** No validation of `--since` or `--author` — invalid values silently ignored by git.

**[L-M02/M03]** `--work-unit` filter applied post-fetch — silently truncates results when
combined with `--limit`.

**[L-M04]** Parsing assumes fixed line positions — `--ARC-RECORD--` in commit message would
break parsing.

**[L-M05]** `--limit abc` parsed as `NaN` (falsy), silently returns all commits.

#### Low

**[L-L01]** Output omits the context footer line — users can't see which work unit a commit
belongs to.

**[L-L02]** Breaking change marker `!` not handled in subject parsing.

---

### 1.6 Error Handling (Cross-Cutting)

#### High

**[EH-H01/H02]** `ALREADY_INSTALLED` and `NO_ARC_INSTALLATION` errors are plain `Error` objects
with monkey-patched `.code`, bypassing the `UserFacingError` hierarchy. The `isHandledError()`
check in `cli.ts` cannot recognize them.

**[EH-H03]** No global error boundary — `program.parse()` is unwrapped. Async action handlers
that throw non-`UserFacingError` produce raw stack traces.

#### Medium

**[EH-M01]** Corrupt git note JSON errors thrown as bare `Error`, not `UserFacingError`.

**[EH-M02]** Recipe file read/parse not wrapped in try/catch — corrupt npm install produces raw
`ENOENT` or `SyntaxError`.

**[EH-M03]** `resolveUserIdentity()` called outside try/catch in user command handlers.

---

### 1.7 Cross-Platform Robustness

#### Medium

**[CP-M01]** Path construction mixes string interpolation with `/` and `path.join()` in skills
and user-sync modules.

**[CP-M02]** All file content parsing uses `.split("\n")` without handling CRLF. Windows editors
writing CRLF to `arc-config.yml` break config parsing, conditional rendering, and managed block
operations.

**[CP-M03]** `listArcFiles` uses forward-slash regex patterns that won't match
`path.relative()` output on Windows.

---

### 1.8 Configuration System

#### High

**[CS-H01]** `config.ts:85-99` · `parseArcConfig()` is regex-based, not a YAML parser

Produces incorrect results for quoted values (`"arc-in-git"` includes quotes), inline comments
(`none # default` includes comment), and multiline values. Users seeing the `.yml` extension will
naturally try YAML-standard features.

#### Medium

**[CS-M01]** Config values not validated against known keys or expected ranges. Typo
`pm.mode: arc-in-gti` silently falls through to `none` behavior.

---

### 1.9 Test Coverage Gaps

#### High (missing unit tests for core modules)

**[TG-H01]** `src/lib/config.ts` — no dedicated tests. Edge cases (empty values, quoted values,
CRLF) uncovered.

**[TG-H02]** `src/lib/setup.ts` — no dedicated tests. Shared between init and join.

**[TG-H03]** `src/lib/fs.ts` — no dedicated tests. Windows path filtering logic untested.

**[TG-H04]** `src/lib/classification.ts` — no dedicated tests. Core to init and update behavior.

#### Medium

**[TG-M01]** `src/commands/user.ts` — no unit tests (integration only). Ancestor walking and
error paths hard to reach.

**[TG-M02]** `src/commands/update.ts` — no unit tests (integration only). Three-way merge
orchestration has many edge cases.

---

## Recommended Actions

### Fix Before Beta (High severity + critical Medium)

| ID             | Issue                                                | Effort                                    |
|----------------|------------------------------------------------------|-------------------------------------------|
| CM-H01         | `grep -vc` under `set -e` blocks single-line commits | Small — add `\|\| true`                   |
| PC-H01         | Hook checks read working tree, not staging area      | Medium — refactor to `git show ":$file"`  |
| PC-H03/H04     | Debug and meta-ref checks produce false positives    | Medium — use `git diff --cached -p`       |
| I-H01          | No git repo check in init/join                       | Small — add early guard                   |
| EH-H01/H02/H03 | Ad-hoc error codes, no global error boundary         | Medium — refactor to `UserFacingError`    |
| CP-M02         | CRLF breaks config parsing                           | Small — normalize `\r\n` → `\n`           |
| XC-M05         | Template ships `\.arc/` in meta-ref patterns         | Small — remove from template default      |
| UL-H01         | Load overwrites without backup                       | Medium — add backup/diff before overwrite |
| CS-H01         | Config parser doesn't handle YAML quotes             | Small — strip quotes in parser            |

### Should Fix Before Beta (Medium severity, high adopter impact)

| ID         | Issue                                       | Effort                                        |
|------------|---------------------------------------------|-----------------------------------------------|
| U-H01      | No atomicity in update writes               | Medium — write manifest first to temp, rename |
| U-H02      | Pristine repair uses wrong baseline         | Small — use rendered content as pristine      |
| CC-H01     | Subdirectories dropped in user sync         | Medium — recursive read                       |
| I-M05      | `--contributor` ignored in interactive mode | Small — pass flag to prompt                   |
| CM-M07     | Invalid custom regex kills hook silently    | Small — trap grep failures                    |
| L-H02      | `--limit 0` returns all commits             | Small — clamp to minimum 1                    |
| SY-M01/M02 | `arc sync` exit code incorrect              | Small — set `process.exitCode = 1`            |
| X-M05      | Windows path separator mismatch             | Medium — normalize paths                      |

### Defer to Backlog (Lower impact or larger effort)

| ID         | Issue                                   | Effort                       |
|------------|-----------------------------------------|------------------------------|
| X-H01      | Single-file pristine store              | Large — architectural change |
| U-M01      | No downgrade prevention                 | Medium                       |
| X-M02      | No manifest schema version              | Medium                       |
| UL-M01     | Ancestor walking misses merged branches | Medium                       |
| TG-H01-H04 | Missing unit tests for core modules     | Medium — parallel effort     |
| UP-M01/M02 | Push/pull conflict handling             | Medium                       |
| UL-H02     | Load doesn't remove stale files         | Small but needs design       |

---

## Part 2: Methodology Walkthrough Findings

Six scenario walkthroughs exercised the full ARC workflow document set. Each scenario was
executed by an independent subagent reading docs cold — simulating the fresh-eyes experience
of an adopter's agent.

**Finding counts (methodology):**

| Severity | Count | Key themes                                                        |
|----------|-------|-------------------------------------------------------------------|
| High     | 4     | pm.mode:none dead ends (3), update documentation absent (1)       |
| Medium   | 18    | Companion file lifecycle, contributor docs, update gaps, session  |
| Low      | 30+   | Minor friction, stale references, formatting, clarity suggestions |

### 2.1 Systemic: `pm.mode: none` Path Gaps

**This is the default configuration.** Every new adopter hits this path first. It is
well-handled in the middle of the lifecycle (1_create-prd, 2_generate-tasks, activate-work-unit)
but has dead ends at three boundary points.

**[MW-H01]** `02_define-project.md` Step 6 · ROADMAP placement with no `backlog/` directory

Step 6 directs the adopter to create ROADMAP.md in `backlog/`. With `pm.mode: none`, the
`backlog/` directory does not exist. No conditional guidance, no skip instruction, no
alternative location. The default-config adopter is stuck.

**[MW-H02]** `session-init.md` Step 5 · Next work unit discovery assumes ROADMAP and backlog

The discovery protocol says "Read ROADMAP.md" and "Check the backlog directory." Both are
absent for `pm.mode: none`. No `none`-mode path exists. The agent would hit missing files
with no guidance on what to do instead.

**[MW-H03]** `3_process-task-loop.md` lines 213-215 · Deferred atomic task routing only covers
arc-in-git

The "For later" atomic task destination is documented only for `arc-in-git`
(`ATOMIC-INBOX.md`). The `none` and `external` modes are absent. DEV-RULES.ARC covers this
at a higher level ("Per project convention — default: ask user") but the task loop — where the
agent actually makes the decision — omits it.

**[MW-M01]** `01_verify-and-configure.md` line 28 · Directory verification lists `backlog/`
unconditionally — false failure for `pm.mode: none`.

**[MW-M02]** `session-init.md` line 267 · ATOMIC-INBOX check in discovery assumes arc-in-git.

---

### 2.2 Systemic: Update Experience Undocumented

The `arc update` command works well mechanically (three-way merge, conflict detection, skill
regeneration) but the adopter-facing documentation is almost entirely absent.

**[MW-H04]** No update documentation in any entry-point document

Neither `.arc/README.md`, `AGENT-BRIEFING.ARC.md`, `DEV-RULES.ARC.md`, nor any workflow
document mentions the update process. An adopter who has used ARC for weeks has no in-framework
guidance on how to receive updates or what to expect.

**[MW-M03]** No update workflow document — unlike every other lifecycle event.

**[MW-M04]** `arc status` does not show file classifications (Framework/Configurable/Scaffolded).
An adopter cannot tell which files are safe to edit and which will be auto-updated.

**[MW-M05]** No post-update checklist. The command outputs "Done." with no suggestion to check
for conflicts, run verify, or commit.

**[MW-M06]** No changelog or "what's new" mechanism. Adopter sees counts ("5 updated,
1 conflict") but no semantic explanation of what changed.

**[MW-M07]** No warning when adopter edits a Framework file. Edits will be overwritten on
update, but there is no signal at edit time or via `arc status`.

**[MW-M08]** Skill regeneration silently overwrites customized generated files.

---

### 2.3 Atomic Companion File Lifecycle Gap

The `atomic-{name}.md` companion file is referenced in 5+ workflow documents but no workflow
creates it. This gap surfaces in both the power user path (Scenario 2) and the OOBE path
(Scenario 1).

**[MW-M09]** No workflow creates the atomic companion file

- `2_generate-tasks.md` creates the task list but never mentions the companion file
- `activate-work-unit.md` Step 3 attempts to `git mv` it from backlog to active
- `3_process-task-loop.md` says "All task lists have a companion file"
- `verify-work-unit.md` Task 3 checks it for resolution
- `strategy-task-list-formatting.md` says "Created alongside every task list" — this is the
  canonical source, but the numbered workflow that creates the task list doesn't reference it

An agent following the workflows literally would either hit a `git mv` error on a nonexistent
file or not know to create it.

**[MW-M10]** `archive-work-unit.md` Step 4 omits companion file from `git mv` commands

The archive step lists PRD, task list, notes, and completion doc for archival but not
`atomic-{name}.md`. A populated companion file would be left behind in `active/`.

---

### 2.4 Contributor Role Documentation Gaps

The contributor-specific documents (AGENT-BRIEFING.CONTRIBUTOR.md, template-contributing.md)
are well-written. The gaps are in shared documents that contributors also read.

**[MW-M11]** `DEV-RULES.ARC.md` · Task Execution section entirely maintainer-oriented

The Task Execution section (one task at a time, sub-agent scope, quality gates) applies to
maintainer task lists. Contributors don't execute ARC task lists. There is no "Contributor
note: this section applies to maintainer-managed task lists" marker. A contributor's agent
could interpret these rules as applying to their own work.

**[MW-M12]** `DEV-RULES.ARC.md` · Single contributor carve-out in entire document

Only one line mentions contributors (line 49, WORK-STATUS override). All other rules are
written from a maintainer perspective without exclusion markers.

**[MW-M13]** `githooks/README.md` · No documentation of contributor hook behavior

The README documents all checks but never mentions that Check 6 exists for contributors,
that Checks 7/8/10 are skipped, or that commit-msg Rule 7 is skipped. A contributor debugging
hook behavior would get a maintainer-only picture.

**[MW-M14]** No enforcement preventing contributors from using maintainer context footers
(`Context: tasks-foo.md (Task 1.2)` instead of `Context: contribution (...)`).

---

### 2.5 Session Lifecycle

The session round-trip works well overall. The trust hierarchy and triple-anchor lookup are
strong designs.

**[MW-M15]** SESSION-NOTES has single-path dependency on git notes

All rich context (debugging insights, decisions, persistent constraints) lives exclusively in
gitignored SESSION-NOTES backed by git notes. If git notes are unavailable (unfetched on new
machine, >20 ancestor commits, push failed), this context is permanently lost. No fallback
(e.g., reading git log) is suggested.

**[MW-M16]** Freshness check syntax gap when no handoff hash exists

`git log --oneline <handoff-hash>..HEAD` requires a hash. If SESSION-NOTES was never written
(crash, new clone without notes), there is no hash to substitute. The doc says "if no handoff
hash exists" but doesn't specify skipping the commit-range command.

**[MW-M17]** No-identity session can work but can't hand off

If `arc.identity` is missing, session-init says "proceed with tracked state only." But session
handoff requires identity for SESSION-NOTES and git notes. A session started without identity
produces work that can't be properly handed off. This is not flagged.

---

### 2.6 Incidental Work

The triage → route → capture → complete path is well-designed and mostly followable.

**[MW-M18]** ATOMIC-INBOX triage cadence — only triggered at integration

The inbox is triaged at one point: `integrate-work-unit.md` Step 5. If a project does many
small work units without formal integration, items accumulate with no triage trigger.

---

### 2.7 Routing and References

**[MW-L01]** `integrate-planning-branch.md` line 110 · Inline link uses bare filename
`(activate-work-unit.md)` but file is in parent directory (`../activate-work-unit.md`).
Reference-style link at line 139 is correct.

**[MW-L02]** `02_define-project.md` line 139 · Link to `03_configure-external-integration.md`
— file does not exist. Dead end for `pm.mode: external` adopters.

**[MW-L03]** `AGENT-BRIEFING.CONTRIBUTOR.md` line 65 · Link points to
`session-init.template.md` instead of `session-init.md`.

**[MW-L04]** `session-init.md` line 27 · Hardcoded repo path
`/home/andrew/dev/arc-agentic-dev-framework` in the environment verification example.

---

### 2.8 Positive Findings

Several areas were notably well-designed:

- **Full-ceremony routing** (Scenario 2): The arc-in-git + full protection lifecycle is
  navigable end-to-end. Every protection-mode-sensitive workflow has explicit conditionals.
  Forward links chain correctly through the entire cycle.
- **Triple-anchor task lookup**: Three independent anchors (task number, title, line hint) with
  graduated fallback. Resilient to common drift scenarios.
- **Trust hierarchy**: Four-level hierarchy with clear auto-recover vs stop-and-ask tiers.
  Practical examples that match real scenarios.
- **create-prd and generate-tasks**: Excellent `pm.mode` handling — both documents explicitly
  document the `none` path with concrete directories and `mkdir -p` instructions.
- **activate-work-unit mode detection**: Prominent skip instructions for `pm.mode: none` at the
  document header. Model for other documents.
- **Contributor session path**: Functional through role checks, handoff skip markers, and hook
  gating. The contributor-specific documents are well-written.
- **Incidental work routing**: Consistent model across DEV-RULES, arc-methods, process-task-loop,
  and manage-incidental-work. Terminology is aligned.

---

## Updated Recommended Actions

### Fix Before Beta — Methodology Additions

| ID       | Issue                                                | Effort                                                       |
|----------|------------------------------------------------------|--------------------------------------------------------------|
| MW-H01-3 | `pm.mode: none` dead ends (3 documents)              | Small — add conditional notes and alternative routing        |
| MW-H04   | Update experience undocumented                       | Medium — add update section to README + brief workflow/guide |
| MW-M09   | Companion file creation not in any numbered workflow | Small — add to 2_generate-tasks.md                           |
| MW-M10   | Companion file missing from archive step             | Small — add to archive-work-unit.md Step 4                   |
| MW-L02   | Dead link to `03_configure-external-integration.md`  | Small — remove or create stub                                |
| MW-L03   | Broken link in AGENT-BRIEFING.CONTRIBUTOR.md         | Small — fix reference                                        |
| MW-L04   | Hardcoded repo path in session-init.md               | Small — replace with placeholder                             |

### Should Fix Before Beta — Methodology Additions

| ID        | Issue                                               | Effort                                                 |
|-----------|-----------------------------------------------------|--------------------------------------------------------|
| MW-M01    | verify-and-configure lists backlog/ unconditionally | Small — add pm.mode conditional                        |
| MW-M04    | `arc status` doesn't show classifications           | Medium — add classification marker to output           |
| MW-M11-13 | Shared docs lack contributor markers                | Small — add exclusion notes to DEV-RULES, hooks README |
| MW-M15    | SESSION-NOTES single-path git notes dependency      | Small — suggest git log fallback in session-init       |
| MW-M16    | Freshness check syntax with no handoff hash         | Small — add skip instruction                           |

### Defer to Backlog — Methodology Additions

| ID     | Issue                                   | Effort                          |
|--------|-----------------------------------------|---------------------------------|
| MW-M03 | No dedicated update workflow document   | Medium                          |
| MW-M06 | No changelog / what's-new mechanism     | Medium                          |
| MW-M14 | Contributor context footer enforcement  | Medium — design decision needed |
| MW-M17 | No-identity → can't-handoff not flagged | Small                           |
| MW-M18 | ATOMIC-INBOX triage cadence             | Small — add secondary trigger   |
