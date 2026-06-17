# Metadata: release-ceremony-commits

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/release-ceremony-commits` | `Light`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** spec-release-ceremony-commits.md
- **Task List:** tasks-release-ceremony-commits.md

- **Last Completed:** Phase 1 (Tasks 1.1–1.2) — accept no-active-WU ceremony commits in the release wrappers
- **Next Task:** Task 2.1 — Complete verification (line ~46)
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion

---

## Release Notes Entry

ARC release wrappers now support legitimate ceremony commits and pushes that run without an active work unit,
while continuing to refuse ambiguous active-work states.

### Fixed

- `arc release commit` and `arc release push` proceed on no-active-WU ceremony paths off the protected base,
  preserving branch-protection and interlock checks and recording `wu: null` in the audit log.
- Refusal code 10 now represents multi-active-WU ambiguity explicitly as `ambiguous-active-wu`.

## Completion Notes

release-ceremony-commits shipped the wrapper-precondition fix carved out of interlock-release-refinement. The
resolver now distinguishes `resolved`, `none`, and `ambiguous`, letting the handlers accept a zero-candidate
context while preserving the real safety gates: destructive-flag refusal, branch protection, interlock
authorization, and audit logging.

Both release handlers now record a null audit work unit when no active WU exists, and both still refuse
multi-candidate ambiguity with code 10. The code-10 identifier and default refusal copy were renamed to
`ambiguous-active-wu`, so the audit label now matches the only remaining code-10 meaning. The branch-protection
path still refuses no-active-WU invocations on the protected base, keeping the accept path reachable only
off-base.

Verification covered the resolver split plus commit/push handler matrices for zero-candidate off-base proceeds,
zero-candidate protected-base refusal, multi-candidate code 10, and unchanged single-WU behavior. Local Tier 3
gates passed, PR #106 is open, CI is green, and CodeRabbit returned no findings.
