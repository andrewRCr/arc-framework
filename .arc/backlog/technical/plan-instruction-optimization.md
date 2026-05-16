# Plan: Instruction Optimization

**Purpose:** Tighten ARC's agent-facing instruction surface — workflow prose, skill-load patterns,
and probe-envelope extensions — across the workflows and methods not addressed by the prior two
optimization WUs in the series. Third sibling to Session-Init Optimization and Handoff Optimization.

- **State:** Draft — pre-PRD exploration captured 2026-05-09 from external-research-informed audit.
  Iteration expected before PRD promotion. Sequencing deferred until Handoff Optimization
  (`plan-handoff-optimization.md`) lands and the parallelism trio + Work Organization Reform
  (`prd-work-organization-reform.md`) shapes settle.
- **Created:** 2026-05-09
- **Origin:** Surfaced 2026-05-09 from a token-efficiency audit of ARC's instruction surface.
  Audit found two prior WUs already covering most of the surface (Session-Init Optimization
  shipped, Handoff Optimization drafted) and identified a narrower-but-real remaining surface
  across three pillars: workflow body density not addressed by per-file architecture changes,
  skill re-load overhead not addressed by either prior WU, and probe-envelope extension candidates
  specific to session-init that don't conflict with handoff-opt's planned slots.

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

---

## Pillar 1: Workflow Prose Density Audit

Audit completed 2026-05-09. Findings cite `session-init.md`, `session-handoff.md`,
`3_process-task-loop.md`, `prepare-commits.md`, `manage-incidental-work.md`, `verify-work-unit.md`,
and methods/extensions. Lifecycle workflows reshaped by Work Organization Reform
(`prd-work-organization-reform.md`) are excluded from initial scope.

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
work-organization-reform** — flag at PRD time for ownership decision.

**Smaller wins:** `session-init.md` Step 7 trust hierarchy + examples (~150 tokens),
`session-init.md` Step 6 conditional orientation prose (~80 tokens pure-compression, more if
combined with D3.4), `session-handoff.md` skip-threshold prose (~120 tokens, coordinate with
handoff-opt), `3_process-task-loop.md` stop conditions (~70), structured prompt prefix/target
(~50), `verify-work-unit.md` state model + atomic-task disposition (~60 combined),
`prepare-commits.md` shared-docs commit pattern (~60).

### Cross-file de-duplication findings

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

### The arc-commit case

`arc-commit/SKILL.md` Step 3 explicitly directs the agent to read `commit-format.md` +
`commit-context-format.md` on every fire, with the reasoning *"both paths require this — the format
spec includes context footer patterns that are not safe to assume from memory."*

Combined token cost: ~870 tokens per fire. Under `commit_interlock: on-task-approval` (default once
Session-Operational Flow shipped) with multi-commit sessions, this compounds linearly:

- 3 commits = ~2600 tokens of method re-loads
- 6 commits = ~5200 tokens
- 10 commits = ~8700 tokens

The defensive re-read is correct in principle — format-detail drift is real and the failure mode
(malformed commit) is high-cost. The cost of the safety net is what's compounding.

### Other skills (audit)

- **arc-resume** is session-init; no re-load issue (canonical entry).
- **arc-handoff** loads `session-handoff.md` fresh on invocation but does not re-read items 1-6
  from session-init's load set. No re-load overlap.
- **arc-task-audit** re-reads the active status file (partial-to-partial) and a wider task-list
  scope. The wider task-list read is legitimate — audit scope exceeds session-init's partial read.
- **arc-task-review** has a small overlap on task-list completion notes. Minimal cost.
- **arc-verify** is CLI-driven; no overlap.
- **arc-plan** loads outside session-init's surface (plan docs, ADRs, project strategies, codebase).
  Possible ROADMAP re-read in next-work-discovery scenarios. Minimal cost.

**arc-commit is the outlier.** The other skills do not have meaningful per-fire re-load costs.

### Mechanism options for arc-commit specifically

Three candidates, ranked by likely fit:

**A. Session-init load-set inclusion.** Add `commit-format.md` + `commit-context-format.md` to
session-init's load set when `commit_interlock != manual` (i.e., when commits will fire mid-session).
Cost: ~870 tokens added to session-init orientation budget; benefit: zero re-loads across the
session. Net positive at ≥1 commit per session (the typical case under interlock release modes).
Trade-off: orientation budget pressure — the work that Session-Init Optimization just trimmed gets
partially undone.

**B. Cache hint in the skill body.** Modify arc-commit Step 3 to direct: "Read these unless they
were loaded earlier in this session — the format spec includes context footer patterns that are
not safe to assume from memory." The agent self-asserts whether the file is in context. Cost:
relies on agent honesty about context; benefit: zero CLI/structural change. Trade-off: weakens the
safety property the original prose set up; agents may drift in asserting context-presence.

**C. Compact reference card in session-init.** Generate a short reference card (~150 tokens) at
session-init time summarizing the load-bearing format patterns (regex, footer shape, scope tokens) —
included in the orientation. arc-commit reads only the full method when a complex commit warrants
it (see `prepare-commits.md`). Cost: structural change to skill behavior + reference-card
generation; benefit: reduces both load-set bloat (vs. A) and drift risk (vs. B).

PRD-time decision. **Lean B for incrementality** — cheap to ship, easy to reverse — with **A as the
harder fallback** if the cache-hint pattern proves unreliable. **C is the architecturally cleanest**
but requires the most design work and ties to the broader question of "what session-init
pre-computes for skill consumption."

### Generalization risk

Whatever pattern lands for arc-commit will set precedent for future skill cache-discipline
questions. Worth surfacing in the PRD: is this a case-by-case fix or a framework-level cache hint
that other skills can opt into?

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

### D3.2 — currentTask slot for graduated lookup (recommended biggest lift)

**Current:** `session-init.md` Step 3 item 9 has the agent run a graduated lookup (line hint →
task-number search → title search) on the active task list, then a grep for phase delimiters to
compute partial-read offsets. ~280 tokens of "how to find your spot" prose plus a structural
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

### D3.3 — lifecycleWorkflow path in envelope

**Current:** `session-init.md` Step 3 item 10 dispatches `sessionType` to one of three workflow
files. Probe already produces `sessionType`; the workflow path is hardcoded in agent prose.

**Proposed:** Add `lifecycleWorkflow: { path: string | null }` to `active` slot.

**Impact:** Marginal — ~40 tokens, 0 tool calls. Worthwhile only as a freebie when CLI changes in
this area are already happening.

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

| Candidate              | Tokens saved | Tool calls saved | Conflicts                                              |
|------------------------|--------------|------------------|--------------------------------------------------------|
| D3.1 freshness         | ~50          | 1-3              | None — pairs with handoff-opt                          |
| D3.2 currentTask       | ~150         | 1                | None — recommended biggest lift                        |
| D3.3 lifecycleWorkflow | ~40          | 0                | None                                                   |
| D3.4 orientationPrelude| ~150         | 0                | Symmetric with handoff-opt's `recommendedSummaryLine`  |
| D3.5 mismatches        | ~50          | 0-N              | None                                                   |

---

## Pillar 4: Conditional Content Loading

Pillars 1-3 reduce the cost of session-init's load-everything-then-dispatch shape (compress prose,
fold computation into envelope, eliminate skill re-loads) without changing the shape itself.
Pillar 4 changes the shape: agent loads only the workflow content that the probe state rules in.

### Motivation

The 99% session-init case needs identity present + single status file resolved + clean worktree
(or single-channel pull) + execution session-type + standard freshness + no orientation surfaces
beyond Active work state. Everything else — multiple-candidate disambiguation, identity-absent
fallback, probe-failure fallback, detached-head / diverged / dirty surfaces, conflict notes,
cross-machine resume gap, partial-push coherence, local-ahead notes — is content the agent reads
but doesn't use in any given session.

Surfaced concretely by Task 3.13 - `tasks-work-organization-reform.md` (Step 6 fifth conditional
surface for local-ahead notes plus a new Step 1 paragraph explaining the two-layer
`state` / `refState` model). Each addition is principled in isolation; the trajectory is
monotonic.

### Mechanism options

**P4.1 — Probe-rendered routing card.** Envelope adds `applicableSections: string[]` top-level
slot listing conditional sections live this session (e.g.,
`["dirty", "local-ahead-notes", "execution-session"]`). Workflow doc retains all sections, each
with an anchor. Agent partial-reads only listed sections plus always-loaded core (step framing,
load order, output discipline). Generalizes Pillar 3 D3.4 (composes one specific section's
content) to "declare which sections to load."

**P4.2 — Split core + edge files.** `session-init-core.md` (always loaded, ~80-120 lines) plus
per-edge or grouped edge files loaded on probe-triggered conditions. Cleaner separation than
P4.1; cost is source-of-truth dispersion — the failure mode Pillar 1's cross-file de-dup audit
specifically warns against.

**P4.3 — JIT loading discipline in workflow body.** Keep one file. Discipline conditional
sections to begin with explicit "Skip unless probe slot X is Y" gates. No CLI change. Agent
partial-read discipline carries savings; dispatch decision stays agent-side.

### Recommended lean (PRD-time)

**P4.1 with light P4.3 discipline.** Mirrors Pillar 3's envelope-as-canonical-dispatch-authority
pattern — the probe already knows which sections apply; surfacing that as a routing card is
incremental. P4.2 splits source-of-truth in the way the cross-file de-dup audit flagged as the
failure mode. P4.3 alone leaves dispatch agent-side and doesn't compound with the envelope
architecture established by prior optimization WUs.

### Surface candidates (initial sketch)

- `session-init.md` Step 6 conditional orientation surfaces (worktree state variants, dirty,
  local-ahead notes) — anchored, routed.
- `session-init.md` Step 1 conditional rules — identity-absent, role-contributor switch,
  probe-failure fallback. These are "load on condition" content within Step 1 itself.
- `session-init.md` Step 3 item 7 multiple-candidate disambiguation prose — load only when
  `active.resolution === "multiple"`.
- `session-init.md` Step 5 freshness check + next-work-discovery — load only when applicable
  (composes with D3.1 and D3.5).
- `session-init.md` Step 7 mismatch handling — load only when probe surfaces mismatches (depends
  on D3.5).

### Sequencing

**Hard prerequisite: handoff-opt lands first** (shared rationale with Pillars 1-3). **Soft
prerequisite: Pillar 3 D3.x slots ship first** — P4.1's routing card consumes the same envelope
the D3.x extensions populate; designing the routing card before D3.x stabilizes risks schema
churn.

**Composability:** arc-modes Lite/Full split needs mode-awareness on the `applicableSections`
schema (see § Forward-Compat Callbacks). Worktree Foundation's worktree-aware probe doesn't
directly interact with section routing.

### Conflict check

- **D3.4 (`recommendedOrientationPrelude`):** P4.1 generalizes the pattern; both ship together
  cleanly — routing card declares which sections to load, D3.4 composes the literal text one of
  those sections (orientation prelude) emits.
- **Pillar 1 prose-density compression:** complementary — compressed sections that are also
  conditionally loaded compound the savings.
- **Handoff-opt:** session-handoff carries the same load-everything-then-dispatch shape; P4.1's
  routing-card mechanism extends to handoff naturally. Cross-WU candidate to share helper.

### Estimated impact

Hard to quantify pre-PRD. Bounded estimate: in happy-path sessions (most sessions),
routing-card-driven loading could reduce workflow-prose read by ~40-60% (Step 6 conditional
sections are ~45 lines; Step 1 edge-case prose is ~15 of ~50 lines; Steps 3 / 5 / 7 each have
~30-50% conditional content). Edge-case sessions consume the same content as today; savings are
mode-dependent, not universal — but the mode that benefits is the common one.

---

## Recommended Biggest Lift

**D3.2 (currentTask slot).** Rationale:

1. Compounds with prior session-init optimizations. Per-file methods/extensions architecture already
   established the pattern; this is the most expensive remaining piece of prose-driven dispatch in
   `session-init.md`.
2. Eliminates a real tool call per session. Tool-call cost is round-trip latency, not just tokens.
3. Zero conflict with handoff-opt. Different surface, complementary pattern.
4. Unblocks the largest single-file prose compression in the audit (`session-init.md` L205-L233
   collapses from ~28 lines to ~10).
5. Single deliverable shape — pure CLI addition + workflow prose simplification. No handler-tier
   refactor, no new CLI subcommand, no migration.

If WU scope permits one task only, this is it. Roughly 1 session of work.

The runner-up — D3.1 freshness — is cheaper to ship but saves less prose. D3.4
(`recommendedOrientationPrelude`) is architecturally elegant but should be designed *with*
handoff-opt's `recommendedSummaryLine` to share the helper, so it's better scoped as a follow-up
after handoff-opt lands.

---

## Sequencing

**Hard prerequisite: handoff-opt lands first.** Two reasons:

1. D3.4's `recommendedOrientationPrelude` is symmetric with handoff-opt's `recommendedSummaryLine`.
   Designing this WU after handoff-opt means we extend the existing helper rather than
   duplicate-then-merge.
2. Pillar 1's `session-handoff.md` findings (Pass-2 prose compression, skip-threshold dispatch) need
   to compose with handoff-opt's mechanization of those same surfaces. Doing them in parallel risks
   scope confusion.

**Soft prerequisite: parallelism trio + work-organization-reform direction settled.** Most of this
WU's surface is unaffected (session-init prose, methods, skills are not directly restructured by
those WUs), but `manage-incidental-work.md` Pause/Resume sits at the boundary and needs ownership
clarity. Acceptable to start the WU before those land if Pillar 1's E2 finding is excluded from
initial scope and revisited as a follow-up.

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
> - `applicableSections` (Pillar 4) — Lite's compact workflow has a different conditional surface
>   than Full; the section vocabulary itself is mode-dependent. Schema needs Lite/Full split or a
>   per-mode section catalog.
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
- **Handoff Optimization** (`plan-handoff-optimization.md`) — sibling. Same playbook
  applied to session-handoff. **Hard prerequisite for sequencing** — see § Sequencing.
- **Work Organization Reform** (`prd-work-organization-reform.md`) — soft prerequisite for
  boundary items in `manage-incidental-work.md`. WOR's incidental-work lifecycle changes may absorb
  some of Pillar 1's E2 finding.
- **arc-modes** (`plan-arc-modes.md`) — composability concern. Lite/Local probe shapes
  affect schema design for new envelope slots; see § Forward-Compat Callbacks.
- **Worktree Foundation** (`plan-worktree-foundation.md`) — composability concern.
  Worktree-aware probe affects `currentTask` resolution; see § Forward-Compat Callbacks.

---

## Scope Estimate

**Medium.** ~4-7 sessions ballpark with Pillar 4 in scope (~3-5 without), depending on PRD-time
scope decisions. Roughly:

- **Pillar 3 (probe envelope extensions):** ~1.5-2 sessions. D3.2 (~1 session as the seed PR), plus
  D3.1 / D3.3 / D3.5 as follow-up tasks (~0.5-1 session combined). D3.4 deferred until handoff-opt
  lands.
- **Pillar 4 (conditional content loading):** ~1-2 sessions. P4.1 CLI inference + `applicableSections`
  slot + anchor convention on workflow doc + per-section partial-read discipline + tests.
  Soft-prereq on Pillar 3 D3.x sequencing.
- **Pillar 2 (skill cache discipline):** ~0.5-1 session. arc-commit-specific fix; mechanism
  decision (A/B/C) at PRD time.
- **Pillar 1 (workflow prose density):** ~1-1.5 sessions. Distributed across files; can ship
  incrementally as atomic tasks within the WU.
- **Cross-file de-dup:** ~0.5 session. Pure consolidation work.
- **Verification + buffer:** ~0.5 session.

**PRD-time clarifications expected.**

- Pillar 2 mechanism choice (A: load-set inclusion / B: cache hint / C: reference card).
- Pillar 4 mechanism choice (P4.1: routing card / P4.2: split files / P4.3: JIT discipline) plus
  whether to extend to handoff-opt's workflow as a cross-WU helper.
- D3.4 sequencing: build alongside handoff-opt's `recommendedSummaryLine` (shared helper) or
  standalone follow-up?
- E2 (Pause/Resume) ownership: this WU or work-organization-reform?
- Whether Pillar 1 ships as one atomic-tasks-driven phase or splits into per-file PRs.
- Whether the WU splits into multiple WUs along pillar lines (each pillar is internally coherent
  and could ship independently) or stays unified. Pillar 4 in particular is a natural split point
  if scope discipline argues for a focused conditional-loading WU.
