# Draft: Framework Core from the Package

- **Origin:** [internal] — `USER-INBOX § Work Unit` capture from the storage-program design discussion
  (2026-09-25; direction agreed with the Owner), stubbed at the `state-storage` re-cut (2026-09-28).
- **Purpose:** Read ARC's framework core — its workflows, ARC strategies, templates, and hooks — from the installed
  package at a pinned version, instead of copying it into every repository, so a tooling update stops dirtying the
  working tree with framework prose.
- **Planning posture:** `P2`; `Class` settles at planning. Runs after `storage-cutover` and reuses its projection;
  `storage-contract` tags it core or deferred.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending integration at this work unit's next planning iteration._

### `[ ]` **Add generated editor documents to the projection's path list; consolidate the managed `.gitignore` lists**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-10-09).

- _Shapes:_ the ignore strategy's path list, which the storage program keeps open for this work unit.

- _Observation (editor documents):_ `schema-introspection-layer` generates per-schema editor documents at
  `.arc/system/.internal/schemas/<id>.schema.json`: derived, never stored, written by one writer at `arc init`,
  `arc update`, `arc join`, and every ARC-owned worktree provisioning site, refreshed by `arc schema install`, with no
  `init-recipe.json` entry. The writer ignores the directory per clone through the shared `info/exclude`, as
  `ensureWorktreeMarkerIgnored` does, and leaves the tracked `.gitignore` block untouched.

- _Observation (`.gitignore` block):_ the managed block is written from five identical hand-copied entry lists
  (`init.ts`, `update.ts`, `reconfigure.ts`, and twice in `join.ts`). No layout address covers today's entries
  (`pristine.json`, `worktree-marker.json`, the `.arc/user/*/` glob, harness skill paths), and the ARC repository's
  own block, which no command maintains there, already lacks `worktree-marker.json`.

- _Approach:_ join the schemas directory to the projection's path list, ignored per clone as the storage direction
  sets, and derive the block's entries from one list.

- _Captured during:_ `schema-introspection-layer` draft close, 2026-10-07.

---

## Problem

`arc update` rewrites up to 103 Framework-class files that `strategy-file-classification` says never to edit, and
three-way merges 45 Configurable ones, so a tooling update dirties the working tree and needs a commit of framework
prose. Tools that copy themselves in share the problem: Spec Kit's upgrade guide says to commit first, back up a
customized constitution, and re-run `init --force`. The usual shape is a committed version pin with the tool's own
content outside the repository, and customization tracked as overlays (ESLint `extends`, Hugo theme overrides).

## Approach

Three homes, by lifecycle:

- **Framework core** is read from the installed package at the tracked manifest's `framework_version`, which becomes
  the team's pin, and materialized as gitignored copies at the familiar `.arc/` paths. An update becomes a one-line
  commit, and the CLI warns on a version mismatch.
- **Project customization** stays tracked: project strategies, ADRs, domain rules, project workflows, overrides, and
  config. Each Configurable file splits so the project's part is its own tracked overlay over the package default —
  `knowledge-architecture`'s "the framework ships the slot, the project fills it".
- **State** lives in the store.

Scaffolding verbs (`arc new strategy|rule|adr|workflow|override`) write from the template and register the new file,
whatever its destination. A local edit to a core copy is detected and pointed at the override surface, never
silently overwritten. Where a file comes from derives from the manifest's classification, never from a new per-file
field (`strategy-knowledge-evolution` Principle 4). Clone-only environments, such as cloud agents and CI, then need
ARC installed to see the core, as tests need `npm install`, and `AGENTS.md` says how.

## Constraints

- **Browsability (Owner).** Opening `.arc/` shows ARC core, project files, and state together, and core files stay
  whole, human-readable documents rather than opaque package internals (`strategy-knowledge-evolution` Principles 8
  and 9).
- **What the storage program keeps open for this work unit** (`storage-contract`'s core-from-package constraints):
  the projection takes more than one source — the store now, the package later — and supports read-only copies; the
  ignore strategy works from a path list that `.arc/system/` paths can join; readers load core by its `.arc/` path,
  never by whether it is tracked; and the tracked line is drawn at project-owned machinery, not at all of `system/`.

## Coordination

- **`storage-contract` and `storage-projection`** — this work unit reuses the projection they define and build.
  `storage-contract` also keeps the everything-untracked option, absorbed from `local-mode`, for repositories where
  ARC files cannot be committed.
- **`package-project-development-sync`** — this ends most of this repository's package-to-`.arc/` sync burden.

## Reading inputs

- `analysis-storage-substrate-direction.md` § 6.10 (Requirements the spikes set — forward compatibility with
  resolving framework core from the pinned package).
- `strategy-storage-evolution.md` § Contract Design Touchpoints (Core from the package).

---
