---
purpose: Coordinate one explicit open pull request through controller admission, findings, coverage, and settlement.
audience: agent
arc:
  methods:
    - review-response
---

# Workflow: Coordinate PR Review

Operate on one caller-supplied `openedChangeRequest = { repositoryRef, hostRef, headSha }`. Require an explicit
`hostRef`; never infer all PRs associated with a work unit or branch. Read the normalized controller decision and
current change-set projection before acting. Provider-specific requests and observations stay behind controller
commands and adapter summaries; controller-normalized findings and provider-native conversations have distinct
closure authority.

## 1. Run the Typed Action Loop

Pass the explicit `hostRef` to each repository launcher; the launchers resolve and validate the remaining canonical
coordinates. Bind one loop iteration to the canonical target and head, policy identity, lifecycle-tail identity, and
provider-event identity. An approved fix, base merge, or change to any bound identity invalidates that scope: re-read
the canonical target and routing result before another action.

1. Run `npm run review-gate:next-action -- <hostRef>` and parse its JSON contract. Never infer an action from summary
   prose.
2. On `needs-user-trigger`, surface the provider, generation, command, and required actor. After authorization, run
   `npm run review-gate:perform-action -- <hostRef> <request-key> <generation>`; it revalidates actor and canonical
   state before the trigger and dispatches exact-PR/head reconciliation afterward.
3. On `waiting`, or after a performed action, run
   `npm run review-gate:await -- <hostRef> review --head <full-head>`. An exempt lane uses `ci` instead. The watcher
   emits typed transition JSON and one terminal/attention result without model work.
4. On `terminal: success`, continue to § 4. On `attention` or an await failure/attention result, enter § 2. On
   `stale-head`, recompose the full `openedChangeRequest` and restart. On timeout, re-read `next-action` before
   deciding whether to wait again. Authentication, host, or malformed-projection results stop for operator repair.

Dispatch the current normalized routing/controller arm without weakening it:

- `stale` — discard the loop scope and recompose from canonical state.
- `exempt` — skip review request mechanics and await current-head CI readiness.
- `recommended` — keep an unavailable or failed review visible but non-blocking; coordinate the admitted source when
  one is selected.
- `required` — block until the exact requirement is satisfied or an authoritative decision changes it.
- `attention` — enter § 2 for findings; otherwise stop on the typed operator-repair reason.

Treat any carried lifecycle or integration state as a bound composition basis. An approved substantive fix or an
interacting reconcile must discard the composition basis. Carry only when a typed applicability proof establishes that
the reviewed work-unit delta is unchanged; otherwise recompose it from the current target, policy, and source state.

This is the `next-action` → `perform-action` → `await` → canonical re-entry loop. It is idempotent from both
`post-pr-open` and final `pre-merge`; no arm bypasses the controller.

## 2. Coordinate Findings Through `review-response`

Fetch controller-normalized findings and provider-native conversations, retaining source-scoped immutable ids and
current decisive review state. Compose the [`review-response` method][review-response] input from the exact current
target, effective routing result, normalized findings, disposition/approval state, verification and persistence
evidence, and opaque adapter capabilities. Controller findings carry a controller receipt handle plus their available
reply and thread-state handles; provider conversations carry provider reply, thread-state, and decisive-review handles.
Every normalized finding retains its explicit FIX, DEFER, or REJECT disposition and immutable source locus. For
provider-native conversations, `CHANGES_REQUESTED` remains blocking.
Completion-check success only wakes a canonical re-read and never closes a conversation. Execute only the returned
planner state:

- `awaiting-approval` — verify every finding against source, present the complete disposition set, and obtain exact
  approval. Do not mutate the target.
- `ready-to-fix` — apply only the approved fix set as one bounded increment and run affected quality gates. Return
  the candidate target and verification references without persisting it.
- `ready-to-persist` — record the authorized `begin-fix` transition, then run
  `npm run review-gate:assert-head-mutable -- <hostRef> HEAD <begin-fix-receipt-hash>`. The command revalidates the
  current exact head and actor-owned authorization. Stop on refusal; otherwise commit atomically with a `(code
  review)` context footer, run any active pre-push review action, and push.
- `ready-to-close` — pass only the returned closure work to § 3's authority-specific adapters.
- `reroute` — recompose the exact target and return it to routing before another action.
- `blocked` — stop with the planner's next action; do not infer a missing capability or transition.

After a head update, recompose the exact scope and return to § 1. The controller decides whether full or incremental
coverage is admissible and exposes any actor-owned trigger through `next-action`; never synthesize a command from
provider state or prose. Run the resulting typed action/wait loop, then re-enter from canonical state.

## 3. Close Findings With Authority

Settle each controller-normalized finding through exactly one authority path:

- **FIX:** Record `begin-fix`, authorize and consume one old-head-to-new-head push, require successful exact-new-head
  CI and a qualifying full-head follow-up review with no explicit recurrence, post an accurate direct reply, append
  and confirm `fixed`, then resolve and canonically observe the conversation.
- **DEFER or REJECT:** Keep the head unchanged, post the authorized developer's bounded rationale as a direct reply,
  append and confirm that disposition, then resolve and canonically observe the conversation.
- **Provider-owned closure:** Accept only an explicit closure relation from the same qualified source that issued the
  finding. Record `provider-closed` without speaking for the provider or mutating the thread on its behalf.

A bare host-thread mutation, generic approval, provider ignore command, coordinator-authored closure claim, or direct
provider review request cannot close or satisfy a requirement. Thread resolution is a separate observation that may
follow durable coordinator authority; it is never authority by itself.

A provider-native conversation closes only when its provider's current decisive state and conversation status confirm
it. Never mint a controller finding or settlement for a native artifact the provider boundary cannot model.

## 4. Return Settled State

Re-read the current head, requirements, findings, native conversations, and check projection. Return only when every
obligation is satisfied, explicitly waived or settled with authority, or remains non-blocking recommended work, and no
blocking finding or unresolved required conversation remains. A valid lifecycle-tail projection that is already
settled returns without requesting or recommending a refresh. An invalid or ambiguous tail returns to ordinary
current-head coordination. If the head changes, restart at § 1.

---

[review-response]: ../../methods/review-response.md
