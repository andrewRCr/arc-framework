# Plan: Handoff Optimization

**Purpose:** Reduce perceived latency and agent-reasoning load in the session-handoff
workflow without degrading handoff quality. Handoff sibling to the shipped Session-Init
Optimization WU.

- **State:** Draft — captured 2026-05-09 from a mid-session friction audit. No PRD yet.
- **Created:** 2026-05-09
- **Origin:** Recurring observation that `/arc-handoff` runs to summary in 3+ minutes
  even on sessions where most of the handoff context is unchanged. Triage during Release
  Wrappers Foundation Phase 5 confirmed the bulk of latency is agent-side reasoning, not
  CLI work — but identified a few CLI-surface changes that would shift work from agent
  to CLI and mechanize the load-bearing judgment.

---

## Problem / Motivation

Session-handoff is structurally expensive in three places that compound across every
session:

1. **Double composite probe.** `arc status --session-handoff --json` runs twice —
   probe-1 pre-commit, probe-2 post-commit — to refresh `worktree`, `dirty`, `head`,
   and `recommendedSummaryLine` after the `chore(status): handoff` commit. The
   workflow itself acknowledges probe-2 is harmless redundancy when no commit fires:
   *"When step 3 didn't fire a commit, probe-2's mutated slots are identical to
   probe-1's — the second invocation is harmless redundancy. The workflow doesn't
   branch on whether a commit fired."* When a commit does fire, the worktree / dirty /
   head deltas are deterministic from probe-1 plus the commit just made;
   `recommendedSummaryLine` is the only slot that genuinely needs recomputation.

2. **Agent-side judgment without delta context.** Three steps require the agent to
   reason about "what changed since the last handoff," but the probe surfaces that
   delta only partially:

    - **Persistent Context review** — each entry has an explicit removal trigger; the
      agent reads SESSION-NOTES, holds each entry's trigger in mind, and checks
      whether the trigger condition has been met. Mechanical when triggers are
      structured; load-bearing reasoning when they're freeform prose.
    - **Status-file skip threshold** — *"Would the next session do anything different
      at step 0 with this change?"* requires comparing each field's current vs.
      last-handoff value field-by-field. The agent reconstructs this comparison from
      `git log` + reading the status file each session.
    - **SESSION-NOTES Pass 2 filter** — *"not in any durable tracked source / acted on
      at step 0 / costly if missing."* Pass 1 is mechanized via `restateCandidates`;
      Pass 2 is genuinely semantic and probably not mechanizable.

3. **Re-derivation of unchanged context.** The session ends with the workflow asking
   the agent to evaluate inputs that, in many sessions, haven't materially changed
   since the prior handoff. The CLI has the data to short-circuit much of this
   evaluation but doesn't surface it that way today.

Concrete user-visible symptom: 3+ minutes from `/arc-handoff` invocation to Confirm
Handoff summary on sessions where probe latency is well under 5 seconds combined. The
gap is agent reasoning at the three judgment points above.

---

## Approach

Shift work from agent to CLI where the judgment is mechanical, leave the genuinely
semantic judgment in the agent, and eliminate the double probe entirely.

Four candidate optimizations, sequenced from highest-confidence-mechanical to
lowest:

1. **Replace probe-2 with local delta + cheap recompute.** After the
   `chore(status): handoff` commit, the agent already knows: new HEAD (from the
   commit just fired), worktree state delta (+1 ahead, others unchanged), dirty
   state (clean). Only `recommendedSummaryLine` needs recomputation. Approach:
   small CLI surface (e.g., `arc status --session-handoff-refresh --json` or a
   shape on the existing handler) that takes the post-commit HEAD and returns
   only the recomputed summary line, or expose
   `composeRecommendedSummaryLine` as a callable from probe-1's data + the new
   commit hash. **This subsumes the simpler "skip probe-2 when no commit fires"
   variant** — the no-commit case becomes "no deltas, no recompute needed,"
   handled by the same code path with zero cost.

2. **Surface status-field deltas in probe-1.** New slot:
   `statusFieldsAtLastHandoff: { state, branch, taskList, nextTask, lastCompleted,
   blockers, nextAction }` populated from `git show <last-handoff-hash>:<status-path>`.
   Probe-1 already has the last handoff hash via `restateCandidates`'s reference
   frame. Skip-threshold judgment becomes mechanical: agent compares current
   intended-write to that snapshot, and skips when no field crossed the threshold.

3. **Structured Persistent Context triggers.** Persistent Context entries currently
   carry a freeform `_Remove when:_` line. Move to structured triggers (e.g.,
   `trigger.refExists: refs/notes/...`, `trigger.fileExists: ...`,
   `trigger.commitContains: ...`) that the CLI evaluates at probe time. Surface
   "ready to remove" entries in a slot. Existing entries need migration; future
   authoring requires the structured shape. Convention change in `session-handoff.md`
   § Persistent Context.

4. **Pass 2 hint surface (low priority, possibly infeasible).** Pass 2's
   "not in any durable tracked source" criterion would require semantic search across
   PRD, strategy, constitution, plans, ADRs. This is what an agent does well and a
   CLI poorly without an indexer. Likely stays agent-side; flagged for completeness
   but not pursued unless a low-cost approximation surfaces.

5. **Routing-shift posture surface for session-init.** Companion slot
   `releaseRoutingAtLastHandoff: { taskCommit, workflowCommit, workflowPush }` populated
   alongside `statusFieldsAtLastHandoff` (item 2) — same `git show <last-handoff-hash>`
   reference frame. Session-init handler compares the snapshot against this session's
   resolved `releaseRouting` (PRD R12.1, shipped in Release Wrappers — Adopter Ergonomics
   WU); when the values differ (interlock keys edited in git-config / yaml since last
   handoff), session-init surfaces a one-line posture-change note in orientation. Silent
   when no shift. Absorbs the deferred posture-shift surface from
   `prd-release-wrappers-ergonomics.md` R11 — that WU dropped the always-on
   release-wrapper engaged line as orientation noise (configuration-state surface, not
   action-needed surface) and deferred the legitimate state-shift surface to this WU's
   delta-detection infrastructure.

---

## Scope

### In scope

- **Replace probe-2 with local delta + recompute** (item 1) — CLI surface for
  recomputing `recommendedSummaryLine` from post-commit state without re-running the
  full composite probe. Workflow update to drop probe-2 invocation in favor of the
  new path.

- **Add `statusFieldsAtLastHandoff` slot** (item 2) — handler-side population from
  `git show`; workflow guidance update for the skip-threshold check to consume the
  new slot.

- **Add `releaseRoutingAtLastHandoff` slot + session-init posture-change surface**
  (item 5) — companion slot to item 2, same `git show` reference frame. Session-init
  handler computes delta against current `releaseRouting`; surfaces a one-line
  posture-change note in orientation when values differ. Silent when no shift.
  Workflow update: `session-init.md` Step 6 conditional top-level section for the
  routing-shift line. Absorbs the posture-shift work deferred from Release Wrappers —
  Adopter Ergonomics WU.

- **Structured Persistent Context triggers** (item 3) — schema design for trigger
  types, CLI evaluator, migration of existing entries across the repo, workflow doc
  update for authoring conventions.

- **Workflow updates** in `session-handoff.md` reflecting all of the above —
  probe-1 / probe-2 collapse, skip-threshold mechanization, persistent-context
  evaluation slot consumption.

- **Tests** for the new CLI surfaces (recompute helper, status-field-delta slot,
  persistent-context trigger evaluator).

### Out of scope

- Sync auto-invoke behavior — gated on `syncInterlock`; not a target.
- SESSION-NOTES authoring conventions beyond Persistent Context structured
  triggers — Pass 1 / Pass 2 stay as-is.
- Agent-side Pass 2 hinting — flagged in Approach as item 4 but not pursued in this
  WU.
- Composite probe envelope shape changes that aren't slot additions — backwards-compat
  with current consumers preserved.

---

## Sibling Work Units

- **Session-Init Optimization** (✅ Complete, April 2026, PR #21) — direct precedent.
  Same pattern: shift work from agent reasoning to CLI mechanism, with `sessionType`
  inference and `recommendedAction` slots being the canonical examples. This WU
  applies the same playbook to the handoff side.

- **User Sync UX Polish** (✅ Complete) — handoff-interior toggle pattern lives
  here; this WU composes against that substrate.

- **Release Wrappers — Adopter Ergonomics** (planned, PRD active) — ships
  `releaseRouting` envelope slot (PRD R12.1) that this WU's `releaseRoutingAtLastHandoff`
  snapshot compares against. Release-wrappers WU explicitly defers the posture-shift
  orientation surface to this WU; PRD R11 references this plan for the mechanism.

- **Worktree Foundation** (planned) — independent. Worktree-aware handoff would
  ride on Worktree Foundation if it lands first; otherwise this WU's scope stays
  on the single-worktree handoff path.

---

## Scope Estimate

**Small-to-medium.** ~2-4 sessions ballpark.

- Probe-2 replacement (item 1): ~1 session — CLI helper + workflow update + tests.
- Status-field-delta slot (item 2): ~0.5–1 session — slot population is mechanical;
  workflow guidance is the prose lift.
- Routing-shift posture surface (item 5): ~0.25 session — slot population mirrors
  item 2; session-init Step 6 conditional surface is a small addition.
- Structured Persistent Context triggers (item 3): ~1–1.5 sessions — schema, evaluator,
  migration of existing entries (audit time, not scope time), and authoring doc.
- Verification + buffer: ~0.5 session.

**Sequencing.** No hard dependencies. Independent of the parallelism trio. Could
slot in opportunistically between major WUs. If the friction continues to compound,
consider before Worktree Foundation; otherwise treat as opportunistic.

**PRD-time clarifications expected.**

- `recommendedSummaryLine` recompute: standalone CLI subcommand vs. extension of an
  existing command vs. exposing a library helper consumed by the handoff skill.
- `statusFieldsAtLastHandoff`: stored as the literal field values (one snapshot per
  field) or as the raw status-file text at last-handoff hash (agent diffs structurally).
- Persistent Context trigger schema: how rich does it need to be? Minimum viable set
  is probably `refExists` / `fileExists` / `commitContains` / `taskComplete` —
  larger schemas drift toward over-engineering.

---
