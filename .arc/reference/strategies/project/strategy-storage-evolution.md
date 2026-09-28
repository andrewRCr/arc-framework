# Strategy: Storage Evolution (project-internal)

> **This is the storage forward-compatibility CHECK-DOC.** Before building anything that touches where operational or
> planning state lives, how it syncs or is read, concurrent writers, work-unit/branch coupling, or new configuration
> axes, **run the [Self-Check](#self-check-run-this-before-building) below** and confirm the design composes with the
> storage direction [ADR-035][adr-035] decides. This doc is the interim discipline between that decision and its
> cutover.
>
> **Status:** In-development reference — the direction is decided in [ADR-035][adr-035] (Accepted 2026-09-28) on the
> evidence in the [storage substrate analysis][storage-analysis]; it describes where ARC is going, not what ARC is
> today. Until the cutover, state still lives in tracked files on code branches and in Git notes. _Rename pending:_
> this file should be renamed to advertise its purpose (e.g. `strategy-storage-forward-compat.md`); deferred as its own
> reference-cascade follow-up.

**Purpose:** Forward-compat discipline for ARC's storage architecture. Summarizes the decided storage model and the
principles that keep interim work composable with it — so near-term work units don't accrete tracked-file,
notes-keyed, or append-only assumptions the cutover must undo.

**Scope:** The storage model, the tracked-versus-stored line, forward-compat principles, integration boundaries with
external tools, the touchpoints the storage contract designs jointly, self-check triggers for plan / PRD authoring. One
of four sibling check-docs: this doc owns _where state lives_, [`strategy-knowledge-evolution.md`][knowledge-evolution]
owns where non-procedural guidance lives, [`strategy-procedure-evolution.md`][procedure-evolution] owns how procedure
executes, and [`strategy-pm-composition-evolution.md`][pm-composition-evolution] owns how ARC composes with external PM
authorities.

**Why project-internal:** Adopter-facing strategies in `strategies/arc/` describe what ARC IS. This describes
direction for ARC's own evolution — for plan / PRD authors in this repo, not for adopters configuring ARC.

---

## Self-Check: run this before building

Consult this doc when authoring or iterating any plan / PRD / WU that touches:

- **Storage of operational or planning state** — where `meta-*`, `tasks-*`, `draft-*`, `spec-*`, notes, cohorts, the
  backlog, the completed archive, inboxes, working memory, session notes, and Candidate or transition records live,
  how they sync, and how anything reads them. Especially anything that reads state through Git (a branch, history, a
  diff, notes) or assumes a state file is tracked.
- **Concurrent writers** — any surface more than one session writes. Many sessions per identity is the normal case,
  not only teams.
- **External-tool integration** — adapters, sync layers, anything bridging ARC to Linear / Jira / Notion / GitHub
  Projects. Watch authoritative-ownership boundaries especially.
- **WU identity, branch coupling, or history** — how ARC associates WU records with Git artifacts (branches,
  worktrees, commits), and anything that relies on pushed branches never being rewritten.
- **New configuration axes** — new `pm.mode` values, structural settings, mode flags. Check against Principle 9
  (axis explosion).

**The question for each:** _does this design compose with ADR-035's model — state reached through one storage
contract, kept in Git refs, browsed through a projection — or does it lock in a tracked, notes-keyed, or append-only
choice the cutover must undo?_ If the latter, surface the tension explicitly during authoring rather than deferring it.

---

## The Storage Model

### One contract, pluggable backends

All operational and planning state is reached through one storage contract: read, version-checked write, list,
history, and sync of state families. The backend is chosen in configuration, a migrate verb moves state between
backends, and the curated set stays small enough to maintain — the Terraform backend model. Nothing above the contract
knows which backend is active; the target namespace is a backend parameter.

| Backend                            | Store                                                      | Fit                                                                          | Standing                                         |
| ---------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| **Same-repository refs** (default) | `refs/arc/*` on the code repository's remote               | Solo developers through mid-size teams; no configuration; clean code history | Decided; the storage program builds it           |
| **Backing repository**             | another repository, as custom refs or ordinary branches    | Privacy on public repositories; PR-reviewed planning; forge browsing         | Decided; the same implementation, another target |
| **Local-only**                     | this machine                                               | Evaluation, air-gapped or throwaway use                                      | Decided                                          |
| **Service**                        | a self-hosted coordination service fronting the same store | Per-record authorization; write parallelism beyond the design envelope       | Deferred — `arc-coordination-service`            |

**Privacy belongs to the backing repository.** The default gives clean code history, not privacy: refs in a public
repository are as public as its code, and so were Git notes. The earlier tier model maps onto the backends — in-repo
retires, Local becomes local-only or a personal backing repository, Shared becomes a backing repository on a shared
remote, Coordinated stays the service — and no tracked operational-state tier remains. Host coverage and the fallback
for a host that refuses custom refs are in ADR-035 item 2.

The default is designed for solo developers through small and mid-size teams, a design envelope of about ten people
running about six sessions each. Larger scale belongs to the service backend (Principle 10), and nothing in the
contract may preclude it.

### The line: tracked vs. stored

| Class                        | Members                                                                                                                                                                                           | Where                                                              | Configurable?                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------- |
| **Project machinery**        | the project's configuration, rules, method overrides, and extensions under `system/`                                                                                                              | tracked                                                            | No — versions with the checkout |
| **ARC core**                 | ARC's shipped workflows, methods, rules, and templates                                                                                                                                            | tracked today; a separate decision may resolve it from the package | No                              |
| **Constitutional documents** | strategies, ADRs, research, analysis, `PROJECT-PRD`, briefs                                                                                                                                       | tracked                                                            | No                              |
| **Operational state**        | `meta-*`, `tasks-*`, `notes-*`, `cohort-*`, the backlog, the completed archive, inboxes, working memory, session notes, and the lifecycle, delivery, and review records under `system/.internal/` | store                                                              | No — churn with no review value |
| **Authored design**          | `draft-*`, `spec-*`                                                                                                                                                                               | store; exported one-way by the knob                                | **Yes — one knob**              |
| **Derived views**            | ROADMAP, status                                                                                                                                                                                   | never stored                                                       | No                              |

The line is drawn at project-owned machinery, not at all of `system/`. The records ARC writes under
`system/.internal/` about a work unit's lifecycle, delivery, or review — Candidate records with their attestations,
integration-boundary records, transition records — are state and move to the store. Whether ARC's own core keeps being
copied into each repository or resolves from the installed package is a separate decision, so nothing may depend on
core being tracked: readers load it by its `.arc/` path.

Moving state off code branches buys clean code history and pull-request views on every backend, and deletes the
machinery that exists only because state rides code history — lifecycle exclusion, placement gating, delivery's
projection layer, and the classifiers built around them.

### The projection

The store is authoritative. A gitignored projection at the familiar paths — `.arc/active/`, `.arc/backlog/`,
`.arc/completed/`, and `.arc/user/<identity>/` — is the working copy people and agents browse and edit, as a checkout
is to the object database. Edits persist at firing points (increment close, handoff, session-init, lifecycle verbs),
merged against the store version each projected file was written from. Any artifact opens by name and is searchable
from the editor a person already uses; `arc view` and status surfaces supplement that and never replace it. How the
projection stays findable in editors and search tools is settled in ADR-035 item 6.

### The one knob

Authored-design export is the only real variation. Expose exactly **one enum**, never per-artifact booleans:

```yaml
storage.track_design_docs: none | specs | all     # default: none
```

It exports authored design into the code repository as a one-way copy, for teams that review specs alongside code;
the store stays canonical. Privacy and PR-reviewed planning are backend choices, not this knob's. `specs` is the
costliest arm (a WU's artifacts then live in two places); consider `none | all` only unless the middle earns its cost.
Default `none`; surface only in guided init.

---

## Forward-Compat Principles

Discipline that keeps interim work composing toward the decided model without locking in conflicting choices.

### 1. Treat `.arc/` storage as an abstraction

Workflows ask for paths; the storage contract and its projection provide them. Don't bake "in-repo" or "git-tracked"
assumptions into workflow logic. Most of ARC is already fine — process-task-loop, session-init, handoff operate on
filesystem paths regardless of how files got there.

**Anti-patterns:** reading state through Git — a workflow step running `git log .arc/active/meta-{name}.md`, code
reading a record with `git show <head>:<path>`, a check that depends on a pull-request diff or on a CI job that checks
out only code. After cutover each sees nothing. Inferring lifecycle state from which directory a file sits in on a
branch is the same coupling: placement becomes a projection of a lifecycle field. Read state by its projected path or
through an `arc` command.

### 2. Records are storage-agnostic; markdown is a projection (ADR-022)

Managed operational-state documents are code-owned records; the `.md` is rendered from them. The first implementation
stores each artifact group as files behind the contract, with a file-copy projection, and structured records follow
behind the same contract. Either way, keep records free of baked-in "git-tracked" assumptions so they move into the
store without reshaping. Don't design a record that can only exist as a tracked-tree file.

### 3. Mutating state uses version-checked writes

Any write to state carries the version it read. If the store moved, the write re-reads and re-applies its change to
the new head — never resubmitting the old tree, never silently clobbering. A same-entry clash lands as a typed
conflict record that keeps both sides, and the next verb that depends on that entry refuses until a resolution names
it; recency never decides. Deciding verbs re-read the store rather than a projection that may be stale. This is what
makes read-staleness harmless — a stale read only causes harm via a later unchecked write. Don't design a mutation
path that blind-overwrites or resolves by recency.

### 4. External-tool integration stays read-side or pipeline-only

Coord-probe (advisory), `pm.mode: external` (strips PM pipeline), future bidirectional sync adapters — fine.
**Extending external integration to take ownership of WU artifacts** is the move that locks in
external-tool-as-canonical and conflicts with ARC-as-canonical. External tools are integration surfaces; ARC's
canonical store stays ARC's.

### 5. WU identity stays decoupled from any single repo's branch identity

ARC tracks work units separately from branches; multi-WU-per-branch and WU-without-branch already exist. The store
keeps work units independent of any branch's state, and session locus derives from the checkout's marker and the
store — don't regress. Planning branches stay only as zero-commit local anchors for locus topology until in-flight
derivation reads the store.

**Anti-pattern:** inferring WU state from branch existence (e.g. "a `feat/{name}` branch implies WU `{name}` active").
Works while state rides branches, breaks once it doesn't.

### 6. Workflow logic stays backend-agnostic

Process-task-loop, session-init, handoff don't know which backend is active — they operate on the contract.
Backend-specific logic lives in the storage layer or a few well-named lifecycle ceremonies, or is rendered at install
time. **Anti-pattern:** workflow steps branching on `pm.mode` / storage settings inline.

### 7. Concurrency is the normal case; team mode is not a storage axis

Many sessions per identity and several identities per repository are the normal case on every backend; a team is the
same store with more writers, never a separate design. Every shared surface names its mechanism — single-writer refs
for work-unit state, entry merge for inboxes and working memory, a fractional-index rank for backlog order, three-way
merge for shared prose — and disjoint edits merge without manual action. Team mode configures ownership and
coordination conventions, not storage. Plans introducing new in-repo multi-writer mechanics for a shared surface earn
extra scrutiny: would the store's merge serve the need? Not a prohibition — a forward-looking design pressure.

### 8. One storage knob, not per-artifact tracking flags

Tracked-versus-stored is fixed by class (machinery tracked, state stored) with exactly one configurable enum
(`storage.track_design_docs`). Don't introduce per-artifact-type tracking booleans — that is the matrix ADR-020
collapsed.

### 9. Avoid axis explosion

The axes this direction leaves (backend × `pm.mode` × team mode × history policy) already strain the matrix. New axes
earn their keep against: "could this be a property of an existing axis — a backend's, say — or subsumed by a future
one?" Resist axes a backend would eventually fold in.

### 10. The store is complete without any service (service-optional)

The canonical store is Git, always — refs in the code repository or in a backing repository, including under the
deferred service backend. A coordination service, if one ever exists, is a **gatekeeper and accelerator over the same
ledger**: its records serialize into the store, and a clone of the store is always the full canonical state. Any
service deployment must degrade to plain-remote semantics. **Anti-pattern:** a canonical record class that exists
only in a service database — that is the seam that generated beads' 2026 storage churn (see
`research-storage-landscape-2026-07.md`), and it forecloses the Git-only backends this model is built on.

### 11. Nothing depends on commit reachability or append-only history

Once Git notes retire, `history.policy` becomes configurable, `rewrite-with-lease` by default and `append-only` by
choice (ADR-035 item 9). Key state to work units and identities, never to a code commit, and don't design a mechanism
whose correctness depends on pushed work-unit branches never being rewritten. **Anti-pattern:** a record looked up by
a commit SHA it expects to stay reachable — the defect that made Git-notes user state orphanable.

---

## Contract Design Touchpoints

The storage contract work unit (`storage-contract`) designs these jointly; the [analysis][storage-analysis] records
what the spikes settled and what they left open (§ 6.9, § 6.10, § 7). Each item is tagged core or deferred: 1.0 ships
the complete core for solo developers through mid-size teams.

- **Ref layout and sharding** — one ref per surface is settled; the exact surface list, how shared surfaces shard,
  and whether the local copy lives in the code repository's refs or a separate Git directory inside `.git` are open.
- **Projection behavior** — base stamps, writer-pushed refresh of every worktree on a machine, conflict display,
  adopting a file created inside a projected folder, and the projection's name (`materialize` is already a CLI verb).
- **Sync and push** — per-machine batches at coarse firing points, never per write; a lifecycle push that already
  carries a code branch takes its state refs in the same `--atomic` push where store and code share a remote; a push
  loop that retries only the refusals it can merge past. Cross-machine freshness is open.
- **Failure taxonomy** — harmonize user sync's transient / push-failed / divergent classes with push refusals and
  typed conflicts.
- **Setup and provisioning** — the fetch refspec into a remote-tracking namespace and the `.git/info/exclude` entries
  written at first projection, `arc init`'s tracked `.ignore` and printed editor setting, and the re-clone and
  new-machine flow. Project identity is trivial on the default backend; the backing repository still needs it.
- **Editor scaffolding** — the ignore strategy is settled; whether to scaffold editor settings at all is open, since
  gitignored settings do not reach spawned worktrees. Zed neither reloads an externally rewritten file nor prompts
  before saving over it, so the projection's base check is the guard.
- **History and retention** — notes history collapses to one imported snapshot. Store history stays bounded by unique
  stored paths, Git maintenance ARC runs itself, rotation to a new ref name, and completed work units' refs leaving
  the fetched namespace at archive; rotation cadence and a wider delta window are open.
- **Unsynced work outside ARC** — ARC's teardown persists first, but `git clean -x` and a plain `git worktree remove`
  delete gitignored files without a prompt. Weigh locking each spawned worktree, which makes a plain removal refuse;
  `git clean -x` has no hook, so firing-point frequency bounds its loss.
- **Windows** — renames retried over held files, a re-check that sees a same-size save, bigint file identity, line
  endings normalized on read, and Git calls batched.
- **Core from the package** — the projection takes more than one source and supports read-only copies, and the ignore
  strategy works from a path list `.arc/system/` paths can join.
- **Protection and forks** — whether protected state is an opt-in mode, and how a fork contributor runs ARC without
  upstream state; the recorded leans are opt-in protection and the local-only backend.
- **Tracked-tier delivery projection retirement** — native delivery currently reconstructs filtered member refs
  because lifecycle artifacts ride the WU's code history and the published top remains append-only. Once state leaves
  code branches and `history.policy` permits rewrite, replace that projection with ordinary interior-ref members,
  register the complete stack including the top, and permit native restacking end to end. Preserve the
  delivery-typed terminal-authorization arm and member-boundary verification; those are substrate-independent
  contracts, not tracked-tier residue.

This list is not exhaustive — other touchpoints surface during contract design.

---

## Sequencing

No prerequisite work unit lands first: the record migrations once sequenced ahead of the storage work fold into,
shrink under, or follow it (analysis § 8). The program runs as the `state-storage` cohort, which holds its stages. Two
rules bind interim work outside it: the cutover is one serialized window per repository, not an argument against
parallel work on either side; and repository-wide sweeps and anything that edits the lifecycle write path never run
alongside the contract seam (analysis § 10.2).

---

## Relationship to Other Documents

- **[ADR-035][adr-035]** — the decision: the contract, the backends, the clean split, the projection, concurrency,
  notes retirement, and the history policy. Its Consequences list the costs this direction accepts.
- **[Storage substrate analysis][storage-analysis]** — the evidence: measured cost, the spike results (§ 11), what
  stays open (§ 6.9, § 7), and the program shape (§ 10).
- **`storage-contract`** — the work unit that designs the contract and carries the touchpoints above.
- **`arc-coordination-service`** (provisional) — the deferred service backend: self-hosted service, auth model,
  deployment shape. Constrains this doc only via Principle 10 (service-optional).
- **`research-storage-landscape-2026-07.md`** — 2026-07 research grounding (industry camps, beads churn lesson,
  grite/OpenSpec-Stores precedents, verified concurrency-failure evidence).
- **[`strategy-knowledge-evolution.md`][knowledge-evolution]** /
  **[`strategy-procedure-evolution.md`][procedure-evolution]** — sibling check-docs (knowledge placement; procedural
  substrate). Their Principles 9 (projection-compatible) and 3 (verbs over mechanics) are the seams this doc's
  Principles 1, 2, and 6 compose with.
- **[`strategy-pm-composition-evolution.md`][pm-composition-evolution]** — sibling check-doc for field-level authority
  and external-PM composition; it owns the semantic boundary this doc's canonical-storage principles constrain.
- **[ADR-012][adr-012]** / **[ADR-025][adr-025]** — ADR-035 supersedes ADR-012 Part 3 (the user directory as a Git-notes
  snapshot), and ADR-025's append-only invariant gives way to the history policy once notes retire.
- **`adr-020-adopt-principle-anchored-scalable-core.md`** — the derived-vs-mutated split: derived views are never
  stored, and mutable shared state is the store's responsibility (Principle 7's per-surface mechanisms).
- **`adr-022-managed-operational-state-documents.md`** — records-canonical / markdown-projection; records move into
  the store without reshaping (Principle 2), and notes sync retires rather than bridging.
- **`draft-idiomatic-alignment.md`** — OKF (Open Knowledge Format) as an optional projection/interchange target off
  the record→markdown layer (Principle 2). A _producer/projection_, not a native reshape; emit the `reference/` +
  project-knowledge layer, not operational churn. Forward-compat: keep the option open, don't foreclose it.
- **[`strategy-configurability-architecture.md`][config-arch]** — customization mechanisms; storage backends interact
  with the configurability axes (Principles 8–9 share the axis-explosion concern).

---

[adr-035]: ../../adr/adr-035-keep-operational-state-in-repository-refs.md
[adr-012]: ../../adr/adr-012-adopt-unified-user-directory-model.md
[adr-025]: ../../adr/adr-025-concurrent-work-by-convention.md
[storage-analysis]: ../../supplemental/analysis/analysis-storage-substrate-direction.md
[knowledge-evolution]: strategy-knowledge-evolution.md
[procedure-evolution]: strategy-procedure-evolution.md
[pm-composition-evolution]: strategy-pm-composition-evolution.md
[config-arch]: ../arc/strategy-configurability-architecture.md
