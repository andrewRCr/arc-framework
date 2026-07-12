# Draft: Review Gate Enforcement Promotion

- **Purpose:** Promote the shipped review controller from authenticated shadow observation to the sole required
  machine-review authority without a duplicate, stale, or temporarily absent merge gate.
- **Depends On:** `review-gate-enforcement-qualification` — its baseline matrix and generated provider-policy
  activation PR must ship with at least one satisfying hosted adapter and a provisional sanitized manifest. The
  controller implementation, pending-first projection, watcher, workflow guards, fallback adapters, and qualification
  runner arrive transitively from `review-gate-enforcement-cutover`.
- **Likely Class:** Heavy — staged GitHub host mutations, exact-head evidence, rollback rehearsal, and a final-gated
  closeout PR require durable sequencing even though this work consumes rather than invents the controller design.
- **Planning boundary:** Keep this draft coordinated with both predecessors now; create its spec and task list only
  after `review-gate-enforcement-qualification` ships, so the committed baseline and enabled provider policy replace
  provisional assumptions.

---

## Role in the two-work-unit sequence

This work unit owns enforcement promotion, not controller or adapter construction. Its single PR is the sanitized
evidence and closeout change reviewed under the progressively promoted gate. Disposable probe PRs are test fixtures,
not additional work-unit delivery PRs.

The dependency leaves the repository with baseline-proven hosted declarations enabled, legacy CI `merge-ok` still
required, project review hooks inactive, and a committed provisional sanitized manifest. Before reconciling live
GitHub rules, this work reruns the complete matrix through the enabled immutable default-branch policy and upgrades
that provisional record to the final `CutoverAcceptanceProof`. It then proves each authority transition on exact probe
or closeout heads and removes legacy authority only after its replacement is already required and green. It never
fills implementation or baseline-qualification gaps with promotion probes.

## Promotion sequence

1. Validate the committed provisional qualification manifest against its sanitized schema and raw-checkpoint hashes,
   then rerun the complete matrix through the enabled immutable default-branch policy. Re-prove the installed ARC App
   identity, selected-repository scope, protected environment boundary, shipped controller workflow SHA, provider
   capability table, enabled subset, and exact source ids. Refuse promotion if the activation diff does not match its
   baseline-derived candidate, current state has drifted, any required capability is unavailable, or the enabled
   aggregate path cannot produce one complete `CutoverAcceptanceProof`.
2. Snapshot classic branch protection and the `main-protection` ruleset, including source-pinned checks, strictness,
   human approvals, stale-review dismissal, and conversation resolution. Keep both enforcement layers equivalent at
   every mutation. Retain both layers for this cutover to minimize unrelated governance change; consolidation is
   separate scope.
3. Emit and prove App-authored shadow while it remains non-required and legacy CI `merge-ok` remains the sole machine
   authority. Rehearse controller outage/restore at this safe checkpoint; do not deliberately break a required App
   context.
4. Add the proven shadow beside legacy CI `merge-ok` in both enforcement layers. Re-prove the required pair before
   removing any authority.
5. Remove the CI alias from enforcement without deleting it yet: prove `ci-ok` plus App shadow on a disposable probe
   head, then require that pair in both enforcement layers. The legacy alias may continue to emit while unrequired.
6. Promote shadow → dual → final with a new post-mutation reconciliation each time. Accept checks only from the
   pinned App, for the exact PR head, using the recorded default-branch controller SHA, and updated after the mode
   mutation.
7. Open this work unit's one final-gated delivery PR only after final authority is required. That PR activates project
   `post-pr-open`/`pre-merge` hooks, removes the now-unrequired CI alias, disables CodeRabbit's native request-changes
   approval workflow, and lands the sanitized evidence/architecture closeout; its merge cannot self-deadlock.
8. Rehearse normal rollback from final without deliberately inducing a controller outage, and preserve the audited
   outage recovery path. Never use admin bypass, direct-base writes, force pushes, or an empty required-check set.
9. Merge the final-gated closeout PR, then prove the resulting final controller state. Report
   `finalize-parallelism` readiness from its own live state; this is a sequencing preference, not a fabricated
   dependency.
10. Publish the sanitized final installation, enforcement, activation, rollback, and recovery handoff consumed by
    `review-gate-github-adapter`. Keep self-hosting values clearly separated from reusable contracts and setup inputs.

## Inherited non-negotiables

- Provider evidence is authenticated, exact-head or mechanically canonicalized to the exact frozen head, fresh for
  the request generation, and distinct between clean and findings outcomes.
- The ARC App's canonical required check is the sole machine-review authority; Actions `ci-ok` remains the independent
  CI authority. Provider-native completion statuses are wake-up evidence only unless an adapter qualifies them.
- A generic approval count is not a human gate: CodeRabbit proved a bot approval can satisfy it without substantive
  review. Set generic required approvals to zero once the App gate is final. Explicit merge authorization remains the
  ARC integration interlock; a future genuinely human-constrained GitHub rule is separate governance scope.
- CI and review share a change-request await transport but retain separate terminal semantics. Exempt PRs await
  `ci-ok`; reviewed PRs await the aggregate controller projection.
- A pending-trigger/acknowledged/queued/running request flight freezes the head until a terminal provider result or an
  explicit abandon/supersede/restart transition. Terminal findings use the inherited `begin-fix` one-push contract.
- Every finding is settled at its original conversation locus. A provider may resolve its own thread; otherwise the
  coordinator replies there and resolves it only after the applicable fix, deferral, or rejection policy is met.
- Reviewer-visible prose uses repository and engineering language, not methodology-internal vocabulary.

## Evidence and rollback

Retain raw non-secret snapshots in the private operator checkpoint store. Commit only a sanitized manifest containing
PR, run, check, review, and comment identifiers; exact heads; before/after enforcement summaries; dispositions; URLs;
and hashes of raw snapshots. Never retain tokens, private keys, secret values, or credential-bearing responses.

Normal rollback reverses final → dual → shadow. If the controller cannot coordinate, first establish and prove an
Actions-pinned, exclusive-writer-proven `review-repair-ok` status from the preinstalled default-branch emergency
workflow. Branch protection pins the Actions producer family; a full permission/call-graph audit proves only that
immutable workflow can emit the context and links the exact run/workflow SHA/PR/head. The workflow uses no ARC App
credential: it validates the existing bounded `independent-analysis/v1` attestation against the live PR/author/head
and permits maintainer-attested agent evidence or an authenticated non-author human. Add and prove the status before
removing the unavailable App context; remove it only after restored App authority is required and green. Every
rollback ends with the same exact-head verification used for forward promotion.

## Required qualification inputs before spec creation

These are observed values, not open design choices. Import them from the provisional
`.arc/reference/supplemental/research/research-review-gate-cutover-evidence.md`: the baseline capability table,
qualified enabled hosted-adapter subset under the canonical `coderabbit-pr` then `codex-pr` policy order, exact App/
Actions source ids, controller/workflow SHAs, token-format evidence, repair proof, enforcement boundary, and raw-
checkpoint hashes. Reject placeholders, missing qualification rows, unverified hashes, activation-diff mismatch, or
drift from the live installation. Refuse enforcement mutation unless at least one hosted adapter is enabled and its
request/evidence path plus the enabled aggregate policy pass promotion's opening default-branch matrix. Retain classic
protection beside `main-protection`, mutate them equivalently, set generic approvals to zero at final, and use
disposable promotion probes plus the one final alias-removal, activation, and closeout delivery PR.

The final handoff also records the installed workflow revisions, source-pinned enforcement set, setup assumptions,
normal/outage mutation sequence, and project-hook activation behavior for `review-gate-github-adapter`; it does not
choose that downstream work's public command or configuration surface.

---
