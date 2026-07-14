# Spec (`brief`): burn-in-probe-b

- **Origin:** [internal] - purpose-built burn-in fixture for finalize-parallelism wave 1 (disposable).

---

`burn-in-probe-b` is the second disposable Wave 1 doc-only burn-in fixture for `finalize-parallelism`: it exists
to exercise the spawned-worktree lifecycle beside a sibling fixture and the FP observer without putting real
backlog work at risk. Its scope is limited to planning, executing, and integrating a minimal documentation /
evidence WU in this worktree, centered on authoring `notes-burn-in-probe-b.md` as the evidence log; it does not
change ARC framework behavior, resolve `finalize-parallelism` design questions, or broaden the burn-in matrix. It
succeeds when the fixture completes at least one handoff-to-resume cycle and produces an evidence log showing
spawned-worktree boot, notes save/load convergence, ROADMAP/base contention, integration ordering, and clean
archival/worktree cleanup were exercised or explicitly recorded as not observed.

**Success Criteria:** After at least one handoff-to-resume cycle, `notes-burn-in-probe-b.md` records evidence for
spawned-worktree boot, notes save/load convergence, ROADMAP/base contention, integration ordering, and clean
archival/worktree cleanup, with any condition not observed called out explicitly.
