# Strategy: Storage Evolution (project-internal)

> **This is the storage forward-compatibility CHECK-DOC.** Before building anything that touches where WU artifacts
> live, how they sync, multi-user/multi-machine concerns, WU/branch coupling, or new config axes, **run the
> [Self-Check](#self-check-run-this-before-building) below** and confirm the design composes with the
> materialized-git-backing-store target. The target itself is `draft-arc-backend.md` (north star); this doc is the
> interim discipline that points at it.
>
> **Status:** In-development reference — architectural *direction*, not a description of what ARC is today. Direction
> sharpened 2026-06-10 to the **git-backing-store-materialized-locally** model (see `draft-arc-backend.md`
> § The Storage Model). *Rename pending:* this file should be renamed to advertise its purpose (e.g.
> `strategy-storage-forward-compat.md`); deferred as its own reference-cascade follow-up.

**Purpose:** Forward-compat discipline for ARC's storage architecture. Defines the storage tiers ARC supports today
and is evolving toward, and the principles that keep interim work composable with the future backend tier — so
near-term WUs don't accrete tracked-`.arc/` assumptions a later migration must undo.

**Scope:** Storage tiering, the tracked-vs-materialized line, forward-compat principles, integration boundaries with
external tools, self-check triggers for plan / PRD authoring. First of three sibling check-docs: this doc owns *where
state lives*, [`strategy-knowledge-evolution.md`](strategy-knowledge-evolution.md) owns where non-procedural guidance
lives, and [`strategy-procedure-evolution.md`](strategy-procedure-evolution.md) owns how procedure executes.

**Why project-internal:** Adopter-facing strategies in `strategies/arc/` describe what ARC IS. This describes
direction for ARC's own evolution — for plan / PRD authors in this repo, not for adopters configuring ARC.

---

## Self-Check: run this before building

Consult this doc when authoring or iterating any plan / PRD / WU that touches:

- **Storage of WU artifacts** — where `meta-*`, `tasks-*`, `draft-*`, `spec-*`, status, inboxes live and how they
  sync. Especially anything changing the in-repo `.arc/` boundary.
- **Multi-user / multi-machine** — concurrency, identity, ownership, cross-developer coordination.
- **External-tool integration** — adapters, sync layers, anything bridging ARC to Linear / Jira / Notion / GitHub
  Projects. Watch authoritative-ownership boundaries especially.
- **WU identity or branch coupling** — how ARC associates WU records with git artifacts (branches, worktrees, commits).
- **New configuration axes** — new `pm.mode` values, structural settings, mode flags. Check against Principle 6
  (axis explosion).

**The question for each:** *does this design compose with the materialized-git-backing-store target as a future
canonical storage option, or does it lock in choices that would force migration?* If the latter, surface the tension
explicitly during authoring rather than deferring it.

---

## The Storage Model

### Three tiers — one substrate at three scales

The tiers are **not three designs**. They are the same **git-backing-store** substrate at increasing multiplicity:
the canonical store is a git repo (just not the project's *code* repo), materialized into a gitignored `.arc/` so
agents and humans see ordinary local files (the chezmoi/dotfile-manager shape).

| Tier | Canonical store | Scale / fit | State |
| --- | --- | --- | --- |
| **In-repo** | the code repo (tracked `.arc/`) | solo / small team, no constraints | Current |
| **Local** | a separate **private git repo** (`~/.arc-state/`) | single-user multi-machine; privacy | Planned |
| **Shared** | that repo, on a **shared private remote** (git-only) | small team, multi-writer | Planned (north star) |
| **Coordinated** | a **service fronting the same store** | high-parallelism / org authz | Provisional — deferred |

**Local *is* tier-2 of the materialized substrate; the Shared tier is that store on a shared remote with
multi-writer discipline (version-checked writes, entry-granular records, optimistic push-retry); team is the
multi-writer config, not a separate design.** This unifies what were previously framed as separate Local-mode and
backend designs — co-design them as one abstraction (see § Holistic Design). The substrate is not "the team tier"
alone: solo adopters benefit (privacy on public repos, multi-machine), multi-user adopters additionally get
concurrency discipline. The **Coordinated** tier (a self-hosted coordination service — per-record authorization,
event-log gatekeeping, richer heal contracts) is split out as its own provisional target
(`arc-coordination-service`); it influences design here only through Principle 10 below, and is deferred until
demand or contributor capacity exists. Tiers 1–3 require nothing hosted beyond git remotes.

### The line: tracked vs. materialized

| Class | Members | Tier | Configurable? |
| --- | --- | --- | --- |
| **Machinery** | `system/**` (workflows, rules, methods, templates) | tracked | No — versions with checkout (behavior pins to code) |
| **Operational state** | `meta-*`, `tasks-*`, inboxes, `STATUS`/`ROADMAP`, notes, `WORKING-MEMORY`, `SESSION-NOTES` | materialized | No — pure churn, no review value |
| **Authored design** | `draft-*`, `spec-*` | materialized (default) | **Yes — one knob** |

The boundary is **PM state-and-design (materialized) vs. PM machinery (tracked)**, drawn at the directory level so a
single artifact group doesn't split arbitrarily. The two non-storage payoffs of materializing state: **(c)** privacy
(planning artifacts not public on a public repo — *requires* a separate repo; out-of-branch-history tricks like git
notes do **not** deliver privacy) and **(d)** clean git history / PR view (planning churn leaves the code repo).

### The one knob

Authored-design storage is the only real variation. Expose exactly **one enum**, never per-artifact booleans:

```
storage.track_design_docs: none | specs | all     # default: none
```

It governs **privacy, in-git PR review, and history-browsability together** (one axis). `specs` is the costliest arm
(a WU's artifacts then span two repos — see `draft-arc-backend.md` § Operational Gotchas); consider `none | all`
only unless the middle earns its cost. Default `none`; surface only in guided init.

---

## Forward-Compat Principles

Discipline that keeps interim work composing toward the target without locking in conflicting choices.

### 1. Treat `.arc/` storage as an abstraction

Workflows ask for paths; the storage layer (in-repo, Local, or backend) provides them. Don't bake "in-repo" or
"git-tracked" assumptions into workflow logic. Most of ARC is already fine — process-task-loop, session-init, handoff
operate on filesystem paths regardless of how files got there.

**Anti-pattern:** a workflow step running `git log .arc/active/meta-{name}.md` to infer state — couples logic to
in-repo storage. The same information should come from storage-agnostic queries (meta fields, structured CLI commands).

### 2. Records are storage-agnostic; markdown is a projection (ADR-022)

Managed operational-state documents are code-owned records; the `.md` is rendered from them. Keep records free of
baked-in "git-tracked" assumptions so they lift into the backing store without reshaping — this is exactly the
materialization model (Architecture B: render/projection). Don't design a record that can only exist as a
tracked-tree file.

### 3. Mutating state uses version-checked writes

Any write to shared/materialized state carries the version it read; if canonical moved, the write is rejected and
reconciled, never silently clobbering (git's non-fast-forward rejection is the native form). This is what makes
read-staleness harmless — a stale read only causes harm via a later unchecked write. Don't design a mutation path
that blind-overwrites.

### 4. External-tool integration stays read-side or pipeline-only

Coord-probe (advisory), `pm.mode: external` (strips PM pipeline), future bidirectional sync adapters — fine.
**Extending external integration to take ownership of WU artifacts** is the move that locks in
external-tool-as-canonical and conflicts with ARC-as-canonical. External tools are integration surfaces; ARC's
canonical store stays ARC's.

### 5. WU identity stays decoupled from any single repo's branch identity

ARC tracks work units separately from branches; multi-WU-per-branch and WU-without-branch already exist. The backend
needs WUs to live independent of any one repo's branch state — don't regress.

**Anti-pattern:** inferring WU state from branch existence (e.g. "a `feat/{name}` branch implies WU `{name}` active").
Works in-repo, breaks in multi-developer backend scenarios.

### 6. Workflow logic stays mode-agnostic

Process-task-loop, session-init, handoff don't know whether storage is in-repo, Local, or backend — they operate on
the abstraction. Mode-specific logic lives in the storage layer or a few well-named lifecycle ceremonies, or is
rendered at install time. **Anti-pattern:** workflow steps branching on `pm.mode` / storage settings inline.

### 7. Team-mode is the multi-writer config of the substrate, not a separate axis

In-repo team mode (`team.enabled`, identity-marker conventions) is a current bridge. In the target, multi-user
teamwork is simply the shared/hosted (multi-writer) configuration of the same backing store — in-repo team mode on
text files carries the merge-mechanics the backend solves. Plans introducing new in-repo-team-mode mechanics earn
extra scrutiny: would the need be better served by the backend? Not a prohibition — a forward-looking design pressure.

### 8. One storage knob, not per-artifact tracking flags

Tracked-vs-materialized is fixed by class (machinery tracked, state materialized) with exactly one configurable enum
(`storage.track_design_docs`). Don't introduce per-artifact-type tracking booleans — that is the matrix ADR-020
collapsed.

### 9. Avoid axis explosion

Current axes (scaling × tracked/local × pm.mode × team.enabled) already strain the matrix. New axes earn their keep
against: "could this be a property of an existing axis, or subsumed by a future one?" The backend subsumes team-mode
(7); resist axes the backend would eventually fold in.

### 10. The store is complete without any service (service-optional)

The canonical store is a git repo, always — including under the deferred Coordinated tier. A coordination service,
if one ever exists, is a **gatekeeper and accelerator over the same ledger**: event-log records serialize into the
store repo, and a clone of the store is always the full canonical state. Any Coordinated deployment must degrade to
Shared-tier (plain git remote) semantics. **Anti-pattern:** a canonical record class that exists only in a service
database — that is the seam that generated beads' 2026 storage churn (see
`research-storage-landscape-2026-07.md`), and it forecloses the git-only tiers this substrate is built on.

---

## Holistic Design (Local ↔ Backend are one substrate)

Local mode and the backend are **the same git-backing-store substrate at different multiplicities** (single-user vs.
hosted/shared), not cousins to reconcile. Local mode was first drafted before this was recognized, so its decisions
may carry single-user assumptions — validate they generalize. When Local promotes to PRD, scope the **shared storage
abstraction** as part of that work; the backend PRD later validates and refines the same abstraction. Holistic design
at the abstraction boundary; mode-specific impl details stay each PRD's scope.

Touchpoints warranting joint attention:

- **Materialization layer** — render/projection of canonical → gitignored `.arc/` (Architecture B). Both tiers render
  identical-looking content from the same kind of source (a git repo).
- **Storage backend interface contract** — what makes something an ARC backing store: project-ID lookup, artifact
  read/write, sync state, failure handling, recovery hooks. Likely file-system semantics over a git store.
- **Sync state machine** — clean / remote-ahead / conflict across both implementations; the `arc user` family's shape
  extends to artifact storage.
- **Version-checked writes & reconcile/heal** — optimistic concurrency + a drift-heal step (cross-repo operations are
  eventual-consistency, not 2-phase-commit; see `draft-arc-backend.md` § Operational Gotchas).
- **Project-ID resolution** — pinned-ID precedence, fallback chain, migration prompts. Mostly designed in Local;
  confirm it generalizes.
- **Failure-class taxonomy** — Local's transient / push-failed / divergent vs. backend's auth-expired /
  server-unavailable / conflict-at-backend; harmonize.
- **Setup / re-clone / provisioning** — `arc init --local` idempotency + re-clone detection is reused for backend
  provisioning and the new-machine contributor flow.
- **Per-editor freshness scaffolding** — materialized files need an editor watch-setting to live-reload (Zed
  `file_scan_inclusions` confirmed; Helix gapped); ARC should scaffold `.zed`/`.vscode` settings at init.
- **Notes-history accumulation / compaction policy** — the user-notes ref today carries one full-workspace
  snapshot per save-commit (~660 and growing, never pruned; ancestor-walk load relies on the chain). Whether the
  backing store keeps full per-save history (nearest-ancestor load / time-travel) or compacts/prunes it is an open
  backing-store policy call — low-stakes today (pack-amortized), decide as the substrate's history model firms up.

This list is not exhaustive — other touchpoints surface during co-design.

---

## Relationship to Other Documents

- **`draft-arc-backend.md`** — the north-star target (tiers 2–3, git-only): full model (the line, the one knob,
  materialization A/B, concurrency-with-history, gotchas), audience fit, sequencing, blast-radius/migration audit,
  backlog compat audit.
- **`arc-coordination-service`** (provisional) — the split-out Coordinated tier: self-hosted service, auth model,
  deployment shape. Constrains this doc only via Principle 10 (service-optional).
- **`research-storage-landscape-2026-07.md`** — 2026-07 research grounding for the substrate decisions (industry
  camps, beads churn lesson, grite/OpenSpec-Stores precedents, verified concurrency-failure evidence).
- **[`strategy-knowledge-evolution.md`](strategy-knowledge-evolution.md)** /
  **[`strategy-procedure-evolution.md`](strategy-procedure-evolution.md)** — sibling check-docs (knowledge placement;
  procedural substrate). Their Principles 9 (projection-compatible) and 3 (verbs over mechanics) are the seams this
  doc's Principles 1, 2, and 6 compose with.
- **`draft-local-mode.md`** — Local mode, tier-2 of the materialized substrate; its backing-store
  mechanics generalize to the hosted (backend) case.
- **`adr-020-adopt-principle-anchored-scalable-core.md`** — the derived-vs-mutated split; mutable shared state
  (inbox drains, ordering) is the backend's canonical responsibility (→ event-log).
- **`adr-022-managed-operational-state-documents.md`** — records-canonical / markdown-projection; the interim
  notes-sync assignment is the tier-2 bridge; records lift to the backend without reshaping (Principle 2).
- **`draft-idiomatic-alignment.md`** — OKF (Open Knowledge Format) as an optional projection/interchange target off
  the record→markdown layer (Principle 2 / Architecture B). A *producer/projection*, not a native reshape; emit the
  `reference/` + project-knowledge layer, not operational churn. Forward-compat: keep the option open, don't
  foreclose it. Detail in `draft-arc-backend.md` § External Interchange — OKF Projection.
- **[`strategy-configurability-architecture.md`][config-arch]** — customization mechanisms; storage tiering interacts
  with the configurability axes (Principles 8–9 share the axis-explosion concern).

---

[config-arch]: ../arc/strategy-configurability-architecture.md
