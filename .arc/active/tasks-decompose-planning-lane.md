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

### `[ ]` **4.1 Compute and apply the ownership exception**

- _Goal:_ The exception exists exactly where its guards do, and both the verdict and the edit are provable.

    - `[ ]` **4.1.a Add the command surface**
        - Take the repository, base branch, required context name, and ownership file as operands, and register
          the input surface alongside the classification command.

    - `[ ]` **4.1.b Resolve eligibility across the enumerated mechanisms**
        - Read the branch-protection surface, the rules surface that can govern the same branch independently, and
          the merge-queue configuration; treat a requirement as satisfied when any of them enforces it and name
          which one did.
        - Per surface, distinguish a read that reports the requirement absent from a read that is refused, and
          report checked-and-not-configured separately from not-permitted-to-check; neither is eligible.
        - Do not inspect bypass allowances.
        - _Note:_ existing setup guidance reads only the branch-protection surface, so the other two are new reads
          rather than adaptations; a project governed solely by rules would otherwise look unconfigured.

    - `[ ]` **4.1.c Apply the exception on an eligible verdict**
        - Append the receipt namespace to the ownership file's trailing unowned region on eligible; change nothing
          and report the reason otherwise.
        - Refuse rather than editing when an owning entry would follow the insertion point, since ownership is
          last-match-wins and such an edit would report success while leaving the namespace owned.

    - `[ ]` **4.1.d Keep the shipped skeleton free of the exception**
        - Leave the receipt namespace owned in the skeleton that setup copies verbatim.

    - `[ ]` **4.1.e Preserve one-way coupling**
        - Permit independent clearance installation without enabling auto-merge or changing ownership.

### `[ ]` **4.2 Keep the host-policy assets in one direction**

- _Goal:_ Setup guidance, recipes, workflow, and ownership never drift between the two copies.

    - `[ ]` **4.2.a Edit the authoritative copies**
        - Make every host-policy edit in the package source: ownership skeleton, clearance workflow, merge-gate
          recipe and readme, setup guidance, and initial setup.

    - `[ ]` **4.2.b Mirror and confirm parity**
        - Mirror each edit into the project copy and confirm the per-file parity assertions pass.
        - _Note:_ the pre-commit sync check only warns for these files, so it prompts but does not gate; the
          parity assertions are the guard.

### `[ ]` **4.3 State the host fetch requirement**

- _Goal:_ A later narrowing of the classification checkout cannot silently disable the lane.

    - `[ ]` **4.3.a Record the branch-fetch requirement where the checkout is configured**
        - State that the classification checkout must fetch branch refs rather than a single commit's history,
          and why, in both the shipped recipe and the project's own workflow.

    - `[ ]` **4.3.b Assert the requirement on both copies**
        - Extend the existing pinned checkout expectation, which covers the project's own workflow only, to the
          shipped recipe's classification checkout as well.
        - _Note:_ prose alone cannot catch a later narrowing, and the failure presents as a universally reviewed
          lane rather than an error.

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
