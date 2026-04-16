# Plan: Session-Init Optimization

**Purpose:** Reduce the token cost of session initialization from ~40k loadset (observed ~70–80k
at orientation completion with harness overhead) toward a defensible floor of ~22–28k, without
losing session consistency or forcing adopters to trust agent "intuition" in place of loaded
guidance. Primary mechanism: shift front-loaded reference content to JIT (just-in-time) loading
via reliable, explicit workflow triggers. Secondary mechanism: file-level content hygiene on the
remaining init load set.

**Status:** Draft (problem well-framed, alternatives evaluated, phase structure sketched;
open questions flagged for PRD-time resolution)
**Created:** 2026-04-16
**Origin:** The atomic task in `atomic-work-status-restructure.md` captured an observed drift in
session-init token usage (~29–35k → ~45–50k → ~75–80k over several weeks) and commissioned a
file-by-file content audit. The audit ran during the session-init that preceded this plan, and
surfaced a larger architectural opportunity: the current front-load is belt-and-suspenders over
an already-reliable trigger system. The file-by-file cuts are worthwhile on their own; the
architectural shift is worth substantially more.

---

## Problem / Motivation

ARC's session-init currently loads a large document set up front. The rationale is sound: agents
with ephemeral context benefit from having principles, rules, strategies, and reference material
in context before work begins. But the load set has drifted upward over time, and a fresh audit
shows meaningful over-loading:

- **~40k tokens of loadset content** read at every session initialization (maintainer, active
  task work)
- **Observed ~70–80k tokens at orientation completion** (loadset + harness + tool schemas + skill
  registry + init work products)
- Several files are loaded in full when the workflow's intent is a targeted scan
  (`arc-methods.md`, `arc-extensions.md`)
- Several files are loaded in full when only a subsection is init-relevant
  (`QUICK-REFERENCE.md`, `DEV-RULES.ARC.md`)
- Several files carry user-documentation weight that agents don't need at init
  (`arc-config.yml`: 7 KB total, 700 B of actual settings)

At the same time, the framework already ships a reliable trigger system for on-demand loading:

- **Method-dependencies blocks** at the top of three primary workflows (`integrate-work-unit.md`,
  `prepare-commits.md`, `3_process-task-loop.md`) explicitly instruct agents to load specific
  method sections when encountered
- **Extension hook anchors** (`· #post-task-quality`, `· #post-context-load`, etc.) at every
  workflow consumption point flag where extension steps should be checked
- **Workflow cross-references** at every config decision point

The front-load was never a substitute for these triggers — it was a belt-and-suspenders
safety net. With triggers already reliable, the safety net's cost (40k tokens every init) is
larger than the risk it mitigates.

**Why this matters beyond personal ergonomics:** 70–80k tokens before the first unit of work
begins is a hard sell for adopters. ARC's configurability architecture carries inherent overhead
that a centralized-for-solo-use design wouldn't, and that's defensible — but the CURRENT
overhead exceeds the architectural floor by a material margin. Bringing the loadset to ~22–28k
keeps ARC's principles intact while making the framework viable for teams who don't have
unlimited token budgets to burn on orientation.

## Working Thesis

**The shift from front-load to JIT-with-reliable-triggers is viable, and the triggers are
already in place.** The work isn't adding a new system — it's recognizing that the existing
trigger system is adequate, formalizing the expectation that agents use it, and removing the
now-redundant front-load.

Three sub-theses:

1. **Triggers are reliable.** Evidence: method-dependencies blocks exist in the three workflows
   that consume methods; extension hooks have explicit anchors at every consumption point;
   config values are referenced explicitly at their decision points. No trigger strengthening
   is required — only verification and (if gaps are found) targeted patches.

2. **Agent discipline can be elevated to a constitutional rule.** The residual risk of JIT
   (agent proceeds past a trigger without loading the referenced content) is mitigated by adding
   a DEV-RULES.ARC rule making load-on-trigger explicit behavior, plus a CI-checkable property
   that every method and extension has at least one reliable workflow trigger.

3. **File-by-file hygiene is complementary, not competitive.** Even after JIT migration, the
   remaining init load set has trim opportunities (QUICK-REFERENCE sections, DEV-RULES.ARC
   reference tables, STRATEGY-INDEX verbosity, task list partial-read scope). These are
   independent wins that compound with the architectural shift.

## Alternatives Considered

**Option A — Status quo (belt-and-suspenders):** Keep front-loading. Trade tokens for certainty.

- Rejected: current cost is high enough that adopters may abandon the framework rather than
  internalize a ~75k-token orientation ceremony. The trigger system being already-reliable means
  the certainty being bought is largely redundant.

**Option B — File splitting into `.internal/`:** Separate framework-shipped defaults from
user-editable surfaces (e.g., `arc-methods.overrides.md` + `.internal/arc-methods.defaults.md`).

- Rejected (for methods/extensions): Post-JIT, token savings are marginal; user DX suffers
  from two-file lookup; `.internal/` is a machine-artifact directory, not a place for
  user-reference documentation. See § Architectural Decisions.
- Partially adopted (for arc-config): a visible sibling file (`arc-config.defaults.yml` in
  `system/`, not `.internal/`) is clean because arc-config is read at every init.

**Option C — Index + lazy-load pattern:** Replace the init load set with a thin "INIT-INDEX.md"
listing what's in each file, loading specific sections only when needed.

- Rejected: brittle, high spec cost, complex trigger semantics, hurts agent correctness
  (can't reliably know which sections to read when).

**Option D — JIT-with-reliable-triggers (this plan):** Recognize triggers are already
sufficient; remove front-loads; formalize the load-on-trigger expectation as a constitutional
rule; verify trigger completeness via a CI check.

- Selected. Preserves canonical sources, adds no drift surface, scales as framework grows,
  captures both architectural and file-level savings.

## Architectural Decisions

These are settled (pending PRD review); documented here so future readers understand the
reasoning:

### D1. Sibling files over `.internal/` for user-reference content

`.internal/` is established in `.arc/system/.internal/` (currently holds `manifest.json` and
`pristine.json` — machine artifacts). Framework defaults, method default procedures, and
extension contracts are user-reference material — adopters legitimately need to consult them
("what's the default I'm inheriting? what does this hook do?"). They belong in visible files,
not `.internal/`.

### D2. Split arc-config; do not split arc-methods / arc-extensions

- **arc-config** is read at every session init. Splitting user values (slim) from canonical
  defaults (sibling file `arc-config.defaults.yml` in `system/`) earns its keep per-init.
- **arc-methods** and **arc-extensions** are read on-trigger only (post-JIT). Per-trigger cost
  is already lean; splitting adds two-file lookup friction with negligible token benefit.

The asymmetry is justified by read-frequency, not arbitrary. Document this reasoning in the WU's
ADR or plan-* archival notes so future maintainers don't wonder.

### D3. Constitutional rule anchors the JIT behavior

Add a new rule to `DEV-RULES.ARC.md` (candidate section: § Verification and Discovery, subsection
"Method and extension loading"). Short, imperative, P10-anchored:

> When a workflow step references a method, extension, or strategy, load the relevant section
> before acting on that step unless it's already in context. Don't proceed from intuition when
> a governing rule is one link away.

This makes the behavior durable — not dependent on agent discretion or one-off workflow wording.

### D4. Session-init workflow restructuring is in scope

Originally noted as out-of-scope in the atomic. Reconsidered: once arc-methods, arc-extensions,
and arc-config drop out of Step 2's parallel batch, the batch itself shrinks. Step 4
(configuration check) can likely merge with Step 3 or become a tiny inline grep. Prose in
Step 7 (mismatch handling) can tighten. Additional savings of ~1,000–2,000 tokens are available
from structural condensation without restructuring the semantic flow.

## Phased Approach

The work breaks into seven phases. Phase ordering matters: trigger verification before
front-load removal (so we know JIT is safe); constitutional rule before or with front-load
removal (so agent behavior expectation is explicit at the moment of cutover).

### Phase 1 — Trigger completeness audit + strengthening

- Audit every method, extension, and config key: confirm ≥1 reliable workflow trigger exists
- Strengthen any weak triggers inline (imperative framing, explicit load instruction,
  method-dependencies block where one is missing)
- Land a framework-sync-style CI check: every method in `arc-methods.md` has ≥1 workflow
  reference; every extension in `arc-extensions.md` has ≥1 consumption point
- Expected outcome: no gaps (initial grep suggested none, but needs thorough verification
  pass)

### Phase 2 — Constitutional rule

- Add "Method and extension loading" subsection to DEV-RULES.ARC § Verification and Discovery
- Cross-reference from `arc-methods.md` preamble and workflow method-dependencies blocks
- Update `AGENT-BRIEFING.ARC.md` if needed to surface the rule during init

### Phase 3 — Remove primary front-loads

- `arc-methods.md`: remove from Step 2 parallel batch; Step 4 item 2 becomes grep-based
  presence check (count `[No override configured]` vs `.override` sections; report active
  overrides only if present)
- `arc-extensions.md`: Step 3 tightened to read-only `## post-context-load` section via
  offset+limit; other extension sections load at their respective workflow trigger points
- `arc-config.yml`: split into `arc-config.yml` (user values + "what does this do" comments)
  and `arc-config.defaults.yml` (sibling in `system/`, framework-shipped canonical defaults);
  agent reads both at init (KV-only from user file via grep filter, full from defaults file);
  user file trims from ~165 lines to ~30–40 lines
- Sync all framework file edits to both `.arc/` and `packages/arc-framework/arc/` per
  package-project-sync strategy

### Phase 4 — Session-init workflow restructuring

- Shrink Step 2 parallel batch (removes arc-methods.md, arc-extensions.md from batched reads)
- Merge or collapse Step 4 (configuration check) — now minimal after Phase 3
- Tighten Step 7 (mismatch handling) prose
- Preserve semantic flow (no reordering of gated steps)
- Update embedded examples and freshness-check guidance to match new batch structure

### Phase 5 — Secondary trims (from file-by-file audit)

- **QUICK-REFERENCE.md:** Session-init Item 7 reads only `## Environment & Path Context` +
  `## Runtime Environment` sections; Command Patterns, Quality Gate Commands, ARC CLI
  Commands, anti-patterns load on-demand when agent runs a command needing the reference
- **DEV-RULES.ARC.md:** Move the "Leave it cleaner" routing table into `arc-methods.md §
  issue-triage.default` (co-locate table with its trigger method — more natural home);
  compress examples in "Documentation Boundaries" from ~12 to 3; trim "When to Load Additional
  Guidance" to a 3-line pointer (redundant with workflow self-references)
- **STRATEGY-INDEX.md:** Compress to one-line-per-strategy with terse trigger; move adoption
  guidance and usage protocol to a separate README or the strategy docs page

### Phase 6 — Task-list partial-read narrow

- Update Session-init Item 10 partial-read spec to "Header + Overview + Scope + current phase
  preamble + current task section"
- Explicitly skip completed phases' preambles — they're stale historical context at init
- Verify the graduated triple-anchor lookup still resolves cleanly under the narrower read

### Phase 7 — Verification + before/after measurement

- Run clean session-init against a representative active task list
- Record token count at orientation completion (via statusline plugin or equivalent)
- Compare against pre-WU baseline (the ~75–80k observation)
- Document realized delta in WU archival notes
- If delta is materially short of estimates (>30% off), surface the gap for analysis before
  archival

## Scope Estimate

**Medium-Large (1–2 weeks of focused work).** Phase 1 is investigative (audit + targeted
strengthening, probably low-touch); Phase 2 is a small constitutional edit; Phase 3 is the
largest code surface (arc-config split + sibling file + framework-sync + template updates);
Phase 4 is prose condensation with careful preservation of semantic flow; Phases 5–6 are
file-by-file surgery; Phase 7 is measurement and reporting.

**Two-copy discipline:** every framework file edit (DEV-RULES.ARC, session-init.md, arc-methods.md,
arc-extensions.md, arc-config.yml, QUICK-REFERENCE.md, STRATEGY-INDEX.md, process-task-loop.md)
requires sync between `packages/arc-framework/arc/` and `.arc/`. The framework-sync integration
test will catch drift.

**CLI implications:** `arc init` and `arc update` need updates to handle the new
`arc-config.defaults.yml` sibling file (install it; on update, three-way-merge `arc-config.yml`
against the previous vs. new defaults to surface new settings to adopters). This is a
meaningful CLI-side change, not just docs.

## Unknowns and Open Questions

These are flagged for PRD-time resolution:

1. **Where exactly does the "Leave it cleaner" routing table live after Phase 5?** Candidates:
   `arc-methods.md § issue-triage.default` (the method that triages pre-existing issues, so
   natural home); a dedicated on-demand-loaded strategy doc; the `manage-incidental-work.md`
   workflow. Need to pick one before editing.

2. **arc-config.defaults.yml format.** YAML KV is obvious, but do we want structured metadata
   per setting (e.g., `{ default: X, options: [X, Y], description: "..." }`) to enable future
   `arc verify` tooling, or plain KV? Structured is flexible; plain is simpler. Decide at PRD.

3. **Behavior when `arc-config.defaults.yml` is missing or corrupt.** On a fresh clone without
   the file, does agent fail init (hard gate) or fall back to a defaults list baked into
   session-init.md? Hard gate is cleaner; fallback is more forgiving. Defensiveness choice.

4. **CLI `arc update` flow for introducing the sibling file.** How does an existing adopter
   transition? Auto-install on next `arc update`? Prompt for confirmation? Pre-migration
   compatibility mode? Needs thought before merge.

5. **Framework-sync test expansion.** Phase 1 adds a check that every method/extension has a
   reliable trigger. Writing this check requires deciding what "reliable" means concretely
   (presence of a method-dependencies block? imperative framing in workflow prose?
   reference-link count threshold?). Probably starts as "≥1 reference to the method's anchor
   from a non-arc-methods file," refined as needed.

6. **Measurement rigor for Phase 7.** Statusline token counts include harness overhead we
   can't audit. Do we measure pre/post at orientation completion (loadset + harness) as
   one number, or try to isolate loadset (more work, more accurate)? Probably fine to measure
   orientation completion and note the loadset delta separately.

7. **Deferred splits for methods/extensions.** D2 defers these splits. Do we add an explicit
   backlog entry (`plan-arc-methods-override-split.md` or similar) so the deferral is a queued
   follow-up rather than a footnote? Leaning yes, to make the architectural intent durable.

## Dependencies and Constraints

**Depends on:** The Work-Status Restructure WU (currently in flight on
`technical/work-status-restructure` branch) must land before this WU activates. Rationale:

- Phase 3 and Phase 4 edit `session-init.md`, which is heavily restructured in the current WU.
  Overlapping edits would create painful merge conflicts.
- The current WU's Persistent Context (mid-restructure interim state on WORK-STATUS path) needs
  to clear before session-init optimization can assume a stable substrate.

**Does not block:** arcd-rebrand WU, other planning work.

**Scope discipline:**

- **In scope:** session-init load set (items 1–11 + config reads), session-init workflow
  itself, DEV-RULES.ARC trim, STRATEGY-INDEX trim, arc-config split, constitutional rule
  addition, CI trigger-completeness check.
- **Out of scope:** arc-methods.md / arc-extensions.md file splits (deferred per D2);
  document classification system (T1/T2/T3 from strategy-session-operations.md);
  method or extension design changes; anything that affects WUs currently in flight.

**Adopter impact:** This WU ships breaking-for-update changes — existing adopters on older
framework versions will need `arc update` to install the new `arc-config.defaults.yml`,
restructured `arc-config.yml` comments, and constitutional rule. The CLI's three-way merge
handles configurable files, so user customizations are preserved. Release note should clearly
flag the change.

## Success Criteria

- Observed tokens-at-orientation-completion drops by ≥20% (from ~75–80k to ≤60k) in a clean
  maintainer session with active task work
- No regressions in session-init correctness: every orientation summary section (active work
  state, blockers, non-default config, freshness, next action) remains accurate
- Framework-sync test passes (every method / extension has ≥1 reliable trigger)
- DEV-RULES.ARC "Method and extension loading" rule is landed and cross-referenced from
  relevant workflows
- Adopter-facing changes (arc-config split, constitutional rule) are documented in release
  notes with clear upgrade guidance

## References

- **Origin:** `atomic-work-status-restructure.md` § "Audit session-init context load for
  token-usage reductions" — the atomic task that commissioned the audit
- **Audit findings:** Preserved in the conversation that led to this plan (to be captured in
  WU notes file during PRD creation)
- **Related strategies:** `strategy-session-operations.md` (context loading tiers),
  `strategy-configurability-architecture.md` (override mechanisms), `strategy-package-project-sync.md`
  (two-copy discipline)
- **Related ADRs:** ADR-013 (method loading model) — may need Tier 2 amendment if constitutional
  rule adds new semantics
- **Dependent WUs:** `technical/work-status-restructure` (in flight) — must merge first
