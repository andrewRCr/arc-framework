# Metadata: Cutover Flip

| **State**     | **Owner** | **Branch**          | **Class** | **Priority** |
| ------------- | --------- | ------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/cutover-flip` | `Heavy`   | `P1`         |

- **Cohort:** `state-storage/storage-cutover`
- **Depends On:** [none]

- **Origin:** [internal] — the `storage-cutover` cut (2026-11-03)
- **Design:** `spec-cutover-flip.md`
- **Task List:** `tasks-cutover-flip.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:9fbdbdc5d7fbdb1862781f58dbf9daeb8de94c86fe21500368401f11370d1a1f`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 7.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

ARC now keeps a project's operational and planning state in its ref store, under `refs/arc/*` in the same repository, in
place of tracked files under `.arc/` and Git notes. Every command opens that store by default, the workflows, rules, and
methods save state through store commands where they committed it before, and each checkout works on the store's
projection at the familiar paths.

### Changed

- Work-unit, cohort, inbox, review, and lifecycle records are store writes. Starting, publishing, archiving, pausing,
  renaming, and decomposing a work unit each write the store; a commit carries tracked files only.
- Workflow steps that committed state now save it: `arc save` persists an edited record, `arc task close` closes a task
  after the commit that carries its work, or with `--state-only` where no tracked file changed, `arc handoff write`
  records session context in the work unit's meta, and `arc inbox` and `arc route` capture and place discovered work.
- Session start and recovery read state from the store, and checkout roles derive from a checkout's marker and the store
  in place of branch topology.
- Status renders from the store on demand: `arc status --project` replaces the stored `ROADMAP.md`, which is no longer
  written or read, and `--fetch` pulls remote store state first.
- Where a project archives with integration, the archive remains ahead of the merge, as one store write that moves no
  tracked file.

### Removed

- Git notes as the home of personal working files. Notes-based session start and publication are retired, and the `arc
  user` notes writers refuse once a repository's store is imported, stating that notes are retired.
- The integrity check's requirement that `ROADMAP.md` exist.

### Breaking Changes

- Repository state layout. A checkout whose `HEAD` tracks ARC state under `.arc/active/`, `.arc/backlog/`,
  `.arc/completed/`, `.arc/system/.internal/candidates/`, or `.arc/system/.internal/transitions/` is refused,
  recoverably, by every command that opens the store, with the steps that convert it. To migrate, import the tracked
  state once with the build of ARC that wrote it (`arc store migrate --import`); then, on each branch, delete the
  tracked state, commit, and merge the updated base.

## Completion Notes

Delivered the change that makes the ref backend every command's default, with everything that has to be true at the same
moment. Store selection builds the ref backend unless the window's override is set, and a tree that still tracks state
meets a recoverable refusal naming its conversion steps, with hooks skipping projection while it holds. The store paths
the earlier units left for this one are complete: sync's state-first legs, the capture gates over `arc inbox`, direct
routing into inbound records, archival and rename as store writes, pause as one lifecycle write, Errands on UID
work-item refs, and a write fence that refuses a change prepared against a store that has since moved. Every workflow,
rule, method, skill, and brief in the shipped text, its strategies apart, is rewritten onto the store's verbs, in the
package source and synced; notes-based session start and publication are retired; the stored `ROADMAP.md` has no writer
or reader left; and ADR-035 carries dated amendments to items 2 and 8. The change measures 937 files against `main`.
What it makes inert stays in place for the units that follow: the in-repo store, notes sync, the old decomposition
machine, and the verbs and hook checks that now refuse or do nothing.

The design was amended forward 42 times. Most rows record what implementation or the rehearsal showed a section had left
open; the ones that change what ships or how the window runs are these. A26 keeps the archive ahead of the merge under
`with-integration`. A28 lands a test-only change on `main` ahead of the window so a branch's deletion commit passes its
hooks. A32 admits a `lineage/` write naming a UID no owner holds, and A33 has a removing self-teardown on Windows leave
a stamped husk; each replaces a success criterion. A35 and A36 name residuals verification found, nine corner cases and
six review lifecycle cases that still select the in-repo store, each captured for a later unit. A37, A41, and A42 come
from pre-publication review: seven checks the window gains, what a result other than the expected one stops at each, and
notes retiring over a checkout left to its own session once it is accepted by name. A39 lets one commit made after the
last rehearsal, the commit validator's task-list lookup, rest on a targeted run in that rehearsal's flipped copy. This
unit also lands through the window in place of the ordinary archive, checkpoint, and merge steps, since the import reads
its records at its branch tip and the store archives it only after the merge.

The success-criteria record holds 35 lines: 28 met, 16 of them after a deviation note, and 7 superseded, two replaced by
A32 and A33 and five deferred to the window, which alone can show them: the window's completion, the register rows'
closure, the notes refs' retirement, the first Errand and work unit landed afterwards, and the added checks' record.
Verification ran seven scoped verifiers and a whole-change pass with a reproduction pass over their findings.
Pre-publication review ran one complete standard pass, read in chunks by 45 reviewers, and one fix check, then closed by
Owner acceptance, with frontline skipped by direction for the change's size; of 41 findings verified at major, twelve
were fixed and 29 deferred with a named home, and the fix check's four corrections are text in the window's procedure.
The dress rehearsal ran fourteen times on copies of this repository. The last, at `6ce9ca565c`, passed the whole window
with its six perturbations, from the copy through the import, the switch, each branch's and checkout's conversion,
notes' retirement, and the close; one checkout, whose merge of the flipped `main` conflicts in its own code, was left to
its session there and is authorized to be left the same way in the window. The fence harness, re-run at `b3280a2cb5`,
refused 337 of 354 interleaved writes and admitted 17, none failing, as that rehearsal's had. The forced merge gate
passed 22 checks at `b9100e2e57`, and hosted run `46096533340` passed every job it ran there, Windows and macOS
included; run `46059892131` passed over the tree with tracked state deleted, at `982c5fadb4`. The import, the deletion
commit, the merge, the archive, the register closures, and notes' retirement remain the window's.

---
