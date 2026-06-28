# Spec (`outline`): lifecycle-ux-polish

- **Origin:** [internal] — assembled at the 2026-06-27 housekeep drain from a cluster of session- and
  work-unit-lifecycle rough edges that surfaced across recent work units and errands.

- **Purpose:** Smooth the lifecycle's operational rough edges — handoff noise, init/notes state-honesty,
  errand- and activate-ceremony robustness, session-entry shortcuts, and commit-path friction —
  shipped as one coherent, reviewable cleanup unit. Several directly reduce friction for the imminent
  parallel-sessions push.

---

## Problem / Context

Recent work units and errands surfaced a cluster of small, determinate friction points across the session and
work-unit lifecycle. Each is a known rough edge with a settled fix; none individually warrants its own work
unit. Left scattered, they collect in the inbound buffers of heavier work units they don't belong to, or rot
as un-actioned captures. Assembled together they form one coherent cleanup with a single review surface.

The cluster splits into two lobes by the surface it touches:

- **Workflow / doc lobe** — markdown edits to `session-handoff` / `session-init`, a session-entry signal, and
  always-loaded commit-path guidance in `AGENT-BRIEF.ARC` / `DEV-RULES.ARC` (facets 1, 3, 4, 7). Markdown-only
  — no code, no tests, so it can land first on its own.
- **Code / script lobe** — the `session-handoff` probe's notes/disk-drift surface plus two robustness fixes
  touching `arc errand close` reap logic and the shared `lib/git` foreign-artifact overlap primitive (facets
  2, 5, 6; all with tests). The overlap primitive is shared by `arc activate`'s foreign-write check and
  `arc errand check`, so it carries the widest blast radius.

The work exists now because the parallel-sessions push is imminent: handoff cleanliness, errand-close
robustness, and the `--next` / `--start` entry shortcuts each directly smooth running multiple sessions.

## Decision(s)

**1. Remove the handoff housekeep offer entirely.** `session-handoff` will no longer offer a between-WUs
housekeep drain (its Compose-Handoff step-3 offer and the Confirm-Handoff `**Housekeep:**` advisory line are
removed, along with the now-dead `inboxState` row in `session-handoff`'s probe-consumption table). The offer is
noise at end-of-session: handoff should be a single turn, and its only gate is `housekeepNeeded` (not
between-WUs), so it can fire mid-WU where the drain can't even run (the drain needs a base-branch write
context). The nudge already lives at the right moment — `session-init`'s Orient arm, at session start, low
context, base context available. The shared `arc status` `inboxState` field and the `session-init` Orient
soft-offer are untouched.

**2. Mirror the notes/disk-drift surface onto the `session-handoff` probe's `user` slot.** The handoff probe's
`user` slot reports ref-vs-remote topology only, so a handoff can report notes "clean" while the working tree
has unsaved user-notes changes (disk ahead of ref). `session-init` already carries the parallel disk-vs-ref
surface (`notesDriftSurface` / `loadNeeded`); the handoff probe gains the equivalent. This is an
observability-symmetry fix, not a data-loss fix — `arc sync` runs `runUserSave` first, so the sync leg already
captures the unsaved edits.

**3. `session-init` sources git facts only from the probe, never from stale SESSION-NOTES prose.** Handoff can
write git-state prose into SESSION-NOTES; the handoff push then changes the real state, leaving the prose
stale, and a later `session-init` can echo the stale note against a live probe and contradict it.
`session-init` will source git facts only from the probe and never from SESSION-NOTES prose.

**4. Add `arc-session --next` and `--start <wu-slug>` — session-entry shortcuts.** Two explicit
per-invocation shortcuts cover distinct lifecycle nouns:

- `--next` means the active work unit's `Next Action`: run full `session-init`, then skip the "proceed to Next
  Action?" gate and begin the active meta's Next Action directly.
- `--start <wu-slug>` means the work-unit start transition: on the no-active-WU Orient arm, bypass discovery and
  the confirm-only init offer for the named backlog work unit, then hand off to the existing `arc start
  <wu-slug>` / `init-work-unit` path.

Bounded by design:

- **Conditional auto-proceed** — proceed only when orientation would be the bare-clean shape. Any Step 6
  conditional surface (sync state, freshness gap, blockers, uncommitted changes) or Step 7 mismatch falls back
  to the normal prompt. Stop-and-ask always wins.
- **Per-invocation only** — never a config default. A standing auto-proceed would erode the review-increment
  invariant.
- **One step / one transition** — `--next` covers exactly the first Next Action; normal task-interlock resumes
  at the first leaf. `--start` suppresses only `session-init`'s ergonomic discovery/init-confirm prompt; the
  start ceremony's own interlocks and guards still fire.
- **Arm-conditional** — on the Resume arm, `--next` begins the already-scaffolded Next Action. On the
  no-active-WU Orient arm, `--start <wu-slug>` starts the named backlog work unit. Bare `--next` on the no-WU
  arm stays a no-op because discovery is the point; `--start` on an active-WU arm is not a mid-session detour.
- **Names** — `--next` is preferred over `--yes` for active-WU auto-proceed (avoids the `--force`-like "yes to
  everything" connotation). `--start` names the existing `init-work-unit` / `arc start` lifecycle transition,
  rather than overloading `Next Action` with between-WU discovery semantics.

The start shortcut still honors init's own interlocks: it skips only the *ergonomic* friction (discovery + the
confirm-only offer), never init's `workflowCommit` / `workflowPush` interlocks (which fire as normal, or route
via release opt-in as elsewhere).

**5. Harden `arc errand close` against a host-deleted branch.** Merging an errand PR with
`gh pr merge --delete-branch` (the common host-auto-delete flow) deletes the local branch too, and
`arc errand close` then orphans the record: with no branch ref to verify containment the non-`--force` path
refuses, and `--force` — the documented escape — errors on `git branch -D` (branch already gone), leaving the
record in `refs/arc/user/{id}/errands`. The fix:

- **Tolerate an already-absent branch** — make the reap a delete-if-exists, so `--force` always reaches the
  record removal and clears it even with no branch to delete. If symbolic `HEAD` still names the deleted
  branch, switch back to base before cleanup so the worktree is not left attached to a dead branch.
- **Actionable refusal** — when the branch ref is absent, the non-`--force` refusal names `--force` as the
  escape, so the operator isn't left guessing.

No reap-safety auto-fallback is added: the base-containment check already in place (`isLandedInBase`, patch
identity via `git cherry`) already proves merge-commit / fast-forward / rebase / single-squash containment for
a branch-present pruned-upstream merge, and once `--delete-branch` removes the local branch there is no ref —
and no SHA stored in the record — left to check, so a `git merge-base --is-ancestor` fallback could neither
add coverage nor run. `--force` is the right gate when containment is unverifiable. Auto-confirming the common
merge-and-close path without `--force` (by persisting the errand tip SHA in the record) is routed to
`operational-state-docs`, whose richer record model is the natural home for lifecycle-stateful record fields.

**6. Eliminate the `arc activate` foreign-write false-positive.** Every `arc activate` whose planning branch
was pushed emits a spurious "Foreign-owned write" warning at the activation commit. `check-foreign-writes.ts`
derives the in-flight set from local refs (including the still-present remote-tracking `origin/plan/<slug>`,
deleted only at the activate ceremony's last step, after the commit) and self-excludes by **worktree path**,
not WU **slug** — so the WU's own renamed-from `origin/plan/<slug>` (remote-only, no worktree, same
`meta-<slug>.md`) trips the overlap check against its own meta. The fix self-excludes in-flight entries that
share the current WU's slug (the renamed-from `plan/<slug>` is the same WU), now that slug is cheaply
resolvable. Systematic cry-wolf desensitizes operators to real warnings, so removing it protects the warning's
signal value.

**7. Reduce commit-path friction with always-loaded awareness — not duplicated format.** Two recurring
commit-time costs: (i) the release-wrapper interface (`arc release commit` / `push` forward their args to
`git commit` / `push`) is documented nowhere always-loaded, so a session re-probes it before firing a
workflow commit; and (ii) when composing a non-ceremony commit the agent often reconstructs the message
format from recent `git log`, which reveals surface shape ("there's a `Context:` footer") but not the
hook-enforced rules, so the hook rejects a malformed message and forces a retry. Two edits, each at the
surface that matches its kind:

- **Document the wrapper interface in `AGENT-BRIEF.ARC` § Release wrappers** (orientation — a descriptive fact
  about the tool's shape): after the interlock-validation cascade, `arc release commit` takes the same
  message/flags as `git commit`, and `arc release push` supplies the `origin <current-branch>` target itself
  (no target argument) and refuses destructive flags. Lean operational context — enough to fire the wrapper
  without a `--help` probe, not a restatement of its internals. Removes the recurring `--help` probe at zero
  added load — the section is already always-loaded.
- **Sharpen the commit directive in `DEV-RULES.ARC` § Commit Discipline** (a behavioral rule): before composing
  any commit message, load the `commit-format` / `commit-footer` methods — do not reconstruct the format from
  recent `git log` (it shows surface shape, not the enforced rules). The methods stay the single source of
  truth; the rule carries a pointer + directive only, never a copy of the (overridable) format content — so
  DRY and the override model both hold. An always-loaded directive fires at every commit, so it subsumes the
  process-task-loop commit fire-point without per-workflow surgery.

The pointer-directive shape is chosen over an embedded format skeleton deliberately: a skeleton would save one
cached method-read per session but duplicate overridable content and go stale against a team's override. The
directive reduces hook-catch retries; the hook remains the hard enforcement backstop, not replaced by it.

## Scope boundary (No-gos)

- **No inline weight-resolution flag.** `arc start --class` (inline `Class` resolution at init) stays in
  `cli-substrate-adoption` — cross-referenced, not built here. Absent it, `--start <wu-slug>` surfaces the
  existing `class-resolved` guard on a still-unresolved stub rather than auto-resolving weight.
- **No write-time handoff-honesty backstop.** Facet 3's optional stretch — a compose/commit-time backstop that
  re-derives any handoff git-state summary from a fresh probe so the note stays honest for human readers — is
  out of scope. The core (`session-init` sourcing git facts from the probe only) is sufficient; the backstop
  is a separate concern if it proves needed.
- **No standing auto-proceed setting.** `--next` is per-invocation only; no config key, no default-on mode.
- **No WU decomposition.** The work stays one WU. The doc-lobe / code-lobe split is a task-phase boundary
  (the doc lobe can land first on its own), not a cohort cut. Decomposition is a watch item only if a
  code-lobe fix grows materially during implementation.
- **Facet 5 does not re-home errand records.** It delivers only the delete-if-exists `--force` fix and adds no
  record-schema field. The reap-safety base-containment check it would once have "sharpened" already ships
  (`isLandedInBase`), and the no-`--force` auto-confirm (which would need a tip SHA on the record) is routed to
  `operational-state-docs`, whose records-rehome model owns lifecycle-stateful record fields.
- **Facet 1 keeps the `session-init` Orient housekeep soft-offer.** Only the handoff-side offer and its dead
  probe row are removed; the between-WUs nudge at session start stays.
- **No embedded commit-format skeleton (facet 7).** Always-loaded commit guidance is pointer + directive only;
  the format/footer shape stays solely in the (overridable) `commit-format` / `commit-footer` methods — no
  duplicated skeleton in `DEV-RULES.ARC` or elsewhere.
- **No `process-task-loop` fire-point surgery (facet 7).** The always-loaded directive already covers
  task-execution commits; the task-loop's commit step is not separately edited.
- **Not always-loading the full methods at init (facet 7).** Folding `commit-format` / `commit-footer` into the
  session-init document set was considered and rejected — the footer lookup table is per-session dead weight;
  on-demand-on-directive is the chosen load tier.

## Consequences & Risks

- **Shared overlap primitive (facet 6).** `lib/git`'s foreign-artifact detection is consumed
  by both `arc activate`'s foreign-write check and `arc errand check`. The meta-path self-exclusion must not
  regress the errand-check consumer; tests must cover both call paths. This is the widest blast radius and the
  basis for the `Heavy` `Class`.
- **`Class` rests on scale/complexity, not derivation.** The design is determinate; `Heavy` reflects the
  code lobe's shared-primitive blast radius and the scrutiny the shared overlap layer demands. If
  implementation shows the overlap-layer change is well-contained, `Class` may ratchet down to `Light` — no
  work is lost, since it is an estimate.
- **Fewer housekeep nudges (facet 1).** Removing the handoff-side offer means the only housekeep nudge is at
  `session-init` Orient. Acceptable: that is the correct moment (base context available, low context cost), and
  the `inboxState` surface still fires there.
- **Entry shortcuts and the review-increment invariant (facet 4).** Auto-proceeding past the orientation gate
  risks eroding the invariant if over-broadened. Mitigated by the bounds (per-invocation, one-step /
  one-transition, conditional-surface fallback, stop-and-ask-wins); `--start` additionally preserves init's
  commit/push interlocks and `Class` guard.
- **Commit directive is a soft nudge, not a gate (facet 7).** The always-loaded directive raises first-try
  correctness but does not guarantee it — the agent can still skip the method load. The hook stays the hard
  backstop; the win is fewer hook-catch retries, not their elimination.
- **Two-copy sync.** Workflow/doc edits to `session-handoff` / `session-init`, the entry shortcuts, and the
  `AGENT-BRIEF.ARC` / `DEV-RULES.ARC` commit-path edits all apply to both the package source
  (`packages/arc-framework/arc/`) and the `.arc/` instance per package-project sync discipline.

## Success Criteria

- `session-handoff` runs as a single turn with no housekeep offer or `**Housekeep:**` advisory line, and its
  probe-consumption table carries no `inboxState` row.
- The `session-handoff` probe's `user` slot surfaces a disk-ahead-of-ref drift (parity with `session-init`'s
  `notesDriftSurface` / `loadNeeded`).
- A `session-init` after a state-changing handoff push reports git facts from the live probe and never echoes a
  contradicting stale SESSION-NOTES git-state line.
- `arc-session --next` on a clean Resume arm begins the active WU's Next Action without the proceed prompt; with
  any orientation conditional surface present, it falls back to the prompt; bare `--next` on the no-WU arm is a
  no-op.
- `arc-session --start <wu-slug>` on a clean no-active-WU Orient arm starts the named backlog WU past discovery
  and the confirm-only init offer while init's commit/push interlocks and `Class` guard still fire.
- `arc errand close --force` succeeds after a `gh pr merge --delete-branch` merge — the delete-if-exists reap
  clears the record even when the local branch is already gone (no orphaned record in
  `refs/arc/user/{id}/errands`) and returns the worktree to base if symbolic `HEAD` still names the deleted
  branch — and the non-`--force` refusal names `--force` as the escape.
- `arc activate` on a pushed planning branch emits no spurious "Foreign-owned write" warning, and
  `arc errand check`'s overlap detection is unchanged (covered by tests on both consumers).
- `AGENT-BRIEF.ARC` § Release wrappers states the wrapper-to-`git` interface (lean operational context, not
  internals), so a workflow commit can fire via the wrapper without probing `--help`; `DEV-RULES.ARC`
  § Commit Discipline carries an explicit
  load-the-methods / don't-reconstruct-from-`git log` directive — with no format/footer content copied out of
  the methods (they remain the sole source of the shape).

## Open items

Implementation-structure calls that resolve *during* this work — not deferred design. Each carries a leaning
resolution grounded in the current code/workflows; implementation confirms or overrides it.

- **Facet 4 `--next` placement** — *leans stand-alone modifier.* The signal-leaf dispatch surface
  (`--errand` / `--housekeep` / `--plan`) is specifically the locus-relocation path: it moves the working
  checkout to an out-of-WU locus and outranks arm resolution. `--next` never relocates the checkout, so it
  reads as a per-invocation modifier landing at the *terminal* of the Resume arm — suppressing Step 6's
  "proceed to Next Action?" gate when orientation resolves bare-clean. It is not the between-WU start spelling.

- **Facet 4 `--start` placement** — *leans explicit no-WU Orient shortcut.* `--start <wu-slug>` names the
  `init-work-unit` / `arc start` transition and belongs on the no-active-WU Orient arm, where discovery would
  otherwise offer the same candidate confirm-only. It suppresses only session-init's own ergonomic prompts
  (Step 5 discovery + the confirm-only init offer); it does not thread into the init ceremony. Once
  session-init hands off to `arc start <name>`, `init-work-unit` runs unchanged — its `workflowCommit` (Step 4)
  and `workflowPush` (Step 6) interlocks fire as normal (or route via release opt-in per config). The
  graceful-degradation point is concrete: `init-work-unit`'s Step 3 `class-resolved` guard refuses a `[TBD]`
  stub, so absent inline `arc start --class` (owned by `cli-substrate-adoption`), an unresolved stub surfaces its
  `Class` rather than auto-initializing.

- **Facet 6 exclusion layer** — *leans the detection core.* `detectForeignArtifactOverlap` already owns
  self-exclusion (the `worktreePath !== originatingWorktreePath` filter), so the meta-path exclusion co-locates
  there as an optional `originatingMetaPath` predicate — a candidate whose `metaFilePath` matches it is excluded
  alongside the worktree-path match. The caller (`check-foreign-writes.ts`) resolves the originating meta path
  (symmetric with the `currentWorktreePath` it already resolves) and threads it through. This keeps
  `projectInFlightToOverlapRoster` a pure projection and leaves `runActiveInFlight` a
  general oracle (no special-casing the stale renamed-from ref at the derivation layer, which would broaden the
  blast radius onto every oracle consumer), and stays backward-compatible for the `arc errand check` consumer
  (errands carry no meta; they self-exclude by worktree path and simply don't pass the new predicate).

---
