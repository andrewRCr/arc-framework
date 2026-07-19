# Draft: review-architecture — coherent end-to-end review system

- **Origin:** [internal] — rescoped in place from `review-method-family` (2026-07-16); full lineage in
  § Provenance.
- **Purpose:** One holistic pass over every review surface ARC carries — local preflight, external code review
  (CLI and PR channels), finding triage and response, the review-gate's enforcement boundary, and the
  config/method/extension containers that hold them — partitioned once by an explicit layer model, with review
  spend routed by normalized change and work facts. Replaces piecemeal patching of individual review surfaces,
  which is how the current incoherence accumulated.

---

## Problem / Motivation

Three strands, in the order they surfaced:

**The original method-family diagnosis (2026-04, carried forward).** `integrate-work-unit`'s review-iteration step
inlines too-thin review-response guidance and assumes every PR receives review; `diff-review` conflates its
classification utility with self-review activity and its name reads as generic code review; there is no shipped
reviewer-facing independent-analysis contract or full respond-to-findings cycle — this project's review-gate
instructions and `coordinate-pr-review.md` carry those ad hoc, project-locally.

**The parallelism forcing function (2026-07, wave-3 burn-in).** Multi-WU + errand parallelism saturated both
external review budgets within days — the GitHub Actions budget drained weeks early, and CodeRabbit's adaptive
fair-usage throttle engaged (95th-percentile identity; Pro degrades to 1 PR review/hour at 60+ reviews/week).
Key economics: CodeRabbit meters PR, IDE, and CLI reviews as **separate hourly pools**, and the adaptive
throttle tracks **PR reviews specifically** — so review-source and request-cadence selection are real levers, and
unmetered "every code PR gets full PR review, iterate until quiet" is not sustainable at parallel volume. Evidence:
`notes-finalize-parallelism.md` § Day-2 evidence. Supply-side fixes (tier upgrades) buy ~1.5× headroom and were
judged insufficient alone; the durable fix is demand-side metering — exact obligations derived from review risk,
with review requests composed against delivery topology rather than counted from PR containers.

**The systemic incoherence (2026-07-16 audit).** The same review boundary is served by four container kinds
with no stated division of labor, and each past patch picked whichever container was nearest:

- `review.pre_merge` (config) gates a step that fires **pre-PR** — its own comment says "before pushing" — a
  misnamed boundary, and a config-gated built-in step whose relationship to the extension family is undefined.
- The finding-disposition approval guard (triage findings, verify, present to the user _before_ fixes land)
  exists only in the project-local `coordinate-pr-review.md`, PR-channel only — the shipped `review-triage`
  contract requires explicit dispositions but records them in the _commit message_, i.e. after acting. Local
  reviews and any adopter without the project workflow inherit the observed agent failure mode: accept findings
  and act without a user checkpoint.
- The fire-point extension family still mixes legacy action-suffixed names (`pre-commit-review` /
  `pre-push-review`) with the settled, action-neutral PR lifecycle hooks (`pre-pr-open` / `post-pr-open` /
  `pre-merge`), while `integrate-work-unit` gives `pre-push-review` a full callout twice and `pre-pr-open` only an
  inline mention. This WU must reconcile callsite ownership without reopening the settled lifecycle vocabulary.
- `pre-merge` marks the final agent fire point, but agent-side hooks structurally cannot guarantee the merge
  boundary — a manual host-UI merge bypasses them. The actual guarantee is the host-side review-gate required
  check, and that division is documented nowhere.

## Charter

Inventory → layer model → re-partition. Every surface below gets an explicit target layer; nothing is patched
in place without a layer assignment.

| Surface                                        | Today                                                    | Reconciliation need                                             |
|------------------------------------------------|----------------------------------------------------------|-----------------------------------------------------------------|
| `review-triage` (method)                       | shipped; disposition contract                            | add verify-against-source + pre-fix user-approval invariants    |
| `diff-review` (method)                         | shipped; gated by `review.pre_merge`                     | rename to `self-review`; move activation onto the method        |
| `review.pre_merge` (config)                    | gates the pre-PR local aggregate review                  | retire the config-as-method-toggle smell                        |
| PR lifecycle extensions                        | action-neutral `pre-pr-open` / `post-pr-open` + final    | consume the settled hooks; do not reopen their naming           |
|                                                | `pre-merge` boundary                                     |                                                                 |
| `coordinate-pr-review.md` (project)            | typed controller action/await + finding-settlement loop  | keep host mechanics project-side; graduate reusable invariants  |
| review-gate core + self-hosting policy         | code/cutover shipped; qualification and promotion remain | project exact-change-set requirements need a method-level seam  |
| CI classifier + review-gate policy classifiers | shipped typed facts (`light/heavy`, `auto/reviewed`,     | reuse facts without conflating CI weight, ownership, and review |
|                                                | `routine/sensitive`)                                     | obligations                                                     |
| project `pre-pr-open` frontline review         | active CodeRabbit CLI action + disposition guard         | graduate the role; retain provider invocation project-side      |
| project `independent-analysis/v1` rubric       | gate + hosted Codex instructions + attestation contract  | graduate the neutral rubric, not the coordination workflow      |

## Success signal

Given representative documentation-only, routine-code, sensitive-code, atomic-determinate, `Heavy` / `Novel`,
Errand, and multi-PR cases, ARC derives explicit self-review and independent-analysis obligations plus an opt-in
frontline action for the exact change set — scaling review to the work in both directions: an atomic determinate
change resolves to `recommended` rather than `required`, while a critical WU can carry a declared additional-rubric
overlay. Independent analysis is satisfiable by a local fresh-agent pass (`adversarial-review` under the
`implementation-audit` rubric, attested) as first-class gate evidence, so a project reviewing only locally is a fully
supported posture, not a degraded one — the review channel (`local` / `hosted` / `both`) never assumes a hosted PR
review exists. Frontline review, when active, is the pre-publication local pass that shapes what a downstream reviewer
receives — advisory by construction; it removes low-value noise so the public reviewer receives a higher-signal diff
and needs fewer token-expensive repeat passes, and never discharges a required obligation. Hosted providers receive a
neutral rubric rather than an ARC workflow; no PR-count rule mechanically multiplies expensive full reviews; and
every finding is verified against source and disposition-approved before fixes land. During integration the human
returns only at genuine decision points — each review round's disposition approval and the merge gate — with
composition and base-reconcile running without a `proceed` turn between them, unless a quality gate fails or state is
unexpected. The asynchronous review is spanned by resilient suspend-and-reenter; to the degree an automatable
re-entry trigger exists (the promoted review-gate watcher, or a harness-native wakeup), re-entry needs no human
next-step, and where none does the agent explicitly hands off — telling the human it is suspended awaiting their
re-entry rather than stalling silently. Each review surface has one layer owner, and agent hooks remain
ergonomic while the host-side gate remains enforcement.

## Layer model — the doctrine

Five layers, each with one role. The re-partition rule: **policy that generalizes ships as a method; tool
bindings and host mechanics stay in the project/adapter layers; config never carries instructions.**

1. **Shipped method contract** — the invariants (the blockquote contract). Binds overrides: an override must
   satisfy the same invariant. This is where behavioral guards live so no project override can delete them.
2. **Shipped method default** — the default policy prose. Overridable by replacement or additive composition —
   the live enum spells the latter `override-mode: extend`; `naming-conventions` owns any rename. The base
   contract stands while project layers add "use this tool, with this policy" on top.
3. **Typed values** — config or code-owned policy data only when a hook, CLI, or adapter consumes the value; never
   prose and never a standalone activity toggle. Method activation stays on the method. Deterministic change facts
   are computed CLI-side and supplied as typed inputs rather than re-derived in workflow prose.
4. **Host adapter / coordinator** — channel mechanics: reviewer-native rubric delivery, thread etiquette, await
   loops, provider trigger commands, and evidence receipts. Host-neutral contracts and coordination skeletons
   ship; host specifics (GitHub threads, GitLab discussions) are adapter content; this repo's CodeRabbit specifics
   stay project-side.
5. **Project layer** — additive method overrides and extension `.actions`: project-specific policy and provider
   bindings at lifecycle fire points.

## Proposed shape

### 1. `review-routing` method (new) — topology-neutral obligations and action policy

The method returns two deliberately distinct result families rather than a channel-combination "lane":

- **Review obligations** use the gate-proven `exempt / recommended / required` vocabulary and carry typed reasons:
    - **Author self-review** — whether the aggregate local author pass is exempt, recommended, or required.
    - **Independent analysis** — whether exact-change-set evidence from a qualified independent source is exempt,
      recommended, or required.
    - **Retrigger treatment** — `none / incremental / full-final`, with a full pass reserved for a settled final
      head when policy requires it.
- **Frontline action** uses `skip / offer / attempt`: whether the workflow should privately expose the aggregate
  pre-change-request diff to a distinct reviewer. It is action selection, not gate satisfaction; `attempt` is a
  best-effort run, provider unavailability is surfaced rather than reinterpreted as clean, and the action produces
  no independent-analysis receipt by default.

The framework obligation defaults apply whether or not frontline review is active. The Frontline column is its
effective default only after a project activates `frontline-review`; otherwise that column resolves to `skip`:

| Exact change set                   | Author self-review | Frontline | Independent analysis | Retrigger   |
|------------------------------------|--------------------|-----------|----------------------|-------------|
| routine ARC-auto-eligible planning | recommended        | skip      | exempt               | none        |
| routine reviewed documentation     | recommended        | skip      | recommended          | incremental |
| routine atomic code-bearing        | required           | offer     | recommended          | incremental |
| routine code-bearing               | required           | attempt   | required             | incremental |
| sensitive, any content             | required           | attempt   | required             | full-final  |
| unknown / malformed                | required           | attempt   | required             | full-final  |

The **atomic** row is the determinacy carve-out: a routine code-bearing change of declared atomic character (see the
closed record below) softens independent analysis to `recommended` and frontline to `offer`, never crossing the
sensitive floor. It scales spend _down_ by a deliberate character declaration; the review overlay (§ Cross-cutting)
scales the lens _up_ by a declared additional rubric — the symmetric pair, both floor-respecting.

`self-review` is active by default, preserving today's `review.pre_merge: enabled` behavior. Its activation is an
input to effective routing: explicit project deactivation resolves the author self-review obligation to `exempt`
with reason `self-review-inactive`, so no result can contain both an inactive method and a required invocation.
Frontline activation is independent: under inherited activation, an inactive frontline method always resolves to
`skip`; projects may override the active default without changing the role's contract. A one-run invocation override
may force, skip, or select a different source without rewriting project policy. A clean frontline result may support
declining a **recommended** hosted review, but it never suppresses a **required** one.

`Sensitive` means elevated review impact, not confidential content. The project classifier owns the concrete
predicate; the framework consumes the typed fact. The semantic floor covers changes that can materially alter
executable behavior, enforcement or trust boundaries, broadly-loaded agent behavior, constitutional/project
direction, or whose changed surface cannot be established reliably. Review risk is classified independently of WU
`Class`, work character, ownership, artifact authority, and raw diff size; the effective route composes those facts
afterward. This repo's current self-hosting predicate marks all code, GitHub control surfaces, ARC
system/strategy/ADR/brief surfaces, project-direction documents, harness contracts, and unknown change sets
sensitive. Its concrete path list remains project policy rather than becoming the framework default.

The core router consumes one closed ARC record, not an arbitrary project-facts bag:

- change-set state (`known / unknown`), content kind (`documentation / code-bearing`), and review risk
  (`routine / sensitive`);
- work context (`unscoped / errand / work-unit`), **change determinacy** (`atomic / ordinary` — declared atomic
  character, derived from the Errand vehicle under full protection or an explicit atomic declaration under partial
  protection, never inferred from diff size), and WU `Class` (`none / Light / Heavy / Novel`);
- review eligibility and authority facts: ownership relation
  (`self / foreign / mixed / ownerless / not-applicable / unknown`) and surface authority
  (`planning-grooming / ordinary / design-authority / constitutional / unverifiable-derived / unknown`); and
- effective method activation.

These are ARC concepts. Project adapters own the bindings that normalize raw host identity, exact-ref Owner lookup,
concrete path predicates, and provider configuration into that record. The self-hosting gate's `auto / reviewed`
lane remains a derived presentation, not an input enum. Project customization consumes the same versioned closed
record and may emit namespaced reasons; it cannot append untyped facts.

The default reducer applies ordered effects. Code-bearing, sensitive, malformed, foreign/mixed/unknown ownership,
and elevated-authority facts can promote an obligation but never weaken the risk floor. Routine planning-grooming
artifacts with self or ownerless ownership are ARC-auto-eligible and may remain independent-analysis `exempt`;
otherwise routine documentation is `recommended`. The **vehicle** (errand vs work-unit) never weakens the per-change
baseline; **declared atomic character** does soften within the routine tier only — routine code-bearing with atomic
character resolves independent analysis to `recommended` (and frontline to `offer`) — but never across the sensitive
floor, which holds at every determinacy. `Class` does not reclassify risk or mechanically add provider requests: the
default uses it only to select WU assurance output — `none` for unscoped changes, Errands, and `Light`;
`terminal-aggregate` for `Heavy` / `Novel`. Auto-eligible formative planning remains exempt even inside a
`Heavy` / `Novel` WU. A project that wants `Class` to strengthen per-change obligations must encode that promotion
explicitly in its versioned typed policy, where it enters `policyVersion`. The ordered effects above are the settled
shape, not the exhaustive function: `create-spec` must formalize the reducer as a deterministic **total mapping** over
the closed record — every fact combination resolves to exactly one obligation set — so no per-change decision is left
to "figure out later."

V1 core reasons include `unknown-change-set`, `auto-eligible-planning`, `reviewed-routine-documentation`,
`routine-code`, `atomic-determinate`, `atomic-softened`, `sensitive-change-set`, `self-owned-artifact`,
`ownerless-artifact`, `foreign-owned-artifact`, `mixed-ownership`, `unknown-ownership`, `design-authority`,
`constitutional-surface`, `unverifiable-derived-surface`, `self-review-inactive`, `frontline-inactive`,
`frontline-policy-skip`, `frontline-policy-offer`, `frontline-policy-attempt`, `invocation-force`, `invocation-skip`,
`source-invocation`, `source-developer`, `source-project`, and `source-unbound`. Project policy codes use the
registered `project:<policy-id>:<code>` namespace and enter `policyVersion`. The CLI computes the effective
per-deliverable obligations, frontline action, and `assuranceMode: none | terminal-aggregate`. Provider and
host-channel selection remain adapter/project decisions, so `local-only` or `local + PR` is a derived presentation
rather than another technical enum.

#### Multi-PR assurance — forward-compat seam with `pr-decomposition`

Review routing derives the truthful obligation for each **deliverable** independently. When a work unit emits more
than one PR (`pr-decomposition`), the framework contract holds one principle and one seam — not a built-in grouping
algebra authored ahead of that WU's settled shape:

- **Principle (no mechanical multiplication):** PR count must never mechanically determine review count. One exact
  review run may satisfy several deliverables' obligations only when coverage is provably preserved — no policy
  weakening, an exact ordered manifest, one reviewer can still cover the surface without attention dilution, and the
  carrier can present and prove the complete range. Absent that proof, the plan falls back to ordinary per-PR review.
  This preserves every deliverable's blocking risk floor.
- **Seam (per-requirement projection):** the gate projection binds one independent-analysis requirement per
  normalized change set (§ Gate projection contract). A future **assurance plan** may bind several compatible member
  requirements to one review target without weakening or duplicating any member's floor. The single-deliverable
  contract is complete on its own; the multi-member binding is a strictly additive extension.

The full assurance-group / seam-universe / series-membership algebra — group-requirement derivation, exact tree-pair
equivalence, carrier-capability coalescing, latest-incident seam ownership, all-member merge barriers, and terminal
aggregation — is **routed to `pr-decomposition`** to design against its own settled delivery mechanics (deliverable
refs, cumulative-carrier shape, merge-consumption proof) rather than specified here ahead of them. It is preserved in
full as inherited input, staged in the reciprocal `USER-INBOX` capture for the housekeep drain to route into
`pr-decomposition`'s inbound buffer (durable once that sweep lands) — not discarded.
This WU owns the single-deliverable obligation contract, the no-weakening principle, and the per-requirement
projection seam; `pr-decomposition` owns the grouping algebra that consumes them.

This scales the review mechanism, never the engineering bar. `quality-gate-commands` remains `Class`-invariant;
review routing determines which review obligations and actions apply. The method records the metering economics
(separate provider pools, PR-specific adaptive throttles, and repeated heavy-CI cost) as rationale.

#### Gate projection contract

The host-side gate consumes only the independent-analysis obligation for the normalized exact change set. Author
self-review stays a workflow obligation, and frontline action/result never crosses the satisfaction boundary. The
projection is a lossless mapping, not a second policy decision:

```yaml
independentAnalysis:
  obligation: exempt | recommended | required
  reasons: [reason-code, ...]
  rubricVersion: independent-analysis/v1
  rubricDigest: digest
  retrigger: none | incremental | full-final
```

`exempt` emits no gate requirement but remains an explicit policy decision with reasons. `recommended` emits a
visible, non-blocking requirement; `required` emits the same requirement shape as blocking. Project gate policy then
adds acceptable source kinds/qualifiers and automatic-vs-checkpoint admission — host mechanics that do not belong in
review routing — before binding `changeSetId`, `headSha`, and `policyVersion`. V1 fixes `count: 1`: one requirement is
satisfied by one qualifying source chain. Multi-reviewer assurance, if later justified, uses separate requirements
until coverage reduction defines counted independent chains explicitly. The valid policy pairs are `exempt + none`
and `recommended|required + incremental|full-final`; a non-exempt obligation cannot select `none`.

The resulting requirement carries `rubricVersion + rubricDigest`, retrigger treatment, typed reasons, and the exact
change-set identities. `policyVersion` hashes the normalized obligation plus project source/admission policy, rubric
identity, and retrigger treatment. A source qualifies against the rubric pair, not the version string alone; its
carrier-specific `guidanceDigest` remains an additional proof of what it received.

The gate then binds the projected requirement to a review target and request. V1's committed shape is the
single-deliverable case; the multi-member `assurance-group` target and its cross-PR satisfaction projection are the
additive extension routed to `pr-decomposition` (§ Multi-PR assurance):

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
  sourceIdentity: id
  generation: integer
  requestMechanism: id
```

V1 permits one repository per target. One request is admitted and recorded against one concrete carrier; a hosted
carrier must expose the complete target range on its named change request. The request identity binds the repository,
carrier adapter/change-request id, target, requirement, source, generation, and mechanism; its terminal receipt binds
`requestId + reviewRunId + targetId + provider event identity`. Retargeting or mutating the carrier during an active
flight invalidates the flight. Cross-repository targets and one provider event observed through several carriers are
unsupported in V1.

This WU owns a forward-only gate-contract version bump for those semantic fields; it does not mutate the current
schema-v1 exact-key contract in place. The new requirement/evidence identities bind `rubricDigest`,
`reviewTarget.targetId`, and `retrigger`, and `policyVersion` includes them. Current v1 receipts and evidence are
ineligible for the new requirement rather than silently upgraded, which is safe while the controller is not merge
authority. `cli-substrate-adoption` owns the shared schema-version mechanism and registry API, but not this
compatibility decision. Review-gate qualification / promotion retain live-provider proof and required-check cutover;
the normalized contracts, reducer behavior, strict parser migration, and stale-membership tests are implementation
scope here. (The group-receipt and series-membership contract kinds land with `pr-decomposition`.)

Coverage starts with one full review from the target's diff base through its requested head. `incremental` permits a
contiguous same-source chain after approved fixes; every link is exact and the chain must reach the current target
head. `full-final` may use incremental passes for feedback, but satisfaction requires a final full review of the
settled target. `none` is the exempt treatment and creates no review request. A head change that does not touch the
reviewed surface — the lifecycle-bookkeeping-tail, and a base-reconcile whose merged changes are **disjoint** from the
reviewed paths — carries review evidence forward under `none`; an **interacting** base-merge or a conflict-resolving
merge retriggers `incremental`, scoped to the interaction only, never a full re-review. These are typed applicability
proofs; none silently broadens target coverage.

ARC ownership relation, artifact authority, work context, `Class`, review risk, and change determinacy enter routing
as normalized facts; raw host lane labels and project classifier names do not enter the requirement. When
`pr-decomposition` lands, it supplies the authored assurance plan and series-membership proofs; the gate validates
those typed inputs but neither counts PRs nor infers topology from host containers.

#### Shared change-fact classifier

CI run weight, review risk, ownership/authority eligibility, and review obligations remain different decisions, but
they must consume the same pure path facts. The CLI owns one changed-path fact resolver that returns at least
known-vs-unknown change set, code-surface membership, and stable named surface memberships. Consumers map those facts
independently:

- CI maps code-surface facts plus its verified-tree history to `light / heavy` scheduling;
- review risk maps code and project-sensitive surfaces to `routine / sensitive`;
- the ownership/authority resolver combines exact-ref ARC Owner data with those facts to emit normalized ownership
  relation and artifact-authority reasons; and
- review routing combines those facts with work context, change determinacy, `Class`, risk, and activation to emit
  obligations, frontline action, and WU assurance mode — and computes whether a base-merge's changed paths are
  disjoint from or interacting with the reviewed surface, for the retrigger carry-forward above.

The fact resolver consumes changed-path records, not destination strings:
`{ status: added | modified | deleted | renamed, path, previousPath? }`. A deletion classifies its deleted path; a
rename classifies the union of old and new endpoints, and either endpoint can establish code or sensitive-surface
membership. Missing required rename metadata, an unknown status, an empty set, or malformed input fails closed at
the fact boundary. The verified-tree Checks-API lookback, ownership/meta reads, and policy mappings are not reusable
facts and stay with their consumers. Raw host identities, path predicates, provider ids, and `auto / reviewed` lane
presentation stay in the project adapter; their normalized ARC reasons are what routing and requirements retain.

For this repository, the path predicate currently authoritative in `scripts/classify-change.sh` moves behind the CLI
resolver; the shell entry becomes a compatibility/CI adapter and supplies status plus both rename endpoints rather
than remaining a second implementation. The review gate's current TypeScript-extension-only
`derivesCodeSurface()` approximation retires — it misses package manifests, shell, fixture, workflow, and project-
extension surfaces that the canonical predicate correctly treats as code-bearing. Risk-specific project paths remain
project policy layered over the shared facts.

### 2. Review roles, methods, and rubric

A review pass factors into three orthogonal things, and the roles name points in that space rather than overlapping
bundles: a **carrier** (who reviews — author / fresh-agent / hosted / human), a **rubric** (the lens applied), and an
**evidentiary role** (advisory vs. satisfying). The naming discipline that keeps them crisp: **`-audit` names a
rubric/lens; `-review` names an activity/cycle.** An activity applies a lens.

- `self-review` — rename of `diff-review`; the authoring agent reviews its own aggregate diff. Carrier = author;
  advisory by construction (the existing non-evidence contract carries forward).
- `frontline` (`frontline-review` method) — a **fire-point**, not an evidentiary tier: the pre-publication local pass
  that shapes what a downstream external reviewer receives. Advisory by construction; it exists only when there is a
  downstream reviewer. "Frontline as the only review" is a category slip — a satisfying local pass is
  `independent-analysis` carried locally, not frontline.
- `implementation-audit` — the default **rubric** for review of a change's realization: intent/scope,
  correctness/failure behavior, trust/compatibility, verification, coherence/maintainability. It completes the
  `design-audit` → `task-audit` → `implementation-audit` lens family (medium-agnostic — it covers doc-only review as
  well as code), and is overridable per the method extend/replace model.
- `independent-analysis` — the satisfying **obligation/standard**: a non-author evaluator covers the complete exact
  change set from source, applies the bound rubric (`implementation-audit` by default), and emits an attested receipt
  at the exact head. The name denotes the property an obligation asks for; the lens is the rubric. Attestation is the
  receipt that makes a rubric-meeting pass _satisfying_ — not a separate method.
- `review-response` — the respond-to-received-findings cycle, replacing integration's inline content.
- `review-triage` — source-agnostic classifier used by every finding-producing role; classifies each finding on two
  axes — **severity** (a shared primitive, § 4) and **disposition**.

**One mechanism across the lifecycle.** `adversarial-review` is the fresh-agent _mechanism_ — context isolation,
primary-held judgment, `Class`-scaled passes — for every stage: `design-audit` / `task-audit` in planning,
`implementation-audit` at integration. Frontline and a local satisfying `independent-analysis` are fire-points/roles
over that one mechanism, differing only by evidentiary role (advisory vs. attested receipt) and position. This reuses
the shipped spawn doctrine rather than inventing a second, and makes local review first-class: a solo/small-team
project can satisfy `independent-analysis` with a local `adversarial-review` + `implementation-audit` pass and no
hosted provider at all.

`peer-review` is not the hosted-review abstraction and does not need to ship for symmetry. A future optional entry
may marshal context for a person or interactive agent intentionally reviewing another change, but the reusable
contract is `independent-analysis`. A hosted source unable to receive or demonstrate the bound rubric remains useful
advisory input but cannot claim satisfaction of that rubric version. Specialized project rubrics — the thermonuclear
maintainability skill is one example — augment the baseline and satisfy it only when all baseline dimensions are also
covered.

Hosted and human bindings use their native carriers; all carriers keep author beliefs, suspected weak spots,
preferred fixes, and self-verification claims out of first-pass context.

**`spec-review` boundary.** `spec-review` is the author's coherence-and-grounding self-review of a spec — an
_activity_, the planning analog of `self-review`; its coherence/grounding criteria are the lens the planning
`adversarial-review` applies, so it is not a rubric misnamed `-review`. The framework-wide `-audit` / `-review` rename
cascade (if any) is a `naming-conventions` concern; this WU keeps its own surfaces coherent.

#### Independent-analysis standard and delivery contract

The satisfying obligation is the shipped `independent-analysis` standard; the lens it applies is the
`implementation-audit` rubric (default, overridable). The standard is not a new knowledge/rubric document family, a
peer-review workflow, or review-gate policy. It owns one typed contract record whose semantic fields are:

- **version:** `independent-analysis/v1`;
- **coverage:** the complete exact requested change set, not a sample or only the latest fix;
- **evaluator boundary:** a non-author evaluator works from source and governing project context, without author
  conclusions, suspected weak spots, preferred fixes, or self-verification claims;
- **rubric:** the bound lens — `implementation-audit` by default (intent and scope; correctness and failure behavior;
  trust boundaries and compatibility; verification quality and missing cases; coherence and maintainability),
  overridable per the method model and augmentable by a declared overlay (§ Cross-cutting);
- **finding floor:** every actionable finding states materiality, a stable code/document locus, source-grounded
  evidence, and why the change fails the rubric; and
- **clean rule:** a clean result is legal only after all rubric dimensions have been considered across the full
  requested change set. Unavailable, partial, ambiguous, or failed review is never clean.

The typed record is structure, not prose control flow. Its schema composes with the shared kernel; the method is the
human-authored public home, and build/validation tooling projects the record into runtime constants and carrier
payloads instead of repeating the version and dimensions by hand. A normalized `rubricDigest` covers the identity
contract above. Changing any identity field requires a version change in the same reviewed commit; editorial method
guidance may change without a version bump only when the contract and digest remain stable.

Delivery adapters expose the rubric through each reviewer's native carrier:

- a local fresh agent runs it as `adversarial-review` under `implementation-audit` and emits an attested receipt at
  the exact head — the first-class local-satisfying path;
- hosted Codex receives a managed `AGENTS.md` review-guidelines projection plus the owned trigger;
- another hosted provider receives its provider-instruction/configuration projection when that carrier can deliver
  and prove the complete contract;
- a human receives the equivalent checklist and exact-change-set coordinates.

These are projections, not additional authorities. Each includes the rubric version and baseline payload; project
guidance may add context or a specialist augmentation but cannot delete or weaken a baseline field. Adapters resolve
the effective instructions for the exact changed paths, mechanically validate that the baseline projection is
present and unambiguous, and record a `guidanceDigest` for the actual carrier content. A missing, stale, conflicting,
or unverifiable projection leaves the source advisory and non-satisfying.

V1 preserves the current hosted Codex qualification rule: every changed path must resolve to the same effective
guidance set. Project context or specialist augmentation qualifies only when it is root-scoped or repeated
identically across the requested change set; differing nested instruction sets remain conflicting and therefore
advisory. Composing several path-specific rubrics into one provable request is future adapter work, not an implicit
relaxation of this contract.

Gate binding therefore carries both identities: `rubricVersion + rubricDigest` prove which evaluation contract was
required, while the source qualification's `guidanceDigest` proves what the reviewer actually received. The reviewer
never receives the ARC coordination workflow, controller state, author dispositions, or a finding hypothesis. This
is neutral criteria and coverage, not an authored interpretation of the change; evaluator independence remains in
the evaluator and its source-grounded analysis.

Specialist review augments rather than replaces the baseline. For example, a thermonuclear maintainability pass may
add stricter maintainability questions, but it satisfies `independent-analysis/v1` only when the same run demonstrably
covers every baseline dimension and output rule. Its specialist identity remains separately visible so downstream
policy can distinguish baseline satisfaction from the additional assurance.

#### Review-response contract

`review-response` is the channel-neutral author-side cycle after a finding-producing run. Its inputs are the exact
review target, the source-normalized findings and loci, the effective `review-routing` result, and adapter capability
handles — never provider command prose. It runs one bounded sequence:

1. verify each finding against source, classify it with `review-triage` (severity × disposition), and obtain approval
   for the complete disposition set before mutation — this is the human checkpoint;
2. apply approved `fix` dispositions as one review increment, run affected quality gates, and let the caller's
   commit/push interlocks persist the result; `defer` / `reject` leave the head unchanged;
3. return the approved dispositions, verification evidence, and old/new exact target to the adapter so it can record
   audience-visible replies and closure with its own authority; and
4. when the head changed, return to `review-routing` and the channel adapter for the permitted retrigger — a
   non-interacting change carries evidence forward — rather than choosing or invoking a provider inside the method.

Completion means every received finding has an approved disposition, every approved fix is verified and persisted,
and any channel-owned blocking conversation has either authoritative settlement or an explicit still-blocking result.
The method never equates thread resolution with authority.

**Waiting spans the review by suspend-and-reenter, not a live in-session pin.** When a review is asynchronous (a
hosted PR review of minutes — or, under a provider's adaptive throttle, the very condition this WU meters (§ Problem),
an hour or more), the cycle does not pin one live session across the wait. It reuses the shipped resilient model:
`Integrating` is a suspend point (`integrate-work-unit`), state persists to the meta, and a later session — or
machine — re-enters. Re-entry is driven by an **automatable re-entry trigger** through a capability-gated seam, so the
human is not the mechanical next-step — in priority order:

- the promoted **review-gate watcher** — the canonical host-neutral auto-trigger (a soft co-design seam with the
  review-gate promotion/adapter chain, not a prerequisite);
- a **harness-native scheduled wakeup** where the harness exposes one — the interim auto-trigger: arm a re-entry
  wakeup, and on wake re-check review readiness via the established detection path (raw host state today; never the
  half-wired controller during integration), then re-suspend, proceed, or time out;
- **human / next-session re-entry** — the always-available floor, and here the fallback is **explicit**: the agent
  announces that it is suspended awaiting the review and that resuming it is the human's to trigger (with when and
  how), so the degradation is legible and never a silent stall.

The detection query is cheap either way (raw host state today; the review-gate's typed aggregate projection once
promoted). A bounded timeout or provider failure surfaces as an exception (a human re-entry point), never a silent
hang and never treated as clean. Suspend-and-reenter is authoritative because it survives session, compaction, and
machine death; a bounded in-cycle wait is only a happy-path optimization for short reviews that times out into the
same suspend-and-reenter. Neither path tends the half-wired controller pre-promotion.

This is the reusable cycle graduated from integration and the project coordinator; exact controller actions, await
loops, receipts, replies, and thread mutation stay adapter-side.

### 3. `frontline-review` as an opt-in ARC feature

Frontline is a **fire-point**: privately expose the aggregate change set to a distinct reviewer _before_ opening the
change request, so obvious findings resolve without public review churn. This is attention and spend shaping — the
public reviewer receives less noise, spends attention on residual high-signal concerns, and needs fewer hosted repeat
passes and fewer tokens. Advisory by construction: it never emits a satisfying receipt (a satisfying local pass is
`independent-analysis` carried locally, a different role). Promote the fire-point into the integration and Errand
creation paths; the generic `pre-pr-open` extension remains available for unrelated project actions but no longer
owns the semantic feature.

The method contract is provider-neutral:

1. review the aggregate candidate diff from a context distinct from the author;
2. apply the selected reviewer binding without prescribing a provider;
3. verify, disposition, and approve findings through `review-triage` before fixes land;
4. after at least one approved `fix` disposition at `major`+ severity changes the review target, allow one bounded
   follow-up according to project policy; `minor`-only changes (nits included) do not spend a second frontline pass;
5. report unavailability or pass-cap exhaustion without calling it clean; and
6. never discharge independent-analysis obligations — a satisfying pass is a separately-reserved
   `independent-analysis` run with the complete rubric and a qualifying receipt.

**Action comes from the shared router, not a second policy.** The `skip / offer / attempt` action is the Frontline
column of the § 1 obligation matrix — one router emits both obligations and frontline action. Frontline then adds
only what is genuinely its own: a source and an execution stage. Three inputs feed one deterministic resolver:

- **Method activation (project-static):** `frontline-review.active`, default `false` — the method-activation model,
  not an activity toggle in config. An inactive method always resolves to `skip`.
- **Source (a fallback chain):** invocation source → developer preference → project default → unbound. A source is a
  minimal carrier reference `{ kind: agent | command, ref }`: `kind` selects a carrier adapter and `ref` is opaque to
  the resolver — not a shell fragment and not a qualifying reviewer identity. The developer preference is a
  user-scoped private preference carried through the storage abstraction (git config today), not tracked project
  policy.
- **Invocation override (one run):** `mode = inherit | force | skip` plus an optional source. `force` temporarily
  activates the role and overrides a policy `skip`; `skip` accepts no source; `inherit` plus a source replaces only
  source selection. Action precedence is invocation `skip` / `force` over activation + the router's action.

The resolver emits the semantic record below; exact Zod syntax, registry calls, and version annotations wait for the
shared schema kernel:

```yaml
frontlineReview:
  action: skip | offer | attempt
  reasons: [reason-code, ...]
  source: null | {kind: agent | command, ref: string}
  maxPasses: 0 | 1 | 2
  promptText: null | string
```

`skip` always carries `source: null`, `maxPasses: 0`, and no prompt. `attempt` requires a **selected** source
reference, not a probe-proven available provider. When the action calls for a run but source selection is unbound,
the action is `offer` with a precomposed binding remedy rather than `skip` or a fabricated clean result. Projects may
reduce the pass allowance; V1 never exceeds the initial pass plus one follow-up after an approved `fix` disposition
changed the target.

Resolution is explicitly **two-stage** — this is load-bearing, not ceremony. The pure CLI resolver above selects an
opaque candidate without executing or probing it. Only after an `attempt` or accepted `offer` does the carrier
adapter resolve the ref and check availability/authorization. For `kind: agent`, routing intent is _not_ spawn
permission: the adapter preserves the active harness's delegation-authorization contract and turns
`needs-authorization` into the precomposed offer before spawning, so project activation never becomes standing
process-creation consent. A missing candidate produces the resolver's `offer`; a present-but-invalid, unavailable, or
rate-limited candidate produces the execution outcome `unavailable`.

Execution returns a separate provider-neutral outcome — `clean / findings / unavailable / failed /
pass-cap-exhausted` — with the resolved source and pass count. Only `clean` means the selected source completed and
reported no findings; missing, ambiguous, rate-limited, or failed output cannot normalize to clean. Findings enter
`review-triage`. No ordinary frontline outcome emits an independent-analysis receipt.

For this repository, the existing CodeRabbit CLI action becomes the initial project-policy override: code-bearing
changes attempt a frontline pass, documentation skips it even when review risk independently requires hosted review,
an approved `fix` change may trigger one follow-up, and rate-limit or tool failure reports then continues. That run
remains pre-publication cleanup even when hosted review is planned. Only a separate explicit CodeRabbit CLI
invocation under the full attestation contract can act as satisfying review evidence. The current heavy-CI defer
action remains an ordinary `pre-pr-open` extension action.

### 4. `review-triage` contract upgrade — the disposition invariant and the two axes

Upgrade the contract block (override-proof) to carry two orthogonal axes and three legs.

**Two axes.** Every finding carries a **severity** and a **disposition**, separated because the old
`FIX NOW / MINOR FIX / DEFER / REJECT` set conflated them (two members split on severity, two on action):

- **severity** — the shared primitive `blocker / major / minor`, the exact three-level enum `adversarial-review`
  already fixes across every fire-point, reused verbatim (DRY — one taxonomy across planning audits and code review,
  never extended here);
- **disposition** — the decision `fix / defer / reject`. Orthogonal to both axes, a code-review **`nit` flag** marks
  a pure-polish `minor` the reviewer will not block on (the "nitpick" idiom; Conventional-Comments' `(non-blocking)`
  decoration). `nit` is a non-blocking marker on a `minor` finding — **not** a fourth `severity` level and **not** a
  fourth `disposition` value (an author may still `fix` or `defer` a nit); create-spec represents it as an orthogonal
  flag so the two-axis split is not quietly re-conflated. It is code-review-scoped and never reaches `design-audit` /
  `task-audit`, whose findings map only into the three-level severity enum.

Severity drives deterministic gating (blocker/major must settle before merge; `minor` is recorded and, by policy,
may be non-blocking — the `nit` decoration marks the pure-polish minors a project treats as never-blocking — a
scaling knob), which is what lets integration proceed without a "should I do another round?"
prompt. Adapters with only `fix / defer / reject` retain severity in the disposition record.

**Three legs (override-proof):**

1. every finding gets an explicit, documented disposition (already present), now with its severity;
2. findings are **verified against source with the agent's own judgment** — never accepted on reviewer authority
   (anchors to DEV-RULES.ARC § Sub-agent scope: delegated outputs are advisory until verified);
3. the disposition set is **presented to the user for approval before fixes land** — severity, classification,
   recommendation, and open questions surfaced as a report, so the user can redirect before any commit.

The procedure (severity rubric, report format, commit-message record) stays in `.default`, overridable. A concise
DEV-RULES.ARC anchor also ships: verify delegated findings independently and obtain approval for the disposition set
before applying fixes. The invariant is behavioral and high-miss-cost, so it cannot live only in an on-demand method;
the method remains the procedural detail home.

### 5. Disposition etiquette — the channel split

- **Method (channel-neutral principles):** every finding's fate is recorded _where its audience can see it_;
  closure is explicit; never emit noise surfaces nobody reads.
- **Adapter/coordinator (host mechanics):** for GitHub — reject/defer dispositions reply in-thread when the
  finding has its own comment; findings without a dedicated comment get no response (no rollup-comment noise);
  threads are resolved when no further round is coming; when a round _is_ being triggered, the reviewer gets
  the chance to resolve first. Local reviews have no response surface — the disposition report is the record.
  `coordinate-pr-review`'s existing controller-normalized-findings vs provider-native-conversations split (with
  distinct closure authority) is the frame these rules slot into.
- **Routing method:** whether a retrigger is worth spending (§ 1).

### 6. Method/config migration + settled hook vocabulary

- `diff-review` → `self-review` — the method names the author-side activity it performs.
- `implementation-audit` is minted as the integration-stage review **rubric** (completing `design-audit` /
  `task-audit`); `independent-analysis` keeps its name as the satisfying **standard**. The `-audit` = lens /
  `-review` = activity discipline is stated for this WU's surfaces; the framework-wide rename cascade (and any
  `spec-review` re-slot) is a `naming-conventions` concern.
- `review-triage` adopts `adversarial-review`'s shipped three-level `severity` enum (`blocker / major / minor`)
  verbatim — one taxonomy across planning audits and code review — alongside its `fix / defer / reject` disposition,
  plus a code-review-only non-blocking `nit` flag on pure-polish `minor` findings (nit is an orthogonal non-blocking
  marker, not a fourth severity or disposition value; the shipped enum is unchanged).
- `review.pre_merge` retires rather than renames. `self-review` gains the method-activation axis owned with
  `customization-arch-realign`; workflow callers invoke it when active. Review obligations and project gate policy
  do not recreate the activity toggle under a new config key.
- `frontline-review` uses the same method-activation architecture but defaults inactive. Activation, smart routing,
  source binding, and invocation override remain separate axes; enabling the method never turns its result into
  independent-review evidence.
- `pre-commit-review` and `pre-push-review` retain their shipped names, files, and callsites as generic low-level
  verification extension points. They lose no capability, but they own no self/frontline/independent review role and
  produce no satisfying evidence merely because their names contain `review`. Any future vocabulary cleanup is a
  naming/cascade concern, not part of this semantic repartition.
- The action-neutral `pre-pr-open` / `post-pr-open` pair and final-state `pre-merge` hook are shipped decisions.
  This WU consumes them and reconciles workflow callouts; it does not reopen extension-family naming.
- The additive override term (`extend` vs `augment`) and any behavior-preserving cascade belong to
  `naming-conventions`, with override semantics remaining in `customization-arch-realign` and deterministic
  resolution in `composable-workflows`. This WU consumes the live spelling and does not own the rename.

### 7. Enforcement division — documented honestly

Agent-side workflow methods and extensions are ergonomics, best-effort by construction; the host-side review-gate
required check is the guarantee (it fires regardless of who presses merge — manual host-UI merges bypass every
agent hook). State this division explicitly so neither self-review nor frontline review implies enforcement it
cannot deliver. The gate's core and inactive cutover machinery now exist; qualification and promotion retain
ownership of live provider qualification, required-check authority, and project-hook activation. This WU defines
the obligation interface without claiming that enforcement is already operational.

### 8. Coordinator interface + rubric/method graduation

`coordinate-pr-review.md` now provides the project-local typed action/await and authoritative finding-settlement
loop; host/provider-neutral core behavior already lives behind its controller commands. Keep that workflow as the
project binding. Graduate only the reusable procedure into `review-response` and the strengthened `review-triage`
contract; provider triggers, host conversations, receipts, and exact command loops stay in adapters/project
workflow. Graduate the neutral `implementation-audit` rubric (delivered under the `independent-analysis` standard)
separately; adapters deliver it through native reviewer instruction surfaces without exposing controller procedure.
PR-body composition remains in the adapter layer and surfaces a non-internal `Origin` when it gives reviewers
material context. A generic workflow-pointer method override is not required for this binding and routes to
`customization-arch-realign` / `composable-workflows` rather than receiving review-specific semantics here.

## Cross-cutting

- **Review-gate seam.** Ownership relation, artifact authority, work context, `Class`, and review risk are
  ARC-normalized router inputs. The self-hosting adapter owns exact-ref Owner lookup, host-author-to-ARC-owner
  mapping, concrete path predicates, provider binding, and the derived `auto / reviewed` presentation. The gate
  consumes normalized exact-change-set requirements (`exempt / recommended / required`) projected from that ARC
  contract and binds them to the `independent-analysis` standard (default rubric `implementation-audit`); no raw host
  lane, channel enum, frontline result, or WU-cardinality assumption crosses the satisfaction boundary.
- **`pr-decomposition` follow-on.** The two WUs coordinate through the obligation contract, not cohort membership.
  Review architecture owns the single-deliverable obligation contract, the no-weakening principle, the per-requirement
  projection seam, and frontline action semantics; `pr-decomposition` owns the authored assurance plan, deliverable
  refs, cumulative review-carrier shape, merge-consumption proof, frontline placement, stack orchestration, and the
  full assurance-group / seam / series-membership algebra (extracted verbatim as inherited input via the reciprocal
  `USER-INBOX` capture, staged to route into `pr-decomposition`'s inbound buffer for it to design against its settled
  delivery mechanics). Groom it against this contract, then add `Depends On: review-architecture` before full launch.
- **Review channel posture.** A project's review channel is `local` / `hosted` / `both`, first-class and never
  assumed. `local` means the local `independent-analysis` (fresh-agent `adversarial-review` + `implementation-audit`,
  attested) is the satisfying gate evidence; the host-side gate stays opt-in and never silently activates hosted
  review. No review at all is reachable by overriding obligations to `exempt` — off the target-audience path, but not
  blocked.
- **Review overlay.** A WU may declare an additional review **rubric** (a heavier or specialized lens) as one field,
  surfaced as a `Class`-scaled offer at `create-spec` (the pattern the adversarial-review offer already uses) and
  executed automatically at integration — no mid-flow pause, no per-integration config, absent by default. The
  overlay scales the review lens _up_ by declaration; the atomic determinacy carve-out scales the obligation _down_
  by a declared character — the symmetric, floor-respecting pair.
- **Integration flow autonomy + async bridge.** During integration the human returns only at each review round's
  disposition approval and the merge gate (plus exceptions: quality-gate failure, conflict, unexpected state). The
  `integrate-work-unit` reshape realizes this: remove the compose-begin interlock; fold the composed-content surface
  into the merge interlock; auto-reconcile the base when clean/disjoint and consolidate to a single late reconcile
  right before merge (the reconcile interlock fires only on conflict or exception); and span asynchronous review by
  `review-response`'s suspend-and-reenter with an automatable re-entry trigger (§ 2) rather than pinning a live
  session or abandoning it — the canonical host-neutral trigger is the promoted review-gate watcher (a soft co-design
  seam with the review-gate promotion/adapter chain, not a `Depends On`), with an interim harness-wakeup arm and an
  explicit human-fallback so autonomy degrades gracefully. Reconcile-once-late plus the disjoint
  carry-forward minimizes mutating/triggering steps; CI necessarily re-runs on the merged head. The exclusive
  final-integration window and wait-for-parallel-shipping timing stay `integration-lane`'s (backlog) seam.
- **Determinacy / scalable-core seam.** The atomic-character routing fact is realized today via the Errand vehicle
  under full protection; its partial-protection realization seams to scalable-core's atomic tier (ADR-020, Proposed).
  Sanity-checked against `strategy-knowledge-evolution` / `strategy-procedure-evolution` per the planning-awareness
  north stars.
- **Review-gate qualification seam.** `review-gate-enforcement-qualification` must consume this WU's obligation
  contract as its trigger policy — its inbound-buffer item still references the rejected channel-lane vocabulary and
  needs repointing to `exempt / recommended / required` + the closed record — and enforce the forward-only v2
  gate-projection; add `Depends On: review-architecture` to it. The local-satisfying `independent-analysis` path
  converges with that WU's attestation-first pivot (attested local review as primary satisfying evidence) — the
  advisory→satisfying receipt seam is co-designed there.
- **`classify-change-granularity` coordination.** That WU (live, `planned`) reworks `scripts/classify-change.sh` to
  be diff-status / rename-aware for CI `light` / `heavy`, plus a classify/tree-hash identity redesign — the same
  script the shared change-fact classifier (§ 1) moves behind the CLI fact-resolver. Settled:
  `classify-change-granularity` lands first and owns the shell's status/rename classification and tree-hash identity;
  this WU's resolver **consumes** those facts rather than re-cutting them, and its "shell becomes a thin adapter"
  builds on that status-awareness. This WU carries `Depends On: classify-change-granularity`; the reciprocal capture
  is filed to that WU's inbound buffer so the surface is not cut twice.
- **Knowledge/procedure forward-compat.** Declare reusable methods at their fire sites; keep high-miss-cost
  triage constraints in DEV-RULES.ARC; compute deterministic classifiers, `skip / offer / attempt`, and rendered
  decisions CLI-side; derive any eventual schema projection and reviewer instruction binding from one typed/rubric
  source rather than hand-authoring a second contract.
- **CLI substrate seam.** This WU settles the semantic review records now. Their implementation schemas stay
  co-located with the review subsystem, derive static types from Zod, compose shared primitives, and register with
  `cli-substrate-adoption`'s kernel. Planning and specification do not wait; schema-bearing implementation waits only
  for that cohort's small kernel head, not its resolver, executor, or other members. Bind the concrete dependency once
  the decomposition cut names the kernel member. Registry API shape, the generic schema-version mechanism, generated
  artifacts, and introspection remain the substrate owners' decisions; this WU still owns the review-gate-specific
  forward-only contract bump and v1-evidence invalidation rule.
- **Developer-binding storage.** The preferred frontline source is a user-scoped preference carried through the
  configuration/storage abstraction, not another storage mode or a tracked method edit. Project activation, action
  policy, and any project-default source remain project authority; invocation overrides remain ephemeral. This keeps
  the contract compatible with the future private user store without adding a storage axis.
- **Project frontline evidence.** The active `pre-pr-open` action already performs classify-gated CodeRabbit CLI
  review and enforces the disposition guard. `frontline-review` graduates that role into the built-in creation path
  while the CodeRabbit command becomes the project binding. A clean/nits-only result may support declining only a
  **recommended** hosted review; required or already-intended hosted review still runs against the cleaner diff.
  Qualify `--agent` output across successful, findings, empty-findings, scoped-directory, and failure cases before
  replacing `--plain`; retain `--plain` as compatibility fallback if structured output cannot support reliable
  triage.
- **`customization-arch-realign` coupling.** This WU owns `review.pre_merge → self-review.active` alongside the
  method-family reshape and defines `frontline-review`'s required activation/binding semantics. Customization
  architecture owns the general activation/composition and per-developer/invocation override model; the additive
  override naming and generic workflow-pointer questions are routed to their own homes rather than riding this
  change.

## Alternatives

Carried from the pre-rescope draft (all still standing):

- **Promote `address-pr-review` to a top-level method** — rejected; name collided semantically with
  `review-triage` and mixed reviewer procedure with author-side response.
- **Leave review response inline; projects extend the workflow directly** — rejected; inline-only override forces
  out-of-tree workflow duplication.
- **Merge self-review and independent analysis into one parameterized method** — rejected; evaluator independence,
  evidence qualification, and host conversation semantics are real contract differences.

New at the rescope:

- **Fresh WU superseding `review-method-family`** — rejected in favor of rescope-in-place: the inbound buffer
  was live (entries through 2026-07-13, two of them earlier captures of the same metering problem), and a
  supersession ceremony would orphan routed captures for no design gain.
- **Supply-side remediation (CodeRabbit Pro+, additional providers) as the primary fix** — rejected as sole
  remediation: ~1.5× weekly headroom against unbounded parallel volume. Complementary providers remain an
  adapter/project option once obligation-aware metering exists.
- **Channel-combination lanes (`none / local-only / local+pr / pr-only`) as the primary model** — rejected during
  active-draft reconciliation: they conflate obligation, channel, and delivery topology; collide with existing
  review-gate and workflow uses of "lane"; and force a future multi-PR WU to multiply policy by container. Channel
  combinations derive from independent obligations instead.
- **Promote the raw self-hosting gate's `auto / reviewed` enum unchanged** — rejected: normalize its underlying ARC
  ownership and artifact-authority facts instead. Host identity mapping, path policy, and the derived lane remain
  project bindings; the framework contract is the closed fact record and normalized obligation set.
- **Keep frontline review solely as a project `pre-pr-open` action** — rejected: private noise reduction,
  reviewer-attention shaping, and hosted-pass savings are stable lifecycle value independent of CodeRabbit.
- **Treat a normal frontline result as satisfying independent analysis** — rejected: its role is pre-publication
  shaping, it carries no qualifying receipt by default, and conflation would silently weaken required hosted review.
- **Feed hosted reviewers an ARC method/workflow** — rejected: adapters deliver only the bound neutral rubric;
  orchestration state and author conclusions stay outside reviewer context.
- **Ship `peer-review` as a first-class method for symmetry** — rejected: hosted review does not execute ARC
  procedure. A later interactive entry may be useful, but `independent-analysis` is the reusable contract.
- **Build a generic provider registry in v1** — rejected: the role and binding seam are stable; project overrides
  can prove repeated provider shapes before ARC standardizes a registry.

New at the 2026-07-19 re-examination:

- **Specify the full multi-PR assurance-group algebra in this WU** — rejected: it fully specified `pr-decomposition`'s
  endgame ahead of that rough-draft WU's settled shape. The algebra is preserved as inherited input for
  `pr-decomposition` and this WU keeps only the single-deliverable contract, the no-weakening principle,
  and the per-requirement projection seam.
- **Mint a `code-audit` (or attestation) wrapper method over `independent-analysis`** — rejected as over-abstraction:
  the real split is rubric (`implementation-audit`) vs. standard (`independent-analysis`); attestation is the
  proof-carrier of a satisfying pass, not a third method.
- **Keep the single `FIX NOW / MINOR FIX / DEFER / REJECT` disposition enum** — rejected: it conflated severity and
  action; split into a shared `severity` primitive × a `fix / defer / reject` disposition, DRY'd with
  `adversarial-review`.

## Implementation Validation

- **CodeRabbit agent output:** CLI 0.6.5 advertises `--agent` as structured findings for agent workflows but does not
  publish its schema through `--help`; no stored review exists in this worktree to inspect without spending a new
  review. Qualify successful, findings, empty-findings, scoped-directory, and failure cases during adapter
  implementation. Retain `--plain` unless the structured contract proves complete and stable, so this validation
  cannot reopen the architecture or block the existing project binding.

## Scope Estimate

**Medium-Large; `Class: Heavy`** (derivation — the layer model, obligation policy, and role/rubric factoring are real
design; confirmed at the 2026-07-16 grooming read and re-settled at the 2026-07-19 re-examination). File ripple is
wide (methods/rubric × both copies, integration + Errand creation workflows, extension docs, config/binding surfaces,
strategy docs, and the project workflow) but individually small. In scope: the `review-routing` method and matrix
(with the atomic determinacy carve-out), the `implementation-audit` rubric and the `independent-analysis` standard,
the `severity` × `disposition` triage split, the review-overlay field + its `create-spec` offer, the
`frontline-review` role and resolver, `review-response` (with the suspend-and-reenter async bridge, the
re-entry-trigger seam, and the interim harness-wakeup re-entry arm), the `integrate-work-unit`
interlock reshape (compose-begin interlock removed; single-late reconcile; flow-autonomy), and the normalized
single-deliverable gate contract/reducer migration. Out of scope: the multi-PR assurance-group algebra (routed to
`pr-decomposition`), live-provider qualification/promotion and required-check cutover (review-gate-* chain), a generic
provider registry, and the exclusive final-integration window (`integration-lane`).

**Cohort fit (reconfirmed 2026-07-18):** stays one WU — one coherent concern (the layer model) re-partitioning one
surface family; the pieces are coupled by the shared doctrine, not orthogonal subsystems. `pr-decomposition` is a
distinct follow-on concern joined by an explicit contract and dependency, not a cohort member. Re-confirm at spec
time; if implementation tries to grow a generic provider registry, split or defer that registry rather than turning
this concern into a cohort.

## Readiness

**State: formalization-ready (re-settled 2026-07-19)** — a `create-spec` re-examination reopened the design,
re-settled the role/rubric factoring and the integration orchestration, and extracted the multi-PR assurance-group
algebra to `pr-decomposition`. Every settle-able design decision is resolved; the remaining CodeRabbit check is
bounded implementation validation, not architecture.

- **Resolved:** holistic charter + layer model; closed ARC-native routing record (ownership relation, artifact
  authority, work context, change determinacy, `Class`); single-deliverable obligation/action matrix with the atomic
  determinacy carve-out; `sensitive` semantics; role/rubric factoring — `implementation-audit` rubric vs.
  `independent-analysis` standard, `frontline` as a fire-point, `adversarial-review` as the lifecycle-wide mechanism;
  severity × disposition triage (the shared three-level `blocker / major / minor` severity — `adversarial-review`'s
  enum reused verbatim — with `nit` as an orthogonal code-review non-blocking flag, not a fourth level); opt-in
  provider-neutral frontline role, three-input
  resolver, two-stage source resolution; local-satisfying `independent-analysis` and the `local` / `hosted` / `both`
  channel posture; review-overlay field + `create-spec` offer; disposition invariant + DEV-RULES.ARC anchor;
  channel-neutral `review-response` cycle with the resilient suspend-and-reenter async bridge (re-entry-trigger seam +
  interim harness-wakeup arm + explicit human-fallback); integration flow-autonomy +
  `integrate-work-unit` interlock reshape + base-reconcile carry-forward; forward-only single-deliverable gate
  projection/coverage migration with `count: 1`; rename/delete-safe shared change facts; enforcement division;
  coordinator/project boundary; rescope-in-place disposition.
- **Open:** no settle-able design decision. The multi-PR assurance-group algebra is routed to `pr-decomposition`
  (staged as inherited input via the reciprocal `USER-INBOX` capture); the `review-gate-enforcement-qualification` and
  `classify-change-granularity` seam reconciliations are coordination actions, not open design. § Implementation
  Validation separately carries the non-blocking CodeRabbit matrix.
- **Next:** re-run the `create-spec` finalization (the design reopened, so this is a fresh formalization pass).
  Pending coordination actions: three reciprocal `USER-INBOX` captures are staged for the active housekeep sweep to
  route — the extracted algebra → `pr-decomposition`; the trigger-seam repoint + `Depends On: review-architecture` →
  `review-gate-enforcement-qualification`; and the shared-classifier coordination → `classify-change-granularity`.
  This WU's meta now carries `Depends On: classify-change-granularity` (impl-time seams to `cli-substrate-adoption`'s
  kernel head and `customization-arch-realign` activation stay Cross-cutting, not planning blockers).

## Provenance

Surfaced during interlock-foundation integration (PR #23 prep, 2026-04) as the inline review-response/method reshape;
graduated from `ATOMIC-INBOX.md` 2026-04-30. Scope reshaped during PR #23 review cycle 2 (directional family).
**Rescoped in place and renamed from `review-method-family` 2026-07-16**, after wave-3 parallelism burn-in
(`finalize-parallelism`) saturated external review/CI budgets and a design session settled the holistic
charter; grooming ran warm from that session.

**Re-examined 2026-07-19** during a paused `create-spec` pass: re-settled the role/rubric factoring
(`implementation-audit` rubric vs. `independent-analysis` standard; `frontline` as a fire-point; `adversarial-review`
as the lifecycle-wide mechanism), the severity × disposition triage split, the review-overlay field, the atomic
determinacy carve-out, integration flow-autonomy + the `integrate-work-unit` interlock reshape + async bridge, and
the `local` / `hosted` / `both` channel posture; and extracted the multi-PR assurance-group algebra as inherited
input for `pr-decomposition` (filed via the reciprocal `USER-INBOX` capture).

Buffer disposition ledger (through 2026-07-18; entries integrated into the body above or already departed):

- _Reviewed-lane gate contract consumption_ (routed 2026-07-13) → integrated: § 1 + § Cross-cutting (ARC ownership
  and artifact-authority facts are normalized; the raw project lane and host bindings are not generalized).
- _Reconcile charter with documented `MINOR FIX`_ (routed 2026-07-13) → integrated: body now written against
  the shipped four-way taxonomy; § 4 upgrades the contract without reintroducing `SILENT FIX`.
- _Consume `adversarial-review`'s fresh-subagent primitive_ (routed 2026-07-03) → integrated: § 2 wires the
  review directions onto the shipped invocation contract; the old `design-audit` buffer item stays departed.
- _PR body surfaces non-internal `Origin`_ (routed 2026-06-06) → integrated: § 8 coordinator graduation scope
  (PR-body composition decides what hoists from the meta).
- _Post-PR-open external-review trigger extension_ (routed 2026-06-08/21, interim noted 2026-06-24/07-10) →
  integrated: action-neutral lifecycle hooks and `coordinate-pr-review.md` now exist; § 1 owns obligations and
  § 8 keeps provider/host triggers in the project binding.
- _Content/lane-gate review extensions for doc-only ceremonies_ (routed 2026-06-10, evidence 2026-07-10) →
  integrated: § 1 — typed change facts drive obligations; lifecycle actions derive whether work remains.
- _`arc-design-audit` → departed to `adversarial-review`_ (2026-07-01) → unchanged: departed record stands;
  this WU is a consumer.
- _Multi-PR review + adversarial-verify cardinality_ (routed 2026-07-18) → integrated: § 1 + § Cross-cutting
  define the topology-neutral contract and route deliverable/group/seam mapping to `pr-decomposition`; reciprocal
  dependency capture filed.
- _CodeRabbit `--agent` output mode_ (routed 2026-07-18) → integrated: § Cross-cutting + § Implementation
  Validation retain a bounded project-binding qualification before replacing `--plain`.

---
