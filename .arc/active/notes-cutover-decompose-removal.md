# Notes: Cutover Decompose Removal

## Prerequisite evidence pointers

| Contract in the specification                                                       | Evidence location                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Default store selects off-branch state.                                             | Task 3.3 - `tasks-cutover-flip.md`; `createStore` and `handleDecompose`.        |
| Surviving test callers use the ref backend or identify their old-substrate subject. | Tasks 3.4.b and 3.6 - `tasks-cutover-flip.md`; classified fixtures and callers. |
| Help describes store decomposition.                                                 | Task 4.2.c - `tasks-cutover-flip.md`; the `arc decompose` option descriptions.  |
| A representative cut passed on a flipped repository copy.                           | Task 6.4.e - `tasks-cutover-flip.md`; § 9.9 of `spec-cutover-flip.md`.          |

The workflow rewrite is recorded under Task 5.7 - `tasks-cutover-flip.md`. Shared deletion coordination is in
`cohort-storage-cutover.md` § Coordination; the exposed-option boundary is also recorded in
`spec-cutover-tracked-state-removal.md` § Non-Goals and § 1.

---
