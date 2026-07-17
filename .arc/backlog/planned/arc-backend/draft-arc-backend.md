# Draft: ARC Backend (storage-substrate north star)

**Purpose:** The north-star target for ARC's storage substrate — canonical WU-artifact storage living **git-native
but outside the project's code repo, materialized locally** — covering the git-only tiers (Local, Shared). The
substrate is not a novel storage system: it is a second git repo plus a sync discipline, the most ordinary thing in
git. The **Coordinated** tier (a self-hosted service or SaaS-composed coordination layer) is split out to
`arc-coordination-service` (provisional) and constrains this design only through the service-optional invariant.
This plan establishes the shape, audience fit, and forward-compat discipline; detailed design defers to a PRD.

- **State:** Planned (promoted from provisional 2026-07-17 — it started provisional; it is definitely planned now)
- **Created:** 2026-05-02
- **Updated:** 2026-06-10 — sharpened to the **git-backing-store-materialized-locally** model (materialization A/B,
  the one knob, concurrency-with-history, operational gotchas). 2026-07-02 — shared-inbox compose notes
  (entry-granular ops, tombstones, per-entry version checks). **2026-07-17 (storage-substrate grooming)** — tier-4
  split (`arc-coordination-service`); composed picture stated up front; scope model (user vs project);
  placement-as-record; routine-operations walk-through; code-repo footprint policy; compatibility ledger; staging
  section; both inbound-buffer items resolved into the body; research grounding
  (`research-storage-landscape-2026-07.md`).
- **Origin:** Surfaced during cross-machine planning discussion 2026-05-02; reframed 2026-06-10 as one
  git-backing-store substrate scaled from single-user (Local) to shared (team), rather than a bespoke service.

---

## The Composed Picture

The organizing rule the whole design serves — apply it as a test to any artifact:

> **Shared + mutable + markdown = red flag.** Everything genuinely shared-and-mutable migrates out of markdown
> into records (event-log or LWW class, per § Concurrency). What remains as markdown is either **owned prose**
> (single-writer by the ownership discipline of the single-owner-WU model; git merge as backstop, never as
> coordination mechanism) or **projection** (regenerated from records, never merged).

If a piece of markdown is shared, mutable, *and* not on a record-migration path, that is a design gap — surface it.
The record migrations (`operational-state-docs`, `wu-lifecycle-state-model`, `roadmap-tooling`, shared-inbox model)
are therefore not adjacent work: they are the substrate's data layer being built in advance, and they deliver
standalone value (solo-parallelism relief) before any storage flip.

---

## Problem / Motivation

ARC's canonical-store assumption today is "everything in `.arc/` lives in the project repo's tracked tree." It
serves solo dev well and strains along four concerns:

- **(a) Agent/human ergonomics** — the in-repo model's strength: agents grep/edit any artifact instantly; humans
  keep planning beside code. Any target must *preserve* this (why a SaaS/own-frontend pivot is a non-goal).
- **(b) Solo dev, multi-machine** — centralized canonical state without per-machine drift.
- **(c) Privacy** — planning artifacts are public when the repo is. Invariant under in-repo storage; out-of-branch
  tricks (notes, orphan refs) do **not** deliver it — (c) forces a *separate, private* repo.
- **(d) Git-history & PR-view pollution** — planning churn interleaved with code commits; tolerable solo, explodes
  with team size; no reliable filter exists today.

**Calibration (2026-05, reaffirmed by the 2026-07 research pass):** inter-WU planning concurrency is modally
coordinated out-of-band; pure sync is not the load-bearing team value. Primary value-props are **(c)** and
**(d)**, with concurrency discipline a benefit for high-parallelism deployments.

**Research grounding (2026-07 — see `research-storage-landscape-2026-07.md`):** the industry has arrived at this
decision space and split into camps with no convergence winner; designing one substrate with cheap transitions is
the defensible position. Key external facts: silent write-loss under unguarded shared-mutable state is
*empirically verified* (Letta: 18/24 concurrent appends lost to LWW); a separate-planning-git-repo is now a
shipped industry feature (OpenSpec Stores — "a store is just a git repo"); an event-log-in-git-refs substrate
exists as a designed system (grite: "the git WAL is the source of truth, the CRDT projection a materialised
view"); and beads' canonical-store churn (JSONL-in-git → Dolt-DB → partial walk-back in ~5 months, with data-loss
bugs) demonstrates the cost of leaving the canonical-home seam ambiguous. Critically, the public
"co-locate at scale" guidance defends *low-churn context/spec content* — which maps to the classes ARC keeps
tracked — while nobody defends high-churn operational state in-repo at scale; **the industry's implicit category
split confirms ARC's tracked-vs-materialized line.**

---

## Working Thesis: Git All the Way Down

**The canonical store is a git repo — just not the project's code repo.** Per-user it is a private backing repo
(Local); shared it is that same repo on a shared private remote (Shared tier). ARC *materializes* its content into
a gitignored `.arc/` so agents and humans see ordinary local files (the chezmoi/dotfile-manager shape). This keeps
every benefit ARC already has while solving (c) and (d), without becoming Linear/Notion.

**Git-canonical, by fiat (service-optional invariant — check-doc Principle 10).** The event log and all record
classes serialize into the store repo. **A clone of the store is always the full canonical state.** Any future
coordination service fronts the same ledger as gatekeeper/accelerator, never replaces it; any Coordinated
deployment degrades to Shared-tier semantics. This closes the seam that generated beads' churn and is what makes
deferring the service tier safe rather than hopeful.

**B canonical, A integration.** External-tool integration (Linear/Jira/Notion, incl. via MCP) layers on as sync
adapters, never as substitutes for the canonical store. Extending `pm.mode: external` to own WU artifacts before
this lands would lock in external-tool-as-canonical — do not cross that line.

---

## The Storage Model

### The line: tracked vs. materialized

| Class                 | Members                                                                                    | Tier                       | Configurable?      |
|-----------------------|--------------------------------------------------------------------------------------------|----------------------------|--------------------|
| **Machinery**         | `system/**` (workflows, rules, methods, templates)                                         | **tracked**                | No — pins to code  |
| **Operational state** | `meta-*`, `tasks-*`, inboxes, `STATUS`/`ROADMAP`, notes, `WORKING-MEMORY`, `SESSION-NOTES` | **materialized**           | No — pure churn    |
| **Authored design**   | `draft-*`, `spec-*`                                                                        | **materialized (default)** | **Yes — one knob** |

### The one knob

```
storage.track_design_docs: none | specs | all     # default: none
```

One enum governing privacy (c), in-git PR review, and history-browsability together — one axis, never
per-artifact booleans (the matrix ADR-020 killed). `specs` is the costliest arm (a WU spans two repos — Gotcha 2);
consider `none | all` only. Watertightness rests on disciplines ARC already has: filename-only cross-artifact
references and reference-don't-embed.

### Storage tiers (one substrate at increasing multiplicity)

| Tier            | Canonical store                                        | Scale                               | State                     |
|-----------------|--------------------------------------------------------|-------------------------------------|---------------------------|
| **In-repo**     | the code repo (tracked `.arc/`)                        | solo / small team, no constraints   | Current                   |
| **Local**       | a separate **private git repo** (`~/.arc-state/{id}/`) | single-user multi-machine; privacy  | Planned                   |
| **Shared**      | that repo, on a **shared private remote** (git-only)   | small team, multi-writer            | Planned (this north star) |
| **Coordinated** | a **service fronting the same store**                  | high-parallelism / per-record authz | Provisional — split out   |

**Local *is* tier-2; Shared is tier-2 on a shared remote with multi-writer discipline (version-checked writes,
entry-granular records, optimistic push-retry); team is the multi-writer config, not a separate design.** Tiers
1–3 require nothing hosted beyond git remotes (industry precedent: OpenSpec Stores). The Coordinated tier —
self-hosted service *or* PM-SaaS composed as the coordination/visibility layer with the store staying canonical —
lives in `arc-coordination-service` and is deferred until demand or capacity exists.

### Materialization: Architecture B (render/projection)

Canonical repo out-of-tree; ARC renders into a gitignored, plain-files `.arc/` (no nested `.git`). Matches
ADR-022's record-canonical / markdown-is-a-projection decision. History browsing via `arc history <artifact>`.
(Architecture A — nested checkout/worktree — rejected: cwd-following git surprises, two SCM roots, fights
ADR-022.) The projection layer serves **more than one consumer**: markdown files for agents/humans *and* renderer
queries for view/HUD surfaces (`arc-view`, `status-hud`) — the record→projection interface exposes typed reads,
not only markdown-emit (compose-note routed to `operational-state-docs`).

### Freshness

Don't prevent stale reads; make them harmless: **version-checked writes** (git's non-fast-forward rejection is
native conflict detection — a stale read only harms via a later unchecked write), agent-side refresh at ceremony
fire-points, and **init-scaffolded per-editor watch settings** (Zed `file_scan_inclusions` confirmed; VS Code via
watcher config; Helix gapped; `.git/info/exclude` honored by no editor).

---

## Scope Model: user vs. project (orthogonal to tiers)

The tier axis is about writer multiplicity on **project scope**. **User scope is a separate axis with its own
store mapping — it is not swept into the shared store when a project goes Shared.**

- **Project scope** (WU artifacts, shared inboxes, project vector, roadmap records) → the project's backing store;
  at the Shared tier, visible to the team **with provenance** — attribution, not isolation.
- **Private user scope** (`SESSION-NOTES`, `WORKING-MEMORY`, personal captures) → **a per-user private store by
  default, at every tier** — the user's own repo, their own remote, structurally never entering the shared store.
- **User-authored-but-shared** (inbox drains bound for project homes, locus visibility signals) → flows *through*
  records into project scope; the shared-inbox model draws this line.

Grounding: today's git notes ride the **shared origin repo** — user state already lives on team infrastructure,
protected only by obscurity (no host renders notes). Ordinary files in a shared store would be rendered, diffed,
and greppable — a strict visibility regression if absorbed naively. Per-user private stores are strictly *more*
private than today. Independent precedent: Swamp's namespaces are "provenance, not isolation" — everything shared
is visible with attribution, **except** the private class (secrets/vaults), which "remain repo-local regardless of
namespace configuration" — the same asymmetric model. A hosted per-user-namespace variant (server ACLs) is the
Coordinated-tier fallback, not the default. Locus-style machine-local state may warrant a third authority domain
(home by authority; query across domains, don't replicate — the Swamp run-tracker precedent); routed to
`session-locus-model`.

---

## Placement Is a Record, Not an Address

Directory placement (`backlog/{provisional,planned}` / `active/` / `completed/`) is today a state *encoding* —
a coupling smell: concurrent lifecycle transitions make placement a shared-mutable surface, and layout changes
break readers. Target consequence: **lifecycle state is a record field; directory layout is a projection of it;
relocating a WU is a record-field change ARC cannot break on.** Owner: `wu-lifecycle-state-model` (inbound capture
routed 2026-07-17); the coupling/blast-radius audit enumerates today's placement readers.

---

## Routine Operations Under the Substrate

The ergonomics invariant: **agents interact with exactly one git repo (the code repo) and one verb surface
(`arc`). The store repo is CLI-internal plumbing — no agent ever runs git in it.** Write-routing by artifact class
is deterministic, therefore CLI-computed, never agent judgment (procedure-evolution P1).

| Operation (today)                                      | Under the substrate                                                                                                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Task tick, staged + committed with the code increment  | Verb (`arc task done …`) → record write, store-side; projection refreshed. Review-visible linkage rides the commit **footer** (or inverts to the record — § Footprint) |
| Meta update + standalone handoff commit                | Folds inside `arc handoff`'s persist step; the standalone commit ceases to exist in code history                                              |
| Spec/draft prose edits                                 | Unchanged — edit the materialized file in place; sync layer persists at existing firing points                                                |
| `arc user save` (notes)                                | Same verbs, store transport underneath (notes refs retire — local-mode buffer item)                                                           |
| ROADMAP edits + conflict resolution                    | Removed — derived projection, regenerated (`roadmap-tooling`)                                                                                 |
| Code commits                                           | Code only (plus tracked classes); no PM staging choreography                                                                                  |

The workflows' *shape* survives untouched — same firing points (increment close, handoff, session-init), same
ceremonies; bodies change from mechanics-narration to verb invocation, which is the verbs-over-mechanics ratchet
already in motion. **Sequencing rule that carries the ergonomics: migrate the interface first, the storage
second.** Verbs + records land before the flip (Stage 0/1 before Stage 2, below); flip day then changes only
what's behind verbs agents already use.

Named opens and seams:

- **Increment-close ceremony shape** — one fused verb (commit fires the task-record write, capturing the increment
  SHA into the record) vs. two explicit steps. Seamed to `commit-increments` / `process-task-loop` redesign.
- **Managed-vs-authored file classes** in `.arc/` (record projections = verb-mediated; prose = edit freely) —
  formalizes ADR-022's existing line; agents already hold it for managed docs. Ledger row below.
- **Failure surfacing** — store-write failures (Class A/B/C, local-mode taxonomy) surface as orientation lines at
  session boundaries, never as mid-task decisions; sessions never stall on the store.

---

## Code-Repo Footprint Policy

Under true separation, *any* ARC language in the code repo is a policy question, not an inevitability. A team may
reasonably demand a code repo **completely free of ARC footprint**; the design must make that achievable without
losing traceability. Leakage surfaces to govern: the `Context:` footer, the `Arc-Maintenance:` trailer (the noise
mitigation is itself footprint), init-scaffolded editor settings (`.zed/`, `.vscode/` are tracked-file commits —
zero-footprint routes them to user-local settings or skips with a freshness warning), the opt-in shared-gitignore
line, and commit/branch conventions.

**Traceability inversion is what makes zero-footprint viable:** instead of the code commit advertising PM linkage
(footer → task), the **PM record captures the code linkage** (the task record stores the increment SHA at tick
time — free if the fused increment-close verb lands). The store is the side that's allowed to remember; `arc`
surfaces resolve SHA↔task in both directions for anyone with store access. Public viewers lose the linkage —
which is the *point* of privacy-max, not a defect. Footer-bearing configurations keep today's in-history
traceability; local-mode's freeform `Context:` remains the middle posture.

Shape: a small **footprint policy** derived from the storage tier plus one explicit knob (exact form at PRD —
check against Principles 8/9, no per-surface booleans). Default keeps footers (real value for most adopters);
zero-footprint is a supported arm. *This resolves the former inbound-buffer item on `Context:` footer validity:*
the footer validator queries the injected artifact resolver (seam already held by `commit-message-submission`);
under materialized tiers it resolves against the store, degrades gracefully when the substrate is unavailable
(warn-don't-block in CI/contributor clones), and footer participation is governed by this policy — artifact names
never leak into code history under privacy-max.

---

## Concurrency & Version History

Per state subtype (audit ⊥ concurrency; both delivered):

- **Append-heavy shared records** (shared inboxes/queues) → **event-sourcing**, append-plus-tombstone (removal and
  re-home are events; the housekeep sweep is a second writer class). Events serialize into the store repo
  (git-canonical by fiat); optimistic append via push-retry at the Shared tier. Precedent: grite's WAL-in-refs.
- **Small structured records** (`meta-*` fields, priority/ordering, lifecycle state, `VECTOR.PROJECT`) → **LWW +
  history**, version-checked; store-side.
- **Prose** (`draft-*`, `spec-*`) → **git merge** as backstop; the coordination mechanism is *ownership*
  (single-owner-WU), not merge. CRDTs rejected for prose: structural convergence leaves 5–10% semantic conflicts
  (CodeCRDT study), and semantic correctness is what review carries.

Empirical anchor: unguarded shared-mutable state loses writes *silently* (Letta, verified; LangGraph-class bugs in
production). Version-checked writes make stale reads harmless; entry-granular slug-keyed operations (ADR-022
coordination requirement) make sweeps and drains commute instead of wholesale-rejecting.

**Review receipts** *(resolves the former inbound-buffer item)*: receipts are an event-log record-class candidate
on the same substrate port — expected-version append, change-request identity, private/public projection all fit
the store-side event shape; nothing forces them into `.arc/` projections. Residual choice (backend-canonical
events vs. adapter-owned events using the same port) is owned jointly with the review-gate work at PRD time; the
port design here must not foreclose either.

### The genuinely hard problem

Not the concurrency algorithm — **multi-writer local-materialization freshness**: your local view can be stale
because someone else moved canonical. Stance: version-checked writes prevent corruption; shared surfaces are
deliberate-refresh; your own edits are always fresh. Decide whether that UX bet holds *before* the Shared tier
ships multi-writer.

---

## Compatibility Ledger (current system → target)

For each current component: what it becomes, which mechanism covers each need it serves, and what degrades. Gaps
found by this table are design work, not footnotes.

| Current component                                | Becomes                                              | Needs met by                                                                                    | Gaps / degradations                                                                                 |
| ------------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Git notes user state (`refs/notes/arc/user/*`)   | Per-user private store artifacts (§ Scope Model)     | Same sync state machine & failure taxonomy, store transport; strictly more private than today    | One-time import; notes refs retire (local-mode buffer item); zero-config entry story re-answered (open) |
| `meta-*` + standalone handoff commits            | Small structured records; handoff verb persist       | ADR-022 records; standalone commits vanish (d)                                                   | Human reference = projection + `status-hud` card                                                     |
| `tasks-*` riding increment commits               | Records + tick verb; markdown projection             | Entry-granular ops; footer or record-side SHA carries linkage                                    | Increment-close ceremony shape (named open)                                                          |
| `spec-*` / `draft-*`                             | Materialized prose (knob governs tracking)           | Edit-in-place unchanged (a); privacy via (c)                                                     | `specs` knob arm spans repos (Gotcha 2)                                                              |
| `ROADMAP` / `STATUS`                             | Derived projection + ordering records                | Regeneration kills merge conflicts; LWW ordering                                                 | `roadmap-tooling` owns render surface                                                                |
| Inboxes / drains                                 | Slug-keyed entry records, event log                  | Tombstones; per-entry version checks (Gotcha 6)                                                  | Shared-inbox model owns the line                                                                     |
| Directory placement as state                     | Lifecycle record; layout = projection                | Placement changes can't break ARC                                                                | `wu-lifecycle-state-model` owns                                                                      |
| `Context:` footer + trailers                     | Footprint policy; traceability inversion             | Zero-footprint arm viable; validator via resolver seam                                           | Policy shape open (§ Footprint)                                                                      |
| Worktree-forked `.arc/` copies                   | One store materialized into every worktree (Gotcha 3)| Fork-elimination kills PR-time state merges                                                      | Cutover is the serialization point                                                                   |
| Hooks / editor pickers / freshness               | Unchanged local; init-scaffolded settings            | Local-mode survey + backend freshness findings, one owned setup step                             | Helix degraded; scaffolding vs zero-footprint tension (§ Footprint)                                  |
| `arc user` verb family                           | Storage-abstraction contract behind kept verbs       | Local-mode command-family design                                                                 | One-contract-vs-family decided at abstraction design                                                 |
| CI / contributor visibility                      | Tier-gated degradation (Gotcha 4)                    | Graceful absence of state                                                                        | "CI sees zero ARC" is tier-1-shaped; gate by tier                                                    |

---

## Staging & Decomposition (chunked delivery; the flip is a point, not an era)

- **Stage 0 — record migrations** (`operational-state-docs`, `wu-lifecycle-state-model`, `roadmap-tooling`,
  shared-inbox model): Gate-A work, lands in-repo, standalone value now; *is* the substrate's data layer.
- **Stage 1 — the storage seam:** every reader/writer routes through the storage abstraction; first
  implementation is the current in-repo layout (behavior-preserving strangler fig). Work-list = the merged
  coupling/blast-radius audit (`coupling-blast-radius-audit` capture). Chunked by subsystem; coexists with normal
  development. `cli-substrate-adoption` is the foundation; `composable-workflows`' verbs-over-mechanics scrub
  shrinks the workflow-side radius — cost prepayment, not queue competition.
- **Stage 2 — materialization engine + Local (tier 2):** opt-in per install; first consumer can be an external
  repo (CineXplorer at Gate A), not this one. This repo's own cutover is a **bounded quiesce-import-flip window —
  a serialization point, not an argument against parallelizing everything on either side** (RELEASE-GATES).
- **Stage 3 — Shared tier:** the multi-writer config — shared remote, provisioning reuse (`init --local` flow),
  push-retry discipline over the entry-granular records Stage 0 delivered.
- **Stage 4 — Coordinated tier:** `arc-coordination-service`, demand-driven, service-optional invariant standing.

---

## Team Mode Subsumed

`team.enabled` in-repo team mode stays a supported bridge; in the target, multi-user teamwork is the multi-writer
config of the substrate — the axis collapses into "the store is shared." Avoids the storage × team × pm-mode
matrix explosion.

---

## Operational Gotchas (designable, not blockers)

1. **Cross-repo atomicity → eventual consistency + heal**, never 2-phase-commit; partial failure is drift, not
   corruption; ordering only for order-sensitive ceremonies (don't archive state before code merges).
2. **The `specs` knob arm spans two repos per WU** — argues for `none | all` unless the middle earns it.
3. **Worktree interaction** — under B, each worktree gets a synced `.arc/` view of the one backing repo.
4. **Contributor/provisioning** — clone code + provision state; reuse `init --local`/re-clone; contributor flows
   degrade gracefully when state is absent/private.
5. **`.gitignore` airtightness** — a pre-commit guard asserting `.arc/` stays ignored is load-bearing for (c).
6. **Batch mutations version-check per entry** — commit-of-decision, never batch-at-end over a stale read.

---

## Notes: zero-config entry, retiring by convergence

Notes remain the zero-config entry on the scaling axis today, and they retire into the substrate as an ordinary
per-user-store artifact class (local-mode inbound item; stop-loss rule in force — no new notes machinery).
Research sharpened the rationale: notes' *living* industry niche is commit-anchored provenance metadata (Agent
Note, git-ai) — precisely what ARC's user state is not — and peer systems storing freestanding records in git
chose custom ref namespaces over notes for the same warts ARC hit. Cite in the pre-B rationale doc: build → learn
→ converge.

---

## Open Questions for Pre-PRD Detail Design

Resolved by grooming (2026-07-17): the tier count and service split; event-log canonical home (git, by fiat);
scope-model default (per-user private stores); both prior inbound-buffer items (footer → § Footprint; receipts →
§ Concurrency).

Still open: storage-abstraction contract shape (file-system semantics over a git store; **non-git substitutability
as acceptance criterion** — routed capture); identity/project resolution across machines (Local leads; cross-user
stability at Shared); increment-close ceremony shape; footprint-policy exact form; zero-config entry story after
notes retire; backing-store history retention/compaction policy (make it a named policy axis — Swamp
data-lifetimes precedent); interaction with Lite/minimal scaling; multi-writer freshness UX (the load-bearing bet).

Moved to `arc-coordination-service`: auth model, access transport, deployment shape, multi-tenant/org boundaries,
per-record authorization, SaaS-composition variant.

---

## Upstream Dependencies

- **`operational-state-docs`** (ADR-022 engine) — the record/projection layer everything renders through.
- **Local mode (`draft-local-mode.md`)** — tier-2; the Shared tier is mostly "Local, shared"; co-design the
  storage abstraction at Local's PRD.
- **`prd-user-sync-ux.md`** — the sync state machine the store's sync layer extends.
- **`cli-substrate-adoption`** — the Zod/execa base and (routed capture) schema kernel the verb surface builds on.
- **Worktree foundation (shipped)** — Gotcha 3 is a live interaction; design explicitly.

## External Interchange — OKF Projection

Unchanged position (2026-06-13): OKF is an optional *projection target* off the record→markdown layer — emit the
knowledge layer, never operational churn. Projection-ready, not adopt-now; owned with `idiomatic-alignment`.

## Non-Goals

- Hosted SaaS offering; web UI / own document frontend (betrays ergonomics (a)).
- Forced migration of in-repo installs — tiers are opt-in; in-repo works indefinitely.
- External-tracker ownership of WU artifacts via `pm.mode: external`.
- Building the Coordinated tier now — split out, provisional, demand-driven.

## Sequencing Intent

Post-B by design (RELEASE-GATES): the road runs through Gate A — Stage 0 is Gate-A work, the seam and Local follow
the substrate chain (`cli-substrate-adoption` → `operational-state-docs` → `local-mode`), and this doc functions as
the forward-compat reference throughout. Watch item: the merged coupling/blast-radius audit, scheduled soon after
FP GA. The 2026-05 backlog compat audit's per-item verdicts stand, but its table is superseded by the check-doc
self-check discipline (flag-at-PRD items reconcile at their own promotion) and the Compatibility Ledger above.

## Coordination — ADR-022

Records lift without reshaping; the interim notes-sync assignment is the tier-2 bridge. **Entry-granularity
requirement** (2026-07-02): shared-mutable members are sets of slug-keyed entries with entry-level ops — never
whole-document reconcile. **Direction layer** (2026-07-02): `VECTOR.PROJECT` is small-structured-records class
(LWW + history), authority model maps onto Coordinated-tier auth unchanged; `VECTOR.USER` follows the user-scope
story (per-user store after notes retire). **Projection consumers** (2026-07-17): the record layer serves
renderers (`arc-view`, `status-hud`) as first-class consumers beside markdown.
