# Metadata: lifecycle-slug-selection

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/lifecycle-slug-selection` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-lifecycle-slug-selection.md`
- **Task List:** `tasks-lifecycle-slug-selection.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:a44fdfa261ca9d226600f6fb77c627178ff70df2cc6c3d0741f0cf1754de4f9e`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 9.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Store-backed lifecycle operations consistently select the correct record when names are reused or clash, and checkout
ownership follows the record's identity.

### Added

- `arc teardown` accepts a work-unit UID to clean up an ended holder after its name has been reused.
- Checkout markers without a bound UID report the commands that bind or release them.

### Fixed

- Lifecycle views, commands, dependency reconciliation, and creation agree with the store's ranked name lookup.
  Ambiguous names retain dependency edges with repair guidance while unrelated work can proceed.
- Completed-name reuse settles eligible dependency edges in the creating transaction; repeated reuse selects the
  latest archived work unit, and branch lookup prefers a live holder.
- Cleanup identifies an ended holder by UID and preserves another holder's checkout, local branch, and remote branch.
  Remote deletion requires a tip preserved by the retiring holder's local branch.

## Completion Notes

Delivered canonical standing-holder selection across store-backed lifecycle views, subject entry, reference re-reads,
dependency resolution, creation, and both lookup backends. Live clashes carry typed holder references and repair
guidance without blocking unrelated operations. Creation admits supported completed-name reuse and settles eligible
edges atomically. Checkout claims and holder matching follow UIDs; unbound markers offer explicit binding or release.
Ended-holder cleanup resolves by UID and guards ownership and remote-tip preservation before deleting branches.

The tracked-file lifecycle arm remains in place until the storage cutover. Dependency edges remain slug-valued, and
this work adds neither general UID operands to lifecycle commands nor marker backfill. Test doubles adopted the
public port's tagged holder responses in addition to the planned fixture updates; status output assertions stayed
intact. Review corrections tightened identity checks on replacement dependencies and cleanup offers, and restricted
held-edge suppression to metadata fields. The independent criteria pass and standard review ended at their accepted
termini after the approved corrections and their focused checks.

All task success criteria are recorded complete. Full qualification at `8e6ecc9d7` passed in GitHub Actions run
`41100680855`, covering Linux build, lint, both type checks, unit, integration, store, E2E, and portability checks.
Windows passed 2,060 cases with 95 skipped; macOS passed 2,087 with 68 skipped plus 203 native cases. The final local
convergence gate passed all 19 selected checks, with four CI-only checks supplied by hosted qualification. A fresh
independent fix check found no further findings across both standard-review repairs; the standard lane closed by
Owner acceptance after one complete pass and that incremental check. Publication changed lifecycle records only.

---
