# Draft: Quality Gates and Hook Integration

- **Origin:** [internal]
- **Purpose:** Replace ARC's fixed, prose-resolved quality-gate tiers with declared checks that one CLI verb selects,
  runs, and reuses — keyed to repository events rather than to ARC's approval machinery — so a project's checks run
  where industry practice runs them, once per tree, from hooks, workflow steps, and CI alike.

---

## Status

- **Readiness:** maturing — direction and scope are settled; the open items are detail design.
- **Resolved:** the four design commitments; the gate model and its vocabulary; the check declaration; the gate verb;
  selection and reuse; fire sites (no per-task gate); fix handling; this repository as first consumer in-WU; the
  storage boundary; the buffer triage.
- **Open:** see § Open items.
- **Next:** settle the open items, then the readiness pass (source grounding, proportionality, adversarial offer) and
  the capture commit, which also retitles the meta to match this draft. Route-outs execute at that close
  (§ Buffer triage).

## Problem / Motivation

ARC defines three quality-gate tiers by _when in the workflow_ they run — Tier 1 per task, Tier 2 per coherent unit,
Tier 3 per phase or pre-PR — and leaves each project to write the commands for each tier as prose. Four defects follow.

**1. Gates re-run over unchanged trees.** Nothing records which checks passed on which tree, so every fire site runs
its block again. Measured at `c009ab198` across the framework workflows:

- the last subtask of a parent runs Tier 1 and then Tier 2 back to back (`process-task-loop`), and Tier 1's
  file-scoped checks are strict subsets of Tier 2's;
- the last Tier 2 is followed by `verify-work-unit`'s Tier 3, which adds only `build`; `self-review` running Tier 3
  immediately before `verify-work-unit` repeats it again with no change between;
- a `prepare-work-unit` review fix runs Tier 1, then the commit hook, then convergence over the same tree;
- a delivery member's last task runs Tier 2 and `deliver-stack` runs the complete Tier 2 again per member checkout;
- the tier definitions disagree on when Tier 3 fires (`strategy-quality-gates.md` per phase, `QUICK-REFERENCE.md` per
  phase or pre-PR, `process-task-loop` never), so the phase template plus the mandatory verification task runs it
  twice.

The one exact-tree reuse that exists is narrow: delivery review-fix verification admits Tier 1 reuse under
`tier1ReuseCriteria` with `provenance: exact-tree-reuse` (`review-fix-verification.ts`). The unchanged-tree rule
itself lives only in this repository's project rules; no framework workflow, method, or strategy carries it, and
`verify-work-unit`, `prepare-work-unit`, `integrate-work-unit`, and `run-errand` say to rerun.

**2. A fixed block fires at a fixed cadence.** The per-task gate was introduced as fail-fast backpressure: catch a
defect while it is cheap, before later work builds on it. The intent is sound, but the mechanism assumes the worst —
a blocking block of mixed-cost checks after every increment. Industry practice has no milestone cadence: fast, scoped
checks at commit; broader checks at push; the full suite in CI; editor diagnostics as the continuous layer.
Agent practice converges on "verify before declaring done" with targeted checks, a heavier check at the stop
boundary, and CI as the backstop; no source shows agents need a tighter cadence than humans, only a different
feedback channel (`research-local-check-cadence.md`). Measured at 2026-07-25, the documented Tier 1 cost ~47s and ran
three full-project scans on changes that often could not reach them (64 of 200 sampled commits were Markdown-only);
targeting the same coverage brought it to ~1s.

The tiers also collapse two kinds of check into one bar. A per-task check is _feedback_ ("did I break what I just
wrote?"); a pre-merge check is _enforcement_ ("this may not merge broken"). With no distinct job, Tier 2 drifted to the
enforcement end and became Tier 3 minus `build`.

**3. Gate composition is prose the agent must rediscover.** The Tier 2 set is a fenced bash block in
`QUICK-REFERENCE.md`, reached through `quality-gate-commands`, a method that is an explicit passthrough. No CLI reads
either surface: `arc check` has only the `commit-msg` subcommand (`handlers/check/commit-msg.ts`). Every ceremony
that says "run the gates" spends agent attention working out which commands those are; relevance rules ask the agent
to compare `git diff --name-only` against a table; and nothing reports what actually ran. Separately enumerated local
and CI sets drift — local Tier 3 reported green while CI rejected `lint:arc:section-refs`, which the local set omitted.

**4. Projects get no hook support for their own checks.** ARC's shipped pre-commit hook runs structural checks only
(20 `CHECK[...]` blocks in `githooks/pre-commit`); its pre-push hook only warns before a force-push
(`githooks/pre-push`, advisory, always exits 0). A project that wants its linters or tests at commit or push wires its
own hook — this repository chains `lint:md:staged`, `check-package-sync.sh`, and `check-ts-quality.sh` after ARC's
hook in `.husky/pre-commit`, and `check-ts-quality.sh` runs whole-program `typecheck` and `typecheck:test` on every
staged TypeScript change, a third run after the tiers already ran them.

This matters now: ARC is pre-1.0 and this surface is central; agents commit at every review increment, so redundant
runs compound; and CI already reuses a verified tree (`classify-change.sh` skips the heavy suite when its
rebase-stable code-tree hash matches a tree whose `HEAVY_CHECK_NAMES` all passed) while local runs have nothing
equivalent.

## Design commitments

Four constraints bound every decision below.

1. **Event-anchored, interlock-independent.** Gates are deadlines named by repository events — commit, push,
   integration — which happen however approval is configured. Gate semantics never read interlock state, no gate
   configuration names an interlock, and the verb is a leaf any caller may invoke: a workflow step, a hook, CI, or a
   future ratchet layer that decides _when_ steps fire. The shared names (`commit-`, `push-`, `integration-`) are the
   same git events, not a coupling; the release wrapper is at most one caller.
2. **Industry idiom first.** Where practice is near-universal, follow it; where it splits, make it configuration with
   a stated default; diverge for agents only where the research names a real divergence. Grounding:
   `research-local-check-cadence.md`.
3. **Project-agnostic.** Every element must serve a project in any language. This repository is the first consumer:
   it _configures_ the design to prove each configurable element, and never _extends_ it. A need of this repository
   that the configuration cannot express is a design signal — generalize it only if another stack would plausibly
   need it; otherwise this repository wraps it in its own script.
4. **Procedure and knowledge north stars.** Structure is typed configuration the CLI validates; the CLI computes
   selection and reuse; workflow prose names the verb and never the commands; failure output carries the remedy.
   No new command-reference document, no growth of always-loaded rules, and no prose that evaluates state
   (`strategy-procedure-evolution.md`, `strategy-knowledge-evolution.md`).

## Direction

### D1 — Gate model and vocabulary

Tier 1/2/3 retires (settled 2026-07-25 against measured evidence; the rename lands inside the mechanics work, since
rewriting fire sites to the verb rewrites the very lines that name the tiers). Four concepts, two of them vocabulary:

- **Gate** — a deadline: `commit-gate`, `push-gate`, `integration-gate`. "Must have passed before commit / push /
  merge." Self-enforcing in a way an ordinal is not: a `commit-gate` costing 47s is visibly wrong.
- **Kind** — `enforcement` (must pass by its gate; blocks there) versus `feedback` (informative before the gate).
  Kind is what lets a test-first sequence carry an intentionally failing test across increments while the push gate
  still holds.
- **Cost** — measured data the verb records with each run, never declared.
- **Selection** — a mechanical rule (D4), never vocabulary.

Zero tolerance holds per gate at its deadline: every check assigned to a gate passes before that event. This
repository's project rule ("all quality checks must pass before any commit") changes accordingly — Owner decision,
2026-10-07, on the direction the 2026-07-25 grooming recommended.

Define `gate` and `kind` once, in the briefs' vocabulary, worded to agree with the shipped rule-authority reading
(DEV-RULES.ARC § Rule Authority): an enforcement result protects the integrity of a check, so a red gate is never the
agent's to set aside; a feedback result informs and binds nothing until its gate.

### D2 — The check declaration

A project declares each check once in typed configuration the CLI validates. The shape follows every major hook tool
(pre-commit.com `stages:` / `files:` / `pass_filenames`; lefthook `glob` / `run`; Turborepo `inputs`):

- **id** and **command**;
- **gates** — which deadlines it belongs to;
- **inputs** — globs its result depends on; default the whole tree, so an undeclared input can only cost a run,
  never yield a false reuse; narrowing is the project's opt-in;
- **mode** — `files` (receives the changed or staged paths among its inputs) or `project` (runs whole-project);
- **fixes** — whether it may rewrite files.

Global inputs that invalidate every check (lockfiles, tool configuration, the declaration itself) are declared once.
ARC ships no stack defaults; initial setup asks the project to declare its checks, and common-stack examples (JS/TS,
Rust, Go, Python) route to the docs site through a `notes-docs-content-sweep.md` capture at draft close.

### D3 — One gate verb

One CLI verb resolves a request (a gate, plus a scope such as staged, changed, or all), selects (D4), reuses (D5),
runs what remains, and reports per check: ran, reused, or not selected, with the reason. Output is terse and
failures-first by default, with JSON for machine callers; each failure carries a precomposed remedy, including the
fix invocation for `fixes` checks. Every caller uses it: workflow steps, ARC's hooks, CI, and any harness edit hook.

### D4 — Selection

A check is selected when its declared inputs changed relative to the request's scope. Against a base, the base is the
merge base with the base branch (Nx's default); a stronger last-known-good anchor is open (§ Open items). Selection
widens to every check when a global input changed, a changed path matches no check's inputs, or the base
cannot be resolved (shallow clone, missing ref) — Nx and Turborepo fail closed the same way.

The package-mirror case (a one-sided edit to a mirrored file pair) is expressed through inputs, not special
machinery: a check whose correctness spans both copies declares both.

### D5 — Reuse

The verb keeps a machine-local record of passes under `.git/arc/` (machine-local state stays local through the
storage cutover). Key: check id, a digest of the check's declaration, and a digest of its inputs' content in the
checked tree, plus the changed-path set for `files` checks. Only passes are recorded; a failure always re-runs; a hit
replays the stored summary. The record is an execution shortcut, never evidence: no attestation, Candidate, or merge
check reads it.

The checked tree is the content the event will carry: at the commit hook, the index (`git write-tree`); at a workflow
step, the worktree as it would be staged. So a step's run and the hook's run over the same content produce the same
key, and the second is free. The release wrapper already rejects a bad message before Git runs any hook; on the raw
`git commit` path, where the content gate runs before the message check, a message-only retry now reuses the content
result, because the key is the tree, not the message.

### D6 — Fire sites

No per-task gate. The fail-fast intent is served at the points where it pays:

- **Done boundary** — a review increment's completion in `process-task-loop`, an errand pass or approved review fix
  in `run-errand` (correction paths in `prepare-work-unit` and `integrate-work-unit` stay out, per § Storage
  boundary): run the `commit-gate`
  plus the push-gate's `files` checks over the change (for example, related tests via `vitest related` or
  `jest --findRelatedTests`). The commit set's failures block the commit; the push-gate subset is feedback in the
  completion report. Fixes apply here, before review (D7).
- **Segment verifier** — a `slice` or `replication` segment's closing verifier runs the `push-gate`. The plan declares
  where broader verification pays off, replacing the "coherent unit" judgment Tier 2 rested on; the verb knows
  nothing of segments. A `layer` segment needs nothing extra.
- **Commit and push hooks** — run their gates; normally a reuse.
- **Work-unit verification** — `verify-work-unit` runs the `integration-gate`.
- **CI** — runs the `integration-gate` as the authority.

Push cadence stays neutral: gates are deadlines, so a project that pushes once a session and one that pushes hourly
get the same guarantees. The done-boundary push subset is what gives regular test feedback between pushes.

### D7 — Fixes and restaging

Fix-capable checks run at the done boundary with fixes applied to the worktree before review, so reviewed content is
committed content and the hook usually finds nothing to fix. For commits made outside a workflow step, hook-time
behavior is configuration — `restage` or `fail` — because practice splits (lint-staged and lefthook `stage_fixed`
restage; pre-commit.com and Overcommit fail). Default `restage`, following lefthook's rule: fail the hook if the
restage itself fails, so unfixed content never commits silently. A restage must not re-trigger the gate or loop.
This absorbs the add → format → re-stage loop (`format:tables` refusing untracked paths, then the index / worktree
drift guard in `worktree-index-drift.ts`).

### D8 — Hooks

ARC's shipped pre-commit hook runs its structural checks, then dispatches the `commit-gate` through the verb; the
shipped pre-push hook keeps its force-push advisory and dispatches the `push-gate`. Both stay on the existing
`hooks.pre_commit` / `hooks.pre_push` keys; gate dispatch is on when the project declares checks for that gate and
off otherwise. Hook-manager integration is unchanged (ADR-014: husky, lefthook, pre-commit.com, or `core.hooksPath`).
Hooks remain bypassable by design; CI is the authority, and ARC's `--no-verify` prohibition stays agent discipline.

### D9 — CI parity by construction

CI runs the same declaration through the same verb, so a check cannot be local-only or CI-only by omission — the
local-green / CI-red class closes structurally rather than through a parity test.

### D10 — Knowledge placement

- `gate` and `kind` enter the briefs' vocabulary (D1).
- `quality-gate-commands` retires or becomes a pointer to the declaration.
- `QUICK-REFERENCE.md` § Quality Gate Commands gives way to verb help and emitted remedies.
- `strategy-quality-gates.md` shrinks to what an operator needs that the verb cannot say; its tier, escalation, and
  checkpoint-placement content is replaced by D1 and D6.
- This repository's DEV-RULES.PROJECT § Selecting what to run shrinks to its zero-tolerance policy once the verb
  computes selection and reuse.

Every demotion or retirement is checked against `init-recipe.json` in both directions first, so content is
relocated rather than silently deleted for every project.

### D11 — This repository as first consumer

The final work moves this repository's existing checks into declarations, proving each configurable element:

- the `.husky/pre-commit` chain (`lint:md:staged`, `check-package-sync.sh`, `check-ts-quality.sh`) becomes declared
  checks dispatched by ARC's hook — staged scope, a whole-program check at commit, and a structural sync check;
- the QUICK-REFERENCE gate blocks and the DEV-RULES.PROJECT relevance table become inputs and gate assignments;
- the package-mirror coupling becomes declared inputs (D4);
- `format:tables` and the Markdown drift guard exercise D7;
- CI invokes the verb (D9), after `test-suite-reliability` lands its CI layout changes.

Checks this repository does not yet have are distinct concerns and route out (§ Buffer triage).

## Alternatives

**Tier vocabulary** — settled 2026-07-25. _Gate-only_ (deadline names) loses the feedback / enforcement distinction;
_cost-class as the second axis_ codifies the axis that empirically collapsed (Tier 3 exceeds Tier 2 by `build`
alone, ~5%); _status-quo cleanup_ keeps the ordinal that let Tier 1 run full-project scans undetected. Chosen: gate ×
kind, with cost as measured data and selection as a rule (D1).

**Where gate composition lives:**

- _Stage metadata in the `quality-gate-commands` method, read by hooks_ — puts structure in Markdown for shell to
  parse. Rejected.
- _One method per stage_ — more files, the same prose-as-structure defect. Rejected.
- _Consume the project's hook-manager configuration_ (`.pre-commit-config.yaml`, `lefthook.yml`) — ties ARC to one
  manager's schema and still leaves workflow steps and CI without a resolver. Rejected; a declared check's command may
  invoke a hook manager or task runner.
- _Typed ARC declaration resolved by the verb_ — chosen (D2, D3).

**Where reuse comes from:**

- _Adopt a task runner (Nx, Turborepo, Bazel)_ — stack-specific. Rejected as framework substrate; a project with one
  declares checks that call it, and its own cache composes underneath.
- _No reuse; rely on selection alone_ — selection cannot dedupe two fire sites over the same tree. Rejected.
- _Tree-keyed pass record in the verb_ — chosen (D5), following `git test` and git-branchless.

**Per-task cadence:**

- _Keep a blocking per-task block_ — overcorrected, with no evidence it is needed.
- _Feedback only at edit time through harness hooks_ — harness-specific, and leaves no done-boundary check.
- _Done-boundary run of the upcoming gate plus the push subset_ — chosen (D6).

**Pre-push enablement** — _smart default_ (on when push-gate checks are declared), _always opt-in_, or _always on_.
Chosen: the smart default under the existing `hooks.pre_push` key (D8).

**Hook-time restage** — configurable, default `restage` (D7).

## Open items

1. **Verb name.** Extend the existing `arc check` with gate subcommands, or a new `arc gate`. Lean: `arc check`.
2. **Done-boundary composition.** Confirm the push-gate `files` subset as feedback at the done boundary (D6) as the
   framework default rather than a project knob. Lean: default.
3. **Unstaged changes at the commit hook.** Tools read the worktree, not the index. pre-commit.com and lint-staged
   stash unstaged changes, but the stash stack is shared across worktrees, which ARC runs concurrently. Lean: fail
   closed when a selected check's inputs carry unstaged changes, with an emitted remedy; no stash.
4. **CI invocation form.** The verb in CI needs ARC's CLI in the CI environment, which a project in another language
   may not otherwise install. Lean: the verb, plus a mode that prints the resolved commands for native CI steps.
5. **Reuse key granularity.** Per-check input digest (D5) versus whole-tree key. Lean: per-check, since the inputs
   already exist for selection.
6. **Declaration home.** `arc-config.yml`'s flat keys cannot carry a list of structured checks. Lean: a dedicated,
   schema-validated file beside it, coordinated with the planned config-storage work.
7. **Gate-coverage audit.** The draft previously scoped an `arc check-gates` audit comparing detected ecosystem
   scripts with configured gates, on four recurrences in this repository. Parity by construction (D9) removes the
   local / CI drift those recurrences were; what remains is a check neither runs. Lean: route out as a provisional
   follow-on stub.
8. **Tool versions in the key.** No stack-agnostic way to read tool versions; lockfiles and tool configuration as
   global inputs cover most of it. Confirm that suffices.
9. **Last-known-good base.** The merge base with the base branch may itself be unverified locally; CI learns verified
   trees from the host's checks API (`classify-change.sh`), which a stack-agnostic verb cannot assume. Decide whether
   selection needs a stronger anchor than the merge base, and where it would come from.

## Storage boundary

The scope edge against the `state-storage` program (register in `cohort-state-storage.md`):

- **Survives:** the verb, the declaration, selection, and the machine-local reuse record (machine-local state stays
  local), provided results remain an execution shortcut and the Candidate's verification evidence stays a free
  string; local / CI parity from one declaration; the routine gate steps in `process-task-loop`, `verify-work-unit`,
  `run-errand`, and `self-review` (the cutover rewrites those files' commit steps, so the cost is merge conflicts
  only); code checks at commit.
- **Leave alone:** gate steps in the correction paths of `integrate-work-unit` and `prepare-work-unit`, and
  `deliver-stack` (seam and held delivery territory) — vocabulary only, no mechanics.
- **Out:** any new Markdown gate over `.arc/` state (projected state drops out of lint); hook checks over planning
  artifacts; a pre-handoff hook and notes-consistency check. The register row naming this work unit (commit-time
  checks over artifacts that will no longer be committed, and a git-notes check) is discharged by dropping both.

## Scope boundary (Won't Do)

- Knowledge-base content checks (cross-references, anchors, forbidden patterns) — `knowledge-lint`'s charter. The
  verb dispatches `arc lint` like any declared check.
- Changing the shipped hook script format or the hook-manager integration (ADR-014).
- Rewriting or consolidating the 20 structural CHECKs.
- Tech-stack defaults or lint-tool opinions in shipped content.
- A local hook for the `integration-gate` — CI and review own it.
- Harness-specific edit-hook wiring. Any harness hook can call the verb; examples go to the docs site.
- A warm-watcher feedback layer (`tsc --watch`, `test:watch` kept running across a session) — out of scope, not
  rejected; it carries its own lifecycle, staleness, and portability problems and becomes its own work unit if pursued.
- Push cadence and interlock or ratchet policy — they decide when steps fire; this work defines what a fire runs.
- New checks for this repository (they route out).

## Coordination

- **`markdown-formatting`** (shipped) — owns `lint:md:staged` and MD060 table alignment, and handed commit-time
  auto-fix plus restage back here: D7 takes it.
- **`test-suite-reliability`** (active) — changes CI sharding, `classify-change.sh`'s heavy-check list, and test
  budgets. This work's CI edits (D9, D11) wait for it to land; it makes each run cheaper, this makes there be fewer.
- **`knowledge-lint`** (planned) — receives the two citation and anchor checks from the buffer.
- **`inbound-routing-method`** (planning) — this triage is the first live test of its routing rule; what was hard to
  place goes to it as evidence.
- **`storage-seam`** / **`storage-cutover`** — the storage-tied buffer entries go to them as holds.

## Boundary fit

Stays one work unit. The four surfaces — declaration, verb, selection, and reuse; hook dispatch; fire-site and
knowledge consolidation; first-consumer adoption — are one design, and each depends on the first. They are review
chunks within one delivery, not separate deliverables: the fire-site rewrite is what makes the vocabulary rename
nearly free, so the earlier hooks-versus-vocabulary split would edit the same lines twice.

## Scope estimate

`Heavy`, larger than the earlier "days to a week":

- declaration, schema, and validation: 1–2 days;
- the verb — selection, reuse record, runner, output, remedies: 3–5 days;
- hook dispatch, both copies, and hook-manager paths: 1–2 days;
- fire-site consolidation and the vocabulary sweep (19 package files name the tiers today): 2–3 days;
- knowledge placement and the recipe check: about 1 day;
- initial-setup bootstrap: about 1 day;
- first-consumer adoption and CI parity: 1–2 days.

The mechanics slice (declaration through hooks) is roughly 5–9 days; whether it takes an implementation slot beside
the storage program's Stage 2 is decided at activation.

## Buffer triage

The 30 routed-in entries were triaged on 2026-10-07 against `c009ab198`, each verdict spot-checked against the tree.
Full entry text is in this draft at `7ea9addfa`. Route-outs execute at draft close as `USER-INBOX` captures through
`arc-inbox`, each with `WU_Target` and `_Shapes:_`; no sibling artifact is edited from this branch.

**Folded into the body (6):**

- _Give ceremonies a CLI-resolved gate invocation_ → D3.
- _Keep local Tier 3 commands in parity with required CI gates_ → D9.
- _Close the two-copy sync blind spot in gate selection_ → D4 and D11.
- _Reassess message-only content-gate caching_ → D5.
- _Close the add → format → re-stage loop_ (with the auto-fix residual of _Markdown-formatting enforcement_) → D7.
- _Reconcile ownership after repository Markdown enforcement ships_ → § Coordination and D7.

**Dismissed — resolved elsewhere (5):**

- _Distinguish raw Git rename/copy statuses_ — fixed by `fcd311a85`. Residual: no test pins the exemption (Errand).
- _The worktree Markdown gate cannot see untracked files_ — fixed by `df272224c`.
- _Pre-commit hook runs no markdownlint_ — `markdown-formatting` put `lint:md:staged` in `.husky/pre-commit`.
- _Markdown-formatting enforcement_ — MD060 table alignment runs in `lint:md`; emoji was a non-goal there.
- _Prevent unrelated large blobs from crashing pre-commit validators_ — `872b1e8e0` deleted the validator. Residual:
  `validate-meta-spec.ts`, `remedy-roadmap-conflict.ts`, and `assert-roadmap-regenerated.ts` use a local 32 MiB
  limit instead of `MAX_GIT_OUTPUT_BYTES` (Errand).

**Storage-tied — hold for the storage owners (5):**

- _Lock a completed task's identifier_ — task lists become store records.
- _Guard or migrate dev-repo-only `npx tsx` hook delegations_ — most of those checks retire at cutover.
- _Validate commit-message ranges in CI_ — the footer grammar changes under `ghost-mode`.
- _Config-gated TTY-confirm escalation for the force-push advisory_ — `history-policy`.
- _Flat `active/` layout is unguarded_ — the projection supersedes the layout; likely dismissed there.

**Another work unit's charter (7):**

- _Add a checker that resolves Markdown `§` citations_ and _Resolve cross-file Markdown anchors_ → `knowledge-lint`.
- _E2E-coverage and seam-assertion guards for destructive lifecycle verbs_ → the testing domain;
  `testing-guidance-apparatus` has shipped, so it needs a new home (Work Unit capture).
- The four test-cost entries (pre-change baseline, warm-run practice, machine-readable result, hosted CI fallback
  budget) → Errands or a `test-suite-reliability` follow-up; the hosted-fallback entry's named target does not exist.

**Errand-shaped (7):** fail closed on an unprovisioned hooks path in hand-made worktrees; false green on an excluded
lint path; runtime examples versus meta-project references in code; integrity verification for mode-scoped installs;
an exported-surface TSDoc lint rule; an actionlint gate; whether cognitive complexity replaces the cyclomatic limit.
The changed-file Markdown under-wrap detector prototype (calibration data at `7ea9addfa`) joins them as a new check.
