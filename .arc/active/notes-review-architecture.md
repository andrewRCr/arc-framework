# Notes: review-architecture

## Contents

- Scope and proportionality boundaries
- Touched-surface map (task-gen scoping)
- Key implementation loci
- Pre-integration review record
- Integration review closure

## Scope and proportionality boundaries

The core stays one work unit because facts → routing → review projection → methods/frontline/response → workflow
rollout is one forward-contract cutover. Splitting inside that chain would create an unusable intermediate contract
or duplicate migration ownership. The separately shippable concern is mechanical lifecycle readiness: its
record/reducer, project adapter, live proof, and required-check promotion remain with
`review-gate-enforcement-qualification` and `review-gate-enforcement-promotion`.

Keep implementation at the established seams:

- Do not add a generic provider registry, assurance-group algebra, or live-controller activation.
- Do not add a storage/configuration axis. Machine-local continuity uses one storage-neutral operation-state port
  and a Git-common-directory project adapter that can later lift into the shared storage abstraction.
- Keep local receipt evidence and non-evidentiary operation state in separate authorities even when they reuse the
  same low-level bounded-lock/atomic-publish primitive.
- Make exact identities, strict v1/v2 separation, pre-mutation authorization, and version-checked local writes
  robust because they protect concrete trust or concurrency boundaries; avoid generalized machinery beyond those
  cases.
- Keep semantic-ID hardening record-specific: exact registered preimage schemas and shared golden vectors for the
  four gate join IDs, not a generic identity framework beyond the existing Kernel canonical-digest primitive.
- Close local review through one source-neutral route → request → launch → normalize → attest → reduce → response
  seam shared by WUs and Errands; do not add a resident orchestration engine.
- Keep the agent-workflow merge guard here: review settlement only enters candidate assembly, and no merge command
  is eligible before cadence-required products, complete-tail surfacing, and the final exact-head interlock.

A break-out is warranted only if implementation discovers another independently shippable subsystem, a new
storage/configuration axis, or a cleanly separable concern not required to make the core contract usable.

## Touched-surface map

Framework edits land in **both** copies (`packages/arc-framework/arc/**` source + `.arc/**` instance) unless
marked project-only. Ripple is wide but individually small.

- **Methods** — mint `review-routing`, `implementation-audit`, `independent-analysis`, `frontline-review`,
  `review-response`; rename `diff-review` → `self-review`; upgrade `review-triage` (severity × disposition, plus the
  `nit` flag).
- **Rubric / standard** — `implementation-audit` rubric; `independent-analysis/v1` standard + its typed contract
  record.
- **Workflows** — `integrate-work-unit` interlock reshape (remove compose-begin interlock; single late reconcile;
  flow-autonomy; async suspend-and-reenter); Errand-creation path (frontline fire-point); project
  `coordinate-pr-review.md` (graduate reusable procedure, keep host mechanics — project-only).
- **Extensions** — reconcile `pre-pr-open` / `post-pr-open` / `pre-merge` callouts; `pre-commit-review` /
  `pre-push-review` retain names but lose any self/frontline/independent review role.
- **Config** — retire `review.pre_merge`; add the `self-review.active` and `frontline-review.active`
  method-activation axes (coordinated with `customization-arch-realign`).
- **DEV-RULES.ARC** — concise disposition-invariant anchor (verify findings against source; approve the disposition
  set before fixes land).
- **CLI** — shared changed-path fact resolver; the routing reducer (the total mapping); the gate-projection contract
  (forward-only version bump; v1-evidence invalidation); every durable review record is Zod-authoritative and
  registers with the schema kernel.
- **Local state** — Git-common-directory local receipt authority plus a separate, non-evidentiary
  `ReviewOperationStateStore` for frontline continuity and review suspension; both reuse one bounded-lock /
  atomic-publish primitive without sharing authority.
- **Scripts** — `classify-change.sh` becomes a status/rename adapter over the CLI resolver.
- **Strategy docs** — review-channel posture, review overlay, and enforcement division where they surface.
- **Downstream qualification** — owns the lifecycle-readiness record/reducer/project adapter, bounded live proof,
  and required-check cutover; this WU supplies the independent-analysis projection and workflow merge boundary.

## Key implementation loci

- `scripts/classify-change.sh` — path predicate moves behind the CLI resolver; shell becomes a compatibility / CI
  adapter supplying status + both rename endpoints.
- `packages/arc-framework/src/scripts/review-gate/runtime/composition.ts` — `derivesCodeSurface()` (TS/JS-only
  regex) retires in favor of the canonical predicate.
- `packages/arc-framework/src/scripts/review-gate/` — gate-contract forward-only version bump; current v1
  receipts/evidence become ineligible for the new requirement.
- `packages/arc-framework/src/scripts/review-gate/policy/self-hosting/qualification.ts` — remains a project policy
  binding for review-source qualification; lifecycle-readiness implementation does not land here in this WU.
- Review-gate local receipt/storage modules — factor the existing Git-common-directory lock/atomic-publish
  primitive for separate receipt and review-operation namespaces.
- `.arc/system/workflows/project/coordinate-pr-review.md` — stays the project binding; graduate the reusable
  procedure into `review-response` + the strengthened `review-triage` contract.
- `.arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md` — reconcile the doubled `pre-push-review`
  callouts; make `review-settled` candidate entry rather than merge authority; compose and surface the exact tail
  before the final interlock.
- `.arc/system/methods/review-triage.md`, `.arc/system/methods/diff-review.md` — upgrade / rename.
- `.arc/system/arc-config.yml` — `review.pre_merge` retires.
- `.arc/system/extensions/{pre-pr-open,post-pr-open,pre-merge,pre-commit-review,pre-push-review}.md`.

## Pre-integration review record

### Why the review was chunked

The aggregate change set (307 files, ~24.4k insertions) exceeds what any single AI review invocation can navigate;
a whole-diff pass dilutes attention rather than covering the surface. The review was therefore decomposed into
eight path-scoped passes against the base branch, reviewing the aggregate delta in bounded pieces. Merge topology
was left untouched — one branch, one PR — so this is review decomposition, not a re-split into a mergeable stack.

### Coverage

Eight bounded passes over 10,789 lines covered all production code plus the shipped methodology: `src/lib`,
`review-gate/{core,policy,runtime,hosts,providers}`, `scripts/classify-change.sh`, and `.arc/system`. Package-source
mirror parity was established mechanically rather than re-reviewed: every Framework file touched here is
byte-identical across both copies, with `arc-config.yml` diverging only as the intended Configurable
package-default-vs-project-override split. WU planning artifacts were excluded as record, not change. Test
directories were not separately reviewed; their coverage is asserted by the suite itself.

### Outcome

37 findings — 12 real, 6 advisory, 14 false, 5 settled by design review. Every finding was verified against source
before disposition; no reviewer conclusion was adopted unverified. Two findings changed class under verification:
one reported as a defect proved unreachable behind an exact-equality check upstream, and one reported narrowly
proved broader than stated once its real-world path shapes were examined.

Corrected in this work unit:

- Provider `nit` detection matched the bare word anywhere in a comment body, and provider severity normalization
  set the polish flag regardless of severity. Composed, a Critical provider comment containing that word produced
  an invalid blocker-plus-polish record that threw at parse — breaking the observation pipeline. Both adapters
  carried the first half verbatim.
- The response-plan schema registered a kernel version inconsistent with its own payload version literal.
- Normalized-finding conflict detection omitted the recurrence field, silently overwriting a disagreeing candidate.
- The review-method activity boundary accepted prototype-bearing input, so inherited values could disable both
  review methods without raising a diagnostic.
- Project rubric dimensions were checked for uniqueness only among themselves, permitting collision with baseline
  dimension identities at the augmentation boundary.
- The local receipt store returned an array position instead of the ledger version on idempotent replay,
  producing an inconsistent optimistic-concurrency token.
- A carry derived from the lifecycle tail recorded the applicability identifier of a proof it did not rest on,
  attributing coverage to an identifier whose target binding need not match.
- Ownership grouping accepted cohort documents only directly beneath the planned and provisional roots, while the
  surface-authority predicate accepts them at any depth under active, planned, or provisional. Because cohort
  documents sit beside the work units they coordinate, every one of them nests a level deeper — so the grouping
  branch matched none of the cohort documents that exist, and they resolved as unrecognized rather than ownerless.

The non-author evaluator invariant, previously restated verbatim across three request-validation schemas, now has a
single definition those schemas share — a change in structure only, with behavior unchanged.

Routed onward (code paths with no production caller — `review-surface-binding` scope): frontline execution binds
its accepted CLI version to a caller-supplied string rather than the executed binary; the before/after head check
admits a return-to-origin mutation during a run; the GitHub coverage boundary never receives a byte-preserving
executor, so its lossy fallback always runs.

### Settled by design review

Five findings turned on design intent rather than further reading, and were settled deliberately. Two became the
corrections above. The remaining three are recorded as decisions so they are not re-litigated:

- **A legacy receipt's embedded request needs no additional contract binding.** The sole consumer of the versioned
  receipt parser classifies every version-1 receipt as legacy-audit-only before examining its content, so such a
  receipt cannot become forward evidence regardless of what it carries. The quarantine is structural, and tightening
  the parser would harden a path whose output is already inert.

- **The ledger-envelope path needs no nested version check.** Its sibling cross-checks because it receives target,
  requirement, and request as separate inputs that must agree; a ledger record is one self-contained envelope with
  nothing to agree with, so the asymmetry is structural rather than an omission.

- **Forward applicability stays bound surface-to-surface, not surface-to-target.** The proof is produced in process
  by the host adapter on each observe cycle and cached for that cycle; it never round-trips through storage, so it
  does not cross a trust boundary. The validator also receives no independently computed current surface, so the
  binding could not be checked without widening its inputs. The residual exposure is producer correctness, which
  belongs in the producer's own tests. **Revisit if lifecycle-tail proofs are ever persisted and replayed** — the
  record is schema-registered, so that remains possible, and the binding becomes load-bearing the moment it happens.

### Method observations

The decomposition's own failure modes were recorded and routed to the work unit that owns review chunking, so the
mechanism's cost profile is captured rather than rediscovered. In short: chunk cohesion predicts accuracy far
better than chunk size, cross-boundary claims concentrate the false positives, a full type check refutes an entire
class of them in seconds, and excluding tests from a chunk makes its verification-dimension findings unreliable.

## Integration review closure

The pre-PR aggregate self-review covered the complete `main...HEAD` change for cross-task consistency, scope,
cleanup, documentation drift, boundary behavior, and unresolved markers; it found no additional actionable issue.
The previously unreviewed fix delta then received two scoped CodeRabbit CLI `--agent` passes over its source and test
surfaces. Those passes returned six findings: four were source-verified and fixed, while two conflicted with the
implemented identity or applicability contracts and were rejected. A seventh concern raised during disposition
review replaced the provisional plain-mode CodeRabbit adapter with version-pinned structured agent output.

Disposition set `RA-8ca200585-01` closed as one review-fix increment. The resulting parser accepts qualified clean
and findings NDJSON shapes, preserves findings for author-side triage, and fails closed on version drift, malformed
or unknown events, skipped or incomplete reviews, count disagreement, duplicate terminal events or finding
identities, stale heads, rate limits, signals, and process failures. The same increment tightened explicit-polish
classification and added ownership-prefix, routing-normalization, and durable replay regression coverage.

The final local gate passed Markdown, TypeScript, and shell linting; source and test typechecking; build; 68 ARC
contract tests; and the full 7,632-test suite with one expected skip. No additional provider pass was run after the
approved review-fix increment: the remaining risk is concentrated in that directly tested 13-file delta, while a
whole-diff hosted pass over the 309-file aggregate was judged more likely to dilute or fail than improve coverage.
