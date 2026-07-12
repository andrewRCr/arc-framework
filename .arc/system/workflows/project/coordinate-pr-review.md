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

## 1. Run the Typed Action Loop

Resolve `openedChangeRequest` through the host adapter into the exact repository id, PR number, change-request id,
and current full head required by the repository launchers. Keep that scope unchanged for one loop iteration:

1. Run `review-gate:next-action` and parse its JSON contract. Never infer an action from summary prose.
2. On `needs-user-trigger`, surface the provider, generation, command, and required actor. After authorization, run
   `review-gate:perform-action -- <request-key> <generation>`; it revalidates actor and canonical state before the
   trigger and dispatches exact-PR/head reconciliation afterward.
3. On `waiting`, or after a performed action, run `review-gate:await -- review --head <full-head>`. An exempt lane
   uses `ci` instead. The watcher emits typed transition JSON and one terminal/attention result without model work.
4. On `terminal: success`, continue to § 4. On `attention` or an await failure/attention result, enter § 2. On
   `stale-head`, recompose the full `openedChangeRequest` and restart. On timeout, re-read `next-action` before
   deciding whether to wait again. Authentication, host, or malformed-projection results stop for operator repair.

This is the `next-action` → `perform-action` → `await` → canonical re-entry loop. It is idempotent from both
`post-pr-open` and final `pre-merge`; no arm bypasses the controller.

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

After a head update, recompose the exact scope and return to § 1. The controller decides whether full or incremental
coverage is admissible and exposes any actor-owned trigger through `next-action`; never synthesize a command from
provider state or prose. Run the resulting typed action/wait loop, then re-enter from canonical state. A changed head
invalidates the loop scope before any action or settlement decision.

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
