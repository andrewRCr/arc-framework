# Draft: Instruction Optimization

**Purpose:** The agent-context-optimization cohort's execution tail: ship the residual probe-envelope
extension batch (Pillar 3) and apply `composable-workflows`' workflow contract shape across the workflow
and method corpus no sibling restructures (Pillar 1, re-anchored). Identity re-stated 2026-07-02 against
the cohort layers model — see `cohort-agent-context-optimization.md`.

- **State:** Draft — pre-PRD exploration captured 2026-05-09; re-anchored 2026-07-02 (grooming session).
  The 2026-05-09 audit's findings remain a valid inventory, but its token estimates predate two months of
  session-init growth (now 910 lines / ~31k metered tokens) — re-measure at PRD time, and read the
  growth-rate framing in `draft-composable-workflows.md` § Problem / Motivation first. Pillar 2 is
  absorbed (documentation-surface-routing) and Pillar 4 subsumed (`composable-workflows` D3); sequencing
  keys on `composable-workflows` design settling, with the former hard handoff-optimization prerequisite
  reduced to D3.4's shared-helper coordination.
- **Created:** 2026-05-09
- **Origin:** Surfaced 2026-05-09 from a token-efficiency audit of ARC's instruction surface.
  Audit found two prior WUs already covering most of the surface (Session-Init Optimization
  shipped, Handoff Optimization drafted) and identified a narrower-but-real remaining surface
  across three pillars: workflow body density not addressed by per-file architecture changes,
  skill re-load overhead not addressed by either prior WU, and probe-envelope extension candidates
  specific to session-init that don't conflict with handoff-opt's planned slots.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **arc-modes dissolved → `local-mode`: prune the Lite probe-shape callbacks**

- *Routed from:* `local-mode` re-scope groom (2026-07-03).
- *Concern:* this draft's § Forward-Compat Callbacks ("arc-modes Lite/Local probe shape") and the
  § composability notes referencing `plan-arc-modes.md` are half-moot. Lite is dead (ADR-020; ratified at the
  2026-07-03 re-scope — the WU renamed to `local-mode`, Lite content cut): there is no Lite probe shape to
  design for, and the shipped multi-WU probe runs tier-agnostic on the invariant floor. The **surviving**
  composability concern is the storage axis: Local's session-init pre-check (halt on missing `.arc/`, surface
  `arc backing status` degraded state) — see `draft-local-mode.md` § Session-init pre-check. At integration:
  drop the Lite arms of the callback, re-point the concern at the storage axis, and update the stale
  `plan-arc-modes.md` filename refs.

### `[x]` **CLI helper for the session-init strategic partial-read of the task list (concretizes Pillar 3 / D3.2)**

- *Disposition (2026-07-02):* Integrated into Pillar 3 D3.2, which is now a **reconciliation** — the shipped
  `taskCursor` slot (via `compaction-recovery`) already resolves section + leaf ids, titles, and line hints;
  the embed-vs-subcommand tension below is settled *embed-adjacent* by the agenda model (the `loadSet`
  read-mode entry, not raw task content in the probe). See revised D3.2.

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: instruction-optimization`), work-routing-discipline
  housekeep drain (2026-06-01).
- *Concern:* session-init item 9 has the agent extract three task-list blocks (header, current-phase preamble,
  current-task section) by hand — one phase grep + offset math + a 4-step graduated lookup + a preamble-boundary
  contract. A purpose-built subcommand could return those blocks off the stable anchors, turning agent judgment
  into deterministic parsing — of-a-piece with the probe-as-pre-resolver philosophy.
- *Tension to reconcile:* Pillar 3 D3.2 (currentTask slot) frames this as "fold into the probe envelope," but the
  design caution argues for a separate `sessionType`-gated subcommand (e.g. `arc task show --current`) over
  embedding task content in the probe JSON — the probe is already large + runs every session-init, and item 9 is
  skipped for planning sessions. Reconcile embed-vs-subcommand when scoped.
- *Caution:* a parser couples to the task-list format — code the title-fragment fallback so drift *degrades
  gracefully*; round-trip-test against `template-tasks.md`. Files: new CLI command + extraction lib (+ tests);
  rewire session-init item 9 (Framework, two-copy).

### `[x]` **Add session-init Step 2 entry-dispatch arms to Pillar 4 surface candidates**

- *Disposition (2026-07-02):* Superseded with the rest of Pillar 4 — the entry-dispatch arms are now named
  directly in `draft-composable-workflows.md` D2 (extraction shape 1) as first-class fragment candidates,
  which is where the whole session-init decomposition lives. Nothing residual here.

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: instruction-optimization`), work-routing-discipline
  housekeep drain (2026-06-01).
- *Concern:* Pillar 4 (conditional section loading via a probe-rendered `applicableSections` routing card)
  enumerates session-init Steps 1, 5, 6, 7 as candidates but omits **Step 2's entry-dispatch arms** (cold-start /
  materialize / branch-gone recovery / errand cold-entry) — now the densest carry-and-skip cluster, read every
  session regardless of which arm the probe selects. Add them to Pillar 4's candidate list at PRD; the errand
  cold-entry block is a clean self-contained instance (gated on `--errand` + Orient + primary worktree), so it
  extracts cheaply.
- *Note:* the cross-cohort seam (fragment extraction per `composable-workflows` / P4.2 vs. one-file routing card
  per P4.1) is already captured in both drafts; this is only the missing surface candidate, not the routing
  decision.

---

## Problem / Motivation

ARC has been actively pursuing token-efficiency improvements at session-init (shipped April 2026,
~24-28% reduction at orientation) and is preparing the same pattern for session-handoff (draft).
Both WUs target their own ceremony surface — load-set narrowing and probe-envelope expansion at the
session boundary itself.

What neither WU addresses:

1. **Procedural prose density inside workflow bodies.** Session-Init Optimization moved *which files
   load* into frontmatter triggers and probe pre-computation; the workflow body's internal prose
   density is unchanged. session-init.md still encodes a 4-channel × 4-action dispatch matrix in
   ~50 lines of prose; session-handoff.md SESSION-NOTES Pass-2 filtering carries ~880 tokens of
   dispatch-shaped prose. Compression to dispatch tables / rules blocks preserves semantics with
   substantially fewer tokens, and reduces the agent's parse cost.

2. **Skill-invocation re-load overhead.** User-invocable skills fire mid-session and re-load methods
   that aren't in the session-init load set. The dominant cost is **arc-commit**, which explicitly
   re-reads `commit-format.md` + `commit-context-format.md` (~870 tokens) on every fire. Under
   `commit_interlock: on-task-approval` with multi-commit sessions, this compounds linearly. Other
   skills have minor or zero re-load overhead.

3. **Session-init probe-envelope extensions not in scope of either prior WU.** Step 5 freshness
   check, Step 3 item 9 graduated task-list lookup, Step 6 orientation prelude composition, and
   Step 7 mismatch typing are all deterministic computations the agent performs that the handler
   could fold into the envelope. None overlap with handoff-opt's planned slots
   (`statusFieldsAtLastHandoff`, `recommendedSummaryLine` recompute, structured Persistent Context
   triggers).

The surface is narrower than the prior WUs but the patterns are clean continuations of their
playbook.

---

## Working Theses

Three theses, one per pillar:

1. **Procedural dispatch belongs in tables, not prose, in agent-only docs.** Workflow files with
   `audience: agent` frontmatter optimize for parsing, not pleasure-reading. Numbered cascades,
   if-then prose, and parallel-list "applies / does NOT apply" structures compress to dispatch
   tables, rules blocks, or 2-column comparisons without semantic loss. Dual-audience files
   (DEV-RULES, briefs) are out of scope — prose density there serves human readers.

2. **Skill-loaded methods need session-cache discipline.** A skill that re-loads the same method on
   every fire is performing a defensive re-read against context drift. This is correct in principle
   (memory drift on format details is a real risk) but blunt in practice. A session-cache hint —
   "trust this file as loaded earlier in the session unless you have reason to suspect drift" —
   preserves the safety property while eliminating compounding re-loads. Mechanism options live in
   § Pillar 2.

3. **Deterministic state belongs in the envelope; judgment stays in the workflow.** The established
   pattern from Session-Init Optimization (and handoff-opt's continuation) is to move computational
   dispatch — file paths, line offsets, ref states, sync states — into the probe envelope, while
   leaving genuine judgment (mismatch resolution, completion notes, trust-hierarchy escalation) in
   workflow prose. This thesis names the boundary explicitly so future probe-extension proposals can
   apply it as a filter.

4. **Probe state can route content loading, not just dispatch decisions.** Workflows currently load
   all guidance prose upfront and use the probe envelope to dispatch at each step. The envelope
   already knows enough to tell the agent which conditional sections are live this session; surfacing
   that knowledge as a routing card lets the agent skip reading content for branches that won't
   fire. This generalizes Thesis 3's "envelope drives composition" (Pillar 3 D3.4) into "envelope
   drives content loading."
   > *Re-anchor (2026-07-02):* this thesis matured into the **session-agenda model** and now lives in
   > `draft-composable-workflows.md` D3 — the probe emits an ordered agenda (the shipped `loadSet` slice is
   > the seed), not just a section list. This WU consumes that mechanism rather than designing it.

---

## Pillar 1: Workflow Prose Density Audit

> **Re-anchor (2026-07-02).** Prose-compression is no longer this pillar's frame: table-izing a section a
> session shouldn't be reading at all optimizes the wrong layer. The pillar's execution shape is now
> **apply the `composable-workflows` D1 contract shape** (bounded spine, fragments, schema out-of-band,
> precomposed text) to each file below as it's touched — with the table/compression findings kept as a
> per-file findings inventory for that pass. Files a sibling restructures (session-init: CW's rewire;
> process-task-loop: loadset-composition's split; session-handoff: handoff-optimization) leave only their
> *residual* findings here. Token estimates are 2026-05-09-stale; re-measure at PRD time.

Audit completed 2026-05-09. Findings cite `session-init.md`, `session-handoff.md`,
`3_process-task-loop.md`, `prepare-commits.md`, `manage-incidental-work.md`, `verify-work-unit.md`,
and methods/extensions. Lifecycle workflows reshaped by Work Organization Reform
(`prd-work-organization-reform.md`, since shipped) were excluded from initial scope.

### Estimated impact

~2000 tokens of compression across the audited corpus. One-time per session (workflows load once
per fire), but the savings stack against the orientation budget that Session-Init Optimization
already trimmed.

### Per-file findings (ordered by single-file impact)

**`session-handoff.md` SESSION-NOTES Pass-2 filter and per-section guidance** — ~880 tokens, the
heaviest single block in the audited corpus. The 3-criterion filter, stay-out list, and per-section
pass/fail examples compress to a 3-column table (`section, pass-shape, fail-shape`). Estimated
compression: ~880 → ~500 tokens. **Coordinate with handoff-opt** — Pass-2 filter mechanization is
in handoff-opt's "possibly infeasible" item 4, so this WU's contribution stays on the
prose-compression side.

**`session-init.md` Step 2 conditional sync pulls** — ~520 tokens of dispatch prose (per-channel
rule + notes-load dispatch + combined-prompt rule). Compression target: 4-row dispatch table per
channel + 3-line combined-prompt + identity-absent edge cases. Estimated compression: ~250-300
tokens.

**`session-init.md` Step 3 item 9 graduated lookup + structural mapping** — ~280 tokens. Combined
with item 10's session-type branch, candidate to lift "what to read after probe resolves" into a
single dispatch table keyed on `(sessionType × resolution × State)`. **Unblocks substantial further
compression if D3.2 (currentTask slot) lands** — see § Pillar 3.

**`session-handoff.md` Confirm Handoff Sync arms** — 5 arms × literal one-line message keyed on
`(syncInterlock × identity × leg outcomes)`. 5-row dispatch table with literal text in column 2.
~120 tokens. **Coordinate with handoff-opt's `recommendedSummaryLine`** — could fold into a sibling
`recommendedConfirmationLine` slot, but the orchestrator already returns enough structured signal
that prose collapse is sufficient.

**`3_process-task-loop.md` completion notes content discipline** — Include / Exclude lists are 2
columns of bullets — table candidate keyed on `(content type → include? → why)`. ~120 tokens.

**`manage-incidental-work.md` Pause/Resume protocol** — Three parallel scenarios (Activation /
Completion / Abandonment) compress to 3-row table by scenario. ~150 tokens. **Boundary item with
work-organization-reform** — flag at PRD time for ownership decision. **Update (WF planning, 2026-05-24):**
Worktree Foundation *obsoletes this protocol's premise* — under worktree isolation an interrupt spins up an
atomic-tier WU / Errand in its own worktree rather than pausing the parent, so the pause-pointer mechanic
(`Interrupts:` / `Paused At:` / `Paused To:`, already retired from `template-meta.md`) is dead. WF
neutralizes the mechanic for interim correctness; whether this workflow survives *as a workflow* (vs.
folding into always-loaded DEV-RULES routing + a design-time strategy) is this WU's /
`documentation-surface-routing`'s ownership call — not a mere table-compression.

**Smaller wins:** `session-init.md` Step 7 trust hierarchy + examples (~150 tokens),
`session-init.md` Step 6 conditional orientation prose (~80 tokens pure-compression, more if
combined with D3.4), `session-handoff.md` skip-threshold prose (~120 tokens, coordinate with
handoff-opt), `3_process-task-loop.md` stop conditions (~70), structured prompt prefix/target
(~50), `verify-work-unit.md` state model + atomic-task disposition (~60 combined),
`prepare-commits.md` shared-docs commit pattern (~60).

### Cross-file de-duplication findings

> **Fold-in (2026-05-20):** Both cross-file de-dup items below absorbed into
> `plan-documentation-surface-routing.md` Lobe 1 (sibling WU). Same domain (documentation surface
> routing). Content preserved here for rationale until this plan's own PRD trims it formally.

Two pure-consolidation wins independent of any structural reforms:

- **Atomicity / commit-grouping rules** appear in `prepare-commits.md` (L107-L124),
  `arc-commit/SKILL.md` (L13-L23), and DEV-RULES.ARC. Two of three carry near-verbatim per-rule
  "applies / does NOT apply" prose. Make one canonical (DEV-RULES.ARC the natural home), link from
  the others. **~150 tokens.**

- **Atomic vs task-list decision** appears in `manage-incidental-work.md` (L26-L41) and
  `3_process-task-loop.md` (L246-L249). Same content, different wording. Make one canonical, link
  from the other. **~80 tokens.**

These could ship as standalone atomic tasks within the WU rather than rolled into per-file density
work.

**Tier-aware deduplication principle (captured for evaluation):** The two findings above both
choose DEV-RULES.ARC (tier-0, loaded every session) as the canonical home — that's the right
call, but the underlying principle hasn't been named. ARC's loading model creates three content
tiers: tier-0 (always loaded — DEV-RULES, AGENT-BRIEFs, QUICK-REFERENCE partial), tier-1 (loaded
per execution session — process-task-loop), tier-2 (on-demand — strategies, methods). The
operational decision tree must be self-contained at tier-0/1; strategies provide rationale + edge
cases at tier-2. Consequence: deduplication targets *within tier* (consolidate redundant operational
prose, consolidate redundant strategy rationale), but *across tiers* intentional duplication is
required by the loading model — a future audit that "consolidates" tier-0 operational rules into
a tier-2 strategy with cross-references would silently break agents that need the rules at
session-init without an on-demand strategy fetch. Worth codifying as a methodology constraint
during this WU's de-duplication pass, possibly in `strategy-session-operations.md` § Context
loading model. Origin: 2026-05-16 mid-WOR session, surfaced during interlock/wrapper rule-spread
audit when "consolidate to one canonical owner" reflex hit the tier constraint.

### Methods and extensions audit summary

Methods are mostly already concise (avg ~250 words). Modest opportunities:

- **`review-triage.md`** — FIX NOW / DEFER / REJECT / SILENT FIX 4-bullet-lists compress to 2-column
  dispatch table (`disposition × criterion`). ~80 tokens.
- **`test-first.md`** — "Requires test-first / Test-after acceptable" twin lists. ~50 tokens.
- **`issue-triage.md`** — Severity bands compress to 3-row table. ~40 tokens.
- **`commit-context-format.md`** — Per-section "used when" framing duplicates across artifact-type
  sections. ~50 tokens of de-dup.
- **`commit-format.md`, `diff-review.md`, `session-state.md`, `quality-gate-commands.md`** — Already
  concise. No findings worth pursuing.

Extensions audit returned **no meaningful findings**. All eight extensions are stub-shaped (80-280
tokens each), seven contain `[No extension configured]`, and the consistent
`Workflow / Fires / Contract` blockquote pattern is a feature (consistency-by-design) rather than
redundancy.

---

## Pillar 2: Skill Cache Discipline

> **Fold-in (2026-05-20), trimmed at the 2026-07-02 iteration:** This pillar's scope is absorbed into
> `draft-documentation-surface-routing.md` (sibling WU) — the arc-commit ~870-token per-fire re-read, the
> mechanism options (A: load-set inclusion / B: cache hint / C: reference card, with the recorded leans),
> the per-skill audit finding arc-commit the sole outlier, and the generalization-risk note all live there
> now. One addition since: whatever mechanism lands should consume the cohort's explicit-trigger pattern
> (`cohort-agent-context-optimization.md` L4), not a bespoke shape.

---

## Pillar 3: Probe-Envelope Extensions (Session-Init)

Five candidates, all session-init-side, none conflicting with handoff-opt's planned slots.
Aggregate impact: ~440 tokens of workflow prose + 2-4 tool calls per session.

### D3.1 — Freshness check folds into envelope

**Current:** `session-init.md` Step 5 has the agent run `git log -1 --format=%h`,
`git log --oneline <handoff-hash>..HEAD`, and `git log -1 --format=%h -- <status-file-path>`, then
dispatch on whether handoff hash matches HEAD.

**Proposed:** New envelope slot:

```text
freshness: {
  state: "current" | "gap" | "no-baseline",
  handoffHash: string | null,
  headHash: string,
  commitsSinceHandoff: number,
  statusFileHash: string | null,
  recommendedAction: "skip" | "surface"
}
```

Handler reads SESSION-NOTES (already has identity), parses `**Commit at Handoff:**`, computes
deltas, returns single dispatch tag.

**Conflict check:** Pairs naturally with handoff-opt — session-handoff *writes* the
`Commit at Handoff` value; session-init *reads* it. One CLI helper (`parseHandoffHash`) used at
both ends.

**Impact:** 1-3 tool calls eliminated + ~50 tokens of decision prose.

### D3.2 — currentTask slot for graduated lookup — **largely shipped; residual reconciliation**

> **Re-anchor (2026-07-02):** `compaction-recovery` shipped `taskCursor` — deterministic section + leaf
> resolution with ids, titles, and line hints — covering the core of this slot. Session-init item 9 already
> consumes it as the anchor fallback. **Residual scope:** (1) the phase-preamble boundary offsets
> (`phaseHeadingLine` / `phasePreambleEndLine` below) are still agent-computed via the structural-mapping
> grep — fold them into the cursor *or* express the whole partial read as a `loadSet` read-mode payload
> (the agenda-consistent shape; lean this); (2) the workflow-prose collapse this slot was meant to unblock
> (graduated lookup + structural mapping, ~280 tokens) lands with `composable-workflows`' session-init
> rewire, not as a standalone edit. The original proposal is preserved below as the residual's reference.

**Current (as of 2026-05-09):** `session-init.md` Step 3 item 9 has the agent run a graduated lookup
(line hint → task-number search → title search) on the active task list, then a grep for phase delimiters
to compute partial-read offsets. ~280 tokens of "how to find your spot" prose plus a structural
mapping rule.

**Proposed:** New envelope slot:

```text
currentTask: {
  id: "5.5",
  title: "Implement validation",
  resolvedLine: 1903,
  resolvedBy: "hint" | "number" | "title" | "mismatch",
  taskListPath: string,
  phaseId: "5",
  phaseHeadingLine: 1850,
  phasePreambleEndLine: 1875
}
```

Handler does the regex walk once. Agent reads two pre-computed line ranges (current task, phase
preamble). The "structural mapping" prose (L229-L231) and most of the graduated-lookup prose
collapses.

**Conflict check:** None. Handoff-opt's `statusFieldsAtLastHandoff` is change-detection at write
time; this is resolution at read time.

**Impact:** ~150 tokens of workflow prose + 1 grep tool call eliminated. **Unblocks Pillar 1 finding
A3** — `session-init.md` L205-L233 collapses from ~28 lines to ~10.

### D3.3 — lifecycleWorkflow path in envelope — **shipped via `loadSet`**

> **Re-anchor (2026-07-02):** the shipped `loadSet` slice already emits the `sessionType`-selected
> lifecycle workflow as a full-read entry (e.g. `process-task-loop.md` on execution sessions). The prose
> dispatch in item 10 collapses with `composable-workflows`' Step 3 rewire. Closed; nothing residual.

### D3.4 — recommendedOrientationPrelude slot

**Current:** `session-init.md` Step 6 has the agent compose orientation prelude by dispatching on
`worktree.value.state`, sync states, freshness gap. Includes literal templates for "Reconcile
required:" and "Local-ahead:" lines.

**Proposed:** Top-level `recommendedOrientationPrelude: string | null` slot. Handler composes the
literal text the agent inlines (or `null` for no prelude). Mirrors `recommendedCombinedPrompt` and
handoff-opt's `recommendedSummaryLine`.

**Conflict check:** Direct symmetry with handoff-opt's `recommendedSummaryLine`. Same pattern,
opposite session boundary. **Should share helper** — design *after* handoff-opt lands so this
extends rather than duplicates.

**Impact:** ~150 tokens, no tool-call delta.

### D3.5 — Mismatches slot

**Current:** `session-init.md` Step 7 has the agent run trust-hierarchy comparisons against
documented state, with Tier 1 (auto-recover) vs Tier 2 (stop-and-ask) dispatch.

**Proposed:** Add `mismatches: Array<{type, sources, tier, recommendedResolution?}>` to envelope.
Handler runs known cross-checks (status-file Next Task vs task-list checkbox state; status-file
Branch vs current branch).

**Conflict check:** No overlap with handoff-opt.

**Impact:** ~50 tokens + 0-N grep calls depending on mismatch shapes. Lower priority because most
sessions have zero mismatches.

### D3.6 — Probe-failure fallback (kept as-is, not folded)

The fallback path (`session-init.md` L52-L56) prescribes direct git/grep commands when the
composite probe fails. **This stays prose — folding defeats the resilience purpose.** Documented
here so the next iteration doesn't re-derive the exclusion.

### Aggregate ranking

| Candidate               | Tokens saved | Tool calls saved | Status / conflicts (2026-07-02)                                              |
|-------------------------|--------------|------------------|------------------------------------------------------------------------------|
| D3.1 freshness          | ~50          | 1-3              | **Open** — pairs with handoff-opt                                            |
| D3.2 currentTask        | ~150         | 1                | **Largely shipped** (`taskCursor`); residual above                           |
| D3.3 lifecycleWorkflow  | ~40          | 0                | **Shipped** (`loadSet`)                                                      |
| D3.4 orientationPrelude | ~150         | 0                | **Open** — build with handoff-opt's `recommendedSummaryLine` (shared helper) |
| D3.5 mismatches         | ~50          | 0-N              | **Open** — low priority                                                      |

---

## Pillar 4: Conditional Content Loading — **subsumed by `composable-workflows` D3**

> **Re-anchor (2026-07-02):** this pillar's mechanism question (P4.1 routing card / P4.2 split files /
> P4.3 JIT discipline) is resolved — and dissolved — by the session-agenda model in
> `draft-composable-workflows.md` D3: the compiler *is* P4.1 (probe-authoritative selection) selecting
> P4.2-style fragments, with the source-of-truth-dispersion objection answered by the agenda (agents never
> navigate the fragment tree) and index hubs (maintainers do). The motivating observation stands and moved
> with it: the 99% session-init case uses a small fraction of what it reads, and each new conditional
> surface has been a monotonic always-read addition (surfaced concretely at Task 3.13 —
> `tasks-work-organization-reform.md`).
>
> **Carried over as CW input — the surface-candidate inventory:** Step 6 conditional orientation surfaces;
> Step 1 conditional rules (identity-absent, contributor switch — probe-failure fallback stays inline by
> design, D3.6); Step 3 item 7 multiple-candidate disambiguation; Step 5 freshness + next-work discovery;
> Step 7 mismatch handling; Step 2 entry-dispatch arms (from this draft's inbound buffer). The arc-modes
> Lite/Full schema-awareness note transfers to CW's agenda-schema design (see § Forward-Compat Callbacks).
> Nothing else residual here.

---

## Recommended Biggest Lift

> **Re-anchor (2026-07-02):** the original recommendation here — D3.2 — has largely shipped as
> `taskCursor`, vindicating the pick. The WU's biggest remaining lift is no longer an envelope slot: it is
> the **D1 contract-shape application pass** across the corpus no sibling restructures (Pillar 1's
> re-anchored execution shape), gated on `composable-workflows` settling. Within Pillar 3's residual
> batch, D3.1 (freshness) + D3.4 (orientation prelude, built with handoff-opt's `recommendedSummaryLine`
> as a shared helper) are the priority pair; D3.5 and the D3.2 residual ride along opportunistically.

---

## Sequencing

**Hard prerequisite: `composable-workflows` design settles first** (not necessarily ships) — this WU's
Pillar 1 execution shape *is* the application of CW's D1 pattern, and its Pillar 4 content lives there.
Meta `Depends On` updated accordingly (2026-07-02).

**Soft coordination: handoff-optimization** — downgraded from the former hard prerequisite. The surviving
reason is D3.4's shared helper with `recommendedSummaryLine` (design together, whichever activates first),
plus staying out of session-handoff's restructured surfaces (Pillar 1 keeps only residual findings there).

**Resolved since capture:** Work Organization Reform shipped; the parallelism-trio settling condition is
OBE. `manage-incidental-work.md` Pause/Resume ownership (the E2 boundary item) remains a PRD-time call —
Worktree Foundation obsoleted the protocol's premise (see the Pillar 1 finding's update note).

**Composability with mode-aware probe (arc-modes).** Lite mode is noted in `plan-arc-modes.md`
as needing its own composite-probe shape. Any envelope extension in this WU should design for
"these slots compute under Full mode; Lite probe omits or substitutes." Slot naming and schema
should accommodate the eventual Full/Lite split rather than baking Full assumptions.

**Composability with worktree-aware probe.** Worktree Foundation (`plan-worktree-foundation.md`)
adds worktree context to the probe. Slots added here should not assume single-worktree topology —
particularly D3.2 `currentTask` (which task list is "active" depends on which worktree's WU is
current).

---

## Forward-Compat Callbacks

Annotations to revisit when downstream WUs land. Format mirrors arc-modes' callback notes for
consistency.

> **arc-modes Lite/Local probe shape.** This WU's envelope extensions assume Full mode. When
> arc-modes lands, audit each new slot for Lite-mode applicability:
>
> - `freshness` — applies regardless of mode; Lite needs it too
> - `currentTask` — Lite has a flat task list (no phases); the `phaseHeadingLine` and
>   `phasePreambleEndLine` slots become null or absent under Lite
> - `lifecycleWorkflow` — Lite has its own process-task-loop variant; the path resolution needs
>   mode awareness
> - `recommendedOrientationPrelude` — applies; composition logic may differ slightly under Lite
> - `mismatches` — applies; mismatch shapes may differ
> - agenda / section routing (formerly `applicableSections`, Pillar 4 — now CW's agenda schema) — Lite's
>   compact workflows have a different conditional surface than Full; the fragment vocabulary itself is
>   mode-dependent. Transferred to `draft-composable-workflows.md`'s agenda-schema design as a
>   mode-awareness requirement.
>
> Revisit slot schemas with Lite probe shape in scope.

<!-- -->

> **Worktree Foundation worktree-awareness.** `currentTask` resolution depends on which worktree's
> WU is active. Once worktree-aware probe lands, `currentTask` resolution moves "downstream" of
> worktree resolution in the handler pipeline.

<!-- -->

> **Work Organization Reform `active/{category}/` structure change.** WOR replaces the
> `active/{category}/` partition with a flatter `active/` shape. Slot paths that reference the
> current location (`taskListPath` in `currentTask`) need to compose with WOR's structure after it
> lands; not blocking, just sequencing-aware.

---

## Boundary Items (Defer to Other WUs)

Items found in the audit that the WU explicitly defers to other plans:

- **`manage-incidental-work.md` Pause/Resume protocol prose compression** (~150 tokens). Sits at
  the boundary with work-organization-reform's incidental-work lifecycle changes. PRD-time
  decision: rolls into this WU or follows WOR.
- **`session-init.md` Step 2 identity-absent + notes-load × dirty-tree interaction** (~30 tokens
  micro-optimization). Defer to coordinate with handoff-opt's structured Persistent Context
  triggers — that mechanism may share schema.
- **`activate-work-unit.md`, `integrate-work-unit.md`, `archive-work-unit.md`,
  `deactivate-work-unit.md`** — densest dispatch prose in the repo, but excluded as
  work-organization-reform territory. WOR may absorb some of this work; leftovers feed back into
  a follow-up content-density pass.

---

## Not Worth Pursuing (and Why)

Captured to prevent re-derivation when this plan is revisited. Each finding here was evaluated
during the audit and rejected for the stated reason.

### Extensions audit returned no findings

All eight extensions in `system/extensions/` are stub-shaped (~80-280 tokens each), seven contain
`[No extension configured]` and exist primarily as contracts. The consistent
`Workflow / Fires / Contract` blockquote pattern across all eight is **a feature**
(consistency-by-design — adopters fill in `.actions` against a uniform template), not redundancy.
No compression candidates.

### Most methods are already concise

`commit-format.md`, `diff-review.md`, `session-state.md`, `quality-gate-commands.md` are short
enough that compression yields diminishing returns. Modest wins exist in `review-triage.md`,
`test-first.md`, `issue-triage.md`, `commit-context-format.md` — all rolled into Pillar 1.

### Probe-failure fallback should stay prose (D3.6)

The fallback path is a *resilience feature* — when the composite probe fails, the agent needs
direct, inspectable instructions for the recovery commands. Folding this into the probe defeats its
purpose (the probe is what failed). Stays in workflow prose.

### Handoff Examples (`session-handoff.md` L320-L361) stay as prose

Two literal off-task-list examples illustrate the unbounded-Next-Action case. Example density is
already useful — compression would lose the worked-example value. Not a candidate.

### arc-handoff has no skill re-load overhead

Despite being a substantial workflow (~4200 tokens), `session-handoff.md` is loaded fresh on
arc-handoff invocation but does *not* re-read items 1-6 from session-init's load set. The file's
own prose density matters (Pillar 1 covers it), but skill-load overhead does not — the workflow
loads exactly once per handoff fire.

### arc-task-audit's wider task-list re-read is legitimate

The audit re-reads more of the task list than session-init's partial read because audit scope
exceeds session-init's window. This is correct behavior, not redundancy. Not a candidate.

### Pure prose-compression on dual-audience files

DEV-RULES.ARC, DEV-RULES.PROJECT, AGENT-BRIEF.ARC, AGENT-BRIEF.PROJECT have `audience` mixed or
human-primary. Prose density there serves human readers as much as agents. Out of scope —
compressing these would degrade the human-authoring experience for marginal token wins.

### "Compile workflows to JSON" (openprose-style)

Considered during the originating research conversation. Rejected: doubles the maintenance surface,
displaces probe envelope as the canonical "compiled" form, and ARC's design choice is that workflow
source IS the agent-readable form (with frontmatter as the structured surface). Not pursued.

### Forme-style semantic auto-wiring of method/extension references

Considered. Rejected: ARC method/extension references are already explicit in YAML frontmatter
(`arc.methods` / `arc.extensions`). Adding semantic resolution would replace one tool call (read
the named file) with model inference (figure out which file to read) — wrong direction.

### Run-trace-style audit envelopes per session

Considered. Rejected: ARC's audit story uses git history + status files + completion docs + commit
footers. Replicating openprose's per-run filesystem envelope would either duplicate that data or
replace the git-native model. Out of scope; not an efficiency win.

### Probe extension as user-overridable mechanism

Considered briefly during the originating discussion as a way to preserve adopter configurability
when moving logic to the CLI. Five middle-ground shapes were sketched (override-detection in probe,
two-tier envelope, manifest declarations on overrides, probe extensions analogous to workflow
extensions, config-gated CLI behavior). For *this* WU's scope, none of these new mechanisms are
required — the proposed envelope slots cover deterministic state computations that don't displace
existing method overrides. Patterns A and B (override-detection, two-tier envelope) remain
candidates if a future WU's scope requires probe-extension surface for adopter customization. Worth
returning to if the question surfaces concretely; not architecting speculatively here.

---

## Sibling Work Units

- **Session-Init Optimization** (✅ Complete, April 2026, PR #21) — direct precedent. Established
  the pattern: shift mechanical work from agent reasoning to CLI mechanism via probe envelope
  expansion + frontmatter-triggered loading. This WU extends that pattern into workflow body prose,
  skill-load discipline, and the next batch of envelope extensions.
- **Composable Workflows** (`draft-composable-workflows.md`) — **cohort keystone; hard prerequisite.**
  Owns the workflow contract shape this WU applies (Pillar 1), the agenda/fragment mechanism that subsumed
  Pillar 4, and the session-init rewire that collapses the prose D3.2/D3.3 targeted. Joined the cohort
  2026-07-02.
- **Loadset Composition** (`draft-loadset-composition.md`) — sibling. Owns T1 load-set policy and the
  process-task-loop core/detail split; this WU's prose-compression findings on that file fold in or
  sequence after the split. Shared `strategy-session-operations.md` edit surface (its demotion rule + this
  WU's tier-aware dedup principle land coherently — whoever lands first establishes the section).
- **Handoff Optimization** (`plan-handoff-optimization.md`) — sibling. Same playbook
  applied to session-handoff. **Soft coordination** (downgraded 2026-07-02) — see § Sequencing.
- **Documentation Surface Routing** (`plan-documentation-surface-routing.md`) — sibling.
  Absorbs this plan's Pillar 2 (skill cache discipline for `arc-commit`) and Pillar 1 cross-file
  de-dup items (atomicity rules across 3 surfaces; atomic-vs-task-list decision across 2
  surfaces). Cohort renames to `instruction-discipline` at planning kickoff. PRD-time scope
  trim on this plan removes the absorbed content.
- **Work Organization Reform** (`prd-work-organization-reform.md`) — soft prerequisite for
  boundary items in `manage-incidental-work.md`. WOR's incidental-work lifecycle changes may absorb
  some of Pillar 1's E2 finding.
- **arc-modes** (`plan-arc-modes.md`) — composability concern. Lite/Local probe shapes
  affect schema design for new envelope slots; see § Forward-Compat Callbacks.
- **Worktree Foundation** (`plan-worktree-foundation.md`) — composability concern.
  Worktree-aware probe affects `currentTask` resolution; see § Forward-Compat Callbacks.
- **Interlock & Release Routing Refinement** (`plan-interlock-release-refinement.md`) —
  cross-reference for the tier-aware deduplication principle captured in this plan's Pillar 1.
  The principle surfaced during that plan's rule-spread audit; lives here because it governs
  ARC content discipline broadly (not just interlock work). Whichever plan ships first should
  cite the other.

---

## Scope Estimate

**Small-to-medium after the 2026-07-02 re-anchor** (~2.5-4 sessions): Pillars 2 and 4 left the WU, and
half of Pillar 3 shipped externally. Roughly:

- **Pillar 3 residual (envelope batch):** ~1-1.5 sessions. D3.1 + D3.4 (shared helper with handoff-opt)
  as the pair; D3.5 + the D3.2 read-range residual opportunistic.
- **Pillar 1 (contract-shape application pass):** ~1-1.5 sessions. Per-file application of CW's D1 across
  the non-restructured corpus, findings inventory in hand; ships incrementally as atomic tasks.
- **Cross-file de-dup:** ~0.5 session. Pure consolidation work (tier-aware — see the principle in
  Pillar 1).
- **Verification + buffer:** ~0.5 session.

**PRD-time clarifications expected.**

- D3.4 sequencing: build alongside handoff-opt's `recommendedSummaryLine` (shared helper) or
  standalone follow-up?
- E2 (Pause/Resume) ownership and disposition, post-Worktree-Foundation.
- Whether Pillar 1 ships as one atomic-tasks-driven phase or splits into per-file PRs.
- Re-measured token baselines (the 2026-05-09 estimates are stale).

## Coordination — ADR-022

Per ADR-022, the probe slots that parse `meta-*` / `SESSION-NOTES` fields derive from the managed
operational-state document schema — not template-stabilized field names. Field retirement / addition is
a schema change (caught by round-trip tests), not a template edit. See
`adr-022-managed-operational-state-documents.md` § Coordination.
