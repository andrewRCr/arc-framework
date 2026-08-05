# Metadata: Staleness-Guard Hard-Fail Policy

| **State**     | **Owner** | **Branch**                   | **Class** | **Priority** |
| ------------- | --------- | ---------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/staleness-guard-policy` | `Heavy`   | `P1`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-staleness-guard-policy.md`
- **Task List:** `tasks-staleness-guard-policy.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 4 — verification: Tier 3 gates green and all 13 success criteria met (Task 4.1)
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Completion Notes

Delivered the policy the spec describes: the risk taxonomy and its unit test are deleted, every command reaching
the dev-build guard now refuses against a stale bundle, and the sole exception — the compaction-seed write — is an
option test at the call site rather than a classification, so it cannot grow into one. Two supports made that
affordable. The guard was confined to the built bundle, without which unconditional refusal would have converted a
pre-existing false positive into a hard failure on every source-run invocation; and a runtime-only build was added,
derived from the base `tsup` config rather than restating it, so the metafile, content-hash stamp, and kernel
schema artifact stay in the fast path by reference instead of by memory. The refusal message, the contributing
guide, the quick reference, linked-worktree provisioning, and this repository's local compaction-repair hook all
name that script, since the design degrades quietly to a ten-second remedy if any of them does not.

The drift argument confirmed itself during the work. Reconciling with the base immediately before integration
produced a modify/delete conflict on the enumeration this work removes: another work unit had swapped
`review unlock` for the new merge-lock verbs inside it — the third hand-maintenance round in that file's life,
landing while the work to delete it was in flight. Nothing was lost in resolving it toward deletion, because those
verbs refuse without being listed, which is the whole property being bought.

One deviation from the plan is worth recording. Task 3.3 added a row to the quality-gate cost table on the
instruction to record the observed pair, and verification then measured the full build at roughly twice its
recorded figure. Re-measuring the table is a separate concern from this work and is tracked as its own item,
deliberately sequenced after this lands so the two do not collide over the same section.

Verification ran Tier 3 whole and closed all thirteen success criteria. Refusal was exercised live rather than
inferred: against a genuinely stale bundle the commit-message validator the repository's own hook execs, and each
read-only command the spec named, exit 1 with the refusal. The compaction repair-and-retry path was driven end to
end from an isolated project root — the seed write proceeded under refusal, the fast build ran, the retry read
fresh, and a non-fallback recovery marker landed. Observed cost pair, warm and same session: 1.10s against 10.65s.
Review was a single CodeRabbit CLI pass before the pull request opened, returning six findings: three fixed, all
corrections to prose and docblocks describing the guard's scope, and three rejected with reasons recorded at
disposition.

---
