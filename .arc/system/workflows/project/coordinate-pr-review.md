---
purpose: Coordinate one explicit open pull request through controller admission, findings, coverage, and settlement.
audience: agent
arc:
  methods:
    - review-triage
---

# Workflow: Coordinate PR Review

Operate on one caller-supplied `openedChangeRequest = { repositoryRef, hostRef, headSha }`. Require an explicit
`hostRef`; never infer all PRs associated with a work unit or branch. Read the normalized controller decision and
current change-set projection before acting. Provider-specific requests and observations stay behind controller
commands and adapter summaries.

## 1. Enter From Canonical State

Read the current decision for `hostRef` and follow exactly one arm:

- **Required:** Observe a generation-zero automatic admission only when the controller reports it eligible. For a
  checkpoint-only or later required head, recommend an explicit refresh; do not spend without authorization.
- **Recommended:** Surface the reason, expected coverage, and capacity provenance; ask before raising the work.
- **Exempt:** Return successfully without provider work. An authorized operator may still use explicit `require`.

The same decision may be entered from `post-pr-open` and final `pre-merge-review`; unchanged state is a no-op.

## 2. Coordinate Findings

Fetch the controller's normalized findings and source-scoped immutable ids. Triage each finding with
[`review-triage`][review-triage], surface dispositions, and apply only approved fixes. Run affected quality gates,
commit atomically with a `(code review)` context footer, and push.

After a head update, re-read canonical state. Recommend full coverage when the whole diff or source changed;
recommend incremental coverage only from the controller-reported reviewed chain head. On approval, submit the
structured controller command rather than a provider command:

```text
/review-gate refresh <requirement> <source|auto> <full|incremental> <reason>
```

Wait for the external review completion signal without polling, then re-enter from canonical controller state.

## 3. Close Findings With Authority

Treat a finding as closed only when the provider confirms closure, or after an authorized dismissal receipt:

```text
/review-gate dismiss <requirement> <source> <finding-id> <reason>
```

Only after that authority is durable may the host adapter resolve the corresponding thread. A bare host-thread
mutation, provider ignore command, or direct provider review request cannot close or satisfy a requirement. Keep
defer/reject rationale concise and verify every closure against the current change set.

## 4. Return Settled State

Re-read the current head, requirements, findings, native conversations, and check projection. Return only when every
obligation is satisfied, explicitly waived/dismissed with authority, or remains non-blocking recommended work, and no
blocking finding or unresolved required conversation remains. If the head changes, restart at § 1.

---

[review-triage]: ../../methods/review-triage.md
