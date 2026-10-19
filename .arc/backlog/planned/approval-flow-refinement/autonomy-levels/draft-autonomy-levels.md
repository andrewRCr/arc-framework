# Draft: Autonomy Levels

**Cohort:** `approval-flow-refinement`

**Purpose:** Make the Owner's involvement one durable, CLI-owned autonomy level per work unit — naming where the
agent next stops for the Owner — so ARC's approval stops scale from per-task review to a merge-ready hand-off,
without the agent judging what it may do or the Owner being surprised.

- **State:** Draft — seeded from the 2026-10-13 design discussion and groomed the same day; `--plan` resumes it.
- **Created:** 2026-10-13
- **Origin:** [internal] — autonomy-levels design discussion (2026-10-13).

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration. Integrate — or_
> _consciously reject — each one._

### `[ ]` **Treat "nothing on host surfaces" as ARC's default, not an override of a project's disclosure policy**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: autonomy-levels`), housekeep drain (2026-10-15).

- _Shapes:_ § Layers and visibility (the disclosure handoff) and § Scope Boundary (Won't Do).

- _Observation:_ `pull-request-surface-policy` answers the disclosure handoff: by default ARC adds nothing about how a
  change was made, and where the target repository prescribes pull-request content — its PR template, contributing
  guide, AI-use policy, or security policy — that prescription governs. A project requiring disclosure (Kubernetes,
  Ghostty, Fedora, LLVM) gets it in the project's own form.

- _Approach:_ reword the scope-boundary line so it reads as ARC's default, with the project's requirement governing.

- _Captured during:_ `pull-request-surface-policy` draft-design close, `draft-pull-request-surface-policy.md` §
  Coordination (2026-10-14).

### `[ ]` **Never let an incoming peer-session message release an interlock or approval gate**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-15); split from "Let agent sessions in different
  harnesses message each other, enriched and addressed by ARC locus", whose messaging bridge became the
  `agent-session-bridge` stub.

- _Shapes:_ § The grant — "The guard is against drift, not forgery."

- _Observation:_ an incoming peer message never releases an interlock or approval gate, envelope or not, and a missing
  envelope never proves the human wrote it — `codex queue` or Herdr can deliver "approved, commit" to an agent at a
  task-interlock indistinguishably from the Owner. The capture called this doctrine worth landing on its own, apart from
  the bridge.

- _Approach:_ state it beside the drift-not-forgery bullet, which already notes that `UserPromptSubmit` fires for other
  sessions' messages.

- _Captured during:_ read-only exploration session on cross-harness agent messaging, 2026-10-14.

### `[ ]` **Stop before the merge prompt until a team's human review policy is met**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Merge-ready handoff and Kinds of stop: user-attested human-review completion without modelling reviewer
  policy

- _Observation:_ ARC governs agentic review only; human review is out of band and follows once agentic review has closed
  (ADR-034). On a team, a teammate's human review would follow every agentic pass, and nothing tells the agent the
  team's policy, so it may offer the merge before that review happens.

- _Approach:_ a lightweight configured seam: the agent knows the team's human-review policy as the user states it, and
  does not prompt for merge until the user confirms the policy is met. ARC records the confirmation, never the policy:
  it models no reviewers, approvals, or counts. Candidate homes: `autonomy-levels` (its `merge-ready` hand-off) or an
  integration-adjacent work unit. Related: `strategy-integration` (terminal merge authority) and ADR-031 (the draft lock
  holds through the human-review window).

- _Captured during:_ `review-coverage-cadence` draft design, 2026-10-16, while scoping the shared review pass model to
  agentic review.

### `[ ]` **Bound fix-check rounds when a level lets the agent approve review fixes**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-19).
- _Shapes:_ Kinds of stop and recorded spend envelope: fix-check rounds when agent approves fixes

- _Observation:_ `review-coverage-cadence` D4 counts only complete passes against the pass ceiling. Fix checks sit
  outside it, bounded as adversarial review bounds its rounds: no round cap, each round approved, the approval riding
  the fix round's complete-set disposition approval. D5's next-pass recommendation rides the same approval. Today the
  Owner approves every disposition set, so every fix-check round passes an Owner stop; at a level where the agent
  approves fixes, fix-check rounds would run with no stop and no ceiling.

- _Approach:_ when grooming the grant, decide whether such a level needs a lever on fix-check rounds — a round cap, or
  rounds counted as spend — so a long fix loop still reaches the Owner.

- _Captured during:_ `review-coverage-cadence` draft-design, 2026-10-16.

---

## Grooming Status

- **Readiness:** formalization-ready — the readiness read (2026-10-13) found every settle-able decision settled, a
  stateable success signal, and no inbound buffer.
- **Depth:** `high`, `Novel` — the model is invented, not composed; the prior-art search served as the research
  sub-phase.
- **Boundary fit:** re-raised at readiness; the outcome is proposed in § Cohort Restructure and confirmed with the
  cohort re-cut.
- **Settled in grooming (2026-10-13), each Owner-confirmed:** break-out detection; interlock composition and the ADR
  form; commits and pushes inside a span; planning pass stops; what a stop hands the Owner, audience-separated output
  included; the grant and its raise confirmation; the ceiling default and provenance's internal scope; the vocabulary.
  The readiness read closed three detail gaps by their one reasonable answer: the success signal, the Errand ladder's
  lower end, and commit settings under a level.
- **Next:** the cohort re-cut (§ Cohort Restructure), a routing change of its own; then create-spec for the member
  that carries the model, after the storage cutover.

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

## Success Signal

- A work unit at `phase` runs a whole phase with no Owner stop unless a break-out fires. The phase-end stop shows
  per-task commits, gate results, and the logged deviations, and the CLI's boundary result — not the agent's
  judgment — decided every continue and stop along the way.
- No automation surprises: every stop names its level and its reason, and no stop or continue in a run differs from
  what the level and the break-out rules computed. The autonomy log's stop entries show this, along with the share
  of stops that carried no decision.
- A review-fix round takes one approval (first stage), and a planning pass with nothing to decide posts its summary
  and continues.

## Direction

### The level names where the agent next stops for the Owner

Each level hands the agent everything the previous row did, plus one more kind of stop, so the levels form one
ordinal control rather than a matrix:

| Level              | Stops for the Owner at                            | Newly handed to the agent                   |
| ------------------ | ------------------------------------------------- | ------------------------------------------- |
| `task`             | every task                                        | —                                           |
| `phase`            | each phase end                                    | individual tasks                            |
| `segment`          | each segment end (plans without segments skip it) | phases                                      |
| `implementation`   | built and verified, before the change request     | all of execution                            |
| `merge-ready`      | the merge-ready change request                    | publication, review, in-scope fixes         |
| `design-delegated` | the finalized spec, then the merge-ready request  | design calls inside the WU, task generation |
| `hands-off`        | the merge-ready request only                      | writing its own spec without Owner approval |

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
- **Errands** have no task plan and no spec. Every level below `merge-ready` resolves to one stop — the Errand's
  approval gate, approval then commit, as today — and the ladder tops out at `merge-ready`,
  `errand-autonomous-advance`'s instance.
- **Every surface renders the consequence with the name,** precomposed by the CLI — e.g. "Resume at **phase**
  autonomy (next stop: end of Phase 4), or drop to **task** autonomy (stop after every task)?"

### Kinds of stop

- **Progress stops** — "here is what I did; continue?" Levels remove these.
- **Design stops** — "there is a design call to make." Held through `merge-ready`. At `design-delegated`, in-WU
  design calls are the agent's — made, logged, and shown at the next gate — bounded by the approved spec. At
  `hands-off`, the agent may also amend its own unapproved spec forward, logged.
- **Gates** — the Owner's approval of an artifact. Two matter: the **design gate** (the finalized spec) and the
  **merge gate** (the merge-ready change request). No level releases the merge gate; only `hands-off` releases the
  design gate.
- **Break-outs** — stop at every level: anything reaching outside the WU (other systems, shared contracts, other
  owners' surfaces); irreversible or destructive actions; spend beyond what was approved; accepting a risk, carrying
  a red gate included; and, at `design-delegated`, anything that would change the approved spec's goals, success
  criteria, or scope. **A level changes what happens after a break-out candidate is detected, never whether it is
  detected.**
- **Relays** — the next stage needs a different executor (§ Executors). No level removes them; they ask nothing.

A one-off "your call" on a single decision stays available conversationally at any level: it settles one decision
and changes no level. `DEV-RULES.PROJECT` § Stop routing already defines the Owner layer by consequence class — what
changes something a person approved or owns, or has more than one defensible outcome with product consequences — and
this model keeps that cut.

### Detecting a break-out

Detection is identical at every level: the CLI supplies signals, and the agent classifies them.

- **Derived signals only, computed by the boundary verbs.** Paths the change touched that neither the task list nor
  the spec's scope names, and paths another in-flight work unit or Errand touches — the overlap read `arc errand
  check` already runs (`detectForeignArtifactOverlap`). No configurable protected-path list until dogfooding shows a
  miss — it would be mechanism nothing yet needs.
- **The agent classifies each signal.** An undeclared path is completion or expansion: the callsites, tests, and
  migrations a change requires are completion (`DEV-RULES.ARC` § Proportionality); anything beyond is expansion and
  breaks out. In-flight overlap always breaks out. A reach with no path evidence — a behavior other code depends on
  — stays the agent's judgment, which spec-directed work already requires.
- **Hard triggers versus soft deviations.** Every hard trigger is already a mandatory stop in ARC — an emergent
  design question or spec gap, a quality-gate failure with no deterministic same-concern fix, a plan proved wrong
  against reality, scope that would change the WU boundary — so the model collects them rather than inventing them;
  spec-directedness doubles as the pause trigger. Soft deviations — an ambiguity resolved with a defensible reading,
  a same-concern cleanup, a small assumption — are resolved and logged. The line between them is the existing
  design/implementation boundary: implementation latitude is logged; anything that forecloses a design alternative
  or is hard to reverse breaks out.
- **The autonomy log's deviation entries** record every classification and soft deviation, surfaced at the next
  stop — the co-development substitute for the progress stops a level removes. Without them, a wide span is "trust
  me".
- **The grant's authority coordinates are checked mechanically** (§ The grant); a change there suspends the grant
  instead of relying on the agent to notice.
- **Stalls are not break-outs.** A harness permission prompt or an unavailable tool halts the run without carrying a
  decision. Raising a level runs a pre-flight check of the non-blocking path — the ARC-owned part (release wrappers
  opted in, routing) verified, the harness part named for the Owner to confirm — and warns rather than refuses.

### Interlock composition

- **The level is a preset over which interlocks release.** ADR-018 defines configurable interlock values as trigger
  sets and authorizes the release wrapper by set overlap (`checkInterlock`); an autonomy level extends the same
  framing to the boundaries at which a work unit's interlocks are released in advance. The CLI's continue-or-stop at
  a boundary asks only whether the level released that interlock.
- **The doctrinal change:** task- and workflow-interlocks leave the always-stop set and become level-released;
  integration-interlock never does.
- **Layers of vocabulary:** people speak in autonomy levels; workflows and the CLI speak in interlocks and releases.
  The existing interlock and release vocabulary survives as the mechanism.
- **Authorization from the level; preferences only restrict.** The level authorizes commit at every boundary inside
  the span, and publication once it falls inside the span (§ Commits and pushes inside a span). A personal or
  project setting may only withhold — e.g. "the agent never pushes" — and the effective behavior is the minimum, the
  same combinator as the project ceiling, shown in the status line while active ("autonomy: phase · push held").
  This avoids ADR-016's coupling defect: publication authority comes from the span, not from commit authorization.
- **Commit settings under a level.** `arc.commitInterlock` keeps ADR-018's trigger-set values as that restriction: a
  commit fires at a released boundary only when the configured set includes its trigger. Under `manual`, every
  commit still waits for an explicit approval, so a span wider than `task` ends with its work uncommitted, as
  `manual` does today; the raise pre-flight warns.
- **One new ADR supersedes ADR-016.** ADR-016 rejected "autonomy tiers that include skipping task review" and dropped
  its `session.autonomy` ladder because that ladder ranked commit and push, which have no natural order. This model
  ranks stop boundaries that nest, lives per work unit, and widens review rather than skipping it — a reversal of a
  recorded decision, so supersession rather than amendment (`strategy-adr-methodology` § Choosing the right tier).
  The new record carries forward what ADR-016 got right: the integration interlock always stops, quality-gate
  failures stop at every level, push and sync timing stay mechanics settings, and the interlock vocabulary. ADR-018
  and ADR-017 take dated cross-reference amendments only: ADR-018's trigger-set ladder stands, and its line keeping
  task-interlock off that ladder "per ADR-016" points to the new record for where task-interlock is now released;
  ADR-017's first authorization layer — configured permission overlapping wrapper scope — gains the level as an
  input. ADR-030 is unchanged: a grant is the holder making the reserved decision in advance, which its
  rule-authority reading already covers.

### Commits and pushes inside a span

This absorbs `commit-increments`' vocabulary and its decoupling of commits from when the Owner is asked.

- **A branch push is not publication.** A branch push backs up the work unit's own branch: it makes commits visible
  and freezes their history (no rewriting after a push). It stays a mechanics setting at every level, on today's
  sync cadence, which a personal setting may only withhold. Publication — opening or updating the change request,
  requesting review, replying on the host — puts the work before reviewers and spends review, so only the level
  authorizes it, from `merge-ready`. A push setting that withholds pushes a level needs is a pre-flight warning at
  the raise.
- **The Approval-Gate Invariant.** Every autonomy span closes with a structured approval gate; commits inside the
  span precede it, and nothing past the span's boundary proceeds before it. At `task` nothing changes — approval,
  then commit. From `phase` up the agent commits each task as it completes, so the stop shows clean per-task commits
  rather than one entangled diff, and corrections land as new commits.
- **Bundling.** One commit per task stays the default. A signal — the next task touches files just modified, the two
  are sibling subtasks, or the task list marks the pair — prompts the agent to consider deferring the commit to the
  next task; no signal, no evaluation. At `task` the choice rides the task stop's prompt; from `phase` up it is the
  agent's call, logged in the autonomy log — unpushed commits are reversible in one turn. Never bundle across a push
  or a span boundary.
- **One-off ranges.** "Just do 4.1–4.3" is a temporary span: commits release at each task inside it (replacing
  today's deferred review, which leaves the range uncommitted), and the standing level resumes after it.

### Planning

- **Planning keeps its own boundary set** (pass ⊂ stage); planning and execution run in sequence rather than nesting,
  so one ladder cannot stretch across both.
- **Chunking is not sign-off.** A stop can force the agent to work in bounded pieces (an attention guard the agent
  needs) or collect the Owner's sign-off. The general rule: the agent's working granularity is set by the work; the
  Owner's stops by the level in execution, and by whether something is left to decide in planning.
- **A planning pass stops only when it leaves something to decide**, at every level; otherwise it posts a summary and
  continues. generate-tasks' per-phase confirm already works this way (PR #949); its skeleton, Pass 2, and
  merged-draft stops still fire unconditionally, and an Errand brings them into line. Planning pass stops stay off
  the level ladder: the levels count execution boundaries, and tying passes to them would make the `task` default
  reproduce the outlier. The disproportionate-skeleton stop is always a decision; the adversarial-review offer
  spends, so it stays an offer; task-list approval stays at the regular levels and goes at `design-delegated` and
  `hands-off`, where tasks follow the design gate. Anyone wanting a look at a skeleton asks for it once.
- **The design gate sits at spec finalization, not activation.** Task generation derives from the spec, so a design
  rejected at activation wastes it; and the spec holds the success criteria the merge is judged against, so
  approving it means the merge gate checks the work against criteria the Owner approved. Under `hands-off` the agent
  writes the criteria and judges its own work against them, and the merge package says so (the self-attestation limb
  of `DEV-RULES.ARC` § Rule Authority).
- **Granting a hands-off mode** writes its terms out and surfaces advisory warnings (e.g. a `Novel` design, where
  delegated design fails most). It is available only once a project raises its ceiling above the `merge-ready`
  default, and is presented as an escape hatch, not the typical path.

### What a stop hands the Owner

One report shape, sized to the span; the CLI assembles the mechanical parts and the agent writes the prose.

| Stop                               | Contents                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Every span-end stop                | Per-task commits, gate results, the autonomy log's deviations, break-outs and resolutions  |
| Spans of `implementation` or wider | Adds a reading guide: where to start, the risk hotspots, what changed shape                |
| Design gate (`design-delegated`)   | The decision log (choices and alternatives), the non-author spec review, execution outline |
| Merge gate (`design-delegated`)    | What changed since the approved spec, the decision log, the review results                 |
| Merge gate (`hands-off`)           | A plain banner: spec agent-written and never approved, criteria judged by their author     |

- **Signal-to-noise is the governing constraint.** A report people learn to scan gets rubber-stamped, and a
  rubber-stamped stop is worse than none: it manufactures assurance (the rubber-stamping warning in Feng, McDonald &
  Zhang). So: lead with what needs a decision or deserves a look, as the `disposition-report` method already does
  for finding sets; collapse clean results to a count or one line; rank deviation entries by consequence and
  summarize routine completions (callsites, tests) as counts, detail on request; keep the reading guide to hotspots
  and order, never a narrative of everything. Length tracks what needs attention, not the span's size.
- **Audience-separated output.** Every boundary result separates what enters the conversation from what does not: a
  `report` — precomposed, the only part the agent relays, verbatim, and empty when there is nothing to say; a
  `continuation` — the agent's next action, never relayed; and the `record` — written to the autonomy log and the
  grant, never relayed. Workflows say "relay the report; never echo the rest". Literal models otherwise paste whole
  command results back in dense blocks, and every agent otherwise spends judgment deciding what to say. ARC's
  `recommendedPromptText`, `dispositionReportText`, and `locusGuidance` fields are this pattern applied ad hoc; the
  general contract for every command belongs to `cli-output-contract`.
- **The reading guide** follows `comprehension-preservation`'s split between orientation for the reader and the
  audit record — the audit record stays complete; the report orients.
- **One log, two entry types — the autonomy log.** Deviation entries (each in-span classification and soft
  deviation) and stop entries (level, boundary or break-out, whether it carried a decision, whether direction changed,
  any surprise) are both append-only per subject, so they share one log. The stop entries are also the noise meter:
  stops that repeatedly carry no decision are candidates to remove, and they seed evals.

### The grant

The level lives in a grant: a record kind of its own rather than a meta field, because it carries more than the
level. It is stored per subject (work unit; Errand claim), not per session, so it survives compaction, handoff, and
relays.

- **Fields:** the level; who set it and when; for an upper-tier raise, the confirmation it answered; a generation
  counter; and the authority coordinates it was granted against. The kind registry (`defineKindRegistration`) makes
  a new kind additive; the meta and Errand views render it, and hand edits are refused as they are for the meta's
  verb-owned fields (`checkMetaVerbOwnedField`) — a hand edit raising the level is self-escalation
  (`spec-seam-record-kinds.md` § 5.4).
- **Binding:** a work unit's grant binds to its slug; an Errand's to its exact claim (slug and claim ID) — never
  inherited by a replacement claim, never inferred from permissive commit or push settings. It is claim- and
  scope-bound, not head-bound: commits and approved fixes leave it standing, while review evidence and merge stay
  exact-head.
- **Invalidation, mechanical:** the authority coordinates are the subject and its owner, the change request once one
  exists, the review policy version and spend envelope, the project ceiling, and — at `design-delegated` — the approved
  spec's digest. Boundary verbs compare them; a change suspends the grant with a stop that carries the resume choice.
  A lowered ceiling lowers the effective level and says so; a later configuration change never silently enlarges the
  spend envelope. Reopening a work unit for a correction keeps the level; the reopen is itself an Owner stop.
- **Replay safety:** each action records the generation it ran under, so a replayed or concurrent action cannot act
  twice on one grant event; every resumed action re-reads the current generation first.
- **A ratchet in one direction only.** Tightening is free — the Owner, the agent, or the CLI may do it. Loosening
  happens only on the Owner's explicit word; the agent may recommend a raise, never make one on its own reading. A
  break-out pauses without changing the level, and its prompt carries the resume choice.
- **Every raise is relayed; the upper tier confirms what it hands over.** The agent runs `arc autonomy set` on the
  Owner's explicit word, and the record says so — the trust model every recorded approval uses today. A raise to
  `merge-ready`, `design-delegated`, or `hands-off` first returns `confirmation-required` with CLI-composed text
  naming what the span then includes without per-set approval: publishing, review spend, host replies, and finding
  dispositions, and above `merge-ready`, design calls. The agent relays it verbatim, and only an explicit answer to
  it completes the raise — the confirm-by-echo shape `arc errand close` already uses for a foreign generation
  (`authorizeErrandTerminal`).
- **The guard is against drift, not forgery.** The upper tier hands over acts `DEV-RULES.ARC` § Rule Authority names
  as ones that cannot be undone or unspent, so one casual "ok" must not become standing authority over them
  (`errand-autonomous-advance`: "an agent-written approved-by-grant assertion cannot establish approval by itself").
  Nothing on the machine prevents deliberate forgery, and no record claims more than it knows: the CLI cannot tell an
  Owner-typed `! npx arc autonomy set` from the agent's own call, since process-ancestry recognition is retired
  (`802c740b3`), and a prompt hook is no clean witness, since Claude Code documents `UserPromptSubmit` as also firing
  for subagent hand-backs and other sessions' messages. A witness that proves workable later can strengthen the
  record.
- **Not manufactured from the grant:** an Owner-accepted review terminus (accepting residual risk after seeing the
  result stays its own decision), a pass beyond the recorded envelope, and merge authority.
- **The CLI computes.** Boundary verbs return a typed `continue | stop | relay | break-out` with precomposed text;
  `arc autonomy set <level>` returns a precomposed confirmation naming the concrete next stop.

### Layers and visibility

- **Layering:** a project ceiling (team governance, in `arc-config.yml`) bounds each subject's level; a personal
  default seeds new work units; the default floor is `task`.
- **The ceiling defaults to `merge-ready`:** `design-delegated` and `hands-off` are opt-in, so the shipped default
  says they are an available feature rather than the intended common path. The ladder is ordinal, so one value
  covers every policy — a team that wants no hands-off modes simply leaves the default. A contributor-specific
  ceiling waits for a demonstrated need.
- **Provenance stays internal.** The grant and the autonomy log record the level each change was built under; ARC
  users see it through status and the stop reports. Nothing from this model reaches a change request's body or other
  host surfaces: a reviewer who does not use ARC reads ARC vocabulary as noise, and the author answers for a
  submitted change however it was built. Whether a change's provenance is ever disclosed on host surfaces — in
  neutral wording, off by default, behind a toggle — belongs to `pull-request-surface-policy`.
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

### Vocabulary

Provisional until it reads right where surfaced.

| Term                    | Meaning                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| autonomy level          | The setting                                                        |
| autonomy span           | The work between two approval gates; the level sets its extent     |
| approval gate           | The stop that closes a span (unchanged)                            |
| Approval-Gate Invariant | Successor to the Review-Increment Invariant                        |
| `design-delegated`      | Stops at the spec, then the merge-ready request; hands over design |
| `hands-off`             | Stops only at the merge-ready request; the escape hatch            |
| autonomy log            | One per-subject log with deviation and stop entries                |
| break-out, relay, grant | As defined above                                                   |

- **"Autonomy level"** names the system — the term the closest prior art uses. Not "ratchet": the word already
  carries the `Class` estimate-then-ratchet and the storage seam's import ratchet, and a load-bearing term is
  defined once and used exactly (`strategy-procedure-evolution` P7). Not "horizon" (planning sense), not "check-in"
  (version control's commit), not "checkpoint" (`arc integrate checkpoint`).
- **`merge-ready`, not `merge`:** no level includes the merge. Not `merge-candidate` — ARC's Candidate is the record
  presented at the integration interlock.
- **`review increment` retires.** "Review" collides with the code-review system (the brief already has to say a chunk
  is not a review increment); "increment" implies a fixed unit when the level sets its extent; and its definition
  ("precedes any commit invocation") stops holding once commits decouple. The Approval-Gate Invariant (§ Commits and
  pushes inside a span) succeeds it. Sweep the occurrences once, with the model.
- **"Autonomy span", not "span".** Bare "span" is already ordinary English across ARC ("member span", "evidence
  span", a detour is "the span from entry to closure"), so the defined term is the compound, which appears nowhere
  today. Normative text uses the full term; this draft uses "span" as shorthand.
- **`design-delegated`, not `delegated`:** every level delegates something; this one hands over design. `spec-gated`
  (named for the extra gate it keeps) was the alternative — precise, but "gated" is jargon.
- **Lower level names stay** (`task`, `phase`, `segment`, `implementation`, `merge-ready`): each always renders with
  its consequence ("next stop: built and verified, before the change request").

## Scope Boundary (Won't Do)

- No level releases the merge gate or the integration interlock, and none manufactures merge authority, an
  Owner-accepted review terminus, or a pass beyond the recorded envelope.
- No level changes on its own: no automatic promotion, and a break-out pauses without demoting.
- No configurable protected-path list; break-out detection uses derived signals until dogfooding shows a miss.
- Planning pass stops stay off the ladder.
- No mechanical proof that the Owner typed a raise; the raise record says what is known.
- Nothing on change-request bodies or other host surfaces; disclosure, if ever, is `pull-request-surface-policy`'s.
- Executor assignment configuration is `execution-delegation-doctrine`'s; the general command-output contract is
  `cli-output-contract`'s.
- No contributor-specific ceiling until a need is demonstrated.

## Staging

- **First stage — floor refinement, as Errands.** Each is correct under every version of this model and touches
  nothing the storage cutover rewrites: generate-tasks' per-phase confirm stops only for a decision (PR #949,
  landed); its skeleton, Pass 2, and merged-draft stops follow; and one approval releases a review-fix round's
  commit, push, and settlement. The last two wait in `USER-INBOX § Errand`.
- **Design — now.** `RELEASE-GATES` pulls this work unit's planning forward, design only.
- **After the cutover:** the grant record kind and its verbs (capture its storage-register row), the task-loop
  changes (`spec-seam-lifecycle.md` § 9.3 / § 9.5 — `arc release commit --close` is where task and phase stops
  consult the level, so its authorization should stay source-neutral), and the levels from `task` through
  `implementation`.
- **After the review chain:** `merge-ready` and above, which need `review-source-authority`'s durable Owner-accepted
  terminus and a policy-authorized arm in the finding mutation guard; `errand-autonomous-advance` lands as the
  Errand instance.
- **With `execution-delegation-doctrine`:** relay automation and assignment configuration.
- **Evidence:** the autonomy log's stop entries (§ What a stop hands the Owner) calibrate the levels and seed evals.

## Cohort Restructure — Grooming Input

| Member or neighbor                 | Proposed disposition                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `commit-increments`                | Absorbed: commit/review decoupling and its vocabulary                           |
| `unit-scoped-review`               | Absorbed: graduated scope, break-out matrix, deviation ledger, eligibility      |
| `interlock-release-refinement`     | Re-scoped to the grant record, verbs, and routing collapse; grab-bag re-homed   |
| `lifecycle-advancement-provenance` | Merged into the grant substrate; delivery-landing items move to delivery        |
| `errand-autonomous-advance`        | Stays: the Errand instance                                                      |
| `execution-delegation-doctrine`    | Stays separate (who executes, not when the Owner looks); takes orchestration v2 |

- **Boundary fit, re-raised at readiness.** The model plans as one draft, but its stages wait on three different
  things — the storage cutover, the review chain, and `execution-delegation-doctrine` — and land months apart. That
  leans toward delivering it as several work units along the staging lines rather than one, which is the same
  routing change as the table above; the complete cut (members, edges, slugs) is authored there.
- `interlock-release-refinement`'s grab-bag — commit-footer resolution, archival finalize, the class-tag sweep, the
  dotfiles safety-gate audit, the base-reconcile verb, prepare-commits routing — routes to Errands or its real homes;
  its storage-register row's re-scope applies. Its "errand approval-collapse" item overlaps the first-stage review
  slice.
- `execution-delegation-doctrine`'s sequencing note ("after `interlock-release-refinement`, before
  `unit-scoped-review`") re-cuts with this restructure.
- `comprehension-preservation` coordinates with `unit-scoped-review` (its orientation layer rides that member's
  batch artifacts); the edge moves to whichever member absorbs the deviation ledger.
- Outside the cohort, drafts, metas, and registers name the absorbed or re-scoped members:
  `comprehension-preservation`, `planning-lane-relief`, `execution-delegation-doctrine`, `review-activity-contracts`,
  `instruction-optimization`, `documentation-surface-routing`, `customization-arch-realign`, and
  `cohort-state-storage`'s register. The routing change repoints them.
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

None open. Detail left to the spec: the boundary verbs that host each continue-or-stop decision, where the personal
default lives, and the autonomy log's storage form (with the grant's register row).

## Provenance

Seeded on 2026-10-13 from a design discussion, with an internal survey of the interlock and release machinery and an
external prior-art search, then groomed the same day. Sources read: ADR-016, ADR-017, ADR-018, ADR-030;
`strategy-adr-methodology`; `DEV-RULES.ARC` § Rule Authority, § Review-Increment Invariant, § Task interlock, and
§ Handoff; `DEV-RULES.PROJECT` § Stop routing; `generate-tasks.md` (after PR #949); `review-triage.md`,
`review-response.md`, and `integrate-work-unit.md`; `spec-seam-lifecycle.md` § 9; `spec-seam-record-kinds.md` § 5.4;
`checkInterlock`, `detectForeignArtifactOverlap`, `authorizeErrandTerminal`, and `checkMetaVerbOwnedField`; Claude
Code's hooks and interactive-mode documentation; `draft-execution-delegation-doctrine.md`;
`draft-comprehension-preservation.md`; the cohort members' drafts; and `RELEASE-GATES`.

---
