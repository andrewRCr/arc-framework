# Draft: Interlock & Release Routing Refinement

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

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Teach `arc release` to accept no-active-WU ceremony commits/pushes (archival + errands)**

- *Routed from:* `USER-INBOX § Atomic`, work-routing-discipline housekeep drain (2026-06-01); errand instance
  added at the follow-up housekeep drain (2026-06-01).
- *Concern:* the archive ceremony's `workflowCommit` + final `workflowPush` route to the wrapper per release
  routing, but the archival commit is the one that sweeps `meta-*` out of `active/`, so by commit/push time the
  wrapper's active-WU precondition cannot resolve and it refuses (code 10) — forcing a raw-`git` fallback for a
  routine ceremony. **Same root in errand shape:** `run-errand` tags its commit `taskCommit` (→ wrapper per
  release routing), but an errand has no active WU at all, so `arc release commit` refuses with the same
  `no-active-wu` code 10 — hit 4× draining errands this session. **Third instance — decomposition** (routed from
  `USER-INBOX § Backlog`, 2026-06-14): a `decompose-work-unit` ceremony that retires the only active WU leaves
  `active/` empty at commit time, so the wrapper has nothing to validate and refuses (hit live on the
  `lifecycle-state-machine` decomposition). Add decomposition to the enumerated no-active-WU ceremony list.
  All are legitimate no-active-WU ceremony contexts the precondition wrongly rejects.
- *Resolution (decided at drain — wrapper-teaching):* teach the wrapper to recognize valid no-active-WU contexts
  — the archival commit moving `active/ → completed/`, AND the errand's `chore/<slug>` + `standalone` footer —
  and accept them; validate the alternate provenance instead of an active WU rather than refusing. The doc-only
  alternative (codifying these fire-sites as raw-routed) was set aside in favor of wrapper support. CLI change to
  the release wrapper's precondition check.
- *Extracted as a standalone work unit (2026-06-17):* this whole entry — the wrapper-precondition fix accepting
  no-active-WU ceremony commits/pushes (archival, errand, decomposition, standalone) — is **carved out of this WU
  and built as its own Light WU**, ahead of the cohort, to stop recurring friction (it bit the 2026-06-17 housekeep
  drain itself; hit 4× draining errands earlier). Sized as a WU, not an errand: grounding in the code surfaced a
  live design call — **acceptance strictness**, blanket-accept-on-zero-candidates vs. positively-validate-ceremony-
  provenance (the commit leg can read the `Context: standalone (…)` / archival footer, but the push leg has no
  message and must key off branch shape) — plus a two-handler + resolver + test-matrix surface over the granularity
  line. The fix must also **keep refusing the multi-candidate ambiguity** case (today both collapse to code 10).
  The dependent facets below (archival-ceremony tooling, errand approval-collapse) stay here and build on the
  shipped wrapper change.
- *Coordination:* dedups with the archival-ceremony-tooling concern now folded in directly below (its remaining
  facets), routed here when `BACKLOG-INBOX` was retired (2026-06-01).

### `[ ]` **Archival ceremony: `archive-work-unit` finalize step + `completed/`-aware footer hook**

- *Routed from:* `BACKLOG-INBOX` (archival-ceremony-tooling), work-routing-discipline retirement pass
  (2026-06-01). The capture's wrapper facet is the entry above; this carries the remainder.
- *Concern:* hit live during an integration, two residual facets. (1) **`archive-work-unit` finalize step** —
  `archive-work-unit.md` says "State flip is the only transition archive owns," yet `template-meta.md` mandates a
  PR URL + Completed post-integration block (and stale forward-fields like `Next Action` want clearing); no
  workflow steps through it, so it was done by hand. Add an explicit "append PR URL + Completed, reconcile
  forward-fields" step to the archive/integrate workflow per `template-meta.md`. (2) **`completed/`-aware footer
  hook** — the `commit-msg` footer check warned the `Context:` footer file wasn't in `.arc/active/` because the
  sweep had already moved it to `completed/`; make the check `completed/`-aware for `(archival)` footers. The
  concrete hook fix is already captured as the subdir-loop migration entry in `ATOMIC-INBOX` — so the net-new
  work here is the workflow finalize step; the hook facet is cross-referenced, not duplicated.
- *Scope:* Quick-tier — a workflow step plus a hook tweak that rides the wrapper-archival work above.

### `[ ]` **Errand approval-collapse: one increment-approval releases the full tail (commit → push → merge → delete)**

- *Routed from:* follow-up housekeep drain (2026-06-01), surfaced running this session's errands.
- *Concern:* an errand is one review increment by definition, so the diff approved at the workflow-interlock IS
  the complete shipping diff — yet the agent re-prompts at the integration-interlock, and the harness prompts
  again for each of commit, push, merge, and branch-delete. Four-plus permission stops for a single approved
  one-line change. The wrapper-routing work above covers the *commit* leg by approval-provenance, not the
  errand-specific collapse of the whole tail.
- *Shape (provisional):* a configurable mode — modeled on `commit.interlock: on-task-approval` (the existing
  "one approval releases the next" precedent) — where a single errand increment-approval arms the rest:
  commit + push + merge + branch-delete fire without re-prompting, with CI + `pre-merge-review` still gating the
  actual merge (auto-merge-style). Trigger framed as *one increment* (an errand-class property), not "one
  commit." Self-review/lane-aware: in a team the integration stop still carries cross-owner review weight, so
  the collapse is opt-in and self-review-scoped.
- *New surface this exposes:* `push` has `arc release push`, but **merge and branch-delete have no wrapper
  coverage today** — collapsing the full tail likely requires the wrapper layer to grow (or an errand-finalize
  wrapper carrying merge + teardown under one validated approval).
- *Composition:* with the wrapper-routing migration above (provenance-driven commit routing) and the
  commit-interlock inclusive-semantic item below. All three are facets of "one approval, then routing follows
  opt-in + interlock mode."

### `[ ]` **Audit interlock-marker convention adoption across remaining workflows**

- *Routed from:* `ATOMIC-INBOX`, shared-inbox sweep (2026-06-02). Filed here for concern-adjacency with the
  *Class-tag fire-site admonition sweep across remaining workflows* item (§ Watch / Provisional, below) — the
  commit-fire-visibility lobe is the same sweep with a different target list.
- *Concern:* `strategy-workflow-authoring.md` § Interlock markers codifies the workflow-interlock convention
  (advance-signal forms — quoted-verb / named-target with direction / approval split; trigger-driven embedded
  placement; standalone-step prohibition; gate-vs-fire separation), applied to `integrate-work-unit.md` and
  `1_create-prd.md` as reference implementations. Other workflows have embedded interlocks but their
  advance-signal *language* predates the convention — likely bare "await direction" rather than the quoted-verb
  / named-target forms.
- *Proposed:* audit + tighten interlock callouts in `2_generate-tasks.md`, `integrate-external-content.md`,
  `3_process-task-loop.md`, and any workflows authored since — verify embedded placement, retune advance-signal
  language (~1-2 lines each). Folds its commit-fire-visibility lobe into the class-tag-sweep item's target list
  (which already names `session-handoff.md`, `prepare-commits.md`, the `arc-commit` skill).
- *Boundary note:* the advance-signal-*language* facet is workflow-authoring convention adoption (vs. IRR's
  release-routing core); it neighbors the `2_generate-tasks` interlock-language items in `task-list-conventions`
  (§ Scope item 3 + the per-phase-cascade buffer entry there) — reconcile the `2_generate-tasks` overlap at
  iteration so the two WUs don't both edit the same callouts.
- *Scope:* Quick-tier (touches `.arc/system/workflows/`); package-source-primary with `.arc/` mirror sync.

### `[ ]` **Clarify release-wrapper fire-site invocation + make the `arc-commit` path not matter**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: interlock-release-refinement`), housekeep drain
  (2026-06-08); captured at `scalable-authoring-pipeline` Task 5.R.4.
- *Concern:* The release wrappers (`arc release commit` / `arc release push`) are thin passthroughs to
  `git commit` / `git push` (args forwarded; `-m` / `-F` as normal), but that isn't stated where it's needed.
  `DEV-RULES.ARC § Workflow class-tag routing` says the workflow "supplies the message body in a `text`
  codeblock," which reads as a special convention and leaves the literal invocation unclear — forcing a
  mid-session `--help` check. Recurs because the agent hand-rolls the wrapper instead of invoking the
  `arc-commit` skill the task-loop prescribes.
- *Proposed:* Two coupled halves. (1) **Fire-site doc fix, on-demand — not session-init** (adding it to
  `AGENT-BRIEF.ARC` violates ARC's own load-on-demand discipline): add a one-line "thin git passthrough" note +
  a concrete example (`arc release commit -m "…"` / `-F <file>`) to the `arc-commit` skill (or a release-wrapper
  reference), and tighten the DEV-RULES routing prose. (2) **Make the orchestration path not matter** — hooks
  fire on the git event and can't see skill-vs-raw-wrapper; only the artifact (format/footer) is gate-able. The
  wrapper already runs interlock-validation + audit regardless of caller, so hand-rolling only loses the skill's
  simple-vs-complex triage (routing multi-concern commits to `prepare-commits`). Fold that triage into the
  wrapper as a heuristic advisory and hand-rolling becomes harmless; failing that, salience-not-prevention
  (`arc-reinforce` / commit-msg nudge).
- *Scope:* Tension to preserve — fixing (1) makes hand-rolling *cheaper*, so the interface clarification is only
  safe paired with making the outcome path-independent; that coupling is itself the argument for
  wrapper-owns-the-triage.

### `[ ]` **Coordinate the "release the tail" pattern with the new sibling `unit-scoped-review`**

- *Coordination (cross-member, 2026-06-15):* `unit-scoped-review` joined the cohort — it widens the *review*
  increment to whole-WU scope. Its batch authorization is the same "one approval releases the tail" pattern as
  this WU's errand approval-collapse, at *WU* scope rather than *errand* scope — but it **stops at validation**
  (the integration interlock holds; it does **not** collapse the merge). Align the two framings; don't diverge.
- *Pre-flight config gate:* its batch mode requires a non-blocking commit/push path, consuming this WU's
  wrapper-routing + approval-provenance work (the precondition check is `unit-scoped-review`'s; the friction
  fixes are this WU's). Bypass is **not** required — "normal harness config + release wrappers" (narrow
  wrapper-allowlist + `releaseOptedIn`) is the expected common shape.
- *Provenance:* the approval-provenance-state concept (this WU's watch item + `commit-increments` § Unknowns)
  composes with its WU-scoped batch authorization. See `cohort-approval-flow-refinement.md`.

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
- **Earlier interlock/wrapper history:** Release Wrappers Foundation (shipped, archived; see
  `prd-release-wrappers-foundation.md` + `tasks-release-wrappers-foundation.md`) plus the
  Release Wrappers Ergonomics PRD (archived; `prd-release-wrappers-ergonomics.md`).

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
      explicitly cite it. Cite, don't re-derive — the rewrite leans on Layer 1 as foundation;
      § Trust Model describes the wrapper mechanics that operate against it. One additional
      sharpening: state explicitly that bypass mode changes the wrapper's *conditional value
      layer* (harness-prompt bypass is N/A) but does **not** change the Layer 1 invariant
      (user approval gate still required). Today's text leaves this implicit and the agent is
      demonstrably susceptible to confusing the two.
    - **`process-task-loop` § Incidental Commit Discipline:** flip "routing follows existing
      rules" to a concrete statement aligned with the new DEV-RULES rule. Add a worked example.
    - **`releaseRouting` envelope payload:** today carries `taskCommit` / `workflowCommit` /
      `workflowPush` as three separate routes. Layer 1 framing favors folding to single
      `commit` / `push` routing keys parameterized by (opt-in × interlock-mode) — one decision,
      not three — with the class-tag axis preserved as documentary only. The alternative
      (`incidentalCommit` key alongside the existing three) keeps the workflow-vs-incidental
      axis in the data shape after the rule retires it; that's a backward-compat tax not
      worth carrying under the new framing. Migration concern at PRD time: any current
      consumers reading the three keys need a stated migration path.

- *Sequencing with approval-provenance guard:* Under Layer 1 (DEV-RULES.ARC § Review-Increment
  Invariant) the wrapper cannot bypass the user approval gate, so the wrapper (or `arc-commit`)
  must verify fresh provenance — not assume it. The Approval-provenance Watch item below (now
  act-pending-design) is therefore a hard dependency of this migration, not a follow-up. Co-land
  the guard in the same WU, or land the guard first. Migration-first sequencing leaves a window
  where the routing change makes the observed failure mode (agent-invoked wrapper without prior
  structured approval) easier to hit, not harder — see that item's *Composition* note for the
  full reasoning.

- *Scope:* Quick-tier minimum — touches DEV-RULES.ARC (constitutional), a flagship strategy doc,
  a load-bearing workflow, and likely the session-init envelope CLI code. Scope grows to absorb
  the approval-provenance guard per *Sequencing* above. ADR-light treatment warranted since this
  reverses the explicit "trigger-bounded" framing in `strategy-interlock-release-wrappers.md`.

- *Captured during:* 2026-05-16 commit-routing audit (`93b50a4a`'s raw-`git` use matched current
  docs but not user intent — the gap this migration explicitly closes). User confirmed the
  routing migration as the originally-intended companion to yesterday's implied-approval-scope
  codification.

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
  approval gate. Meets the documented escalation criterion. Posture flips watch → act-pending-design.
  Layer 1 codification landed inline same-session (DEV-RULES.ARC § Review-Increment Invariant +
  AGENT-BRIEF.ARC vocabulary + process-task-loop cross-ref retarget) raises the constitutional
  floor; the mechanism work here implements against it. Under Layer 1, the guard becomes a hard
  dependency of the wrapper-routing migration above rather than a follow-up — see *Composition*
  below.

- *Recurrence (2026-05-20):* Third occurrence in WOR execution session — agent fired
  `arc release commit` for Tasks 6.7.i, 6.7.j, 6.7.q, 6.7.l after task completion BEFORE the
  structured task-interlock approval gate released (only 6.7.h followed protocol). Agent's own
  post-incident diagnostic named three contributing confusions: (1) conflating "wrapper bypasses
  harness per-invocation prompt" with "wrapper bypasses user-approval gate"; (2) treating commit
  as part of task execution rather than as gated interlock release; (3) self-invoking
  deferred-review-like behavior on a single-transition approval. Diagnostic-recommended doc-side
  fixes: `process-task-loop.md` step 4 bright-line ("commit fires AFTER affirmative response, not
  before; staging or invoking arc-commit before user response is a protocol violation even under
  on-task-approval / on-workflow"); `arc-commit/SKILL.md` antipattern naming ("firing commit as
  part of post-task verification sequence"); CLAUDE.md / AGENTS.md wrapper-vs-approval guardrail
  ("`arc release commit` bypasses the harness per-invocation prompt — it does NOT bypass the
  user's task-interlock approval gate. Invoke only after structured-prompt user approval").
  Third datapoint hardens act-pending-design posture and confirms doc-side intervention is
  warranted alongside any mechanism guard. Doc-side surface coordination with
  `plan-documentation-surface-routing.md` per § Cross-Plan Coordination.

- *Composition (Layer 1 update):* The wrapper-routing migration raises the stakes on this item —
  off-task incidentals now route through wrapper, expanding the surface where agent-invoked
  `arc-commit` without prior approval could fire. Layer 1 makes this a hard dependency, not a
  follow-up: the wrapper cannot bypass the user approval gate, so the wrapper (or `arc-commit`)
  must actively verify provenance — not assume it. Sequencing: co-land the guard in the routing
  migration's WU, or land the guard first. Migration-first leaves a regression window where the
  routing change makes the observed failure mode easier to hit, not harder.

- *Scope if promoted:* Small-to-medium documentation/skill hardening. Likely touches
  `.codex/skills/arc-commit/SKILL.md`, shipped `system/.internal/skills/arc-commit/SKILL.md`, and possibly
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

### Commit-interlock inclusive semantic under-documented; push/commit naming asymmetry as possible design smell

- *Observation* (2026-05-18 WOR Task 5.5 commit cascade): agent verified on-workflow's release
  behavior in `strategy-session-operations.md` § Commit-Interlock Release before invoking commits.
  The section explicitly names on-task-approval's release event but is silent on on-workflow's.
  Agent inferred on-workflow as exclusive (fires only at workflow ceremonies) by analogy to
  push-interlock's `on-handoff` ("fires push at handoff only — never per commit"). Used raw `git`
  for 4 task-execution commits (`45bad377` / `cb582bcc` / `d5176bd7` / `78905584`) where design
  intent was wrapped routing — audit-log entries the wrapper would have produced are missing.

- *Documentation-half:* The inclusive intent IS documented — but only in `process-task-loop.md`
  step 4 as the parenthetical "(or on-workflow, which subsumes it)". The strategy doc that should
  be authoritative on interlock release semantics is silent; the deferred-review × commit-interlock
  release section treats both modes equivalently in safe-accumulate scope (a weak hint); prefix
  mapping in DEV-RULES.ARC uses "Commit and proceed" for both modes (another hint). None of these
  is a definitional statement. An agent verifying behavior from the strategy lands on silence and
  falls back to cross-type analogy.

- *Design-smell half (user-raised 2026-05-18):* push-interlock's named modes are **exclusive**
  ("on-handoff fires push at handoff only — never per commit"); commit-interlock's named modes
  are **inclusive** (each higher setting subsumes the previous). Same `on-X` naming pattern,
  opposite semantic. Surface symmetry invites wrong inferences via cross-type analogy — the exact
  failure mode this entry documents. The model may want reconsideration for intuitive consistency:
  pick one direction uniformly across both interlock types (inclusive ladder where each setting
  subsumes the previous, vs. exclusive named-event where the setting names the specific event
  class that fires the release).

- *Composition:* With **wrapper-routing migration** above: the migration produces more
  wrapper-invocation sites, raising the cost of leaving the inclusive-semantic ambiguous. With
  **Pre-report checklist prefix verification** above: prefix selection is the prompt-side surface
  of the same release-mode-resolution decision an agent has to make at every task completion —
  both touch the same agent-attention concern at the release-decision point.

- *Resolution paths if promoted:*
    - **Doc-only minimum:** restate the inclusive semantic in `strategy-session-operations.md`
      § Commit-Interlock Release as a definitional opener; cross-reference from DEV-RULES.ARC
      § Commit Discipline; disambiguate from push-interlock's exclusive model with a one-liner
      naming the asymmetry explicitly.
    - **Model-level:** reconcile the asymmetry — pick inclusive or exclusive uniformly across
      both interlock types. Touches enum design, prompt mappings, strategy text, DEV-RULES,
      possibly probe envelope shape. Composes with `plan-customization-arch-realign.md` § Open
      Questions (e) on interlock enum granularity. ADR warranted.

- *Scope if promoted:* Doc-only fix is atomic-tier (~3-5 line edits, single strategy doc plus a
  cross-ref). Model-level fix is quick-tier minimum (multi-surface, ADR-light).

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

- **`plan-customization-arch-realign.md` § Open Questions (e)** — interlock enum granularity
  (`manual` / `on-task-approval` / `on-workflow` simplification). The enum design lives in
  the customization architecture's territory (affects all of ARC's interlock-shaped configs); this
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
- **`plan-documentation-surface-routing.md`** — new sibling (cohort: `instruction-discipline`
  post-planning-kickoff rename). Shares edit surfaces with this plan: DEV-RULES.ARC § Commit
  Discipline, `process-task-loop.md`, `arc-commit/SKILL.md`, CLAUDE.md / AGENTS.md. The doc-side
  fixes for the approval-provenance gap recurrence (process-task-loop bright-line, arc-commit
  antipattern naming, CLAUDE.md guardrail) coordinate with that WU's salience-callout lobe.
  CLAUDE.md / AGENTS.md guardrail composition (single combined vs two separate) resolved jointly
  at PRD time.

## Sequencing

No firm upstream blockers. Soft preferences:

- **Wait until post-WOR** for the class-tag admonition sweep (avoid tangling with WOR's
  remaining workflow restructures).
- **Wrapper-routing migration can ship any time post-WOR** — independent of the visibility fix
  already shipped; doesn't depend on the enum-granularity decision in
  `plan-customization-arch-realign.md` (the migration works under any of the candidate enum
  shapes). If the customization arch-realign decision lands first, the migration absorbs the
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
