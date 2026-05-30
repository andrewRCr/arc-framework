# PRD: Work-Routing Discipline

- **Origin:** [internal]

- **Purpose:** Modernize ARC's work-routing doctrine for the errand era — capture surfaces become transient
  write-deferral buffers drained by a between-WU `arc-housekeep` flow, and the opportunistic "rider" pattern
  retires in favor of errands — so a WU's stub is the single authoritative source for its domain concerns.

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
- Sharpen the capture surfaces to their terminal shape (two-section `INBOX.USER`; atomic-only shared inbox;
  retire `BACKLOG-INBOX`) and validate the whole pipeline by running the new flow against the real backlog.

## Use Cases or System Scenarios

- **Mid-WU capture (deferral).** On branch X, the developer notices a non-urgent concern about a different
  artifact. Rather than polluting X's PR, they capture it to `INBOX.USER` (§ Atomic or § Work Unit) and keep
  working. The write is deferred to the next cheap batched moment.
- **Mid-WU execution (errand).** On branch X, an urgent out-of-WU fix is needed. It goes through `arc-errand`,
  which pays the isolation cost now and **moves** any seeding inbox entry out as part of errand creation — no
  executed-but-still-listed orphan.
- **Between-WUs drain (housekeep).** With no active WU, the developer runs `arc-housekeep` from a base-branch
  context. It reads `INBOX.USER`, classifies each entry, routes directly to homes (stub edits written straight
  in; standalone atomic execution via reviewed errands; genuinely-homeless items flushed to the shared inbox),
  and ends with `INBOX.USER` empty.
- **WU-start backstop.** Session-init probes `INBOX.USER` for routable entries and soft-offers housekeep —
  reinforcing the empty-at-WU-start invariant without hard-blocking.
- **Anti-rider.** While editing a file for the current WU, the developer notices a *distinct* concern that
  merely shares the file. Instead of riding it into the current PR, they errand it (or capture it). A
  *same-concern* micro-cleanup in that file stays inline as genuine "leave it cleaner."
- **Live validation (component b).** The first real `arc-housekeep` run drains the long-deferred backlog —
  `andrew`'s `INBOX.USER` captures route to their homes and `BACKLOG-INBOX` is retired into provisional stubs.
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

3. **(P0)** Sharpen `INBOX.USER` to **two sections** — `## Atomic` and `## Work Unit` — each with a one-line
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
   grammar (`Atomic` / `Work Unit` headings; slug-keyed `WU_Target` with the optional maturity parenthetical).
   This folds the standing USER-INBOX template↔parser mismatch capture.
7. **(P0)** Codify the **graduation threshold** (the "bypass the inbox, make a stub directly" decision) as the
   terminal-shape rule: homeless multi-step parks free in `INBOX.USER` § Work Unit and graduates to a
   *provisional* stub at housekeep — never a shared multi-step section.

### `arc-housekeep` mechanism

8. **(P0)** Build a **thin `arc-housekeep` skill** dispatching a **drain/route workflow** (matching ARC's
   codified skill/workflow split). Define housekeep's routing against the **logical** model (entry · character ·
   home), not the markdown format, so a later structured-record swap does not break it.
9. **(P0)** Drain logic: read `INBOX.USER` → classify each entry (existing-stub home / new stub / atomic errand
   / homeless) → route via a **batched, direct** drain on housekeep's own auto-merge branch — stub edits written
   straight in (no per-item errand for note-routing); standalone atomic execution gets its own reviewed errand;
   homeless items flush to the shared inbox. Promotion **moves** the source entry (not copy) → `INBOX.USER` ends
   empty. Also surface the `ERRANDS.md` staleness sweep and shared-inbox aging while there.
10. **(P0)** Enforce the precondition as a **machine-checked guard, not prose**: the skill/command resolves its
    write context (current worktree path, current branch, base branch — reusing `arc errand`'s resolution) and
    **refuses or offers to relocate** when invoked from a WU worktree's branch. The precondition is a
    *base-branch write context*, **not** "no active WU" — so housekeep is invokable mid-WU on demand (hop to
    primary, sweep as a batched errand, return) as well as between-WUs. Guidance, not a gate: let captures stack
    before a mid-WU sweep rather than thrashing per-item.
11. **(P0)** Implement the mechanism **DRY across two entry points**: the standalone `arc-housekeep` skill and
    `session-handoff`'s between-WUs path — one workflow, two doors.
12. **(P0)** Add the CLI **`inboxState` / `housekeepNeeded` probe field** (routable count in `INBOX.USER`) to the
    session-init status surface, feeding the soft-offer.

### Lifecycle-workflow deltas

13. **(P0)** `integrate-work-unit` — **remove Step 10** (the drain). Integration ships only the WU; the drain
    becomes a separate post-integration housekeep flow.
14. **(P0)** `session-init` — add the **`housekeep` intent** (a third Orient/between-WUs intent beside discovery
    and errand) + the `inboxState` probe field + the **soft-offer** ("No active WU. INBOX.USER: N pending —
    housekeep?"). Soft-encourage, never hard-block.
15. **(P0)** `session-handoff` — add a **dedicated between-WUs path**: no SESSION-NOTES write (no active-WU
    subdir), no meta commit, review WORKING-MEMORY removals, offer housekeep if captures pending, sync, confirm.
    Wires to the shared drain logic. Folds the standing USER-INBOX § Atomic capture for this path.
16. **(P0)** `activate-work-unit` — **reframe Step 6**: absorption *from* `INBOX.USER` is degenerate (empty
    post-housekeep); absorption *from* the shared inbox (homeless items whose home turns out to be this WU)
    stays legitimate. Narrow the step accordingly.
17. **(P0)** `init-work-unit` — add a **non-blocking backstop warning**: invoked with a non-empty `INBOX.USER`,
    emit "starting new work with N pending captures — consider housekeep first." (Init, not activate — init is
    the begin-new-WU moment the invariant targets.)

### Merge-lane codification

18. **(P0)** Codify how the housekeep drain interacts with the auto-merge lane
    (`strategy-work-organization § Auto-Merge Lane`):
    - A drain is **one PR per lane** — not one per sweep nor one per destination. The grooming bulk is one
      coherent auto-merge PR; lanes never mix in a single PR.
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

20. **(P0)** Write back to `doc-naming-convention`: it adopts `INBOX.USER`'s two-section shape and the uniform
    `WU_Target` entry grammar; because this WU *retires* `BACKLOG-INBOX` rather than collapsing it, doc-naming's
    "collapse two shared files into a two-section `INBOX.PROJECT`" becomes a **simple rename** of the surviving
    `ATOMIC-INBOX` (no Work-Unit section). File renames themselves are out of scope here.
21. **(P0)** Write back to `operational-state-docs`: retiring the shared multi-step section removes a
    surface/section from its managed-doc member list; the interim parser fix adopts the slug-keyed managed-entry
    grammar including `WU_Target` so the structured-record swap is clean. Subsumes the USER-INBOX
    structured-storage capture.
22. **(P0)** Record the **CWC de-scope**: this WU pulls the trustworthy-pipeline slice forward; the general
    isolation-write guard (any base-branch-writing command guarding its context + a pre-commit backstop) is
    captured to `INBOX.USER` for routing to CWC, not held here.

### Live validation (component b)

23. **(P0)** Run the new `arc-housekeep` flow against the **real backlog** to clear current state — drain
    `andrew`'s long-deferred `INBOX.USER` captures to their homes and retire `BACKLOG-INBOX` into provisional
    stubs. This first live run *is* the mechanism's validation.

## Non-Goals

- **File renames** (`USER-INBOX → INBOX.USER`, `ATOMIC-INBOX → INBOX.PROJECT`, section renames) — owned by
  `doc-naming-convention`. This WU lands shape + behavior on current names and writes back. (`BACKLOG-INBOX` is
  *retired* here, not renamed.)
- **Structured-record storage** for the inboxes — `operational-state-docs` (downstream of
  `cli-substrate-adoption`). Stay markdown-canonical; keep the shape schematizable.
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
- **Move-not-copy atomicity.** Both `INBOX.USER` and `ERRANDS.md` are personal notes-synced docs in the same
  `user/{identity}/` tree, so seeding an errand from an inbox entry is one atomic local move — no
  duplicate-detection hook needed on the blessed path.
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
- `INBOX.USER` has exactly two sections (`Atomic` / `Work Unit`) with destination preambles; both inboxes share
  the uniform `WU_Target` entry grammar; `parseUserInboxSection` parses the new shape (tests green).
- `BACKLOG-INBOX` is retired (no longer written; contents drained to provisional stubs); `ATOMIC-INBOX` is the
  atomic-only shared inbox.
- `arc-housekeep` exists as a thin skill + drain/route workflow, refuses/relocates when invoked off a base-branch
  write context, drains `INBOX.USER` to empty via batched direct routing, and is reachable from both the
  standalone skill and `session-handoff`'s between-WUs path.
- The CLI session-init probe exposes `inboxState`/`housekeepNeeded`; `session-init` carries the `housekeep`
  intent and soft-offer; `init-work-unit` warns on non-empty `INBOX.USER`; `integrate-work-unit` Step 10 is
  removed; `activate-work-unit` Step 6 is narrowed.
- The merge-lane codification (one PR per lane; provisional-stub auto-merge; the four-condition review threshold;
  the housekeep carve-out) is documented in `strategy-work-organization`.
- The three forward-compat write-backs (doc-naming-convention, operational-state-docs, CWC de-scope) are
  recorded in their destinations.
- A live `arc-housekeep` run has cleared `andrew`'s pending `INBOX.USER` captures and retired `BACKLOG-INBOX`;
  the next WU begins with an empty `INBOX.USER`.

## Open Questions

All design-level questions are resolved in upstream planning (no spec-time blockers). Items to resolve **during
work**:

- **Errand↔PR chunking at scale.** The working answer is one auto-merge PR per drain (lanes never mixed),
  chunked only for review-reachability if a drain is very large. The concrete chunking heuristic settles during
  the live run (component b).
- **`ERRANDS.md` staleness / shared-inbox aging surfacing.** Housekeep surfaces both; the exact presentation
  (and whether aging warrants more than a notice) settles during workflow authoring.
