# Draft: Autonomy Levels

**Cohort:** `approval-flow-refinement`

**Purpose:** Make the Owner's involvement one durable, CLI-owned autonomy level per work unit — naming where the
agent next stops for the Owner — so ARC's approval stops scale from per-task review to a merge-ready hand-off,
without the agent judging what it may do or the Owner being surprised.

- **State:** Draft — seeded from the 2026-10-13 design discussion; a `--plan` grooming pass continues it.
- **Created:** 2026-10-13
- **Origin:** [internal] — autonomy-levels design discussion (2026-10-13).

---

## Problem / Motivation

The review-increment invariant — Owner review of every leaf, commit, and push — was the right floor early. It is now
too coarse a tool: some work still warrants it, other work does not, and the right cadence varies by work unit, by
person, and by team. A person who judges one concern low-stakes, with attention needed elsewhere, has no way to say
so inside ARC; the only escape from the rigor is working outside an ARC session and losing its artifacts and
integration.

The cohort's five members each grasp one facet of the missing primitive — a typed, durable, scoped grant that the CLI
consults at work boundaries:

| Member                             | Facet it holds                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `commit-increments`                | Commits fire at work boundaries, decoupled from when the Owner is asked         |
| `unit-scoped-review`               | Review boundary as a setting (leaf / phase / WU); break-out matrix; ledger      |
| `interlock-release-refinement`     | Routing given approval; its trust-grant buffer item is this model               |
| `lifecycle-advancement-provenance` | A durable grant that survives re-entry and is invalidated when its facts change |
| `errand-autonomous-advance`        | The top of the ladder, worked out for an Errand                                 |

Requirements the design holds to:

- **CLI-owned.** The CLI computes what a level permits at each boundary; prose dispatches on the result
  (`strategy-procedure-evolution` P1, P6). Adjustment is conversational, carried out by a verb.
- **Zero judgment at rest.** The agent never spends tokens deciding whether it may do X; the Owner is never
  surprised by a continue or a stop. Attention is spent only when the level changes.
- **Defaults and layers.** Sensible configurable defaults, with team and personal preferences layered over the
  per-work setting.
- **A foundation that extends.** No evals exist yet, so the model lands in stages and is calibrated by dogfooding.

## Provisional Direction

### The level names where the agent next stops for the Owner

Each level hands the agent everything the previous row did, plus one more kind of stop, so the levels form one
ordinal control rather than a matrix:

| Level            | Stops for the Owner at                            | Newly handed to the agent                   |
| ---------------- | ------------------------------------------------- | ------------------------------------------- |
| `task`           | every task                                        | —                                           |
| `phase`          | each phase end                                    | individual tasks                            |
| `segment`        | each segment end (plans without segments skip it) | phases                                      |
| `implementation` | built and verified, before the change request     | all of execution                            |
| `merge-ready`    | the merge-ready change request                    | publication, review, in-scope fixes         |
| `delegated`      | the finalized spec, then the merge-ready request  | design calls inside the WU, task generation |
| `hands-off`      | the merge-ready request only                      | writing its own spec without Owner approval |

- **Through `merge-ready` the Owner is the designer.** Design calls stop for the Owner in planning and in
  execution, as today; `merge-ready` is the regular ceiling. The bottom two rows are the hands-off modes — they
  hand over design stops, which no regular level touches, so they do not overlap the regular levels.
- **Rungs are the lifecycle's own boundaries,** each with an artifact to inspect, ordered by containment
  (task ⊂ phase ⊂ segment ⊂ implementation). A stop before verification would show unchecked work, so verification
  sits inside `implementation`; the meaningful line is before versus after publication.
- **Segments** (`slice` / `layer` / `replication`) are a rung only plans with segments have. Their mode informs the
  advisory recommendation — replication is the most determinate, a layer is substrate others build on — without
  becoming an axis.
- **Delivery plans add no rung.** They multiply the top boundary: each deliverable has its own merge and integration
  interlock.
- **Errands** have no spec, so their ladder tops out at `merge-ready` — `errand-autonomous-advance`'s instance.
- **Every surface renders the consequence with the name,** precomposed by the CLI — e.g. "Resume at **phase**
  autonomy (next stop: end of Phase 4), or drop to **task** autonomy (stop after every task)?"

### Kinds of stop

- **Progress stops** — "here is what I did; continue?" Levels remove these.
- **Design stops** — "there is a design call to make." Held through `merge-ready`. At `delegated`, in-WU design calls
  are the agent's — made, logged, and shown at the next gate — bounded by the approved spec. At `hands-off`, the
  agent may also amend its own unapproved spec forward, logged.
- **Gates** — the Owner's approval of an artifact. Two matter: the **design gate** (the finalized spec) and the
  **merge gate** (the merge-ready change request). No level releases the merge gate; only `hands-off` releases the
  design gate.
- **Break-outs** — stop at every level: anything reaching outside the WU (other systems, shared contracts, other
  owners' surfaces); irreversible or destructive actions; spend beyond what was approved; accepting a risk, carrying
  a red gate included; and, at `delegated`, anything that would change the approved spec's goals, success criteria,
  or scope. **A level changes what happens after a break-out candidate is detected, never whether it is detected.**
- **Relays** — the next stage needs a different executor (below). No level removes them; they ask nothing.

A one-off "your call" on a single decision stays available conversationally at any level: it settles one decision
and changes no level. `DEV-RULES.PROJECT` § Stop routing already defines the Owner layer by consequence class — what
changes something a person approved or owns, or has more than one defensible outcome with product consequences — and
this model keeps that cut.

### Interlock composition

- **The level is a preset over which interlocks release.** ADR-018 already defines configurable interlock values as
  trigger sets and authorizes the release wrapper by set overlap; an autonomy level extends the same framing to the
  boundaries at which a work unit's interlocks are released in advance. The CLI's continue-or-stop at a boundary
  asks only whether the level released that interlock.
- **The doctrinal change:** task- and workflow-interlocks leave the always-stop set and become level-released;
  integration-interlock never does. ADR-018 explicitly keeps task-interlock off the ladder — that line is amended.
- **Layers of vocabulary:** people speak in autonomy levels; workflows and the CLI speak in interlocks and releases.
  The existing interlock and release vocabulary survives as the mechanism.
- **Authorization from the level; preferences only restrict.** The level authorizes commit at every boundary inside
  the span, and push once publication falls inside it. A personal or project setting may only withhold — e.g. "the
  agent never pushes" — and the effective behavior is the minimum, the same combinator as the project ceiling,
  shown in the status line while active ("autonomy: phase · push held"). Push timing (`on-sync` / `on-handoff`) and
  notes sync stay mechanics settings. This avoids ADR-016's coupling defect: push authorization comes from the
  span, not from commit authorization.
- **ADR-016 is amended or superseded.** It rejected "autonomy tiers that include skipping task review" and dropped
  its `session.autonomy` ladder because that ladder ranked commit and push, which have no natural order. This model
  ranks stop boundaries that nest, lives per work unit, and widens review rather than skipping it; the ADR says so
  plainly.

### Planning

- **Planning keeps its own boundary set** (pass ⊂ stage); planning and execution run in sequence rather than nesting,
  so one ladder cannot stretch across both.
- **Chunking is not sign-off.** A stop can force the agent to work in bounded pieces (an attention guard the agent
  needs) or collect the Owner's sign-off (what the level governs). generate-tasks' per-phase confirm gate does both
  and fires on every substantive phase at every depth; it should stop only when there is something to decide. The
  general rule: the agent's working granularity is set by the work, the Owner's stops by the level.
- **The design gate sits at spec finalization, not activation.** Task generation derives from the spec, so a design
  rejected at activation wastes it; and the spec holds the success criteria the merge is judged against, so
  approving it means the merge gate checks the work against criteria the Owner approved. Under `hands-off` the agent
  writes the criteria and judges its own work against them, and the merge package says so (the self-attestation limb
  of `DEV-RULES.ARC` § Rule Authority).
- **The design gate's package:** the agent's decision log (each choice with its alternatives), a non-author review of
  the spec, and a short execution outline (Class, phase and segment counts, anything near the WU's edges).
- **The merge package at `delegated` / `hands-off`:** what changed since the approved spec, the decision log, and the
  review results.
- **Granting a hands-off mode** writes its terms out, surfaces advisory warnings (e.g. a `Novel` design, where
  delegated design fails most), and can be disabled by a project ceiling. It is presented as an escape hatch, not the
  typical path.

### State, verbs, and asymmetry

- **Stored per subject** (work unit; Errand claim), not per session, so it survives compaction, handoff, and relays.
- **Layering:** a project ceiling (team governance) bounds each subject's level; a personal default seeds new work
  units; the default floor is `task`.
- **A ratchet in one direction only.** Tightening is free — the Owner, the agent, or the CLI may do it. Loosening
  is only by the Owner's command; the agent may recommend a raise, never make it. A break-out pauses without changing
  the level, and its prompt carries the resume choice.
- **The CLI computes.** Boundary verbs return a typed `continue | stop | relay | break-out` with precomposed text;
  `arc autonomy set <level>` returns a precomposed confirmation naming the concrete next stop.
- **A verb-owned field.** `spec-seam-record-kinds.md` § 5.4: "a field is verb-owned when a hand edit could slip past a
  gate" — a hand edit raising the level is self-escalation, so hand edits are refused.
- **Advisory recommendation** from `Class`, derivation, task-list shape (spike or investigate tasks), and segment
  mode — never auto-set.
- **Mode awareness:** the level appears in session-init orientation, in every stop and completion report header, and
  in a status line (`status-hud`). Lower boundaries inside a span post non-blocking summaries.

### Executors: relays and independence

- **Independence is a floor.** Any span crossing implementation → verification gets a verifier context that did not
  write the code. Independence governs verdicts and findings; applying fixes may stay with the author under the
  finding mutation guard. Configuration can strengthen this, never weaken it.
- **Relays.** Where the configured executor (harness, model, effort) differs between stages, the boundary is a relay:
  computed from configuration, shown with the level ("autonomy: merge-ready · relays: before verification"), asking
  nothing. The next session resumes with `arc-session --next` at the same level, without re-approval. In-harness
  relays can run automatically through subagent profiles; a cross-vendor relay is a session launch until a headless
  dispatcher exists.
- **Handoff rule.** `DEV-RULES.ARC` § Handoff says handoff is human-invoked; a relay is a handoff the Owner placed in
  advance, and that section needs one amendment line.
- **Assignment belongs to `execution-delegation-doctrine`.** Stage role → executor, with team defaults and personal
  overrides, is that work unit's configuration; this design names the stage roles (design, task generation,
  implementation, verification, review) and carries `relay` in the boundary result. Its role taxonomy composes:
  stage assignment says who drives a stage, `worker` / `peer` say what that driver may spawn. Its gap is that it is
  subagent-centric within one harness; relays cover session-by-session, cross-vendor practice. A relay's fresh
  session becomes the stage's primary and delegates nothing, so relays need nothing from it; verification through a
  subagent needs its `peer` role.

### Naming

- **"Autonomy level"** names the system — the term the closest prior art uses. Not "ratchet" (taken by the `Class`
  estimate-then-ratchet and the import ratchet; procedure-evolution P7), not "horizon" (planning sense), not
  "check-in" (version control's commit), not "checkpoint" (`arc integrate checkpoint`).
- **`merge-ready`, not `merge`:** no level includes the merge. Not `merge-candidate` — ARC's Candidate is the record
  presented at the integration interlock.
- **`delegated` and `hands-off` are placeholders.**
- **`review-increment` retires.** "Review" collides with the code-review system (the brief already has to say a chunk
  is not a review increment); "increment" implies a fixed unit when the level sets its extent; and its definition
  ("precedes any commit invocation") stops holding once commits decouple. Keep **approval gate** for the gate; settle
  a noun for the work between two gates (candidates: "autonomy span", "span"), checked against Chunk and Segment,
  then sweep its occurrences once.

## Staging

- **First stage — floor refinement, landing now as Errands** (`USER-INBOX § Errand`): one approval per review-fix
  round, and generate-tasks' conditional per-phase gate. Each is correct under every version of this model and
  touches nothing the storage cutover rewrites.
- **Design — now.** `RELEASE-GATES` pulls this work unit's planning forward, design only.
- **After the cutover:** the level record and its verbs (a verb-owned field or its own kind; capture its
  storage-register row), the task-loop changes (`spec-seam-lifecycle.md` § 9.3 / § 9.5 — `arc release commit
  --close` is where task and phase stops consult the level, so its authorization should stay source-neutral), and the
  levels from `task` through `implementation`.
- **After the review chain:** `merge-ready` and above, which need `review-source-authority`'s durable Owner-accepted
  terminus and a policy-authorized arm in the finding mutation guard; `errand-autonomous-advance` lands as the
  Errand instance.
- **With `execution-delegation-doctrine`:** relay automation and assignment configuration.
- **Evidence:** a stop ledger — level, boundary or break-out, whether it carried a decision, whether direction
  changed, any surprise — calibrates the levels and seeds evals, beside `unit-scoped-review`'s deviation ledger.

## Cohort Restructure — Grooming Input

| Member or neighbor                 | Proposed disposition                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `commit-increments`                | Absorbed: commit/review decoupling and its vocabulary                           |
| `unit-scoped-review`               | Absorbed: graduated scope, break-out matrix, deviation ledger, eligibility      |
| `interlock-release-refinement`     | Re-scoped to the grant record, verbs, and routing collapse; grab-bag re-homed   |
| `lifecycle-advancement-provenance` | Merged into the grant substrate; delivery-landing items move to delivery        |
| `errand-autonomous-advance`        | Stays: the Errand instance                                                      |
| `execution-delegation-doctrine`    | Stays separate (who executes, not when the Owner looks); takes orchestration v2 |

- `interlock-release-refinement`'s grab-bag — commit-footer resolution, archival finalize, the class-tag sweep, the
  dotfiles safety-gate audit, the base-reconcile verb, prepare-commits routing — routes to Errands or its real homes;
  its storage-register row's re-scope applies. Its "errand approval-collapse" item overlaps the first-stage review
  slice.
- `execution-delegation-doctrine`'s sequencing note ("after `interlock-release-refinement`, before
  `unit-scoped-review`") re-cuts with this restructure.
- The cohort document's Purpose, Coordination, and Closeout re-cut once the model settles.

## Prior Art

- **Feng, McDonald & Zhang 2025, "Levels of Autonomy for AI Agents"** (arXiv 2506.12469): levels named by the
  human's role; its "approver" level matches the top rungs; warns of rubber-stamping; treats autonomy as fixed at
  design time, so runtime adjustment is new ground.
- **Sarter & Woods, automation surprises:** surprises come from mode changes the human did not command — the level
  never changes on its own, break-outs pause without demoting, and the mode is annunciated at every stop.
- **Parasuraman, Sheridan & Wickens 2000:** automation level set per function (information, analysis, decision,
  action) — the basis for disposing of design stops separately from progress stops.
- **Sheridan & Verplank 1978:** the original levels-of-automation scale.
- **ten Cate, entrustable professional activities:** supervision levels per activity; ad hoc versus summative
  entrustment maps onto a one-off "your call" versus a durable level.
- **Ship / Show / Ask:** per-change review mode; "show" is the non-blocking summary inside a span.
- **ITIL standard changes:** classes of work pre-approved.
- **Harness modes:** Claude Code's always-visible permission mode and one-gesture switch (the UX template); Codex's
  approval policy separate from its sandbox, and OpenHands' risk analysis separate from its confirmation policy —
  "how far" kept apart from "what is forbidden".
- **Discourse trust levels:** automatic promotion is the anti-pattern to avoid.
- **The gap:** nothing found schedules human stops along a plan hierarchy as one adjustable setting, and no evidence
  exists on stop frequency versus error or rubber-stamp rates for coding agents.

## Open Questions

- Final names for `delegated` / `hands-off`, and the noun for the work between two approval gates.
- Where push authorization sits below `merge-ready` — the sync cadence or the span.
- Whether a raise into a hands-off mode needs a stronger witness than the agent relaying the Owner's word (e.g. an
  Owner-run command); lowering needs none.
- The grant record's shape — a meta field or its own kind — and its binding to an exact Errand claim.
- What the design-gate and merge packages must contain, and how `comprehension-preservation` feeds them.
- The project ceiling's behavior under team mode.
- Whether generate-tasks' inter-pass stops become informational at higher levels.
- The ADR form: amend ADR-016 and ADR-018, or supersede them with one record.
- How "reaches outside the WU" is established — which scope evidence makes it checkable rather than a judgment.

## Provenance

Seeded on 2026-10-13 from a design discussion, with an internal survey of the interlock and release machinery and an
external prior-art search. Sources read: ADR-016, ADR-017, ADR-018, ADR-030; `DEV-RULES.ARC` § Rule Authority,
§ Review-Increment Invariant, and § Task interlock; `DEV-RULES.PROJECT` § Stop routing; `generate-tasks.md`;
`review-triage.md`, `review-response.md`, and `integrate-work-unit.md`; `spec-seam-lifecycle.md` § 9;
`spec-seam-record-kinds.md` § 5.4; `draft-execution-delegation-doctrine.md`; the cohort members' drafts; and
`RELEASE-GATES`.

---
