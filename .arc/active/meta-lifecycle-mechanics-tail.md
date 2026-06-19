# Metadata: lifecycle-mechanics-tail

| **State**     | **Owner** | **Branch**                      | **Class** | **Priority** |
| ------------- | --------- | ------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/lifecycle-mechanics-tail` | `Heavy`   | `P1`         |

- **Cohort:** `lifecycle-state-machine`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-mechanics-tail.md`
- **Task List:** tasks-lifecycle-mechanics-tail.md

- **Current Workflow:** [none]
- **Last Completed:** Phase 7 (Task 7.1) — verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

---

## Release Notes Entry

Lifecycle ceremonies gain CLI-owned commands for the deterministic mechanics they previously hand-ran in
workflow steps, and post-merge branch cleanup now works correctly regardless of merge strategy.

### Added

- `arc teardown` — post-merge cleanup of a shipped work unit: deletes the merged branch
  (merge-strategy-independent, never a force delete), removes its worktree, and prunes the stale
  remote-tracking ref.
- `arc integrate` — marks a work unit Active → Integrating (enters review); does not perform the merge.
- `arc finalize <create-spec | generate-tasks | verify>` — writes a planning ceremony's finalize facts
  (`Class`, `Task List`, `Next Action`) to the meta.
- `arc errand cut <slug>` — cuts the `chore/<slug>` errand branch off the base branch.
- `arc user inbox-remove <slug>` — removes a single `USER-INBOX` entry by title.
- `arc stub --cohort <slug>` — places a new stub under a cohort tree and sets its `Cohort` field.
- `arc archive --pr-url <url> --completed <date>` — records the PR URL and completion date on the
  archived meta.

### Changed

- Meta files carry `PR URL` and `Completed` as managed fields; URL fields (and `Origin`) render as
  clickable links.
- `arc start --here` on a protected base now cuts and scaffolds onto `plan/<name>` (rolling back on
  failure) instead of refusing.
- Starting a backlog work unit backfills any missing managed meta fields and reports what it added.
- Meta shape renders from code on every scaffold, so newly created metas no longer drift from the field
  model.

### Removed

- The `template-meta.md` scaffold template — meta shape now has a single source of truth in code.

### Fixed

- Post-merge teardown left a merged branch behind after squash or rebase merges; branches are now reaped
  correctly across squash, rebase, and merge-commit ships.

## Completion Notes

Migrated the judgment-free, deterministic lifecycle mechanics still hand-run in workflow markdown into
CLI-owned commands extending the shipped lifecycle executor and mutator bundle — the second migration
increment toward deterministic transition mechanics living in the CLI while workflows keep only the
judgment of whether/when to fire them.

**Shipped.** The headline is `arc teardown` with a merge-strategy-independent safety model: it authorizes
on arc-state (`completed/` presence) and protects work with a push-state containment check rather than git
reachability, fixing the bug where a squash/rebase-merged in-place branch lingered. Alongside it: `arc
integrate` (the Active → Integrating transition binding), `arc archive --pr-url --completed` (finalize
facts as managed `META_FIELDS`), the meta-shape single-source work (graduate forward-reconcile +
`template-meta.md` retirement), `arc finalize` for the planning-stage field writes, the errand legs (`arc
user inbox-remove`, `arc errand cut`), and two affordances (`arc stub --cohort`, the `arc start --here`
protected-base auto-cut). The executor gained a distinct `finalize-failed` post-side-effect status so a
recovery handler can tell retry-whole (nothing fired) from forward-only finish-the-write (side-effects
landed).

**Deviations / supersessions.** Errand teardown stays hand-run in the session-handoff finalize pass: `arc
teardown` is WU-gated (it requires `completed/` presence, which errands lack), so the errand-close path
belongs to its lifecycle owner (`errand-lattice`); only the shared teardown legs ship here. The symmetric
inbox *add* writer was deliberately not built — capture is judgment-laden and the deterministic
managed-write is a different domain's (`operational-state-docs`); the I/O-symmetry concern was routed
there rather than pulled into the lifecycle surface. The `decompose` park-exit teardown migration is
likewise out (its file is `decompose-matrix`'s to rewrite).

**Verification.** Full quality-gate suite green; all nine spec success criteria met, validated against the
codebase rather than the completion report alone. The new commands were dogfooded on this WU's own
integration — the state flip, the finalize-fact write, and the post-merge teardown all ran against
themselves, including the partial-finalize-group path hardened during review.

---
