# Metadata: store-operation-git-access

| **State** | **Owner** | **Branch** | **Class** | **Priority** |
| --------- | --------- | ---------- | --------- | ------------ |
| `Shipped` | `andrew`  | [none]     | `Heavy`   | `P1`         |

- **Cohort:** `state-storage`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-store-operation-git-access.md`
- **Task List:** `tasks-store-operation-git-access.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:19d83b81f335059ab0ebbbc49b94c8bc76391bae6b62cd49179afcc8d212f6a2`

- **Current Workflow:** [none]
- **Last Completed:** Task 5.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** —

- **PR URL:** <https://github.com/andrewRCr/arc-framework/pull/1213>
- **Completed:** 2026-10-31

## Completion Notes

Every public ref-store call now runs in one operation scope: `read`, `list`, `lookup`, `write`, `batch`, `history`,
`changes`, `version`, `pull`, `push`, `maintain`, and the migrate and remote commands. The scope shares one
`cat-file --batch` reader per bound repository and answers each configuration lookup once until an event can change it.
Readers close before every fetch, maintenance, or `gc`, at each restart, and before a store directory is renamed or
removed. Remembered answers drop on configuration writes, restarts, and nested public calls, and under a lock or lease
only answers read since it was taken are served, so push admission reads designation and transport again under its
comparison lock. A reader's missing answer from a store whose directory is gone repeats the read without the reader, so
the call fails and restarts as a per-read `cat-file` does. `history`, `changes`, and `version` now go through the read
coordinator, so an explicit `maintain` waits for them. The contract, its results, and its refusals are unchanged; the
one observable difference is that two identical lookups in one call, outside any lock, return the first answer. The ref
backend is still dark, so nothing user-facing changes.

Across the ten store files the analysis measured, process starts fell 15.9% (267,412 to 224,863) and summed case time
13.5%, from 1.7% fewer processes in `import-observation-failures` to 27.1% in `remote-delete`. `conformance-sync` fell
13.4%, just under its 14% expectation: under one comparison hold the push-URL lookup runs twice, because remembered
answers are keyed by the function that reads them, and sharing that answer would have brought it to 14.4%. Sharing state
across calls is the captured follow-on.

Two departures from the plan as first written. The import's claims check refreshes configuration before reading the
publisher, so a publisher that disappears mid-import still refuses with its source retained (A1). And two
reader-lifetime cases needed Windows and test-baseline adjustments: the nested-push import case takes its siblings'
60-second budget, and the history-fetch maintenance case turns automatic maintenance back on in its own repository after
the base's test Git configuration turned it off globally. The default-layout publishing burst's lock, stranded when a
sync deadline kills a fetch on Windows, stays with `storage-ref-hardening`.

All 11 success criteria are met. The merge gate passed 19 checks at `caaebf2ca`, and hosted run `41234990994` passed
every job there, the Windows and macOS pair included. Verification review ran its two independent passes; their findings
were fixed in 4.R and 4.R2, with one rejection. Frontline review was clean. The hosted pass found two minor findings, a
reset-drain test that could not fail and a cohort note naming a dependency edge the two work units agreed not to take,
both fixed, and that pass covers the fixed head by its recorded applicability selection. The pull request's CI then
passed at `8d413e1ad`, the head review settled on.

---
