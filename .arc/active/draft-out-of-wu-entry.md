# Draft: Out-of-WU Session Entry

**Purpose:** Realign `session-init`'s entry dispatch so **explicit out-of-WU (and cross-WU) intent routes
regardless of active-WU state** — generalizing the discarded-`--errand`-on-Resume bug into a single
**explicit-intent override**: one **arm-orthogonal dispatch leaf** that outranks the implicit resume/orient
dispatch, *preserves the active checkout*, and routes to the chosen locus. The slot is populated by `--errand`,
`--housekeep`, and `--plan <stub>`, and left **slot-ready** for future signals (§ Deferred signals). The
execution and locus layers already work or need only thin changes — `run-errand` / the `arc-errand` warm skill /
`drain-inbox` for errand and housekeep, and (for `--plan`) in-place planning against a backlog-located draft. The
gap is the cold door through `arc-session` under-honoring explicit intent.

- **State:** Draft (pre-spec) — **design-settled**. Captured 2026-06-05 from a live investigation triggered by
  `arc-session --errand` failing to route while a planning WU was active. Iterated 2026-06-24 across two passes:
  (1) drift-audit against live source + scope consolidation + signal family settled; (2) design-settling — all
  forks closed and grounded against live source (CLI handlers, lifecycle workflows, the write-context primitive).
  Formalization-ready.

- **Created:** 2026-06-05.

- **Origin:** [internal] — surfaced during `class-model-foundation` planning. The developer invoked
  `arc-session --errand` from the primary worktree (active planning WU checked out, clean tree); the
  session resolved to the **Resume** arm and discarded the `--errand` signal per
  `session-init.md` "Errand signal not consumed (non-Orient arms)". The warm `arc-errand` skill was then
  used to run *this* capture as an errand — itself confirming the gap is localized to the cold door.

- **Cohort:** agile-parallelism — a gap-correction descending from the **Errand Enablement →
  work-routing-discipline** lineage (the cold-errand-entry known gap was recorded in
  `cohort-agile-parallelism.md` but under-scoped; see § Root cause). Adjacent to the now-shipped
  `concurrent-work-conventions` members; **independently shippable, not gated on them or AWL** (see § Relationship).

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

*None pending.* The three carried concerns were integrated at the first 2026-06-24 pass (in-place planning
iteration → the `--plan` pillar; the `--new` / `--discover` sibling → § Deferred signals; record-owned errand
identity → § Scope item 1 and § Dependencies). Two cross-WU concerns surfaced at the design-settling pass were
routed **out** to `USER-INBOX § Work Unit` (not held here): the composable-workflows gate-suppression seam, and
the grooming-branch bare-landing recovery — see § Relationship.

---

## Problem / Motivation

A developer should be able to be mid-work-unit — potentially with multiple WUs in flight — realize they
need to do an **errand** (an atomic out-of-WU fix) or a **housekeep** drain, and reach it through the
universal door (`arc-session --errand`, or cold `arc-session` then route) without first having to wind
down or abandon their active work. The framework should switch to the primary worktree, cut a
`chore/<slug>` branch off the base, run the increment, and let them return. That is the *stated* doctrine.
It is not what the entry plumbing does. The same shape generalizes: an explicit intent to **groom a backlog
stub** (`--plan`) — or, deferred, to **start new work** (`--new`) — is equally out-of-WU and equally discarded
on the Resume arm today.

### What the doctrine says (mid-WU out-of-WU entry is the normal case)

- `strategy-work-organization.md` § Entry path: an Errand "launches from **any worktree**: the workflow's
  Launch phase resolves the base branch and relocates the execution locus itself … so the caller need not
  pre-switch worktrees."
- `DEV-RULES.ARC.md` § Discovered Work Routing: *Out-of-WU, urgent → "Errand now — own session
  (`arc-session --errand`)."* That **is** the mid-WU path, stated as the primary route.
- `strategy-work-organization.md` § Main-on-Main: the primary worktree is "the launchpad for … Errand
  launches."
- `work-routing-discipline` (spec): housekeep's precondition is "a *base-branch write context*,
  **not** 'no active WU' — so housekeep is invokable mid-WU on demand (hop to primary, sweep as a batched
  errand, return)."
- `run-errand.md` Launch: launching from any worktree (a work unit's included) is fine; only *executing*
  there would tangle that branch — then it relocates per protection mode (`arc errand open <slug>` →
  ephemeral worktree off base under full protection; a direct base checkout under partial).
- The `arc-errand` skill (the **warm** door) already runs an errand from an active session correctly.

### What the plumbing does (honors it only with no active WU)

- `session-init.md` entry dispatch gates the `--errand` signal to the **Orient** arm
  (`active.resolution === "none"`, primary worktree). On the **Resume** arm (any active WU), the
  "Errand signal not consumed (non-Orient arms)" rule discards `--errand` and tells the user to "run it
  as its own errand **from the primary worktree** via a fresh `arc-session --errand`." That advice is
  **circular**: if you are already in the primary worktree on a WU branch (the common case), re-invoking
  `arc-session --errand` lands on the same Resume arm and is discarded again. (This is exactly the
  self-demonstrating failure that triggered this capture.)
- There is **no `--housekeep` priming door** at all. Housekeep surfaces only as a soft-offer on the
  Orient arm (`inboxState.housekeepNeeded`, primary worktree, no active WU); on a Resume arm it is
  suppressed entirely.
- There is **no `--plan` door** at all. Iterating a backlog stub's draft today forces graduation
  (`arc start` → `active/`, a `plan/` branch) then park-back, recording a **false** `parked` state for what
  is grooming-lane work — see the `--plan` pillar in § Scope.
- Net effect: you can only *cold-enter* explicit out-of-WU intent when you have **nothing in flight** —
  atypical — even though the execution machinery is ready and the doctrine blesses the mid-WU case.

### Why it's exposed now

Per-WU worktree-by-default is not yet in practice (it awaits the broader concurrent-work rollout). So
**every mid-WU session today is "Resume arm, primary worktree, on a WU branch"** — precisely the shape
the entry dispatch refuses to route. The gap is maximally exposed by the current pre-parallelism state.

---

## Root cause

`cohort-agile-parallelism.md` § "Known gap — cold errand entry (no originating session)" recorded the
cold-errand-entry problem, but **scoped it to the no-originating-session case only** — "an Errand that
arises with **no originating session to fork from** — you boot up wanting to do one." Its provisional
resolution grew the universal `arc-session` door a **no-WU / orient-and-await leaf** (the orphan path,
made Errand-aware), disambiguated by an explicit signal. That leaf was built faithfully — but it lives on
the **Orient (no-active-WU) arm**, so it structurally cannot serve the **dual** case the same doctrine
endorses: an explicit out-of-WU intent raised *while a WU is active*.

So the chain is: the **design record under-scoped** the problem → the **implementation matched the
record** → the **doctrine (which is broader) and the execution layer (which is ready) were left
contradicted** by the entry dispatch. This is not a `run-errand` bug and not a CLI bug; it is a
`session-init` orchestration gap inherited from an under-specified cohort known-gap entry.

It is **not** the concurrent-work-conventions members' concern: they shipped the parallelism conventions and the
merge-safety / async-merge / single-owner mechanism — the runtime is in place. This is a `session-init`
orchestration gap, independent of that work; mid-WU errand entry is supposed to work *today*.

---

## Design

### One arm-orthogonal dispatch leaf

The core move is **one generic mechanism, not a pile of flags** — and it is **orthogonal to the session
arm**. When an explicit-intent signal is present, `session-init` routes to the **signal leaf** *before* (and
instead of) resolving resume-vs-orient-vs-cold-start; signal absent → normal arm dispatch. So the signal is
honored identically whether a WU is active (Resume) or not (Orient): **context-independence is structural**,
not two parallel per-arm implementations. The leaf:

1. **outranks** the implicit resume/orient dispatch (the signal wins over "what the arm would otherwise do"),
2. **preserves** the active WU's checkout (relocate to a fresh locus; never clobber the resumed branch), and
3. **routes** to the signal's locus.

Building the slot + precedence rule once — and *populating* it with the signals that carry real correctness or
locus value — makes any future signal a one-line addition rather than a re-architecture. That discipline lets us
populate conservatively now and defer the marginal signals (§ Deferred signals) without regret.

**Populated this WU:** `--errand`, `--housekeep`, `--plan <stub>`.
**Slot-ready, deferred:** `--new` / `--discover`, and others as demand surfaces.

### Shared spine + per-signal locus

All populated signals reduce to one spine, differing only in the locus:

```text
[parse signal]
  → [displacement guard: active checkout present? → confirm-once]
  → [relocate via resolveWriteContext: full → short-lived branch off base; partial → direct base commit]
  → [load universal context only]
  → [run locus workflow]
```

The relocate step is the **existing `resolveWriteContext` primitive** (`lib/git/write-context.ts`) that
`run-errand` Launch and `drain-inbox` already share. It is protection-mode-shaped *and*
**worktree-shape-agnostic** — it resolves `branch.base` from config, so the primary worktree need not be on
`main`. So "respect `branch.protection`" and "forward-compat to worktree-by-default" are **inherited from one
primitive**, not re-implemented per signal. Relocation is therefore uniform across all three signals, not a
per-signal property.

Per-signal differences are only **which workflow runs, what it edits, and the sufficiency rule**:

| Signal | Locus workflow | Edits | Sufficiency / elicitation |
| --- | --- | --- | --- |
| `--errand` | `run-errand` Launch | the errand's target paths | needs a concern — bare → elicit, or adopt a flagged `§ Errand` capture |
| `--housekeep` | `drain-inbox` | inbox → authoritative homes | self-determining (the inbox is the input); scope-extensible (§ Scope item 4) |
| `--plan <stub>` | `draft-design` content loop | the backlog stub's `draft-*` | needs a stub — bare → elicit / disambiguate |

**Grounded thin (live source, 2026-06-24):** `run-errand` Launch step 3 already relocates per protection mode
(`arc errand open <slug>`, folding cut→occupy off base); `drain-inbox` already lists "Mid-WU on demand" with the
`arc housekeep check` write-context guard (refuse-and-relocate off a WU branch); the `arc-session` skill already
brackets `--errand [<slug|description>]` as optional. So the errand and housekeep routes need only `session-init`
to *reach* their existing entrypoints — not new execution machinery.

### Two-gate confirmation model

Two distinct gates, not one (the draft previously conflated them):

- **Sufficiency / elicitation** (signal-specific): does the signal carry enough to act? `--housekeep` → always
  (the inbox is the input). `--errand` / `--plan` **bare** → elicit (or adopt a flagged capture) before
  relocating. This is why a bare `--errand` does *not* silently launch — it asks first.
- **Displacement / precedence** (uniform): is an active WU / dirty checkout present? → **confirm-once-then-
  relocate** (the explicit flag signals intent, but relocating away from a resumed WU is worth one visible
  beat). Nothing checked out → proceed silently. Applies identically to `--errand` / `--housekeep` / `--plan`.

The full Step-6 orientation is **replaced by a locus-scoped acknowledgment** (errand cold-entry already does
this — "orient on the Errand, not the WU"), gated by sufficiency: `--housekeep` on a clean tree → "draining N
entries" + go; bare `--errand` → asks first, then goes.

### Design posture — direct intent, not nudges

The slot arms an *explicitly declared* goal and loads only what that goal needs; it does not surface unrequested
routes. A session opened to drain, run an errand, or plan a stub should not first load — or be nagged about — the
active WU's execution context. (This is why a Resume-arm housekeep *route* was rejected in favor of the
`--housekeep` flag; see § Scope item 4. Reconciling the broader unprompted nudge-offers — the Orient-arm
housekeep soft-offer, the handoff offer — is out of scope here; captured for separate evaluation.)

---

## Scope

### In scope

1. **(Core) `session-init` entry dispatch honors explicit out-of-WU intent regardless of active-WU state.**
   On a **Resume** arm, an explicit `--errand` / `--housekeep` / `--plan` signal must route through the
   override (§ Design) rather than being discarded. Concretely:
    - Retire the "Errand signal not consumed (non-Orient arms)" rule (`session-init.md`). Replace the circular
      advice with an actual Resume-arm route through the one arm-orthogonal leaf.
    - Define **precedence**: an explicit signal outranks the implicit resume but **preserves** the active WU's
      checkout (relocate via a fresh locus; never clobber the resumed branch). Confirm-once-then-relocate.
    - Reconcile the **linked-worktree** case: `--errand` from a linked WU worktree currently "falls through to
      discovery" (`session-init.md`). It should relocate to the primary's base and run the errand (which
      `run-errand` already supports).
    - **Constraint (errand identity is record-owned):** errand-lattice retired `errandSlugOf` and the
      `chore/`-prefix parse — the `chore/` prefix no longer signals errand-ness. Any errand identity this route
      needs comes from the record via `readErrandSlugByBranch` (`lib/errand/record.ts`), never a branch parse.
      (Confirmed in code at the 2026-06-24 audit; the planning-entry gate needs no errand identity at all.)

2. **Bare `--errand` validity + short-circuit semantics.** A bare `--errand` (no slug/description) is *intended*
   to be valid: it primes errand cold-entry, which loads **universal context only** and **skips** SESSION-NOTES,
   the active task list, and `process-task-loop`. Today the dispatch condition is written `--errand <blurb|slug>`
   *present* (`session-init.md`), implying an argument is required, while cold-entry's "seed … when present"
   anticipates its absence — an internal inconsistency (the `arc-session` skill already brackets the arg optional,
   compounding it). Fix the wording in the `arc-session` skill and `session-init` so absent-seed is explicitly
   supported (→ elicit the concern interactively per the sufficiency gate, or adopt a flagged `USER-INBOX §
   Errand` capture).

3. **(New) `--plan <stub>` — in-place planning iteration on a backlog stub.** Enter a planning session against a
   `backlog/planned/` stub's draft **in place** — no graduation, the stub stays `planned`, no false `parked`.
   Grounded against live source (2026-06-24):
    - **State stays `planned` (free).** Editing a `planned` stub's draft is a *content mutation, not a lifecycle
      transition* — the state resolver reads (directory location + meta `State`), neither of which changes; the
      stub stays `planned` by construction. And `planned` is already excluded from the capacity-occupancy set
      (`OCCUPYING = [planning, active, integrating]`), so in-place grooming keeps it out of parallel-capacity math
      for free — the exact benefit the false-`parked` round-trip destroys. **No state-machine change.**
    - **Committable context comes from the spine, not `arc plan check`.** Grounding correction: backlog-stub
      grooming is a **base-path grooming write** (the `drain-inbox` / write-context model), *not* active-WU draft
      authoring. `classifyPlanningEntry` (`lib/git/write-context.ts`) makes full-mode committability
      `= onPlanningBranch` (State `Planning` **AND** meta `Branch` == current branch); a backlog stub's `Branch`
      is `[none]`, so editing it from base / a WU branch would `redirect` (`protected-base` / `work-unit-branch`).
      So `--plan` rides the spine's relocate-to-grooming-branch (auto-merge planning lane), where the edit commits
      cleanly. The committable-context "gap" dissolves under the spine — it was an artifact of routing through the
      wrong gate.
    - **`draft-design` needs two small edits** (the workflow surface the earlier layer map undercounted) — in the
      extractable-block style, *not* composable-workflows' final shape:
        - **Entry**: `--plan` enters draft-design's *content loop* **past** its `## Planning-entry gate`
          (`arc plan check`), which would otherwise `redirect` on a grooming branch — the spine already
          established committability. The gate is a discrete block; this is the interim hand-rolled **"approach
          A"** of composable-workflows' conditional-fragment skip (**"approach C"**, routed out — § Relationship).
        - **Exit**: an explicit **groom-and-stop** outcome alongside forward-advance and the re-entry back-edge —
          capture to the grooming branch, **don't advance** (draft-design's advance is already conditional: "when
          the draft crosses into create-spec — not the re-entry back-edge"; groom-and-stop is a third, *named*
          case so a session doesn't read "didn't advance" as an incomplete forward path), stub stays `planned`,
          resume via `--plan X`.
    - **Continuity across sessions (the "3c" model).** `--plan` grooming legitimately goes long (designs iterate;
      this is not a smell, unlike a multi-session errand). It rides `run-errand`'s **re-enterable** pattern (pause
      = commit + push; resume from the pushed branch — **no SESSION-NOTES**), with the **draft as the continuity
      artifact** (tracked; draft-design already maintains its readiness / Open / Next sections for cross-session
      continuity). The grooming branch stays **open across sessions** (surfaced in the in-flight view; out of
      occupancy math — a `chore/` branch has no meta); intentional resume is re-invoking `--plan X`; it merges
      once grooming concludes; abandonment is swept by the existing in-flight-chore sweep. **No marker, no
      SESSION-NOTES analog, no new durable state** — the draft *is* the state. (The bare-landing recovery edge is
      routed out — § Relationship.)
    - **`--plan`-specific surface** shrinks to: path-parameterize `resolveDraftPresent()` (`handlers/plan.ts`,
      which hardcodes `.arc/active/draft-{slug}.md`) to also find a `backlog/planned/` draft; plus the two
      `draft-design` edits above. Light, riding the spine.
    - **Boundary with `planning-iteration-mechanics`:** this WU owns the *entry/locus* (the signal + where
      planning runs); PIM owns the *content* mechanics (inbound-buffer drain ceremony, sizing correction).
      Because `--plan` routes *through* draft-design's content loop, PIM's buffer ceremony rides along as a seam
      condition; `--plan` is **grooming, not structural validation** (full validation defers to promotion /
      create-spec). Cleanly separable.

4. **`--housekeep` priming flag — a populated, scope-extensible signal.** Add `--housekeep` as a full member of
   the slot, symmetric with `--errand`: it short-circuits the WU-execution doc loads, relocates to the base write
   context, and runs `drain-inbox` — arming a drain directly, whether cold or mid-WU. Resolved against the
   alternative (a Resume-arm soft-offer *route* + reliance on the warm `arc-housekeep` skill): that alternative
   only surfaces a nudge — it still loads the full WU context and serves visibility, not direct intent — so it
   solves a different, unwanted problem (§ Design posture). The warm `arc-housekeep` skill remains the execution
   path the flag reaches; the flag adds the direct, minimal-load *entry*. **Scope-extensible:** design the flag so
   a future `user|shared` scope is a *parameter* (default user inbox), so `shared-inbox-housekeep`'s possible
   dual-mode `drain-inbox` lands without a re-architecture; do not hardwire `USER-INBOX`-only.

5. **(Ergonomic) Pre-focus a positional backlog-WU arg on the Orient arm.** A positional arg naming a backlog WU
   is currently "surfaced, not acted on" outside cold-start — the same not-consumed theme. Let the Orient/discovery
   arm **pre-focus** the named WU (and offer to init it), **confirm-only** — never auto-init. (This *is* the
   existing entry-seed mechanism extended to the discovery arm; low stakes.)

### Out of scope

- **Atomic-slug identity for captures.** The original "slug atomics at capture time" scope is dropped — OBE.
  Downstream mechanisms key on the entry **title**, not a slug (`arc errand open --from-inbox <entry-title>`;
  `arc errand close` drops the originating entry via the record's `originEntry` back-pointer). The future
  identity-on-`_Slug:_` migration is **OSD's** (`operational-state-docs`). Title-keying + the back-pointer already
  solve adoption and removal; nothing here needs a slug.
- **`draft-design`'s full composable-fragment refactor.** The entry-gate-skip here is the interim hand-roll
  ("approach A"); the proper conditional-fragment composition ("approach C") is **composable-workflows'** (routed
  out — § Relationship). This WU carves the extractable block; it does not build the composition substrate.
- **Grooming-branch bare-landing recovery.** Routed out — § Relationship. This WU ships intentional `--plan`
  resume (via re-invocation); the bare-landing record-typing is a separate recovery-precision concern.
- **`--new` / `--discover` and `arc-shift`.** Deferred / dispositioned — see § Deferred signals.
- **`run-errand` / `arc-errand` execution mechanics** — already correct (relocation + "any worktree" handling).
  This WU changes *entry routing*, not execution.
- **`arc-housekeep` / `drain-inbox` execution mechanics** — the write-context guard and mid-WU invokability
  already exist; only the priming/entry door is in question (scope item 4).
- **In-place planning *content* mechanics** — the drain ceremony, depth-aware sizing correction →
  `planning-iteration-mechanics`. This WU owns only entry/locus (scope item 3).
- **`arc inbox add` deterministic write CLI** — OSD's. (Relevant to the routed-out capture-and-leave concern,
  not to this WU.)
- **Per-WU worktree-by-default rollout** — the broader cohort move; this WU works under both the current
  (in-primary) and future (per-WU-worktree) practice, because the relocate primitive abstracts the worktree shape.
- **Parallelism conventions, merge-safety, async-merge, single-owner-WU model** — owned by the (shipped)
  `concurrent-work-conventions` members, not this WU.

---

## Deferred signals

The dispatch slot (§ Design) is built to be extended; these are deliberately **not populated** now.

### `--new` / `--discover` — deferred (slot-ready)

Start new work from a Resume arm by routing to discovery / new-WU-start. **Deferred** because, unlike the
populated three, it carries **no bug-fix or correctness value**: starting a new WU already works (`arc start B`
cuts B's own branch / spawns its worktree — isolation already enforced; or just direct the agent). There is no
discarded-signal bug (the signal doesn't exist today). Worse, pre-parallelism the underlying "start B while A is
active" is gated by the single-checkout occupancy model itself — `--new` would route to the same constrained
`arc start` and remove no real blocker; post-parallelism the natural flow is "spawn B's worktree, open a session
*there*," reducing `--new` to a minor shortcut. The generic slot makes it a one-line add if demand materializes.

### `arc-shift` — dispositioned to `finalize-parallelism`

The deferred in-session **shift** verb (`cohort-agile-parallelism.md` § Deferred — `/arc-shift`; originally WF
R13/R14/R15). **Related theme, orthogonal mechanism** — it does not belong in this WU's slot:

| | `--new` (and the populated signals) | `arc-shift` |
| --- | --- | --- |
| When | At session entry (dispatch override) | Mid-session detour |
| Context | Establishes *fresh* scoped context | *Carries + merges* the live session context |
| Target | New/relocated work locus | Another **worktree's runtime environment** |
| Return | No | Yes — short detour, return-intent |
| Mechanism | A case in the `arc-session` dispatch slot | A separate verb (`shift-work-unit.md`), not an entry signal |

`arc-shift`'s reason for existing is the **context-merge across a runtime hop**; none of the entry signals do
that. Its premise — operate in *another worktree's* runnable environment — also requires real worktrees-in-use,
which is gated on `finalize-parallelism` (worktree-by-default; `node_modules`-in-worktree still uncleared). Demand
is unverified. **Disposition:** route the revival decision to `finalize-parallelism` (where the substrate it
operates on becomes real and the as-built concurrent-work conventions exist to update against), not here. A note
is folded into `cohort-agile-parallelism.md` § Deferred resolving the dangling "ratify when an owner takes it."

---

## Layer map — where the fixes land

| Layer | Change | Weight |
| --- | --- | --- |
| **Doctrine** | The doctrine is already correct. Realign `cohort-agile-parallelism.md` § Known gap to name the active-WU dual it under-scoped (now owned here); add the `arc-shift` disposition note. **Landed in planning** (this iteration), per the planning-scope call. | Light |
| **CLI / probe** | errand/housekeep core needs none (signals are skill/workflow tokens; the probe is agnostic; errand identity is record-owned via `readErrandSlugByBranch`). `--plan` needs `resolveDraftPresent()` path-parameterized (`handlers/plan.ts`). No state-machine change (grooming is not a transition). | Light |
| **Workflows** | `session-init` entry dispatch — the core arm-orthogonal leaf + shared spine + two-gate confirmation; retire/rewrite "signal not consumed". **`draft-design`** — entry-gate-skip + an explicit groom-and-stop exit for the `--plan` locus (interim "approach A"). `run-errand` / `drain-inbox` already correct. | Medium |
| **Skills** | `arc-session` (bare `--errand` wording; `--housekeep`; `--plan`). `arc-inbox` terminology only (no slug work). `arc-errand` already correct — the warm-path precedent. | Light–medium |

---

## Relationship to concurrent-work-conventions and the cohort

- **Member of agile-parallelism**, descending from the Errand Enablement → `work-routing-discipline` lineage
  (the errand-model re-pivot to execution-only). It *completes* the cohort's recorded cold-errand-entry known gap
  by covering the active-WU dual.
- **Independently shippable; not gated on the concurrent-work-conventions members (shipped) or AWL.** It manifests
  with a *single* WU today and needs none of the parallelism mechanism.
- **Completes a latent contradiction in shipped doctrine.** The `concurrent-work-conventions` members shipped
  conventions that *assume* mid-WU errand/housekeep entry already works (the in-session-fork matrix; the all-owner
  advisory gate at `errand-launch`). Because this entry gap persists, that shipped doctrine currently describes a
  path the plumbing doesn't fully take — exactly what this WU resolves. (The originating
  `draft-concurrent-work-conventions.md` was retired at the sub-cohort decomposition; no live note to carry.)

### Forward-compat seams (2026-06-24 sweep)

- **composable-workflows** *(routed out → `USER-INBOX`)* — the `--plan` gate-suppression and the signal-dispatch
  leaf are early consumers of its conditional-fragment composition. Build "approach A" interim; flag the seam so
  composable-workflows subsumes it (the gate-skip becomes a fragment skip) rather than rips out a bespoke branch.
- **shared-inbox-housekeep** — `--housekeep` is designed scope-extensible (default user inbox) so its possible
  dual-mode `drain-inbox` (`user|shared`) lands as a parameter (scope item 4).
- **operational-state-docs** — consume the record/identity interface (errand adoption by title → slug later,
  `arc inbox add`) as forward-extensible; OSD owns the substrate (no build here).
- **planning-iteration-mechanics** — `--plan` honors PIM's inbound-buffer ceremony as a seam condition (rides
  draft-design's content loop); grooming-not-validation boundary (scope item 3).
- **finalize-parallelism** — out-of-wu-entry is its shipped dependency. Relocate via the write-context primitive
  already handles "primary worktree not on `main`," so no design change is needed for worktree-by-default.
- **cross-wu-coordination** — no material constraint now (a possible future `arc status <slug>` cohort-surfacing
  in `--plan`, additive).

### Routed-out concerns (captured to `USER-INBOX § Work Unit`, 2026-06-24)

- **composable-workflows gate-suppression seam** — the `--plan` entry-gate-skip + the signal-dispatch leaf as
  early consumers of its fragment composition (target: composable-workflows' Inbound Buffer).
- **Grooming-branch bare-landing recovery** — a paused `--plan` grooming branch *bare-landed on* (via plain
  `arc-session`, not `--plan X`) trips `session-init`'s errand-resume detection and misroutes as an *errand* (a
  meta-less `chore/` branch is indistinguishable today). Fix = type the grooming branch's record (extends
  errand-lattice's shipped model) so resume detection + the in-flight surface label it grooming. **Recovery-
  precision only; this WU does not depend on it.** Target: OSD / skill-infrastructure-cleanup / a small new stub.
- **Frictionless cold-session capture** — the "capture-and-leave with no ARC session" idea (verified demand) is a
  *different mechanism* (a cold `arc-inbox` skill path that removes the need for a session door) — opposite ends
  of the "out-of-WU work shouldn't require winding down" spectrum, no shared mechanism. Captured to
  `USER-INBOX § Work Unit` (→ a `frictionless-capture` planned/P2 stub at the next housekeep).

### Severity & Class

The errand/housekeep core is bugfix-grade (shipped doctrine + execution exist; only entry routing under-honors
them); `--plan` is small-but-real, riding the spine + `run-errand`'s re-enterable pattern; the route-outs offload
the heavier precision (record-typing, fragment composition). **`Class`: reassess at capture — leans Light.** The
derivation is fully settled (composes existing patterns; no invention) and the surfaces are multi-but-thin (a
workflow-doc edit + skill-doc edits + a tiny CLI path-param + a doctrine edit), with no large or intricate
existing-code surface a correct plan must navigate. `Class: Heavy` is currently recorded; confirm the
Heavy → Light call at the draft-capture ceremony.

---

## Settled decisions

The three former Open Questions are resolved (grounded against live source):

- **Precedence UX when a signal collides with a resolvable active WU** → **confirm-once-then-relocate**, uniform
  across `--errand` / `--housekeep` / `--plan`. The explicit flag signals intent, but relocating away from a
  resumed WU is worth a single visible beat.
- **`--plan` "don't advance" carrier** → **neither a marker nor a transient flag.** The named **groom-and-stop**
  exit simply doesn't advance (draft-design's advance is already conditional). Cross-session continuity is the
  "3c" model — `run-errand`'s re-enterable pattern + the draft as the continuity artifact + `--plan X`
  re-invocation; the grooming branch stays open and out of occupancy math. No new durable state.
- **One dispatch path for all signals** → **yes.** One arm-orthogonal leaf (shared spine + per-signal locus),
  reached from either arm — not per-arm duplication.

---

## Dependencies

- **Upstream (shipped):** Errand Enablement (`run-errand`, the `arc-errand` warm skill, the Errand decision
  matrix); work-routing-discipline (errand-model re-pivot; housekeep write-context guard); In-Flight Awareness
  (the oracle behind `arc errand check`); errand-lattice (record-owned errand identity — `readErrandSlugByBranch`,
  the retired `chore/`-prefix parse — **shipped**; also the extension point for the routed-out grooming-branch
  record-typing); the lifecycle state machine (state resolved from location + meta, so in-place grooming needs no
  new state); `planning-pipeline-readiness`. All shipped — this WU composes them.
- **Coordination (not blockers):** `planning-iteration-mechanics` (planning *content* mechanics);
  `operational-state-docs` (`arc inbox add` + the `_Slug:_` identity migration); `composable-workflows` (the
  fragment composition that subsumes the `--plan` gate-skip); `skill-infrastructure-cleanup` (warm/cold session
  marker — for the routed-out capture-and-leave follow-on and a candidate home for grooming-branch recovery).
- **Sibling (shipped):** the `concurrent-work-conventions` sub-cohort — `concurrent-work-doctrine`,
  `merge-safety-mechanism`, `async-merge-lifecycle`, `single-owner-wu-model`. out-of-wu-entry follows it, making
  the mid-WU entry path its conventions assume actually work; its merge-safety / single-owner substrate firms up
  the surfaces this WU rides. See § Relationship.
- **No blocking queue.** Ready to spec once prioritized.
