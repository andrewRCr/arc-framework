# Cohort: `agile-parallelism`

> Cohort-level design record for the agile-parallelism cohort — Worktree Foundation (shipped),
> Errand Enablement (shipped), In-Flight Awareness (shipped), and Concurrent Work Conventions — now decomposed
> into the `concurrent-work-conventions` sub-cohort (four single-owner members; coordination in
> `cohort-concurrent-work-conventions.md`). Agile WU Lifecycle
> (`draft-agile-wu-lifecycle.md`) **departed to the principle-anchored-core cohort 2026-06-02** — its
> center of gravity is spec/task scaling, not parallelism; see § Cohort status & closeout.
> Internal-dev-facing; not shipped. The detailed designs live
> in each member's draft; this record holds what the cohort owns *as a whole* — the shared thesis, the
> boundary map, cross-member contracts, the cross-cutting design spine, and candidates not yet owned by
> any member.

**Parent:** [none]

**Purpose:** Make concurrent, isolated, cheap-to-shift work real — the parallelism layer built on the
single-branch-per-WU substrate ([ADR-019][adr-019]). Its members share one concern: the mechanics and
conventions that let multiple work units and errands run in flight at once without contending — worktree
isolation, the Errand work class, in-flight awareness, and the conventions governing when and how to
parallelize.

---

## Why this doc exists (the cohort-doc convention)

A cohort is sometimes just a browsing bucket — WUs grouped by domain for backlog legibility, members
otherwise independent. Sometimes it is *parts of a whole*: members serve one goal and must coordinate
and cross-reference. Agile-parallelism is the latter. For that kind, an optional `cohort-{name}.md` at
the cohort root carries the shared content no single member owns. **Its presence is the signal** that a
cohort coordinates — no separate type flag is needed. It lives at cohort root, stays stable across
member activation / integration churn, and archives when the last member ships. (Convention to be
codified in Concurrent Work Conventions and file-classification at their PRDs; captured here as the
first instance.)

## Cohort thesis

Make concurrent, isolated, cheap-to-shift work real. [ADR-019][adr-019] (Work Unit Lifecycle Reform)
laid the single-branch-per-WU substrate; this cohort builds the parallelism on top of it.

## Cohort status & closeout (2026-06-02)

Four of the five original members have shipped (Worktree Foundation, Errand Enablement, In-Flight
Awareness — and `work-routing-discipline`, the errand-model re-pivot, outside this cohort). Agile WU
Lifecycle departed to principle-anchored-core. **Concurrent Work Conventions is the last member named
here — but it is not the only thing gating closeout.** CWC's Inbound Buffer carries a **merge-safety
cluster** (behind-base drift detection + reconcile-triage, merge-gate-aware lifecycle workflows, a
base-branch-write-context-classifier primitive, a merge-commit hook/footer exemption) whose CLI
buildables are *homeless* and carry mechanism — not conventions — character. That cluster is the real
closeout-critical work: parallel WUs + errands run mechanically today, but nothing detects or disciplines
"main moved under me." **Open (decide at CWC planning): split the buildables into a dedicated mechanism
cohort member, or fold them into a re-scoped CWC** — depends on how heavy CWC's conventions work proves.
The cohort archives only when this cluster has landed somewhere, not merely when the CWC doc ships.

**Update (2026-06-03): fold resolved; CWC decomposes and parks pending AWL.** The split-vs-fold question
resolved to **fold** — one closeout concern, conventions **and** the merge-safety / lifecycle mechanism. But
the folded scope is too large for one WU/PR, so CWC decomposes into a **four-WU stack** of single-owner
siblings (doctrine / merge-safety / async-lifecycle / single-owner-rewrite — see
`draft-concurrent-work-conventions.md` § Delivery plan & parked status); cross-WU coordination lives here in
this cohort doc, not in a shared spec. CWC is brought to terminal planning and **parked**: cleanly delivering
that stack needs a small-WU pipeline (scalable `create-spec` / `generate-tasks` + an actionable decomposition
procedure), which is **Agile WU Lifecycle's** chartered deliverable. So AWL — though departed to
principle-anchored-core — re-enters the closeout **sequence** ahead of CWC's build: a *delivery-ergonomics*
edge, distinct from the dropped *runtime* edge (CWC's mechanism needs none of AWL's tier model). The cohort
archives when the four-WU stack ships.

**Update (2026-06-10): decomposition executed.** With both build-order deps shipped (`scalable-authoring-pipeline`,
`decomposition-machinery`), CWC decomposed via `decompose-work-unit` into the `concurrent-work-conventions`
sub-cohort — four single-owner members (`concurrent-work-doctrine`, `merge-safety-mechanism`,
`async-merge-lifecycle`, `single-owner-wu-model`) under
`backlog/planned/agile-parallelism/concurrent-work-conventions/`. Cross-member coordination lives in
`cohort-concurrent-work-conventions.md` (the sub-cohort doc) — deliberately *not* flat in this parent doc, since
the four share dense internal coordination (a reused behind-base primitive, the doctrine spine, the
append-only-until-integration principle) warranting their own surface. The origin `meta-` / `draft-` files are
retired; their design is distributed across the member drafts (allocation recorded in the decomposition PR). The
cohort archives when all four members ship.

**Update (2026-06-24): the four members shipped.** `concurrent-work-doctrine`, `merge-safety-mechanism`,
`async-merge-lifecycle`, and `single-owner-wu-model` have all integrated (`completed/2026-q2/`), and the
sub-cohort doc archived with them — so the closeout-critical merge-safety cluster has landed. Agile-parallelism
now carries two remaining members toward closeout: `out-of-wu-entry` (active; the cold-errand-entry active-WU
dual — see § Known gap) and `finalize-parallelism` (the GA gate). The cohort archives when both ship.

## Shared contract — WU state machine

WU state is the strict 4-state machine — `Planning | Active | Integrating | Shipped`, defined by the meta
record's schema (per ADR-022 — `template-meta.md` is its render skeleton), with merge-position folded into
`Integrating` (no separate `Integration:` field). "Awaiting PR review" is simply `Integrating`. Partial
supersession is **not** a state value — it's an optional `**Superseded By:**` annotation on a WU that ships
normally through `Integrating → Shipped` with reduced scope (set by `integrate-work-unit § Handling
Partially Superseded Work`; framing settled under WF Phase 7.5.a).

## Shared contract — cross-WU personal-notes sync

Worktree Foundation's cross-WU sync (Item D of its PRD) is the substrate the cohort's personal-context flow
rides on. Three contracts the members depend on:

- **Per-WU isolation + cross-WU convergence.** SESSION-NOTES is per-WU (under `<wu-name>/`), restored only for
  the WU whose worktree you occupy. WORKING-MEMORY and USER-INBOX are cross-WU (flat at the identity root),
  merged across notes by per-file entry list-union with deletion tombstones — so parallel-worktree writers
  *converge* instead of clobbering. This is the personal-notes answer to Concurrent Work Conventions'
  mutated-shared-state problem ([ADR-020][adr-020]'s derived-vs-mutated split): git line-merge can't converge
  hand-edited entries, the notes-ref entry-merge can.
- **No-resolvable-WU → per-WU no-op.** An Errand session runs in the **main worktree on a non-WU branch with
  no meta file** ([ADR-021][adr-021]: an Errand branch maps to no WU). `arc user load` there must no-op the
  per-WU restore — never import the prior WU's SESSION-NOTES — while cross-WU files still load. Errand
  Enablement depends on this; it is a required contract, not a fresh-spawn nicety (the same path also covers a
  load on `main` and a fresh spawn).
- **`arc user pull` encapsulates the load.** The per-WU-note + cross-WU-merge two-read model lives behind
  `arc user pull` / `runUserLoad`, so In-Flight Awareness's **materialize** (`git worktree add` →
  `arc user pull` → orient) calls it as one black box and inherits the per-WU isolation for free.

## Path taxonomy — entry and in-session

Two cross-member decision surfaces: the **entry model** (how you get into a worktree / WU) and the
**in-session fork** (a need surfaces mid-session — which path?).

### Entry model — local worktree? × WU exists?

| | WU exists (branch + meta) | WU is new (nothing yet) |
| --- | --- | --- |
| Local worktree exists | resume (`arc-session`) | cold-start (scaffold meta in place) |
| No local worktree | materialize (In-Flight Awareness) | spawn (create worktree + scaffold) |

### In-session fork — a need surfaces while working a WU

| Need | Path | Owner |
| --- | --- | --- |
| Work that is this WU's own concern | continue / inline commit | (no verb) |
| Standalone side-task, self-contained (maintain) | errand-launch -> main worktree | Errand Enablement |
| Standalone side-task on a foreign artifact, owning WU not in flight | errand-launch | Errand Enablement |
| Standalone side-task on a foreign artifact, owning WU in flight | errand-launch + advisory gate (coordinate) | Errand Enablement |
| A new tracked unit of future work (create) | spawn a WU | Worktree Foundation |
| Pick up a WU in flight only on another machine | materialize | In-Flight Awareness |

*Full matrix.* The rows above are the in-session-fork **summary** (which path when a need surfaces mid-WU).
The complete Errand decision matrix — create/maintain × self-contained/cross-cutting, with the
owning-WU-in-flight routing — lives in `strategy-work-organization.md` § Errand Work Class, its durable home;
this cohort summary archives with the cohort, the strategy matrix outlives it and Concurrent Work Conventions
later extends it.

> *Cross-worktree investigation* — operate briefly in another in-flight worktree's runnable env while
> carrying live context, intending to return — was originally a separate row (`arc-shift`); deferred during
> cohort execution. See § Deferred — `/arc-shift`.

### Known gap — cold errand entry (no originating session)

The tables above cover every case *except* an Errand that arises with **no originating session to fork from** —
you boot up wanting to do one, so `errand-launch` (which seeds from an existing WU session and returns to it)
has nothing to fork from. No planned verb owns this: every entry verb routes to a WU (resume / cold-start /
spawn / materialize), and `errand-launch` presupposes an origin.

The notes-sync side already anticipates the Errand session (§ Shared contract — cross-WU personal-notes sync,
"No-resolvable-WU → per-WU no-op": main worktree, no meta, universal / cross-WU loads only). The
**orientation** side has not caught up — `arc-session` on a no-meta tree falls into session-init's orphan path,
which does *WU discovery* ("next ROADMAP item?") rather than "orient and await an Errand." The missing piece is
an orientation mode that loads the universal session-init content but stops before any WU-artifact reads.

**Provisional resolution (ratify when an owner takes it):** keep **one** entrypoint. `arc-session` is the
universal door and grows a **no-WU / orient-and-await leaf** (the orphan path, made Errand-aware);
`errand-launch` is *not* a second entrypoint but an in-session **prep** action that sets up the cheap branch +
seed in the main worktree, which you then *enter via `arc-session`*. This keeps session-init machinery DRY
behind one door and stops `errand-launch` re-implementing orientation. Disambiguate the leaf's two intents —
between-WU **discovery** vs. **Errand** — with an explicit signal, *not* "any arg = Errand" (that collides with
cold-start's spec-input arg); or disambiguate interactively at the leaf.

**Likely owner:** Errand Enablement, coordinating with whoever owns the session-init orientation mode.
**Worktree Foundation seam (built now, no Errand behavior):** `arc-session` dispatch carries an explicit no-WU
leaf instead of collapsing it into WU-discovery, and the optional `<pointer-or-blurb>` arg threads to whatever
leaf is dispatched (not hard-wired to cold-start) — so the fill attaches without a restructure, mirroring the
materialize seam left for In-Flight Awareness.

**Update (2026-06-05; design-settled 2026-06-24) — the dual is owned by `out-of-wu-entry`.** The provisional
resolution above (and the leaf built to it) covers only the **no-originating-session** case — it lives on
session-init's Orient (no-active-WU) arm. The **dual** it missed: an explicit out-of-WU intent raised *while a WU
is active* (the Resume arm), which the same errand/housekeep doctrine endorses and which `run-errand` / the
`arc-errand` warm skill already support — session-init currently **discards** an explicit `--errand` on the
Resume arm ("Errand signal not consumed") and has no `--housekeep` priming door at all. `out-of-wu-entry` (active
planning WU, this cohort) **takes this** — the owner the provisional resolution awaited. Its settled design
generalizes the discarded-`--errand` bug into one **arm-orthogonal dispatch leaf** that honors an explicit signal
regardless of arm, preserves the active checkout, and routes to the locus — populated by `--errand`,
`--housekeep`, and `--plan <stub>` (in-place backlog-stub grooming). Independently shippable, not gated on
CWC/AWL. See `draft-out-of-wu-entry.md`.

## Deferred — `/arc-shift`

The narrow in-session shift was originally in WF scope (R13/R14/R15, Phase 6) and was deferred at the start
of Phase 6 execution (2026-05-28). The use case is real but demand-unverified, and the wider conception this
verb was originally sized for was absorbed by the Errand class. Preserved here for cohort-level revisit; not
re-attempted by WF.

**Disposition (2026-06-24, via `out-of-wu-entry` planning).** `arc-shift` is **not** an `out-of-wu-entry` entry
signal: an entry signal establishes *fresh* scoped context at session entry, while `arc-shift` is a mid-session
detour that *carries and merges* live context into another worktree's runtime — an orthogonal mechanism (a
separate `shift-work-unit.md` verb, not a dispatch-slot case). Its premise also requires real worktrees-in-use,
gated on `finalize-parallelism`. The **revival decision is routed to `finalize-parallelism`**, where the
substrate it operates on becomes real and the as-built concurrent-work conventions exist to update against —
superseding the open-ended fallback tree below for the revival call itself.

### Surviving narrow use case (preserved from WF spec)

Interactive cross-worktree *investigation* — operate in another worktree's runnable environment while
reasoning with the current session's live, expensive-to-reconstruct context. Requires all three
simultaneously: the target worktree's runtime environment, this session's accumulated reasoning, and return
intent (short detour, not a permanent switch). Discovered side work goes to errand-launch; a discrete
question about another worktree is answered by reading its files (worktrees are directories) or seeding an
exploration session — neither needs a context-merging shift. A permanent switch is handoff + fresh session;
a mis-launch is clear + re-init — neither has accumulated context worth preserving.

### Alternative framing to evaluate

**PR-review checkout** — pulling a teammate's (or one's own past) branch into a transient worktree with the
current session's review-context loaded. Different shape than the in-flight-own-WU framing above (the target
is a remote PR branch, not necessarily an in-flight WU of yours); plausibly higher frequency than
investigation-into-own-WU. If shift earns its keep when revisited, the case may be this one rather than the
spec's original.

### Implementation shape (if revived)

Workflow doc `shift-work-unit.md` carries the logic — including the uncommitted-work gate (the original R14,
which gates everything else); the `/arc-shift` skill body is a thin dispatcher. Matches the codified
skill/workflow split (arc-commit → prepare-commits; arc-session → session-init). The gate-belongs-in-workflow
shape is what keeps the skill body honest as a thin dispatcher.

### Fallback decision tree (at end of cohort)

The deferral leaves three exits at cohort end:

- **Pick up in a remaining cohort WU** if a real instance surfaces during the cohort run — Errand
  Enablement, In-Flight Awareness, Agile WU Lifecycle, or Concurrent Work Conventions can absorb it.
- **Materialize as a provisional backlog stub** (`.arc/backlog/provisional/arc-shift/`) if still ambiguous
  at cohort end — keeps the design captured under a low-commitment surface.
- **Dismiss entirely** if confidence grows during the cohort that no instance will surface; the verb dies,
  this section archives with the cohort.

## Cross-cutting design spine — the Errand work class

The cohort's central cross-cutting decision is the **Errand work class** — see [ADR-021][adr-021] for
the taxonomy (Errand vs. Work Unit, the 1:1 relaxation, the threshold, atomic-as-character extended).
ADR-021 decides the taxonomy; the operational plumbing is owned across the cohort:

**Errand-model re-pivot (`work-routing-discipline`, 2026-05-31):** the class collapsed to **execution-only**.
The `errand-launch` seed primitive and the `ERRANDS.md` queue are retired; an errand *is* its execution via the
re-enterable `run-errand` workflow (`chore/<slug>` under full / direct base commit under partial), dispatched by
`arc-session`. State is derived (chore branch → open PR → merged), never a queued artifact; capture is
`arc-inbox`/inbox-only. The decision matrix and advisory foreign-artifact gate survive, but the ownership map
below predates the pivot — read `errand-launch` as `run-errand`, and reconcile when next iterated.

**Worktree Foundation owns:**

- The cheap ephemeral-branch mechanism that makes an Errand affordable under full / host-protected `main`
  (mechanism only — launch ergonomics are Errand Enablement's).

**Errand Enablement owns (the floor):**

- The `errand-launch` entry primitive (seed-and-continue from the main worktree), the **Errand decision
  matrix** (create/maintain × self-contained/cross-cutting × owning-WU-in-flight routing), and the
  **advisory foreign-artifact gate** (extends Foundation's R11 stub). The minimum that makes the class
  *usable*, so it lands at WF+1 rather than cohort-end; sequences WF → Errand Enablement → IFA. In-Flight
  Awareness later upgrades the advisory gate (and R11) to oracle-backed. See `draft-errand-enablement.md`.

**In-Flight Awareness owns:**

- The **concurrency oracle** hook: in-flight detection from remote refs + open PRs, parsed
  path / content-based (not branch-name → WU, since an Errand branch maps to no WU). Closes the in-flight
  blind spot via `init-work-unit`'s existing branch-push step. The branch *prefix* (`plan/` vs a type
  prefix) is a free state-proxy: `plan/` = live-mutating planning; type-prefix = activated, plan frozen.
- The in-flight view's user-domain placement + orient / pivot regeneration hooks (render is
  roadmap-tooling's; see candidate below).

**The `concurrent-work-conventions` sub-cohort owns** (post-decomposition; each bullet now maps to a member —
`concurrent-work-doctrine` for the doctrine, `merge-safety-mechanism` / `async-merge-lifecycle` for the gate
mechanism, `single-owner-wu-model` for the self/foreign asymmetry. See `cohort-concurrent-work-conventions.md`.
Retained here as the parent-cohort record of this slice of the Errand-class spine — including the lighter-merge-gate
detail the member specs carry forward):

- **Isolation doctrine.** Actionable cross-cutting work is done once, in its real place — off the member
  branch, reaching `main` independently. Capture surfaces (USER-INBOX) are for *not-yet-actionable*
  pointers only; stub-ready or non-trivial work goes to its real home directly. Create = WU (a tracked
  deliverable); maintain = Errand.
- **Concurrency gate** (the full all-owner doctrine; the *advisory* floor version ships with Errand
  Enablement). Edit a foreign artifact directly only when its WU is not in flight. Editing your
  own WUs' artifacts uses the user-scoped in-flight view; a foreign WU that is in flight is coordinated,
  never blind-edited. The oracle is all-owner (refs + open PRs); a policy layer keeps the common path
  (your own work) on the cheap user-scoped check.
- **Lighter merge gate.** Path-graded: planning / backlog grooming auto-merges; constitutional docs
  (rules, ADRs, strategies) stay reviewed. Implemented via a conditional "merge-ok" status job (not CI
  `paths-ignore`, which leaves required jobs Pending and blocks branch protection). CODEOWNERS does the
  path-scoped review-requirement and notification; native auto-merge suffices (path-graded, not
  author-graded). Optional phase-2: generate CODEOWNERS from the `**Owner:**` field so ownership
  presence selects the lane and a sibling owner is auto-notified / required on edits to their in-flight
  planning — turning the coordination convention into a host-enforced gate. Keep CODEOWNERS a hard gate
  under auto-merge; require the most-recent push be approved by a non-pusher.
- **Dependent-WU ordering.** Adopt "stacked PR / dependent PR" vocabulary for sequencing cohort siblings
  that depend on each other; evaluate the full stacked-PR workflow (rebase discipline, tooling) against
  ARC's independent-merge model at the PRD — vocabulary now, workflow TBD.

**Agile WU Lifecycle owns** (now from the principle-anchored-core cohort — departed 2026-06-02):
tier-model reconciliation to Errand/WU + atomic-as-character (whether the *atomic-tier* name survives in
the tier set). This question travelled with the WU; the strong current lean is that atomic-character work
lives in the Errand class and "atomic" is no longer a WU tier — see that draft's design-refresh flag.

Cross-cohort follow-on — **`graduation-cleanup`** (outside the cohort): reconcile its spec-graduation
cleanup ceremony (drop a WU's *own* planning-noise commits before the Planning → Active flip) with the
lighter-gate / planning-layer merge treatment here. Related but distinct — the cleanup is intra-WU
history hygiene; the lighter gate is cross-WU merge routing.

## User-scoped in-flight view — oracle-derived (In-Flight Awareness builds oracle + file; roadmap-tooling renders)

A gap distinct from both ROADMAP and the cut `/arc-status`: a **user-scoped, cross-WU view of in-flight
WUs and their states** — including WUs in flight with no open session right now, and WUs checked out only
on another machine. ROADMAP is project-scoped, all-owners, derived-at-merge (mid-WU stale), shared.
Session tabs / GUI show *sessions*, not *WUs*. An agent in one worktree's session structurally cannot see
the operator's other in-flight worktrees. This view fills that — and it is also the **concrete consumer
of the concurrency gate**: the all-owner variant (sourced from refs + open PRs, since `main`-derived
state is blind to unmerged work) is the gate's safety oracle, while the `Owner = me` filter is the
operator's work-awareness view.

**Ownership (settled 2026-05-23; reassigned to In-Flight Awareness in the 2026-05-24 split).** In-Flight
Awareness builds the **oracle** — the in-flight-detection primitive (remote refs + open PRs, parsed
path / content-based; WU metas read off remote refs via `git show`, no checkout needed) — and establishes
the **view file + its strategy-doc standard** (derivation algorithm, hand-maintenance procedure, regen
triggers), so the view is usable from ship and hand-maintained in the interim exactly as ROADMAP is today.
`roadmap-tooling` later automates the render. The oracle is consumed via Worktree Foundation's
`arc-session` skill (which In-Flight Awareness extends with the materialize dispatch branch) for
cross-machine discovery and the advisory concurrency check.

- **Purely derived, never hand-edited** (per [ADR-020][adr-020]'s derived / mutated split): regenerated
  from the oracle; concurrent writes resolve by "regenerate wins." **No annotation layer** — per-WU human
  context stays in SESSION-NOTES, cross-WU context in WORKING-MEMORY; the view carries only derived state.
- **A user-scoped mode of the roadmap renderer, not a second generator** — ROADMAP's in-flight rows
  filtered to `Owner = me`, sourced from refs / open PRs (not `main` meta files — `main` can't see
  unmerged work).
- **Does not need to sync.** Because the core is derived from *remote* refs + PRs, every machine
  regenerates it identically — so it is **on-demand with an optional local cache**, not synced human
  content. This corrects the earlier "lives in user/, synced via user notes" framing: structurally it is
  a ROADMAP (a derived snapshot regenerated at boundaries), not a WORKING-MEMORY. A local cache is a
  convenience (read without a fetch + PR round-trip), not a correctness requirement. Name TBD
  (DASHBOARD / IN-FLIGHT / WORKLIST).
- **Worktree paths are not stored.** Paths are machine-local: resolve them live from `git worktree list`
  for WUs checked out here, omit them for WUs in flight elsewhere (a stored path is meaningless on another
  machine). This dissolves the synced-core-vs-machine-local-overlay question for the interim.
- **"Always up to date" = regenerated at every orient and pivot** (plus state-change ceremonies, like
  ROADMAP) — current whenever consulted, not real-time-reactive to a sibling live session.
- **Open questions (spec):** exact regeneration triggers; name; whether a persisted local cache earns its
  keep over pure on-demand render.

## Pending cross-cohort follow-ons

- **Shipped-doc drift-fix** — addressed by WF Phase 7.5. `strategy-work-organization.md`'s state table is
  reconciled to the 4-state machine under 7.5.a (Superseded becomes an `**Superseded By:**` annotation, not
  a state value), and § ROADMAP's In-Flight tier is redefined as location-based under 7.5.c (`active/**`).
  No follow-on for the cohort.
- **arc-modes re-scope** (queued on its own meta `**Next Action:**`): Lite cut, post-WOR de-stale,
  local-mode rename.
- **AWL generic artifact-model prefix mentions** (`plan-*` / PRD in the tier-model body): left during the
  WOR-terminology sweep — entangled with AWL's tier ↔ spec-form coupling, deferred to arc-plan Conductor.

---

[adr-019]: ../../../reference/adr/adr-019-work-unit-lifecycle-reform.md
[adr-020]: ../../../reference/adr/adr-020-adopt-principle-anchored-scalable-core.md
[adr-021]: ../../../reference/adr/adr-021-introduce-errand-work-class.md
