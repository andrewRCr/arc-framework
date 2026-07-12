# Draft: Review Gate Enforcement Qualification

- **Purpose:** Qualify the shipped inactive review controller from immutable default-branch code and activate only
  baseline-proven hosted provider declarations without changing required-check or project-hook authority.
- **Depends On:** `review-gate-enforcement-cutover` — its inactive controller, provider adapters, qualification
  runner, protected workflow, activation compiler, diff validator, and sanitized evidence schema must ship first.
- **Likely Class:** Heavy — live hosted-provider probes, protected App execution, private checkpoint evidence, and a
  generated policy activation require durable sequencing even though the implementation contracts are inherited.
- **Planning boundary:** Create the spec and task list only after `review-gate-enforcement-cutover` ships, so the
  qualification plan binds to the delivered schemas, workflow revisions, and refusal states rather than assumptions.

---

## Role in the three-work-unit sequence

This work unit owns baseline qualification and hosted-provider policy activation, not controller construction or
required-check promotion. Its single PR contains only the deterministic activation compiler's baseline-proven provider
declarations and provisional sanitized evidence values. Disposable probe PRs are qualification fixtures, not work-unit
delivery PRs.

The dependency leaves legacy CI `merge-ok` required, project `post-pr-open` and `pre-merge` inactive, CodeRabbit native
request-changes enabled, and every hosted provider non-authoritative until proven. Qualification runs the shipped
matrix from a clean checkout at an immutable remote default-branch SHA, retains raw non-secret evidence in the private
checkpoint store, and refuses activation unless at least one hosted adapter has a complete satisfying baseline.

After this work's activation PR merges, `review-gate-enforcement-promotion` reruns the complete matrix through the
enabled immutable default-branch policy before any enforcement mutation. That second pass belongs to promotion so
both work units retain one-PR lifecycles; it converts the provisional baseline manifest into the final
`CutoverAcceptanceProof` alongside the enforcement closeout.

## Qualification and activation sequence

1. Resolve the exact shipped controller/workflow SHA, App and provider identities, policy/rubric/guidance/parser
   versions, protected environment, repository selection, and private checkpoint locus.
2. Run the complete baseline matrix against disposable exact-head PRs through the shipped qualification coordinator.
   Cover pending-first ordering, trigger lifecycle, CodeRabbit and Codex outcomes, fallback, passive waiting, event
   repair, finding settlement, v1/v2 migration, both token formats, and outage repair authority.
3. Fail closed on changed default branch, wrong actor, dirty checkout, missing or mismatched checkpoint, incomplete
   cells, fixture substitution, contaminated effects, credential-shaped output, or any result produced by unshipped
   code. Route implementation defects to a separate Errand or work unit and rerun only after the repair ships.
4. Require at least one hosted satisfying adapter. Retain partial/non-satisfying capabilities only when the typed
   baseline proves they cannot grant authority or permit illegal fallback.
5. Compile the accepted baseline into exact provider-policy declarations and a provisional sanitized manifest. Bind
   source/actor ids, capability outcomes, terminal-unavailable mode, default-branch SHA, workflow revisions, version
   digests, evidence ids, and raw-checkpoint hashes.
6. Validate the delivery diff against the compiler candidate. Reject manual additions, omissions, version drift,
   extra paths, raw responses, secrets, required-check changes, hook activation, generic-approval changes, or
   CodeRabbit native request-changes mutation.
7. Merge the generated activation PR through legacy authority and archive normally. Hand the committed provisional
   manifest plus private checkpoint hashes to promotion for enabled-policy requalification.

## Required output for promotion

- A committed baseline capability table distinguishing satisfying, partial, unavailable, and unqualified behavior.
- At least one enabled hosted adapter whose complete request/evidence path passed the baseline matrix.
- Exact App, Actions, provider, actor, controller, workflow, policy, rubric, guidance, parser, and default-branch
  identities with hashes of the corresponding private raw checkpoints.
- Proof that legacy `merge-ok` remains required, project hooks remain inactive, CodeRabbit native request-changes
  remains enabled, and no enforcement layer changed.
- A deterministic candidate that promotion can revalidate and upgrade to the final `CutoverAcceptanceProof` only
  after the enabled-policy matrix passes.

## Non-goals

- Do not add, remove, rename, or source-repin any required check.
- Do not activate project `post-pr-open` or `pre-merge`.
- Do not remove legacy CI authority, generic approvals, or CodeRabbit native request-changes.
- Do not repair controller/provider defects on the activation branch or accept unshipped probe results.
- Do not claim the enabled aggregate path is accepted before promotion reruns it from the merged default branch.

---
