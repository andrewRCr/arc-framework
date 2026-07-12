# Draft: Review Gate Enforcement Cutover

- **Origin:** Split from `review-gate-reconcile-composition` when the first authentication probe proved the accepted
  controller architecture had no production composition (2026-07-11).
- **Purpose:** Live-prove and promote the composed private GitHub review controller from compatibility-only gating to
  App-owned enforcement without an unpinned, duplicate, or temporarily absent merge authority.
- **Depends On:** `review-gate-reconcile-composition` — a `main` dispatch must execute the composed entry code.
- **Class:** Heavy — multi-stage host mutation, live evidence qualification, rollback safety, repository rules, and
  a closeout PR require durable sequencing across sessions.
- **Runbook:** `.github/review-gate.md` is authoritative for commands, checkpoints, and rollback.

---

## Exact Resume State

Completed during the aborted pre-WU Setup:

- Protected `review-gate` environment exists with protected-branch-only deployment policy.
- Repository variables `ARC_REVIEW_GATE_APP_CLIENT_ID` and `ARC_REVIEW_GATE_APP_ID` are set and verified.
- Environment secret `ARC_REVIEW_GATE_APP_PRIVATE_KEY` is set and verified by metadata only. Never copy the key,
  client id, or installation token into tracked files, commands, logs, or this draft.
- Reviewed `setup-before` checkpoint material exists outside the repository under the operator checkpoint store:
  environment, variables, secret metadata, and required-check snapshots. Baseline required authority is the CI
  compatibility `merge-ok`; `REVIEW_GATE_CONTEXT_MODE` is not set.
- `review-gate.yml` is disabled manually to suppress the pre-fix empty-candidate failure loop. Re-enable it before
  authentication probes; `review-gate-wakeup.yml` and `review-gate-attest.yml` remain active.

Entry is blocked only on the dependency merge. Resume at authentication probes—not at environment/App creation.

## Delivery Sequence

### 1. Authenticate the composed entries

- Re-enable `review-gate.yml` and dispatch from the exact `main` head.
- Prove the emitted `review-gate-shadow` check is authored by the pinned App id; reject same-name foreign sources.
- Prove App-bot receipt comments require both pinned App and immutable bot identities and are unedited.
- Prove selected-repository scope, no contents write, narrow git-read-token use, and the default-branch environment
  boundary; the non-default attest probe must fail before an authoritative write.
- Stop and restore the last checkpoint on any identity, scope, credential, or write-order mismatch.

### 2. Execute the provider/evidence matrix in shadow

Drive every runbook row against disposable PR heads: exempt/recommended/required admission; clean/findings;
stale/retarget; CodeRabbit trigger/retrigger and resolved configuration; direct commands; status wake-up; full and
incremental coverage; finding closure; capacity; waive/dismiss; agent and human attestation; ambiguous reservation;
scheduled repair; event routing; fan-out; and native review dispositions. Record immutable API evidence and exact
heads at each row.

The matrix is qualification, not a demonstration script: a missing or ambiguous observation remains pending and
cannot be promoted by interpretation.

### 3. Reconcile repository rules before authority changes

Snapshot GitHub rulesets, branch protection, required status checks with source ids, human approval requirements,
and stale-review dismissal behavior. Establish one machine authority for CodeRabbit satisfaction:

- The ARC App projection may become the required machine authority only after its stage proves green.
- Remove any separately required `CodeRabbit` completion status or native current-head CodeRabbit approval rule that
  would duplicate controller policy or defeat lifecycle-tail carry-forward.
- A retained human approval / stale-dismissal rule is a separate human-governance requirement. Document it as such;
  never present it as provider coverage or controller evidence.
- Every rules mutation follows before-state snapshot → reviewed mutation → exact-head/source proof → after snapshot.

### 4. Promote through shadow, alias removal, qualification, dual, and final

Follow the runbook's add-before-remove sequence:

1. **Shadow:** retain CI `merge-ok`; add source-pinned `review-gate-shadow`; prove both green.
2. **Alias removal:** after the pair is green, merge the reviewed CI-alias removal and require `ci-ok` plus App
   shadow on the new exact head.
3. **Qualification decision:** promote `coderabbit-pr` only if every live capability probe passes; otherwise retain
   `coderabbit-cli` authenticated attestation and record the GitHub App route as non-satisfying.
4. **Dual:** require `ci-ok`, App shadow, and App `merge-ok`; prove the new App final context before removing shadow.
5. **Final:** require `ci-ok` plus App `merge-ok`; remove shadow only after exact-head proof.

After shadow proof, the reviewed cutover PR activates the existing project `post-pr-open` and `pre-merge` actions as
one state. Explicitly run `coordinate-pr-review.md` for that activation PR because its current session may hold the
pre-activation extension snapshot; a fresh session must load both active actions before continuing.

Reverse final → dual → shadow for normal rollback. If controller coordination is unavailable, a reviewed repair PR
sets both project hooks inactive, coordinates its current head explicitly, proves a substitute required authority
before removing the dead context, and later re-promotes from shadow. Never use admin bypass, direct-base writes,
force pushes, or an empty requirement set.

### 5. Close out and release dependents

Open the narrow final-gated closeout PR only after final mode is exact-head green. It updates
`TECHNICAL-OVERVIEW.md` from composed/not-live-proven wording to the proven final architecture and links the retained
checkpoint/evidence record without exposing secrets.

`finalize-parallelism` remains paused on this cutover. Unpause it only after the closeout PR merges and the resulting
`main` head is green under source-pinned final `ci-ok` + App `merge-ok`; shadow proof or final-mode mutation alone is
not sufficient.

## CodeRabbit Enforcement Semantics to Prove

- Verify the tracked and resolved `reviews.request_changes_workflow` plus exclusive `arc-review-gate` trigger.
- Current-head `CHANGES_REQUESTED` blocks. `APPROVED` satisfies only after required conversations and error-mode
  checks clear.
- A prior approved or attested substantive head may satisfy the exact final head only through a valid
  `lifecycle-bookkeeping-tail/v1` proof; that bridge requests no second provider review.
- The `CodeRabbit` check is completion/wake-up only. Its success may coexist with findings, rate limits, skips, or
  other non-clean outcomes and never satisfies independently.
- Missing applicable approval—including paused, rate-limited, skipped, oversized, stale, or ambiguous state—remains
  pending/fail-closed unless the sole prior-head exception above proves. Manual recovery may request
  `@coderabbitai full review`.

## Completion Evidence

- Authentication and environment-boundary probe record
- Completed provider/evidence matrix with exact heads and immutable API references
- Before/after repository rules and required-check snapshots
- Shadow, alias, qualification, dual, and final checkpoints with source-pinned green proofs
- Project hook activation and fresh-session load proof
- Rollback/outage rehearsal result
- Merged closeout PR and `finalize-parallelism` unpause record

---
