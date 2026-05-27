# Draft: Documentation Surface Routing

**Purpose:** Codify content discipline across ARC's task-adjacent documentation surfaces — commit
bodies, task-list completion notes (Outcome bullets), status-file pointers, SESSION-NOTES, notes
companions, PR descriptions — so each surface complements rather than duplicates the others.
Pair the content layer with a small mechanism layer (absorbing instruction-optimization Pillar 2's
arc-commit cache discipline) so the rules are not just codified but reliably consulted at compose
time.

- **State:** Draft — pre-PRD exploration captured 2026-05-20.
- **Created:** 2026-05-20
- **Origin:** Surfaced from a 2026-05-20 maintainer-side exploratory session diagnosing
  signal-to-noise across task-adjacent surfaces. Triggering example: Task 6.7.i in the parallel
  WOR execution session — commit body (`958e5a8b`, ~30 lines of prose) and task-list completion
  bullets (~36 lines) were substantively identical content, same facts, different format. The
  existing USER-INBOX entry on `Last Completed` / `Next Action` length drift (multi-occurrence:
  `2bda2d4c` → `f9e4f69a` → `c6c41f3d` → `20e893f9`) recognized as the same systemic pattern at
  the status-file pointer surface. External research (`research-doc-surface-routing.md`,
  same-day) confirmed no existing named anti-pattern in the broader ecosystem — this WU coins one.

---

## Problem / Motivation

The codified rules across task-adjacent surfaces already say "don't restate":

- `commit-format.md` — body is WHY + IMPACT; hard cap 100 lines but "prose moved to a doc" if
  approaching.
- `process-task-loop.md` § Completion protocol — Outcome bullet "earns signal" via synthesis /
  verification / cross-cutting impact; soft cap ~3 lines atomic / ~6 lines parent; explicit
  Exclude list naming "per-decision rationale already in the commit body or `notes-{name}.md`
  (link, don't restate)".
- `session-handoff.md` § Content discipline — "the status file is a project pointer, not session
  narrative"; ~2-line soft cap on `Last Completed` / `Next Action`; explicit routing — "commit
  body for what-and-why, SESSION-NOTES for next-session context, task list completion notes for
  per-task detail".

The intent is clear in the rules; behavior in practice drifts. Task 6.7.i is a clean live
example: ~30 lines of commit body and ~36 lines of substantially identical completion bullets —
the same record written twice in different formats. The USER-INBOX length-drift entry catalogs
the same pattern at the status-file pointer surface across multiple recent handoffs.

Root cause is not a missing rule. The rules exist. Root cause is twofold:

1. **Content failure** — routing rules are scattered and lack a single canonical home. Each
   surface's guidance carries its own slice of the routing matrix; no document carries the
   matrix whole. Cross-surface invariants ("Outcome is synthesis, not record"; "commit body is
   WHY + IMPACT"; "status pointer is one line") are restated piecemeal at each fire site.
2. **Mechanism failure** — canonical guidance loads inconsistently at compose time.
   `commit-format.md` + `commit-footer.md` load only on `arc-commit` invocation, defensively
   re-read every fire at ~870 tokens per cycle. Task-list Outcome guidance lives inside
   `process-task-loop.md` (loaded once per execution session). SESSION-NOTES guidance lives in
   `session-handoff.md` (loaded on arc-handoff). No shared loading point for cross-surface
   invariants. `instruction-optimization` Pillar 2 surfaced this exact problem already, narrowly
   scoped to arc-commit's cache discipline.

Both failure modes need addressing for behavioral drift to close. Codification without
salience-at-compose-time keeps drifting; salience without a coherent rule set creates new
salience for inconsistent rules.

## Working Framing

### Surface set and audience-per-surface

| Surface                  | Audience                         | Purpose                                                       |
|--------------------------|----------------------------------|---------------------------------------------------------------|
| Commit body              | Future code archaeology          | WHY + IMPACT; decisions; verification status                  |
| Task-list Outcome bullet | Integration-time review          | Synthesis from subtasks; spec → outcome traceability          |
| Status-file pointers     | Next session's session-init      | One-line pointers — what was done / what's next               |
| SESSION-NOTES            | Next session's agent (cold load) | Personal working context; what tracked surfaces don't carry   |
| `notes-*.md`             | Integration-time review + author | Free-form temporal scratchpad; trim-or-delete at integration  |
| PR description           | External reviewer                | Scope summary + test plan; review entry point                 |
| Handoff commit body      | Cross-machine resume / audit     | Handoff metadata + position pointer (recently codified)       |

### Routing principles

- **Synthesis over record.** The task list is a synthesis surface, not a record surface. Git
  history is the durable record; the task list is the navigation aid connecting spec to outcome.
  Some overlap is natural; each surface carries unique value, complementary rather than
  restating. Diagnostic test: if git history disappeared tomorrow, would the task list be a
  sufficient project record? No — so the task list is a synthesis surface.
- **Each surface earns its keep with what it uniquely offers.** Commit body offers
  archaeology-readable WHY. Task-list Outcome offers integration-time spec-to-outcome
  traceability. Status pointers offer one-glance orientation. SESSION-NOTES offers cold-load
  context. `notes-*.md` offers free-form working space.
- **Don't surface-restate.** When the same content appears in two task-adjacent surfaces in
  largely the same form, one of them is wrong — typically the surface with weaker audience-fit
  for that content.

### Anti-pattern naming

Deferred to PRD-time strategy-doc drafting. Current candidates: `surface restatement` (lean,
uses existing ARC vocabulary, becomes verbable), `cross-surface echo` (catchier; "echo" captures
duplication character), `co-located restatement` (most precise; least catchy). External research
confirms this is not yet a named pattern in the broader ecosystem — this WU coins one.

### `notes-*.md` positioning

`notes-*.md` is intentionally free-form. Positive boundaries are not the codification goal;
negative boundaries are — what does *not* belong, namely material that already lives in commit
body, task-list Outcome, status file, or SESSION-NOTES for the same work.

Characteristics carried forward to the strategy doc:

- Temporal scratchpad — captures audit results, debugging context, in-flight thinking that
  doesn't fit in task-list Outcomes.
- Examined at integration time — trim-or-delete judgment per content. Implementation-time
  references with no lasting value get deleted; design rationale or follow-on context gets
  trimmed and kept for archival.
- Scaffolded at create-prd time — when a plan-doc carries reference-level information feeding
  implementation, the create-prd workflow scaffolds `notes-*.md` from the plan-doc content
  before retiring the plan-doc (plans don't stick around once a PRD subsumes them).

## Proposed Shape

### Three-layer architecture

Cross-surface routing rules need to be invariant across multiple fire sites, but each fire site
already has its own loaded guidance. A universal "documentation routing" method loaded everywhere
would either duplicate content already at each fire site (commit-format already says "WHY +
IMPACT") or carry irrelevant guidance to each (arc-commit doesn't need task-list-Outcome guidance
at commit time). The architecture leverages ARC's tier-aware loading model:

**Tier 0 — `DEV-RULES.ARC` § Documentation Surface Routing (new section).** Always loaded.
Tight operational summary: the routing matrix as a table; one-line-per-surface for what each
carries and what it explicitly doesn't. Target ~15–25 lines. Carries the cross-surface
invariants.

**Tier 2 — `strategy-documentation-surface-routing.md` (new).** Design-time consulted.
Rationale-heavy: audience analysis, synthesis-vs-record philosophy, expanded "earns signal"
criterion, pass/fail worked examples, surface-by-surface positioning including `notes-*.md`
negative boundaries.

**Per-surface augmentation (no new methods).** Existing fire-site documents — `commit-format.md`,
`process-task-loop.md` § Completion protocol, `session-handoff.md` § Content discipline,
`template-pull-request.md`, `integrate-work-unit.md` — each get a thin alignment pass: cite
DEV-RULES.ARC § Documentation Surface Routing as canonical home; tighten surface-specific
operational language to match. Existing methods retain their override mechanic; no new methods
created.

Rejected alternative — universal method (e.g., `system/methods/doc-surface-routing.md`) loaded
by all relevant skills. The "method-shaped, loaded everywhere" version fails the
audience-per-fire-site test: arc-commit shouldn't load task-list-Outcome guidance; arc-handoff
shouldn't load commit-body guidance. Per-surface methods (one for each fire site) would
fragment the cross-surface invariants. The three-layer architecture lands the invariants at
tier 0 and lets existing methods carry their per-surface specifics.

### Mechanism fold-in: `instruction-optimization` Pillar 2

IO Pillar 2 covers arc-commit's defensive re-read of `commit-format.md` + `commit-footer.md`
(~870 tokens per fire; compounds across multi-commit sessions). IO plan enumerates three
candidates:

- **A — Session-init load-set inclusion** when `commit_interlock != manual`. Cost: ~870 tokens at
  orientation. Benefit: zero re-loads.
- **B — Cache hint in skill body**: read these unless loaded earlier in this session. Cheapest;
  relies on agent honesty about context-presence.
- **C — Compact reference card in session-init** (~150 tokens). Architecturally cleanest; ties
  to "what session-init pre-computes for skill consumption".

IO leans B with A as fallback and C as cleanest. This WU absorbs the mechanism choice into its
PRD scope. Rationale:

- The new tier-0 routing-matrix content is itself part of the cache-residency question — if the
  commit-time fire site re-loads commit-format, the cross-surface routing rule comes with it; if
  not, it needs a separate compose-time salience mechanism.
- IO Pillar 2 is concretely small (~0.5–1 session per IO plan); fold-in absorbs mechanism +
  content decisions together, avoiding coordination overhead.
- IO retains Pillars 1 (prose density, minus the cross-file de-dup items folded here), 3
  (envelope extensions), 4 (conditional content loading) — its main mass. The cohort still has
  two coherent sibling WUs.
- The folded-in Pillar 2 sets cache-discipline precedent that this WU's strategy doc directly
  consumes for the broader surface family.

PRD-time selection between A / B / C, with the option to ship a hybrid if per-surface fit varies.

### MVP scope

Four lobes. Targeted at "go all in and don't revisit" — maintainer-stated framing during
elicitation.

**Lobe 1: Rule consolidation.** New tier-0 DEV-RULES paragraph + new strategy doc + per-surface
alignment passes. Plus two cross-file de-dup wins folded here from IO Pillar 1:

- Atomicity / commit-grouping rules across `prepare-commits.md`, `arc-commit/SKILL.md`,
  `DEV-RULES.ARC.md` — make DEV-RULES.ARC canonical, link from others.
- Atomic-vs-task-list decision across `manage-incidental-work.md` and `process-task-loop.md` —
  make one canonical, link from the other.

**Lobe 2: Salience callouts at compose time.** Per-surface bright-line treatments modeled on
IRR's class-tag admonition pattern and the USER-INBOX length-drift entry's Option A — harder to
miss than paragraph text. Targets:

- `process-task-loop.md` § Completion protocol — Outcome composition callout naming the
  surface-restatement antipattern.
- `arc-commit/SKILL.md` — antipattern naming for cross-surface restatement at commit compose
  time.
- `session-handoff.md` § Content discipline — pointer-shape callout above the field-update block.
- CLAUDE.md / AGENTS.md — durable session-start guardrail referencing the canonical home.

**Lobe 3: Mechanical enforcement where it fits.** Narrowed by external research findings and
per-surface brittleness analysis:

- **Commit-body cap stays at 100 lines.** Research surfaced no external warrant for tightening —
  consensus across sources is "body length is purposeful, not arbitrary". The redundancy is the
  problem, not the cap. Already hook-enforceable.
- **Status-file pointer length hook.** Line-count check on `Last Completed` / `Next Action`
  field bodies; allowlist token for legitimate multi-file-scope exceptions. Composes with the
  USER-INBOX length-drift entry's Option B.
- **SESSION-NOTES partial-field hook.** Per-section line caps on pointer-shaped fields
  (Working On, Commit at Handoff); open-ended fields (Uncommitted Work, Additional Context)
  untouched.
- **Dropped from MVP:** body-vs-Outcome textual-duplication detection. Research surfaced no
  external precedent + technical difficulty (textual-similarity false-positives noisy). The
  strategy + salience layer carries that concern; review-time judgment catches what slips
  through. Potential future-WU item if the salience layer proves insufficient.

**Lobe 4: IO Pillar 2 mechanism implementation.** Implement the chosen A / B / C (or hybrid)
from the fold-in. arc-commit Step 3 edits as applicable; possibly session-init load-set
additions; possibly reference-card generator.

### Surface treatments (atomic-task-shaped)

- **Commit body:** alignment pass on `commit-format.md` to cite DEV-RULES routing rule; no cap
  change.
- **Task-list Outcome:** alignment pass on `process-task-loop.md` § Completion protocol; tighten
  Exclude list; add antipattern naming.
- **Status-file pointers:** alignment pass on `session-handoff.md` § Content discipline; hook
  lands here.
- **SESSION-NOTES:** alignment pass on the template + partial-field hook.
- **`notes-*.md`:** new positive-shape framing in the strategy doc; negative-boundary rule in
  DEV-RULES routing matrix; no template change (free-form by intent).
- **PR description:** verify alignment of `template-pull-request.md` + `integrate-work-unit.md`
  Step 5 guidance with new routing rules. Likely no edits needed.
- **Handoff commit body:** verify alignment of recently-codified shape with new routing rules.
  Likely no edits needed.

## Coordination

### With `instruction-optimization`

- **Pillar 2 fold-in:** this WU absorbs arc-commit cache-discipline mechanism choice +
  implementation. IO plan-doc updates to remove Pillar 2 from its scope; cross-reference added.
- **Pillar 1 cross-file de-dup fold-in:** atomicity / commit-grouping rule consolidation
  (3 surfaces) and atomic-vs-task-list decision consolidation (2 surfaces) move from IO Pillar 1
  to this WU's Lobe 1. Same domain; coherent with the consolidation framing here.
- **Sibling cohort:** both remain in the cohort. Cohort renames to `instruction-discipline` at
  planning kickoff. Cohort axis after rename: canonical guidance coherence across content +
  mechanism.

### With `interlock-release-refinement`

- **Shared edit surfaces:** `DEV-RULES.ARC.md` § Commit Discipline, `process-task-loop.md`,
  `arc-commit/SKILL.md`, CLAUDE.md / AGENTS.md. IRR's wrapper-routing migration + approval-
  provenance guard touch the same files.
- **Task-interlock bypass concern (2026-05-20 recurrence):** stays in IRR scope. The concern is
  already act-pending-design as IRR's "Approval-provenance gap on direct arc-commit invocations"
  item (multi-occurrence: 2026-05-11 first-watch → 2026-05-16 trigger-fired → 2026-05-20
  third-occurrence). IRR plan-doc gets a recurrence-evidence note with the parallel-session
  diagnostic detail; no new scope migrates to this WU.
- **Salience-point coordination:** both WUs need to agree on which surfaces carry which
  callouts. CLAUDE.md / AGENTS.md is the likely shared compose-time salience point for both
  concerns. Coordinate at PRD time.

### With Work Organization Reform

- **Sequencing:** post-WOR integration. WOR touches many of the same surfaces (workflows,
  strategies, DEV-RULES, hooks, templates); concurrent work would tangle.
- **Cohort directory location:** this WU's plan-doc lives under `agent-context-optimization/`
  during the current cohort name; rename to `instruction-discipline/` lands at planning kickoff
  (when this WU activates, post-WOR + post-handoff-opt). Cohort rename is a coordinated batch:
  directory rename + the two existing sibling meta files + notes-WOR worksheet (if WOR notes
  still live by then) + ROADMAP refs.

### With scalable-core (ADR-020)

- **Ownership split:** this WU owns *what* completion surfaces carry (the synthesis-over-record routing);
  ADR-020 owns *whether* `completed/` persists (the `archive.preserve` toggle). Complementary, no overlap.
- **Supplies the toggle's value-prop:** the synthesis-vs-record framing is what `archive.preserve: false`
  trades away — not the record (git holds that, P6) but the durable *synthesis* layer. ADR-020 cites this
  framing directly.
- **Reinforcing:** as this WU succeeds in making completion notes less restate-y of git (more pure
  synthesis), the archive becomes less reconstructable from git → the cost of deleting rises → reinforces
  `archive.preserve: true` as the correct default.

### With existing capture surfaces

- **USER-INBOX `Meta-file Last Completed / Next Action length drift` entry:** folds into this
  WU's MVP. The multi-occurrence drift record (`2bda2d4c`, `f9e4f69a` → `c6c41f3d`, `20e893f9`)
  preserves as origin material. The entry's four remediation options (A salience callout / B
  mechanical line-count check / C retro-audit / D worked-example pair) translate to the broader
  surface family.
- **ROADMAP:** new WU entry + cohort rename references land at planning kickoff, not during
  plan-doc drafting.

## Research Foundation

External research distilled to `research-doc-surface-routing.md` (2026-05-20, ~2,600 words,
24 sources). Findings most material to this plan:

- **No named anti-pattern exists** in the broader ecosystem for "duplication between commit body
  and task-tracker outcome notes". This WU coins one; naming deferred to PRD-time strategy-doc
  drafting.
- **Body length is "purposeful, not arbitrary"** is the strongest consensus across sources. The
  50/72 width rule is universal; total length caps are rare and divergent. Confirms keeping
  ARC's 100-line cap as-is.
- **Agentic-tool verbosity is a recognized 2024–2026 failure mode** with detail-level flags
  emerging as a solution shape — no tool enforces dedup against task trackers. ARC is early
  in this space; precedent will likely follow rather than lead.
- **References belong in footers, not bodies** — near-universal. ARC's existing `Context:`
  footer convention is already aligned.
- **Closing-note conventions diverge sharply** across PM tools — no universal standard for
  task-list Outcome shape, leaving design freedom without violating external norms.

Strategy doc's audience-analysis section consumes the research findings directly at PRD time.

## Open Questions (PRD-time)

- **Anti-pattern name resolution.** `surface restatement` lean; alternatives `cross-surface
  echo`, `co-located restatement`; or other emerging from strategy-doc audience analysis.
- **IO Pillar 2 mechanism choice.** A (load-set inclusion) / B (cache hint) / C (reference
  card) / hybrid. Per-surface fit may favor different choices.
- **Per-surface salience-callout exact wording.** IRR's class-tag admonition pattern is the
  model; worked drafts needed at PRD time.
- **Status-pointer hook allowlist mechanism.** Comment-style token? Field-level annotation? Per
  the USER-INBOX entry's caution about false-positives on legitimate multi-file scopes.
- **CLAUDE.md / AGENTS.md guardrail composition with IRR.** Single combined guardrail covering
  both task-interlock approval and cross-surface restatement, or two separate? Resolve jointly
  at PRD time.
- **PR description + handoff commit body alignment verification.** Verify no edits needed, or
  surface any required adjustments. Atomic-task work; outcome confirmed at PRD-time audit.
- **Future scope re-entry.** If salience layer proves insufficient post-ship, body-vs-Outcome
  duplication detection re-enters as a future-WU candidate.
- **Interim project-doctrine surface routing (captured from Worktree Foundation planning, 2026-05-24).**
  Some `WORKING-MEMORY.md` entries are project *interim-doctrine* ("use pattern X until WU-Y ships") —
  broadly-applicable and removal-triggered — rather than personal scaffolding. WF resolved that ARC adds
  no project-scoped *ephemeral* tier (shared-ephemeral collapses into ceremony; loading it at everyone's
  init spends attention without consent). The residual routing question lands here: should this content
  route to a **tracked, reviewed, init-loaded** surface with explicit removal triggers — for ARC the
  init-loaded home is a demarcated interim section of `AGENT-BRIEF.PROJECT` / `DEV-RULES.PROJECT`, not a
  discover-by-asking CONTRIBUTING the agent never reads — while truly-personal scaffolding stays in
  user-scoped `WORKING-MEMORY`? Near-moot solo; real in team mode (interim doctrine becomes visible +
  reviewed instead of invisible + duplicated). **Constraint:** any removal-trigger-bearing surface needs
  a paired evaluation cadence or it rots; for a tracked surface that cadence is review-time discipline,
  distinct from the user-scoped handoff/probe sweep (see `handoff-optimization` item 3).

## Alternatives Considered

- **Universal "documentation routing" method loaded everywhere.** Rejected. Would either
  duplicate content already at each fire site or carry irrelevant guidance to each. Fails the
  audience-per-fire-site test.
- **Task list as record surface (all-in-one-place).** Considered with maintainer-invited
  pushback. Rejected. Git history is the durable record; task list is the navigation aid
  connecting spec to outcome.
- **Strategy doc only, no DEV-RULES paragraph.** Rejected per the tier-aware deduplication
  principle (operational decision tree must be self-contained at tier 0 / 1; strategies provide
  rationale + edge cases at tier 2). A tier-2-only strategy fails to surface at compose time.
- **Body-vs-Outcome textual-duplication detection in MVP.** Considered. Dropped per research
  finding (no external precedent + technical difficulty). Potential future-WU item.
- **Hard-prereq sequencing on IO Pillar 2.** Considered. Rejected in favor of fold-in to avoid
  idle waiting; IO Pillar 2 scope is small enough to absorb cleanly.
- **Per-surface methods (one for each fire site).** Considered as middle ground between
  universal method and per-surface augmentation. Rejected — fragments cross-surface invariants
  and creates new methods where existing fire-site documents already serve the load points.

## Sequencing

**Hard prereqs:**

- **WOR integration.** WOR touches many of the same surfaces; concurrent work tangles.
- **Handoff Optimization integration.** Inherited from IO's prereq — IO's Pillar 2 mechanism
  shape composes with handoff-opt's structured Persistent Context triggers if cache-resident.
  The Pillar 2 fold-in inherits the same prereq.

**Soft prereqs / coordination:**

- **Land before or alongside IRR's wrapper-routing migration** — shared CLAUDE.md / AGENTS.md +
  `arc-commit/SKILL.md` edit surfaces. If this WU lands first, IRR adopts the established
  routing-matrix vocabulary; if IRR lands first, this WU adopts IRR's approval-provenance
  vocabulary. Either order works; coordination is on shared-file edits, not on conceptual
  dependency.
- **Sequencing with IO's remaining pillars** — IO Pillars 1 (minus fold-ins), 3, 4 can ship in
  any order relative to this WU; no shared surfaces except the cross-file de-dup items folded
  here.

**Cohort rename + per-WU subdir creation:** atomic edit at planning kickoff (this WU's
activation). Touches the directory rename, the two existing cohort-member meta files
(handoff-optimization, instruction-optimization), `notes-work-organization-reform.md` worksheet
(if WOR notes still live by then; otherwise the archived version), and ROADMAP references.

## Scope Estimate

**Medium WU.** Surface ripples across multiple files; each ripple small.

- **Lobe 1 (rule consolidation):** ~1 session. New DEV-RULES paragraph + strategy doc draft +
  per-surface alignment passes + cross-file de-dup folds.
- **Lobe 2 (salience callouts):** ~0.5–1 session. Per-surface bright-line callouts; some
  iteration to land the right shape.
- **Lobe 3 (mechanical enforcement):** ~1 session. Hook implementation for status-pointer +
  SESSION-NOTES partial-field cap; allowlist mechanism; smoke tests.
- **Lobe 4 (IO Pillar 2 mechanism):** ~0.5–1 session. Implement chosen A / B / C; arc-commit
  Step 3 edits as applicable.
- **Verification + buffer:** ~0.5 session.

**Total:** ~3.5–4.5 sessions. PRD will sharpen the estimate.

## Future Iteration Items

- **Codified-shape prototypes in markdown.** Pair task-list completion bullets with the commits
  that reference them, demonstrating pass/fail shapes side-by-side. Lives in the strategy doc's
  worked-example section at PRD time; lightweight inline mock-ups during plan iteration.
- **PR description content discipline as first-class scope.** Currently in scope as
  alignment-verification only. If verification surfaces material gaps, escalate to first-class
  scope.
- **External-research refresh on agentic-tool conventions.** This space evolves fast (2024–2026
  sources show emerging patterns). Refresh if PRD-promotion delays beyond a year.
- **Body-vs-Outcome duplication detection.** Dropped from MVP per research + technical
  difficulty. Re-evaluate post-ship if salience + review-time judgment prove insufficient.

## Sibling Work Units

- **`instruction-optimization`** — direct sibling. Cohort rename to `instruction-discipline` at
  planning kickoff. Pillar 2 + Pillar 1 cross-file de-dup folded here; IO retains Pillars 1
  (remaining), 3, 4.
- **`handoff-optimization`** — cohort sibling. Hard prereq for IO inherited as soft prereq here
  per the Pillar 2 fold-in.
- **`interlock-release-refinement`** — shares edit surfaces (`DEV-RULES.ARC.md`,
  `process-task-loop.md`, `arc-commit/SKILL.md`, CLAUDE.md / AGENTS.md). Task-interlock bypass
  concern stays in IRR. Coordination at PRD time on CLAUDE.md / AGENTS.md guardrail
  composition.
- **Work Organization Reform** — hard prereq (post-WOR integration). WOR surfaces in motion
  through Phase 6.7+ ripple sweeps; concurrent work tangles.

## Provenance

Captured 2026-05-20 in maintainer-side exploratory session. The parallel-session example
(Task 6.7.i, `958e5a8b`) provided the triggering diagnostic. Framing emerged through:

- Recognition of the codified-rules-vs-behavioral-drift gap across three closely-related
  surfaces.
- Cross-referencing with the existing USER-INBOX length-drift entry as the same systemic
  pattern at a different surface.
- IO Pillar 2 examination — surfacing the mechanism half of the problem (canonical guidance
  loaded inconsistently).
- Architecture refinement through invited maintainer pushback: rejected universal-method shape;
  arrived at the three-layer architecture leveraging tier-aware deduplication.
- External research (2026-05-20, ~2,600 words, 24 sources) grounding the design space and
  confirming this WU coins a not-yet-named anti-pattern.

---

## Coordination — ADR-022

Per ADR-022, the `SESSION-NOTES` / meta pointer-field length hooks become schema-derived — the managed
operational-state document schema owns the field set and which fields are pointer-shaped vs. free-text,
so enforcement reads from one schema rather than per-field hooks. See
`adr-022-managed-operational-state-documents.md` § Coordination.
