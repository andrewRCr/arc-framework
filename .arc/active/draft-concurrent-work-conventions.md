# Draft: Concurrent Work Conventions

**Purpose:** Codify the conventions layer for principled multi-WU work — `strategy-concurrent-work.md`
as the canonical home for activation-time concurrency-check guidance, parallelism decision rubrics,
rebase / merge discipline for concurrent WUs, worktree operational guidance, async-merge
accommodation, and main-worktree-under-full-protection framing. Composes with
`draft-worktree-foundation.md` (mechanism) and `draft-agile-wu-lifecycle.md` (tier model) to deliver
"agile, principled, multi-WU work."

- **State:** Maturing — pre-PRD exploration; structural calls resolved at the 2026-06-03 (part 2) sweep
  (split-vs-fold → **fold**: one WU ships the agile-parallelism cohort complete, conventions **and** mechanism;
  **rename flagged**, coordinate `naming-conventions`). Earlier: renamed from former Work-Unit Mobility WU as part
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

> **Resolved at the 2026-06-03 (part 2) sweep** (see § Planning pass resolutions): split-vs-fold → **fold**; the
> merge-safety cluster homes **here**; the buffer is folded; the scope is re-estimated. The flags below are
> retained as the reasoning trail that fed those resolutions.

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

**Fold the buffer at planning.** The eight Inbound Buffer items want a focused integration pass into the
body at this WU's next planning iteration (per the buffer's own `drain-inbox § 5` convention) — not a
piecemeal drain.

## Planning pass resolutions (2026-06-03)

> Decisions from a focused `arc-plan` pass on the integration-end target and the WU↔dev ownership model.
> These feed the PRD. The full Inbound Buffer fold (below) and the split-vs-fold call remain open.

### Scope frame for closeout

CWC = "what closes the agile-parallelism cohort" = the conventions doc **plus** the merge-safety cluster
landing *somewhere* (per `cohort-agile-parallelism.md` § Cohort status & closeout). The **design target is any
team size** — solo is the degenerate case, never the target (AGENT-BRIEF.PROJECT: team-size-agnostic, not
solo-targeted). Cross-machine-sync-coherence and coord-probe stay a separate cohort; only the behind-base
detector overlaps (see Integration-end target).

### Integration-end target: advisory detector + convention (not active guard)

The "main moved under me" target is **(a) convention in the strategy doc + (b) an advisory behind-base
detector**, explicitly **not (c) a blocking guard** — the integration-conflict research is unambiguous that
overlap signals stay advisory (false positives; industry detects at merge time, not before).

- **The detector:** at session-init resume, compute behind-base drift + path overlap ("main moved K, you're N
  behind, these paths overlap → reconcile?"). O(1) per resume (your one branch vs. base); advisory, never gates.
- **De-dup:** this is the *same mechanism* as Inbound item 5's "advisory detector" **and**
  `cross-machine-sync-coherence`'s `baseBranchSync` session-init probe — one buildable, double-captured across
  two cohorts; spec it once. Today nothing computes behind-*base* (`remote-ahead` only detects
  behind-own-upstream).
- Plus the merge-commit hook/footer exemption (Inbound item 4) as a correctness fix.
- `research-integration-conflict-handling.md` is **sufficient** for the integration end — no new external pass.

### Start-side ↔ integration-end coupling

Start-side rigor is inversely coupled to integration-end robustness. Because (b) surfaces drift continuously at
every resume, the activation-time "safe to start?" check stays a **light advisory nudge**, not a heavyweight
conflict-eval subagent (which also cuts against the research — pre-merge conflict prediction is non-idiomatic,
O(n²), false-positive-prone). Pillar-1 start-side spec: codify the judgment heuristics + the light framing; lean
on In-Flight Awareness's shipped oracle-backed check rather than adding tooling.

### WU↔dev ownership model: single-owner WUs

**Decision: a WU is single-owner (one DRI).** Cross-person parallelism = decompose into N single-owner WUs
(cohort ≈ epic), **not** multiple devs concurrently driving one WU's task list. Grounded in the dominant industry
idiom (one branch = one author; story = one assignee; parallelism = more branches/PRs, not more authors per
branch) and in ARC's substrate — a single-owner WU is structurally lighter (one branch + one PR) than the
shared-integration-branch + per-dev-sub-branch topology multi-dev-per-WU requires, and avoids the shared-meta
write-collision and single-`Next Task`-pointer workarounds team-coord currently carries.

- **Non-owner contribution** happens via (1) PR review (already first-class), (2) pairing (synchronous, one
  driver, `Co-authored-by:` for credit — convention, no structure), (3) handoff (sequential owner
  *reassignment* — keep; vacation/rotation).
- **Remove `(@name)` entirely.** With single-owner WUs the meta `**Owner:**` field *is* the assignment;
  per-task markers have no remaining job. team-coord's own rationale — "git tracks authorship; duplicating adds
  maintenance burden" — now argues against `(@name)` in task lists too, once concurrent per-task ownership is gone.
- **Kill the within-WU concurrent multi-dev apparatus** — the Personal-Sub-Branches and Stacked-PRs-per-Developer
  patterns, the shared-meta concurrent-write handling, and "concurrent pairs on different tasks" (DEV-RULES.ARC
  § Task interlock).
- **Caveat:** untested at team scale — a conscious idiomatic + structural-fit bet, not field-proven. The one
  genuine shared-branch case (a feature too cohesive to split) is absorbed by the dichotomy: too-coupled-to-split
  → one WU, one owner, may pair; separable → multiple WUs.
- **Execution is separable.** The *decision* is a CWC conventions item; the *rewrite* it forces —
  `strategy-team-coordination` (branching patterns, the `(@name)` convention, person-to-person handoff),
  DEV-RULES.ARC § Task interlock, meta `**Owner:**` semantics — has real weight and rewrites a doc CWC otherwise
  treats as an orthogonal sibling. Flagged as separable execution and a split-vs-fold input.

### 2026-06-03 (part 2) — full-content sweep

> Second focused pass the same day: swept the remaining threads (start-side, ergonomics/lifecycle, merge-safety)
> and resolved the split-vs-fold structural call. Each thread was grounded against shipped reality — the draft
> above predates a wave of shipped infra and over-scoped accordingly. These feed the PRD; the body below is
> reworked to match.

**Structural: split-vs-fold → FOLD.** A single WU ships the agile-parallelism cohort **complete** — conventions
**and** mechanism. "Convention vs mechanism" character is no longer a splitting axis; cohort-closeout is the
boundary. The mechanism buildables (write-context extensions, behind-base detector, merge-commit exemption,
completion sweep, merge-gate-awareness, `arc start` create-new wiring, subdir-removal primitive) fold in.
Cross-machine concerns stay **out** (the explicit next WU). "Conventions" now undersells the scope —
**rename flagged** (coordinate `naming-conventions`); current name/branch kept for now.

**Shipped-reality reconciliation (4 drift findings — the spec must not re-build these):**

- **IFA shipped the activation-check *mechanism*, not just the oracle.** The oracle-backed check is already
  *consulted* at spawn / cold-start / materialize / errand-launch (IFA R9, Success Criteria #6), advisory, never
  blocks. Pillar 1 adds **doctrine only** — no tooling, no wiring.
- **Async-merge touchpoints are largely shipped.** `archive.cadence: manual` already defers archival post-merge;
  the stale-worktree sweep + session-init in-flight sweeps already backstop walk-away cleanup. The async audit is
  mostly *audit-don't-rebuild*.
- **The write-context-classifier is shipped.** `lib/git/write-context.ts` (`classifyWriteContext` /
  `resolveWriteContext`; consumed by housekeep + CLI) and `errand-branch.ts` (`chore/` detection) exist. Net-new
  is only the *path-surface dimension*, *chore-awareness* (composes the two shipped primitives), the *pre-commit
  backstop hook*, and broader command wiring.
- **The at-branch-creation base-staleness check is shipped** (per `cross-machine-sync-coherence`); the behind-base
  detector composes with it.

**Pillar 1 (start-side check) — doctrine over a shipped mechanism.** One unified *advisory overlap-judgment
doctrine* in `strategy-concurrent-work.md` governing **both** WU-activation and `errand-launch` (one oracle-backed
check, two trigger surfaces) plus thin pointers at those already-built fire-sites so the agent consults it.
Content: a **light codified rubric** (disjoint domain → proceed; shared module / strategy / load-bearing infra →
flag + consider sequencing; foreign-owned overlap → coordinate) with worked examples; the **self/foreign
asymmetry** (single-owner-WU makes this the *entire* "all-owner" addition — self-overlap reorder freely,
foreign-overlap coordinate); an explicit **"this is a heads-up; the behind-base detector is the real net"** weight
statement. No tooling, no analysis subagent — the research rejects automated overlap prediction, not soft rubrics.

**Pillar 2 (ergonomics / lifecycle) — async accommodation + forcing function.** `Integrating` already = the
awaiting-review state (no new state or field). Audit-don't-rebuild the cadence / sweep-covered touchpoints.
**Build:** (a) an explicit **suspend/resume seam** at the PR-open boundary (park in `Integrating`, end the
session, resume the *ceremony* later); (b) an **in-flight completion sweep** generalizing the errand sweep's
PR-state classification to owned WUs across the **full tail** — `awaiting-review → mergeable → merged-needs-archival
→ archived` (the stage-2 archival dangle exists only under `archive.cadence: manual`) — as the forcing function
against dangling-`Integrating` rot. Two tiers: **presence** (roster, free, every session-init) + **mergeable
sharpening** (oracle PR-source, gated to handoff / no-active-WU, degrades to presence without `gh`). A
**configurable `*_after_days` threshold** reusing the inbox-reminder machinery (+ once-per-day marker) gates the
*stale* tier; the *mergeable* and *merged-needs-archival* triggers are event-driven (bypass the threshold).
**Completion is a worktree-agnostic boundary action** — the tail (`gh pr merge` + `arc user close` +
worktree-remove-from-elsewhere) runs cleanest from the **primary worktree**, never a mid-increment switch. Audit
shape: **option B (additive)**, reaffirmed. Unifies with merge-safety item 1 ("decouple merge + cleanup from the
integration session").

**Thread 3 (merge-safety) — composes shipped primitives.** write-context: extend cleanly (path-surface dimension +
chore-awareness + pre-commit backstop hook + broader command wiring) under the **reuse-clean (SOLID / DRY)**
principle — refactor the primitive for all known consumers, never bolt-on. merge-commit: do **both** a hook
exemption (`MERGE_HEAD` / 2-parent skip of conventional + footer rules) and an `integration` footer kind.
behind-base detector: **CWC ships it** (the chosen option) as a **ref-parameterized `origin/<base>`-distance
primitive + a session-init probe slot** (worktree-channel-shaped: `state` / `ahead` / `behind` /
`recommendedAction` / `recommendedPromptText`), built general so `cross-machine-sync-coherence`'s `baseBranchSync`
*extends* it (local-base-ref subject + `session.init_pull.main` + cross-machine sync layer) rather than
double-building. Item 3 (entry-level re-homing of foreign-owned atomics) folds into the all-owner gate doctrine
(cover entry-level, not just file-level writes). Item 6 (cohort-`{name}.md` discovery at session-init)
**included** — agent awareness of the coordinating cohort doc is load-bearing for parallelism actually
coordinating.

**Delivery shape — plan-as-one, deliver-as-a-stack.** Folded as one *planning* concern (one spec); at PRD time,
decompose into a **stack of PR-sized WUs** along deliverable boundaries (doctrine / strategy-doc → mechanism
buildables → team-coord rewrite), per idiomatic small-PR review norms. The general WU-sizing protocol behind this
is routed out (see Routed out).

### Routed out (captured to `USER-INBOX § Backlog`, 2026-06-03)

- **Decomposition** (team-ownership motivation + lifecycle-timing axis) → `arc-plan-conductor` (extends its § 11
  plan-splitting / PRD-decomposition). Planning-lifecycle, not concurrency conventions — not CWC.
- **Collaborative team planning** (single-author-draft + review model) → team-coord + a conductor seam; partly
  subsumes conductor OQ23. Carries a "planning-machinery cohort" organizing flag.
- **Cohort as a first-class structural entity** — stays a draft Open Question (below). The single-owner model
  *strengthens* the case (cohorts become the epic-level home for multi-person features), but it is research-gated
  and touches roadmap-tooling + WOR group-dirs. Flag, don't fold.
- **WU/PR right-sizing + decomposition protocol** (plan-grouping vs. delivery-grouping; small-PR review norms;
  stack-vs-cohort; sizing triggers) → `arc-plan-conductor` § 11 + likely `strategy-work-organization`. CWC is the
  motivating live example, but the protocol is decomposition-machinery, not concurrency conventions — not CWC.
- **Base-branch-distance probe slot/primitive coordination** → `cross-machine-sync-coherence` (so its
  `baseBranchSync` extends CWC's shipped primitive rather than double-building). Forward-compat seam note.

---

## Inbound Buffer — folded 2026-06-03

> The eight routed-in concerns were folded into the body at the 2026-06-03 (part 2) sweep (per `drain-inbox § 5`).
> All fold in (split-vs-fold → fold), most resolved against shipped reality. Dispositions below; the design detail
> now lives in § Planning pass resolutions (2026-06-03, part 2), § Scope, and § Design Decisions.

| Folded item | Lands in |
| --- | --- |
| Make WU lifecycle workflows merge-gate-aware | Pillar 2 + thread 3 — unified "decouple merge + cleanup from the integration session" (suspend/resume seam + completion sweep + auto-lane interlock relocation) |
| Base-branch-write guard + commit-hook backstop (write-context primitive) | Thread 3 — **primitive shipped** (`lib/git/write-context.ts`); add path-surface dimension + chore-awareness + pre-commit backstop + wiring |
| `shared-inbox-housekeep` entry-level re-homing of foreign atomics | All-owner gate doctrine — extend to entry-level, not just file-level |
| Merge commits have no Context-footer / commit-msg path | Thread 3 — hook exemption (`MERGE_HEAD`/2-parent) **and** `integration` footer kind |
| In-flight WUs drift from `main` — reconcile-triage convention | Integration-end — behind-base detector (CWC ships; ref-parameterized shared primitive + probe slot) + reconcile-triage doctrine |
| Cohort-`{name}.md` discovery at session-init | **Included** — `AGENT-BRIEF.ARC` note + optional session-init surfacing; load-bearing for cohort coordination |
| Wire `arc start` create-new (worktree-spawning) mode | Mechanism bucket — thin plumbing over the shipped `spawnWorktree` primitive (`--tier` stays AWL) |
| Unify stale/retired subdir removal across `arc user` | Mechanism bucket — extract backup-safe primitive behind `open` / `close` / reconcile + `--prune` flag |

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
- **Tier model, `arc start` `--tier` flag + tier semantics, ceremony scaling, atomic-companion retirement,
  incidental category retirement** — `draft-agile-wu-lifecycle.md`. (The `arc start` create-new **worktree-spawning
  wiring** is *in scope here* — mechanism, folded 2026-06-03; only the tier grammar stays AWL.)
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
- **Cross-machine sync-state coherence** (local base-ref staleness, partial-push trust, notes-ref coherence) —
  `cross-machine-sync-coherence` (the explicit next WU). CWC ships the ref-parameterized base-distance primitive +
  probe slot it extends; the cross-machine layer itself is not CWC's.
- **WU/PR right-sizing + decomposition protocol** — routed to `arc-plan-conductor` § 11 / `strategy-work-organization`
  (§ Routed out). CWC is the motivating example, not the home.
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

### ROADMAP / STATUS visualization — routed out

The earlier "Parallel-WU ROADMAP format" and "visualization scope" questions are **not CWC's**: the ROADMAP /
STATUS render grammar, views, and automation belong to `roadmap-tooling` (render standard + the now/next/later
horizon mode), captured there 2026-06-03. CWC contributes only the concurrency-safety overlay on the "Next"
slice — the existing CWC↔roadmap-tooling seam.

### Exact rename

"Conventions" undersells the folded conventions-plus-mechanism scope; rename toward cohort-closeout (candidates
TBD), coordinating `naming-conventions`. Current name/branch kept until then.

### Internal stack boundaries / phasing

Plan-as-one, deliver-as-a-stack (§ Scope Estimate): at PRD time, cut the stack along deliverable boundaries
(doctrine / strategy-doc → mechanism buildables → team-coord rewrite) — exact boundaries, and whether pieces ship
as separate PRs or one internally-phased PR. The general sizing protocol is routed out (§ Routed out).

### Fuller handoff / archival async audit

Pillar 2 banks "async touchpoints largely shipped" (cadence + sweeps) on the `integrate-work-unit` read; confirm
at spec time with a fuller pass over the handoff + archival workflows that nothing else assumes synchronous merge.

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

**Large — doc-dominant, with a lighter-than-first-framed mechanism tail.** The bulk is documentation:
`strategy-concurrent-work.md` (conventions + the unified overlap-judgment doctrine + async-merge guidance + the
forcing-function / reconcile discipline) plus the single-owner-WU rewrite of `strategy-team-coordination` +
DEV-RULES.ARC. The mechanism half is real but lighter than the pre-sweep framing — most buildables **compose
shipped primitives** (`lib/git/write-context.ts`, the errand sweep, the `origin/<base>` substrate, `spawnWorktree`)
rather than build from scratch: behind-base detector (ref-parameterized primitive + probe slot), in-flight
completion sweep, merge-commit exemption, suspend/resume seam, merge-gate-awareness, `arc start` create-new wiring,
subdir primitive, write-context path-surface / chore extensions + pre-commit backstop.

**Delivery: plan-as-one, deliver-as-a-stack.** One planning concern / one spec; at PRD time decompose into a stack
of PR-sized WUs along the deliverable boundaries below, per small-PR review norms (the general sizing protocol is
routed out — § Routed out). The phases are the natural stack cut.

Phases / stack increments (provisional, dependency order):

1. **Doctrine + strategy doc** — `strategy-concurrent-work.md`: the unified advisory overlap-judgment doctrine
   (pillar 1, both trigger surfaces), parallelize-vs-serialize rubric, worktree operational guidance, async-merge and
   reconcile discipline, anti-patterns, main-worktree convention. Consolidates the four research files; carries
   most of the weight.
2. **Merge-safety mechanism** — behind-base detector (ref-parameterized primitive + probe slot, built for
   `cross-machine-sync-coherence` to extend) + write-context extensions + pre-commit backstop + merge-commit
   exemption.
3. **Lifecycle / ergonomics** — suspend/resume seam + in-flight completion sweep (forcing function, full tail
   through archival) + merge-gate-awareness (option B, additive on `integrate-work-unit`) + `arc start` create-new
   wiring + subdir-removal primitive + cohort-`{name}.md` discovery.
4. **Single-owner-WU rewrite** — `strategy-team-coordination` + DEV-RULES.ARC § Task interlock + meta `**Owner:**`
   semantics; remove the within-WU multi-dev apparatus + `(@name)`. Separable execution; real weight.

Phase 1 is the spine; 2–4 are largely independent and sequence/parallelize as a stack once the doctrine lands.

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
