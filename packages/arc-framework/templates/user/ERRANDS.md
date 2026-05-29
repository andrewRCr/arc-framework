# Errand Queue

> _Committed-but-not-yet-executed errands — atomic detours you've committed to running yourself, soon. Entries
> drain by removal when the errand ships; they are never checked in place. A staleness sweep flags entries that
> linger past a short threshold — execute, or demote to the inbox. See `strategy-work-organization.md`
> § Errand Work Class._

## Queue

<!--
Entry shape — the managed-entry grammar (the task-list parent-task shape minus numbered IDs):

### `[ ]` **<slug>**

- _Goal:_ one-line "what" — the outcome the errand delivers

- _Pointers:_ files, symbols, or context the executing session needs to start
- _Caveat:_ (optional) in-flight coordination advisory, or a rare non-default execution hint
- _Branch:_ `chore/<slug>`
- _Created:_ YYYY-MM-DD

The bold <slug> is the merge/tombstone key and the `chore/<slug>` branch name. The `[ ]` checkbox is
holding-ground — never checked in place; entries drain by removal on ship.
-->

---
