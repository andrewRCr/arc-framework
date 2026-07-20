# Spec (`detailed` · `RFC`): review-architecture

- **Origin:** [internal]

- **Purpose:** Partition every review surface ARC carries — local self-review, frontline pre-publication review,
  external independent analysis, finding triage/response, and the host-side enforcement gate — under one explicit
  five-layer model; route review spend by normalized change and work facts rather than by PR count; and keep review
  settlement distinct from lifecycle readiness at merge. Replaces piecemeal patching of individual review surfaces.

---

## Introduction / Context

ARC's review surfaces accreted independently, and three strands now force a coherent redesign.

**Method-family incoherence.** The same review boundary is served by four container kinds with no stated division
of labor, and each past patch reached for whichever container was nearest: `review.pre_merge` (config) gates a
step that fires *pre-PR* despite its name; the finding-disposition approval guard lives only in the project-local
`coordinate-pr-review.md` (PR-channel only), while the shipped `review-triage` contract records dispositions in the
commit message — i.e. *after* acting; the fire-point extension family mixes legacy action-suffixed names with the
settled action-neutral PR-lifecycle hooks; and `pre-merge` marks the "final agent fire point" while agent-side hooks
structurally cannot guarantee a merge boundary a manual host-UI merge bypasses.

**A parallelism forcing function.** Multi-WU + errand parallelism saturated both external review budgets within
days. Key economics: CodeRabbit meters PR, IDE, and CLI reviews as **separate hourly pools**, and its adaptive
fair-usage throttle tracks **PR reviews specifically** — so review-source and request-cadence are real levers, and
"every code PR gets a full PR review, iterate until quiet" is not sustainable at parallel volume. Supply-side fixes
(tier upgrades) buy ~1.5× headroom and are insufficient alone; the durable fix is demand-side metering — exact
obligations derived from review risk, with review requests composed against delivery topology.

**An enforcement-honesty gap.** Agent-side hooks are best-effort ergonomics; the host-side review-gate required
check is the only structural guarantee. That division is documented nowhere, so self-review and frontline review
can silently imply enforcement they cannot deliver. The gate also carries review evidence across lifecycle tails
without requiring that the tail exist, so a reviewed, CI-green pre-composition WU can appear merge-ready and force a
separate lifecycle repair PR after an early merge.

This is a technical-design derivation: the open question is *what is the right partition of these surfaces, the
right obligation-derivation contract, and the right role/rubric factoring* — not *what the feature should do*. The
heart is the Proposed Design and the Alternatives that justify it.

## Goals

- **One layer owner per surface.** Every review surface resolves to exactly one of five layers, with a stated
  re-partition rule; no surface is patched in place without a layer assignment.
- **Obligations derived from facts, not containers.** A deterministic contract maps a closed record of ARC change
  and work facts to review obligations, scaling review spend in both directions — an atomic determinate change
  softens, and a sensitive or high-authority change strengthens — without PR count ever multiplying review count.
- **Local review is first-class.** `independent-analysis` is satisfiable by a local fresh-agent pass with no
  hosted provider, so a project reviewing only locally is a fully supported posture, not a degraded one.
- **A user checkpoint before fixes land.** Every finding is verified against source and its disposition approved
  by the developer before any fix mutates the tree — universally, not only on the PR channel.
- **Honest enforcement.** The agent-ergonomics / host-guarantee division is stated explicitly at the contract
  level, review settlement remains distinct from lifecycle readiness, and no surface implies enforcement it cannot
  deliver.
- **Integration returns the human only at decision points.** During integration the developer returns at each
  review round's disposition approval and the merge gate; a provisionally persisted composition/base-reconcile
  tail runs between them and is reviewed in full at the exact-head merge gate, while asynchronous review is
  spanned by resilient suspend-and-reenter.

## Non-Goals

- **The multi-PR assurance-group algebra** — group-requirement derivation, tree-pair equivalence,
  carrier-capability coalescing, series-membership ownership, and terminal aggregation. This WU owns the
  single-deliverable obligation contract, the no-weakening principle, and the per-requirement projection seam;
  the grouping algebra is routed to `pr-decomposition`.
- **Lifecycle-readiness implementation, live-provider qualification, required-check cutover, and enforcement
  promotion** — retained by the `review-gate-enforcement-*` chain. This WU keeps review settlement from acting as
  merge authority in the agent workflow and supplies the independent-analysis projection; qualification owns the
  storage-neutral readiness record/reducer, project adapter, and live pre-composition proof, and promotion makes the
  qualified check required.
- **A generic provider registry** — the role and binding seam are stable; project overrides prove repeated
  provider shapes before ARC standardizes a registry.
- **The exclusive final-integration window and wait-for-parallel-shipping timing** — `integration-lane`'s seam.
- **The framework-wide `-audit`/`-review` rename cascade and additive-override term** (`extend` vs `augment`) —
  `naming-conventions` / `customization-arch-realign` concerns. This WU keeps its own surfaces coherent and
  consumes the live spellings.
- **The shared schema kernel, registry API, and schema-version mechanism** — owned by the `cli-substrate-adoption`
  cohort's `cli-schema-kernel` head member. This WU settles the semantic review records; their Zod-derived
  implementation schemas register with that kernel.

## Proposed Design

### Layer model — the doctrine

Five layers, each with one role. The re-partition rule: **policy that generalizes ships as a method; tool
bindings and host mechanics stay in the project/adapter layers; config never carries instructions.**

1. **Shipped method contract** — the override-proof invariants (the blockquote contract). An override must satisfy
   the same invariant; behavioral guards live here so no project override can delete them.
2. **Shipped method default** — the default policy prose, overridable by replacement or additive composition
   (`override-mode: extend`).
3. **Typed values** — config- or code-owned policy data, only where a hook, CLI, or adapter consumes the value;
   never prose, never a standalone activity toggle. Method activation stays on the method. Deterministic change
   facts are computed CLI-side and supplied as typed inputs.
4. **Host adapter / coordinator** — channel mechanics: reviewer-native rubric delivery, thread etiquette, await
   loops, provider trigger commands, evidence receipts. Host-neutral contracts and coordination skeletons ship;
   host specifics and this repo's CodeRabbit specifics stay project-side.
5. **Project layer** — additive method overrides and extension `.actions`: project-specific policy and provider
   bindings at lifecycle fire points.

Every surface below carries an explicit target layer.

### 1. `review-routing` method (new) — topology-neutral obligations and action policy

The method returns two deliberately distinct result families rather than a channel-combination "lane":

- **Review obligations**, using the gate-proven `exempt / recommended / required` vocabulary with typed reasons:
    - **Author self-review** — whether the aggregate local author pass is exempt, recommended, or required.
    - **Independent analysis** — whether exact-change-set evidence from a qualified independent source is exempt,
      recommended, or required.
    - **Retrigger treatment** — `none / incremental / full-final`; a full pass is reserved for a settled final
      head when policy requires it.
- **Frontline action**, using `skip / offer / attempt`: whether the workflow privately exposes the aggregate
  pre-change-request diff to a distinct reviewer. This is action selection, not gate satisfaction; `attempt` is a
  best-effort run, provider unavailability is surfaced (never reinterpreted as clean), and the action produces no
  independent-analysis receipt.

#### 1.1 The closed routing record

The core router consumes one closed, versioned ARC record — not an arbitrary project-facts bag:

- **change-set state** — `known / unknown`;
- **content kind** — `documentation / code-bearing`;
- **review risk** — `routine / sensitive`;
- **work context** — `unscoped / errand / work-unit`;
- **change determinacy** — `atomic / ordinary` (declared atomic character: derived from the Errand vehicle under
  full protection or an explicit atomic declaration under partial protection, never inferred from diff size);
- **WU `Class`** — `none / Light / Heavy / Novel`;
- **ownership relation** — `self / foreign / mixed / ownerless / not-applicable / unknown`;
- **surface authority** — `planning-grooming / ordinary / design-authority / constitutional /
  unverifiable-derived / unknown`;
- **effective method activation** — `self-review.active`, `frontline-review.active`.

These are ARC concepts. Project adapters own the bindings that normalize raw host identity, exact-ref Owner
lookup, concrete path predicates, and provider configuration into that record. Project customization consumes the
same versioned record and may emit namespaced reasons (`project:<policy-id>:<code>`); it cannot append untyped
facts. The self-hosting gate's `auto / reviewed` lane remains a derived presentation, not an input enum.

For the self-hosting policy, ownership reduces over exact-ref artifact groups before routing. An unavailable change
fact, author mapping, required meta, or Owner value yields `unknown`. Paths outside an owned artifact group are
`not-applicable` and do not dilute applicable groups. Only ownerless groups yield `ownerless`; one known owner plus
ownerless or non-applicable members resolves to `self` or `foreign` relative to the mapped author; incompatible known
owners resolve to `mixed`. A move across artifact groups is `unknown` rather than ownership inferred from only one
endpoint.

Surface authority is a separate project-policy projection over the union of affected endpoints. The initial
self-hosting bindings are:

- `planning-grooming` — the existing formative artifact family (`draft-*`, `tasks-*`, `meta-*`, `notes-*`, and
  `cohort-*`) in active or planned/provisional backlog locations;
- `design-authority` — settled WU specifications plus project/ARC strategies and ADRs;
- `constitutional` — project direction, development rules, and harness contracts (`PROJECT-PRD`, `DEV-RULES`,
  `AGENTS.md`, and `CLAUDE.md`);
- `ordinary` — every other positively classified source or documentation surface;
- `unverifiable-derived` — a declared generated/projection surface whose source relationship cannot be proved; and
- `unknown` — malformed facts, an unclassified endpoint, or failed policy evaluation.

For a multi-path change, authority reduces to the strongest member in the closed order
`unknown > unverifiable-derived > constitutional > design-authority > planning-grooming > ordinary`. These authority
bindings do not inherit from ownership, WU `Class`, diff size, or CI weight.

`Sensitive` means elevated review **impact**, not confidential content. The semantic floor covers changes that can
materially alter executable behavior, enforcement or trust boundaries, broadly-loaded agent behavior,
constitutional/project direction, or whose changed surface cannot be established reliably. Review risk is
classified **independently** of WU `Class`, work character, ownership, artifact authority, and raw diff size; the
effective route composes those facts afterward. The concrete predicate is project policy; the framework consumes
the typed fact.

#### 1.2 The reducer — a total mapping

The router is a deterministic **total function** over the closed record: every fact combination resolves to
exactly one obligation set. It is defined as an ordered pipeline — a routine base, then promote-only effects that
never weaken the risk floor, then activation adjustments. Outputs:
`{ authorSelfReview, frontlineAction, independentAnalysis, retrigger, assuranceMode }`.

**Stage A — fail-closed floor.** If `change-set state == unknown` (or the fact input is malformed):
`authorSelfReview = required`, `frontlineAction = attempt`, `independentAnalysis = required`,
`retrigger = full-final`, reason `unknown-change-set`. This is the maximal obligation floor — Stage C (routine)
is skipped and Stage D promotions are moot at the ceiling — but **Stages E–F still apply** (assurance mode, and
the activation adjustment that prevents an inactive method from resolving to a required invocation).

The unknown public boundary normalizes malformed input **field by field** before running the typed reducer. Any
missing field, invalid enum, or unknown key forces `change-set state: unknown`; independently valid fields survive.
Invalid fields take closed conservative values: `content kind: code-bearing`, `review risk: sensitive`,
`work context: unscoped`, `change determinacy: ordinary`, `Class: Heavy`, `ownership relation: unknown`,
`surface authority: unknown`, and both effective activation booleans `true`. Thus one malformed field cannot erase
a valid inactive-method decision or a valid WU assurance fact, while a malformed activation cannot weaken the
maximal obligation floor. Malformed project-promotion output is rejected and contributes no effect; the framework
result is already at the ceiling. Diagnostics retain the rejected paths, but the stable routing reason remains
`unknown-change-set`.

**Stage B — risk floor.** If `review risk == sensitive`: `authorSelfReview = required`,
`frontlineAction = attempt`, `independentAnalysis = required`, `retrigger = full-final`, reason
`sensitive-change-set`. Determinacy never softens this floor. Stage C (routine) is skipped and Stage D promotions
are moot at the ceiling; **Stages E–F still apply** (a sensitive change in a `Heavy` WU still resolves
`assuranceMode: terminal-aggregate`, and an inactive `self-review` still resolves `authorSelfReview: exempt`).

**Stage C — routine base.** When `review risk == routine`, branch on content kind:

- **`documentation`:**
    - *ARC-auto-eligible* — `surface authority == planning-grooming` and `ownership ∈ {self, ownerless}`:
      `authorSelfReview = recommended`, `frontlineAction = skip`, `independentAnalysis = exempt`,
      `retrigger = none`, reason `auto-eligible-planning` (+ `self-owned-artifact` / `ownerless-artifact`).
    - *reviewed documentation* — otherwise: `authorSelfReview = recommended`, `frontlineAction = skip`,
      `independentAnalysis = recommended`, `retrigger = incremental`, reason `reviewed-routine-documentation`.
- **`code-bearing`:** `authorSelfReview = required` (always, in the routine code tier).
    - *atomic* — `change determinacy == atomic`: `independentAnalysis = recommended`, `frontlineAction = offer`,
      `retrigger = incremental`, reasons `routine-code`, `atomic-determinate`, `atomic-softened`.
    - *ordinary* — otherwise: `independentAnalysis = required`, `frontlineAction = attempt`,
      `retrigger = incremental`, reason `routine-code`.

The **vehicle** (errand vs work-unit) never weakens the per-change baseline. Declared **atomic character** softens
only within the routine code tier and never across the sensitive floor.

**Stage D — promote-only effects.** Apply in order to the Stage-B/C result; each may **raise** an obligation
(`exempt → recommended → required`; `skip → offer → attempt`; `none → incremental → full-final`) and add a reason,
never lower one:

- `ownership relation ∈ {foreign, mixed, unknown}` → promote `independentAnalysis` to at least `required`,
  reason `foreign-owned-artifact` / `mixed-ownership` / `unknown-ownership`.
- `surface authority ∈ {design-authority, constitutional, unverifiable-derived, unknown}` → promote
  `independentAnalysis` to `required` and `retrigger` to `full-final`, reason `design-authority` /
  `constitutional-surface` / `unverifiable-derived-surface`.

`Class` does **not** promote per-change obligations in the default reducer; a project that wants `Class` to
strengthen per-change obligations encodes that promotion explicitly in its versioned typed policy (entering
`policyVersion`).

**Stage E — assurance mode.** `assuranceMode = terminal-aggregate` when `Class ∈ {Heavy, Novel}`, else `none`
(unscoped changes, Errands, and `Light`). Auto-eligible formative planning remains `independentAnalysis: exempt`
even inside a `Heavy` / `Novel` WU — `assuranceMode` governs WU-terminal assurance output, not the per-change
obligation.

**Stage F — activation adjustment.**

- If `self-review.active == false`: `authorSelfReview = exempt`, reason `self-review-inactive` — so no result
  contains both an inactive method and a required invocation.
- If `frontline-review.active == false`: `frontlineAction = skip`, reason `frontline-inactive`. (Frontline's
  effective `skip / offer / attempt` default applies only after a project activates the method; the frontline
  action/result never crosses the satisfaction boundary regardless.)

**Validity invariant.** The valid retrigger pairings are `independentAnalysis: exempt + retrigger: none` and
`independentAnalysis: recommended|required + retrigger: incremental|full-final`; a non-exempt obligation cannot
select `none`. The reducer is total: the illustrative matrix below is a projection of Stages A–F, not the
function.

| Exact change set                   | Author self-review | Frontline | Independent analysis | Retrigger   |
|------------------------------------|--------------------|-----------|----------------------|-------------|
| routine ARC-auto-eligible planning | recommended        | skip      | exempt               | none        |
| routine reviewed documentation     | recommended        | skip      | recommended          | incremental |
| routine atomic code-bearing        | required           | offer     | recommended          | incremental |
| routine code-bearing               | required           | attempt   | required             | incremental |
| sensitive, any content             | required           | attempt   | required             | full-final  |
| unknown / malformed                | required           | attempt   | required             | full-final  |

The **atomic** row is the determinacy carve-out; the review overlay (§ Cross-cutting) scales the lens *up* by a
declared additional rubric — the symmetric, floor-respecting pair. The CLI computes the effective per-deliverable
obligations, frontline action, and `assuranceMode`. Provider and host-channel selection remain adapter/project
decisions, so `local-only` / `local + PR` is a derived presentation, not another input enum.

**`review-routing/v1` core reasons:** `unknown-change-set`, `auto-eligible-planning`,
`reviewed-routine-documentation`,
`routine-code`, `atomic-determinate`, `atomic-softened`, `sensitive-change-set`, `self-owned-artifact`,
`ownerless-artifact`, `foreign-owned-artifact`, `mixed-ownership`, `unknown-ownership`, `design-authority`,
`constitutional-surface`, `unverifiable-derived-surface`, `self-review-inactive`, `frontline-inactive`,
`frontline-policy-skip`, `frontline-policy-offer`, `frontline-policy-attempt`, `invocation-force`,
`invocation-skip`, `source-invocation`, `source-developer`, `source-project`, `source-unbound`.

#### 1.3 Shared change-fact classifier

CI run weight, review risk, ownership/authority eligibility, and review obligations remain different decisions,
but they consume the same pure path facts. The CLI owns **one** changed-path fact resolver returning at least
known-vs-unknown change set, code-surface membership, and stable named-surface memberships. Consumers map those
facts independently:

- CI maps code-surface facts + verified-tree history to `light / heavy` scheduling;
- review risk maps code and project-sensitive surfaces to `routine / sensitive`;
- the ownership/authority resolver combines exact-ref ARC Owner data with those facts to emit normalized
  ownership relation and artifact-authority reasons;
- review routing combines those facts with work context, change determinacy, `Class`, risk, and activation — and
  computes whether a base-merge's changed paths are **disjoint from** or **interacting with** the reviewed
  surface (for the retrigger carry-forward, § 1.4).

The resolver consumes the **canonical changed-path record owned by `classify-change-granularity`** (the shell
lands it first; the CLI resolver lifts it), not destination strings:

```yaml
changeSet: known | unknown
changes[]:
  status: added | modified | deleted | renamed | copied | type-changed
  path: string            # affected path; destination for renamed / copied
  previousPath?: string   # required for renamed / copied
  oldMode: string
  newMode: string
```

Review-risk / ownership / routing consumers key on **status and paths and ignore modes**: they classify the
affected path for `added` / `modified` / `deleted` / `type-changed`, and the union of both endpoints for `renamed`
/ `copied` (either endpoint can establish code- or sensitive-surface membership). Modes and blob identity serve
the CI weight and tree-identity consumers, not review routing. Missing required rename/copy endpoint metadata, an
unknown or unsupported status, an empty set, or malformed input yields `changeSet: unknown` and **fails closed** at
the fact boundary (→ Stage-A floor). A compatibility adapter may project `copied → added` or `type-changed →
modified` only at a named lossy boundary *after* the canonical fact is resolved — never as the shared record. The
verified-tree Checks-API lookback, ownership/meta reads, and policy mappings are not reusable facts and stay with
their consumers.

For this repository: the path predicate currently authoritative in `scripts/classify-change.sh` moves behind the
CLI resolver; the shell entry becomes a compatibility/CI adapter that supplies status + both rename endpoints
rather than remaining a second implementation. (This consumes the status/rename-awareness and tree-hash identity
that `classify-change-granularity` lands first — see § Cross-cutting.) The review gate's current
TypeScript-extension-only `derivesCodeSurface()` approximation retires — it misses package manifests, shell,
fixture, workflow, and project-extension surfaces the canonical predicate correctly treats as code-bearing.

The adapter must also work in the classification job before dependency installation or a package build. Keep the
canonical raw-fact module dependency-free and directly executable through Node's native TypeScript support; the
classification job pins the package's Node 24 runtime but does not run `npm ci` or build the CLI. A narrow injected
Git port returns raw bytes, the parser preserves NUL framing and decodes paths strictly as UTF-8, and an invalid byte
sequence yields `changeSet: unknown`. Zod schemas remain in a separate co-located module so the bootstrap path does
not import an unavailable package dependency. The installed CLI and the shell adapter call this same module; neither
reimplements its parser or path predicates.

#### 1.4 Gate projection contract

The host-side **review projection** consumes only the independent-analysis obligation for the normalized exact change
set. Author self-review stays a workflow obligation; frontline action/result never crosses the satisfaction boundary.
The projection is a lossless mapping, not a second policy decision:

```yaml
independentAnalysis:
  obligation: exempt | recommended | required
  reasons: [reason-code, ...]
  rubricVersion: independent-analysis/v1
  rubricDigest: digest
  retrigger: none | incremental | full-final
```

`exempt` emits no gate requirement but remains an explicit reasoned decision; `recommended` emits a visible,
non-blocking requirement; `required` emits the same shape as blocking. Project gate policy then adds acceptable
source kinds/qualifiers and automatic-vs-checkpoint admission — host mechanics outside review routing — before
binding `changeSetId`, `headSha`, and `policyVersion`. The initial single-deliverable contract fixes **`count: 1`**:
one requirement is satisfied by one qualifying source chain; multi-reviewer assurance uses separate requirements
until coverage reduction defines counted independent chains explicitly. `policyVersion` hashes the normalized
obligation plus project source/admission policy, rubric identity, and retrigger treatment. A source qualifies against
the rubric **pair**
(`rubricVersion + rubricDigest`), not the version string alone; its carrier-specific `guidanceDigest` is an
additional proof of what it received.

The gate binds the projected requirement to a target and request. The forward contract is `schemaVersion: 2` with
`semanticsVersion: review-gate/v2`; target, request, requirement, receipt, evidence, and applicability records all
carry that exact envelope. Semantic identifiers use the Kernel `CanonicalDigest` encoding (`sha256:<64-hex>`),
while Git commit and tree object IDs remain bare hexadecimal object IDs. Schema-v1 parsers retain their existing
bare-digest and exact-key rules for diagnostic reads only; no parser strips or adds a prefix to coerce one version
into the other.

V2 finding records use the shared `blocker | major | minor` severity primitive, `fix | defer | reject`
dispositions, and an optional `nit` flag valid only on `minor`. Provider conversation closure is a separate
authority event, never a fourth disposition. Schema-v1 evidence retains its five provider severities and existing
disposition actions unchanged for diagnostics; it is never converted into satisfying v2 evidence. Fresh provider
observations normalize at the adapter boundary: `critical → blocker`, `high | medium → major`, and
`low | info → minor`. No severity label alone implies `nit`; the adapter must establish an explicit pure-polish
signal.

Every durable review-domain record introduced by this design has one co-located Zod schema as its runtime authority,
infers its TypeScript type from that schema, and registers under a stable versioned identity with the shared kernel.
This includes gate targets/requests/requirements/receipts/applicability, normalized findings and disposition sets,
fix authorizations and their consumption, frontline-run continuity, and suspended-review operational state. No
durable record is defined first as an interface, workflow payload, or adapter-private JSON shape.

Gate-contract v2's committed shape is the single-deliverable case; `assurance-group` targets are the additive
`pr-decomposition` extension (§ Multi-PR seam):

```yaml
reviewTarget:
  kind: change-set        # `assurance-group` is the additive pr-decomposition extension
  targetId: digest
  repositoryId: id
  baseRef: ref
  diffBaseSha: sha
  diffBaseTree: oid
  headSha: sha
  headTree: oid

reviewRequest:
  requestId: digest
  repositoryId: id
  targetId: digest
  requirementId: digest
  carrier: {kind: change-request | local-change-set, adapterId: id, changeRequestId: id | null}
  authorIdentity: id
  evaluatorIdentity: id
  generation: integer
  requestMechanism: id
```

The four v2 semantic IDs that join these records are `canonicalDigest(preimage)` over exact, registered,
domain-separated preimage schemas. Their committed preimages are:

```yaml
targetId:
  domain: arc.review-gate.target-id/v2
  schemaVersion: 2
  semanticsVersion: review-gate/v2
  kind: change-set
  repositoryId: id
  baseRef: ref
  diffBaseSha: sha
  diffBaseTree: oid
  headSha: sha
  headTree: oid

requirementId:
  domain: arc.review-gate.requirement-id/v2
  schemaVersion: 2
  semanticsVersion: review-gate/v2
  targetId: digest
  kind: independent-analysis
  obligation: recommended | required
  reasons: [sorted-unique-reason-code, ...]
  rubricVersion: id
  rubricDigest: digest
  retrigger: none | incremental | full-final
  count: 1
  acceptableSources: [{sourceKind: id, qualifier: id | null}, ...]
  initialAdmission: automatic | checkpoint
  policyVersion: digest

requestId:
  domain: arc.review-gate.request-id/v2
  schemaVersion: 2
  semanticsVersion: review-gate/v2
  repositoryId: id
  targetId: digest
  requirementId: digest
  carrier: {kind: change-request | local-change-set, adapterId: id, changeRequestId: id | null}
  authorIdentity: id
  evaluatorIdentity: id
  generation: integer
  requestMechanism: id

applicabilityId:
  domain: arc.review-gate.applicability-id/v2
  schemaVersion: 2
  semanticsVersion: review-gate/v2
  priorTargetId: digest
  currentTargetId: digest
  changeSetId: digest
  reviewedPaths: [sorted-unique-path, ...]
  deltaPaths: [sorted-unique-path, ...]
  interactionPaths: [sorted-unique-path, ...]
  conflictState: none | resolved
  treatment: carry | incremental
```

Every set-valued collection is validated for uniqueness and sorted by canonical member bytes before hashing;
path sets first use the canonical changed-path normalization. Nullable members are explicit `null`, never omitted,
and the exact preimage schemas reject unknown or `undefined` members. The derived ID itself and unlisted outer
envelope/observation fields never participate. Any future semantic digest must declare its own registered preimage
schema and domain/version tag before use rather than hashing an ambient record. Shared golden vectors pin canonical
bytes and digests across producers, parsers, validators, and adapters, including set-order invariance, one-field
sensitivity, self-ID exclusion, and cross-domain separation.

Gate-contract v2 permits one repository per target. One request is admitted and recorded against one concrete
carrier; a hosted carrier must expose the complete target range on its named change request. Core rejects an
author/evaluator identity collision. The terminal receipt binds `requestId + reviewRunId + targetId`, evaluator
identity, attesting runtime identity/mechanism, and provider event identity when one exists. This is process
attestation through an authorized receipt authority, not a cryptographic reviewer signature. Retargeting or
mutating the carrier during an active flight invalidates the flight. Cross-repository targets and one provider
event observed through several carriers are unsupported in gate-contract v2.

This WU owns a **forward-only** gate-contract version bump for these semantic fields; it does not mutate the
current schema-v1 exact-key contract in place. Current v1 receipts and evidence are **ineligible** for the new
requirement rather than silently upgraded — safe while the controller is not merge authority. Normalized
contracts, reducer behavior, strict-parser migration, and stale-membership tests are implementation scope here;
the shared schema-version mechanism and registry API are `cli-substrate-adoption`'s.

**Retrigger applicability (typed proofs).** Coverage starts with one full review from the target's diff base
through its requested head. `incremental` permits a contiguous same-source chain after approved fixes; every link
is exact and the chain must reach the current target head. `full-final` may use incremental passes for feedback,
but satisfaction requires a final full review of the settled target. `none` is the exempt treatment and creates
no request.

Every carry-forward or interaction-only retrigger is represented by one v2 applicability proof. It binds the prior
and current target IDs, exact delta `changeSetId`, normalized sorted-unique reviewed-path, delta-path, and
interaction-path manifests, conflict-resolution state, and `carry | incremental` treatment into an
`applicabilityId`. A lifecycle-bookkeeping tail or base reconcile whose delta-path manifest is disjoint from the
reviewed-path manifest proves `carry`; an interacting base merge proves `incremental` over the exact non-empty
intersection. Conflict resolution always selects `incremental`, even when ordinary path intersection would be
empty. The incremental receipt binds the `applicabilityId`; when a carrier cannot present an interaction-only
subset, reviewing the complete exact delta is accepted as stronger coverage. No proof silently broadens prior
coverage or reinterprets a partial review as full.

**Merge-readiness boundary.** A satisfied or exempt independent-analysis requirement means only that the review
obligation is settled; it never means the change request is ready to merge. Review evidence may carry across a typed
lifecycle tail, but applicability proves only that prior review still covers the change—it cannot prove that required
composition or archival products exist. The agent workflow therefore treats `review-settled` as candidate entry and
refuses merge commands until composition, cadence-required lifecycle work, exact-tail review, and the final
integration interlock complete. The downstream qualification WU owns the orthogonal storage-neutral readiness
record/reducer and project adapter that will make the same distinction mechanically enforceable at the host.

#### 1.5 Multi-PR seam — forward-compat with `pr-decomposition`

Review routing derives the truthful obligation for each **deliverable** independently. When a WU emits more than
one PR, the framework holds one principle and one seam — not a built-in grouping algebra:

- **Principle (no mechanical multiplication):** PR count must never mechanically determine review count. One
  exact review run may satisfy several deliverables' obligations **only** when coverage is provably preserved — no
  policy weakening, an exact ordered manifest, one reviewer can still cover the surface without attention
  dilution, and the carrier can present and prove the complete range. Absent that proof, the plan falls back to
  ordinary per-PR review. Every deliverable's blocking risk floor is preserved.
- **Seam (per-requirement projection):** the gate projection binds one independent-analysis requirement per
  normalized change set. A future assurance plan may bind several compatible member requirements to one review
  target without weakening or duplicating any member's floor.

The full assurance-group / seam-universe / series-membership algebra is **routed to `pr-decomposition`** to design
against its settled delivery mechanics — preserved verbatim as inherited input (staged in the reciprocal
`USER-INBOX` capture for the housekeep drain), not specified here ahead of them.

### 2. Review roles, methods, and rubric

A review pass factors into three orthogonal things, and the roles name points in that space: a **carrier** (who
reviews — author / fresh-agent / hosted / human), a **rubric** (the lens applied), and an **evidentiary role**
(advisory vs. satisfying). The naming discipline: **`-audit` names a rubric/lens; `-review` names an
activity/cycle** (an activity applies a lens).

- **`self-review`** — rename of `diff-review`; the authoring agent reviews its own aggregate diff. Carrier =
  author; advisory by construction (the existing non-evidence contract carries forward). Activation moves onto the
  method (§ 6).
- **`frontline` (`frontline-review` method)** — a **fire-point**, not an evidentiary tier: the pre-publication
  local pass that shapes what a downstream external reviewer receives. Advisory by construction; it exists only
  when there is a downstream reviewer. "Frontline as the only review" is a category slip — a satisfying local pass
  is `independent-analysis` carried locally.
- **`implementation-audit`** — the default **rubric** for review of a change's realization: intent/scope;
  correctness/failure behavior; trust/compatibility; verification quality and missing cases;
  coherence/maintainability. Completes the `design-audit → task-audit → implementation-audit` lens family
  (medium-agnostic — covers doc-only review as well as code); overridable per the method extend/replace model.
- **`independent-analysis`** — the satisfying **obligation/standard**: a non-author evaluator covers the complete
  exact change set from source, applies the bound rubric (`implementation-audit` by default), and emits an
  attested receipt at the exact head. The name denotes the property an obligation asks for; the lens is the
  rubric; attestation is the receipt that makes a rubric-meeting pass *satisfying* — not a separate method.
- **`review-response`** — the respond-to-received-findings cycle, replacing integration's inline content (§ 2.2).
- **`review-triage`** — source-agnostic classifier used by every finding-producing role; classifies each finding
  on **severity** (shared primitive, § 4) and **disposition** (§ 4).

**One mechanism across the lifecycle.** `adversarial-review` is the fresh-agent *mechanism* — context isolation,
primary-held judgment, `Class`-scaled passes — for every stage: `design-audit` / `task-audit` in planning,
`implementation-audit` at integration. Frontline and a local satisfying `independent-analysis` are
fire-points/roles over that one mechanism, differing only by evidentiary role (advisory vs. attested receipt) and
position. A solo/small-team project satisfies `independent-analysis` with a local `adversarial-review` +
`implementation-audit` pass and no hosted provider at all.

The mechanism is launch-neutral: caller policy selects an offered or mandatory invocation. Its findings remain
advisory for mutation—the author verifies and disposes them before any fix—but an authorized adapter may attest a
completed exact-target pass as satisfying evidence. An offer callout therefore marks caller discretion, not an
intrinsic property of `adversarial-review`; a required independent-analysis call is unconditional and still grants
the evaluator no edit or disposition authority.

`peer-review` does **not** ship: the reusable contract is `independent-analysis`. A hosted source unable to
receive or demonstrate the bound rubric remains useful advisory input but cannot claim satisfaction of that rubric
version. Specialized project rubrics (e.g. the thermonuclear maintainability skill) augment the baseline and
satisfy it only when all baseline dimensions are also covered. All carriers keep author beliefs, suspected weak
spots, preferred fixes, and self-verification claims out of first-pass context.

**`spec-review` boundary.** `spec-review` is the author's coherence-and-grounding self-review of a spec — an
activity, the planning analog of `self-review`; its criteria are the lens the planning `adversarial-review`
applies, so it is not a rubric misnamed `-review`. Any framework-wide `-audit` / `-review` rename cascade is a
`naming-conventions` concern.

#### 2.1 Independent-analysis standard and delivery contract

The satisfying obligation is the shipped `independent-analysis` standard; its lens is the `implementation-audit`
rubric (default, overridable). It is not a new rubric-document family, a peer-review workflow, or review-gate
policy. It owns one typed contract record whose semantic fields are:

- **version:** `independent-analysis/v1`;
- **coverage:** the complete exact requested change set, not a sample or only the latest fix;
- **evaluator boundary:** a non-author evaluator works from source and governing project context, without author
  conclusions, suspected weak spots, preferred fixes, or self-verification claims;
- **rubric:** the bound lens — `implementation-audit` by default (its five dimensions), overridable per the method
  model and augmentable by a declared overlay (§ Cross-cutting);
- **finding floor:** every actionable finding states materiality, a stable code/document locus, source-grounded
  evidence, and why the change fails the rubric;
- **clean rule:** a clean result is legal only after all rubric dimensions have been considered across the full
  requested change set. Unavailable, partial, ambiguous, or failed review is never clean.

The typed record is structure, not prose control flow; its schema composes with the shared kernel, and
build/validation tooling projects the record into runtime constants and carrier payloads. A normalized
`rubricDigest` covers the identity contract; changing any identity field requires a version change in the same
reviewed commit, while editorial method guidance may change without a version bump when the contract and digest
remain stable.

Delivery adapters expose the rubric through each reviewer's native carrier:

- a local fresh agent runs it as `adversarial-review` under `implementation-audit` and emits an attested receipt
  at the exact head — the first-class local-satisfying path;
- hosted Codex receives a managed `AGENTS.md` review-guidelines projection plus the owned trigger;
- another hosted provider receives its provider-instruction/configuration projection when that carrier can deliver
  and prove the complete contract;
- a human receives the equivalent checklist and exact-change-set coordinates.

One source-neutral coordination cycle closes the delivery contract: consume the routed obligation and project
channel, materialize the exact target/requirement/request, invoke the selected carrier, normalize its result, attest
eligible terminal evidence, reduce the requirement, and enter `review-response` for findings. On the local channel,
the workflow launches `adversarial-review` under `implementation-audit` with exact target coordinates and no author
conclusions, then passes the normalized report to the local attestor; a clean report is not satisfying until that
attestor revalidates and appends its exact-head receipt. A finding-producing pass enters the universal disposition
checkpoint, and any authorized fix invalidates the target and reruns routing and this cycle. Unavailable, partial,
or failed local review never attests: a required obligation blocks, while a recommended obligation remains visible
and non-blocking according to policy. WU and Errand workflows invoke the same narrow cycle; hosted adapters retain
their own action/await and conversation authority. This is a coordinator seam, not a resident review engine.

The typed baseline owns generic projector/validator functions and a package-neutral human checklist projection.
Repository-native instruction files and provider configuration are project bindings: self-hosting applies the
generic projector through stable managed boundaries to root `AGENTS.md` (inherited by `CLAUDE.md`), CodeRabbit's
repository instruction surface, and `.github/review-gate-attestation.md` for local/qualified-human delivery, then
validates nested effective guidance during rollout without making those project surfaces a second rubric authority.
Each binding records its projection/admission result; evaluator, attestor, approving/applying actor, and hosted-import
authority remain distinct.

The local carrier persists satisfying receipts through a `ReviewReceiptStore` implementation rooted at the
repository's Git common directory, so sibling worktrees share one authority without adding a storage/configuration
axis. The ledger is append-only and repository-scoped; a repository-shared lock protects version-checked
temp-write/atomic-publish operations, identical replay is idempotent, and a same-ID mismatch or version change
refuses without overwriting recoverable state. Local OS/repository write authority is the admission boundary. A
local receipt is authoritative only for the local channel: a hosted gate never reads or trusts it implicitly, and
may consume it only through an explicit import that revalidates the exact target, rubric pair, evaluator/attestor
identities, and appends a new receipt through the hosted authority. Cross-machine absence fails closed and can be
resolved by rerunning the exact-head review or performing that explicit import.

These are projections, not additional authorities; each includes the rubric version and baseline payload. Adapters
resolve the effective instructions for the exact changed paths, mechanically validate that the baseline projection
is present and unambiguous, and record a `guidanceDigest` for the actual carrier content. A missing, stale,
conflicting, or unverifiable projection leaves the source **advisory and non-satisfying**. The initial hosted-Codex
binding preserves the current qualification rule: every changed path must resolve to the same effective guidance set;
root-scoped or identically-repeated project context/augmentation qualifies, differing nested instruction sets
remain conflicting. Gate binding carries both identities: `rubricVersion + rubricDigest` prove which contract was
required; `guidanceDigest` proves what the reviewer received. The reviewer never receives the ARC coordination
workflow, controller state, author dispositions, or a finding hypothesis.

#### 2.2 `review-response` contract

`review-response` is the channel-neutral author-side cycle after a finding-producing run. Its inputs are the exact
review target, source-normalized findings and loci, the effective `review-routing` result, and adapter capability
handles — never provider command prose. One bounded sequence:

1. verify each finding against source, classify it with `review-triage` (severity × disposition), and obtain
   **approval for the complete disposition set before mutation** — the human checkpoint;
2. apply approved `fix` dispositions as one review increment, run affected quality gates, and let the caller's
   commit/push interlocks persist the result; `defer` / `reject` leave the head unchanged;
3. return approved dispositions, verification evidence, and old/new exact target to the adapter so it records
   audience-visible replies and closure with its own authority;
4. when the head changed, return to `review-routing` and the channel adapter for the permitted retrigger — a
   non-interacting change carries evidence forward — rather than choosing or invoking a provider inside the method.

Completion means every received finding has an approved disposition, every approved fix is verified and persisted,
and any channel-owned blocking conversation has authoritative settlement or an explicit still-blocking result. The
method never equates thread resolution with authority.

The complete proposed disposition set has one canonical identity. `DispositionSet` binds its schema/semantics
version, exact old target, normalized finding identities and immutable loci, severity, disposition, rationale,
effective policy/rubric identities, and the proposing actor. Approval adds the approving actor and approval time over
that digest; the applying actor remains distinct. Partial approval, a changed finding set, policy drift, or a stale
head produces a different identity and cannot authorize mutation. V2 adds these records without changing the exact
schema-v1 finding/disposition parser or treating its past-tense actions as v2 approval.

An approved `fix` set first yields a single-use `FixAuthorization` over the old target, approved-set digest, and
authorized finding IDs — before any edit or commit and therefore before a new head exists. After the authorized
increment creates a candidate head, a consumption record binds the actual old→new transition, applying actor, and
verification references. Head-mutability and persistence guards require the matching unconsumed pair. `defer` and
`reject` never mint a head-update authorization.

Deterministic response state lives in a typed CLI plan rather than prose evaluation. Given the current target,
normalized findings, approved dispositions, verification/persistence evidence, and adapter capabilities, the
planner emits exactly one state: `awaiting-approval`, `ready-to-fix`, `ready-to-persist`, `ready-to-close`,
`reroute`, or `blocked`, plus precomposed next-action text and the capabilities permitted in that state. The method
performs only the judgment/communication leaf named by the plan; the coordinator owns transition, persistence, and
re-entry mechanics.

**Waiting spans the review by suspend-and-reenter, not a live in-session pin.** An injected, version-checked
`ReviewOperationStateStore` supplies one storage-neutral port before any workflow consumes it. Its registered,
discriminated records are deliberately non-evidentiary:

- `frontline-run` binds schema/semantics version, exact target, source, generation, outcome/pass count, and the
  policy/source identities that invalidate reuse;
- `review-suspension` binds schema/semantics version, WU-or-Errand identity, repository/change request, exact target,
  request/source/generation, policy/rubric identities, bounded deadline, and wakeup-deduplication token.

The machine-local project adapter is rooted in the repository's Git common directory. It reuses the local receipt
store's low-level bounded-lock and version-checked temp-write/atomic-publish primitive, but writes to a separate
operational namespace and never enters review evidence or gate reduction. Identical replay is idempotent; stale
versions and same-ID mismatches refuse without overwriting recoverable state. `Integrating` and the Errand record
remain vehicle discovery projections. The operation store never persists controller conclusions, approvals, fix
authorizations, receipts, or narrative `Next Action` text; plans and user-facing resume text derive afresh. Absence
on another machine reconstructs only from canonical vehicle/host facts and grants no approval or evidence authority.

When a review is asynchronous (a hosted PR review of minutes, or an hour-plus under a provider's adaptive throttle
— the very condition this WU meters), re-entry is driven by an **automatable re-entry trigger** through a
capability-gated seam, in priority order:

- an injected **promoted review-gate watcher capability** — the canonical host-neutral auto-trigger only after
  enforcement promotion; the current production binding is absent and tests use a fake capability;
- a **harness-native scheduled wakeup** where the harness exposes one — the interim auto-trigger: arm a re-entry
  wakeup; on wake, re-check review readiness via the established detection path (raw host state today; never the
  half-wired controller during integration), then re-suspend, proceed, or time out;
- **human / next-session re-entry** — the always-available floor; the fallback is **explicit**: the agent
  announces it is suspended awaiting the review and that resuming is the human's to trigger (with when and how), so
  the degradation is legible and never a silent stall.

A bounded timeout or provider failure surfaces as an exception (a human re-entry point), never a silent hang and
never treated as clean. Suspend-and-reenter survives process/session loss directly and machine changes through a
canonical reconstruction when the operational record is absent; a bounded in-cycle wait is a happy-path
optimization for short reviews that times out into the same suspension state. Neither path tends the half-wired
controller pre-promotion. Exact controller actions, await loops, receipts, replies, and thread mutation stay
adapter-side.

### 3. `frontline-review` as an opt-in ARC feature

Frontline privately exposes the aggregate change set to a distinct reviewer *before* opening the change request,
so obvious findings resolve without public review churn — attention and spend shaping. Advisory by construction:
it never emits a satisfying receipt. Promote the fire-point into the integration and Errand-creation paths; the
generic `pre-pr-open` extension remains available for unrelated project actions but no longer owns the semantic
feature.

**Provider-neutral method contract:**

1. review the aggregate candidate diff from a context distinct from the author;
2. apply the selected reviewer binding without prescribing a provider;
3. verify, disposition, and approve findings through `review-triage` before fixes land;
4. after at least one approved `fix` at `major`+ severity changes the target, allow one bounded follow-up per
   project policy; `minor`-only changes (nits included) do not spend a second pass;
5. report unavailability or pass-cap exhaustion without calling it clean;
6. never discharge independent-analysis obligations.

**Action comes from the shared router, not a second policy.** The `skip / offer / attempt` action is the Frontline
column of § 1's reducer — one router emits both obligations and frontline action. Frontline adds no second
obligation policy — only a source, an execution stage, and the action adjustments below (invocation-override
precedence and the unbound-source→`offer` downgrade). Three inputs feed one deterministic resolver:

- **Method activation (project-static):** `frontline-review.active`, default `false`. An inactive method resolves
  to `skip`.
- **Source (a fallback chain):** invocation `sourceId` → developer `arc.frontlineSource` → project
  `review.frontline_source` → unbound. Each value is one safe registered ID, not a command or qualifying reviewer
  identity. An injected `FrontlineSourceRegistry` maps it to `{ kind: agent | command, ref }`; agent refs are typed
  harness capability handles, while command refs resolve to executable-plus-argv descriptors and never shell text.
  Invalid/unregistered IDs diagnose and resolve unbound. The developer preference is user-scoped private state
  through the storage abstraction; the project value selects a default but does not activate the method.
- **Invocation override (one run):** `mode = inherit | force | skip` plus optional source. `force` temporarily
  activates the role and overrides a policy `skip`; `skip` accepts no source; `inherit` + source replaces only
  source selection. Precedence: invocation `skip` / `force` over activation + the router's action.

The resolver emits a `schemaVersion: 1`, `semanticsVersion: frontline-review/v1` semantic record:

```yaml
frontlineReview:
  schemaVersion: 1
  semanticsVersion: frontline-review/v1
  action: skip | offer | attempt
  reasons: [reason-code, ...]
  source: null | {sourceId: id, kind: agent | command, ref: string}
  maxPasses: 0 | 1 | 2
  promptText: null | string
```

`skip` always carries `source: null`, `maxPasses: 0`, no prompt. `attempt` requires a **selected** source
reference, not a probe-proven available provider; when the action calls for a run but source selection is unbound,
the action is `offer` with a precomposed binding remedy rather than `skip` or a fabricated clean result. Projects
may reduce the pass allowance; V1 never exceeds the initial pass plus one follow-up after an approved `fix`
changed the target.

**Resolution and execution are explicitly staged** (load-bearing, not ceremony). The pure CLI resolver selects a
registered descriptor without executing or probing it. Only after an `attempt` or accepted `offer` does the carrier
adapter prepare the effect, returning `ready | needs-authorization | unavailable | invalid`. For `kind: agent`,
routing intent is *not* spawn permission: the adapter preserves the active harness's delegation-authorization
contract and turns `needs-authorization` into the precomposed offer without consuming a pass. `invalid` and
`unavailable` likewise perform no review; only `ready` may enter execution.

Execution returns a separate provider-neutral outcome — `clean / findings / unavailable / failed /
pass-cap-exhausted` — with the resolved source and pass count. Only `clean` means the selected source completed and
reported no findings. Rate limiting becomes `unavailable`; ambiguous, partial, malformed, stale-head, or failed
output becomes `failed` and cannot normalize to clean. Findings enter `review-triage`. No ordinary frontline
outcome emits an independent-analysis receipt.

Publication retains the `frontline-run` record through `ReviewOperationStateStore`, keyed by exact `targetId`,
`sourceId`, and generation. An unchanged-target PR-creation retry or coordinator re-entry reuses the record; any
head, source, policy, or generation change invalidates it. The record carries the outcome for workflow continuity
but is not a review receipt and cannot enter gate reduction. Publication ordering is final push → frontline
resolution/preparation/execution → approved fix, gates, commit, and push → optional bounded follow-up → generic
`pre-pr-open` → change-request creation.

The self-hosting CodeRabbit adapter uses `--agent` only after bounded live probes establish the naturally observable
clean/findings/empty/scoped response shapes for the pinned version. Sanitized recorded or synthetic injected-command
fixtures prove rate-limit, malformed, stale-head, refusal, and process-failure handling; qualification never depends
on deliberately provoking those live-provider states. If a required success shape cannot be observed within the
bounded probe, the adapter keeps `--plain` compatibility rather than inferring the structured contract. The plain
parser may emit `findings` from explicit parsed findings, but may emit `clean` only for a fixture-proven explicit
clean marker. Empty output, unknown prose, parse drift, refusal, and command failure remain non-clean.

### 4. `review-triage` contract upgrade — the disposition invariant and two axes

Upgrade the (override-proof) contract block to carry two orthogonal axes and three legs.

**Two axes** (the old `FIX NOW / MINOR FIX / DEFER / REJECT` set conflated them — two members split on severity,
two on action):

- **severity** — the shared primitive `blocker / major / minor`, the exact three-level enum `adversarial-review`
  already fixes across every fire-point, **reused verbatim** (one taxonomy across planning audits and code review,
  never extended here);
- **disposition** — the decision `fix / defer / reject`.

Orthogonal to both, a code-review **`nit` flag** marks a pure-polish `minor` the reviewer will not block on. `nit`
is a non-blocking marker on a `minor` finding — **not** a fourth severity level and **not** a fourth disposition
value (an author may still `fix` or `defer` a nit); it is represented as an orthogonal flag so the two-axis split
is not re-conflated. It is code-review-scoped and never reaches `design-audit` / `task-audit`, whose findings map
only into the three-level severity enum.

Severity drives deterministic gating. Every finding still appears in the approved disposition set. Unresolved
`blocker` / `major` findings block; project policy supplies `minorGating: blocking | record-only`, with the package
default and self-hosting binding both `record-only`; `nit` is valid only on `minor` and forces `record-only`.
Record-only means the approved disposition report satisfies ARC's response obligation without another review-round
prompt; it does not override a provider-native `CHANGES_REQUESTED`, required conversation, or host requirement.
Adapters with only `fix / defer / reject` retain severity and the resolved gating mode in the disposition record.

**Three legs (override-proof):**

1. every finding gets an explicit, documented disposition, now with its severity;
2. findings are **verified against source with the agent's own judgment** — never accepted on reviewer authority
   (anchors to DEV-RULES.ARC § Sub-agent scope: delegated outputs are advisory until verified);
3. the disposition set is **presented to the user for approval before fixes land** — severity, classification,
   recommendation, and open questions surfaced as a report, so the user can redirect before any commit.

The procedure (severity rubric, report format, commit-message record) stays in `.default`, overridable. A concise
DEV-RULES.ARC anchor ships: verify delegated findings independently and obtain approval for the disposition set
before applying fixes. The invariant is behavioral and high-miss-cost, so it cannot live only in an on-demand
method; the method remains the procedural-detail home.

### 5. Disposition etiquette — the channel split

- **Method (channel-neutral principles):** every finding's fate is recorded *where its audience can see it*;
  closure is explicit; never emit noise surfaces nobody reads.
- **Adapter/coordinator (host mechanics):** for GitHub — reject/defer dispositions reply in-thread when the
  finding has its own comment; findings without a dedicated comment get no response (no rollup-comment noise);
  threads resolve when no further round is coming; when a round *is* triggered, the reviewer gets the chance to
  resolve first. Local reviews have no response surface — the disposition report is the record.
  `coordinate-pr-review`'s existing controller-normalized-findings vs provider-native-conversations split (with
  distinct closure authority) is the frame these rules slot into.
- **Routing method:** whether a retrigger is worth spending (§ 1).

### 6. Method/config migration + settled hook vocabulary

- `diff-review` → `self-review` — the method names the author-side activity it performs.
- `implementation-audit` is minted as the integration-stage review **rubric** (completing `design-audit` /
  `task-audit`); `independent-analysis` keeps its name as the satisfying **standard**.
- `review-triage` adopts `adversarial-review`'s shipped three-level `severity` enum verbatim alongside its
  `fix / defer / reject` disposition, plus the code-review-only non-blocking `nit` flag (an orthogonal marker, not
  a fourth severity or disposition value; the shipped enum is unchanged).
- `review.pre_merge` **retires** rather than renames. `self-review` gains the method-activation axis (owned with
  `customization-arch-realign`) and ships `active: true`; workflow callers invoke it when active. Review obligations
  and project gate policy do not recreate the activity toggle under a new config key.
- `frontline-review` uses the same method-activation architecture but defaults **inactive**. Activation, smart
  routing, source binding, and invocation override remain separate axes; enabling the method never turns its
  result into independent-review evidence.
- Method `active` is an optional frontmatter field interpreted only by callers that declare an activatable method.
  It is orthogonal to `override-active` (whether `.override` is populated) and `override-mode` (how the override
  composes). A typed registry is the authority for activatable method names and package defaults
  (`self-review: true`, `frontline-review: false`); package frontmatter is validated against that registry. Existing
  non-activatable methods omit `active`, and validation rejects the field on an unregistered method. The effective
  resolver returns `{ active, source: project | package-default, diagnostics }`: it uses a valid project value, or
  emits a diagnostic and falls back to the registry default when the project file/value is missing or malformed.
  Routing consumes the resolved booleans as injected facts; method-file discovery is not part of the pure reducer.
- `pre-commit-review` and `pre-push-review` retain their shipped names, files, and callsites as generic low-level
  verification extension points. They own no self/frontline/independent review role and produce no satisfying
  evidence merely because their names contain `review`.
- The action-neutral `pre-pr-open` / `post-pr-open` pair and final-state `pre-merge` hook are shipped decisions.
  This WU consumes them and reconciles workflow callouts; it does not reopen extension-family naming. Specifically,
  `integrate-work-unit`'s doubled `pre-push-review` callout is reconciled onto the settled hooks without reopening
  the vocabulary.
- Extension frequency is an agent-layer contract: corpus validation proves every agent-managed workflow invocation
  of `arc release push` or a pushing `arc sync` fires `pre-push-review` first. A direct CLI invocation or raw Git
  push outside an agent-managed workflow is not structurally intercepted by an agent-interpreted extension; hooks
  and host controls own that stronger guarantee. Shipped guidance states this boundary rather than claiming
  wrapper-level enforcement the CLI does not perform.
- The additive override term (`extend` vs `augment`) and any behavior-preserving cascade belong to
  `naming-conventions`, with override semantics in `customization-arch-realign` and deterministic resolution in
  `composable-workflows`. This WU consumes the live spelling.

### 7. Enforcement division — documented honestly

Agent-side workflow methods and extensions are ergonomics, best-effort by construction; the host-side review-gate
required check is the guarantee (it fires regardless of who presses merge — manual host-UI merges bypass every
agent hook). State this division explicitly so neither self-review nor frontline review implies enforcement it
cannot deliver. The gate's core and inactive cutover machinery now exist; qualification and promotion retain
ownership of lifecycle-readiness implementation, live provider qualification, required-check authority, and
project-hook activation. This WU defines the review-obligation projection and agent-workflow merge boundary without
claiming host enforcement is operational.

### 8. Coordinator interface + rubric/method graduation

`coordinate-pr-review.md` remains the project binding: it provides the project-local typed action/await and
authoritative finding-settlement loop; host/provider-neutral core behavior lives behind its controller commands.
Graduate only the reusable procedure into `review-response` and the strengthened `review-triage` contract;
provider triggers, host conversations, receipts, and exact command loops stay in adapters/project workflow.
Graduate the neutral `implementation-audit` rubric (delivered under the `independent-analysis` standard)
separately; adapters deliver it through native reviewer-instruction surfaces without exposing controller
procedure. PR-body composition remains in the adapter layer and surfaces a non-internal `Origin` when it gives
reviewers material context. A generic workflow-pointer method override is not required for this binding and routes
to `customization-arch-realign` / `composable-workflows`.

## Alternatives & Rationale

- **Fresh WU superseding `review-method-family`** — rejected for rescope-in-place: the inbound buffer was live and
  a supersession ceremony would orphan routed captures for no design gain.
- **Supply-side remediation (CodeRabbit Pro+, additional providers) as the primary fix** — rejected as sole
  remediation: ~1.5× weekly headroom against unbounded parallel volume. Complementary providers remain an
  adapter/project option once obligation-aware metering exists.
- **Channel-combination lanes (`none / local-only / local+pr / pr-only`) as the primary model** — rejected: they
  conflate obligation, channel, and delivery topology; collide with existing review-gate and workflow uses of
  "lane"; and force a future multi-PR WU to multiply policy by container. Channel combinations derive from
  independent obligations instead.
- **Promote the raw self-hosting gate's `auto / reviewed` enum unchanged** — rejected: normalize its underlying
  ARC ownership and artifact-authority facts instead; the derived lane stays a project presentation.
- **Keep frontline review solely as a project `pre-pr-open` action** — rejected: private noise reduction,
  reviewer-attention shaping, and hosted-pass savings are stable lifecycle value independent of any one provider.
- **Treat a normal frontline result as satisfying independent analysis** — rejected: its role is pre-publication
  shaping, it carries no qualifying receipt by default, and conflation would silently weaken required hosted
  review.
- **Feed hosted reviewers an ARC method/workflow** — rejected: adapters deliver only the bound neutral rubric;
  orchestration state and author conclusions stay outside reviewer context.
- **Ship `peer-review` as a first-class method for symmetry** — rejected: hosted review does not execute ARC
  procedure; `independent-analysis` is the reusable contract. A later interactive entry may still be useful.
- **Build a generic provider registry in v1** — rejected: the role and binding seam are stable; project overrides
  can prove repeated provider shapes before ARC standardizes a registry.
- **Specify the full multi-PR assurance-group algebra here** — rejected: it fully specifies `pr-decomposition`'s
  endgame ahead of that WU's settled delivery mechanics. Preserved as inherited input; this WU keeps the
  single-deliverable contract, the no-weakening principle, and the per-requirement projection seam.
- **Mint a `code-audit` (or attestation) wrapper method over `independent-analysis`** — rejected as
  over-abstraction: the real split is rubric (`implementation-audit`) vs. standard (`independent-analysis`);
  attestation is the proof-carrier of a satisfying pass, not a third method.
- **Keep the single `FIX NOW / MINOR FIX / DEFER / REJECT` disposition enum** — rejected: it conflated severity
  and action; split into a shared `severity` primitive × a `fix / defer / reject` disposition, DRY'd with
  `adversarial-review`.

## Cross-cutting Considerations

**User-facing impact.** Review spend scales to the work in both directions — an atomic determinate change resolves
to `recommended` rather than `required`; a sensitive or high-authority change strengthens, and a WU may carry a
declared additional-rubric overlay. A project reviewing only locally is fully supported. During integration the
developer returns only at each review round's disposition approval and the merge gate; the provisionally persisted
composition/base-reconcile candidate runs between them without a `proceed` turn and is reviewed as one exact tail at
the merge gate (exceptions: quality-gate failure, conflict, alignment disagreement, unexpected state).

**Security / trust boundaries.** Findings are verified against source before any fix lands, and the disposition set
is approved by the developer first — no acting on reviewer authority. Frontline's two-stage resolution never
converts routing intent into standing spawn permission: the carrier adapter preserves the harness delegation
contract and surfaces `needs-authorization` as an offer. Reviewers never receive controller state, author
dispositions, or a finding hypothesis. Malformed or unestablishable change sets fail closed to the maximal
obligation.

**Migration / rollout.** The gate-contract change is **forward-only**: `schemaVersion: 2` and
`semanticsVersion: review-gate/v2` for the new semantic requirement/evidence identities (`rubricDigest`,
`reviewTarget.targetId`, `retrigger`, folded into `policyVersion`), not an in-place mutation of the current
schema-v1 exact-key contract. V2 semantic identities use `CanonicalDigest`; v1 retains its existing exact bare
encoding. Current v1 receipts and evidence are ineligible for the new requirement rather than silently upgraded —
safe while the controller is not merge authority. `review.pre_merge` retires; `self-review` activation replaces
it. `scripts/classify-change.sh` becomes a thin status/rename adapter over the CLI fact resolver; the gate's
`derivesCodeSurface()` approximation retires in favor of the canonical predicate.
Forward controller operations and operator guidance describe v2, while the exact v1 diagnostic parser, historical
ledger/evidence, and explicitly named compatibility/qualification fixtures remain truthful v1 records. No rewritten
example, qualification artifact, or project binding may imply that v2 review is live before the downstream
qualification and promotion ceremonies establish that authority.

**Testing.** The reducer is a pure total function — exhaustively table-testable across the closed record. The
fact resolver's fail-closed boundary (missing rename metadata, unknown status, empty/malformed input) needs
explicit negative cases. Strict-parser migration and stale-membership tests are in scope; the disjoint-vs-
interacting base-merge computation needs both arms covered. Workflow tests must prove that review settlement alone
cannot authorize a pre-composition merge and that each cadence reaches the exact-tail interlock only after its
required lifecycle products exist.

**Seam ownership (contracts, not cohort membership):**

- **`classify-change-granularity`** (dependency) — reworks `scripts/classify-change.sh` to be diff-status /
  rename-aware and redesigns classify/tree-hash identity. **Settled:** it lands first and owns the shell's
  status/rename classification, the **canonical six-status change-fact record** (`added / modified / deleted /
  renamed / copied / type-changed`, with modes and both endpoints — § 1.3), and the tree-hash identity; this WU's
  resolver **consumes** that record rather than re-cutting it, and its risk/ownership/routing consumers key on
  status + paths. `Depends On: classify-change-granularity` is an impl/integration dependency, not a planning
  blocker.
- **`pr-decomposition`** (follow-on) — coordinates through the obligation contract. This WU owns the
  single-deliverable obligation contract, the no-weakening principle, the per-requirement projection seam, and
  frontline action semantics; `pr-decomposition` owns the authored assurance plan, deliverable refs,
  cumulative-carrier shape, merge-consumption proof, frontline placement, stack orchestration, and the full
  assurance-group / seam / series-membership algebra (staged as inherited input via the reciprocal `USER-INBOX`
  capture). Add `Depends On: review-architecture` to it before full launch.
- **`review-gate-enforcement-qualification`** — must consume this WU's obligation contract as its trigger policy
  (repointing its inbound-buffer item from the rejected channel-lane vocabulary to `exempt / recommended /
  required` + the closed record), implement the orthogonal storage-neutral lifecycle-readiness record/reducer and
  project adapter, and enforce both through the forward-only v2 projection; add `Depends On: review-architecture`.
  It owns live proof that the pre-composition head stays non-green and the complete candidate can green before
  promotion. The local-satisfying `independent-analysis` path converges with that WU's attestation-first pivot.
- **`review-gate-enforcement-promotion` / `review-gate-github-adapter`** — promotion consumes the qualified
  readiness proof and makes the self-hosting App projection required; the GitHub adapter later productizes the
  neutral readiness obligation, setup, and doctor coverage for projects. Neither redefines composition products or
  review settlement semantics.
- **`cli-substrate-adoption`** — the semantic review records settle here; their implementation schemas stay
  co-located with the review subsystem, derive static types from Zod, compose shared primitives, and register with
  the cohort's schema kernel. Planning and specification do not wait; schema-bearing implementation waits only for
  the cohort's head member **`cli-schema-kernel`** — not the resolver/executor/other members — so the WU carries
  `Depends On: cli-schema-kernel` (an impl/integration dependency, not a planning blocker). Registry API shape, the
  generic schema-version mechanism, generated artifacts, and introspection are the substrate owners' decisions;
  this WU owns the review-gate-specific forward-only contract bump and v1-evidence invalidation rule.
- **`customization-arch-realign`** — this WU owns `review.pre_merge → self-review.active` alongside the
  method-family reshape and defines `frontline-review`'s required activation/binding semantics. Customization
  architecture owns the general activation/composition and per-developer/invocation override model; the additive
  override naming and generic workflow-pointer questions route to their own homes.
- **Determinacy / scalable-core** — the atomic-character routing fact is realized today via the Errand vehicle
  under full protection; its partial-protection realization seams to scalable-core's atomic tier (ADR-020,
  Proposed).

**Review overlay.** A WU may declare one additional review **rubric** through the managed `Review Rubric` meta field.
It renders in every managed meta projection with default `[none]`, which resolves as semantic absence; a real value
is one safe rubric/method identity, never a file path or inline instruction.
The field is surfaced as a `Class`-scaled offer at `create-spec` (the pattern the `adversarial-review` offer already
uses) and executed automatically at integration — no mid-flow pause and no per-integration config. Resolution is
typed as absent, resolved, or unavailable; malformed identities and unavailable declared rubrics refuse before
review rather than silently dropping the stronger lens. The overlay scales the lens *up* by declaration; the atomic
determinacy carve-out scales the obligation *down* by a declared character — the symmetric, floor-respecting pair.

**Review channel posture.** A project's review channel is `local` / `hosted` / `both`, first-class and never
assumed. `local` means the local `independent-analysis` (fresh-agent `adversarial-review` + `implementation-audit`,
attested) is the satisfying gate evidence; the host-side gate stays opt-in and never silently activates hosted
review. No review at all is reachable by overriding obligations to `exempt`.

**Integration reshape.** The `integrate-work-unit` changes that realize integration flow-autonomy remove both
composition `proceed` turns and create a narrowly bounded provisional integration candidate. After implementation
findings settle, cleanup, archive-phase composition, cohort closeout, lifecycle sweep, readiness-view regeneration,
and a typed safe base reconcile may commit/push before their structured review. This is the sole
approval-before-commit exception: implementation changes and finding fixes remain gated before mutation, the base
branch remains untouched, and the entire candidate tail is reviewed before merge authority is granted.

`review-settled` is only the entry condition for candidate assembly; it is never merge readiness. A direction such as
“merge once review settles” issued before composition is prospective and cannot bind the not-yet-known exact head. It
authorizes autonomous progress to the final integration interlock, not `gh pr merge`, auto-merge enablement, or any
other queued merge. The workflow must refuse those merge actions until cadence-required composition/lifecycle
products exist, the complete tail has been surfaced, and the developer grants merge authority at the final
interlock.

Composition is grounded in the canonical WU change set, completed task outcomes, spec intent/non-goals, success-
criteria disposition, and verification evidence. The exact diff decides what shipped; planning artifacts explain
why, and a material disagreement stops rather than being narrated away. Release Notes are external-facing only:
they describe supported reader/operator-visible outcomes, never leak WU names or slugs, task/phase references,
branches, roadmap pointers, internal provider/review machinery, or other internal development jargon, and never
claim planned-but-unshipped work. Publicly supported review concepts and configuration may be named when they are
the shipped reader/operator-visible outcome. `Infrastructure` is used only for an externally meaningful operational
change; a breaking-change callout names the affected stability contract and required migration. Completion Notes
distinguish delivered scope, material deviations/supersessions, and verified evidence without duplicating history.

The composition basis reuses the canonical change-set identity at the last settled implementation head. A finding
fix or interacting reconcile invalidates and recomposes the candidate; a proven-disjoint base merge may carry the
content forward. One late reconcile location is the final mutation site, not the final action: after any append-only
base merge, CI and routing run on the new head before final `pre-merge`. The integration interlock surfaces the exact
delta from the settled implementation head through cleanup, composition, cohort closeout, archive/readiness changes,
and reconcile commits — not excerpts alone — together with checks, conversations, requirements, and base evidence.
Requested corrections append, rerun affected gates/routing, and refire the interlock. Re-entry recognizes an open,
unmerged candidate even when its branch projection has already swept the WU and records `Shipped`. Explicit merge
authorization binds the exact settled head; revalidation permits no intervening mutation or review action.

**Forward-compat north stars.** Sanity-checked against `strategy-knowledge-evolution` /
`strategy-procedure-evolution` / `strategy-storage-evolution`: reusable methods are declared at fire sites;
high-miss-cost triage constraints stay in DEV-RULES.ARC; deterministic classifiers and `skip / offer / attempt`
decisions compute CLI-side; the developer frontline-source binding rides the storage abstraction (no new storage
axis); and any schema projection / reviewer-instruction binding derives from one typed/rubric source rather than a
hand-authored second contract.

## Success Criteria

Validated at work-unit completion:

1. **Total reducer.** Given the closed routing record, the CLI resolves every fact combination to exactly one
   obligation set `{ authorSelfReview, frontlineAction, independentAnalysis, retrigger, assuranceMode }`, with the
   validity invariant (no non-exempt obligation selects `retrigger: none`) holding across an exhaustive table
   test. The six representative rows (auto-eligible planning, reviewed documentation, atomic code, ordinary code,
   sensitive, unknown) resolve as specified.
2. **Directional scaling.** A routine atomic code-bearing change resolves independent-analysis to `recommended`
   and frontline to `offer`; a sensitive change of any content resolves both required with `retrigger:
   full-final`; and a `Heavy` / `Novel` WU can carry a declared additional-rubric overlay executed at integration.
3. **Fail-closed facts.** The changed-path fact resolver fails closed (maximal obligation) on missing rename/copy
   endpoint metadata, an unknown/unsupported status, an empty set, or malformed input; renames and copies classify
   the union of both endpoints; a deletion classifies its deleted path; modes are carried but not read by the
   review-risk consumers.
4. **Local-satisfying path.** A project on the `local` channel satisfies `independent-analysis/v1` with a local
   `adversarial-review` + `implementation-audit` pass and an attested exact-head receipt in the Git-common-directory
   local authority — no hosted provider — and the local gate accepts it as satisfying evidence. Hosted consumption
   requires explicit validated import into the hosted authority.
5. **Neutral delivery.** Hosted/human carriers receive only the bound rubric projection (version + baseline
   payload) with a recorded `guidanceDigest`; a missing, stale, conflicting, or unverifiable projection leaves the
   source advisory and non-satisfying; the reviewer receives no controller state, author dispositions, or finding
   hypothesis.
6. **Disposition checkpoint (universal).** Across local and hosted channels, findings are verified against source
   and one exact-head canonical disposition set is approved before any fix mutates the tree; its single-use
   authorization is consumed by the resulting old→new head, while `defer` / `reject` leave the head unchanged;
   blocker/major settle before merge, configured record-only minors do not prompt another round, and `nit` never
   blocks.
7. **No mechanical multiplication.** PR count never determines review count: one review run satisfies several
   deliverables only under the no-weakening proof; absent it, the plan falls back to per-PR review, and every
   deliverable's blocking floor is preserved.
8. **Forward-only gate migration.** Gate records use `schemaVersion: 2`, `review-gate/v2`, and Kernel
   `CanonicalDigest` semantic IDs without mutating the schema-v1 exact-key/bare-digest contract in place; current
   v1 receipts/evidence are ineligible for the new requirement rather than silently upgraded; exact registered,
   domain-separated ID preimages and their golden vectors pass alongside the strict parser and stale-membership
   tests.
9. **Retrigger carry-forward.** A disjoint base-reconcile or lifecycle-bookkeeping tail carries evidence forward
   under a v2 `carry` applicability proof without a new request; an interacting or conflict-resolving base merge
   retriggers `incremental` bound to the proof and scoped to the interaction (or the complete exact delta as
   stronger coverage); `full-final` requires a final full review of the settled target.
10. **One layer owner.** Each surface in the § Layer model inventory resolves to exactly one layer; `review.pre_merge`
    is retired (not renamed under a new config key); `pre-commit-review` / `pre-push-review` retain names and lose
    no capability; the enforcement division (agent ergonomics vs host guarantee) is stated at the contract level.
11. **Reviewed integration candidate.** Composition and safe reconcile may persist provisionally without a
    `proceed` turn, but the final integration interlock surfaces the complete exact-head tail since settled
    implementation, release notes contain no internal development identifiers or jargon, correction changes append
    and rerun gates/routing, prospective pre-composition merge approval is ineligible, and no candidate reaches the
    base branch without explicit exact-head merge authority.
12. **Two-copy + gates.** All framework edits land in both `packages/arc-framework/arc/**` and `.arc/**`; markdown
    lint, typecheck (source + test), tests, and build pass.

## Open Questions

- **CodeRabbit `--agent` structured output** (bounded implementation validation, not architecture). CLI 0.6.5
  advertises `--agent` as structured findings but does not publish its schema through `--help`; no stored review
  exists in this worktree to inspect without spending a review. Bound live probes to naturally observable
  clean/findings/empty/scoped shapes; qualify rate-limit, malformed, stale-head, refusal, and process-failure paths
  through sanitized recorded or synthetic injected-command fixtures. Retain `--plain` as compatibility fallback
  whenever a required structured success shape cannot be observed within the bound. This cannot reopen the
  architecture or block the existing project binding.
