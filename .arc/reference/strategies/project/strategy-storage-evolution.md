# Strategy: Storage Evolution (project-internal)

> **Status:** In-development reference. Captures current architectural direction for ARC's storage
> tiering, not a stable description of what ARC is today. Plans and PRDs touching storage / multi-user
> / external-tool integration self-check against this document during authoring and PRD promotion.
> Direction may evolve as the `plan-arc-backend.md` target develops.

**Purpose:** Forward-compat discipline for ARC's storage architecture. Defines the storage tiers ARC
supports today and is evolving toward, and the architectural principles that keep interim work
composable with the future backend tier.

**Scope:** Storage tiering, forward-compat principles, integration boundaries with external tools,
self-check triggers for plan / PRD authoring.

**Why project-internal:** Adopter-facing strategies in `strategies/arc/` describe what ARC IS.
This document describes architectural direction for ARC's own evolution — meaningful for plan / PRD
authors working in this repo, not for adopters configuring ARC.

---

## The Three Storage Tiers

ARC supports three storage tiers, each serving a distinct adopter shape. They compose with — not
replace — each other.

| Tier        | Storage location                                | Adopter fit                                    | State      |
|-------------|-------------------------------------------------|------------------------------------------------|------------|
| **In-repo** | `.arc/` tracked in project repo                 | Solo / small team with no constraints          | Current    |
| **Local**   | `.arc/` gitignored + `~/.arc-state/{id}/` store | Solo dev who can't put `.arc/` in repo         | Planned    |
| **Backend** | ARC backend service + materialized local view   | Out-of-repo canonical storage; multi-user opt. | North star |

**The backend tier is not strictly "the team tier."** Its defining characteristic is canonical
storage outside the project repo with optional multi-user awareness. Audiences include solo dev
with public / OSS repo wanting private PM, multi-machine workflows, small teams preferring real
concurrency primitives over text-file merge mechanics, and larger teams where in-repo is a
non-starter.

See `plan-arc-backend.md` for the full target shape, audience-fit details, and the
Local-mode-is-the-bridge framing.

---

## Forward-Compat Principles

Discipline that keeps interim work composing toward the backend tier without locking in choices
that conflict with it.

### 1. Treat `.arc/` storage as an abstraction

Workflows ask for paths; the storage layer (in-repo, Local, or future backend) provides them.
Don't bake "in-repo" or "git-tracked" assumptions into workflow logic. Most of ARC is already
fine here — process-task-loop, session-init, handoff operate on filesystem paths regardless of
how files got there.

**Anti-pattern:** A workflow step that runs `git log .arc/active/status-{name}.md` to infer state.
This couples workflow logic to in-repo storage. The same information should be available through
storage-agnostic queries (status file metadata fields, structured CLI commands).

### 2. External-tool integration stays read-side or pipeline-only

Coord-probe (advisory), `pm.mode: external` (strips PM pipeline), future bidirectional sync
adapters — fine. **Extending external integration to take ownership of WU artifacts** (status,
task lists, plan docs) is the move that locks in external-tool-as-canonical and conflicts with
ARC backend as canonical.

The boundary: external tools are integration surfaces. ARC's canonical store remains ARC's,
whether that's in-repo today or the backend tier later. Mapping ARC artifact shape onto Linear /
Jira / Notion shapes is bidirectional sync, not authoritative ownership.

### 3. WU identity stays decoupled from any single repo's branch identity

ARC tracks work units separately from branches. Multi-WU-per-branch and WU-without-branch
(planning) cases already exist in the architecture. The backend tier needs WUs to live
independent of any single repo's branch state — current direction supports this; don't regress.

**Anti-pattern:** New design that infers WU state from branch existence (e.g., "a branch matching
`feat/{name}` implies WU named `{name}` is active"). Implicit coupling like this works in-repo
but breaks in backend-tier multi-developer scenarios.

### 4. Workflow logic stays mode-agnostic

Process-task-loop, session-init, handoff don't know whether storage is in-repo, Local, or
backend. They operate on the storage abstraction. Mode-specific logic lives in storage-layer
implementations and a small number of well-named lifecycle ceremonies (handoff persists; backend
sync is one ceremony among several).

**Anti-pattern:** Workflow steps that branch on `pm.mode` or `arc-config.yml` storage settings
inline. Mode-aware behavior either lives in the storage layer or is rendered out at install time
(per `plan-arc-modes.md` Mechanism A/B for mode-conditional content).

### 5. Team-mode collapses into backend-tier

In-repo team mode (`team.enabled` for shared `.arc/` content with identity-marker conventions)
is a current bridge. In a backend-tier world, multi-user teamwork moves to the backend; in-repo
team mode is not the recommended path going forward. Plans that introduce new team-mode-specific
mechanics in the in-repo tier earn extra scrutiny — would the same need be served better by
deferring to the backend tier?

This isn't a prohibition. It's a forward-looking design pressure: if a feature only makes sense
under in-repo team mode, consider whether it composes with backend tier or is bridge-only scope.

### 6. Avoid axis explosion

The current configuration axes (Lite/Full × tracked/local × pm.mode × team.enabled) already strain
the matrix. New axes earn their keep against the question: "could this be a property of an
existing axis, or subsumed by a future one?" The backend tier is expected to subsume team-mode
(see #5); other planned work should similarly resist adding axes that the backend tier would
eventually fold in.

---

## Holistic Design Touchpoints (Local ↔ Backend)

Local mode and the backend tier share substantial structural concerns. The two plans capture them
as cousins (one solo, one multi-user), but Local mode was designed before the backend tier was a
recognized target — its decisions reflect single-user assumptions that may or may not generalize.

When Local mode promotes to PRD, scope a storage-abstraction sketch as part of that work — the
minimum shared interface that Local implements and the backend tier extends. Backend tier PRD
work later validates against the same sketch and refines it as needed. Holistic design at the
abstraction boundary; mode-specific impl details remain each PRD's scope.

Touchpoints warranting joint attention:

- **Storage backend interface contract** — what makes something an ARC storage backend.
  Project-ID lookup, artifact read/write, sync state, failure handling, recovery hooks.
- **Materialization layer** — local-files-as-canonical-view rendering. Both modes render
  identical-looking `.arc/` content from different canonical sources.
- **Sync state machine** — clean / remote-ahead / conflict semantics across both implementations.
  The shape Local uses for personal notes (the `arc user` command family) extends to artifact
  storage.
- **Project ID resolution** — pinned-ID-file precedence, fallback chain, migration prompts.
  Mostly already designed in Local; validate it generalizes.
- **Failure-class taxonomy** — Local has three classes (transient / push-failed / divergent).
  Backend tier has overlapping but distinct classes (e.g., auth-expired, server-unavailable,
  conflict-at-backend); harmonize taxonomies.
- **CLI command surface** — `arcd backing` family is Local's shape. Backend tier needs a
  corresponding family; shared scaffolding where reasonable.
- **Setup / re-clone / recovery flows** — `arc init --local` is idempotent and detects re-clone.
  Backend tier setup likely follows similar shape; common scaffolding earned.

This list is not exhaustive — other touchpoints surface during the co-design pass. Captured here
as the discipline reference for plan / PRD authors working in either tier.

---

## Self-Check Triggers

Consult this strategy when authoring or iterating any plan / PRD that touches:

- **Storage of WU artifacts** — where status files, task lists, plan docs, PRDs live and how they
  sync. Especially anything proposing changes to the in-repo `.arc/` boundary.
- **Multi-user or multi-machine concerns** — concurrency, identity, ownership, cross-developer
  coordination.
- **External-tool integration** — adapters, sync layers, anything bridging ARC to Linear / Jira /
  Notion / GitHub Projects / etc. Pay special attention to authoritative-ownership boundaries.
- **WU identity or branch coupling** — how ARC associates WU records with git artifacts (branches,
  worktrees, commits).
- **New configuration axes** — adding `pm.mode` values, new structural settings, new mode flags.
  Self-check against #6 (axis explosion).

For each, the question is: **does this design compose with the backend tier as a future canonical
storage option, or does it lock in choices that would force migration?** If the latter, surface
the tension explicitly during PRD authoring rather than deferring.

---

## Relationship to Other Documents

- **`plan-arc-backend.md`** — North-star plan for the backend tier. Detailed
  motivation, audience fit, open questions, research areas, sequencing intent, and the full
  backlog compat audit.
- **`plan-arc-modes.md`** — Lite + Local modes. Local mode is the architectural
  bridge to the backend tier; its backing-store mechanics generalize to the multi-user case.
- **[`strategy-configurability-architecture.md`][config-arch]** — Customization mechanisms (config,
  extensions, methods). Storage tiering interacts with the configurability axes; #6 above
  references the same axis-explosion concern.

---

[config-arch]: ../arc/strategy-configurability-architecture.md
