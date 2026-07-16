# Draft: Handoff Optimization

**Purpose:** Reduce perceived latency and agent-reasoning load in the session-handoff
workflow without degrading handoff quality. Handoff sibling to the shipped Session-Init
Optimization WU.

- **State:** Draft — captured 2026-05-09 from a mid-session friction audit; re-anchored 2026-07-02
  (grooming session): structured Persistent Context triggers elevated to co-headline scope (item 3 — the
  evidence hardened), CW-consumer items marked, cohort sequencing stated against
  `cohort-agent-context-optimization.md`. No PRD yet.
- **Created:** 2026-05-09
- **Origin:** Recurring observation that `/arc-handoff` runs to summary in 3+ minutes
  even on sessions where most of the handoff context is unchanged. Triage during Release
  Wrappers Foundation Phase 5 confirmed the bulk of latency is agent-side reasoning, not
  CLI work — but identified a few CLI-surface changes that would shift work from agent
  to CLI and mechanize the load-bearing judgment.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[x]` **SESSION-NOTES post-WOR model cleanup**

- *Disposition (2026-07-02):* Integrated as a standing scope item (see § Scope) — a coordinated
  template + workflows + CLI retirement sweep, unchanged in substance from the capture below.

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`), work-routing-discipline housekeep drain (2026-06-01).
- *Concern:* WOR moved SESSION-NOTES to WU-scoped subdirs (`user/{id}/<wu>/`) but left the pre-WOR single-doc
  model in the template + workflows:
    - Template (`templates/user/SESSION-NOTES.md`) still says "Completed Work" (the workflow wants only
      "Uncommitted Work") and "status-{name}.md" (→ `meta-{name}.md`). Pure drift.
    - The `**Working On:**` field + markers (`[none]` / `[between work units]` / `[planning: …]`) are dead under
      WU-scoping — no WU means no subdir means no SESSION-NOTES, and the subdir name already is the WU identity.
      Retire the field; H1 becomes `# Session Notes: {WU Name}`, populated by `arc user open` at seed.
    - Coordinated retirement, not a one-liner: the field has a live consumer — session-init multi-candidate
      disambiguation precedence #1 (`commands/active/status.ts`, now circular under WU-scoping) — plus
      `session-handoff.md` step 2 / skeleton. Touches template + both session workflows + the CLI path (+ test).
- *Coordination:* work-routing-discipline's between-WUs `session-handoff` path defines *when* SESSION-NOTES
  is/isn't written; same file, adjacent concern — one coordinated sweep (its notes § Coordination write-back
  specifics names this WU as the owner).

### `[x]` **Give session-handoff a codified lightweight path for errand/housekeep sessions**

- *Disposition (2026-07-02):* Integrated as a **CW-gated scope item** (see § Scope) — session-handoff's
  entry-mode paths (active-WU / between-WUs / errand / housekeep) become fragments under
  `draft-composable-workflows.md` D2/D3, and this WU authors the handoff instances once that design
  settles. Named there as an early consumer. Original concern preserved: the agent currently exercises
  judgment to abstain from heavier active-WU steps (meta-file commit, SESSION-NOTES write) instead of
  never seeing them.
- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: handoff-optimization`), housekeep drain (2026-06-27);
  captured 2026-06-26, between-WUs reflection.

### `[ ]` **Terminal-WU handoff mode, an explicit sync-only handoff tier, and boundary-marker output**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: handoff-optimization`), housekeep drain (2026-07-16);
  captured during FP wave-3 terminal-state UX review after `cli-test-hardening` shipped — the base-fetch refusal
  reproduced at that session's init. Distinct from `base-drift-guidance` (prompt quality, not terminal flow).
- *Concern:* session entry grew a dispatch architecture (arms, explicit-intent signals, a typed orientation
  block); session exit didn't. `cli-test-hardening`'s ship surfaced the gap live: the session ends in a stamped
  detached husk with no owned closing ceremony — `session-handoff`'s between-WUs path is close in content
  (WORKING-MEMORY review, route captures, sync, confirm, no SESSION-NOTES) but fails the shipped-WU case
  concretely: its dispatch key assumes a branch (a husk is detached HEAD, so the state falls through undefined),
  its sync runs where the session sits (a linked worktree/husk cannot freshen the primary's checked-out base —
  `git fetch origin main:main` refuses), and it neither knows a WU just shipped (the dominant `_Remove when:_`
  trigger event) nor emits a terminal marker. The closing summary the agent produced was improvised prose.
- *Approach:* three extensions to the existing lightweight entry-mode-paths scope item: (1) a **terminal-WU
  handoff mode** dispatched off the probe's `currentHusk` slot — typed boundary block, WORKING-MEMORY trigger
  review, base/notes sync routed to the primary (or the base-sync verb named in `draft-session-locus-model.md`
  § Boundaries), no SESSION-NOTES write, and a generic exit pointer ("fresh session at the primary; the husk
  surfaces for teardown at its next init"); (2) an explicit **deterministic-housekeeping tier** — sync-only
  handoff invocable as intent (mirroring session-init's signal flags) rather than per-mode judgment, for sessions
  with nothing to write; (3) a **boundary-marker family** — typed terminal blocks for each exit locus (WU shipped,
  errand closed, drain complete), symmetric with the session-init orientation marker.

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

3. **Structured Persistent Context triggers — elevated to co-headline (2026-07-02).** Persistent
   Context entries currently carry a freeform `_Remove when:_` line. Move to structured triggers (e.g.,
   `trigger.refExists: refs/notes/...`, `trigger.fileExists: ...`,
   `trigger.commitContains: ...`) that the CLI evaluates at probe time. Surface
   "ready to remove" entries in a slot. Existing entries need migration; future
   authoring requires the structured shape. Convention change in `session-handoff.md`
   § Persistent Context.
   *Elevation evidence:* WORKING-MEMORY has grown to ~226 lines / ~3.5k tokens of rich prose, re-read at
   every session-init **and** re-judged entry-by-entry at every handoff — the largest single
   agent-judgment cost in the ceremony and a per-session read cost besides. ADR-022 already claims the
   record-schema side; this item is its evaluator. Rank it with item 1, not below it.

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

6. **Handoff-commit subject + body rendering helper.** The handoff-commit shape that
   lands in WOR (`session-handoff.md` step 3, codified in Task 6.1.e) reshapes the
   commit from today's empty-body `chore(status): handoff` to a codified
   `chore(arc): handoff — <position>` subject + structured field-delta body. The MVP
   shipping with WOR leaves rendering as workflow-prose: agent reads the staged
   meta-file diff + last-handoff snapshot, picks a position-string template from a
   codified vocabulary, fills the body template. This item extracts the deterministic
   steps to a CLI helper:

    - **Input:** the staged meta-file diff + last-handoff hash from SESSION-NOTES.
      Consumes item 2's `statusFieldsAtLastHandoff` slot as the "prev" reference.
    - **Output:** rendered subject (position-string template selected mechanically
      from the field-delta pattern) + rendered body (`Last Completed`, `Next Task`,
      and conditional `State` / `Blockers` lines populated from the diff). Workflow
      consumes the rendered output; agent judgment shrinks to "did the helper
      succeed?"
    - **Shape candidate:** `arc handoff render --subject-body` or a sub-shape on the
      existing `arc status --session-handoff` family. Final shape decided at PRD time.

   Composes naturally with items 1 (post-commit recompute) and 2 (status-field-delta
   slot) — item 6 reuses item 2's snapshot data as the delta input. Surfaced during
   WOR Phase 6 design discussion as the proper home for the CLI extraction; WOR ships
   the MVP, this WU ships the helper.

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

- **Handoff-commit rendering helper** (item 6) — CLI extraction of the
  position-string template selection + body-delta rendering from `session-handoff.md`
  step 3 (codified in WOR Task 6.1.e). Reuses item 2's `statusFieldsAtLastHandoff`
  snapshot. Workflow update to consume the helper's output rather than render in
  prose.

- **Workflow updates** in `session-handoff.md` reflecting all of the above —
  probe-1 / probe-2 collapse, skip-threshold mechanization, persistent-context
  evaluation slot consumption, handoff-commit rendering consumption.

- **Lightweight entry-mode paths** (CW-gated; from the 2026-06-27 capture) — errand / housekeep /
  between-WUs handoffs load only their applicable fragments instead of carrying every active-WU step
  inline. Sequenced after `composable-workflows`' fragment design settles; this WU authors the handoff
  fragments as an early consumer.

- **SESSION-NOTES post-WOR model cleanup** (from the 2026-06-01 capture) — retire the pre-WOR single-doc
  residue: template drift ("Completed Work", `status-{name}.md`), the dead `**Working On:**` field and its
  markers, the H1 → `# Session Notes: {WU Name}` seeding via `arc user open`, and the live consumer rewire
  (session-init multi-candidate disambiguation precedence #1 in `commands/active/status.ts`, circular
  under WU-scoping) + `session-handoff.md` step 2 / skeleton (+ test).

- **Tests** for the new CLI surfaces (recompute helper, status-field-delta slot,
  persistent-context trigger evaluator, handoff-commit renderer).

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

- **Composable Workflows** (`draft-composable-workflows.md`) — cohort keystone (joined
  2026-07-02; see `cohort-agent-context-optimization.md`). Gates only the lightweight
  entry-mode paths scope item; the CLI items (1, 2, 5, 6) and the trigger evaluator (3)
  are CW-independent and stay opportunistic. session-handoff is named there as the
  second agenda consumer after session-init.

- **User Sync UX Polish** (✅ Complete) — handoff-interior toggle pattern lives
  here; this WU composes against that substrate.

- **Release Wrappers — Adopter Ergonomics** (planned, PRD active) — ships
  `releaseRouting` envelope slot (PRD R12.1) that this WU's `releaseRoutingAtLastHandoff`
  snapshot compares against. Release-wrappers WU explicitly defers the posture-shift
  orientation surface to this WU; PRD R11 references this plan for the mechanism.

- **Worktree Foundation** (planned) — independent. Worktree-aware handoff would
  ride on Worktree Foundation if it lands first; otherwise this WU's scope stays
  on the single-worktree handoff path.
    - **Removal-trigger eval cadence (captured from WF planning, 2026-05-24).** WORKING-MEMORY's
      `_Remove when:_` triggers are reviewed every handoff — arguably over-sampling, since triggers
      change at WU-velocity (days/weeks) while handoffs recur many times a day. Item 3 (structured
      triggers, CLI-evaluated at probe time) is the *principled* fix: it converts the per-handoff cost
      from "agent reads + judges every entry" to "CLI mechanically checks; silent unless ready-to-remove,"
      so frequency becomes cheap and a separate throttle is largely unnecessary (make-it-cheap beats
      throttle-an-expensive-check). A once-per-day timestamp throttle (per-machine state in `.internal/`)
      is a viable *fallback* for non-mechanizable judgment triggers — but most ARC triggers ("when WU-X
      integrates / ships") are mechanizable via `refExists` / PR-state, so the throttle's residual value
      is small. Principle to preserve: a removal-trigger-bearing surface needs a paired eval cadence or it
      rots.

- **Work Organization Reform (WOR)** — ships the handoff-commit rendering convention
  (Task 6.1.e: subject template + position-string vocabulary + body template) as
  workflow-prose MVP. Item 6 above extracts the deterministic steps to a CLI helper.
  Upstream dependency: WOR must land before this WU activates (or at least Task 6.1.e
  needs to be the established convention).

---

## Scope Estimate

**Small-to-medium.** ~3-5 sessions ballpark.

- Probe-2 replacement (item 1): ~1 session — CLI helper + workflow update + tests.
- Status-field-delta slot (item 2): ~0.5–1 session — slot population is mechanical;
  workflow guidance is the prose lift.
- Routing-shift posture surface (item 5): ~0.25 session — slot population mirrors
  item 2; session-init Step 6 conditional surface is a small addition.
- Structured Persistent Context triggers (item 3): ~1–1.5 sessions — schema, evaluator,
  migration of existing entries (audit time, not scope time), and authoring doc.
- Handoff-commit rendering helper (item 6): ~0.5–1 session — consumes item 2's slot,
  renders subject + body via the position-string vocabulary codified in WOR Task 6.1.e;
  workflow update + tests.
- Verification + buffer: ~0.5 session.

**Sequencing.** No hard dependencies for the CLI items (1, 2, 5, 6) or the trigger evaluator (3) —
slot in opportunistically between major WUs, per `cohort-agent-context-optimization.md`. The
lightweight entry-mode paths item alone waits on `composable-workflows`' fragment design settling.
WOR has shipped, so item 6's upstream convention (Task 6.1.e) is established.

**PRD-time clarifications expected.**

- `recommendedSummaryLine` recompute: standalone CLI subcommand vs. extension of an
  existing command vs. exposing a library helper consumed by the handoff skill.
- `statusFieldsAtLastHandoff`: stored as the literal field values (one snapshot per
  field) or as the raw status-file text at last-handoff hash (agent diffs structurally).
- Persistent Context trigger schema: how rich does it need to be? Minimum viable set
  is probably `refExists` / `fileExists` / `commitContains` / `taskComplete` —
  larger schemas drift toward over-engineering.

---

## Coordination — ADR-022

Per ADR-022, consume the managed operational-state document schema rather than coining a meta /
`SESSION-NOTES` field-set here. `**Commit at Handoff:**` becomes a CLI-owned pointer field (set
from git state, not hand-typed), and the structured `_Remove when:_` triggers become part of the
`WORKING-MEMORY` record schema. See `adr-022-managed-operational-state-documents.md`
§ Coordination.
