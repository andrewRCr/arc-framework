---
purpose: Inspect one planning source through the canonical read-only decomposition preflight.
audience: agent
---

# Workflow: Decompose Work Unit

## Preconditions

- The origin is a supported Planning source or backlog planning stub.
- Destination and dependency intent is already settled.
- The current checkout can resolve the configured base and the source ref locally.

## 1. Emit the exact preflight

Run machine mode before interactive prose:

```bash
arc decompose <origin> --preflight > <scratch-starter-map>
```

The command pins one local source ref and tree, infers the planning profile, inventories exact source units and
dependency edges, and writes one canonical starter map to stdout. Diagnostics go to stderr.

On refusal, stop. Do not fetch, substitute a working-tree file, select another branch, or hand-author missing
machine fields.

## 2. Inspect without authoring

The starter map is read-only evidence for evaluating the proposed cut. It grants no mutation, finalization,
publication, landing, or cleanup authority.

Do not author a completed map or run a repository transition from this workflow. Do not create or modify a branch,
worktree, retirement record, lifecycle artifact, dependency edge, or project projection.

## Completion

Report the authenticated source identity, planning profile, inventory shape, and any refusal. Preserve the
untracked starter map only while it is useful for inspection.
