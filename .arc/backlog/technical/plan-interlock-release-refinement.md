# Plan: Interlock & Release Routing Refinement

**Purpose:** Authoritative home for ARC's interlock-and-wrapper-routing evolution — codifying
"approval is approval; routing follows opt-in plus interlock mode" as the underlying simplification
and stitching together the cross-cutting concerns that touch it. Aggregates work-in-flight,
shipped evolution, and deferred/provisional items previously scattered across the active WU's
atomic companion and the personal atomic inbox.

- **State:** Draft — captured 2026-05-16. Pre-PRD.
- **Created:** 2026-05-16
- **Origin:** Mid-WOR (2026-05-16) interlock-prompt-shape audit surfaced two structural concerns:
  (a) the implied-approval-scope rule landed yesterday for prompt shape but not for routing;
  (b) interlock-mode lookup was 3 doc-hops from the prompt-composition decision point. Fixing
  the visibility half (today's `b2d8162d`) surfaced the navigability cost of interlock work
  being split across 4+ surfaces (atomic companion, project-shared atomic inbox, three different
  backlog plan docs). Consolidation into a dedicated plan keeps the cross-cutting cross-references
  to the other plans while making "where does interlock work stand" answerable from one place.

---

## Problem / Motivation

The core simplification ARC is reaching for: **one approval per unit of work; routing follows
`releaseOptedIn` plus interlock mode.** Two recent commits moved meaningful pieces of this in:

- `4d98a1ce` (2026-05-15) codified the *approval/prompt-shape* half — DEV-RULES.ARC §
  Implied-approval scope rule, `process-task-loop` § Incidental Commit Discipline, class-tag
  admonition pattern in `strategy-workflow-authoring.md`. Applied across 5 Phase 3 boundary
  workflows.
- `b2d8162d` (2026-05-16) closed the *prompt-composition visibility* gap — `commit.interlock` /
  `push.interlock` surfaced in the session-init envelope's `config.settings`; DEV-RULES.ARC
  § Implied-approval scope gains the prompt-prefix mapping inline.

What remains is mostly *routing-half* work:

- **Wrapper invocation is documented as "trigger-bounded"** — off-workflow incidentals route to
  raw `git` regardless of opt-in. Under the implied-approval-scope rule, that constraint no
  longer earns its weight: approval provenance IS the trigger. The wrapper's interlock-state
  validation still fires (refuses if no fresh approval); the trust shift becomes "wrapper
  carries any valid approval-provenance to git" rather than "wrapper only at codified fire
  sites."
- **Class-tag admonition coverage is partial** — the convention adopted in 5 Phase 3 boundary
  workflows; remaining class-tag-using workflows (session-handoff, prepare-commits, the
  arc-commit skill, others) carry the legacy unmarked shape, leaving inconsistent visual cues
  for wrapper-routed fire sites.
- **Approval-provenance is reconstructed** at every commit site rather than carried as session
  state. Composes with this plan and with `plan-commit-increments.md`'s deferred-review framing.

## Shipped Landscape

- **`strategy-interlock-release-wrappers.md`** — canonical strategy for the wrapper layer and
  interlock model (architecture: gate-vs-fire ontology, opt-in trust shift, audit umbrella).
  This plan's work flows into edits to that strategy doc plus DEV-RULES.ARC § Commit Discipline.
- **`4d98a1ce` (2026-05-15) "codify implied-approval scope + class-tag admonition"** — see
  Problem / Motivation above for what landed.
- **`b2d8162d` (2026-05-16) "surface interlock modes at prompt-composition decision point"** —
  envelope payload + DEV-RULES rule mapping; closes today's interlock-prompt-shape miss.
- **Earlier interlock/wrapper history:** Release Wrappers Foundation (shipped, archived under
  `reference/archive/2026-q2/technical/08_release-wrappers-foundation/`) plus the
  Release Wrappers Ergonomics PRD (archived).

## In-Flight / Planned

### Extend wrapper routing to off-workflow incidental commits under release-mode interlocks

- *Premise:* Once an incidental commit has approval provenance (per implied-approval-scope), the
  wrapper's binding to "codified trigger points" is satisfied by the structured-prompt approval —
  the approval gate IS the trigger point. The wrapper's interlock-state validation still fires
  (refuses if no fresh approval provenance), preserving the audit/trust properties without the
  workflow-vs-incidental routing axis.

- *Proposed changes:*
    - **DEV-RULES.ARC § Release-wrapper invocation:** retire the "Off-workflow commits ... use
      raw `git`" clause. Replace with: under `releaseOptedIn: true` + non-`manual`
      `commitInterlock`, all commits with structured approval provenance route through wrapper
      (workflow-emitted and incidental alike); under `manual` or `!releaseOptedIn`, raw `git`.
      Class tags retain their documentary role; routing consolidates around opt-in + interlock
      mode.
    - **`strategy-interlock-release-wrappers.md` § Scope:** rewrite the "Triggered Commits Only"
      subsection around approval-provenance rather than fire-site-binding. The trust shift
      becomes "wrapper carries approval provenance to git" — provenance can originate from task
      interlock, workflow interlock, or structured implicit-approval prompt. Harness bypass
      mode framing carries forward but for a different boundary (commits without ARC
      approval-provenance at all — e.g., direct shell-driven fixups outside an agent session).
      Fold a § Review-Increment Invariant cross-ref into § Overview and/or § Trust Model during
      this rewrite — the Layer 1 codification (DEV-RULES.ARC § Review-Increment Invariant)
      landed inline 2026-05-16 and this strategy is the operating-mechanics home that should
      explicitly cite it.
    - **`process-task-loop` § Incidental Commit Discipline:** flip "routing follows existing
      rules" to a concrete statement aligned with the new DEV-RULES rule. Add a worked example.
    - **`releaseRouting` envelope payload:** today carries `taskCommit` / `workflowCommit` /
      `workflowPush` as three separate routes. Consider folding into a single `commit` / `push`
      routing decision once the workflow-vs-incidental axis is retired. Or retain the three
      keys but add an `incidentalCommit` key (routing-equivalent to `taskCommit` under
      release-mode interlocks) so off-workflow fire sites have an explicit lookup target.
      Decide at impl.

- *Scope:* Quick-tier minimum — touches DEV-RULES.ARC (constitutional), a flagship strategy doc,
  a load-bearing workflow, and likely the session-init envelope CLI code. ADR-light treatment
  warranted since this reverses the explicit "trigger-bounded" framing in
  `strategy-interlock-release-wrappers.md`.

- *Captured during:* 2026-05-16 commit-routing audit (`93b50a4a`'s raw-`git` use matched current
  docs but not user intent). User confirmed the routing migration as the originally-intended
  companion to yesterday's implied-approval-scope codification.

## Watch / Provisional

### Approval-provenance gap on direct `arc-commit` invocations

- *Observation* (2026-05-11 wrapper-vs-raw audit): release wrappers are execution mechanics, not
  approval mechanics. They should only remove redundant commit/push prompts after the user has
  already approved the relevant work through a task, workflow, or explicit diff-review interlock.
  A possible risk remains: an agent may invoke `arc-commit` directly after completing
  substantive changes that the user has not yet reviewed, and release routing could then turn
  that into a wrapper commit without the intended work-approval provenance.

- *Watch-and-wait posture (superseded):* Originally captured for visibility only — first watch
  whether the gap actually manifests. If observed, consider adding an approval-provenance clause
  to `arc-commit` / commit discipline so the skill verifies one of: task approval,
  workflow-interlock approval, explicit commit approval, or a routine ceremony surface before
  invoking release-routed commits.

- *Trigger fired (2026-05-16):* Observed in WOR session — agent invoked `arc release commit` for
  off-task incidental work after user correction on wrapper usage, without prior structured
  approval gate. Meets the documented escalation criterion. Posture flips watch → act-pending-design;
  the approval-provenance guard in `arc-commit` becomes the next concrete piece of this plan after
  the wrapper-routing migration. Layer 1 codification landed inline same-session (DEV-RULES.ARC
  § Review-Increment Invariant + AGENT-BRIEF.ARC vocabulary + process-task-loop cross-ref retarget)
  raises the constitutional floor; the mechanism work here implements against it.

- *Composition:* The wrapper-routing migration above raises the stakes on this item — if all
  release-mode commits route through wrapper (including incidentals), the surface area where
  agent-invoked `arc-commit` without prior approval could fire expands. Sequencing: ship
  wrapper-routing migration first, then provenance guard.

- *Scope if promoted:* Small-to-medium documentation/skill hardening. Likely touches
  `.codex/skills/arc-commit/SKILL.md`, shipped `system/skills/arc-commit/SKILL.md`, and possibly
  DEV-RULES.ARC / `strategy-interlock-release-wrappers.md` depending on where the invariant
  belongs.

### Class-tag fire-site admonition sweep across remaining workflows

- *Observation* (2026-05-13 WOR planning iteration handoff): agent invoked raw `git commit` for
  a `chore(status): handoff` commit instead of `arc release commit`. `session-handoff.md` Step 3's
  class-tagged fire site (`workflowCommit` + message body in `text` codeblock) should have routed
  to wrapper given `releaseRouting.value.workflowCommit: "wrapper"`. The convention IS specified
  correctly in DEV-RULES.ARC; what tripped the agent was that the in-workflow cue was implicit.
  Four mitigation options considered; option (4) admonition variant adopted.

- *Status* (2026-05-15): option (4) admonition variant adopted in 5 Phase 3 boundary workflows
  (`init-work-unit.md`, `activate-work-unit.md`, `integrate-work-unit.md`,
  `archive-work-unit.md`, `1_create-prd.md`) alongside the implied-approval-scope rule. Options
  (1) inline cue, (2) frontmatter declaration, and (3) DEV-RULES procedural emphasis all
  superseded — option (4) solves the underlying agent-attention concern at the fire site itself.

- *Remaining sweep:* Apply option (4) admonition across other class-tag-using workflows —
  `session-handoff.md`, `prepare-commits.md`, the `arc-commit` skill, and any others identified
  during the sweep. Mechanical edit; ~1-3 lines per fire site.

- *Sequencing:* Defer until post-WOR — WOR is currently mid-restructure of several adjacent
  workflows (Phase 3 + 3.11). Folding in mid-WOR would tangle with the restructure scope.
  Post-WOR (and post-arc-plan-conductor + worktree-trio if they touch the same workflows) is the
  right sequencing.

### Pre-report checklist prefix verification

- *Observation* (2026-05-09 + 2026-05-14): agent twice emitted `Proceed to <next>?` instead of
  `Commit and proceed to <next>?` after task completion under releasing interlock settings
  (`on-task-approval` once, `on-workflow` once). `process-task-loop` § Completion protocol
  documents the prefix mapping one section above the Pre-Report Checklist, but the checklist
  itself (4 items) doesn't name prefix selection — the verification step where the prompt
  is actually constructed.

- *Recurrence flipped posture* from watch to act-on: two-occurrence pattern spans both
  releasing settings; drift is not config-specific. Same root mechanism as the class-tag
  fire-site cue concern above — procedural-rule elision at the moment of action.

- *Proposed fix:* Add a fifth item to the Pre-Report Checklist in `3_process-task-loop.md`
  § Completion protocol naming prefix selection against the resolved interlock mode (now
  surfaced in `commit.interlock` from today's `b2d8162d`). Package source primary; `.arc/`
  mirror byte-identical. Atomic-tier edit (~3 lines in each copy). Session-init's
  structured-prompt shape stays untouched per ADR-016.

- *Composition:* A3 (orientation surface) and this checklist item both increase prefix-selection
  salience — different points in the construction flow (init-time orientation surface vs
  completion-time checklist gate). Could land together or separately.

### Orientation surface for non-`manual` interlock modes (A3 from interlock-visibility atomic)

- *Premise:* Today's `b2d8162d` puts `commit.interlock` / `push.interlock` in the envelope and
  inlines the prefix mapping in DEV-RULES.ARC. A3 (the deferred third change in the original
  atomic) would additionally surface the active modes at orientation when not `manual` —
  analogous to worktree non-clean-state surfacing in session-init Step 6.

- *Trade-off:* Highest-salience signal at prompt-composition time, but adds steady-state
  orientation overhead in every session where wrappers are active. Decide after A1+A2 settle in
  use — if the inline mapping plus envelope visibility prove sufficient, A3 is over-engineering.

- *Scope:* Small workflow-doc change in session-init.md Step 6 (canonical + package-source
  mirror). No CLI code change required — value is already in the envelope payload.

## Cross-Plan Coordination

Three sibling plan docs carry observations that compose with this plan's scope but belong in
their respective domains:

- **`plan-customization-architecture.md` § Open Questions (e)** — interlock enum granularity
  (`manual` / `on-task-approval` / `on-workflow` simplification). The enum design lives in
  customization-architecture's territory (affects all of ARC's interlock-shaped configs); this
  plan consumes whichever decision lands. Cross-reference both ways.
- **`plan-commit-increments.md` § Unknowns** — first-class approval-provenance state. Genuinely
  cross-cutting: composes with deferred-review's scope-declaration framing AND with this plan's
  wrapper-routing migration. Living in commit-increments because the deferred-review framing is
  the concrete demonstration; this plan's watch-item above re-surfaces the approval-provenance
  question from the wrapper angle.
- **`plan-instruction-optimization.md` § Pillar 1 Cross-file de-duplication** — tier-aware
  deduplication principle. Not an interlock concern per se, but surfaced during this plan's
  rule-spread audit. The principle governs how interlock work gets documented (operational
  decision tree at tier-0/1; rationale at tier-2).

## Sequencing

No firm upstream blockers. Soft preferences:

- **Wait until post-WOR** for the class-tag admonition sweep (avoid tangling with WOR's
  remaining workflow restructures).
- **Wrapper-routing migration can ship any time post-WOR** — independent of the visibility fix
  already shipped; doesn't depend on the enum-granularity decision in
  `plan-customization-architecture.md` (the migration works under any of the candidate enum
  shapes). If the customization-architecture decision lands first, the migration absorbs the
  resulting enum; if this plan lands first, the customization plan's text adjusts to the
  retired routing axis.
- **A3 (orientation surface)** — decide after the visibility fix settles in use; could ride
  the wrapper-routing migration or stay deferred indefinitely.

## Status / Next Action

**Status:** Draft. Pre-PRD exploration; no PRD yet.

**Next action:** When picked up, start with the wrapper-routing migration (the In-Flight item).
ADR-light decision record probably wanted since it reverses documented "trigger-bounded" framing.
After that, decide whether A3 and the class-tag-admonition sweep ride this same WU or get
separate atomic handling.

## Provenance

Originally captured 2026-05-16 mid-WOR. Two atomic entries (WU-scoped: B routing migration;
project-shared: approval-provenance watch; project-shared: class-tag fire-site cue sweep) plus
A3 from today's interlock-visibility atomic consolidated here as the authoritative home. The
three sibling plans (customization-architecture, commit-increments, instruction-optimization)
retain their cross-cutting items with bidirectional cross-references.
