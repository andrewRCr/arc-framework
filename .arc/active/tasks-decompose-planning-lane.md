# Task List: Decompose Planning Lane

- **Design:** `spec-decompose-planning-lane.md`

---

## **Phase 1:** Source reachability precondition

_Purpose:_ Guarantee that a decomposition's recorded source commit is visible to a reviewing host before the cut
is allowed to produce evidence that depends on it.

_Design decisions:_ The gate fires at execution entry, before materialization — refusal then costs nothing, the
preparation boundary stays synchronous and pure, and base advancement is untouched. Tip equality is the test
rather than reachability: it is stricter, needs only a bounded remote listing, and its false-refusal window at cut
time is negligible. An unreadable remote refuses.

### `[x]` **1.1 Refuse a cut whose source is unpublished**

- _Goal:_ A retiring branch that exists only locally cannot produce evidence a reviewer will be unable to check.

    - `[x]` **1.1.a Scope the gate to the retiring-branch shape**
        - Compared the recorded source and result-base refs at execution entry, skipping the remote read when the
          source is the configured base.

    - `[x]` **1.1.b Gate at execution entry**
        - Gated the revalidated execute command before repository occupation, candidate claiming, materialization,
          or durable preparation; the base-advancement path remains separate.

    - `[x]` **1.1.c Compare the live remote tip against the recorded source head**
        - Added a timeout-bounded single-ref `origin` query that admits only one exact, well-formed tip matching the
          recorded source head; stale, absent, malformed, duplicate, and unreadable results refuse at the source
          branch locus.

- _Outcome:_ Execution now proves a retiring source is published before any transform-owned state changes, while
  configured-base cuts and base advancement remain free of the network precondition.

## **Phase 2:** Exact-ref evidence and classification

_Purpose:_ Resolve canonical receipt authority from committed trees alone, so the decision holds in a checkout
with no index and no local branches.

_Design decisions:_ Each fact is read from the commit that holds it. Two operand groups are not tree-derivable —
the preparation, reconstructed from the receipt, and candidate ownership, which has no committed representation —
and the re-derivation obligation is scoped to exclude them rather than overclaiming.

### `[x]` **2.1 Assemble canonical facts from committed trees**

- _Goal:_ Canonical receipt authority resolves without an index and without local branches.

    - `[x]` **2.1.a Read each fact from the commit that holds it**
        - Read the receipt from the proposed head, re-derived source inventory from the recorded source commit,
          managed before states from the recorded result base, and after/output states from the proposed head.

    - `[x]` **2.1.b Pass through the operands that are not tree-derivable**
        - Reconstructed the preparation from the authenticated receipt and passed its recorded candidate ownership
          through unchanged, leaving ownership verification at the commit-time gate.

    - `[x]` **2.1.c Supply re-derived values rather than recorded ones**
        - Supplied tree-derived inventory, source units, dependencies, path states, transition patch, and
          destination outputs; the assembler reports read provenance but leaves content comparison to validators.

    - `[x]` **2.1.d Feed the existing validators**
        - Routed assembled facts through the canonical finalized validator and the existing bound
          descendant-landing validator without adding a parallel validation policy.

### `[x]` **2.2 Decide the lane over the assembled evidence**

- _Goal:_ One current canonical receipt rides beside planning-only endpoints; everything else stays reviewed or
  fails closed.

    - `[x]` **2.2.a Preserve the narrow endpoint exception**
        - Admitted only one authenticated current receipt addition and applied the existing planning path/mode
          grammar independently to every other endpoint; all other evidence and rider shapes stay uncleared.

    - `[x]` **2.2.b Settle cardinality on the two-point diff**
        - Qualified exactly one added receipt endpoint, refused multiple or mutated evidence claims, and left
          receipts absent from the diff outside the exception.

    - `[x]` **2.2.c Settle shape before running the validators**
        - Compared the exact endpoint set with the receipt transition plus receipt path before either validator;
          any rider resolves reviewed without interpreting its receipt evidence.

    - `[x]` **2.2.d Map both refusal vocabularies onto the outcomes**
        - Mapped unavailable object/snapshot/binding evidence to reviewed and content disagreement to invalid,
          preserving read provenance independently of validator kind and reporting one stable refusal locus.

    - `[x]` **2.2.e Separate the outcome streams**
        - Kept stdout to `planning`/`reviewed`, sent invalid loci to stderr with a nonzero status, returned usage
          status 64 for malformed operands, and stopped downgrading unexpected handler failures.

    - `[x]` **2.2.f Register the command's input surface**
        - Extended the registered exact-object operands to SHA-1/SHA-256 pairs while retaining the reconciled
          repository option and existing shared Git subprocess boundaries.

## **Phase 3:** Host binding and one decision surface

_Purpose:_ Bind the decision to a pair the host confirms live, and make every caller share one implementation.

_Design decisions:_ Liveness is confirmed where credentials exist. Each side needs a different live operand: the
head from the live change object, the base from the base branch's current tip — a change object's recorded base
pointer does not track the branch, so comparing it against itself always agrees.

_Note:_ every edit in this phase that touches a framework-classified host-policy asset carries the package-source
and parity obligation stated in Phase 4.2; it is not deferred to that phase.

### `[x]` **3.1 Consume the existing bound recheck**

- _Goal:_ One refusal vocabulary covers the pair-resolution race.

    - `[x]` **3.1.a Call the bound entry point**
        - Routed the exact-ref lane through `validateBoundDescendantBaseLanding`, retaining its resolve, validate,
          and re-resolve contract without adding a second binding race vocabulary.

### `[x]` **3.2 Confirm liveness in the host**

- _Goal:_ A pair that moved between classification and publication publishes nothing.

    - `[x]` **3.2.a Extract the comparison into an invokable script**
        - Shipped `confirm-live-change-pair.sh` to re-read the open change head and live base-branch tip, refuse
          either race, and preserve the in-repository/open-change checks before either writer posts success.

    - `[x]` **3.2.b Enumerate each publishing job's permissions**
        - Enumerated contents-read, pull-request-read, and status-write on both publishing jobs, with trusted
          workflow-SHA checkouts supplying the installed comparator.

### `[x]` **3.3 Route every caller through the one command**

- _Goal:_ The lane resolves identically wherever it is asked, and no caller downgrades a refusal.

    - `[x]` **3.3.a Replace the parallel reducer call**
        - Routed `classify-change.sh planning-lane` through the built `arc review planning-lane` command and
          preserved its stdout, stderr locus, and exit status without a reviewed fallback.

    - `[x]` **3.3.b Build the command from the trusted checkout**
        - Installed and built the classifier in the trusted checkout before fetching the proposed head into the
          separate `_arc_change_data` repository.

    - `[x]` **3.3.c Update the assertions this phase invalidates**
        - Replaced capability-probe, reducer, permissive-fallback, writer-permission, and one-sided liveness
          expectations with command propagation and executable two-sided host comparison coverage.

## **Phase 4:** Opt-in host security coupling

_Purpose:_ Change receipt ownership only where exact-head clearance and base currency are already enforced.

_Design decisions:_ Eligibility and the edit that depends on it belong to one command, because a step described in
a recipe cannot be distinguished from a step that works. Base currency accepts either an up-to-date-branch rule or
a merge queue, and the command reports which mechanism satisfied it rather than a bare boolean.

### `[x]` **4.1 Compute and apply the ownership exception**

- _Goal:_ The exception exists exactly where its guards do, and both the verdict and the edit are provable.

    - `[x]` **4.1.a Add the command surface**
        - Added `review planning-lane-ownership` with repository, base branch, required context, and ownership-file
          operands, an explicit `--apply` mode, and the corresponding command-input registration.

    - `[x]` **4.1.b Resolve eligibility across the enumerated mechanisms**
        - Added three independently executed GitHub reads for branch protection, active status-check rules, and
          merge-queue rules, preserving guard provenance and distinct absent-versus-forbidden verdicts.

    - `[x]` **4.1.c Apply the exception on an eligible verdict**
        - The explicit apply mode appends the receipt namespace only after an eligible host verdict and only to a
          trailing unowned block; ineligible, already-applied, and unsafe ordering cases leave the file unchanged.

    - `[x]` **4.1.d Keep the shipped skeleton free of the exception**
        - Kept the package-source and project CODEOWNERS skeletons free of the receipt exception.

    - `[x]` **4.1.e Preserve one-way coupling**
        - Added no host-rule, merge-queue, auto-merge, or implicit ownership mutation; clearance installation remains
          independent, while the ownership exception alone depends on the verified guards.

- _Outcome:_ One machine-readable command now binds host eligibility to the only ownership mutation it permits;
  an unreadable mechanism, missing guard, or unsafe CODEOWNERS ordering fails closed without changing the file.

### `[x]` **4.2 Keep the host-policy assets in one direction**

- _Goal:_ Setup guidance, recipes, workflow, and ownership never drift between the two copies.

    - `[x]` **4.2.a Edit the authoritative copies**
        - Updated the package-source ownership skeleton, clearance workflow, merge-gate recipe and readme, setup
          guidance, and initial-setup guidance with the guarded receipt-ownership posture.

    - `[x]` **4.2.b Mirror and confirm parity**
        - Applied the same targeted edits to the project copies and added byte-parity assertions for all six
          host-policy assets.

- _Outcome:_ The package remains authoritative while the integration contract makes drift across the complete
  host-policy surface a test failure.

### `[x]` **4.3 State the host fetch requirement**

- _Goal:_ A later narrowing of the classification checkout cannot silently disable the lane.

    - `[x]` **4.3.a Record the branch-fetch requirement where the checkout is configured**
        - Documented at both classification checkouts that exact decomposition source commits may live only on
          another branch ref, preserving the full-ref fetch requirement.

    - `[x]` **4.3.b Assert the requirement on both copies**
        - Extended the workflow integration contract to require the branch-ref fetch explanation in both the
          project workflow and shipped recipe.

- _Outcome:_ A checkout narrowed to PR history now breaks the host-policy contract before it can silently force
  every decomposition receipt back into review.

## **Phase 5:** Security and workflow acceptance

_Purpose:_ Prove the complete opt-in boundary without re-testing transform internals.

### `[ ]` **5.1 Cover the precondition and classifier matrices**

- _Goal:_ Every unpublished source, malformed authority, or stale pair stays reviewed or fails closed.

    - `[ ]` **5.1.a Cover the source precondition**
        - Build `test-first` (one behavior at a time):
            - source ref equal to result-base ref, gate skipped
            - remote tip equal to the recorded source head, cut admitted
            - remote tip unequal, cut refused with the branch as locus and nothing materialized
            - remote unreadable, refused
            - base advancement re-derivation unaffected by the gate

    - `[ ]` **5.1.b Cover exact-ref classification**
        - Build `test-first` (one behavior at a time):
            - zero, one, and multiple added receipt endpoints
            - add, modify, and delete of retirement evidence
            - receipt already present in the base
            - identity, patch, source, base, target, and dependency mismatch
            - managed-path before, after, and destination-output disagreement
            - checkout with no index and no local branches
            - source commit absent from the checkout

    - `[ ]` **5.1.c Cover shape precedence, the outcome mapping, and streams**
        - Build `test-first` (one behavior at a time):
            - an endpoint beyond the transition patch and receipt resolves reviewed without validating
            - a shape-matching change with a misstating receipt still refuses
            - content-shaped refusal reports invalid nonzero with a locus
            - read-shaped refusal reports reviewed
            - a read failure carried under a content-sounding kind resolves reviewed
            - an unparseable operand is a usage error rather than a lane outcome
            - stdout stays within the two-value vocabulary
            - locus reaches stderr and never stdout

    - `[ ]` **5.1.d Cover liveness and fork origin**
        - Build `test-first` (one behavior at a time):
            - live head moved after classification
            - base branch tip moved after classification
            - both unchanged, publication proceeds
            - fork-origin change takes the reviewed path

    - `[ ]` **5.1.e Cover eligibility and application**
        - Build `test-first` (one behavior at a time):
            - clearance context required and not required
            - base currency by branch protection, by the rules surface alone, by merge queue, and by none —
              naming the satisfying mechanism in each
            - a surface reporting the requirement absent, distinguished from a surface refusing the read
            - append performed on eligible, withheld otherwise, and refused when an owning entry would follow

    - `[ ]` **5.1.f Cover ownership and parity contracts**
        - Prove last-match ownership ordering, the default-off skeleton, and byte parity across both copies of
          every host-policy asset.

    - `[ ]` **5.1.g Keep semantic approval separate**
        - Assert mechanical lane eligibility never substitutes for the distribution interlock.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A cut whose recorded source branch tip does not match the recorded source head refuses before
  materializing any artifact and names that branch; a source-is-base cut is unaffected; an unreadable remote
  refuses.
- `[ ]` Base advancement re-derives a preparation for a committed candidate without triggering the source gate.
- `[ ]` A change whose endpoint set is not exactly the transition patch plus the receipt resolves reviewed without
  running the validators, so an ordinary planning commit on a decomposition branch never fails.
- `[ ]` Exactly one canonical current receipt may accompany otherwise planning-only endpoints, with every
  tree-derivable fact re-derived from the tree that holds it.
- `[ ]` Legacy, malformed, multiple, already-in-base, unrelated, modified, deleted, and rider-bearing evidence
  never gains planning authority.
- `[ ]` Content-shaped refusals report invalid nonzero with a stable locus; read-shaped refusals, including an
  absent source commit and a read failure carried under a content-sounding kind, report reviewed. An unparseable
  operand is a usage error rather than a lane outcome.
- `[ ]` Standard output stays within the two-value vocabulary existing consumers parse.
- `[ ]` A head that moved, or a base branch whose tip moved, publishes no clearance success.
- `[ ]` Every caller resolves the lane through the one canonical command, and none downgrades a refusal.
- `[ ]` New installs remain reviewed and default-off, with the shipped ownership skeleton carrying no exception.
- `[ ]` The exception is appended only against an eligible verdict and only where no owning entry follows, with
  inability to check reported distinctly.
- `[ ]` Package and project host-policy assets remain byte-identical.
- `[ ]` No semantic classifier, approval token, duplicate receipt validator, or transform output change is added,
  and no ref, branch rule, or merge queue is created.
- `[ ]` All quality gates pass (tests, linting, type checking).
- `[ ]` Ready for integration.
