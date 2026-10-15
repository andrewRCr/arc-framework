# Worktree HEAD lock investigation — 2026-10-15

A controlled reproduction identifies `git reflog expire --all`, launched by automatic garbage collection in a
sibling worktree, holding the committing worktree's `HEAD.lock`. Both commit hooks can pass before Git encounters
that lock. Once the maintenance process finishes, the same commit succeeds on retry.

The original reported incident had no process trace or live lock-holder observation. This investigation establishes
a matching mechanism; it cannot retrospectively identify the process that held the original lock.

## Native Git evidence

The experiment used Git 2.55.0 on Linux, a temporary repository, and one linked worktree. Its ordinary Git hooks
printed `pre-commit-passed` and `commit-msg-passed`. A barrier in the latter hook controlled when the commit could
reach its ref update. The hooks started no maintenance process.

From the repository's other worktree, this command started automatic housekeeping:

```sh
git -c gc.auto=1 -c gc.autoDetach=false gc --auto
```

The low threshold applied only to the temporary command. Setup created 1,024 distinct loose blobs and amplified
the linked worktree's HEAD reflog to 100,000 copies of an actual Git-produced reset entry. This made the native
lock observable; it does not represent the original repository's reflog size or maintenance duration.

`GIT_TRACE2_EVENT` recorded the GC command starting this child:

```json
{"event":"child_start","argv":["git","reflog","expire","--all"],"child_id":1}
```

While the linked worktree's `HEAD.lock` existed, `/proc/32/fd/6` pointed to that exact file. The holder's command
line was `git reflog expire --all`, and its parent was the GC process started from the other worktree. Temporarily
stopping that observed holder with SIGSTOP kept the collision deterministic; the barrier then released the commit.

| Observation                               | Result                              |
| ----------------------------------------- | ----------------------------------- |
| Both commit hooks                         | passed                              |
| Commit with maintenance holding HEAD.lock | exit 128; `cannot lock ref 'HEAD'`  |
| Branch tip after refusal                  | unchanged                           |
| Maintenance after SIGCONT                 | exit 0; HEAD.lock removed           |
| Same staged commit retried                | exit 0; candidate content committed |

Only the observed temporary process was paused. The experiment's processes and repository were cleaned up.

## Why maintenance reaches another worktree

[Git's reflog documentation][git-reflog] states that `expire --all` processes reflogs across worktrees unless
limited with `--single-worktree`. The [Git 2.55.0 files backend][files-backend] takes the reference lock inside
`files_reflog_expire` before processing the reflog and releases it afterward. Expiring the HEAD reflog therefore
uses HEAD.lock even though the branch tip need not change.

[Git's GC documentation][git-gc] describes auto-housekeeping triggered by loose-object and pack thresholds, including
reflog maintenance. At inspection, this repository had 76,353 loose objects and 57 packs; no explicit `gc.*` or
`maintenance.*` configuration values were reported. The documented defaults are approximately 6,700 loose objects
and 50 eligible packs. These observations make automatic maintenance plausible here; they do not prove which
heuristic ran during the original incident.

The inspected hook and declared-check entry paths contained no explicit GC, maintenance, or reflog-expiry command.
The reproduction required only Git's own maintenance path and an ordinary commit in a sibling worktree.

## Outcome and recurrence evidence

The investigation supports a cross-worktree maintenance collision as a concrete explanation for the symptom.
It establishes neither an ARC hook that returns before its ref-writing child finishes nor a defect requiring an
ARC hook change. Project Git configuration and hook behavior remain unchanged.

A future original-incident attribution needs a trace covering the Git command that starts maintenance, potentially
in another worktree, plus a live observation of the process holding the exact HEAD.lock. A trace of only the refused
commit can establish its hook and ref-update sequence but can miss the sibling process responsible for the lock.
Record the holder PID, command, open file descriptor, and relevant trace events while the lock is present; a later
process listing after the lock disappears cannot recover its owner.

---

[git-reflog]: https://git-scm.com/docs/git-reflog
[files-backend]: https://github.com/git/git/blob/v2.55.0/refs/files-backend.c
[git-gc]: https://git-scm.com/docs/git-gc
