# Spec (`brief`): burn-in-probe-a

- **Origin:** [internal] — purpose-built burn-in fixture for finalize-parallelism wave 1 (disposable).

---

`burn-in-probe-a` is a sacrificial doc-only Wave 1 fixture for `finalize-parallelism`: it runs through the ordinary
ARC planning, execution, handoff/resume, and integration lifecycle from a spawned worktree so the parallel-worktree
path is exercised with low-stakes work. Its scope is evidence capture only: it should not change ARC production
behavior, repair unrelated notes/status bugs, or invent new parallelism policy; findings route back to the owning
work unit or capture surface. It succeeds when this work unit produces a small evidence artifact showing that the
spawned session booted from seeded `SESSION-NOTES`, saved and loaded notes at first handoff, re-probed cleanly
after base updates, exercised ROADMAP/integration coordination beside sibling work, and reached integration with no
false notes-drift report or silent lifecycle/state contention.

**Success Criteria:** `notes-burn-in-probe-a.md` records the completed lifecycle evidence: seeded `SESSION-NOTES`
boot, first-handoff notes save/load, clean post-merge reprobe, sibling coordination during integration, and no
false notes drift or silent state contention.
