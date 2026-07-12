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
commands and adapter summaries; controller-normalized findings and provider-native conversations have distinct
closure authority.

## 1. Enter From Canonical State

Read the current decision for `hostRef` and follow exactly one arm:

- **Required:** Observe a generation-zero automatic admission only when the controller reports it eligible. For a
  checkpoint-only or later required head, recommend an explicit refresh; do not spend without authorization.
- **Recommended:** Surface the reason, expected coverage, and capacity provenance; ask before raising the work.
- **Exempt:** Return successfully without provider work. An authorized operator may still use explicit `require`.

The same decision may be entered from `post-pr-open` and final `pre-merge`; unchanged state is a no-op.

## 2. Coordinate Findings

Fetch controller-normalized findings with source-scoped immutable ids and provider-native conversations with their
current decisive review state. Triage both paths with [`review-triage`][review-triage], then keep their authority
separate:

- **Controller-normalized findings:** Surface dispositions and apply only approved fixes. Their immutable ids may
  receive a controller dismissal after authorization.
- **Provider-native conversations:** Surface dispositions and apply only approved fixes, but never mint a controller
  finding or dismissal. `CHANGES_REQUESTED` remains blocking; closure comes from the provider's decisive state and
  current conversation status. Completion-check success only wakes a canonical re-read; it never closes or cleans a
  conversation.

Run affected quality gates and commit atomically with a `(code review)` context footer. For a FIX, record the authorized
`begin-fix` transition before invoking the guard. Resolve the canonical remote PR head as `ARC_HEAD_SHA` and the
outgoing local head as `<outgoing-head-sha>`, then run
`npm run review-gate:assert-head-mutable -- <outgoing-head-sha> [<begin-fix-receipt-hash>]`. Stop on refusal; only then
run any active pre-push review action and push.

After a head update, re-read canonical state. Recommend full coverage when the whole diff or source changed;
recommend incremental coverage only from the controller-reported reviewed chain head. On approval, submit the
structured controller command rather than a provider command:

```text
/review-gate refresh <requirement> <source|auto> <full|incremental> <reason>
```

Wait for the external review completion signal without polling, then re-enter from canonical controller state.

## 3. Close Findings With Authority

Only controller-normalized findings may use `/review-gate dismiss`. Treat one as closed only when the provider
confirms closure, or after an authorized dismissal receipt:

```text
/review-gate dismiss <requirement> <source> <finding-id> <reason>
```

Only after that authority is durable may the host adapter resolve the corresponding thread. A bare host-thread
mutation, provider ignore command, or direct provider review request cannot close or satisfy a requirement. Keep
defer/reject rationale concise and verify every closure against the current change set.

A provider-native conversation closes only when its provider's current decisive state and conversation status confirm
it. Never mint a controller finding or dismissal for a native artifact the provider boundary cannot model.

## 4. Return Settled State

Re-read the current head, requirements, findings, native conversations, and check projection. Return only when every
obligation is satisfied, explicitly waived/dismissed with authority, or remains non-blocking recommended work, and no
blocking finding or unresolved required conversation remains. A valid lifecycle-tail projection that is already
settled returns without requesting or recommending a refresh. An invalid or ambiguous tail returns to ordinary
current-head coordination. If the head changes, restart at § 1.

---

[review-triage]: ../../methods/review-triage.md
