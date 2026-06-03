# Draft: Concurrent Work Conventions

**Purpose:** Codify the conventions layer for principled multi-WU work — `strategy-concurrent-work.md`
as the canonical home for activation-time concurrency-check guidance, parallelism decision rubrics,
rebase / merge discipline for concurrent WUs, worktree operational guidance, async-merge
accommodation, and main-worktree-under-full-protection framing. Composes with
`draft-worktree-foundation.md` (mechanism) and `draft-agile-wu-lifecycle.md` (tier model) to deliver
"agile, principled, multi-WU work."

- **State:** Draft — pre-PRD exploration captured. Renamed from former Work-Unit Mobility WU as part
  of the agile/mobility split (mechanism → Worktree Foundation; tier model → Agile WU Lifecycle;
  conventions → this WU). Iteration expected before PRD promotion. Updated 2026-05-08:
  redesigned around external-research-informed lighter shape — focus-role field model rejected;
  conventions land as judgment-based protocols + strategy-doc guidance, not as new meta-file
  fields. See `research-focus-wip-attention-discipline.md`,
  `research-active-work-coordination-vocabulary.md`, `research-concurrent-work-mechanism-layer.md`,
  and `research-integration-conflict-handling.md` for the research underpinning the redesign.

- **Created:** 2026-04-17 (originally as Work-Unit Mobility); split and renamed 2026-04-28; redesign
  2026-05-08.

- **Origin:** Surfaced during a pre-PRD exploratory session on the Session-Init Optimization
  planning branch as the conventions layer of mobility. Carved out from the original Work-Unit
  Mobility plan during the agile/mobility design discussion when three-layer scope (mechanism +
  conventions + agile lifecycle) proved too large for one WU. Mechanism extracted to
  `draft-worktree-foundation.md`; agile-lifecycle scope newly identified and split to
  `draft-agile-wu-lifecycle.md`; this WU retains the conventions layer.

  **2026-05-08 redesign.** During Interlock Release Wrappers WU1 the parallelization-safety gap
  was surfaced — none of the trio plans modeled "is this WU safe to parallelize against in-flight
  WUs?" The first-attempt focus-role model (`primary | companion | awaiting-external | parked`)
  was investigated against industry idiom via three external-research passes plus a fourth on
  integration-conflict handling. Findings: zero PM-tool precedent for focus-role-as-field;
  touched-files / scope-overlap probes are not idiomatic and brittle in practice; conflict
  prediction tools exist but adoption is limited. Reframe: rely on agent judgment at activation,
  soft conventions in the strategy doc, and operational guidance for handling conflicts at
  integration. No new meta-file field, no overlap probe, no formal primacy model.

## Realignment & scope flags (2026-06-02)

> Flags only — resolve at this WU's next planning pass. Backlog-grooming pass; no design decided here.

**Unblocked — `agile-wu-lifecycle` dependency dropped; this WU is now Ready.** The AWL dependency was
soft: this draft consumes only WOR's `**State:** Integrating` (shipped) for awaiting-review
accommodation, plus reversible shared-file coordination on `integrate-work-unit.md` (the async-merge
audit lands additively on whatever shape that workflow has — if AWL later adds tier-aware branches,
AWL composes on top of this WU's changes, not the reverse). AWL has also moved to the
principle-anchored-core cohort (its center of gravity is spec/task scaling, not parallelism). With WF,
errand-enablement, and in-flight-awareness all shipped, **this WU is the last remaining
agile-parallelism conventions member** — but see the merge-safety flag below for what else gates
closeout. The § Dependencies "Recommended sequencing" and the AWL upstream entry are updated to match.

**Merge-safety cluster — cohort-closeout-critical, and partly homeless.** Inbound items 1/2/4/5 are one
concern from four angles: behind-base drift detection + reconcile-triage discipline (item 5),
merge-gate-aware lifecycle workflows + auto-lane interlock relocation (item 1), a base-branch-write
guard plus a shared write-context-classifier primitive (item 2), and a merge-commit hook/footer
exemption (item 4). The buffer homes the **discipline** to this WU but leaves the **CLI buildables** — a behind-base
probe (`main` moved K, you're N behind, paths overlap → reconcile?), the write-context-classifier, a
commit-msg hook, and merge-gate arming — **homeless**: WF (the prior home guess for the primitive) has
shipped, and these carry *mechanism* character, unlike this WU's *conventions* character. Today nothing
computes behind-*base* (session-init's `remote-ahead` only detects behind-own-upstream). This cluster
is what actually gates agile-parallelism closeout — parallel WUs + errands work mechanically, but there
is no discipline or tooling for "main moved under me," the exact ergonomic failure that bites once
parallel in-flight work is real. **Open question (split vs. fold):** spin the buildables into a
dedicated mechanism cohort member, or fold them into a re-scoped CWC? It depends on how heavy the
conventions/doc work proves once this WU plans — remains to be seen, so decide then. Either way,
**the cohort does not close until this cluster lands somewhere.**

**Scope estimate is stale.** The § Scope Estimate "Medium-Small … doc-heavy" predates the merge-safety
buildables accruing in the buffer; re-estimate at planning (it is no longer doc-only if the fold path
wins).

**Fold the buffer at planning.** The six Inbound Buffer items want a focused integration pass into the
body at this WU's next planning iteration (per the buffer's own `drain-inbox § 5` convention) — not a
piecemeal drain.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Make the WU lifecycle workflows merge-gate-aware**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`), work-routing-discipline housekeep drain (2026-06-01).
- *Concern:* errand-enablement shipped the auto-merge lane (`merge-ok` classify gate, CODEOWNERS, native
  auto-merge) but never reconciled the lifecycle workflows that drive PRs through it; `integrate-work-unit.md`
  still encodes a pre-gate merge model.
    - *Auto-lane failure mode:* Step 13's final human gate is the integration-interlock ("stop before merge, then
      `gh pr merge`"). On the auto lane there is no discrete merge step — arming auto-merge + pushing green *is*
      the authorization; the merge then happens unattended. So the integration-interlock is structurally moot and
      its final-go intent evaporates. Fix: relocate that intent onto the **pre-push interlock** for the auto lane
      (harden the `workflowPush` fire-site with awareness that, on this lane, the push authorizes an unattended
      merge). Do **not** add a merge-time step.
    - *Open — who arms `--auto`, and when:* native auto-merge is two-level — repo-level `allow_auto_merge`
      (one-time; `setup-merge-gate` did it) + per-PR `gh pr merge --auto` (nothing automates it). An un-armed
      planning PR sits green-but-unmerged. The workflow that opens planning PRs should own arming at PR-open.
    - *Reviewed lane:* Step 13 doesn't mention `merge-ok` is now a *required* check (enforce_admins on) nor the
      lane classification.
- *Sequencing:* capture-not-fold was deliberate — work-routing-discipline's own integration PR is the gate's
  first live traversal. Likely home CWC; touches `integrate-work-unit.md` (+ planning PR-open paths), two-copy.

### `[ ]` **General base-branch-write guard + commit-hook backstop (shared write-context primitive)**

- *Routed from:* `USER-INBOX § Backlog` (`WU_Target: TBD`; pre-decided for CWC in work-routing-discipline's
  notes), work-routing-discipline housekeep drain (2026-06-01).
- *Concern:* work-routing-discipline hardens only `arc-housekeep`'s *own* precondition (refuse/relocate off a WU
  branch, reusing `arc errand`'s context resolution). The general case is isolation enforcement: any
  base-branch-writing command (incl. AWL's `arc start` create-new) should guard its context, plus a pre-commit
  backstop flagging a shared base-branch surface (`backlog/`, `active/` stubs, shared inbox) staged on a
  non-base, non-`chore/` branch.
- *DRY:* the command-time guard and the commit-time hook answer the same question (WU branch vs. base/`chore` ×
  is this path a shared base-branch surface?) — share one **write-context-classifier** primitive (extending the
  resolution `arc errand` and the session probe already carry).
- *Home:* CWC owns the isolation/concurrency doctrine; possibly Worktree Foundation for the primitive itself.

### `[ ]` **Consumer: `shared-inbox-housekeep` needs entry-level re-homing of foreign-owned atomics**

- *Routed from:* follow-up housekeep drain (2026-06-01); dependency flag from the new `shared-inbox-housekeep`
  stub (which `Depends On` CWC).
- *Concern:* `shared-inbox-housekeep` (a shared-scope `drain-inbox` mode that consolidates `ATOMIC-INBOX` against
  the evolving stub landscape) depends on CWC's concurrency doctrine — but it needs more than the file-level
  write-guard the entry above frames: it **re-homes individual foreign-owned atomic entries** (moves another
  owner's `ATOMIC-INBOX` line into a stub) during a sweep. Ensure the all-owner gate doctrine covers entry-level
  re-homing of foreign captures, not just guarding writes to the shared surface as a whole.
- *Home:* CWC (the doctrine); the consuming sweep lives in `shared-inbox-housekeep`.

### `[ ]` **Merge commits have no codified Context-footer / commit-msg-hook path**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-02); hit merging `main` into a WU branch
  during in-flight-awareness.
- *Concern:* the commit-msg validator has **no merge-commit exemption** — a local `git merge` rejects the
  default "Merge branch …" message (fails conventional-format + required `Context:` footer). Yet the footer
  taxonomy (`<file> (incidental during X)` / `standalone (…)` / `contribution`) has no natural slot for a merge.
- *Proposed:* (a) hook-side — exempt merge commits (detect 2-parent / `MERGE_HEAD`, skip conventional + footer
  rules); and/or (b) taxonomy-side — add a merge/integration footer kind (e.g. `Context: integration (merge
  main)`). Likely both. Part of the mid-WU reconcile discipline this WU owns.
- *Scope:* S–M — hook exemption + footer-taxonomy convention.

### `[ ]` **In-flight WUs drift from `main` when errands / WUs land — no reconcile-triage convention**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-02); deepened at the 2026-06-02 boundary
  review. Home decision deferred to this WU's PRD (own quick-tier follow-on vs. a CWC deliverable).
- *Concern:* a `main` advance (sibling integration, errand, hotfix) leaves in-flight WU branches behind until
  they reconcile. Impact is conditional (orthogonal → fine at integration; overlapping → latent conflict + coding
  against stale shared files; dependency → may be required to continue). Distinct from behind-own-upstream drift
  (which session-init already detects as `remote-ahead`): this is **behind-base**.
- *Decomposition:* **discipline** (when reconcile is required vs. deferrable, merge-vs-rebase, ordering,
  multi-machine force-push) → this WU. **Substrate** (enumerate in-flight WUs + paths; overlap) → the in-flight
  awareness oracle + `arc errand check` (shipped). **Advisory detector** (compose → "main moved K; you're N
  behind; these paths overlap → reconcile?", fired at session-init resume) → *unhomed*; a sibling of the
  activation-concurrency-check (same advisory-never-gate doctrine, different trigger).
- *Scope:* M — discipline codification; the detector is a small separable buildable.

### `[ ]` **Agents can't discover a coordinating cohort's `cohort-{name}.md` at session init**

- *Routed from:* `USER-INBOX § Backlog`, housekeep drain (2026-06-02); routed here as the home for the
  cohort-doc *convention*. Coordinate-with the agent-context-optimization cohort for the awareness blurb.
- *Concern:* a coordinating cohort keeps its shared design record in `cohort-{name}.md` at the cohort root, but a
  by-the-book session-init never reaches it — the active WU never co-locates a `cohort-*` file, the meta carries
  `**Cohort:**` as a bare value with no pointer, and neither AGENT-BRIEF.ARC nor session-init says such a doc may
  exist. So shared cross-member contracts are invisible (hit this session — the cohort doc went unread).
- *Proposed:* (light) a note in `AGENT-BRIEF.ARC.md` that a `**Cohort:**` value may belong to a coordinating
  cohort with a `cohort-{name}.md` record — consult it when coordinating with siblings; (heavier) session-init
  surfaces it via probe + orientation line. This WU owns the `cohort-{name}.md` convention codification (with
  file-classification); the awareness blurb (an `instruction-optimization` / `documentation-surface-routing`
  concern) should align to it rather than front-run it.
- *Scope:* S — convention note + optional session-init surfacing.

---

## Problem / Motivation

`draft-worktree-foundation.md` ships the mechanism for parallel work — worktrees, shift, session-init
worktree-awareness, branch-gone detection. `draft-agile-wu-lifecycle.md` ships the tier model for
fast WU spin-up. But mechanism and tier model alone leave the **patterns of multi-WU usage**
unaddressed:

- When are concurrent WUs appropriate vs counterproductive?
- How does an agent assess whether a new WU is safe to parallelize against in-flight WUs?
- What rebase / merge discipline keeps concurrent branches integrable without late-stage drama?
- How do shipped-but-awaiting-review WUs compose with active in-flight WUs?
- What conventions distinguish "principled concurrent solo work" from "fragmented attention with
  predictable quality degradation"?
- How does the awaiting-review state compose with session-handoff, archival, and worktree cleanup
  workflows that currently assume synchronous merge?

Without conventions, mechanism encourages chaos. The conventions layer codifies what adopters
already do implicitly when concurrent work goes well, with judgment-driven protocols that honor
ARC's attention-discipline principles.

### Parallel WU support is conventions-bound, not just mechanism-bound

[strategy-team-coordination.md][team-coord] L276-281 documents that parallel work units on
independent branches are structurally supported:

> Parallel work units on independent branches... The work units don't coordinate at all at the
> meta-file layer: different files, different branches, different task lists.
> **This is the dominant pattern for parallel solo work on independent concerns.**

The phrase "parallel solo work" is doing heavy lifting. With Worktree Foundation shipped, the
mechanism exists. But there is no:

- Guidance for when same-dev parallel WUs make sense
- Activation-time protocol for assessing scope overlap with in-flight WUs
- Rebase / merge discipline guidance for concurrent branches
- Strategy doc addressing solo concurrent work (team-coord assumes different identities)

ARC has the mechanics but not the model. This WU elevates the capability to first-class:
intentional conventions, documented patterns, judgment-based protocols that honor ARC's
attention-discipline principles while recognizing that developers pivot between WUs in practice.

### Why this matters beyond personal ergonomics

Concurrent agent sessions, worktree-based pivots, and long-running work-in-flight are realistic
patterns in modern dev practice. An adopter evaluating ARC against its current state sees a
framework that implicitly assumes linear single-WU progression. Shipping first-class conventions:

- Matches how developers actually work
- Makes the "awaiting review" scenario (days to a week of latency) a supported pattern rather than
  an awkward gap
- Extends ARC's attention-discipline principles into the multi-WU regime with guardrails, instead
  of ceding the ground entirely

### ARC's concurrency model — parallel sessions, not in-session juggling

Per `plan-session-operational-flow.md` § Concurrency Model: ARC's concurrency model is
**parallel sessions, one WU per session, with shift as the in-session escape hatch for short
detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with
isolated SESSION-NOTES; sessions don't interact internally except at boundaries (spawning new WUs,
sweep ceremonies, planning).

This framing has direct implications for conventions in this WU:

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU
  switching. The in-session worktree pivot (Worktree Foundation's surviving "shift") remains
  available for the niche short-detour case but is not the dominant pattern.
- Single-active-focus is implicit in worktree presence — the worktree the agent is currently in
  is the active focus. No field needed.
- Transitions between active worktrees happen at review-increment boundaries (the same task-
  interlock invariance ADR-016 establishes for in-WU work).

### Why no formal focus-role model

The plan's earlier shape proposed a `**Focus Role:**` meta-file field with values
`primary | companion | awaiting-external | parked`, blessed pairings, swap discipline, and per-WU
tenure tracking. External research (2026-05-08) found no PM-tool precedent for this shape — every
tool surveyed (Linear, Jira, GitHub Projects, Shortcut, Notion, Asana, Trello, Height) models
active work via Status enum + Assignee, not role annotation. The 2026-05-12 worktree-tool
convergence pass reinforces from a second direction: no agent-workspace tool (Conductor, emdash,
Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) models focus role either
— concurrency UI is purely a workspace listing, not a discipline annotation. The underlying
*concepts* (single-thread attention, single-active-focus, awaiting-review as a distinct state)
are evidence-aligned across Kanban, Deep Work, GTD literature — but expressing them as a
separate field invents net-new vocabulary adopters won't recognize.

ARC adopts the lighter posture: rely on agent judgment + protocols, not field-encoded roles.

- **"Primary"** maps to the existing implicit signal: which worktree is the agent currently in?
  That's the active focus. No field needed.
- **"Awaiting-external"** maps to `**State:** Integrating` — WOR's 4-state machine, where
  "awaiting PR review" *is* the `Integrating` phase (merge-position folded into State; no separate
  `**Integration:**` field). No new enum value needed.
- **"Companion"** conflated runtime focus with backlog grouping. The grouping concern is already
  covered by `plan-work-organization-reform.md`'s group-dir convention plus the existing
  `**Sibling Work Unit(s):**` meta field. No runtime equivalent needed.
- **"Parked"** maps to GTD's Someday/Maybe — soft convention guidance in the strategy doc, not
  field-encoded.

The anti-pattern intuitions (single-thread attention, same-domain concurrents) survive as soft
guidance in `strategy-concurrent-work.md`, framed as conventions adopters apply by judgment, not
field validations a tool enforces.

---

## Relationship to Interlock Model Frame

[ADR-016][adr-016] establishes configurable autonomy interlocks for session-operational flow, with
`plan-session-operational-flow.md` implementing the core mechanics. This WU consumes the
frame as an enabler — configurable autonomy modes reduce approval ceremony under multi-session
load, which is exactly the ergonomic gap multi-worktree introduces.

**Touchpoint:** With configurable autonomy in place, modest concurrency (2-3 sessions) becomes
principled rather than tolerated — per-task approval ceremony reduces via auto-commit / auto-push
toggles, making the bandwidth cost tractable. PRD should resolve whether the strategy doc presents
the posture as "tolerated" or "principled at modest scale."

---

## Scope

### In scope

1. **`strategy-concurrent-work.md` (new strategy doc).** Sibling to
   [strategy-team-coordination.md][team-coord], not extending it. Same-identity concurrency is
   structurally different from multi-developer coordination. Coverage:

    - **Worktree-by-default rationale and trade-offs.** Why ARC departs from solo-developer norm
      (multi-agent isolation as primary justification, frictionless parallelism later); discovery
      and cleanup discipline; risks (worktree accumulation, "which worktree am I in" confusion).

    - **When to parallelize vs serialize.** Decision rubric — independent WUs (disjoint files /
      modules) → parallel-merge OK; high-overlap WUs (shared module, semantically related code)
      → serialize. Concrete examples per `research-integration-conflict-handling.md`.

    - **Activation-time concurrency check.** Agent-led, judgment-based protocol: at WU activation,
      agent reads in-flight WUs (`git worktree list` + identity-filtered meta files), assesses
      scope overlap by reading their `**Purpose:**` / Spec content + `**Sibling Work Unit(s):**`
      declarations, and either proceeds, surfaces concerns to user, or suggests sequencing change.
      Non-deterministic; advisory; no probe tooling. The strategy doc gives the judgment
      heuristics; the check fires from both of `draft-worktree-foundation.md`'s entry points —
      `arc start` / spawn (item 4) for ARC-managed worktree creation, and the cold-start
      primitive (item 11) for tool-spawned or manually-created worktrees. Same check, same
      heuristics; entry point varies with WU origin. Scope boundary: the check applies only to
      worktree-based WU activation. An atomic-character side-task is an **Errand**, launched from the main
      worktree via `errand-launch` (not a side-branch in the current worktree); its concurrency handling is
      Errand Enablement's **advisory foreign-artifact gate** (the floor — fires when an Errand touches an
      in-flight foreign artifact), which CWC's full all-owner gate doctrine builds on.

    - **Branch and rebase discipline.** Periodic-rebase-onto-main vs end-of-flight rebase
      trade-off (lifetime threshold around 2 days per industry research); rerere setup for
      periodic-rebase teams; "Update branch" workflows; merge vs rebase choice with consequences
      for review.

    - **Merge ordering between concurrent WUs.** First-in-wins vs explicit serialization;
      PR-label conventions for "merge after #X"; merge-queue interaction (Mergify, GitHub merge
      queue).

    - **Worktree operational guidance.** Performing merges from main (or dedicated merge)
      worktree; refetching / rebasing other worktrees post-merge; using `git worktree remove`
      instead of `rm -rf`; stale-reference recovery; cross-worktree state after rebase;
      sync-all-worktrees recommendation. **Tool composition:** when an external worktree-
      management tool spawns worktrees (Conductor, emdash, Maestro, Warp, Worktrunk, Zed, etc.),
      the tool typically owns cleanup, branch naming, and location conventions per its own UX.
      Coexistence guidance: honor the tool's branch naming (advisory under ARC's branch-naming
      method per `draft-worktree-foundation.md` item 10); defer cleanup to the tool when it
      provides it; do not relocate tool-managed worktrees. ARC's structural discipline (meta-*
      lifecycle, state machine, sweep-as-you-go integration) applies uniformly regardless of
      who spawned the worktree.

    - **When to abandon parallelism.** Heuristics: conflict-resolution time exceeding ~30% of
      parallelism savings; rebase count exceeding ~3 due to upstream churn; semantic drift
      between branches. Recovery action: merge one branch, abandon the other, redo as unified
      WU.

    - **Async-merge guidance.** Managing WUs through awaiting-review latency (days to a week);
      how `**State:** Integrating` (WOR's state for "PR open, awaiting merge") interacts with
      session-handoff, archival, and worktree cleanup; soft conventions for the post-PR-pre-merge
      state.

    - **Soft anti-pattern guidance.** Single-thread attention (only one active focus at a time);
      avoiding same-domain concurrents (informed by attention-residue research); review-
      increment-boundary discipline for transitioning between WUs. **Explicit calibration
      against agentic worktree-tool idiom:** the surveyed tool ecosystem (Conductor, emdash,
      Maestro, Warp, Worktrunk, Zed, Super, Superset, T3code, Soloterm, Nora) optimizes for
      many simultaneous sessions, fast spawn, less per-WU review — the opposite posture from
      ARC's. Adopters composing ARC with such a tool hold two postures in tension by design;
      strategy-doc guidance surfaces this so adopters consciously pick which frame dominates
      per session rather than letting the disciplines conflict silently. Framed as judgment
      guidance, not enforced rules; phrasing TBD at PRD. See § Pressure Points "Tool-ecosystem
      composition friction."

    - **Main-worktree-under-full-protection convention.** "Your main worktree is not always on
      main" framing — under `branch.protection: full`, main worktree specializes for admin /
      coordination work (planning branches, archive branches, cross-WU backlog edits) while WU
      worktrees handle feature work.

    - **Relationship to team mode.** Concurrent-work conventions and team mode are orthogonal;
      both can coexist; neither requires the other.

2. **Integration-surface async-merge audit.** [integrate-work-unit.md][integrate-wu] and related
   lifecycle workflows currently assume synchronous merge (PR created → merged → cleanup in one
   flow). With async-merge as a legitimate pattern (post-PR + awaiting-review-latency), workflows
   need accommodation — handoff transitions, meta-file updates, worktree cleanup advisory,
   archival ordering — for the awaiting-review state. Audit sync-merge assumptions; adjust
   touchpoints additively (option B per Design Decisions). Includes detailed guidance in
   `strategy-concurrent-work.md` § Async-merge guidance.

3. **Awaiting-review state semantics.** Confirm WOR's `**State:** Integrating` cleanly expresses the
   awaiting-external state (PR open, awaiting merge) across handoff, archival, and worktree-cleanup
   workflows — merge-position is folded into State, so no separate `**Integration:**` field or new
   enum value is needed. Coordinate with `draft-agile-wu-lifecycle.md`'s state-machine rollout.

**Errand-model re-pivot (`work-routing-discipline`, 2026-05-31):** errands are now execution-only `chore/<slug>`
branches (full) / direct base commits (partial) via `run-errand`, not queued artifacts — so concurrent errands
are mini-PRs that ride the same rebase / merge and async-merge discipline this WU codifies. Their integration
ordering and in-flight coordination are CWC territory; fold errand (`chore/`) branches into the concurrency
rubrics when next iterated.

**Drain-mechanism correction (`work-routing-discipline`, 2026-06-01):** `run-errand` and the `drain-inbox`
execution transition both defer post-merge cleanup — errand branch/worktree teardown and removal of the
slug-matched `USER-INBOX` line — to the errand's *merge*. On the auto-merge lane that merge is *unattended*, so
no workflow step fires the cleanup; session-init's in-flight-errand sweep backstops it for now. CWC's
merge-gate-awareness owns the unattended-merge **completion trigger** (who runs teardown + line-removal when no
one attends the merge) — reconcile `run-errand`'s Complete phase and the drain's close when next iterated. This
is the `run-errand` / `drain-inbox` facet of the broader "make the lifecycle workflows merge-gate-aware" concern
(`integrate-work-unit` is the sibling case).

### Out of scope

- **Focus-role field model** — explicitly rejected per § Why no formal focus-role model. Strategy
  doc covers anti-pattern intuitions as soft guidance only.
- **Touched-files / scope-overlap probe** — explicitly rejected. Activation-time concurrency check
  is judgment-based, not probe-based.
- **Worktree mechanism, shift lifecycle, session-init worktree detection, branch-gone detection,
  inbox sync** — `draft-worktree-foundation.md`.
- **Tier model, `arc start` command, ceremony scaling, atomic-companion retirement, incidental
  category retirement** — `draft-agile-wu-lifecycle.md`.
- **External tracker integration for "what's @teammate working on"** — `draft-coord-probe.md`.
- **Group-dir convention for sibling WUs** — `plan-work-organization-reform.md`. The existing
  `**Sibling Work Unit(s):**` meta field plus group-dir convention from WOR cover the
  "sibling / companion" relational concept; no runtime equivalent needed.
- **ROADMAP form-factor evolution (parallel/multi-stream visualization, sequencing-artifact
  brittleness, horizon tiers)** — superseded: WOR reworked the ROADMAP into the derived readiness
  view; the renderer / CLI lives in the `roadmap-tooling` WU. (The pre-WOR `roadmap-evolution` WU was
  retired.)
- **Blessing concurrent agent sessions.** Framework won't block two simultaneous agent sessions in
  different worktrees, but documentation is explicit: this potentially violates P2 (co-development
  bandwidth). Adopter's call, not ARC's recommendation.
- **Automated mode-fit detection.** Framework doesn't assess whether a project is "outgrowing"
  single-active discipline. Runtime detection rejected per arc-modes principle.
- **Cross-dev worktree coordination.** Team-mode territory.
- **Hooks at shift transitions.** Hook symmetry deferred to a later hooks-completeness pass.

---

## Design Decisions

### Sibling relationship to team mode, not inheritance

Same-identity concurrent usage could theoretically reuse team-mode conventions (`(@name)` markers,
`user.sync_push: prompt`). Rejected — these are team-specific (multiple humans), not concurrency-
specific (multiple WUs, one human). Concurrent-work users can enable team mode independently if
they want team conventions, but concurrent-work patterns are structurally distinct.
`strategy-concurrent-work.md` (new) sits alongside `strategy-team-coordination.md`, not inside it.

### Focus-role model rejected (2026-05-08 redesign)

The plan's earlier shape proposed a `**Focus Role:**` field with `primary | companion |
awaiting-external | parked` values, blessed pairings, swap discipline, and tenure tracking via
`**Focus Since:**`. External research determined this is a re-invention without PM-tool precedent
and conflates concerns better handled by:

- **WOR's `Integrating` state** for `awaiting-external` — "awaiting PR review" is the `Integrating`
  phase of the 4-state machine; no separate field needed.
- **Sibling Work Unit(s) field + group-dir convention** for the relational concept "companion"
  was hinting at (`plan-work-organization-reform.md`).
- **Implicit worktree presence** for "primary" — the worktree the agent is currently in is the
  active focus.
- **Soft conventions in `strategy-concurrent-work.md`** for the underlying intuitions
  (single-thread attention, same-domain concurrents anti-pattern, swap discipline).

The cost saved: a new tracked field, validation rules around it, migration of existing in-flight
WUs, adopter education on net-new vocabulary. The cost paid: relying on agent judgment at
activation rather than field-encoded role. Research strongly supports the lighter posture.

### Async-merge audit scope: option B (additive)

[integrate-work-unit.md][integrate-wu] currently assumes synchronous merge. Three audit shapes:

- **A — Full rewrite of state transitions** to treat async-merge as a primary path alongside
  sync-merge. Cleanest end state; heaviest change.
- **B — Additive treatment at key touchpoints.** Sync-merge stays the primary flow;
  awaiting-review state gets explicit accommodation at session-handoff, meta-file updates,
  worktree cleanup, and archival. Lighter; preserves existing workflow shape.
  **(Lean — formerly current lean in original Mobility plan; reaffirmed here.)**
- **C — Mixed.** Primary rewrite of integrate-work-unit.md plus additive treatment elsewhere.
  Scoped compromise.

PRD-time decision informed by audit findings.

### `strategy-concurrent-work.md` as new strategy doc

Evaluated extending `strategy-team-coordination.md` with a same-dev section. Rejected — putting
same-human concurrency under "team coordination" is structurally misleading. New doc is cleaner;
the two strategies reference each other where overlap exists (branching patterns, meta-file
merge behavior).

### ROADMAP parallelism is conventions-side, not infrastructure-side

The visualization gap (sequential layout claiming "parallelizable") is a documentation/conventions
concern, not a tooling concern. Adopting better visualization patterns is a strategy-doc + ROADMAP-
template change, not a CLI/lint addition. Research-informed redesign at PRD time.

**Coordination (WOR Phase 7.R, 2026-05-22).** WOR reshaped `backlog/ROADMAP.md` into a fully-derived
readiness view (In Flight / Ready / Blocked, from meta `State` / `Owner` / `Depends On`; rendered by WU-name;
no hand-maintained content) and explicitly deferred **parallel-safety** here — "which Ready WUs are
concurrency-safe with what's in flight." Open for this WU's PRD: is it reliably deterministic at all? Meta
files don't declare file-scope/domain, predicted paths ≠ actual, and cognitive-load is judgment; industry
leans on conventions + pick-time accounting (WIP limits, swimlane/value-stream partitioning, module ownership)
over a computed "safe-to-parallelize." Likely an on-contact convention, not a rendered field — research how
the ecosystem handles it. Hard constraint from WOR: if a parallel view is ever hand-curated, it is a
**sibling** artifact; the derived ROADMAP stays hand-maintenance-free to avoid drift. (The renderer itself +
the "roadmap" rename/semantics live in the `roadmap-tooling` WU.)

### Shared-file concurrency: derived vs. mutated (ADR-020)

ADR-020 splits the in-git concurrency problem precisely, and this WU owns codifying the conventions:

- **Derived shared state (ROADMAP) is solvable in-git.** It is a pure projection over branch-isolated
  `meta-*` files; deterministic regeneration at a *single serialization point* (post-merge on the
  integration branch, not hand-edited on feature branches) makes it conflict-free. This is the
  conventions-side fix for the ROADMAP-parallelism gap above.
- **Mutated shared state (inbox drains, any human-editable priority/ordering) is not solvable in-git.**
  Git's line-merge is not a CRDT — concurrent appends to a queue's tail conflict, and edits/reordering
  conflict regardless of sharding — so this is `draft-arc-backend.md` territory (canonical mutable store).
- **Partial mitigation worth a convention:** `merge=union` via `.gitattributes` makes concurrent inbox
  *appends* auto-merge, but loses *intentional deletions* (a drained entry can resurrect) — an
  append-safety aid, not a drain-safe solution. Document the caveat if adopted.

---

## Dependencies and Sequencing

### Upstream

- **Work Organization Reform:** delivers Conventional Branch alignment, per-worktree
  isolation foundation, group-dir convention, the consolidated boundary workflows, and the
  `**Sibling Work Unit(s):**` field convention. Concurrent-work conventions and async-merge
  audit compose on top. Hard upstream dependency.
- **Worktree Foundation** (`draft-worktree-foundation.md`): mechanism layer — worktrees, shift,
  branch-gone detection, pause-pointer migration. The activation-time concurrency check fires
  from Worktree Foundation's spawn workflow per the strategy doc's heuristics (Foundation ships the
  degrading advisory stub).
- **Errand Enablement** (`draft-errand-enablement.md`): the Errand floor — the `errand-launch` primitive,
  the **Errand decision matrix**, and the **advisory foreign-artifact gate**. CWC consumes the matrix and
  the advisory gate as the floor beneath its full all-owner gate doctrine and isolation conventions.
  Sequenced WF → Errand Enablement → IFA.
- **In-Flight Awareness** (`draft-in-flight-awareness.md`): the in-flight **oracle** this WU's
  concurrency *gate* consumes (all-owner refs + open PRs), plus the oracle-backed activation-time
  concurrency check. Split from Worktree Foundation 2026-05-24; depends on it.
- **Work Organization Reform** (shipped) supplies the `**State:**` machine — the 4-state model with
  merge-position folded into `Integrating` (no separate `**Integration:**` field). Concurrent-work
  conventions consume the `Integrating` state for awaiting-review accommodation. (Formerly attributed to
  Agile WU Lifecycle as an upstream dependency; corrected — the state is WOR's and already shipped.)
- **Agile WU Lifecycle** (now in the principle-anchored-core cohort) is **not** an upstream dependency —
  the edge was dropped (see § Realignment & scope flags). Its only touchpoint is reversible shared-file
  coordination on `integrate-work-unit.md`: this WU's async-merge audit lands additively, and AWL's
  later tier-aware archival branches compose on top — either order works.
- **User Sync UX Polish** (`prd-user-sync-ux.md`): clean sync state machine before
  worktree-axis-plus-concurrent-work conventions land on it.
- **Session-Operational Flow Phases 3/5/6:** configurable autonomy modes — reduce approval
  ceremony under multi-session load. Async-merge integration-surface audit was originally
  captured here per ADR-016 discussion; remains in this WU's scope.

### Downstream

- **ARCd Rebrand:** stable concurrent-work terminology absorbed into rename pass.
- **ARC Operating Modes:** consumes shift lifecycle (delivered by `draft-worktree-foundation.md`)
  as prerequisite; concurrent-work conventions inform mode-specific guidance.

### Recommended sequencing

Work Organization Reform → `draft-worktree-foundation.md` → **Concurrent Work Conventions**. (All
upstream members — WF, errand-enablement, in-flight-awareness — have shipped, so this WU is Ready.
`draft-agile-wu-lifecycle.md` is no longer in the chain; it left the cohort and does not block this WU.)

---

## Pressure Points and Risks

### SESSION-NOTES divergence per worktree (resolved upstream)

`draft-worktree-foundation.md` resolves this by establishing per-worktree SESSION-NOTES semantics.
This WU's conventions consume that resolution; no new pressure here.

### Team-mode relationship clarity

Concurrent-work conventions and team mode overlap in concepts but not conventions. PRD must state
the relationship unambiguously to prevent adopter confusion ("do I enable team mode for solo
worktree use?"). Recommended framing: team mode is multi-human; concurrent-work conventions are
multi-WU-single-human; both can coexist; neither requires the other.

### Async-merge scope boundary

[integrate-work-unit.md][integrate-wu] is shared with `draft-agile-wu-lifecycle.md` (which adds
tier-aware branches). Coordination required: async-merge audit lands additive accommodation atop
the tier-aware flow, not via independent rewrite. PRD-time sequencing care.

### ROADMAP visualization research

Visualization patterns for parallel work streams have multiple competing forms (DAG, swimlane,
Gantt-like, dependency-only). Picking one without understanding adopter context (small team vs
large, solo vs team-mode, arc-in-git vs external pm.mode) risks shipping a format that doesn't
serve actual usage. Research informs choice; rushing risks rework.

### Activation-check judgment quality

The activation-time concurrency check relies on agent judgment from reading in-flight status
files. Quality depends on (a) adequate scope description in `**Purpose:**` / Spec content,
(b) the agent reading them carefully, and (c) the agent surfacing concerns rather than rubber-
stamping. Mitigation: strategy doc provides concrete heuristics with worked examples; the check
is advisory not gating, so false negatives still let work proceed and surface at integration.

### Tool-ecosystem composition friction

Adopters composing ARC with an agentic worktree-management tool (Conductor, emdash, Maestro,
Warp, Worktrunk, Zed, etc.) hold two postures in tension by design — ARC optimizes for fewer,
deeper, more-reviewed concurrent WUs; the tools optimize for many, faster, less-reviewed. Both
work; the friction surfaces when adopters apply tool-native cadence (10+ simultaneous sessions,
minimal per-WU review) to ARC-managed work and find ARC's per-task interlock and structured
planning artifacts feel heavy, or apply ARC's cadence to tool-managed work and underutilize the
tool's parallelism affordances.

PRD-time question: does ARC ship onboarding guidance for this composition (e.g., "composing ARC
with [tool]: here's how to make the disciplines reinforce rather than fight") in the strategy
doc, or treat as adopter-handled with only the general anti-pattern guidance? Lean: light
onboarding guidance in the strategy doc covering "pick which frame dominates per session" —
without deep per-tool integration docs.

---

## Open Questions

### Parallel-WU ROADMAP format

Current: single "In Progress" / inline status markers. Proposed: research-informed redesign. What
does the exact format look like? Per-tier swimlanes? DAG? Mermaid graphs? Inline annotations?
Format decision pending research.

### ROADMAP visualization scope

Visualization gap exists across multiple planning docs (ROADMAP, plan-* docs, strategy docs).
Should this WU's redesign extend beyond ROADMAP, or scope to ROADMAP only with follow-on for
other docs? PRD decision after research.

### Cohort / wave grouping as first-class structure

The current ROADMAP shows parallel WUs at the same dependency depth (e.g., Worktree Foundation ‖
User Sync UX Polish ‖ Coord Probe as the first wave after Session-Operational Flow). The cohort
relationship is implicit — derivable from the upstream/downstream graph as "WUs at the same depth
with no inter-dependencies." Work Organization Reform's group-dir convention partially
addresses this for codified groups in `backlog/`. Question: does explicit cohort/wave metadata
(beyond WOR's group-dir) add value beyond what the graph already encodes?

Industry precedent surveyed during agile/mobility design discussion 2026-04-28: Jira/Linear epics
(too hierarchical), GitHub milestones (time-boxed not parallel), agile-program tracks/streams
(closest match for parallel-cohort grouping). Light option: optional `**Cohort:**` or `**Wave:**`
field on status/plan files (free-form value); enables tooling to enumerate cohort members for
ROADMAP visualization, status reporting, and shared-deadline tracking. Heavy option: structural
cohort entity in pm.layer with member lists, dependencies, and shared lifecycle workflows.

The case for explicit cohorts strengthens significantly if cohorts gain **shared lifecycle events**
(single PR for the whole wave; coordinated rollout; shared verification step). Today they don't —
each WU has independent integration/archive. If the ROADMAP-visualization research surfaces a
real need for cohort-level operations or reporting, the field addition is the right weight; if
not, graph-derived cohorts (no metadata) plus WOR group dirs suffice. PRD-time decision after
research informs the question.

### Hook symmetry

`post-task-completion`, `post-work-unit-activate`, `post-work-unit-archive` exist in
`arc-extensions`. Should this WU add `post-shift-pause` / `post-shift-resume` / `post-shift-rotate`
hooks? Reasonable by symmetry, but no clear current need. Probably out of scope for this WU,
deferred to a later hooks-completeness pass — but flagged here for explicit PRD decision.

---

## Scope Estimate

**Medium-Small.** Conventions-layer work is doc-heavy — strategy doc creation, async-merge audit,
state-field semantics coordination. Lighter than the pre-redesign shape (focus-role model design
phase removed). Less mechanism-heavy than `draft-worktree-foundation.md` or
`draft-agile-wu-lifecycle.md`.

Phases (provisional):

1. **Strategy doc creation** — `strategy-concurrent-work.md` covering all the sub-sections listed
   in scope item 1. Substantial doc; consolidates findings from four research files.
2. **Async-merge integration audit** — option B implementation; identify and additive-treat each
   touchpoint in integration-adjacent workflows. Coordinate with `draft-agile-wu-lifecycle.md`'s
   tier-aware archival flow.
3. **Awaiting-review state semantics** — coordinate with `draft-agile-wu-lifecycle.md` so WOR's
   `**State:** Integrating` cleanly expresses awaiting-review across handoff, archival, and worktree
   cleanup workflows (no separate `**Integration:**` field).
4. **Documentation cascade** — ensure references and examples align (strategy cross-references;
   ROADMAP examples; template-meta notes if needed).

Phase 1 carries most of the weight. Phases 2-4 are mostly independent of Phase 1; can ship in any
order once Phase 1 lands.

---

## Philosophy Checkpoints

The PRD should explicitly address:

- **P2 (Co-Development):** Conventions preserve the mandatory review stop at task completion
  within each WU. Parallelism is between WUs, not within. The single-human-as-continuity-thread
  principle is maintained by the soft single-active-focus convention (one worktree as the
  agent's active focus at any moment).
- **P5 (Context Preservation):** Conventions improve context preservation — worktree-local
  SESSION-NOTES (mechanism via `draft-worktree-foundation.md`) is correct WU-scoped context, not
  degradation. Activation-time concurrency check surfaces "what was I doing before" via in-flight
  WU enumeration.
- **P7 (Discrete Steps):** One task at a time stays within-WU, not cross-WU. Soft swap discipline
  (transitioning between active worktrees at review-increment boundaries) protects this principle
  under concurrent usage.
- **Honest stance on concurrent sessions:** Framework won't block; docs flag as bandwidth
  violation at heavy concurrency. Consistent with ARC's pattern of encouraging principled usage
  without enforcing technically.

---

## External Research Citations

Sources informing CWC's design. The 2026-05-08 redesign drew on
`research-focus-wip-attention-discipline.md`, `research-active-work-coordination-vocabulary.md`,
`research-concurrent-work-mechanism-layer.md`, and `research-integration-conflict-handling.md`
(referenced in the header narrative). Additional research:

### Worktree-management tool landscape (2026-05-12)

- `research-worktree-tool-convergence.md` — convergence pass across 11 agentic
  worktree-management tools (Cluster 1: Zed, Warp, Worktrunk; Cluster 2: Conductor, emdash,
  Maestro; Cluster 3: Super, Superset, T3code, Soloterm, Nora). Substantive findings shaping
  CWC: every surveyed tool optimizes for many simultaneous sessions, fast spawn, minimal
  per-WU review (§ 3.3, § 6.4) — the opposite posture from ARC's; no tool models focus role
  as a discipline annotation (§ 5.2 reinforced), confirming the 2026-05-08 focus-role
  rejection from a second direction; tool ecosystem and ARC compose by sitting on top of the
  same git-worktree substrate (§ 3.1) with no extension-point integration (§ 4.3). Per-tool
  reports and source URLs captured in the research doc.

## Coordination — ADR-022

Per ADR-022, merge correctness for the agent-maintained-with-merge managed docs (`WORKING-MEMORY`,
`USER-INBOX`, the inboxes) lives in the notes-merge engine operating on structured records — not in
the markdown or a schema. Reference the model rather than redefining write/merge semantics here. See
`adr-022-managed-operational-state-documents.md` § Coordination.

---

[adr-016]: ../reference/adr/adr-016-configurable-autonomy-interlocks-for-session-operations.md
[team-coord]: ../reference/strategies/arc/strategy-team-coordination.md
[integrate-wu]: ../system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md
