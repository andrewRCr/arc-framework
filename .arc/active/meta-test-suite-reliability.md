# Metadata: test-suite-reliability

| **State**     | **Owner** | **Branch**                   | **Class** | **Priority** |
| ------------- | --------- | ---------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `fix/test-suite-reliability` | `Heavy`   | `P3`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-test-suite-reliability.md`
- **Task List:** `tasks-test-suite-reliability.md`
- **Review Rubric:** [none]
- **Promotion Receipt:** `errand-v1/hosted-test-reliability/ce773f5407a570d786450435b6657f92`
- **Candidate:** `sha256:6f5798b2bd5c03702911cfdb20822ca888c82bdd6df2960fd4413644c3ba605e`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 11.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Noninteractive CLI commands apply their prompt policies consistently across supplied answers, safe defaults and
requests for authority.

### Fixed

- Installer and release-setup prompts preserve declared noninteractive defaults and refusals, honor explicit answers,
  and handle cancellation consistently.

## Completion Notes

The suite now separates decision proofs from native-tooling integration, retains real runs for distinct outcomes,
and enforces unit process boundaries through native completion and teardown metadata. Hermetic fixtures and build
coordination remove measured races and repeated preparation work. The ordinary local gate uses a half-parallelism
policy with an eight-worker ceiling, while required CI retains the heavy E2E and portability lanes. Prompting
commands execute shared declared policy, with declaration-identity discovery, explicit refusal for unsupported use,
and native lint coverage preserving raw-prompt owners and composed restrictions.

The implementation follows forward amendments A1 through A16. These preserve the frozen baseline and failed
attempts, qualify limited E2E baseline sampling, record native layout and fixture adjustments, size only approved
named deadlines, and preserve all historical cost captures without treating them as measurements of later
corrections. No acceptance bar or budget was relaxed. Thirty-two immutable criteria finish with twenty-seven met,
five superseded and none unresolved; original statements and evidence bindings remain intact.

Final code head `c82d581c4` passes all local quality gates, both type programs, the qualified declaration build and
16,865 routine cases in 228.19 seconds at eight workers. Hosted confirmation 37721286878 passes all seventeen
applicable jobs on attempt one, including Windows and macOS. Native reports retain 13,738 cases strictly below half
their effective timeouts, 13,655 off-allowlist cases with zero launches, no missing metadata and ten unchanged-budget
comparisons within bounds. These confirmations supplement the preserved historical measurements rather than
replacing their samples or medians.

Six complete delegated review passes included contract-cohesive chunks, independent seam review and
fresh aggregation. Their approved responses are performed. The final bounded literal computed-key correction has
fail-first native regressions and full verification; it receives no seventh independent review. The Owner explicitly
accepts review termination for that corrected Candidate and later lifecycle composition, so the terminal review
state is accepted risk rather than a clean or converged verdict. Primary-only empirical criteria verification is the
approved choice.

Integration uses the singleton manual-cadence bridge: completion content lands with the Integrating meta under active,
archival follows in a separate pull request after merge, and branch teardown waits for archival. The review-scope
reduction defect is captured separately as execute-bound queue position one for another session. Exact-head merge
authorization remains the integration interlock.

---
