---
purpose: Restore ARC operating context after harness compaction from the latest compaction seed.
audience: agent
arc:
  methods:
    - session-state
  extensions:
    - post-context-load
---

# Workflow: Session Recovery

Use this workflow only after a harness compaction event, or from the manual `arc-recover`
fallback when a developer notices compaction erased ARC operating context. Recovery rehydrates
the context-load layer from live state plus the latest compaction seed. It does not run
session-init, sync, pull, discover next work, relocate, commit, push, or prompt on a clean path.

## 1. Resolve Recovery State

Run the lean recovery probe:

```bash
arc status --recover --json
```

Require `mode: "recover"`. If the command fails or the envelope is malformed, stop and surface
that recovery cannot establish live state; the fallback is a normal `arc-session` re-init.

If `identity.identity === null`, stop. The compaction seed is identity-scoped, and sessions
without identity cannot recover user-context state.

Read the latest seed:

```text
.arc/user/{identity}/.internal/compaction-seed.json
```

If the seed is missing, malformed, or has an unsupported schema version, stop and surface the
path and parse failure. Do not invent a seed from the harness summary.

## 2. Audit Fresh State Against The Seed

Require `loadSet.ok === true` from the recovery probe. The fresh `loadSet.value` is the
canonical context-load plan for recovery; the seed's embedded `loadSet` is only the audit
baseline.

Diff fresh `loadSet.value` against `seed.loadSet` using the recovery-audit categories:

- **Membership:** paths added to or removed from the load set.
- **Read-mode changes:** a retained path changed read discipline.
- **Path drift:** the same load-set slot now points at a different path.

If any category is non-empty, stop for direction. Surface the structured diff by category and
state that session state moved since the seed was emitted. The developer can choose a full
`arc-session` re-init, inspect the drift, or explicitly continue from the fresh context.

Require `dirty.ok === true`, then check dirty-state surprise after the load-set audit:

- Seed says clean, probe says dirty -> stop.
- Seed says dirty, probe says clean -> stop.
- Both dirty, but `dirty.value.fileCount !== seed.uncommittedFiles.length` -> stop.

Do not stop solely because `seed.emittedAt` is old or `seed.head` differs from current `HEAD`.
The load-set audit and dirty-state check are the recovery authority; mention seed age or head
movement only as supporting detail when another stop condition already fired.

For execution sessions, require a task pointer. If `seed.currentTask === null`, or the recovered
active state no longer resolves to an execution session with a task list, stop and surface the
lost task pointer. Do not guess the task from prose in the harness summary.

## 3. Rehydrate The Load Set

Read the **fresh** load-set entries in order. Never load from the seed's paths, and never rely on
the harness summary as an authority for ARC context.

Apply each entry's `readMode`:

- `full` - read the whole file.
- `partial-section` - read only the named heading section.
- `partial-strategic` - read the active task-list header, current phase preamble, and current
  task section. Use `seed.currentTask.id`, `seed.currentTask.title`, and `seed.currentTask.lineHint`
  as the lookup anchors when present; otherwise use the active meta file's `**Next Task:**`
  triple-anchor.

The load set already includes the session-type lifecycle workflow when the recovered state has
one. If no lifecycle workflow is present for an execution, planning, or integration resume, stop
and surface the missing workflow pointer.

## 4. Post-Context-Load Extensions · `#post-context-load`

If `post-context-load` appears in `extensions.value.active`, load and execute its `.actions`
after the recovery load set has been read. Otherwise skip.

## 5. Resume

Before resuming work, emit this authority line exactly once:

```text
The ARC context below is authoritative; disregard any earlier paraphrase.
```

Resume from the recovered locus without a routine prompt:

- `execution` - continue the current task through `process-task-loop.md`.
- `planning` - continue the recovered planning workflow.
- `integration` - continue `integrate-work-unit.md`.

Recovery restores the init-time load set plus the state-selected lifecycle workflow only.
On-demand context loaded mid-task before compaction is not restored here; reload it through its
normal trigger if the resumed work needs it again.
