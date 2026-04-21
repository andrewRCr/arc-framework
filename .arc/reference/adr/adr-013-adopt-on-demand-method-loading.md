# ADR-013: Adopt On-Demand Method Loading via Workflow Directives

## Status

Accepted

## Context

ARC's session initialization workflow loads all constitutional, state, and procedural context upfront — including
the full contents of `arc-methods.md` (~360 lines containing 8 method defaults). The session-init Step 4 instructs
agents to "scan arc-methods.md for active overrides," which in practice means reading the entire file into context,
including all `.default` sections regardless of whether their associated activities will occur during the session.

**The problem is instruction density, not line count.** Method defaults are dense procedural content — decision
trees (test-first), severity triage rubrics (leave-it-cleaner), format specifications (commit-format,
commit-context-format), and classification systems (review-triage). Research on context degradation (documented in
the Session Management Strategy) shows that agent performance degrades with context volume, and procedural
instructions — which require active instruction-following — are disproportionately expensive compared to reference
material or behavioral principles.

In a typical task execution session, an agent may use 2-3 of the 8 methods. Commit methods load only when
committing; integration methods load only at work unit completion; session-state loads only at handoff. Loading all
8 upfront means ~200 lines of dense procedural content competing for attention throughout the session, never used.

**The problem scales with adoption.** Method overrides are dense procedural instructions replacing defaults. An
adopter who overrides 3 methods adds ~60-150 lines of custom procedural content to the session-init load. Combined
with populated extensions and non-default configuration, the init-time context cost grows with project maturity —
precisely when teams most need lean, focused agent sessions.

**Existing precedent within ARC.** Workflow documents (process-task-loop, prepare-commits, integrate-work-unit) and
strategy documents are already loaded on-demand — DEV-RULES § When to Load Additional Guidance explicitly says
"load them when you reach the relevant work." arc-methods is the outlier: procedural content loaded upfront despite
having clear, established trigger points in the workflows that reference it.

**External validation.** OpenViking (ByteDance's context database for AI agents) independently arrived at a
three-tier progressive loading model (L0/L1/L2) with materialized abstracts for rapid filtering and full content
loaded on-demand. ARC's existing patterns — strategy indexes as navigation layers, session-init docs as
constitutional context, on-demand workflows as procedural detail — map naturally to a tiered model. Formalizing
this and extending it to arc-methods aligns ARC with a validated approach.

**Alternatives considered:**

1. **Status quo** — Continue loading all arc-methods at init. Simple, no changes needed. Accepts the
   attention-dilution cost as tolerable. Does not scale well for adopters with multiple overrides.
2. **Split arc-methods into individual files** — One file per method, loaded independently. Maximum granularity
   but increases file count and maintenance overhead. Makes the method dependency table harder to maintain.
   Unnecessary when section-level reads of the unified file are sufficient.
3. **Override registry in arc-config.yml** — Add a `methods.overrides` key listing methods with active overrides,
   eliminating the need to scan arc-methods.md at init. Creates a synchronization burden — updating an override
   requires editing two files. Fragile.
4. **Workflow-embedded loading directives (chosen)** — Workflows already reference methods. Make those references
   explicit loading instructions. Methods load on-demand at their natural trigger points. arc-methods.md stays
   unified. Session-init scans only for override presence.

## Decision

We will make arc-methods defaults and overrides on-demand content, loaded by workflow-embedded directives at their
natural trigger points rather than at session initialization.

**Session-init change (Step 4):** The arc-methods scan becomes an override-presence check. The agent reads only
the Contents/dependency table and `.override` subsection headings. If an override has content beyond
`[No override configured]`, the agent notes the method name. No `.default` content is read. The output is a brief
index: "Methods with overrides: [list]" or "all methods at defaults."

**Workflow changes:** Each workflow that depends on arc-methods includes a method dependencies block listing the
methods it uses. When the agent first encounters a method reference during workflow execution, it loads the
relevant section of arc-methods.md — checking `.override` first, falling back to `.default`.

**Method classification by trigger:**

| Method                | Trigger Workflow    | Applicability                            |
|-----------------------|---------------------|------------------------------------------|
| leave-it-cleaner      | process-task-loop   | Universal — every task execution session |
| quality-gate-commands | process-task-loop   | Universal — every task execution session |
| test-first            | process-task-loop   | Conditional — test-first marker present  |
| commit-format         | prepare-commits     | User-triggered commit events             |
| commit-context-format | prepare-commits     | User-triggered commit events             |
| diff-review           | integrate-work-unit | Integration phase only                   |
| review-triage         | integrate-work-unit | Integration phase only                   |
| session-state         | session-handoff     | Session end only                         |

**Formalized tiering model:** This decision is accompanied by a new Context Loading Strategy
(`strategy-context-loading.md`) that formalizes the three-tier model implicit in ARC's existing architecture:
T1 (constitutional — always loaded), T2 (state — always loaded), T3 (procedural — on-demand). The strategy
provides classification criteria for new content and documents the loading mechanisms (session-init,
workflow-embedded directives, strategy-index triggers, user-invocable skills).

## Consequences

### Positive

- **Reduced init-time context cost.** Session initialization skips ~300 lines of procedural method content.
  Methods load only when their workflow triggers, so sessions that never commit, integrate, or execute test-first
  tasks avoid loading those methods entirely.
- **Better signal-to-noise ratio.** Constitutional and state content — the guidance that governs all behavior —
  gets undiluted attention at session start. Procedural instructions arrive at the moment they're actionable,
  when the agent's attention is focused on the relevant activity.
- **Adopter scaling.** Method overrides (which are dense procedural instructions) no longer accumulate in
  session-init context. An adopter with 5 overrides pays zero init-time cost; each override loads on-demand.
- **Consistent architecture.** arc-methods loading now follows the same on-demand pattern as workflows and
  strategies. The loading model is uniform: T1/T2 at init, T3 on-demand.
- **Explicit tiering model.** The accompanying strategy document gives framework maintainers and adopters a
  classification framework for new content. "Which tier does this belong in?" has a clear answer path.

### Negative

- **Two-hop loading chain.** Method content is now two hops from the always-loaded context: DEV-RULES (loaded)
  → workflow (on-demand) → method (on-demand). If an agent skips the workflow, it misses the method. Mitigated
  by the fact that workflow loading is already an established, reliable pattern — agents that skip workflows are
  already violating the methodology regardless of method loading.
- **Workflow document changes.** Each method-dependent workflow gains a method dependencies block. This is a
  small addition (~3-5 lines per workflow) but touches multiple files.
- **Override scan requires judgment.** Agents must distinguish "scan for override presence" from "read everything"
  during session-init. This is a softer instruction than "read in full." Mitigated by explicit phrasing in the
  updated session-init Step 4.

### Risks

- **Agent compliance variance.** Different agents may interpret "scan for override presence" differently. Some
  may read more than intended. Monitor across agent platforms during initial adoption. The downside of
  over-reading is the status quo (everything loaded at init), not incorrect behavior.
- **Method loading omission.** An agent executing a quick commit without loading prepare-commits might not load
  commit-format. Mitigated by the arc-commit skill (which references the workflow) and by DEV-RULES retaining
  the "When to Load Additional Guidance" section as a T1 safety net.

### Amendments

**Amendment (2026-04-08):** The `strategy-context-loading.md` referenced in the Decision section was never created
as a standalone file. Its content — the three-tier loading model (T1/T2/T3), classification criteria, and loading
mechanisms — was absorbed into `strategy-session-operations.md` during the methodology maturation work unit, which
consolidated session management and context loading into a single strategy.

**Amendment (2026-04-20):** The method-loading model landed substantively more structure than this ADR's Decision
described. Captured during the session-init-optimization work unit:

- **Per-file restructure replaces aggregate files.** `arc-methods.md` and `arc-extensions.md` were retired; methods
  and extensions now live as per-file entries under `system/methods/` and `system/extensions/`. Each file carries
  YAML frontmatter with fields `name`, `description`, `related`, plus `override-active` (methods) or `active`
  (extensions). Extension terminology reconciled — legacy `has-steps`/`.steps` became `active`/`.actions`. The
  `workflow` field was deliberately omitted (no mechanical consumer, lossy on fan-out; the reverse index stays in
  the strategy's classification table). Per-file body conventions are codified in
  `strategy-session-operations.md § Per-file Body Conventions`.

- **Workflow frontmatter is the trigger contract.** Workflows declare their method and extension dependencies in
  `arc.methods` / `arc.extensions` frontmatter arrays — the authoritative load contract. In-step markdown links
  remain for reader navigation but no longer constitute the trigger. This replaces the original "method
  dependencies block" (prose preamble) approach with a structural, machine-readable one.

- **Constitutional pair codified across T1 and T3.** The author-side declaration rule lives in
  `strategy-workflow-authoring.md § Author-side Declaration Rule` (T3, on-demand — workflow authoring is rare). The
  agent-side compliance rule lives in `DEV-RULES.ARC § Verification and Discovery § Method and extension loading`
  (T1, every session — loading compliance is universal behavior). The T1/T3 split matches load frequency to
  operational need rather than pairing both rules in a single location.

- **Name-collision resolution.** The `pre-merge-review` method collided with the same-named extension. The method
  was renamed to `diff-review` and its contract broadened from pre-merge-specific to a generic review activity
  reusable across workflows and skills.

- **CI-enforced reliable-trigger invariant.** `audit-method-triggers.ts` runs in the CI quality job and fails when
  any method or extension lacks a workflow `arc.methods` / `arc.extensions` declaration. This operationalizes the
  author-side declaration rule as a structural, machine-checked gate — replacing the prose-grep enforcement the
  original approach would have required.

The original decision's direction holds: on-demand loading via workflow-embedded triggers, with session-init
doing minimal init-time work. This amendment concretizes the implementation — workflow-embedded triggers became
frontmatter arrays; the original override-presence scan split asymmetrically under the landed model (methods
carry no init read — bodies load at workflow trigger; extensions are enumerated by a single
`grep -l "^active: true"` producing the active-extensions list consumed by fire-point directives); compliance
reliability is now backed by a CI gate rather than relying on agent discipline alone.
