# Draft: Work-Routing Discipline

**Purpose:** Modernize ARC's work-routing doctrine for the errand era. Errand Enablement shipped the cheap
isolated-branch primitive; this WU updates the doctrine that primitive obsoletes. Two faces of one thesis,
both landing in `DEV-RULES.ARC § Leave it cleaner`: **deferred-capture routing** (capture surfaces become
transient write-deferral buffers; the drain moves off the integration ceremony into a between-WU `arc-housekeep`
flow) and **execution-incidental routing** (the opportunistic "rider" pattern retires in favor of errands).
Delivers the doctrine plus the `arc-housekeep` mechanism that makes it operational.

- **State:** Draft — active planning (in-place WU on `plan/work-routing-discipline`, 2026-05-29). Spawned
  post-errand-enablement while triaging the deferred USER-INBOX drain, whose repeated deferral exposed that the
  inbox/drain model predates errands and no longer fits.
- **Created:** 2026-05-29
- **Origin:** [internal] — surfaced diagnosing why the USER-INBOX / shared-inbox drain discipline stopped
  happening (deferred at Worktree Foundation and Errand Enablement integrations, then re-deferred as a single
  post-errand-enablement sweep). Root cause is two-layered: **process** (the drain lives in the most-deferrable
  slot of the most-PR-pressured ceremony, with no forcing function) and **design** (the whole capture/drain
  model is a pre-errand workaround that errands obsolete).

---

## Problem / Motivation

Capture surfaces exist to manage one thing: **isolation friction.** A capture is a write you could not make yet
without violating one-WU-per-branch isolation — you are on branch X and notice something about artifact Y, so
you defer the write rather than pollute X's branch/PR. The inbox is a **write-deferral buffer**, nothing more.

Two failures compounded:

1. **The drain stopped happening.** `integrate-work-unit` Step 10 (USER-INBOX → shared flush) was deferred at
   WOR integration to keep an already-large PR lean, re-deferred at errand-enablement kickoff, and skipped again
   at errand-enablement's own integration. The invariant "a WU begins with an empty USER-INBOX" is
   **unenforced** — nothing gates it — and the drain sits in the heaviest ceremony's most-deferrable slot. Soft
   step + max PR pressure + no forcing function = it gets skipped, and skipped ceremonies compound (each defers a
   bigger backlog, lowering the odds the next one runs).
2. **Routed concerns rot in purgatory.** The model has only one eager absorption path: into the WU *being
   activated*, for items scoped to *that* WU. A capture that names a *different, already-existing* stub has no
   eager home — it waits for that target's own planning-kickoff. The result: a WU's stub is **not** authoritative
   on its own domain, because some of its concerns sit in inboxes elsewhere.

Both are symptoms of a deeper fact: the capture/drain model was built **pre-errand**. Back then, "write to Y
while on branch X" was genuinely impossible, so capture-to-inbox + drain-at-ceremony was the only tool, and the
inbox became load-bearing for *routed* work. Errand Enablement shipped the missing primitive — a cheap isolated
branch that *can* make that write now, auto-merging on the planning lane — so the inbox's load-bearing role
evaporated, and the doctrine has not caught up.

## Thesis and core invariant

> A WU's stub/draft is the single authoritative source for its domain concerns. Capture surfaces are transient
> buffers, never authoritative. **No item with a known home may rest in a capture surface.**

Stub authority is the thing the whole discipline protects. If routed concerns linger in inboxes, no stub can be
trusted to hold all of its domain's known concerns. Capture surfaces are explicitly *not* authoritative — they
hold only the genuinely homeless.

## Model — deferred-capture routing

**The sorting axis is isolation: where is it safe to write X's home right now?** On a WU branch, only this WU's
own concerns are safe to write — every other write needs *isolation* (an isolated branch) so it never pollutes
the current PR. An **errand** pays that isolation cost *now*; the **inbox** defers it to the next cheap batched
moment (`arc-housekeep`, between WUs, where the base branch makes shared-planning writes native again). The inbox
earns its keep precisely as that deferral — it lets you wait for the free batched moment instead of paying
per-item isolation mid-WU. So capture splits cleanly into two phases: a **capture-time** routing call and a
**drain-time** home resolution.

### Capture decision (at the moment of noticing X)

| X is… | Safe to write its home now? | Action |
| --- | --- | --- |
| This WU's own concern | Yes — your branch | Inline. **Never capture.** |
| Anything else, and urgent | No — needs isolation now | **Errand** now (executes a fix, or writes the note into its stub) |
| Anything else, not urgent | No — defer the isolated write | **Capture to INBOX.USER**; housekeep routes it next between-WUs |

The capture-time call is just *inline / errand-now / inbox-defer* — an urgency × isolation judgment. The finer
destination (existing stub · new stub · standalone errand · flush to shared) is a **drain-time** resolution, not
a capture-time one.

**Transit lounge, not resting place.** `INBOX.USER` holds known-home and homeless items alike — but only because
housekeep drains it *every* WU. A known-home item may **transit** the personal inbox; it may never **rest** in the
shared inbox, which has no forcing drain (see Surface roles). That distinction is what keeps the core invariant
true rather than aspirational.

**Discovery re-triage.** The home can be discovered *after* capture. Draining is not only "flush by section" —
it re-evaluates each entry; any that now have a known home leave the buffer for it.

### Holding vs. execution (the enforced boundary)

The inbox **holds**; it is never an execution surface. Two leaks are closed:

- **Behavioral (dev-rule, in `§ Leave it cleaner`).** Executing any out-of-current-WU work goes through
  `arc-errand` — never hand-rolled in place (that is the anti-rider violation), never a manual branch that
  bypasses the skill. Promotion inbox→errand is the commitment event and the only execution path.
- **Mechanical (move, not copy).** When `arc-errand` is seeded from an inbox entry it **removes that entry** as
  part of errand creation — both are personal notes-synced docs in the same `user/{identity}/` tree, so it is one
  atomic move. This makes the executed-but-still-listed orphan structurally impossible on the blessed path, so no
  duplicate-detection hook is needed. Housekeep is the catch-all that *surfaces* any residual stale entry (the
  only way to get one is to violate the dev-rule).

**Execution ≠ routing.** The "execution via `arc-errand`" rule governs *executing atomic work*. Routing a
multi-step note to its stub is **not** execution: between-WUs, housekeep writes it **directly** to the stub on its
own auto-merge branch — never inbox→`ERRANDS.md`→stub. A mid-WU errand is the *only* time note-routing needs
isolation; even then the content moves inbox→stub in one step and the `ERRANDS.md` line is an audit record, not a
resting home.

### Drain timing and ownership

- **Between-WUs (primary sweep).** The lowest-isolation-cost moment — the base branch makes shared-planning writes
  native. Routed captures go **directly** to their homes (stub edits written straight in; standalone errands for
  atomic execution); scope-emerged captures graduate to stubs; genuinely-homeless captures flush to the shared
  inbox for project visibility. `INBOX.USER` ends empty. This is `arc-housekeep` (below), and it lives **off** the
  integration ceremony.
- **WU-start (backstop + forcing function).** Session-init checks `INBOX.USER` for routable entries and
  **soft-offers** housekeep. Absorption *from `INBOX.USER`* is the degenerate case (empty post-housekeep);
  absorption *from the shared inbox* (homeless items whose home turns out to be this WU) stays legitimate.
- **Planning-kickoff / activation (home-discovery for the homeless).** Shared-inbox items whose home is *now
  discoverable* as this WU pull into it. This is a **discovery judgment** ("does this homeless item belong to
  me?"), not a `WU_Target` field-match — a known-target item would never be in the shared inbox to begin with.

### Surface roles and the bucket trajectory

The load-bearing axes: **committed vs uncommitted**, **atomic vs multi-step**, **personal vs shared**. The two
inboxes are *not* symmetric in shape, and that asymmetry encodes a real principle — each exists for a different
job:

- **`INBOX.USER`** — personal, transient, drained every WU by housekeep. Exists for **branch-safety deferral**: it
  must hold *every* character you can't safely write right now, so it keeps **two sections** — `## Atomic` and
  `## Work Unit`. (This *un-flattens* the earlier single-list proposal: picking one of two sections, with a TBD
  escape hatch, is trivial friction and a useful forcing function — the section *is* the routing fate. It also
  re-aligns `INBOX.USER` with `doc-naming-convention`'s settled two-section shape.) Survives post-AWL too: mid-WU
  you still can't create a stub from a WU branch, so the Work-Unit transit lounge stays.
- **Shared project inbox (`INBOX.PROJECT`)** — project-visible, tracked. Exists for **homeless-only visibility**:
  it holds only what has *no* better home. Multi-step work *always* has a better home (a stub), so it is
  **atomic-only from day one** — the absence of a Work-Unit section is itself the statement "make a stub." Drained
  by **pull** at ceremonies (it can't push-drain — homeless items have nowhere to push *to*), not by housekeep.
- **WU stubs** — the authoritative domain home. Fed by errands (mid-WU) and by direct housekeep routing
  (between-WUs); fed at kickoff by pull-in from the shared inbox.

**Section shape (both inboxes).** Headings are the **stable character token** (`## Atomic` / `## Work Unit`) — the
anchor and reference key; routing destinations stay out of the heading (they evolve, and compressing them invites
imprecision — e.g. "born provisional" is wrong: most stubs start `planned/`). The destination story rides a
one-line preamble callout:

> *Atomic — Single-step captures. Drain to execution — folded into a WU (inline absorption), or run standalone
> via `arc-errand`. Never executed directly from here.*
>
> *Work Unit — Multi-step captures bound for a backlog stub. Route to an existing stub, or graduate to a new
> one — directly at housekeep; `arc-errand` only if needed mid-WU. Carries `WU_Target` (TBD ok); an optional
> `(planned|provisional)` parenthetical sets a new stub's dir (decided at drain if omitted).*

**Uniform entry grammar.** Both inboxes share one entry shape — the mental-model coherence lives here, not in
identical sections. Every Work-Unit-character entry carries `WU_Target:`:

- `WU_Target: <slug>` — exists → route there; doesn't exist → create it (dir decided at drain).
- `WU_Target: <slug> (planned|provisional)` — the parenthetical is a **new-stub dir hint**; ignored if the target
  already exists (its dir is a fact, not a capture-field assertion — housekeep may surface the mismatch).
- `WU_Target: TBD` — target undecided; resolved at drain.

No `new` keyword: existence-at-drain decides route-vs-create. (`Atomic` entries take no `WU_Target`.)

**Terminal shape now (no trajectory).** Land the end-state directly, not a transitional valve. `INBOX.USER` is
two-section (`Atomic` / `Work Unit`); the shared inbox is **atomic-only from day one** — there is no shared
Work-Unit section, ever. The earlier "carry a shared multi-step valve until AWL" idea is **dropped**: a shared
Work-Unit append and a `provisional/` stub are the *same* base-branch write behind the *same* isolation, so the
valve never saved isolation cost — only meta-file authoring effort, which `arc start`'s create-new mode erases
anyway. So the valve is pure redundancy with `provisional/` stubs (already the project-visible home for
under-evaluated multi-step), and it is cut now: homeless multi-step parks free in `INBOX.USER` §Work Unit and
graduates to a provisional stub at housekeep. Concretely, this WU **retires `BACKLOG-INBOX`** — its contents drain
to provisional stubs (component-b cleanup) and it stops being written; `ATOMIC-INBOX` survives as the atomic-only
shared inbox (the `→ INBOX.PROJECT` *rename* stays `doc-naming-convention`'s job — now a simple rename, not a
collapse). AWL's create-new is a scaffolding-friction improvement, not a structural dependency: the interim cost
is hand-scaffolded provisional stubs, paid at housekeep (batched, on base) per the documented manual path.

**Holding ≠ commitment.** Inbox entries are *uncommitted holding* (no staleness pressure). An entry becomes an
errand only at the moment of commitment; `ERRANDS.md` is the *committed* queue that drains by execution and is
staleness-checked. A fuller atomic inbox does not mean more stale errands.

## Model — execution-incidental routing (anti-rider)

Errands obsolete a second pre-errand workaround: the **opportunistic rider** (folding a distinct concern into a
WU because you happen to be touching the same files). The only thing that ever justified a rider was branch/PR
overhead; post-errand that overhead is gone, leaving pure cost (concern-mixing, a PR that no longer represents
one logical intent). **Codify against riders.** The distinguishing test is **concern-identity, not
file-identity**:

- **Same-concern micro-cleanup** in a file you are already editing (a typo, a lint fix, improving the artifact
  you are working on) → **inline, always fine.** This is genuine "leave it cleaner"; it was never a rider.
- **Distinct concern** that merely shares a file/surface → **errand, never ride.**

This does not reintroduce errand-proliferation: the frequent case (same-concern) stays inline; the infrequent
case (distinct-concern) errands and drains by execution.

## The `arc-housekeep` mechanism

The operational form of the between-WU drain. Matches ARC's codified skill/workflow split (`arc-commit` →
`prepare-commits`, `arc-session` → `session-init`): a **thin `arc-housekeep` skill** dispatches a **drain/route
workflow** carrying the logic.

- **Precondition: a base-branch write context — *not* "no active WU."** Draining writes shared base-branch paths
  (stubs, shared inbox), so it must run from the primary worktree / a base-branch context, never a WU worktree's
  branch. That is the constraint it shares with errands (which queue mid-WU and execute from the primary
  worktree) — *not* a no-active-WU gate. So housekeep is invokable **mid-WU on demand** (notice the inbox filling,
  hop to primary, run the sweep as a batched errand, return — your WU worktree untouched) as well as
  **between-WUs** (the default rhythm, where the empty-`INBOX.USER`-at-WU-start invariant + session-init soft-offer
  land). Guidance, not a gate: let a few captures stack before a mid-WU sweep — per-item hops thrash.
- **Make the precondition a machine-checked guard, not prose.** The skill/command resolves its context
  (`currentWorktreePath`, current branch, base branch — the same resolution `arc errand` already does) and
  **refuses or offers to relocate** when invoked from a WU worktree's branch, rather than writing where it
  shouldn't. The pre-commit hook layer is the catch-all backstop for hand-edits that bypass the command (see
  Coordination — isolation guards).
- **Logic:** read INBOX.USER → classify each entry (existing-stub home? new stub? atomic errand? homeless?) →
  route via a **batched, direct** drain on housekeep's own auto-merge branch — stub edits written straight in (no
  per-item errand for note-routing); standalone atomic execution still gets its own reviewed errand; homeless
  items flush to the shared inbox. Promotion drains the source entry (move, not copy) → INBOX.USER ends empty.
  Also surface the `ERRANDS.md` staleness sweep and shared-inbox aging while there.
- **DRY across two entry points:** the standalone `arc-housekeep` skill, and `session-handoff`'s between-WUs
  path. One workflow, two doors.
- **session-init integration = the soft-gate, made concrete.** An `inboxState` / `housekeepNeeded` probe field
  (routable count in INBOX.USER) lets the Orient/between-WUs arm carry a **third intent** beside discovery and
  errand: *"No active WU. INBOX.USER: N pending — housekeep?"* A suggested action, not a nag (decision: soft-
  encourage, never hard-block). The forcing function and the housekeep offer are the same mechanism.

Define housekeep's routing against the **logical** model (entry · character · home), not the markdown format, so
`operational-state-docs`' later structured-record swap does not break it.

## Lifecycle-workflow deltas

- **`integrate-work-unit` Step 10 → removed.** The drain leaves integration. Today it is bundled into the
  integration commit — exactly why it is skipped under PR-leanness pressure. Now integration ships only the WU;
  the drain is a separate post-integration housekeep flow. The failure mode is **structurally designed out**,
  and the session-init offer ensures the now-separate drain still happens.
- **`activate-work-unit` Step 6 → reframed.** Absorption from INBOX.USER is degenerate (empty post-housekeep);
  absorption from the shared inbox stays. Narrow the step accordingly.
- **`session-init` → gains** the `housekeep` intent + the `inboxState` probe field + the soft-offer.
- **`session-handoff` → gains a dedicated between-WUs path** (folds USER-INBOX §Atomic item): no SESSION-NOTES
  write (no active-WU subdir), no meta commit, review WORKING-MEMORY removals, **offer housekeep if captures
  pending**, sync, confirm. Wires to the shared drain logic.
- **`init-work-unit` → warns** (backstop): invoked with a non-empty INBOX.USER, emit a non-blocking "starting
  new work with N pending captures — consider housekeep first." Init, not activate — init is the begin-new-WU
  moment the invariant targets; activate is mid-WU.
- **`DEV-RULES.ARC § Leave it cleaner` → rewritten** for both faces of the thesis: capture routing table + the
  holding-vs-execution boundary + anti-rider, plus the **planning-artifacts-aren't-capture-surfaces**
  anti-pattern — generalizing the existing completion-notes/session-notes clause to *all* WU planning artifacts
  (draft/spec/notes/meta/`Coordination §`): cross-*referencing* another WU is fine, holding its work-item as the
  record-of-record is not (it orphans — no sweep — and pollutes the doc's PR/archive with foreign intermediate
  state). This is the **dual of the core invariant** — together they give every item one right place (capture
  surface if homeless/in-transit; its own domain's authoritative doc if homed). **Strategies**
  (`planning-module` §Inbox Family / §Ceremony-Only Writes / §How Work Flows; `work-organization`
  §Incidental Work Model; `session-operations` §USER-INBOX) → aligned.
- **Templates** (inbox shapes) + **`parseUserInboxSection`** parser → reconciled to the **two-section shape and
  uniform entry grammar** (`Atomic` / `Work Unit` headings; slug-keyed `WU_Target` with the optional maturity
  parenthetical; folds USER-INBOX §Atomic item — the template↔parser mismatch must be fixed onto the
  managed-entry grammar anyway).
- **CLI** → the `inboxState` probe slot.

## Scope

### In scope

1. The errand-era work-routing doctrine — both faces — codified across the surfaces above.
2. `arc-housekeep` skill + drain/route workflow + the session-init probe field/offer + the `session-handoff`
   between-WUs path + the `init-work-unit` backstop warning.
3. INBOX.USER two-section sharpening (`Atomic` / `Work Unit`) + the uniform entry grammar (`WU_Target` with the
   optional maturity parenthetical); the shared-inbox role sharpening to **atomic-only now** — retire
   `BACKLOG-INBOX`, draining its contents to provisional stubs; no transitional multi-step valve.
4. The `parseUserInboxSection` ↔ template reconcile onto the managed-entry grammar incl. `WU_Target` (mandatory
   consequence of the reshape).
5. The graduation-threshold codification (USER-INBOX §Backlog item — the "bypass the inbox, make a stub
   directly" threshold; here it becomes the terminal-shape decision — provisional stub directly, no shared
   multi-step valve).
6. Three forward-compat write-backs (Coordination): `doc-naming-convention`, `operational-state-docs`, the CWC
   de-scope.

### Out of scope

- **File renames** (`USER-INBOX → INBOX.USER`, `ATOMIC-INBOX → INBOX.PROJECT`, section renames) —
  `doc-naming-convention` owns these; we land shape + behavior on current names and write back. (`BACKLOG-INBOX`
  is *retired* here, not renamed — so its former "collapse into `INBOX.PROJECT`" becomes a simple rename of the
  surviving `ATOMIC-INBOX`.) Full doc-surface uniformity waits for that WU.
- **Structured-record storage** for the inboxes — `operational-state-docs` (Move B), downstream of
  `cli-substrate-adoption`. We stay markdown-canonical and keep the shape schematizable.
- **The general errand↔PR packaging convention** — see Open Questions; durable home is likely Concurrent Work
  Conventions. We adopt an interim working answer for housekeep only.

### Folded captures (from the inbox triage that spawned this WU)

- USER-INBOX §Atomic: *dedicated between-WUs path in `session-handoff`* — built here.
- USER-INBOX §Atomic: *reconcile USER-INBOX template↔parser* — mandatory consequence of the reshape.
- USER-INBOX §Backlog: *codify the inbox→stub graduation threshold* — becomes the terminal-shape decision
  (provisional stub directly; no shared multi-step valve).

## Coordination

- **`doc-naming-convention` (write-back + reshape).** It adopts `INBOX.USER`'s two-section shape (the earlier
  flatten is dropped — no conflict there; the `Atomic` / `Work Unit` section semantics are ours, the *renames*
  stay its job). The reshape: **`INBOX.PROJECT` is atomic-only** (single section), because this WU retires
  `BACKLOG-INBOX` rather than collapsing it — so doc-naming's "collapse two shared files into a two-section
  `INBOX.PROJECT`" becomes a **simple rename of the surviving `ATOMIC-INBOX`**, no Work-Unit section. Also write
  back the uniform `WU_Target` entry grammar so the rename cascade carries it.
- **`operational-state-docs` (write-back).** Retiring the shared multi-step section *removes a surface/section*
  from its managed-doc member list — a simplification. The interim `parseUserInboxSection` fix here should adopt
  the slug-keyed managed-entry grammar **including `WU_Target`** so OSD's structured-record swap is clean.
  Subsumes the USER-INBOX "structured-storage + routed-write" capture (that stays OSD's).
- **`concurrent-work-conventions` (de-scope).** CWC's charter already owns the isolation doctrine ("capture
  surfaces are for not-yet-actionable pointers only; stub-ready or non-trivial work goes to its real home
  directly"). This WU pulls that slice forward (the pipeline must be trustworthy before `in-flight-awareness`),
  leaving CWC its concurrency-gate / merge-ordering / stacked-PR remainder. Also the likely durable home for the
  errand↔PR packaging convention (Open Questions).
- **`handoff-optimization` (coordinate).** Owns SESSION-NOTES content/template cleanup (the "Working On" field,
  the post-WOR drift). Our between-WUs `session-handoff` path defines *when* SESSION-NOTES is/isn't written (not
  written with no active WU) — same file, adjacent concern. One coordinated sweep.
- **`composable-workflows` (consume interim).** Our new cross-file workflow references (session-init ↔ housekeep
  ↔ session-handoff) use stable heading-slug anchors, never ordinal `Step N` refs, per the interim convention
  that WU will later codify.
- **Worktree Foundation / CWC (de-scope — isolation-write guards).** This WU hardens only its *own* command's
  precondition (housekeep refuses/relocates off a WU branch, reusing `arc errand`'s context resolution). The
  *general* guard — any base-branch-writing command (incl. AWL's `arc start`) guarding its context, plus a
  pre-commit backstop — is isolation enforcement, WF/CWC territory; **de-scoped there.** The design detail (the
  command-guard and the hook sharing one write-context-classifier primitive) is **captured to `INBOX.USER` for
  routing to CWC** — not held here.

### Routed elsewhere (not folded — recorded so they reach their homes)

- *H1 styling for the inbox/memory file family* (ATOMIC-INBOX) → `doc-naming-convention` (rides its rename
  cascade — guaranteed touch).
- *Archival ceremony tooling doesn't accommodate the post-sweep state* (BACKLOG-INBOX) + its duplicate facet
  *`arc release commit`/`push` refuse the archival commit* (USER-INBOX §Atomic) → **dedup into one entry;** out
  of our domain (archival-ceremony mechanics). Splits at drain — the wrapper-refusal facet plausibly →
  `interlock-release-refinement`; the hook + `archive-work-unit` facets are a separate archival-tooling concern.
- *Incidental-scope marking + the post-errand fold-vs-errand bar* (the meta-gap that surfaced the anti-rider
  rule) → under anti-rider the "rider-marking" half is moot; what remains is the inline-vs-errand rule, which is
  in-thesis here. The general meta-observation is captured, not separately tracked.

## Dependencies and sequencing

- **Errand Enablement** (shipped) — the cheap-branch + advisory-gate + auto-merge-lane primitives this doctrine
  rests on. Conceptual basis, not a blocking dependency.
- **Intended before `in-flight-awareness`** — so that WU starts from a clean, trustworthy capture pipeline.
  Soft sequencing preference, not a hard dependency (IFA does not block on this).
- **Agile WU Lifecycle** (downstream, non-blocking) — its `arc start` create-new mode makes provisional-stub
  *scaffolding* cheap. That is a friction improvement, **not** a structural dependency: this WU already lands the
  terminal shape (atomic-only shared inbox); the interim hand-scaffold tax at housekeep is what AWL later removes.
- **Two-component delivery:** (a) codify the doctrine + build housekeep; (b) clear current state by running the
  new housekeep flow against the real backlog. Component (b) is the first live run of (a) — the cleanup *is* the
  validation.

## Merge-lane interaction

The housekeep drain writes across the shipped auto-merge lane's classification (`strategy-work-organization`
§ Auto-Merge Lane), so the codification must say how. Three settled points plus one carve-out.

- **A drain is one PR *per lane* — not one per sweep, nor one per destination.** Routing to planning grooming
  (`draft-*`, `meta-*`, `tasks-*`, `notes-*`, `cohort-*` under `active/`|`backlog/`) auto-merges; routing that
  touches a reviewed-lane surface rides a separate reviewed PR. Per the research (review-coherence governs PR
  scope, not destination count or a fixed ratio), the grooming bulk is one coherent operation with uniform
  reviewer competence → one auto-merge PR; lanes never mix in a single PR.
- **A new *provisional* stub auto-merges.** It is `meta-*`/`draft-*` under `backlog/` — auto-merge prefix, no
  design authority. (A *planned* stub regenerates ROADMAP, historically reviewed — see the threshold.) So
  drain-created stubs auto-merge; the "new stub = never auto-merge" worry is unfounded and contradicts the rule.
- **The review threshold is principled, not path-blanket.** A planning-artifact change needs review iff it:
  (1) touches a **foreign owner's** artifact — *any* state, not only in-flight (ownership/stewardship: routing a
  concern into someone's draft reshapes their planning; the in-flight qualifier adds *concurrency* coordination
  on top, but ownership is the gate); (2) carries **design authority** (`spec-*`/`prd-*`); (3) hits a
  **constitutional** surface (rules/ADRs/strategies); or (4) is an **unverifiable hand-edit of a derived
  surface** — a *sunset* trigger that fires only while that surface is hand-maintained. Otherwise auto-merge.
  Once a renderer produces the surface with a verify-against-source check (`roadmap-tooling` for ROADMAP,
  `operational-state-docs` for the managed surfaces), the derivation is verifiable and #4 dissolves → it
  auto-merges. So a ROADMAP regen rides the reviewed lane *now* (interim hand-edit) but auto-merges
  *post-roadmap-tooling*; the same sunset applies to every managed/derived surface. (The lane classifies the
  PR that carries a change — an errand's PR, a WU's integration PR — so a ROADMAP-touching errand is reviewed
  today, auto-merge once the render is verifiable.)
- **Carve-out — housekeep's own/homeless writes auto-merge.** A homeless-flush to the shared inbox and a
  disciplined ROADMAP regen trip none of the four (no owner, no authority, not constitutional; the ceremony's
  discipline / a regen-matches-source check stands in for #4). The shared inbox's blanket reviewed-lane status
  is a pre-owner-gate proxy; housekeep's discipline + optional *notification* (not gating) + git audit replace
  it. `operational-state-docs` strengthens this — render-from-record makes these surfaces verifiable by
  construction.

**Coordination.** The general owner-graded merge doctrine (CODEOWNERS-from-`**Owner:**`) stays CWC's — but note
*for* it that both the shipped advisory gate *and* CWC's planned owner-gate key on *in-flight*, whereas the
stewardship concern (point 1) argues for gating *dormant* foreign edits too: a refinement up to CWC, with
review-vs-notification and granularity (substantive routing vs trivial fix) as sub-questions. Derived-surface
verification coordinates with `roadmap-tooling` / `operational-state-docs`. This WU adopts the interim; those
WUs generalize.

## Open Questions

- **Errand↔PR packaging — resolved (research-informed).** Batch by **review-coherence**, not destination count
  or a fixed ratio (mature practice gates PR scope by what one reviewer of uniform competence can certify as
  coherent). A planning-doc routing sweep is a coherent operation → **one auto-merge PR per drain** (chunked
  only for review-reachability if very large); **code-errands stay 1:1**; **lanes never mix**. See § Merge-lane
  interaction. The general two-lane convention routes to CWC for durable codification.
- **Strict-empty INBOX.USER — resolved.** Strict-empty is the target state housekeep nudges toward (homeless
  atomics flush to the shared inbox, homeless multi-step graduates to a provisional stub; trivial emptiness gate).
- **Inbox structure — resolved (this round).** `INBOX.USER` keeps **two sections** (`Atomic` / `Work Unit`) —
  un-flattened; it is a branch-safety transit lounge that must hold both characters. The **shared** inbox is
  **homeless-only**, terminal atomic-only (multi-step always has a stub home). Mental-model coherence rides a
  **uniform entry grammar** (shared `WU_Target` shape), not identical sections. Headings stay the stable character
  token; routing destinations live in the preamble. See § Surface roles.
- **Holding-vs-execution boundary — resolved.** The inbox never executes; execution of out-of-WU atomic work
  always goes through `arc-errand` (dev-rule), and `arc-errand` *moves* its inbox source out on creation (no
  orphan, no dedup hook). Note-routing is **not** execution — housekeep writes stubs directly between-WUs. See
  § Holding vs. execution.
- **Planning artifacts as capture surfaces — resolved (codify).** Generalize § Leave it cleaner's
  completion-notes/session-notes anti-pattern to *all* WU planning artifacts (draft/spec/notes/meta/`Coordination
  §`): cross-ref yes, capture-of-record no (it orphans and pollutes the PR/archive). The dual of the core
  invariant; behavioral, not mechanical. Surfaced by near-repeating errand-enablement's Coordination-as-capture
  failure this session.
- **`WU_Target` in the shared inbox — resolved (moot).** The shared inbox is atomic-only, so it has no
  `WU_Target`-bearing entries at all. (And in principle a known-target item has a home — its stub — and must not
  rest in a capture surface; route it there via errand.) Invariant-driven; do not re-raise.
- **Maturity field — resolved.** Folded into `WU_Target` as an optional `(planned|provisional)` parenthetical,
  meaningful only for a *new* stub (existing stubs already have a dir); existence-at-drain decides route-vs-create.
- **Bucket-collapse AWL-gating — resolved (moot).** No collapse to gate: the terminal shape (atomic-only shared
  inbox) lands now, not via a trajectory. `BACKLOG-INBOX` retires this WU; AWL's cheap-stub tooling is a later
  scaffolding-friction improvement, structurally irrelevant. See § Surface roles.
- **Merge-lane sub-questions — resolved (interim; general doctrine → CWC).** (a) Housekeep's shared-inbox writes
  **auto-merge** — a homeless-atomic flush has no owner and no design authority (strengthened by atomic-only); the
  carve-out reasoning holds. (b) Foreign-owner routing rides the **reviewed lane** as the conservative interim
  (rare in solo); review-vs-notification and trivial-vs-substantive granularity are CWC's general owner-gate
  doctrine, not this WU's to decide. See § Merge-lane interaction.
- **Name — resolved.** `work-routing-discipline` (broad concern, both faces); standalone (no cohort).

---
