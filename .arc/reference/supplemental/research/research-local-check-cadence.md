# Research: Local Check Cadence and Reuse

**Purpose:** External research into when and how local quality checks (format, lint, typecheck, tests, build) run
in current practice, to inform a stack-agnostic gate design: per-stage check composition, the auto-fix default,
result-reuse keying, change-based selection, and whether a per-increment check cadence has any industry analogue.

**Date:** 2026-10-07

**Method:** Three parallel external-research passes (hook-stage practice; reuse and change-based selection;
agent-era verification). Single pass, **no adversarial verification**: claims are as relayed by fetched pages and
search results. Each finding below carries its evidence grade. Re-verify any claim before a decision rests on it
alone.

---

## Summary

- **Pre-commit is fast and staged-scoped; whole-project checks go to pre-push or CI.** Every major hook tool scopes to
  staged files by default and lets a whole-project check opt out of file arguments. CI is the authority because
  every local hook is bypassable.
- **One check declaration serves every stage.** Each tool declares a check once with a command, a file filter, a
  stage assignment, and skip controls, and the same declaration runs in CI (`pre-commit run --all-files`).
- **Auto-fix restaging is split.** lint-staged and lefthook (`stage_fixed`) restage fixed files; pre-commit.com and
  Overcommit fail and make the author re-add. Neither side is the idiom, so it is a configuration value.
- **Reuse keys on content plus command, records passes only, and is never attestation.** Nx, Turborepo, Gradle,
  Bazel, `git test`, and git-branchless all key on hashed inputs (or the tree) plus the command or config. Failures
  are re-run, and a hit replays stored output. Every tool frames the cache as an execution shortcut.
- **Change-based selection fails closed.** Global files (lockfile, config) or an unresolvable change base widen
  the selection to everything.
- **Agent practice converges on "verify before done" with scoped checks.** Fast checks after edits, a heavier check
  where the agent declares done or stops, and CI as the backstop. No source shows agents need a tighter cadence
  than humans; they need a different feedback channel, since they have no editor.

## Findings

### Hook-stage practice

Near-universal (strong — tool documentation):

- **Staged-file scoping at pre-commit.** lint-staged runs "only on files that include staged changes";
  pre-commit.com passes matching filenames against staged contents; lefthook templates `{staged_files}`; Overcommit
  uses `include` / `exclude`.
- **Whole-project opt-out.** pre-commit.com `pass_filenames: false`; lint-staged function tasks so `tsc` honors its
  project config; Overcommit `--run`. The all-files form doubles as the CI form.
- **Unstaged changes are isolated during the hook.** pre-commit.com stashes them because "running hooks on unstaged
  changes can lead to both false-positives and false-negatives"; lint-staged backs up state and restores partially
  staged files; Overcommit stashes. Checks see exactly what will be committed.
- **Per-check stage assignment and skip controls.** pre-commit.com `stages:` / `default_stages` / a `manual`
  stage; lefthook per-job `glob`, `skip`, `only`; Overcommit `SKIP` / `ONLY` and `required: true`.
- **Bypassability.** Git documents `--no-verify` for pre-commit; Husky documents `HUSKY=0`; pre-commit.com
  prefers per-hook `SKIP=` over whole-commit bypass.

Split or weakly evidenced:

- **Auto-fix restaging.** Restage camp: lint-staged adds modifications "as long as there are no errors"; lefthook
  `stage_fixed` fails the hook if `git add` fails, "otherwise the commit would silently go through with the unfixed
  content." Fail camp: pre-commit.com reports "Files were modified by this hook" and fails; Overcommit does not
  support file-modifying pre-commit hooks. No stated rationale was found for the fail camp (gap).
- **Typecheck placement.** Pre-commit, pre-push, and CI-only all have advocates. Opinion only (weak).
- **Pre-push prevalence and contents.** Natural home for tests and typecheck when present; argued against when
  pushes are frequent or the suite is slow. No prevalence data (gap).
- **Time budgets.** No tool documents a numeric budget; specific numbers in circulation are unsourced (gap).
- **Defining checks once.** The hook config runs in CI (`pre-commit run --all-files`, pre-commit.ci, Overcommit
  `--run`), or hooks and CI both call shared scripts or task-runner targets (common practice, not primary-sourced).
  Husky disables itself in CI and pairs with separate CI jobs.

### Result reuse and change-based selection

Near-universal (strong — tool documentation, except where marked):

- **Key = content hash of inputs + command / config + environment.** Nx hashes sources, dependency sources,
  workspace config, external dependency versions, OS / CPU, and command arguments. Turborepo combines a global hash
  (root config, lockfile, `globalDependencies`, `globalEnv`, passthrough arguments) with a per-task hash (narrowable
  through `inputs`). Gradle hashes task type, classpath, declared inputs, and the Gradle and plugin versions.
  git-branchless caches on "the command and the tree ID"; Haggerty's `git test` records results "by the tree that
  was tested, not the commit," so results survive message edits and squashes.
- **Pass-only reuse.** Gradle and Bazel never cache failures, and testmon re-runs last-failed tests (strong); the
  Bazel detail is partly from secondary sources (medium). Nx and Turborepo documentation is silent on failures (gap).
- **A hit skips execution and replays stored output** (Nx, Turborepo).
- **Undeclared inputs are the central hazard.** Gradle: undeclared inputs cause incorrect hits. Bazel: environment
  leakage, and tools outside the workspace are untracked. Turborepo requires environment variables to be declared.
  testmon does not track data files or external services. `git test` states tests "should not depend on things
  besides the files in the tree."
- **Fail-closed widening.** Nx marks everything affected when the lockfile changes, and runs everything when it
  cannot compute the affected set; Turborepo treats all packages as changed when the checkout is too shallow.

Split:

- **Change base.** Working tree (Jest `--onlyChanged`) versus a ref range (Jest `--changedSince`, Nx base / head,
  Turborepo `--affected` defaulting to `main...HEAD`). Nx recommends the last successful main commit as the base — a
  last-known-good anchor rather than the branch tip.
- **Graph versus coverage selection.** Static dependency graphs (Nx, Turborepo, Jest, Vitest) versus runtime
  coverage fingerprints (testmon) — more precise, but blind to inputs outside its language.
- **Key breadth.** Narrow per-task `inputs` give more hits and more silent staleness; Bazel and Gradle sandbox or
  validate declared inputs instead.
- **Trust model.** Gradle and Bazel recommend CI-only writes to shared caches, with developers read-only; poisoned
  caches are handled by wiping, not detection.

Not found (gap): any official statement that a cache hit satisfies a required merge check. In practice CI re-runs
the task graph and a CI-written remote hit passes quickly — safe only because of CI-only writes and hermetic keys.
A machine-local developer record is the weakest trust tier (inference).

### Agent-era verification

Emerging consensus (vendor documentation, strong; practitioner posts, medium):

- **Give the agent a runnable check, and make "done" mean the check passed.** Anthropic's Claude Code best
  practices: "give Claude a way to verify its work"; prefer single tests over the whole suite; typecheck "when
  you're done making a series of code changes"; hooks are deterministic where instruction files are advisory.
- **Tiered cadence by cost.** Fast checks after edits (format, lint, typecheck or focused tests on touched files),
  the heavier check at the stop boundary, CI as backstop; "do not put the full test suite there by default"
  (practitioner posts, consistent, unmeasured).
- **Harness mechanisms.** Claude Code PostToolUse / Stop hooks (exit 2 feeds stderr back; a Stop hook can hold the
  turn open until a check passes). Aider lints edited files by default and auto-tests on opt-in, feeding failures
  back. Gemini CLI AfterTool / AfterAgent with JSON I/O. Cursor `afterFileEdit` (notify-only) and `stop` with
  follow-up. Codex CLI hook support is reported opt-in and recent (conflicting secondary sources). GitHub's Copilot
  coding agent runs the project's tests and linters before requesting review — a pre-PR gate, not per-edit.

Contested or weakly evidenced:

- **Per-edit blocking versus end-of-turn gating.** SWE-agent's ablation shows a lint guardrail rejecting
  syntactically broken edits helps agents recover (strong source; magnitude unverified). Against heavy per-edit
  checks: latency, noise, false failures on intentionally incomplete multi-file edits, and context consumed by
  output.
- **Bypass.** Single reports of agents using `--no-verify`, stashing, or rewriting `core.hooksPath` to get past a
  slow or failing hook; slow gates plausibly raise the incentive (inference). Mitigations: command guards and a CI
  backstop.

Agent-versus-human divergences:

- **Feedback channel.** Agents have no editor diagnostics by default; harness hooks and tool results are the
  analogue (Claude Code code-intelligence plugins are the closest vendor-documented one).
- **Stopping.** An agent stops when work looks done; a deterministic done-check has no direct human equivalent.
- **Context cost.** Check output consumes context and degrades later work, so output should be terse and
  failures-only (vendor guidance; no study of format).
- **Cadence.** No benchmark or study compares per-step with end-of-task gating for agents (gap). Claims that agents
  need a tighter cadence than humans are opinion.

## Implications

Options for the consuming design, not decisions:

- Declare each check once — command, stage assignment, file filter (inputs), whole-project versus file-argument
  mode, and whether it mutates — and run the same declaration from hooks, workflow fire sites, and CI.
- Treat restage-on-fix as a configuration value. A done-boundary run that applies fixes before review leaves the
  commit hook nothing to fix in the common path.
- Key reuse on the checked tree (or each check's input hash) plus a digest of the check's command and
  configuration and tool / runtime versions; record passes only; skip recording when the checked content is not a
  committed or committable tree; never treat a local record as merge evidence.
- Derive change-based selection from the same input declarations, widening to everything on global files, an
  unmatched path, or an unresolvable base.
- The per-increment check's legitimate analogue is "verify before declaring done" with scoped checks. A blocking,
  fixed, whole-project block at every increment sits at the heavy end of practice, with no evidence it is required.
- Keep check output terse and failures-first for agent consumers.

## Gaps

Time budgets and pre-push prevalence (no data); typecheck placement (opinion); lefthook-in-CI form, Nx / Turborepo
failure caching, Vitest `--changed` semantics, and Bazel changed-file target selection (unverified); official
Cursor, VS Code, and Codex hook documentation (not fetched); SWE-agent ablation magnitude; any controlled study of
agent check cadence; prevalence of agent hook bypass.

## Sources

Hook stages:

- <https://git-scm.com/docs/githooks>
- <https://pre-commit.com/>
- <https://github.com/lint-staged/lint-staged>
- <https://lefthook.dev/configuration/> and <https://lefthook.dev/configuration/stage_fixed>
- <https://github.com/sds/overcommit>
- <https://typicode.github.io/husky/> and <https://typicode.github.io/husky/how-to.html>
- <https://blog.codercops.com/blog/pre-commit-hooks-code-quality-2026> (secondary)
- <https://cakeinpanic.medium.com/stop-running-tests-on-precommit-hook-665be07b220d> (secondary)
- <https://dev.to/sporter/pre-push-time-saver-m8h> (secondary)

Reuse and selection:

- <https://nx.dev/docs/concepts/how-caching-works> and <https://nx.dev/docs/features/ci-features/affected>
- <https://turborepo.dev/docs/crafting-your-repository/caching> and <https://turborepo.dev/docs/reference/run>
- <https://docs.gradle.org/current/userguide/build_cache.html>
- <https://bazel.build/remote/caching> and <https://bazel.build/reference/test-encyclopedia>
- <https://gitlab.com/BuildGrid/buildgrid/-/issues/151> (secondary)
- <https://github.com/mhagger/git-test>
- <https://github.com/arxanas/git-branchless/wiki/Command:-git-test>
- <https://testmon.org/>
- <https://jestjs.io/docs/cli> and <https://vitest.dev/guide/cli>

Agent-era verification:

- <https://code.claude.com/docs/en/best-practices>
- <https://aider.chat/docs/usage/lint-test.html>
- <https://geminicli.com/docs/hooks/reference/>
- <https://arxiv.org/abs/2405.15793> (SWE-agent)
- <https://github.blog/changelog/2026-03-18-configure-copilot-coding-agents-validation-tools/>
- <https://github.blog/changelog/2026-04-10-copilot-cloud-agents-validation-tools-are-now-20-faster> (vendor claim)
- <https://pydevtools.com/handbook/how-to/how-to-stop-ai-agents-from-bypassing-pre-commit-hooks/> (secondary)
- <https://codex.danielvaughan.com/2026/03/30/codex-cli-hooks-engine> (secondary)
- <https://blog.gitbutler.com/cursor-hooks-deep-dive> (secondary)
- <https://lilting.ch/en/articles/gemini-cli-hooks-research> (secondary)
- <https://knightli.com/2026/07/10/claude-code-hooks-auto-run-tests/> (secondary)
- <https://dev.to/ohugonnot/claude-code-hooks-real-examples-posttooluse-stop-pretooluse-620> (secondary)
