# Draft: Review Gate GitHub Adapter

- **Purpose:** Productize the live-proven review gate as an optional, supported GitHub integration for ARC projects,
  preserving the neutral core while making installation, configuration, verification, repair, upgrade, and removal
  safe for repositories beyond ARC's self-hosting instance.
- **Depends On:** `review-gate-enforcement-promotion` — consume the final installed-state evidence only after the
  self-hosting controller, provider adapters, passive watcher, recovery path, and required-check promotion are proven.
- **Class:** Heavy — public configuration, GitHub App lifecycle, generated trusted workflows, branch-protection
  mutation, credential handling, upgrade/uninstall behavior, and cross-project validation require durable design.
- **Priority:** P1 — the self-hosting cutover is the qualifying vertical slice; reusable ARC delivery is the product
  goal, not optional cleanup.

---

## Product boundary

The review gate is an ARC feature whose first installation happens to be this repository. The predecessor work must
leave extraction-ready neutral contracts for request execution, evidence, fallback, conversation settlement, passive
waiting, head mutability, host access, provider access, receipt storage, and projection. This work packages and
supports those contracts for GitHub projects; it does not clone the self-hosting reducer or turn repository policy
into framework defaults.

Keep four layers explicit:

1. **Neutral review core:** host/provider-independent state machines and injected ports.
2. **GitHub adapter:** GitHub API, App identity, Actions execution, check/status projection, review conversations,
   branch protection/rulesets, and GitHub-backed receipt storage.
3. **Provider adapters:** independently qualified request/evidence parsers such as CodeRabbit and hosted Codex.
4. **Project/user configuration:** project-owned admission and enforcement policy, separately from user-scoped
   provider availability/preferences and authenticated trigger actors.

GitHub is the bundled first host. Define the host-port contract needed by future GitLab/Bitbucket adapters without
implementing those hosts here. Keep `ReviewReceiptStore` injectable so a later private backend event log can replace
visible GitHub ledger comments without changing review semantics.

## Inputs from the self-hosting sequence

Consume, do not reconstruct:

- the final neutral contract/type inventory and module boundary;
- the immutable-v1 plus append-only v2 ledger upgrade contract and mixed-version fixtures;
- the enabled provider subset, capability table, parser/identity versions, and fallback semantics;
- exact-head pending-first and exclusive-trigger-window behavior;
- passive await and head-mutability contracts plus typed JSON results;
- typed `next-action` / `perform-action` contracts, immutable actor selection, and canonical trigger-event adoption;
- PR-wide trigger/head snapshots, mutation/deletion tombstones, and old-head effect terminality;
- finding-locus settlement and reviewer-visible language rules;
- GitHub App permissions, selected-repository behavior, protected default-branch execution, and opaque token proof;
- normal and outage add-before-remove enforcement sequencing;
- source-pinned CI/App-check identities plus the `review-repair-ok` Actions identity and exclusive-writer proof;
- sanitized setup, qualification, promotion, rollback, and recovery evidence.

The self-hosting values are observed examples, not universal defaults. App ids, bot ids, labels, check names,
workflow names, provider order, admission thresholds, required checks, environment names, and native-review policy
must enter through validated configuration or setup choices.

## Supported lifecycle

Design one idempotent supported surface, with exact command naming settled at spec time, for:

### Setup

- Explain the tracked workflow/configuration footprint, App permissions, selected-repository scope, compact visible
  audit comments and notifications, required-check/outage behavior, and repair model before mutation; require explicit
  consent.
- Guide private organization/account-owned GitHub App creation through the App Manifest flow where portable, with a
  manual documented fallback.
- Restrict installation and short-lived tokens to selected repositories; write public identifiers to host variables
  and stream the PEM key only to a protected host secret store.
- Generate trusted default-branch workflows pinned to immutable adapter/action revisions, including reconcile,
  wake-up, attestation, qualification, and independent outage repair.
- Configure project policy/provider declarations separately from user provider preferences. Never auto-activate the
  hosted adapter under Local mode.
- Install/version provider review-guidance transports where required, including effective per-path guidance-digest
  verification and rubric-bearing trigger commands; never treat ledger metadata as proof that a provider received a
  rubric.
- Reuse the established CODEOWNERS setup surface to verify intended native required-review/ruleset configuration;
  consume GitHub's aggregate review decision and individual reviews without parsing CODEOWNERS.

### Verify and doctor

- Verify installation identity, exact permissions, selected repositories, environment restrictions, secret metadata,
  workflow revision, source-pinned checks/statuses, policy schema, provider qualifications, receipt integrity, passive
  watcher behavior, token opacity, and equivalent classic/ruleset enforcement.
- Distinguish configuration drift, unavailable provider capability, stale evidence, broken credentials, missing
  workflow activation, and unsafe protection state with actionable fail-closed diagnostics.
- Provide a disposable exact-head smoke test for pending projection, one provider request/result, waiting, settlement,
  and repair without spending provider quota before consent.

### Upgrade and key rotation

- Upgrade generated workflows/configuration add-before-remove, prove the new immutable revision and source identities,
  then retire the old path.
- Rotate keys by proving a newly streamed key through the same App/repository before deleting the old key.
- Version neutral receipts, policy, provider parsers, and installed workflow manifests so incompatible evidence fails
  closed and doctor can prescribe the safe migration sequence.
- Preserve old receipt schemas byte-for-byte and extend an existing ledger only through the proven single upgrade
  transition with separate terminal proof for ambiguous v1 failures; never rewrite visible audit comments or reset an
  anchor during adapter upgrade. Provide the close-without-merge/replacement-PR repair path when proof is impossible.

### Uninstall

- Snapshot enforcement and installed resources; replace/remove required contexts add-before-remove so uninstall cannot
  strand an unproducible check or create an empty required set.
- Deactivate ARC lifecycle actions, remove generated workflows/configuration, delete host secrets/variables, and guide
  App uninstallation only after remaining branch protection is proven.
- Preserve or explicitly purge durable receipts/audit comments according to a disclosed operator choice; never leave
  credentials or a misleading green projection.

## ARC workflow integration

Coordinate reusable review actions with `review-method-family`. Consume action-neutral `pre-pr-open`, `post-pr-open`,
review-response, and `pre-merge` lifecycle seams rather than creating CodeRabbit- or GitHub-named methodology hooks.
The project adapter supplies ordered actions that admit a request, expose an authenticated user trigger when needed,
await typed aggregate state, settle findings, guard active-review heads, and verify final state.

Local author-side self-review is not independent gate evidence. Preserve the distinction between self-review,
provider/human review evidence, and response/settlement. Low-risk or auto-lane projects may configure admission
differently, but a configured required review remains exact-head, pending-first, and fail-closed.

## Coordination

- **`review-gate-enforcement-cutover`:** produces extraction-ready contracts and provider/runtime qualification.
- **`review-gate-enforcement-promotion`:** produces the final installed-state, enforcement, rollback, and activation
  evidence this work uses as its reference installation.
- **`review-method-family`:** owns reusable lifecycle action/method presentation; this work owns adapter distribution
  and GitHub-specific execution.
- **Configuration cohort:** owns eventual project/user configuration substrate. Do not mint a receipt-store axis or
  conflate project enforcement policy with a developer's hosted-provider subscriptions.
- **`arc-backend`:** may later provide a private `ReviewReceiptStore`; do not require that backend or materialize
  review events into tracked ARC work artifacts.

## Scope boundaries

- GitHub only as the supported first host; define future host ports, do not implement other hosts.
- No ARC-hosted SaaS, webhook service, or provider API billing requirement.
- No assumption that CodeRabbit, Codex, or any particular hosted provider is enabled.
- No universal self-hosting lane thresholds, identities, workflow filenames, labels, or required-check names.
- No weakening of exact-head evidence, exclusive trigger attribution, conversation settlement, or outage-safe
  enforcement to simplify installation.
- Do not describe an Actions status as workflow-pinned from `{context, app_id}` alone. Installation must establish and
  continuously verify the exclusive status-writer permission/call graph or choose a stronger supported authority.

## Success signals

- A fresh ARC project can opt in, understand the footprint, install the GitHub adapter, and live-prove a truthful
  exact-head review gate without framework-author intervention.
- The installed adapter uses the predecessor's neutral modules rather than maintaining a semantic fork.
- Setup, doctor, upgrade, key rotation, repair, and uninstall are idempotent and never create an empty or unproducible
  required-check state.
- Project policy and user provider preferences remain distinct, and Local mode never silently activates hosted review.
- GitHub-specific code remains behind a host adapter and generated execution layer; future hosts can implement the
  documented port without changing the neutral review model.

## Readiness

**State:** maturing. The product boundary, dependency, lifecycle, and inherited safety contracts are settled. Exact
public command/configuration shapes intentionally wait for the predecessor's final extraction manifest and live
installation evidence, then settle during this work's own draft/spec cycle.

---
