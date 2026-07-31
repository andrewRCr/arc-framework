# Draft: Quality Gate Tiers and Hook Integration

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Reconcile ownership after repository Markdown enforcement ships**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-21); captured during
  `markdown-formatting` task generation.
- _Concern:_ `markdown-formatting` now owns Markdown-table CI plus the exact-index, check-only pre-commit runner.
  Older table, emphasis, emoji, and commit-time auto-fix scope here would duplicate or contradict that substrate.
- _Fold-in:_ remove superseded Markdown-specific ownership while retaining generalized gate dispatch, pre-push and
  tier orchestration, and future index-safe auto-fix/restage machinery. Consume the shipped exact-index runner.

### `[ ]` **Fail closed when a worktree's hooks path is unprovisioned**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-21); captured after a hand-created worktree
  silently bypassed every hook because its gitignored `.husky/_` directory was absent.
- _Concern:_ `core.hooksPath` can point at a nonexistent generated directory, and Git then commits without any
  warning or quality gate. The hazard grows with parallel worktree use.
- _Approach:_ evaluate provisioning hooks during worktree creation and a fail-closed detection path that also
  catches manually created worktrees; pin the selected composition with tests.
- _Fold-in (2026-07-27 drain):_ a second entry path is `arc errand open`, which occupies **in place** with no
  spawn path — so `worktree.post_create` has nothing to hang off for errands even when an errand wants its own
  checkout. Provisioning today is work-unit-spawn-scoped. Decide whether `arc errand open` should gain a
  spawn-and-provision path (design fork; multi-step). The **cheap resolve-and-warn/fail when hooksPath is
  missing** guard was split to an execute-now errand at the same drain and may land ahead of this design work.

### `[ ]` **A lint run over an excluded or untracked path reports a false green**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-27); captured during
  `review-protocol-alignment` handoff and `integration-boundary-accuracy` create-spec.
- _Concern:_ two false-green shapes. (1) `WORKING-MEMORY.md` / `USER-INBOX.md` are excluded by glob;
  `lint:md` / `format:tables` against those paths report `0 file(s)` and exit zero — indistinguishable from a
  clean pass. (2) A newly authored **untracked** `spec-*.md` linted clean under `npm run -s lint:md` while the
  run scanned ~1200 tracked files and silently omitted the path under edit; staging then surfaced 55 real
  errors. A zero-match guard would not catch (2).
- _Approach fork:_ the generalizing fix is closer to "state what was covered, or fail closed when a
  gate-eligible path went unchecked" than to declining on zero matches alone. Mechanism (git-aware file list)
  is inferred from behavior, not yet verified in config.
- _Fold-in:_ settle which defect is being fixed before touching `.markdownlint-cli2.jsonc` and the
  `lint:md` / `lint:md:staged` / `format:tables` scripts — load-bearing primary quality-gate tooling; likely
  reviewed lane.

### `[ ]` **Distinguish raw Git rename/copy statuses from planning references**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-20); captured during
  `classify-change-granularity` execution.
- _Concern:_ the pre-commit meta-project-reference check rejects literal `R100` and `C100` fixtures even though
  they are canonical raw Git rename/copy statuses. Production-adjacent tests must currently obscure valid domain
  tokens to pass the check.
- _Approach:_ narrow the matcher using surrounding planning-reference grammar or exempt exact raw-diff status tokens,
  while retaining regression coverage for genuine requirement and planning references.

### `[ ]` **Prevent unrelated large blobs from crashing pre-commit validators**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-20); captured during a base reconcile for
  `session-locus-model`.
- _Concern:_ `validate-decompose-record.ts` reads parent-side content for every staged path with a 10 MB child-process
  buffer. A merge deleting an unrelated ~60 MB blob therefore raised `ERR_CHILD_PROCESS_STDIO_MAXBUFFER` and killed
  the whole pre-commit chain, even though the validator had no stake in that file.
- _Approach:_ scope reads to the retirement receipt and declared operation paths; size-check required blobs before
  buffering; reuse the shared Git-output limit rather than a local literal; and cover a simulated merge with a large
  unrelated deletion. Generalize the guard to other pre-commit validators that buffer staged blobs.

### `[ ]` **Distinguish runtime examples from meta-project references in code**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-15); captured during
  `commit-message-submission` integration preflight.
- _Concern:_ the production-code meta-reference guard rejects legal runtime `Context:` footer examples because
  their filenames resemble planning-artifact references. User-facing diagnostics and validation fixtures need to
  show canonical inputs without weakening the prohibition on comments or identifiers coupled to planning state.
- _Approach:_ define and test a semantic boundary that permits executable string data, diagnostics, and fixtures
  while preserving the guard against durable code-to-planning coupling.

### `[ ]` **Make integrity verification accurate for mode-scoped installs**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-15); captured during
  `commit-message-submission` CodeRabbit review fixes.
- _Concern:_ the installed integrity verifier reports eight false failures in a fresh `pm.mode=none` project: it
  requires mode-excluded strategies and still checks the retired `3_process-task-loop.md` path.
- _Approach:_ derive structural expectations from the installed manifest and active PM mode, update renamed
  workflow paths, and add fresh-install fixtures whose complete integrity result is clean in every supported mode.

### `[ ]` **Guard or migrate dev-repo-only `npx tsx` hook delegations**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `commit-message-submission` draft grooming.
- _Concern:_ shipped pre-commit checks invoke `npx tsx packages/arc-framework/src/scripts/validate-*.ts` without
  a self-hosting guard. A project staging matching adopter-editable paths can trip a nonexistent source script
  and dependency rather than receive a validation result.
- _Approach:_ guard genuinely dev-repo-only checks when the source path is absent; migrate project-relevant checks
  to the installed-CLI delegation pattern established by `commit-message-submission`. Triage per check because
  packaging a validator as a CLI surface is a different decision from skipping a self-hosting-only assertion.

### `[ ]` **Validate commit-message ranges in CI**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured during
  `commit-message-submission` design review.
- _Concern:_ commit-message validation is client-side only. Once the canonical TypeScript validator ships, CI
  should consume the same module across the PR range rather than duplicate the Bash grammar.
- _Approach:_ add an installed-CLI CI gate after `commit-message-submission`; settle whether every commit or the
  PR title is authoritative under the repository's merge method, and preserve a defined degraded posture for CI
  checkouts.

### `[ ]` **Reassess message-only content-gate caching after preflight field data**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured at
  `commit-message-submission` create-spec scope settlement.
- _Concern:_ editor and passthrough commit paths can repay the full pre-commit gate after only the message fails.
  The residual value is unknown until wrapper preflight ships, while an incomplete cache key could let a broken
  staged tree commit.
- _Approach:_ pursue only if post-preflight evidence shows material retry cost. Any cache must fail closed and key
  every correctness input, including staged tree, HEAD, hook/config implementation, and consumed worktree state.

### `[ ]` **Markdown-formatting enforcement: table-align auto-fix + emphasis/emoji rules at commit-gate**

- _Routed from:_ the `markdown-formatting` WU (`../markdown-formatting/draft-markdown-formatting.md`),
  2026-06-05. That WU owns the markdown _content hygiene_ (adopting `markdown-table-formatter`, the
  emphasis MD049/MD050 convention, the emoji-ban rule, one-time sweeps); **this entry is the
  _enforcement_ half it routes here** — the user's explicit (b)+(c) routing.
- _Concern:_ once `markdown-formatting` lands the fix-commands + lint rules, nothing auto-enforces them.
  Table alignment in particular is _not_ gated by `lint:md` today (verified: `MD060` enforces per-file style
  consistency, not width-alignment in general), so it needs an explicit gate.
- _Update (2026-06-10):_ `decomposition-machinery` planning exposed a stricter enforcement-fidelity gap: the
  pre-commit markdown check reported pass while standalone `npx markdownlint-cli2` flagged an MD049
  emphasis-style violation in `draft-operational-state-docs.md`. This entry now includes verifying that the
  commit gate runs the same canonical `lint:md` coverage / config as CI, not a reduced or stale subset. That
  directly challenges the assumption below that emphasis rules already ride `lint:md` automatically at the
  commit gate.
- _Proposed (maps onto this WU's existing scope):_ (b) **CI gate** — add `npm run -s format:tables:check`
  as a `ci.yml` step beside `lint:md`; (c) **pre-commit auto-fix dispatch** — run `format:tables` (auto-fix)
  on staged markdown in the commit-gate Tier-1 dispatch with **auto-restage** (exactly this WU's
  "Pre-commit tier 1 dispatch" + "this repo's own adoption as dogfood" scope). The emoji-ban + emphasis
  rules ride `lint:md` automatically (markdownlint config), so they need no separate gate beyond `lint:md`
  already being in CI. Doing (b)/(c) **before** the auto-fix hook exists would just produce CI failures
  contributors hand-fix — so this lands _after_ `markdown-formatting` ships its fix-side.
- _Scope:_ S — composes this WU's commit-gate dispatch with one more auto-fix command + one CI step.
- _Coordinates with:_ `markdown-formatting` (owns the fix-commands/rules; this owns the gate wiring).

### `[ ]` **Config-gated TTY-confirm escalation for the force-push advisory hook**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: TBD`), housekeep drain (2026-06-12); captured during
  `merge-safety-mechanism` Task 2.3 while deciding the force-push hook's detection behavior.
- _Concern:_ `merge-safety-mechanism` shipped the force-push pre-push hook as advisory-only: it warns and exits 0
  when a pushed ref would overwrite a non-ancestor remote tip. A pre-push hook fires before data reaches the remote,
  so it could offer a real abort window, but confirm-by-default would be high-friction and risks breaking GUI or
  non-TTY clients.
- _Proposed:_ add an opt-in config axis such as `push.force_confirm: warn|confirm`, defaulting to `warn`. Under
  `confirm`, prompt `[y/N]` only on a TTY before the risky push, with a robust non-interactive
  proceed-with-warning fallback so CI and agent pushes never hang. Because the hook cannot reliably know whether a
  branch is shared, tighten the trigger if possible or document that routine solo rebase-pushes can still warn.
- _Coordination:_ this is follow-up mechanism/config work after the completed `merge-safety-mechanism` advisory
  default, not a change to ADR-025's default advisory stance. Touch points include the canonical and package hook
  copies, config schema/defaults/validation, tests, and docs.

### `[ ]` **Enforce the exported-surface TSDoc policy with a scoped lint rule**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: quality-gate-hooks`), housekeep drain (2026-06-18);
  captured during `planning-pipeline-readiness` PR #111 review — CodeRabbit docstring-coverage warning.
- _Concern:_ `DEV-RULES.PROJECT` already requires TSDoc on the exported API surface (`@param`/`@returns` on
  exports + a file-level module doc), but nothing enforces it mechanically. CodeRabbit's repo-wide "Docstring
  Coverage 59.46% < 80%" warning measures all functions (including trivial internal helpers) against its own bar
  — over-reaching vs. the policy, and noisy if chased directly.
- _Proposed:_ add a Tier-1 lint rule scoped to the exported surface (e.g. `eslint-plugin-jsdoc`'s `require-jsdoc`
  with `publicOnly`) so the existing policy is enforced at the right altitude, rather than adopting CodeRabbit's
  blanket all-functions threshold. Settle the exact rule set + severity at authoring. Sibling of this WU's
  commit-gate dispatch checks.

### `[ ]` **E2E-coverage + seam-assertion guards for destructive lifecycle verbs**

- _Routed from:_ `testing-guidance-apparatus` planning init (2026-06-22) — the enforcement (defense-in-depth)
  half of the `USER-INBOX` testing-standards capture; the salience/loading half is owned by
  `testing-guidance-apparatus` itself.
- _Concern:_ the `decompose@planning` / `park@Planning` self-teardown defect shipped uncaught because the
  integration tests called the verb cores (`runDecompose` / `runPark`) with hand-fed cross-worktree inputs the
  CLI never generates, and there is no E2E tier driving the destructive verbs through the real CLI. Both
  contravene the testing standard (test through public interfaces; E2E = full CLI, no git mocking) — yet nothing
  mechanically enforced it.
- _Approach:_ candidate guards — an E2E-coverage requirement for new lifecycle/destructive verbs; a lint flagging
  integration tests that assert on core call-args instead of CLI-seam outcomes (bypassing the handler's
  run-context resolution). The bug class to make un-bypassable: _a test constructs inputs the production path
  never generates._ Secondary (mechanical) layer — `testing-guidance-apparatus` makes the standard actually-read,
  the primary fix.
- _Captured during:_ `decompose-matrix` Phase 5 teardown investigation (2026-06-21).

### `[ ]` **Add an actionlint workflow-lint gate for `.github/workflows/`**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: quality-gate-hooks`), housekeep drain (2026-07-01);
  captured during `ci-content-aware-depth` Task 2.2.
- _Concern:_ inline `run:` shell in `.github/workflows/ci.yml` (the `classify` weight-axis block, the `merge-ok`
  rollup) is unlinted — `lint:sh` covers only `scripts/*.sh`, and a YAML parse checks well-formedness only. A
  `needs.*` typo currently fails open to heavy with no error.
- _Proposed:_ add a `lint:workflows` script wrapping the actionlint binary (single Go binary) — shellcheck on
  every `run:` block, `${{ }}` / `needs.*` validation, deprecated-runner / matrix checks — wired into the
  pre-commit hook and/or the `quality` CI job. Prefer actionlint over yamllint (style noise, no shell/expression
  coverage). Adoption may surface pre-existing inline-shell issues to fix as part of turning the gate on.

### `[ ]` **Pre-commit hook runs no markdownlint — style rules (MD013 etc.) unenforced until CI**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-07-01); captured during
  `user-save-status-divergence` handoff. Errand-leaning, but carries a design fork → routed here as the
  hook-gate home rather than executed blind.
- _Concern:_ the arc pre-commit hook runs **no markdownlint style pass** (content / structural checks only), so
  MD013 line-length etc. are enforced only by the manual `npm run -s lint:md` gate + CI. Live hit: a 143-char
  meta line passed pre-commit clean, caught only by a standalone `markdownlint-cli2` run. DEV-RULES.PROJECT
  § Quality Gates frames markdown lint as the zero-tolerance pre-commit gate (#1), so hook behavior and the
  stated policy diverge.
- _Proposed (design fork):_ (a) add a scoped `markdownlint-cli2` pass over staged `.md` files to the pre-commit
  hook (catches MD013 at commit time, staged-only); or (b) if CI-only style linting is the intended design
  (commit speed), reconcile the DEV-RULES.PROJECT § Quality Gates wording. Mirror any hook edit to the package
  source per two-copy sync.
- _Files:_ `.arc/system/.internal/githooks/pre-commit` (+ package mirror), `.arc/system/rules/DEV-RULES.PROJECT.md`,
  possibly `package.json` / `.markdownlint-cli2.jsonc`.

### `[ ]` **Keep local Tier 3 commands in parity with required CI gates**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ The documented Tier 3 set in `QUICK-REFERENCE.md` and the project quality-gate method omits the
  ARC-specific lint commands that the required CI workflow runs. The validation-surfaces pre-PR verification
  therefore reported all local gates green while CI immediately rejected two section-sign references through
  `lint:arc:section-refs`. This is a recurring false-green class whenever CI adds or renames a required gate without
  updating the separately enumerated local command set.

- _Approach:_ make the pre-PR/Tier 3 invocation consume one authoritative project gate composition aligned with CI,
  or mechanically assert parity between the two surfaces. Include the complete `lint:arc:*`/ARC-contract family and
  preserve the existing distinction between fast task gates and the full pre-PR suite.

- _Files:_ project quality-gate configuration/method, `QUICK-REFERENCE.md`, `verify-work-unit.md`, root scripts, and
  CI parity tests.

- _Captured during:_ PR #354 CI diagnosis after `cli-validation-surfaces` verification.

### `[ ]` **Flat `active/` layout is unguarded against doc↔code drift**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ nothing asserts that the documented flat `active/` layout matches `meta-reader.ts` (non-recursive
  readdir) and `worktree-scaffold.ts` (flat write). `decomposition-machinery` routed the hook _out_ — it owns the
  cohort-consistency invariant, not the `active/`-layout one, and the check needs code-behavior introspection the
  structural cohort guard does not share. Gap accepted as low-cost: the layout is simple and low-churn, and
  `doc-cascade-sweep` corrects today's drift — a hook only prevents recurrence.

- _Approach:_ a hook asserting the documented layout against both call sites. No action needed beyond awareness when
  touching either file.

- _Captured during:_ `WORKING-MEMORY` prune, 2026-07-25 — its own removal trigger already named this WU as owner.

### `[ ]` **The worktree Markdown gate cannot see untracked files, so new artifacts lint green until staged**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ `npm run -s lint:md` enumerates paths with bare `git ls-files`
  (`lib/markdown/selection.ts:181` — `source === "index" ? ["ls-files", "--cached", "-z"] : ["ls-files", "-z"]`,
  with no `--others`), so it lists **tracked files only**. A newly authored `.md` is therefore invisible to the
  worktree gate until it is first staged. Observed 2026-07-25 while capturing two grooming drafts: `lint:md`
  reported `Summary: 0 error(s)` over **602 files** on a tree that held 604, and the commit then failed
  `lint:md:staged` on **40 MD049 emphasis-style violations** across exactly the two files it had skipped. The file
  count is the only visible tell, and nothing surfaces it — the run reads as a clean full-corpus pass.

- _Why the existing guard does not cover it:_ `lint-markdown.ts` already refuses a false-green "when staged
  Markdown-gate paths still differ in the worktree," but that guard keys on **staged** paths. An untracked file is
  in neither the index nor the tracked worktree set, so no guard fires in either direction. The gap is precisely
  the state every newly authored artifact occupies, and authoring new Markdown artifacts is the single most common
  ARC planning operation.

- _Approach:_ decide whether the worktree selection should include untracked, non-ignored Markdown
  (`git ls-files -z --others --exclude-standard` alongside the tracked set) or whether the gate should instead
  refuse to report clean while untracked Markdown-gate paths exist. The former closes the hole; the latter is
  cheaper and fails loud, matching the existing guard's posture. Either way the fix should make the _count_
  legible, since the discrepancy was recoverable only by noticing 602 against 604. Note `lint:md:file` is unaffected
  (raw `markdownlint-cli2 --no-globs` takes any path), so the documented per-file Tier 1 command is already safe —
  it is the full-corpus run that under-reports.

- _Related:_ sibling to **Keep local Tier 3 commands in parity with required CI gates** in this section — same
  false-green class (a green local gate measuring less than it appears), different mechanism. That entry is about
  the enumerated command set drifting from CI; this one is about a single command's file selection. Filed
  separately rather than folded in, because the fix and the validator differ; drain may still choose to settle them
  together under one authoritative gate composition.

- _Captured during:_ the `review-architecture` grooming session, 2026-07-25 — the drafts for
  `review-protocol-alignment` and `judgment-authority-model` were the files that lint skipped.

### `[ ]` **Close the add → format → re-stage loop for a newly created Markdown artifact**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ authoring a brand-new tracked Markdown artifact costs three staging steps before any gate can pass.
  `npm run format:tables` refuses untracked paths (`markdown.untracked`), so the file must be `git add`ed before it
  can be formatted; the formatter then rewrites the worktree copy, which trips `lint:md`'s fail-closed
  index/worktree drift check and demands a re-stage. Each guard is individually correct — the tracked-path
  requirement keeps the formatter off projections and vendored trees, and the drift check exists so a green
  worktree run cannot hide a dirty index — but composed on a new file they produce a loop with no green state until
  the third step.

- _Approach:_ the fork worth settling is which guard yields. Either the formatter accepts an untracked path that is
  inside the repo and not otherwise excluded (the `markdown.untracked` guard narrows to exclusions rather than to
  tracked-ness), or the drift check learns that a formatter rewrite of an already-staged path is expected and
  re-stages it. The second is the index-safe auto-fix/restage machinery this WU already retains scope for, which is
  why it routes here rather than standing alone.

- _Captured during:_ `judgment-authority-model` drafting, 2026-07-26 — hit while creating
  `notes-judgment-authority-model.md` for the compression enumeration.

### `[ ]` **Add a checker that resolves Markdown `§` citations against real headings**

- _Routed from:_ `USER-INBOX § Errand` (reclassified multi-step at drain), housekeep drain (2026-07-28); captured
  during `judgment-authority-model` create-spec adversarial pass two.
- _Concern:_ Nothing validates inbound `§` citations. `lint:arc:section-refs` enforces the opposite rule (no `§` in
  code). ~45 live citation sites across workflows/methods/strategies can silently orphan on heading rename.
  Design forks: file-qualified vs bare same-file citations, dual package/`.arc` Framework copies, incidental prose
  `§` false positives. Sibling of existing `audit-*.ts` / `lint:arc:*` family.
- _Fold-in:_ fourth ARC contract check + possible rename of existing `lint:arc:section-refs` for disambiguation.

### `[ ]` **Resolve cross-file Markdown anchors in the section-reference audit**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: quality-gate-hooks`), housekeep drain
  (2026-07-30); captured during `judgment-authority-model` Task 4.3.
- _Concern:_ `lint:arc:section-refs` passes a `file.md#anchor` link whose referenced heading does not exist.
  This is the silent-break class produced when procedure moves across the workflow/CLI seam.
- _Fold-in:_ resolve cross-file targets against headings in the referenced file. Settle Markdown slug rules and
  generated or conditional sections before failing closed, coordinated with the existing inbound checker for
  prose `§` citations.

---

## Problem / Motivation

ARC's tiered quality gate system — Tier 1 (per-task), Tier 2 (coherent unit), Tier 3 (pre-PR) — is
workflow-oriented: it tells developers/agents _when in their flow_ to run which checks. The methodology
is sound, but the execution model has two gaps:

**1. No automatic enforcement at commit/push stages.** Pre-commit hooks at `.arc/system/.internal/githooks/pre-commit`
enforce structural properties (commit format, context footer, task staging, frontmatter validation, etc. —
14 CHECKs as of 2026-04-24). They do NOT run the adopter's linters or tests. The assumption has been that
agent/developer discipline plus CI is sufficient. In practice this creates a gap: a commit landed on
2026-04-24 with known-deferred markdown lint errors that Tier 2 would have caught, but Tier 2 hadn't run
because the task wasn't "coherent unit" complete yet. CI went red; the agent committed through the
discipline window. This is the kind of preventable failure that hooks exist to prevent.

**2. Tier semantics don't map explicitly to standard git hook stages.** External research (completed
2026-04-24) confirmed the universal idiom: pre-commit (fast, staged files only) → pre-push (full local)
→ CI. ARC's tiers correspond naturally — Tier 1 ↔ pre-commit, Tier 2 ↔ pre-push, Tier 3 ↔ CI — but this
alignment is nowhere expressed in the methodology, so adopters can't take advantage of auto-enforcement
without inventing their own mapping. A pre-push stage **does** ship
(`system/.internal/githooks/pre-push`, from `merge-safety-mechanism`) but is scoped to force-push
advisory only — so the work is extending a registered stage, not standing one up, and its hook-manager
integration is already solved.

**3. There is no continuous-feedback layer, and the milestone cadence is standing in for one.**
_(2026-07-25.)_ The universal idiom has two layers, not one: _continuous_ feedback (editor/LSP — free,
per-keystroke, informational) and _event-triggered_ enforcement (commit / push / CI — blocking).
Industry has **no milestone cadence at all**, because it doesn't need one. ARC has no editor, so the
agent gets no ambient signal — and ARC invented a per-increment cadence to substitute.

That reframes the per-increment gate as a **prosthetic for a missing editor**, with two consequences.
For cheap static checks it is _coarser_ than the human baseline (a developer gets lint and types per
keystroke; the agent gets them per task), so the cadence was never the defect. The defect is firing a
**fixed block of mixed-cost checks** at one cadence: measured at 2026-07-25, the documented Tier 1
cost ~47s and ran three full-project scans against changes that frequently could not reach them —
64 of 200 sampled commits were Markdown-only. Targeting the same coverage brought it to ~1s.

**4. Feedback and enforcement are collapsed into one bar.** The zero-tolerance policy applies
uniformly across all three tiers, but Tier 1's job is _feedback_ ("did I break what I just wrote?")
while Tier 3's is _enforcement_ ("this may not merge broken"). Treating an informational layer as a
blocking gate is why a trivial defect reads as a gate failure. It also explains the measured
convergence below: **Tier 2 had no distinct job, only a distinct size**, so it drifted to the
enforcement end and became a near-duplicate of Tier 3 (they differ by `build` alone, ~5%).

**Related concerns surfaced during discussion:**

- **Tier vocabulary.** "Tier 1 / 2 / 3" is generic and requires readers to remember the mapping. The
  vocabulary question is more substantive than first framed — see § Relationship to Interlock Model
  Frame and § Alternatives for the kind-vs-gate-vs-cadence distinction surfaced during cross-plan
  alignment work. Three viable paths captured under Alternatives; PRD-time decision.
- **Structural vs. adopter-impl separation.** The line between _what ARC enforces_ (commit format,
  frontmatter schemas, task staging — framework-owned) and _what's adopter-configurable_ (linters, tests,
  typecheck, build — stack-dependent) is fuzzy in current docs. ARC should define the tier abstraction +
  enforcement surfaces + connection points, but never assume a specific tech stack in its shipped
  defaults. Hook-manager integration already handles this at the manager layer (ADR-014: detect and
  integrate with husky / lefthook / pre-commit.com, fall back to `core.hooksPath`); the equivalent
  discipline needs to apply to tier-gate _commands_.

This matters now because:

- Pre-1.0 polish window — the methodology shouldn't ship underspecified on a surface this central.
- Dogfooding (upcoming in the release path) will compound the discipline-window gap for real adopters.
  We want the safety net in place first.
- External research is complete; no blocking unknowns before PRD drafting.

## Relationship to Interlock Model Frame

[ADR-016][adr-016] established configurable autonomy **interlocks** for session-operational flow at
four architectural junctions: task, commit, push, integration (delivered via the Session-Operational
Flow WU, May 2026). This plan and the shipped interlock model share **junction prefixes** (`commit-`,
`push-`, `integration-`) but attach different concerns at each junction:

| Junction    | Autonomy concern (interlock model)    | Validation concern (this plan)             |
| ----------- | ------------------------------------- | ------------------------------------------ |
| commit      | commit-interlock (approval hold)      | commit-gate (deadline for fast checks)     |
| push        | push-interlock (approval hold)        | push-gate (deadline for medium checks)     |
| integration | integration-interlock (approval hold) | integration-gate (deadline for full suite) |

This factoring resolved an earlier proposal where both plans converged on identical "gate" naming.
That convergence collapsed two distinct concepts (validation deadlines vs. approval mechanisms) into
one term. The current factoring keeps them lexically distinct while preserving the architectural
relationship.

Impacts on scope:

- **Pre-handoff hook placement.** The interlock model treats handoff as an orthogonal ceremony, not
  a junction in the linear stack. Hook placement still gains a pre-handoff stage for session-close
  validation (status-file rotation validity, git-notes consistency, worktree cleanliness) —
  attaching as a hook stage on the ceremony, parallel to commit/push/integration gates.
- **Interaction with shipped autonomy modes.** Under the shipped interlock-release cascades
  (`commit_interlock: on-task-approval`, `push_interlock: on-sync`, `sync_interlock: on-handoff`,
  etc.), hook invocation timing changes slightly — hooks fire as part of the cascade rather than as
  standalone gates. The cascade-visibility requirement from ADR-016 means hook output remains visible
  to the user even under cascade modes. Plan needs to confirm hook behavior composes cleanly with
  cascade semantics.
- **Tier-rename framing decoupled from autonomy-vocab alignment.** The original motivation for
  renaming Tier 1/2/3 partly rode on shared "gate" vocabulary with the autonomy plan. With that
  alignment dissolved, the rename's case stands on its own merits — and on inspection, the rename
  is more substantive than originally framed. See § Alternatives for the three viable paths.
- **Integration-gate vs. pr-gate naming.** No longer rides on autonomy-vocab alignment. The case
  for "integration-gate" now stands on lifecycle-ceremony naming (matches `integrate-work-unit`,
  `integrate-planning-branch` workflows) rather than vocabulary mirroring. PR-gate remains a
  platform-specific alternative; current lean stays integration-gate for ceremony-name fit.

Scope impact: roughly unchanged from prior framing. The relationship to the autonomy plan is
clarified rather than expanded; tier-vocabulary work becomes more deliberate rather than larger.

## Scope

### In scope

**Gate model reshape.** Retire Tier 1/2/3 for the two-axis model settled under § Alternatives — **gate**
(deadline: `commit-gate` / `push-gate` / `integration-gate`) × **kind** (feedback vs. enforcement) — with
cost demoted to measured data and selection to a mechanical rule. The rename touches DEV-RULES.ARC,
`strategy-quality-gates.md`, `process-task-loop.md`, `QUICK-REFERENCE.md`, `verify-work-unit.md`,
`integrate-work-unit.md`, `run-errand.md`, `self-review.md`, and scattered tier references throughout the
framework. The path is settled; the PRD sizes the sweep, it does not re-decide it.

**Selection model.** _(New 2026-07-25.)_ Two mechanical conditions governing which checks a given change
must run, both resolving from `git diff --name-only` — never from a judgment call about blast radius:

- **Relevance** — run what the change reaches, deliberately asymmetric: skip the expensive checks a
  change provably cannot affect, and never spend deliberation on the cheap ones. Unmatched or mixed
  paths fail closed to running everything.
- **Unchanged tree** — a completed gate is not re-executed when nothing it covers has changed. Narrows
  repeat runs; never licenses running a gate partially.

Both already exist at this repo's **project layer** (`DEV-RULES.PROJECT` § Selecting what to run, shipped
via PR #355) and were deliberately written vocabulary-neutral so they would not churn through this
rename. This WU lifts them to the framework layer in the settled vocabulary.

**Ordering constraint — selection is a prerequisite for dispatch, not a consequence of it.** The
consolidation criterion below ("mechanical-and-now-hook-covered → remove from workflow") is wrong without
it: `verify-work-unit` Step 1 and `integrate-work-unit` Step 10 run gates _before_ their commits, so a
pre-commit hook does not dedupe those — it adds a fourth run. Shipping hook dispatch without the
unchanged-tree rule makes the WU tail **worse**, not better. Sequence accordingly.

**Pre-push hook as recognized stage.** New `.arc/system/.internal/githooks/pre-push` that dispatches to the
adopter's push-gate commands. Config-gated via `hooks.pre_push` in `arc-config.yml`. Integrates through
the existing hook-manager detection layer (ADR-014) — husky / lefthook / pre-commit.com / fallback all
get the pre-push stage wired up.

**Pre-handoff hook as new stage (interlock-model integration).** Additional hook placement for
handoff ceremony: session-close validation before handoff artifacts are finalized. Config-gated via
`hooks.pre_handoff` (naming TBD at PRD, aligned with the shipped autonomy-axis naming under
`session.*_interlock` in `arc-config.yml`). Complements commit-gate and push-gate checks with
handoff-specific validation — e.g., status-file rotation validity, git-notes consistency, worktree
cleanliness.

**Connection points between tiers and hooks.** Extend the `quality-gate-commands` method with tier
metadata on each command (Option A from decision analysis — tier attached to each command entry, not
split across multiple methods). Hook CHECKs read the method, filter by current stage, and run matching
commands against the appropriate scope (staged files for commit-gate; full repo for push-gate).

**Pre-commit tier 1 dispatch.** New CHECK in the existing pre-commit hook: runs commit-gate commands
on staged files only. Staged-files scoping follows universal idiom (`git diff --cached --name-only
--diff-filter=ACM | grep ext`). Auto-fix where supported (e.g., `markdownlint-cli2 --fix`,
`eslint --fix`); auto-re-stage fixed files (aligned with husky + lint-staged default behavior and
research recommendation). The current `--no-verify` prohibition in DEV-RULES.ARC stays unchanged.

**Bootstrap during initial-setup.** Add a step to `.arc/system/workflows/arc/initial-setup/` (exact
placement TBD at PRD) that prompts the adopter to configure their gate commands per tier. ARC ships
no tech-stack defaults in the method — the adopter declares what runs at each gate for their stack,
once, at setup time. Examples for common stacks go to the docs site, not into the shipped method.

**Explicit structural-vs-adopter-impl separation.** Add or extend a section (likely in
strategy-quality-gates.md) naming the distinction. ARC enforces structural checks (14 current CHECKs +
new gate-dispatch CHECKs for 2 stages); adopters configure tier commands via the method. Hook-manager
choice (husky, lefthook, pre-commit.com, fallback) is adopter-impl, already handled via ADR-014.

**Docs routing for common-stack examples.** JS/TS (husky + lint-staged wiring), Rust (cargo fmt/clippy),
Go (gofmt + golangci-lint), Python (pre-commit.com) — route to `notes-docs-content-sweep.md` for
eventual docs-site placement. Not live framework reference docs; those stay stack-agnostic.

**This repo's own adoption as dogfood.** After the framework-level dispatch shape lands, wire this
repo into it in the same WU as a final validation phase. Mechanical configuration: install
`lint-staged`; replace the `scripts/check-ts-quality.sh` stopgap with commit-gate dispatch through the
new method shape; configure staged-file Markdown, TypeScript, and shell checks in the repo-local
hook path. This is not a shipped ARC default and does not select a stack for adopters — it validates
that the adopter-configurable path works on ARC's own JS/TS stack.

**Changed-file Markdown under-wrap detector as repo dogfood.** Include this repo's custom under-wrap
detector in the same dogfood phase, but only as a staged/changed-file commit-gate check. Do not register
it as a normal repo-wide markdownlint rule yet; current repository history has too much existing
under-wrap debt for global blocking enforcement to be useful.

Prototype result from 2026-05-11:

- Implementation shape: markdownlint custom rule using the `markdownit` parser, inspecting
  `paragraph_open` token maps against `params.lines`. For each non-final physical line in a multi-line
  paragraph, flag only when `line.length < min`, the first word of the next line exists, and joining
  that first word would stay within the 120-char target.
- Initial defaults: `min=75`, `max=120`, blockquotes skipped, lint-only/no auto-fix. Skip hard breaks,
  reference definitions, table-like pipe rows, structural field clusters (`**Field:**` lines), and
  standalone bold labels (`**Task level:**`) to avoid ARC-specific false positives.
- Calibration against representative ARC artifacts: `min=70` found 52 candidates, `min=75` found 81,
  and `min=80` found 162 across active/workflow/strategy/template/archive samples. `min=75` gave the
  best first-pass signal.
- Current-core samples at `min=75`: 18 candidates across task-list/workflow/DEV-RULES/WOR files; work
  organization docs produced 16 more, while `docs/reference/task-lists.md` and `session-handoff.md`
  produced zero.
- Full current markdownlint scope at `min=75`: 458 candidates across 221 files. This confirms the
  rule should be changed-file-only until a cleanup/baseline strategy exists.

**Gate-coverage drift detection.** Configured gate commands drift over time as projects add new scripts —
additional typecheck variants (production vs. test tsconfig), evolving lint surfaces, separate test tiers.
Initial-setup captures the configured set at one moment; nothing re-checks coverage as the project grows.
Promoted to a first-class deliverable based on four confirmed recurrences in this repo's self-hosting
codebase (2026-04-23 eslint+typecheck, 2026-05-05 `typecheck:test` not wired locally, 2026-05-06
`typecheck:test` on test-mock signature, 2026-05-08 audit-log fixture used a stale `NotesPushPolicy`
literal — caught by `typecheck:test` but missed by the project-default `typecheck` script) — the pattern
is real, not hypothetical. Deliverable: an
`arc check-gates` audit that compares detected ecosystem scripts (npm `package.json` scripts; equivalents
for other ecosystems) against configured gate commands and flags omissions. Re-runnable any time;
initial-setup invokes it implicitly. PRD finalizes cross-ecosystem detection heuristics and the
false-positive boundary (which detected scripts are gate-relevant vs. not).

**Audit and consolidate workflow-embedded quality-gate triggers.** Before PRD, sweep
`.arc/system/workflows/**` for quality-gate steps embedded in workflow prose — don't trust any existing
inventory. Catalog each (workflow + step + gate type + scope) and decide per item whether the new
dispatch model subsumes it. Consolidation criterion: mechanical-and-now-hook-covered → remove from
workflow; human-judgment-gated or scope-the-hook-can't-see → keep in workflow. Known triggers as of this
WU: `session-handoff.md` step 3's status-file markdown lint substep (added as stopgap during
user-sync-ux); `3_process-task-loop.md`'s Tier 1 / Tier 2 invocations; `verify-work-unit.md`'s Tier 3
invocation. The catalog likely surfaces more. Repo-local dogfood consumers in this plan are the
lint-staged adoption migration and the custom under-wrap markdownlint prototype as a changed-file-only
commit-gate check. They validate the framework dispatch shape but remain repo-local configuration, not
shipped ARC defaults.

### Out of scope

- Knowledge-base content checks — cross-reference / link validation, forbidden-pattern content rules
  (adopter-language, path-style movable-artifact refs, transitional framing), relocatability link-defs, and
  their one-time sweeps. These are `knowledge-lint`'s charter (settled at its 2026-07-02 grooming; this WU's
  buffer entries for them migrated there). This WU's gate dispatch invokes `arc lint` exactly as it invokes
  the adopter's configured linters — dispatch stays here, check content lives there.
- Switching ARC's shipped hook script format (stays shell-based in `.arc/system/.internal/githooks/`).
  Hook-manager integration is already handled per ADR-014.
- Rewriting or consolidating the existing 14 structural CHECKs. Framework-owned and fine.
- Tech-stack-specific defaults in the shipped method. Configuration at initial-setup is the entry
  point, not shipped defaults.
- Integration-gate auto-enforcement at the hook layer. That gate is CI + human review; no local hook
  equivalent planned. A possible `pre-pr` dispatcher can come later if demand emerges.
- Lint tool selection opinions. ARC doesn't pick between markdownlint and prettier for adopters.
- **Continuous-feedback layer (the watcher direction).** _(Recorded 2026-07-25 — out of scope, not
  rejected.)_ § Problem gap 3 establishes that the milestone cadence is a prosthetic for the editor
  feedback loop an agent lacks. That loop is arguably _closable_ rather than compensable: `test:watch`
  already exists, `tsc --watch` exists, and agent harnesses run background processes — a warm watcher
  gives incremental typecheck in ~100ms against 4.2s cold. Held out because it roughly doubles this WU,
  nothing else here depends on it, and it carries unsolved problems of its own (process lifecycle across
  sessions, output consumption, staleness detection, cross-harness portability). **Disposition:** if
  pursued, it splits out as its own WU rather than joining this one — mint a `backlog/provisional/` stub
  at that point. Recorded here so the direction is not lost by silence: if row 1 is closable, the
  milestone cadence is a workaround with a shelf life, which bears on how much machinery this WU should
  invest in it.

## Alternatives

**Tier vocabulary:**

Background: traditional SWE practice (external research, 2026-04-28) treats three concepts as
conceptually orthogonal even when they correlate in convention:

- **Kind / cost class** — inherent expensiveness of a check (cheap-fast lint/types vs. medium unit
  tests vs. heavy integration/e2e). Property of the check itself.
- **Gate / deadline** — the must-pass-by point. "Push-gate" universally reads as "must have passed
  before push," not "runs at push." Industry convention (Google SWE book, Zuul, CI/CD literature).
- **Cadence** — opportunistic schedule for when checks fire (on-save, on-commit-attempt,
  on-coherent-unit, etc.). Separate from the gate enforcement.

Today's "Tier 1/2/3 = per-task / per-coherent-unit / pre-PR" bundles all three into one tier name.
The original "rename to commit-gate/push-gate/pr-gate" framing collapsed kind+cadence into gate
naming — closer to a category change than a naming swap. Three viable paths:

- **A — Gate-only.** Replace Tier 1/2/3 with `commit-gate / push-gate / integration-gate` (deadline
  semantic). Cost-class and cadence become advisory convention documented per gate. Self-documenting,
  idiomatic, aligns with git hook stages. Downside: drops the explicit kind framing the tiers
  currently provide.
- **B — Orthogonal axes.** Factor kind and gate as separate vocabulary. Drop tier
  numbers; keep cost-class concept (rename it — "cheap / medium / heavy" or similar); add gate as
  orthogonal deadline naming. Cadence becomes a third (advisory) axis. Most accurate factoring.
  Highest documentation surface; reader must learn two axes instead of one.
- **C — Status quo cleanup.** Keep Tier 1/2/3 as canonical. Add gate-as-deadline framing as a
  clarifying overlay (every surface documents "Tier 1 must have passed by commit-gate"). Minimal
  churn; tier-numeric ambiguity persists; readers must still learn the mapping.

The earlier-framed Option B (keep numeric, document alignment) collapses into Option C above.
The earlier-framed Option C (hybrid dual-naming) is dominated by Options A or B and is dropped.

**SETTLED (2026-07-25) — B's two-axis shape, A's gate axis, and a different second axis.**
Grooming resolved this against measured evidence rather than deferring it to PRD. Tier 1/2/3 drops
entirely. **Four concepts, but only two are vocabulary:**

| Concept                             | Status                          | Home                                                    |
| ----------------------------------- | ------------------------------- | ------------------------------------------------------- |
| **Gate** (deadline)                 | first-class vocabulary          | `commit-gate` / `push-gate` / `integration-gate`        |
| **Kind** (feedback vs. enforcement) | first-class vocabulary          | workflow fire sites vs. hook/CI gates                   |
| **Cost**                            | measured data, not vocabulary   | the gate-coverage audit measures and surfaces it        |
| **Selection / reach**               | mechanical rule, not vocabulary | path→check mapping + unchanged-tree (§ Selection model) |

Why the second axis is **kind**, not cost-class, and not cadence:

1. **Cost-class is the axis that empirically collapsed.** Tier 3 exceeds Tier 2 by `build` alone
   (~5%). Making cost-class first-class codifies a distinction this project's own instantiation could
   not sustain — and B pays its documentation-surface cost precisely for that axis.
2. **Deadline naming self-enforces where an ordinal does not.** Tier 1 was mandated targeted by the
   strategy and ran full-project scans undetected, because "Tier 1" carries no constraint and the
   constraint lived in prose one document away. A `commit-gate` costing 47s is self-evidently wrong;
   the research's own numbers (<500ms ideal, >10s corrodes) attach to the deadline, not to an ordinal.
3. **Cost is a measurement problem, not a naming one.** `lint:ts 21.4s` strictly dominates "`lint:ts`
   is medium," and cannot silently go stale the way a declared class can. This converts B's second
   axis into a _deliverable_ of the gate-coverage audit rather than vocabulary.
4. **Cadence was the wrong candidate for the second axis.** ARC's fire sites are procedural, not
   opportunistic (industry cadence means on-save / on-type). But naming them "cadence" describes
   _when_ they run, when what actually distinguishes them is _what they are for_ — feedback that
   informs versus enforcement that blocks. Kind subsumes the useful part of cadence and explains the
   Tier 2 collapse; cadence does not.

The feedback/enforcement cut is the same line `judgment-authority-model` draws between
ignorance-guarding rules (yield to demonstrated judgment) and bias-guarding ones (never yield),
reached independently from the other direction — enforcement is bias-guarding, feedback is
ignorance-guarding. Coordinate the wording so the two do not mint separate vocabularies for one cut.

**Pre-push opt-in model:**

- **A — Config-gated smart default (current lean).** `hooks.pre_push: auto | enabled | disabled`.
  `auto` = "enabled if push-gate commands are configured, disabled otherwise." Zero friction for
  adopters without a test suite; auto-wires for those with one.
- **B — Always opt-in.** `hooks.pre_push: enabled | disabled`, default `disabled`. Explicit, no
  surprises, but misses the easy win for mature adopters.
- **C — Always on (when configured).** No config key; pre-push always enabled if push-gate commands
  exist. Surprising for early-stage projects that just added tests and aren't ready for pre-push yet.

**Method dispatch shape:**

- **A — Extend `quality-gate-commands` with stage metadata (current lean).** Each command entry
  includes `stage: commit-gate | push-gate | integration-gate` (or equivalent under chosen tier-
  vocabulary path). Hook filters by stage, runs matching commands. Single method, expressive.
- **B — Separate method per stage.** `commit-gate-commands.md`, `push-gate-commands.md`,
  `integration-gate-commands.md`. More files, less flexible, harder to misconfigure but harder to
  reason about holistically.
- **C — Flat commands + side-channel stage map.** Commands stay flat; a sibling method maps stages
  to command subsets. More indirection, less cohesion.

**Auto-restage behavior on fix:**

- **A — Auto-restage (chosen).** Aligned with research + husky/lint-staged default + user preference.
  Linter fixes get staged automatically; commit proceeds. Fast, agent-friendly.
- **B — Block and report.** Linter fixes happen but commit is blocked; user/agent re-stages
  manually. More explicit, more friction.

## Unknowns and Assumptions

**External research (completed 2026-04-24) validated:**

- Staged-files-only discipline is universal best practice — no significant dissent.
- Pre-commit time target: <500ms ideal, <5s acceptable, >10s corrodes discipline.
- Tier 2 equivalent (full test suite) in pre-commit is a documented anti-pattern — belongs in
  pre-push or CI.
- Agent-friendly hook design: structured errors, auto-fix, idempotent retries. Claude Code has 15
  hook events and documented patterns for agents reacting to hook failures.
- `--no-verify` bypass pressure scales inversely with hook speed and signal density.

No external research blockers remain before PRD drafting.

**Assumptions to validate during PRD:**

- The chosen tier-vocabulary path (A/B/C per § Alternatives) produces net-positive readability
  despite methodology churn. If PRD discovery finds the rework touches >50 files or disrupts
  established mental models, fall back to Path C (status quo cleanup).
- `hooks.pre_push: auto` default works for both early-stage adopters (no tests yet) and mature ones
  (has tests). If beta dogfooding reveals confusion, fall back to explicit opt-in.
- Initial-setup is the right configuration point. If the bootstrap step adds material friction to
  onboarding, consider making it an optional later step.
- Extending `quality-gate-commands` with tier metadata (Option A) stays readable as commands
  accumulate. If the method becomes crowded in practice, revisit splitting.
- Auto-re-stage behavior is safe when combined with ARC's existing structural CHECKs. Needs test
  coverage ensuring re-staged fixes don't re-trigger or loop.
- **`arc check-gates` audit heuristics.** The drift-detection deliverable is now in scope (see § Scope >
  In scope > Gate-coverage drift detection); four recurrences in this repo's self-hosting codebase
  (2026-04-23, 2026-05-05, 2026-05-06, 2026-05-08 — all variants of "test typecheck never wired to local
  enforcement") closed the "is this real?" question. Open at PRD time: cross-ecosystem detection (npm `package.json`
  scripts vs. cargo `Cargo.toml` aliases vs. Make targets vs. justfile recipes), the heuristic for
  classifying detected scripts as gate-relevant vs. not (false-positive surface), and surfacing cadence —
  re-runnable command vs. opportunistic warning at session-init or push-gate dispatch.

## Scope Estimate

**Medium** (days-week).

Rough breakdown:

- Tier-vocabulary rework + doc sweep (Path A or B per § Alternatives; Path C is lighter): 1-2 days.
- Pre-push hook + structural CHECK + two-copy sync: 0.5-1 day.
- Method extension + dispatch logic + tests: 1 day.
- Initial-setup bootstrap workflow edit + tests: 0.5 day.
- `arc check-gates` audit command + cross-ecosystem detection + tests: 1-1.5 days.
- Docs-content-sweep routing entry: 0.25 day.
- Config schema update + CI audit updates: 0.5 day.
- Repo dogfooding: lint-staged wiring, stopgap replacement, and changed-file under-wrap check:
  0.5-1 day.

**Dependencies:**

- **Session-Operational Flow** — shipped May 2026. Interlock-model vocabulary and architectural-junction
  naming are canonical; the `session.*_interlock` config surface in `arc-config.yml` is the
  authoritative reference for `hooks.pre_push` / `hooks.pre_handoff` config shape. Prerequisite met.
- **Session-Init Optimization** — shipped. DEV-RULES.ARC / session-init.md / quality-gate-commands.md
  edits no longer conflict with active audit work. Prerequisite met.
- **ADR-014 (hook-manager detection)** — in place; prerequisite met.
- User Sync UX Polish landing first is preferred — both are pre-1.0 polish; reduces overlap on shared
  adopter-facing surfaces (`arc-config.yml`, DEV-RULES, `arc status`).
- Worktree Foundation landing first is preferred — session-init orientation and worktree-mechanism
  surfaces overlap with surfaces this WU also touches. Clean separation.
- Agile WU Lifecycle landing first — gate-tier mapping per WU tier is a PRD input for this plan; the
  tier model needs to canonicalize before tier-vocabulary rework lands.
- Landing before ARCd Rebrand means rebrand picks up the new tier vocabulary in its bulk rename
  pass, avoiding double-churn (same argument as User Sync UX Polish).

**Scheduling:** After Worktree Foundation and Agile WU Lifecycle. Before ARCd Rebrand. Pre-1.0 polish
window.

**Pre-approved split at PRD-drafting time:** If the chosen tier-vocabulary rework (Path A or B per
§ Alternatives) proves to touch more surface than anticipated, split into:

- WU-A: Hook integration only (new pre-push hook, method dispatch, bootstrap, repo dogfooding).
  Low-churn, architectural.
- WU-B: Tier-vocabulary rework across all surfaces. Editorial, mostly find-and-replace with
  contextual review.

Both halves are independently valuable. Keep unified if the rework stays manageable.

---

[adr-016]: ../../../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
