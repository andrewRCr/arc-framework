# Notes: evidence-applicability

- [Substrate inventory](#substrate-inventory)
- [Planning-close captures](#planning-close-captures)

## Substrate inventory

Reference material for task generation and execution: what the codebase already holds that the spec composes over,
recorded so grounding passes start from the inventory rather than re-deriving it.

- **Overlap evidence is computed and then ignored for the verdict.** `analyzeBaseOverlap` intersects the branch's
  changed paths with the base's changed paths since their merge-base and classifies each as substantive or
  regenerable; `reconcileSafety` in the checkpoint uses the result only to decide whether the typed `arc base merge`
  may run. Surfacing that computation beside the verdict is composition, not new mechanism.
- **The classifier's inert set is one path, and that is the only shared ceremony surface.** Only `ROADMAP` is
  regenerable (`current-adapters.ts`). Archives land in distinct per-work-unit directories under `.arc/completed/`
  and never overlap by path; the one file two sibling ceremonies both touch is the tracked readiness projection.
  `ROADMAP` merges locally through a custom driver (`.gitattributes`, `merge=arc-roadmap`) that the host's
  server-side merge never runs, so two regenerated renders reach the host as a textual conflict.
- **Branch-carried projections are already a recorded defect.** `roadmap-tooling` holds the target that a work-unit
  branch should not carry a project-level `ROADMAP` diff at all; `operational-state-docs` and the storage evolution
  classify `ROADMAP` as materialized operational state; `project-state-integrity` shipped regenerate-wins. The
  tracked projection is temporary, and every `regenerable` arm in the spec is written to degenerate to nothing when
  it retires.
- **Path-intersection carry already exists in the review core.** `core/applicability.ts` derived
  `treatment: carry | incremental` from `reviewedPaths ∩ deltaPaths` with no callers;
  `review-applicability-authority.ts` carries an Owner `covered` selection across a mechanically-proved segment. The
  semantic precedent for "non-overlapping movement is safe" was in code before the spec named it.
- **The Candidate attestation is already safe against base movement.** It binds the work unit's own subject digest;
  unrelated base movement leaves it `applicable / recognize-current`. Under base movement, verification does not go
  stale — only the checkpoint, review status, and delivery coordinates do.
- **`retrigger: full-final` is inert.** No behavioral consumer reads it; it participates only in requirement identity
  digests (`routing.ts`, `routing-schema.ts`, `project-promotion-schema.ts`, `reduce-command.ts`,
  `respond-command.ts`). The re-review pressure on head movement comes from the containment arms and workflow prose,
  not routing policy.
- **The terminal instant is already serialized.** `arc base merge --expected-base --expected-head` and
  `arc integrate merge --checkpoint` are compare-and-swap on exact heads; the draft lock (ADR-031) keeps the unlocked
  window seconds wide. Git's ref update serializes the merge itself on every host.
- **Merge queues are a recorded non-goal in three places** (ADR-025 doctrine over mechanism; the delivery-stack
  spec's `queue-not-atomic` downgrade; the concurrent-work research note). The one code mention,
  `native-landing.ts` `mergeAction === "queue"`, refuses or downgrades. That refusal is the minimal seam.
- **Prior decisions already point this way.** ADR-025 names the behind-base check at integration as the real safety
  net, so it must be proportionate. ADR-034 separates member review and checks (incremental) from merge acts (the
  `Integrating` window): the window is a merge window, never a review window. The native-stack design commits that
  "the protected base is never frozen" and budgets no manual recuts. The review cohort's shared goal (D7.4:
  "exact-head movement … does not by itself invalidate the applicability of prior complete coverage") states the
  same principle from the review side.
- **The applicability surfaces are ten, and they answer one question in five vocabularies.** "Prior evidence still
  holds" is `carry`, `recognize-prior-review`, `recognize-current`, `current`, and `retain-prior-attempt` across
  `core/applicability.ts`, `review-contribution-applicability.ts`, `candidate-applicability.ts`,
  `candidate-attestation.ts`, and `review-applicability-authority.ts`. "Base moved" is detected four independent
  ways (`behind`, `merge-base --is-ancestor`, OID inequality, re-observed heads). Path-set intersection is
  implemented three times with three result vocabularies. The review-contribution and Candidate classifiers are the
  same D4 algorithm twice, differing only in baseline (head versus subject digest) and in the Candidate side
  filtering by path treatment.
- **Cause-awareness is inverted relative to authority.** The base-drift read names which work unit landed and by what
  proof, and feeds only an advisory line and a set intersection; the surfaces that gate authority discard cause and
  ask a human. Only the Candidate lineage reducer knows a delta's cause (its transition kind), and it uses that for one
  thing: an unexplained delta blocks.
- **Verification and review clearance are separate objects with separate staleness.** The Candidate attestation is
  keyed to the reviewable subject digest and survives head movement; review clearance is keyed to the exact head and
  never carries. The three-valued owner choice (`covered | targeted-check | changed`) exists on the verification side
  only; the review side offers two (`covered | review-required`). The scoped re-verification transition kind
  (`verification-response`) is reachable only from the delivery-member correction path.
- **The success-criteria walk repeats only on the unexplained-delta path.** The normal convergence arm demands gates,
  not criteria. Nothing in the review-fix gate — the disposition set, `review-triage`, `review-response` — refers to
  success criteria; a comment typo and a fix that reverses a criterion produce the same outcome. Criterion text is
  already immutable and `validate-criteria` already digests criterion identity; neither is connected to the fix path.
- **The delivery subsystem already tolerates append-only target movement** outside eligibility: position facts report
  it as `targetMovement: append-only`, `suffix-reconciliation.ts` admits it as a non-mismatch, and the refresh
  planner discloses that base movement alone obligates no refresh. Eligibility's ancestry check and the two
  lifecycle-path tree comparisons are the only hard refusals on base movement.
- **The pinned-merge port already parses the HTTP status.** `HostedProcessError` carries `httpStatus` from the
  `gh` failure text (`gh-process.ts`, `parseHttpStatus`); the merge verb's catch path discards it today.

## Planning-close captures

Route via `USER-INBOX` at planning close (per the spec's Coordination section); none rests in a sibling's tracked
artifact.

1. To the review cohort: the review-lane doctrine sentence — evidence applicability follows covered content, never
   head movement as such — lands in `strategy-integration` § Review Admission and Head Movement and is cited, not
   restated, by the cohort's workflows.
2. `delivery-authoring-rebuild`: mint its stub with the narrowed boundary — this work unit says _when_ a rebuild is
   owed (the `predecessorRelation` predicate); the rebuild work unit says _how_ (commit and tree construction,
   ARC-private ref leases, detached gate placement, eligibility re-preparation) for the overlapping and
   interrupted-authoring cases.
3. To `review-activity-contracts`: the `baseContained` arm's ownership is decided here (the spec's D8 rewires it), so
   its D7.4 statement cites rather than re-decides; and the method's signature
   (`assess-evidence-applicability(delta, evidence, act) -> { verdict, residual }`), so its D7.1 statement becomes an
   invocation.
4. To `review-orchestration-right-sizing`: its doctrine-home item is discharged by the same strategy sentence.
5. Errand-sized (or to `ci-defer-heavy-reconciliation` if already in its scope): this repository's push-to-`main` CI
   runs lint, typecheck, and unit only; the doctrine contract asks base CI to run the legs that gate a pull request
   (integration, e2e, portability) or accept the reduced coverage knowingly.
6. Post-`review-signal-convergence`: merge the review-contribution and Candidate D4 classifiers into one type (same
   algorithm, two baselines); deferred because that work unit builds on them now.
7. `cohort-chunked-delivery.md` names `integration-lane` as co-owner of final-window behavior with
   `integration-boundary-accuracy`; the rename to `evidence-applicability` orphans that reference.
