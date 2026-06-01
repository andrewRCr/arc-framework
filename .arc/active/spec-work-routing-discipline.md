# PRD: Work-Routing Discipline

- **Origin:** [internal]

- **Purpose:** Modernize ARC's work-routing doctrine for the errand era — capture surfaces become transient
  write-deferral buffers drained by a between-WU `arc-housekeep` flow, and the opportunistic "rider" pattern
  retires in favor of errands — so a WU's stub is the single authoritative source for its domain concerns.
  Codifying that doctrine surfaced two corrections folded in here (see § Errand-model re-pivot): the errand
  *queue* muddied capture-vs-execution and the doctrine carried a `branch.protection: full` bias. This WU
  re-pivots errands to **execution-only** (capture is inbox-only) and threads protection-mode awareness through.

---

## Introduction

ARC's capture/drain model was built **pre-errand**, when "write to artifact Y while on branch X" was genuinely
impossible without violating one-WU-per-branch isolation. Capture-to-inbox plus drain-at-ceremony was the only
tool, so the inbox became load-bearing for *routed* work — concerns with a known home that simply could not be
written yet. Errand Enablement shipped the missing primitive (a cheap isolated branch that auto-merges on the
planning lane), which obsoletes that role. The doctrine has not caught up, and two failures have compounded:

1. **The drain stopped happening.** The USER-INBOX → shared-inbox flush sits in the integration ceremony's
   most-deferrable slot. It was deferred at Worktree Foundation integration to keep a large PR lean, re-deferred
   at Errand Enablement kickoff, and skipped again at Errand Enablement's own integration. The invariant "a WU
   begins with an empty USER-INBOX" is unenforced — soft step + maximum PR pressure + no forcing function — and
   skipped ceremonies compound.

2. **Routed concerns rot in purgatory.** The model has a single eager absorption path: into the WU being
   *activated*, for items scoped to *that* WU. A capture naming a *different, already-existing* stub has no
   eager home — it waits for that target's own planning-kickoff. So a stub is **not** authoritative on its own
   domain; some of its concerns sit in inboxes elsewhere.

**Why now:** the diagnosis of the repeatedly-deferred inbox drain exposed that the inbox/drain model predates
errands and no longer fits. The primitive that obsoletes it has shipped; the corrective doctrine should land
before `in-flight-awareness` so that WU starts from a clean, trustworthy capture pipeline.

**Amendment — errand-model re-pivot (in-WU).** Codifying the doctrine (Phase 2) surfaced that the errand
*queue* shipped by Errand Enablement is itself a capture surface holding execution-bound items — the dual of
the core invariant above — and that the doctrine inherited a `branch.protection: full` bias (the queue's
`chore/<slug>` branch model is full-only; under partial an errand is a direct base commit). This WU absorbs the
correction, since its thesis *is* work-routing discipline and the holding-vs-execution boundary is R1.2:
errands collapse to **execution-only** (capture is inbox-only; an errand *is* a `chore/<slug>` branch under
full / a direct base commit under partial, never a queued artifact), the queue retires, a single `run-errand`
lifecycle plus an `arc-inbox` capture entrypoint replace the capture-flavored `arc-errand` skill, and
protection-mode awareness threads throughout. The full requirements are in § Errand-model re-pivot; the
constitutional record is ADR-021's amendment.

## Goals

- Establish and codify the **core invariant**: a WU's stub/draft is the single authoritative source for its
  domain concerns; capture surfaces are transient buffers, never authoritative; **no item with a known home may
  rest in a capture surface.**
- Codify the **errand-era work-routing doctrine** across both faces — deferred-capture routing (capture-time
  urgency×isolation call + drain-time home resolution) and execution-incidental routing (anti-rider).
- Deliver `arc-housekeep` — the operational between-WU drain mechanism — so the doctrine is enforced by a real
  forcing function rather than ceremony discipline.
- Design the integration-ceremony drain failure **structurally out**: move the drain off the integration
  ceremony entirely, backed by a session-init soft-offer that ensures it still happens.
- Sharpen the capture surfaces to their terminal shape (two-section `USER-INBOX`; atomic-only shared inbox;
  retire `BACKLOG-INBOX`) and validate the whole pipeline by running the new flow against the real backlog.

## Use Cases or System Scenarios

- **Mid-WU capture (deferral).** On branch X, the developer notices a non-urgent concern about a different
  artifact. Rather than polluting X's PR, they capture it to `USER-INBOX` (§ Atomic or § Backlog) and keep
  working. The write is deferred to the next cheap batched moment.
- **Errand execution (own session).** Executing an out-of-WU fix is always its own session — never on branch
  X. `arc-session --errand <blurb|slug>` cold-starts a fresh errand or picks up a flagged capture; bare
  `arc-session` from the primary worktree surfaces it as a discovery route. `run-errand` cuts `chore/<slug>`
  (full) / commits direct to base (partial) as one review increment; the originating inbox entry (if any) is
  removed at **completion** (slug-matched), not at start, so an abandoned errand never orphans the intent.
- **Cross-machine errand resume.** A part-done errand handed off mid-flight = `commit WIP + push chore/<slug>`.
  On another machine, session-init's Materialize arm (extended to `chore/`-prefixed remote branches with no
  meta) adds a worktree and resumes; the goal carries via the notes-synced inbox entry (if any) + the WIP
  commit message — no tracked errand artifact, no SESSION-NOTES.
- **Between-WUs drain (housekeep).** With no active WU, the developer runs `arc-housekeep` from a base-branch
  context. It reads `USER-INBOX`, classifies each entry, routes directly to homes (stub edits written straight
  in; standalone atomic execution via reviewed errands; genuinely-homeless items flushed to the shared inbox),
  and ends with `USER-INBOX` empty.
- **WU-start backstop.** Session-init probes `USER-INBOX` for routable entries and soft-offers housekeep —
  reinforcing the empty-at-WU-start invariant without hard-blocking.
- **Anti-rider.** While editing a file for the current WU, the developer notices a *distinct* concern that
  merely shares the file. Instead of riding it into the current PR, they errand it (or capture it). A
  *same-concern* micro-cleanup in that file stays inline as genuine "leave it cleaner."
- **Live validation (component b).** The first real `arc-housekeep` run drains the long-deferred backlog —
  `andrew`'s `USER-INBOX` captures route to their homes and `BACKLOG-INBOX` is retired into provisional stubs.
  The cleanup *is* the validation of the mechanism.

## Requirements

### Doctrine codification

1. **(P0)** Rewrite `DEV-RULES.ARC § Leave it cleaner` for both faces of the thesis:
    1. The **capture decision table** — inline (this WU's own concern) / errand-now (out-of-WU, urgent) /
       inbox-defer (out-of-WU, not urgent), framed as an urgency × isolation judgment.
    2. The **holding-vs-execution boundary** — the inbox holds, never executes; executing any out-of-current-WU
       work goes through `arc-errand` (never hand-rolled in place, never a manual bypass branch); promotion
       inbox→errand is the only execution path and **moves** the source entry.
    3. The **anti-rider rule** — distinguished by *concern-identity, not file-identity*: same-concern
       micro-cleanup in a file already being edited is inline-always-fine; a distinct concern sharing a
       file/surface errands, never rides.
    4. The **planning-artifacts-aren't-capture-surfaces** anti-pattern — generalize the existing
       completion-notes/session-notes clause to *all* WU planning artifacts (draft / spec / notes / meta /
       `Coordination §`): cross-referencing another WU is fine; holding its work-item as the record-of-record is
       not. This is the dual of the core invariant.
2. **(P0)** Align the affected strategies to the codified doctrine: `planning-module` (§ Inbox Family,
   § Ceremony-Only Writes, § How Work Flows), `work-organization` (§ Incidental Work Model), `session-operations`
   (§ USER-INBOX).

### Capture-surface reshape

3. **(P0)** Sharpen `USER-INBOX` to **two sections** — `## Atomic` and `## Backlog` — each with a one-line
   destination-preamble callout. Headings are the stable character token; routing destinations live in the
   preamble, not the heading.
4. **(P0)** Adopt the **uniform entry grammar** across both inboxes. Every Work-Unit-character entry carries
   `WU_Target:`:
    - `WU_Target: <slug>` — exists → route there; doesn't exist → create it (dir decided at drain).
    - `WU_Target: <slug> (planned|provisional)` — the parenthetical is a new-stub dir hint, ignored if the
      target already exists.
    - `WU_Target: TBD` — undecided; resolved at drain.
    - No `new` keyword (existence-at-drain decides route-vs-create); `Atomic` entries take no `WU_Target`.
5. **(P0)** Land the **terminal shared-inbox shape now**: the shared inbox is **atomic-only** (homeless-only
   visibility; multi-step always has a stub home). **Retire `BACKLOG-INBOX`** — drain its contents to
   provisional stubs and stop writing it; `ATOMIC-INBOX` survives as the atomic-only shared inbox. No
   transitional multi-step valve.
6. **(P0)** Reconcile `parseUserInboxSection` ↔ inbox templates onto the two-section shape and managed-entry
   grammar (`Atomic` / `Backlog` headings; slug-keyed `WU_Target` with the optional maturity parenthetical).
   This folds the standing USER-INBOX template↔parser mismatch capture.
7. **(P0)** Codify the **graduation threshold** (the "bypass the inbox, make a stub directly" decision) as the
   terminal-shape rule: homeless multi-step parks free in `USER-INBOX` § Backlog and graduates to a stub at
   housekeep (*provisional* by default; maturity and same-concern grouping per R34) — never a shared multi-step
   section.

### `arc-housekeep` mechanism

8. **(P0)** Build a **thin `arc-housekeep` skill** dispatching a **drain/route workflow** (matching ARC's
   codified skill/workflow split). Define housekeep's routing against the **logical** model (entry · character ·
   home), not the markdown format, so a later structured-record swap does not break it.
9. **(P0)** Drain logic follows the **gated, phased** shape of R32 (first-pass classify → confirmation interlock
   → chunk → route → execution transition → confirm); the single-pass "classify and route" model is corrected
   there. Routing writes the note **straight into** its home (an existing-stub edit or a freshly-scaffolded stub
   — no per-item errand for note-routing, which is not execution); a deferred or homeless atomic's home is the
   shared inbox (R35). Promotion **moves** the source entry (not copy). Surface shared-inbox aging while there —
   reminder and in-flight-errand sweeps belong to session-init, not the drain.
10. **(P0)** Enforce the precondition as a **machine-checked guard, not prose**: the skill/command resolves its
    write context (current worktree path, current branch, base branch — reusing `arc errand`'s resolution) and
    **refuses or offers to relocate** when invoked from a WU worktree's branch. The precondition is a
    *base-branch write context*, **not** "no active WU" — so housekeep is invokable mid-WU on demand (hop to
    primary, sweep as a batched errand, return) as well as between-WUs. Guidance, not a gate: let captures stack
    before a mid-WU sweep rather than thrashing per-item.
11. **(P0)** Implement the mechanism **DRY across two entry points**: the standalone `arc-housekeep` skill and
    `session-handoff`'s between-WUs path — one workflow, two doors.
12. **(P0)** Add the CLI **`inboxState` / `housekeepNeeded` probe field** (routable count in `USER-INBOX`) to the
    session-init status surface, feeding the soft-offer.

### Lifecycle-workflow deltas

13. **(P0)** `integrate-work-unit` — **remove Step 10** (the drain). Integration ships only the WU; the drain
    becomes a separate post-integration housekeep flow.
14. **(P0)** `session-init` — add the **`housekeep` intent** (a third Orient/between-WUs intent beside discovery
    and errand) + the `inboxState` probe field + the **soft-offer** ("No active WU. USER-INBOX: N pending —
    housekeep?"). Soft-encourage, never hard-block.
15. **(P0)** `session-handoff` — add a **dedicated between-WUs path**: no SESSION-NOTES write (no active-WU
    subdir), no meta commit, review WORKING-MEMORY removals, offer housekeep if captures pending, sync, confirm.
    Wires to the shared drain logic. Folds the standing USER-INBOX § Atomic capture for this path.
16. **(P0)** `activate-work-unit` — **reframe Step 6**: absorption *from* `USER-INBOX` is degenerate (empty
    post-housekeep); absorption *from* the shared inbox (homeless items whose home turns out to be this WU)
    stays legitimate. Narrow the step accordingly.
17. **(P0)** `init-work-unit` — add a **non-blocking backstop warning**: invoked with a non-empty `USER-INBOX`,
    emit "starting new work with N pending captures — consider housekeep first." (Init, not activate — init is
    the begin-new-WU moment the invariant targets.)

### Merge-lane codification

18. **(P0)** Codify how the housekeep drain interacts with the auto-merge lane
    (`strategy-work-organization § Auto-Merge Lane`):
    - A drain is **one PR per lane** — not one per sweep nor one per destination. The grooming bulk is one
      coherent auto-merge PR; lanes never mix in a single PR.
    - **What batches is concern-coherence, not file or destination.** A planning-artifact routing sweep *is* one
      coherent concern (uniform reviewer competence — "route these to their homes") → one batched auto-merge PR.
      A code-execution errand is one concern → its own PR (**1:1**; "one concern" may span many files). Distinct
      concerns never share a PR — **two distinct concerns touching the same file are still two PRs, sequenced
      (rebase B on A), not merged.** This is the anti-rider rule (concern-identity, not file-identity) applied to
      PR packaging: batching distinct same-file concerns to dodge a rebase is the rider anti-pattern. (If two
      entries are truly the *same* concern, they were one errand to begin with.)
    - A new **provisional** stub auto-merges (it is `meta-*`/`draft-*` under `backlog/`, no design authority).
    - The **review threshold** is principled, not path-blanket: a planning-artifact change needs review iff it
      (1) touches a **foreign owner's** artifact (any state), (2) carries **design authority** (`spec-*`/`prd-*`),
      (3) hits a **constitutional** surface (rules/ADRs/strategies), or (4) is an **unverifiable hand-edit of a
      derived surface** — a *sunset* trigger that dissolves once a renderer makes the surface verifiable.
      Otherwise auto-merge.
    - **Carve-out:** housekeep's own homeless-flush and disciplined ROADMAP regen auto-merge (no owner, no
      authority, not constitutional; ceremony discipline / regen-matches-source stands in for #4).
19. **(P1)** Note *for* CWC (not decided here) that the stewardship concern argues for gating dormant foreign
    edits too, with review-vs-notification and substantive-vs-trivial granularity as sub-questions — the general
    owner-graded merge doctrine remains CWC's.

### Forward-compat write-backs (Coordination)

These write-backs **ride this work unit** rather than routing as separate Errands: each is a *spec-scoped
coordination write-back* — a mechanical propagation of this WU's own decisions into the downstream artifacts
they shift, not an incidental edit of foreign-owned work. That is the general seam: a spec-claimed write-back
rides; an unscoped incidental foreign edit (or foreign *design* authoring) routes through the Errand matrix or a
capture. The general rule is codified in `strategy-work-organization § Errand Work Class`, extending the R18
anti-rider test (concern-identity, not file-identity) to the cross-WU write-back case.

20. **(P0)** Write back to `doc-naming-convention`: it adopts `USER-INBOX`'s two-section shape and the uniform
    `WU_Target` entry grammar; because this WU *retires* `BACKLOG-INBOX` rather than collapsing it, doc-naming's
    "collapse two shared files into a two-section `INBOX.PROJECT`" becomes a **simple rename** of the surviving
    `ATOMIC-INBOX` (no Work-Unit section). File renames themselves are out of scope here.
21. **(P0)** Write back to `operational-state-docs`: retiring the shared multi-step section removes a
    surface/section from its managed-doc member list; the interim parser fix adopts the slug-keyed managed-entry
    grammar including `WU_Target` so the structured-record swap is clean. Subsumes the USER-INBOX
    structured-storage capture.
22. **(P0)** Record the **CWC de-scope**: this WU pulls the trustworthy-pipeline slice forward; the general
    isolation-write guard (any base-branch-writing command guarding its context + a pre-commit backstop) is
    captured to `USER-INBOX` for routing to CWC, not held here.

### Live validation (component b)

23. **(P0)** Run the new `arc-housekeep` flow against the **real backlog** to clear current state — drain
    `andrew`'s long-deferred `USER-INBOX` captures to their homes and retire `BACKLOG-INBOX` into provisional
    stubs. This first live run *is* the mechanism's validation.

### Errand-model re-pivot

Folded in after the Phase 2 doctrine surfaced the queue's capture-vs-execution muddle and the protection-mode
bias (see Introduction § Amendment). Requirements 24–31 re-baseline the errand model; the task list lands them
as a remedial phase (2.R) plus the per-phase reconciliation its audit drives.

24. **(P0)** **Collapse errands to execution-only.** Capture is inbox-only; an errand *is* its execution — a
    `chore/<slug>` branch (full) or a direct base commit (partial), tracked by git history + the
    `standalone (...)` footer, never a queued or seeded artifact. **No `errand-*` file, no State field, no
    queue.** Errand state is derived: active = a `chore/` branch with no PR; awaiting-merge = an open PR;
    done = merged (branch teardown). Retire the `ERRANDS.md` queue substrate (template, parser entry-type,
    seeding, the staleness sweep's queue source), the capture-flavored `arc-errand` skill, and the
    `arc errand queue` CLI. **Keep `arc errand check`**, moved to *execution* time (fresher overlap facts).
    Amend **ADR-021** to record the queue retirement and the execution-only model (supersedes its
    "errand-launch entry primitive" as delivered).
25. **(P0)** **Thread protection-mode awareness** through the doctrine — `DEV-RULES.ARC § Discovered Work
    Routing` (the "Holding ≠ execution" boundary's "manual bypass branch" framing is full-only),
    `strategy-work-organization § Errand Work Class` / `§ Cheap-branch path` / `§ Entry path`, and the
    `USER-INBOX` preamble. Express the partial-vs-full split as **clean whole blocks deferring to § Cheap-branch
    path** (the one localized split), not conditionals scattered across surfaces. Authored fragment-extractable
    for `composable-workflows`; cross-workflow refs use stable heading-slug anchors, never ordinals.
26. **(P0)** **`run-errand` workflow** — one workflow, re-enterable phases **Launch → Execute → Integrate**,
    dispatched by `arc-session`. Honors `DEV-RULES.ARC § Review-Increment Invariant` directly (it is one
    increment) — **not** `process-task-loop` (no task list). **Launch** resolves base and relocates the
    execution locus itself (spawn an ephemeral `chore/<slug>` worktree under full + Worktree Foundation; target
    the primary-worktree base checkout under partial) — reusing `resolvePrimaryWorktreePath`, so launching from
    any worktree is not a blocker. **Execute** carries the promote-to-WU primer (R28). **Integrate** opens the
    PR (errand PR body — `template-pull-request` assumes a WU, so a lean errand variant or inline minimal body),
    arms auto-merge (auto lane) or leaves for review (reviewed lane), and on merge tears down the branch/worktree
    **and removes the slug-matched originating inbox entry** (the single place that removal is ensured;
    backstopped by the in-flight sweep). Pause = `commit WIP + push`.
27. **(P0)** **Session-boundary errand awareness** — (a) an **errand-resume arm** in the probe/session-init,
    orthogonal to `sessionType` (current/materializing `chore/`-branch with no meta → load `run-errand`, not
    `process-task-loop`); (b) extend the **Materialize** arm to `chore/`-prefixed remote branches (cross-machine
    resume, R-cross-machine use case); (c) an **in-flight-errand sweep** — advisory, *orient-only* — over chore
    branches (resume / awaiting-merge / merged-cleanup / stale-promote), mirroring the stale-worktree sweep;
    (d) **rate-limited** staleness / reminder nudge (≈once/day, not every session — a new improvement over the
    current sweep); (e) **errand-session handoff** = `commit WIP + push`, ceremony-light, no SESSION-NOTES — and
    other handoffs do **not** police errand branches (flow protection).
28. **(P0)** **Promote-errand-to-WU** — a path in `init-work-unit` (mint `meta-*`, rename `chore/<slug>` →
    `<type>/<name>`, preserve commits), pointed to from `run-errand`'s Execute phase, for an errand that exceeds
    one review increment. Authored as a clean extractable block (`composable-workflows` forward-compat).
29. **(P0)** **`arc-inbox` skill (model-first)** — a thin, unified capture entrypoint (the noun, like
    `arc-session`); routing + entry construction for `§ Atomic` (with/without the reminder flag), `§ Backlog` (with
    `WU_Target`), and homeless flush. Write is **hand-managed markdown now**, structured to swap to
    `operational-state-docs`' managed-write CLI later — interface and entry grammar stable across the swap
    (mirrors how `ROADMAP` was modeled before its renderer). **Doc-boundary divide is the deliverable:** ambient
    always-relevant discipline (the routing decision, the core invariant, holding-vs-execution) stays in
    `DEV-RULES.ARC § Discovered Work Routing` for pre-invocation awareness; actionable construction specifics move
    into the skill; templates clean down to surface-only. Scoped to capture (drain is `arc-housekeep`'s).
    `arc-session` stays the sole *execution* entrypoint. Net skill ledger: retire `arc-errand`, add `arc-inbox`.
30. **(P0)** **`USER-INBOX § Atomic` reminder flag + cadence.** An optional managed field named for its
    *effect*, not an "urgency" reading: the `_Remind:_` descriptor (`true` when set) makes session-init nudge the
    developer about the capture after a delay. Entry fields render as **italic descriptor bullets** alongside the
    existing `_Observation:_` / `_Approach:_` family, but a *parsed* field marks itself by **backtick-delimiting
    its value**: the key stays bare-italic
    (`_Remind:_`, `_Created:_`) and the value is a code span (`true`, the date). Those backticks are the
    visual + machine signal that the sweep reads the token as data, not prose — prose descriptors (e.g.
    `_Captured during:_` provenance) keep bare values. (`_Created:_` is the errand sweep's stamped-date field,
    reused here; the go-forward convention backtick-delimits its value, where the legacy queue form was bare.)
    `Remind` is boolean, default `false`; under the **managed-field render rule** (generalizing `WU_Target`),
    markdown renders a field only at its non-default value and the parser reads absence as the default — so
    `_Remind:_` shows only when `true`, while the structured model (the eventual `operational-state-docs` schema)
    always carries it. The aging anchor is a **tool-stamped capture date** (the reused `_Created:_` date
    descriptor, emitted by `arc-inbox`, not hand-written — flagged-entry-minimum now, universal once structured
    storage lands). Rename
    `errands.staleness_days` → **`inbox.remind_after_days`** (default **1**; a project-level temp default that
    keeps the existing "→ user-scoped" note, relocated by `config-storage-architecture`). The first nudge fires
    at the first session-init on or after `Captured + N days` (floor: never the same day); thereafter it is
    **rate-limited to once per calendar day** — a single batched, advisory orientation line listing all due
    captures, recurring until a housekeep drain clears them. Once/day is a **framework constant**, not a user
    knob; only the threshold is config-exposed. Mechanism: a per-user gitignored last-nudge marker gates the
    daily batch (no per-entry mutation). The flag is **personal-`USER-INBOX`-only** in mechanism — the shared
    `ATOMIC-INBOX` permits the same field grammar but is never nudged (no singular owner, no per-user
    seen-tracking); its staleness is the separate shared-inbox-aging concern. **Repoint** the (queue-retired)
    staleness sweep to read `Remind`-flagged `USER-INBOX` entries + in-flight `chore/` branches, preserving the
    retired queue's discoverability ("here are your committed errands") as an inbox filter, not a second surface.
    Doctrine and grammar land in the re-pivot phase; the sweep repoint, the config code-rename, and the
    rate-limit mechanism land with the probe / session-init phase.
31. **(P0)** **Downstream write-backs for the re-pivot** — extend the `operational-state-docs` write-back: the
    `arc-inbox` deterministic managed-write CLI is *its* backend (model-first here → CLI later), and the reminder
    flag is a managed `§ Atomic` field. Cascade-notes to the agile-parallelism cohort drafts
    (`concurrent-work-conventions`, `agile-wu-lifecycle`, `in-flight-awareness`, the cohort doc) flagging the
    errand-model change (queue retired; errands = execution-only chore branches; `run-errand` lifecycle;
    in-flight-errand detection) to cascade into their errand assumptions when next iterated. Foreign *design
    authoring* routes — these are informational write-backs, not redesigns of their scope.

### Drain-mechanism correction

Surfaced by the first live `arc-housekeep` dry run (component b / Task 6.1): classifying `andrew`'s real backlog
exposed that `drain-inbox` as built (R8–R9) under-structures the drain — it routes in a single uninterrupted
pass with no plan-confirmation gate, assumes commitment on the atomic-errand route rather than eliciting it,
interleaves execution with routing (in tension with `arc-session` as the sole *top-level* execution entrypoint),
omits the at-drain tier re-triage `DEV-RULES.ARC § Task Execution` already promises, and offers no grouping for
homeless multi-step captures. R32–R37 correct the mechanism; they land as a remedial phase (5.R) ahead of the
re-run. Like the errand-model re-pivot, this is correction surfaced by dogfooding, not new scope; ADR-021 is
unaffected (the escape-hatch fits its "committed-but-parked / not-yet-actionable pointer" framing and preserves
the core invariant — no *known-home* item rests).

32. **(P0)** **Gated, phased drain.** Restructure the drain into: **first-pass classify** (no writes) →
    **mandatory workflow-interlock** presenting the full routing plan for confirmation → **chunk** if the plan
    exceeds one reviewable batch → **route** → **optional execution transition** (R35) → **confirm**. The
    interlock is unconditional and precedes every write — the drain never routes straight from classification.
    Authored as an extraction-shaped spine per R37.
33. **(P0)** **At-drain tier re-triage.** The drain performs the reclassification `DEV-RULES.ARC § Task
    Execution` (atomic-tier infra smell-flag) already promises: a `§ Atomic` capture whose real scope is
    quick-tier — load-bearing infra, multi-file, multi-commit, or carrying a design fork — **reclassifies at
    drain and routes to a stub** (existing or new), not to standalone execution. Capture-time classification is
    intentionally coarse (`arc-inbox` is character-only); the drain is the designed re-triage point.
34. **(P0)** **Group by concern; choose maturity.** Multiple homeless multi-step captures sharing one logical
    concern consolidate into a **single** stub rather than one-per-entry — the agent proposes the grouping with
    rationale, the user decides (concern-identity, not entry count; the anti-rider test applied to stub
    creation). New-stub maturity (`planned` vs `provisional`) is a **surfaced choice**, not a hard default:
    *provisional* stays the default for under-evaluated captures, but a well-developed capture may graduate
    `planned` at the user's call. Amends R7.
35. **(P0)** **Routing-first; execution as an explicit tail.** The routing pass is commitment-free; atomic
    *execution* is a distinct, opt-in transition after routing. At the confirmation interlock the user marks
    each atomic **execute-now** or **defer**. Deferred atomics flush to the shared inbox (`ATOMIC-INBOX` under
    `pm.mode: arc-in-git`; project convention otherwise). Execute-now atomics **transition directly into
    `run-errand` in the same session** — `run-errand`'s Launch self-resolves its locus via the shared
    write-context primitive, so there is no dependency on session-init's errand arm. Both the same-session
    transition and the alternative (end the drain, resume via a fresh `arc-session --errand`) are explicit; the
    choice is the user's, governed by context budget, never a structural gate. Clarify in doctrine that
    **`arc-session` is the sole *top-level* execution entrypoint** (no standalone errand command) — not
    `run-errand`'s sole caller.
36. **(P0)** **Per-entry retain escape-hatch + invariant reframe.** A user may, per entry, **retain** a capture
    in `USER-INBOX` rather than route or flush it — for private-until-vetted holding or imminent self-execution.
    It is **never the default and never agent-suggested**. The empty-at-WU-start invariant reframes from
    **"ends empty"** to **"ends with no *un-triaged* entries"** (every entry routed, executed, flushed, or
    explicitly retained) — a retained entry is triaged, not rot. **Marker: a distinct drain-set boolean
    `_Hold:_`** (default `false`, rendered only when `true` under the managed-field render rule, value
    backtick-delimited). `_Remind:_` cannot serve — it signals *nudge-until-drained*, the opposite of
    exempt-from-drain. `_Hold:_` (a) **excludes the entry from `inboxState.housekeepNeeded`** (which counts only
    un-triaged routable entries — so a kept capture stops re-triggering the Orient-time housekeep soft-offer,
    which is not itself daily-rate-limited), and (b) **surfaces via the reminder sweep** for anti-rot (the sweep
    reads `_Remind || _Hold`; that channel *is* once-per-calendar-day rate-limited). Retaining **re-stamps
    `_Created:_`** to the retain date, so the existing reminder floor (first nudge on/after
    `_Created:_ + inbox.remind_after_days`, never same-day) yields "never reminded the day you held it" with no
    new logic. It is a **drain-time** field, so `arc-inbox` (capture) is untouched; ripple is the parser,
    `inbox-state.ts` (exclude), `inbox-reminders.ts` (include), and the `operational-state-docs` schema
    write-back.
37. **(P0)** **Protection-mode first-class; composable forward-compat.** The routing spine (R32–R36) is
    mode-independent; only the **write mechanics** differ — full: grooming auto-merge PR(s) + lane
    classification + review-chunking; partial: direct base commits + commit-boundary discipline, no
    PRs/lanes/review-chunking. Express the split as one **clean whole block deferring to `§ Cheap-branch path` /
    `§ Auto-Merge Lane`** (per R25's pattern), never scattered conditionals — extraction-shaped for
    `composable-workflows` (a mode/tier-agnostic spine plus liftable mode- and execution-transition blocks;
    whole-block extraction, not intra-step branches). Cross-workflow references use stable heading-slug anchors,
    never ordinals; the confirmation interlock takes a plain heading slug, **not** the extension fire-point
    `· #name` marker. No fragment machinery is built here (that is `composable-workflows`'); only the seams are
    kept clean.

### Drain integration-mode

Surfaced by the first *live* drain (component b / Task 6.1) routing into real, foreign-owned drafts: R8–R9 said
routing writes the note "straight into" the stub but left *how* under-specified. Weaving each note holistically
into a draft's bespoke structure is both costly (it does not scale across a sweep) and an **ownership overstep**
— "how does this fit the existing scope?" is a design judgment the *owning* WU answers at its next planning
iteration, not the drainer ad hoc mid-sweep. Like the gated-phased correction above, this is a
mechanism-completeness gap surfaced by dogfooding, not new scope: a *work-routing* WU cannot ship a drain whose
terminal step is under-specified.

38. **(P0)** **Two integration modes + the `Inbound Buffer — Pending Integration` landing zone.** Routing a
    capture into a stub takes one of two modes: **holistic** — weave it into the draft body — only when the fit
    is cheap, clear, and within the drainer's design authority (you own the WU, or it is a trivially-additive,
    on-topic addendum); otherwise a **buffer note (the default)** — append it, with a `routed from <origin>,
    <date>` provenance line, to a standardized `## Inbound Buffer — Pending Integration` section. That section is
    an interstitial sitting immediately after the draft's Origin/Purpose metadata block, set off by `---` rules
    (created on demand; no draft-template change). It is distinct from a WU's native `Open Questions` (its own
    design questions) and from `USER-INBOX`: it holds only items already **routed to this WU as their home**, in
    **transit, never at rest** — which is exactly why it does not violate `DEV-RULES.ARC § Planning artifacts
    aren't capture surfaces`. The "buffer" framing encodes that transit-not-rest property; "inbox" would undercut
    it ("inbound" names the feeder direction without baking in one feeder — per-entry provenance carries the
    source).
39. **(P0)** **Forcing function — integrate at the next planning iteration.** An `Inbound Buffer` section is
    **mandatorily** drained into the draft body before the draft feeds downstream work, so it cannot rot into a
    record-of-record. The minimal floor lands the hook at the existing draft→PRD moment (`1_create-spec.md`
    Step 1: integrate the buffer before treating the plan as authoritative; `2_generate-tasks.md` consumes the
    PRD, downstream of that absorption, so it needs no hook). The richer iteration-time ceremony — a first-class
    buffer-drain step in the conductor's refine loop, superseding the minimal hook — is **offloaded to
    `arc-plan-conductor`** (design-bearing, its domain), routed there as a capture at this drain.

## Non-Goals

- **File renames** (`USER-INBOX → INBOX.USER`, `ATOMIC-INBOX → INBOX.PROJECT`, section renames) — owned by
  `doc-naming-convention`. This WU lands shape + behavior on current names and writes back. (`BACKLOG-INBOX` is
  *retired* here, not renamed.)
- **Structured-record storage** for the inboxes — `operational-state-docs` (downstream of
  `cli-substrate-adoption`). Stay markdown-canonical; keep the shape schematizable. **`arc-inbox`'s deterministic
  managed-write CLI backend** lives there too: this WU ships `arc-inbox` model-first over hand-managed markdown
  (R29); the `arc inbox add` CLI it swaps onto is `operational-state-docs`'.
- **The general errand↔PR packaging convention** and the general owner-graded merge doctrine — durable home is
  Concurrent Work Conventions. This WU adopts only an interim working answer for housekeep.
- **The general isolation-write guard** (any base-branch-writing command guarding its context; pre-commit
  backstop) — WF/CWC territory; this WU hardens only housekeep's own precondition.
- **`arc start` create-new scaffolding** (Agile WU Lifecycle) — non-blocking friction improvement; the interim
  cost is hand-scaffolded provisional stubs at housekeep, per the documented manual path.

## Technical Considerations

- **Skill/workflow split.** Follow ARC's codified pattern (`arc-commit → prepare-commits`,
  `arc-session → session-init`): a thin skill dispatching a logic-bearing workflow.
- **Context resolution reuse.** The housekeep guard reuses `arc errand`'s write-context resolution
  (`currentWorktreePath`, current branch, base branch) rather than introducing a parallel mechanism.
- **Logical-model routing.** Define routing against entry · character · home, not markdown format, so
  `operational-state-docs`' later structured-record swap does not break housekeep.
- **Cross-file workflow references.** New references (session-init ↔ housekeep ↔ session-handoff) use stable
  heading-slug anchors, never ordinal `Step N` refs, per the interim convention `composable-workflows` will
  later codify.
- **Errand state is derived, not stored.** No `errand-*` file, no State field, no queue (R24). Active = a
  `chore/` branch with no PR; awaiting-merge = an open PR; done = merged. Cross-session/cross-machine continuity
  rides the two artifacts that already sync: the notes-synced originating inbox entry (goal, retained until
  completion) + the pushed `chore/<slug>` branch commits (progress). Orphans can't *hide* — every errand artifact
  is attached to a swept surface (inbox entry / pushed branch), never a free-floating file.
- **`run-errand` honors the invariant, not the task loop.** An errand is one review increment, so `run-errand`
  applies `DEV-RULES.ARC § Review-Increment Invariant` directly and must **not** load `process-task-loop` (which
  assumes a task list). The shared core is the *rule*; extracting a composed execution-core workflow is
  `composable-workflows`' call, not this WU's.
- **Context-resolution reuse (one primitive).** `run-errand`'s Launch base-resolution, the housekeep
  write-context guard, and `arc errand check` all reuse `resolvePrimaryWorktreePath` + `branch.base` resolution —
  one primitive, not parallel implementations.
- **`arc-inbox` write-mechanism is pluggable.** Hand-managed markdown now, `arc inbox add` later; the skill
  interface and the managed-entry grammar stay stable across the swap (the `ROADMAP`-modeled-before-its-renderer
  pattern). The grammar `operational-state-docs` adopts is the one this WU defines.
- **Two-component delivery.** (a) codify the doctrine + build housekeep; (b) clear current state by running the
  new flow against the real backlog. Component (b) is the first live run of (a).

## Dependencies and Sequencing

- **Errand Enablement** (shipped) — the cheap-branch + advisory-gate + auto-merge-lane primitives this doctrine
  rests on. Conceptual basis, not a blocking dependency.
- **Intended before `in-flight-awareness`** — so that WU starts from a clean, trustworthy capture pipeline. Soft
  sequencing preference, not a hard dependency.
- **Agile WU Lifecycle** (downstream, non-blocking) — `arc start` create-new makes provisional-stub scaffolding
  cheap; a friction improvement, not a structural dependency.
- **Coordinates with** `doc-naming-convention`, `operational-state-docs`, `concurrent-work-conventions`,
  `handoff-optimization`, `composable-workflows`, `roadmap-tooling` per § Coordination write-backs.

## Success Criteria

- `DEV-RULES.ARC § Leave it cleaner` states the core invariant, the capture decision table, the
  holding-vs-execution boundary, the anti-rider concern-identity test, and the planning-artifacts-aren't-capture
  anti-pattern; the three named strategies are aligned with no contradiction.
- `USER-INBOX` has exactly two sections (`Atomic` / `Backlog`) with destination preambles; both inboxes share
  the uniform `WU_Target` entry grammar; `parseUserInboxSection` parses the new shape (tests green).
- `BACKLOG-INBOX` is retired (no longer written; contents drained to provisional stubs); `ATOMIC-INBOX` is the
  atomic-only shared inbox.
- `arc-housekeep` exists as a thin skill + drain/route workflow, refuses/relocates when invoked off a base-branch
  write context, runs the gated phased flow (first-pass classify → mandatory confirmation interlock → chunk →
  route → optional execution transition) leaving `USER-INBOX` with no un-triaged entries, and is reachable from
  both the standalone skill and `session-handoff`'s between-WUs path.
- The CLI session-init probe exposes `inboxState`/`housekeepNeeded`; `session-init` carries the `housekeep`
  intent and soft-offer; `init-work-unit` warns on non-empty `USER-INBOX`; `integrate-work-unit` Step 10 is
  removed; `activate-work-unit` Step 6 is narrowed.
- The merge-lane codification (one PR per lane; provisional-stub auto-merge; the four-condition review threshold;
  the housekeep carve-out) is documented in `strategy-work-organization`.
- The three forward-compat write-backs (doc-naming-convention, operational-state-docs, CWC de-scope) are
  recorded in their destinations.
- A live `arc-housekeep` run has cleared `andrew`'s pending `USER-INBOX` captures and retired `BACKLOG-INBOX`;
  the next WU begins with `USER-INBOX` holding no un-triaged entries (empty but for any explicitly
  retained-with-reminder captures).

Errand-model re-pivot (R24–31):

- Errands are execution-only: no `ERRANDS.md` queue, no `errand-*` file, no State field; the queue substrate,
  the capture-flavored `arc-errand` skill, and `arc errand queue` are retired; `arc errand check` survives at
  execution time; **ADR-021 carries the amendment**.
- `run-errand` exists as one workflow (Launch → Execute → Integrate), dispatched by `arc-session`, honoring the
  Review-Increment Invariant (not `process-task-loop`); the Integrate phase removes the slug-matched inbox entry
  at completion; promote-to-WU is reachable from Execute via `init-work-unit`.
- Session-init carries the errand-resume arm (orthogonal to `sessionType`), the Materialize extension to
  `chore/` remote branches, and the orient-only in-flight-errand sweep with a rate-limited nudge.
- `arc-inbox` exists as the model-first unified capture entrypoint; the doc-boundary divide holds (ambient
  discipline in `DEV-RULES.ARC § Discovered Work Routing`, actionable specifics in the skill, templates
  surface-only); `§ Atomic` carries the optional reminder flag; `arc-session` is the sole execution entrypoint.
- Protection-mode awareness threads the doctrine as clean blocks deferring to `§ Cheap-branch path` (no scattered
  conditionals); the `operational-state-docs` write-back is extended and the cohort cascade-notes are recorded.

Drain-mechanism correction (R32–37):

- The drain runs gated and phased — first-pass classify, then a mandatory confirmation interlock before any
  write, then route, then an optional execution transition — never a single uninterrupted pass.
- Mis-tiered `§ Atomic` captures reclassify to stubs at drain (R33); same-concern homeless multi-step consolidate
  into one stub with a surfaced `planned`/`provisional` choice (R34).
- Execute-now atomics transition into `run-errand` in-session (R35); deferred atomics flush to the shared inbox;
  a per-entry retain escape-hatch holds a capture as deliberately-triaged — distinguishable from un-triaged so it
  doesn't perpetually re-trigger the housekeep offer — so "ends empty" reads as "no un-triaged entries" (R36).
- Write mechanics are protection-mode-split (full: grooming PR + lanes; partial: direct commits) as one clean
  block, authored extraction-shaped for `composable-workflows` (R37).

## Open Questions

All design-level questions are resolved in upstream planning (no spec-time blockers). Items to resolve **during
work**:

- **Errand↔PR chunking at scale — resolved (component b).** The first live run's volume settled the heuristic:
  a planning-routing sweep chunks by **concern-coherence + review-reachability** — default one auto-merge PR per
  lane, split only when one PR would exceed a reviewer's reach — and the chunk plan is surfaced at the drain's
  confirmation interlock (R32). Under partial protection there are no routing PRs, so chunking degrades to
  **commit-boundary discipline**. Code errands stay 1:1; lanes never mix. Codified in `drain-inbox` +
  `§ Auto-Merge Lane`.
- **Staleness / aging surfacing + nudge rate-limiting.** With the queue retired (R24), the staleness sweep
  repoints at reminder-flagged `§ Atomic` items + in-flight `chore/` branches (R27/R30). The exact presentation,
  whether aging warrants more than a notice, and the **rate-limit mechanism** (≈once/day vs. until-acted/dismissed
  — there is no rate-limit today) settle during workflow authoring.
- **`run-errand` Integrate: eager vs. on-completion PR, and the errand PR body.** Lean is PR-at-completion
  (ceremony-light) with a lean errand body or inline minimal body; a draft-PR-eager variant only if cross-machine
  paused-resume proves common. Settles when authoring `run-errand`.
