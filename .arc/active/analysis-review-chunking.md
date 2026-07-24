# Analysis: review-chunking

## First-run field evidence (2026-07-21)

> _The first real Mode B run — a review-only retrofit executed ad hoc against `review-architecture`'s change set
> during its pre-integration review (2026-07-21). Empirical grounding for the boundary doctrine._

- **Setup.** Mode B ran against a 307-file / ~24.4k-insertion change set. Eight path-scoped passes covered 10,789
  lines and produced 37 findings: 12 real, 7 advisory, 13 false, 5 unresolved. The mechanism works — but its cost
  profile is specific enough to design against rather than rediscover.
- **Cohesion predicts accuracy far better than size.** The smallest, most self-contained chunk (372 lines, provider
  adapters) scored 5 real / 1 false. False positives concentrated in chunks that cross-reference other chunks —
  decisively in the _critical_ band: all three Criticals were false, each asserting a symbol undeclared when its
  declaration sat in a different chunk. Draw boundaries on contract cohesion, not line budget; a boundary splitting
  a declaration from its consumers manufactures high-severity noise.
- **Type-check before triage.** A full type check refutes that entire class in seconds — three Criticals became
  three dismissals at near-zero cost. Excluding test directories from the chunk set makes every
  verification-dimension finding unreliable: a reviewer blind to the tests reports proven behavior as unproven.
- **Guidance must read distinct from code criteria.** Injected review guidance bled into the judgement — the rubric
  was applied as a specification the _code_ must satisfy, producing a finding that a baseline constant lacked a
  dimension actually contributed by a separate augmentation layer.
- **Scoping axis.** The only bounded scoping axis available today is path-shaped (a directory plus a base ref); the
  commit-range flag scopes a suffix to HEAD, not a bounded range, so a chunk is effectively one directory. Provider
  rate limiting (five reviews per hour) is a real planning constraint on chunk count.
- **Corroborates the retrofit conclusion.** The run is a review decomposition with no merge-topology change — one
  branch, one PR, merging once; only the review surface was carved. No stacking, no integration branch, nothing
  rewritten.

## Paired boundary comparison (prepared 2026-07-23)

### Fixed target and evaluator configuration

The held-out target is `cli-command-inputs`, which did not participate in authoring the chunk doctrine. It is a
mixed declaration, handler, command, test, and work-unit-record change large enough to trip the configured line
attention threshold.

```json
{
  "schemaVersion": 2,
  "semanticsVersion": "review-gate/v2",
  "kind": "change-set",
  "repositoryId": "40a11822-248f-4be0-ae17-c24dfb4ae35a",
  "baseRef": "main",
  "diffBaseSha": "ebe446fe2506927ec88b944dd4a7b13feb4c048e",
  "diffBaseTree": "5d32a6b812bb204ef3e0727ec66b3fb98c7d6545",
  "headSha": "86a0d220dc87e01fed17308cddb13c5604d1a0b9",
  "headTree": "51d83d5b758b3a7ccadcc5165c713c598de5e3f4",
  "targetId": "sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e"
}
```

The immutable diff contains 97 files, 7,727 insertions, 1,244 deletions, 8,971 changed lines, and 672
zero-context hunks. Its canonical zero-context patch digest is
`sha256:19127f27f152d1f9da9c8cdf842edb5ad6a3cf9da50561b78b710b59b34a0500`. These coordinates and digest identify
the complete changed-hunk set; either tree moving invalidates the comparison.

Both arms use fresh non-author local evaluator contexts at the same inherited primary capability with no model
override, the complete `implementation-audit/v1` rubric, identical structured report shape, and the same exact
checkout. Each arm stays blind to the other arm's map and reports until both raw snapshots and aggregate results
exist.

### Baseline map — naive path scopes

The baseline uses first-match path partitioning without moving declarations toward consumers.

| Scope     | Exact path rule                           |  Files |     Lines |   Hunks |
| --------- | ----------------------------------------- | -----: | --------: | ------: |
| B1        | `packages/arc-framework/src/lib/**`       |     18 |     1,983 |      43 |
| B2        | Remaining `packages/arc-framework/src/**` |     43 |     4,213 |     516 |
| B3        | Tests, package metadata, and `.arc/**`    |     36 |     2,775 |     113 |
| **Union** | **Every target path exactly once**        | **97** | **8,971** | **672** |

Its seam owns source-to-test references, command-input declarations consumed by handlers and CLI registration,
Git/work-unit adapters consumed by commands, and project-record claims about the implementation.

### Treatment map — contract-cohesive scopes

The treatment uses ordered first-match predicates. Tests and operational guidance move with their governing
contract; unchanged repository, platform, and library declarations are external or pre-existing.

| Scope     | Contract closure                                                               |  Files |     Lines |   Hunks |
| --------- | ------------------------------------------------------------------------------ | -----: | --------: | ------: |
| T1        | Command-input declarations, resolution, inventory generation, and direct tests |     23 |     3,050 |      23 |
| T2        | CLI registration, interaction consumers, prompts, handlers, and direct tests   |     40 |     3,779 |     456 |
| T3        | Git/release/sync/work-unit adapters, cross-layer tests, and project records    |     34 |     2,142 |     193 |
| **Union** | **Every target path exactly once**                                             | **97** | **8,971** | **672** |

The treatment seam owns declaration-to-registration identity, interaction-context propagation into handlers,
repository capability discovery, Git executor behavior shared by T2 and T3, and record-to-runtime coherence.

### Coverage and identical arm protocol

For both maps, `change-set − union(scopes) = empty`: file, changed-line, and zero-context-hunk totals equal the
canonical target, and ordered first-match assignment prevents overlap. Each arm follows this sequence:

1. Launch one fresh bounded evaluator context per scope with only the exact target, current scope, explicit external
   or pre-existing annotations, and complete rubric.
2. Preserve each structured scope report as a raw snapshot before triage or aggregation.
3. Launch one fresh bounded seam context with the arm-specific seam ownership above and preserve its raw report.
4. Launch one fresh non-author aggregate context with the partition/coverage facts and structured raw reports. It
   may inspect targeted source loci, but does not load every scope body wholesale.
5. Emit one whole-target result for the arm. No scope or seam report has standalone authority, neither arm satisfies
   a review obligation, and the held-out target remains read-only.

### Raw evaluator snapshots

The reports below are preserved before triage or aggregation.

#### Baseline B1 — source libraries

- **Scope:** B1
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Missing Class-write wiring is detected only after promotion has relocated the work unit
    - **Severity:** major
    - **Rubric dimension:** correctness/failure behavior
    - **Stable locus:** `packages/arc-framework/src/lib/work-unit/lifecycle-executor.ts` — `validateInputs` and the
    `inputs.persistClass` finalization block in `executeTransition`
    - **Source-grounded evidence:** `runPromote` supplies `persistClass` when a provisional meta records `[TBD]`.
    `executeTransition` validates other required mutator wiring before mutation in `validateInputs`, but does not
    validate `ctx.writeClassField`. It first fires the promote encoding legs, including artifact relocation, and
    only afterward checks `ctx.writeClassField` in the finalization block and returns `finalize-failed` if it is
    absent. `runPromote` converts every non-`ok` outcome to `{ status: "rejected" }`.
    - **Rationale:** A context lacking the optional Class-write seam receives a rejection even though the work unit
    has already moved from provisional to planned, leaving the operation observably mutated and the Class
    unresolved. This violates the executor's stated pre-mutation wiring-validation boundary and makes a nominal
    rejection unsafe to retry without recovery.
    - **Declaration-split candidate:** false

- **Title:** Removed interaction sites can remain accepted as live declaration entries
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` — declaration-origin interaction
    reconciliation in `reconcileCommandInputInventory`
    - **Source-grounded evidence:** For a declaration site with `source.interaction` or `source.line`, the reconciler
    looks up a discovered interaction, but only claims it when the lookup succeeds; an unsuccessful lookup does not
    throw. The entry is still appended with the declaration's source as `liveSource`. `sourceExists` checks only
    that the file exists and an optional line is in range, so deleting the interaction while leaving the file/line
    valid passes. The final unclaimed-interaction loop cannot catch this case because the removed interaction is
    absent from the scanner inventory.
    - **Rationale:** The inventory is documented to reject every scanner/declaration mismatch and exposes a dedicated
    `stale-source` failure, yet a stale declaration for a removed prompt, stdin read, environment policy, or
    subprocess can survive reconciliation. Consequently the rendered inventory can assert policy coverage for code
    that no longer exists, undermining the inventory's role as a completeness oracle.
    - **Declaration-split candidate:** false

**Withstood**

- Commander command-path resolution, chained operand/option extraction, option metadata projection, deterministic
  ordering, and CLI-reachable module traversal were checked without finding a material scoped defect.
- Declaration schema strictness, duplicate canonical paths/site IDs/aliases, dangling aliases, contradiction
  checks, and recursive freezing were checked and held.
- Resolution precedence, cancellation isolation, missing-requirement aggregation, confirmation authority
  separation, and unknown-error adaptation were checked and held.
- Interaction-context separation of terminal capability, prompt availability, affirmative authority,
  machine-readable mode, presenter policy, and ambient stdin policy was checked and held.
- Registry command identities, alias collision handling, kernel composition, and schema-backed parsing were checked
  and held.
- Git executor environment cleanup, index-file propagation, pager/editor suppression, ambient-stdin closure, and
  capture/inherited push option forwarding were checked and held.
- Identity normalization preserves the prior slugification behavior while validating through the shared slug
  schema.
- Cohort-aware promote/demote destination projection, conflicting supplied-versus-recorded Class rejection,
  relocated Class persistence path selection, staging inclusion, and source-directory pruning were checked aside
  from the missing preflight wiring finding above.
- Scoped diff whitespace integrity passed `git diff --check`.

**Verdict:** B1 is not clean; two major findings remain.

#### Baseline B2 — remaining source

- **Scope:** B2
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Global `--no-input` is not propagated through several network-capable commands
    - **Severity:** major
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` — materialize, lifecycle, and errand retire action
    registration; `packages/arc-framework/src/handlers/lifecycle.ts` — `resolveVerbBase` and `handleMaterialize`;
    `packages/arc-framework/src/handlers/errand.ts` — `handleErrandRetire`
    - **Source-grounded evidence:** The root command advertises `--no-input` as forbidding prompts and ambient
    child-process input, but `materialize` is registered with a direct action calling `handleMaterialize` rather
    than `withInteractionContext`. `handleMaterialize` reaches `resolveVerbBase()`, which constructs
    `createUserIOContext()` without a subprocess policy, and then performs a bounded remote fetch. Likewise,
    `errand retire` remains directly registered and constructs an unqualified `createUserIOContext()` before
    pushing record removal.
    - **Rationale:** The advertised global trust boundary is therefore not represented at B2 call sites for commands
    that can invoke credential-bearing network subprocesses. On an interactive terminal, these paths can retain
    ambient child-process input despite explicit `--no-input`, so automation can hang or solicit credentials. The
    correction boundary is all network/subprocess-capable command registrations and their handler I/O construction,
    not only the migrated subset.
    - **Declaration-split candidate:** true

- **Title:** Teardown husk validation rejects Windows absolute paths
    - **Severity:** major
    - **Rubric dimension:** repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/handlers/lifecycle.ts` — `TeardownCommandInputSchema`
    - **Source-grounded evidence:** `TeardownCommandInputSchema` validates `husk` with
    `z.string().startsWith("/")`. The existing teardown domain boundary uses `node:path.isAbsolute`, which accepts
    platform-native absolute paths, while the project brief explicitly lists Windows as a supported platform. A
    Windows path such as `C:\repo\worktree` is rejected by the new handler schema before reaching that
    platform-aware domain validation.
    - **Rationale:** The new adapter validation makes detached-husk replay unusable on a supported platform and
    narrows a previously cross-platform command contract. The validation boundary must preserve platform-native
    absolute-path semantics.
    - **Declaration-split candidate:** false

**Withstood**

- Reviewed every changed B2 path and hunk across CLI wiring, command adapters, handlers, prompts, release setup,
  review adapters, and scripts.
- Schema migration generally resolves and validates command-owned values before mutation, including init/join
  identity acquisition and destructive confirmation gates.
- Machine-readable modes generally route subprocess and presenter restrictions through the shared interaction
  context while preserving stdout/stderr separation.
- Explicit stdin remains separately modeled for commit-message, inbox-title, and review request inputs.
- Lifecycle schemas consistently centralize slug, class, priority, date, and mutually-exclusive option validation
  apart from the Windows path regression above.
- Static `git diff --check` passed. Runtime tests and authoritative typecheck could not execute in the detached
  checkout because dependencies were unavailable there.

**Verdict:** B2 is not clean. The bounded snapshot has two material findings: incomplete enforcement of the global
no-input boundary and a Windows compatibility regression in teardown husk validation.

#### Baseline B3 — tests, package metadata, and project records

- **Scope:** B3
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** The no-input matrix enumerates commands without exercising their interaction sites
    - **Severity:** major
    - **Rubric dimension:** verification quality and missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/e2e/command-input-no-input.e2e.test.ts` — "terminates
    `$commandPath` for each unavailable-interaction signal";
    `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts`
    - **Source-grounded evidence:** The repository-inventory assertion reduces coverage to one row per `commandPath`,
    and the E2E matrix then accepts invocations that fail before reaching the declared interaction boundary. For
    example, promote expects "not a provisional stub", start expects "does not exist on the base branch", release
    setup install omits harness/mode and expects "missing required input", release commit expects an interlock
    refusal, user pull expects "Remote unavailable", and view expects "No active work unit". These outcomes do not
    exercise Class acquisition, start confirmation, release trust/evidence acquisition, overwrite confirmation, or
    pager selection respectively. Explicit-stdin rows are also special-cased to run only the `--no-input` signal
    rather than the three signals named by the test.
    - **Rationale:** The central task and success records claim complete, bounded termination proof for every
    interaction-capable path and mutation boundary, but command-level enumeration can remain green when a prompt,
    editor, pager, or confirmation site hangs or mutates once its prerequisites are satisfied. The verification
    boundary therefore does not substantiate the work unit's principal closure claim.
    - **Declaration-split candidate:** false

- **Title:** Release evidence non-substitution is asserted in the record but not proved at the command boundary
    - **Severity:** major
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/__tests__/unit/handlers/release/setup/install.test.ts` —
    unresolved-trust and accepted-verification cases;
    `packages/arc-framework/__tests__/unit/handlers/release/setup/uninstall.test.ts` — cleanup-verification cases
    - **Source-grounded evidence:** Install tests pass precomputed `trustAccepted`/`workflowVerified` booleans directly
    to `runReleaseSetupInstall`. They cover both false together and both true together, but never isolate accepted
    trust with absent workflow evidence, workflow evidence with absent trust, or an authority-bearing `--yes`
    attempting to substitute for `--workflow-verified`. Uninstall similarly lacks an existing-marker case where
    `cleanupVerified` is absent while `cleanupResult` is otherwise successful; its refusal case combines absent
    evidence with a failing `cleanupResult`. The E2E install row fails earlier on missing ordinary inputs, and the
    uninstall row targets an already-uninstalled harness, so neither reaches the protected boundary.
    - **Rationale:** The spec explicitly requires trust acknowledgment, workflow evidence, and cleanup evidence to
    remain independent and says `--yes` cannot attest external evidence. Because the tests do not isolate those axes
    at the adapter/CLI boundary, an authority conflation at this trust-sensitive mutation gate could pass the
    complete B3 suite despite tasks 6.1.c and 6.2.b being marked proved.
    - **Declaration-split candidate:** true

- **Title:** Promotion tests do not substantiate the claimed atomic Class-persistence boundary
    - **Severity:** major
    - **Rubric dimension:** correctness and failure behavior
    - **Stable locus:** `packages/arc-framework/__tests__/unit/work-unit/verbs/promote-demote.test.ts` — "persists an
    explicitly acquired Class while promoting an unresolved stub"; `.arc/active/tasks-cli-command-inputs.md` task
    4.2.c
    - **Source-grounded evidence:** The two new unresolved-Class cases assert only a successful moved result and the
    presence of a `writeClassField` call. The harness cannot inject a `writeClassField` failure, and neither case
    asserts ordering, rollback, or the resulting state when persistence fails after relocation. Nevertheless task
    4.2.c is marked complete as "Prove refusal and atomic persistence boundaries."
    - **Rationale:** A failure between artifact relocation and Class persistence can leave a provisional-to-planned
    transition partially applied with unresolved metadata. The changed tests demonstrate the happy-path write but
    provide no failure-behavior evidence for the specifically claimed atomic boundary.
    - **Declaration-split candidate:** false

**Withstood**

- All specified B3 changed hunks were considered across the ARC records, package declarations, test helpers, new
  command-input suites, modified compatibility tests, and deleted legacy non-interactive test.
- The declaration and repository-inventory tests provide deterministic identity ordering, duplicate/stale-locus
  rejection, schema-field reconciliation, machine-mode adapter checks, and exact registry membership checks.
- Interaction-context unit coverage keeps prompt capability separate from protected-confirmation authority and
  covers CI, TTY, machine-readable, compatibility-yes, authority-yes, and Commander's negated global option
  decoding.
- Init and join tests preserve supplied/prompted schema parity, safe defaults, missing-identity refusal, and
  fresh-only identity constraints.
- User pull and user sync regression tests now reject non-TTY overwrite without explicit authority while retaining
  command-local `--yes` behavior.
- Git-executor coverage verifies invocation-local terminal-prompt, editor, pager, and ambient-stdin restrictions
  without leaking policy into later ordinary invocations.
- E2E timeout observability and protected-worktree comparisons are sound for the particular early-exit scenarios
  that the matrix actually reaches.
- Package script additions are coherent between the workspace root and CLI package.
- The checkout remained unchanged; targeted test execution could not start because dependencies were absent in the
  detached checkout.

**Verdict:** B3 is not clean. The source records claim complete trust-boundary, atomicity, and interaction-site
verification, but the changed tests leave material gaps in all three areas.

#### Treatment T1 — command-input contract

- **Scope:** T1
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Nonexistent interaction selectors survive reconciliation
    - **Severity:** major
    - **Rubric dimension:** correctness and failure behavior
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` —
    `reconcileCommandInputInventory` interaction-join branch
    - **Source-grounded evidence:** For declaration-origin sites, lines 153-171 look up the declared interaction
    selector but only act when the lookup succeeds. When it returns undefined, reconciliation still appends the
    entry with the declaration's source as `liveSource`. If every actual discovered interaction is classified by
    other declarations, the final unclaimed-interaction loop also succeeds. The direct stale-source test covers
    only an out-of-range line and does not exercise a missing callee/kind/occurrence selector.
    - **Rationale:** The inventory can certify and render a policy entry for an interaction that does not exist, so
    occurrence drift or a mistyped selector is not rejected despite the function's contract to reject every
    mismatch. The interaction selector must be subject to the same live-source resolution guarantee as syntax sites
    for the inventory to remain authoritative.
    - **Declaration-split candidate:** false

- **Title:** Policy-policy collisions are silently resolved by array order
    - **Severity:** major
    - **Rubric dimension:** coherence and maintainability
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/repository-inventory.ts` —
    `buildRepositoryCommandInputInventoryFromSnapshot` policy merge loop
    - **Source-grounded evidence:** Lines 122-125 find any existing site with the same ID and unconditionally splice
    in the later policy. This replacement is needed to overlay generated syntax defaults, but the code does not
    distinguish that case from a second command-owned policy declaration. Consequently, two explicit declarations
    for the same command/site are collapsed before `defineCommandInputDeclarations` can perform its duplicate-site
    validation.
    - **Rationale:** Conflicting command-owned authority, automation, or mutation policies become order-dependent and
    the reconciled inventory reports only the last one, masking an ownership error that the declaration layer
    otherwise promises to reject. Repository composition needs a collision boundary that preserves the
    generated-policy override while refusing multiple explicit owners.
    - **Declaration-split candidate:** true

- **Title:** The no-input matrix often exits before exercising the interaction boundary
    - **Severity:** major
    - **Rubric dimension:** verification quality and missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts` and
    `packages/arc-framework/__tests__/unit/command-input/repository-inventory.test.ts` — command-level matrix
    exact-match assertion
    - **Source-grounded evidence:** Several matrix rows explicitly expect unrelated precondition failures, including
    promote ("not a provisional stub"), start ("does not exist on the base branch"), sync ("notes-blocked"), user
    pull ("Remote unavailable"), user sync ("No remote configured"), and view ("No active work unit"). The
    repository unit test only exact-matches `commandPath` values against interaction-capable commands; it does not
    establish that each invocation reaches its declared prompt, confirmation, presenter, or subprocess site.
    - **Rationale:** These cases prove bounded termination for an early-failing invocation but do not detect blocking,
    unintended prompting, or mutation when the interaction-capable path is actually reached. Because no-input
    behavior is a safety property of those sites, representative reachable-path coverage is required rather than
    command-name coverage alone.
    - **Declaration-split candidate:** true

- **Title:** Symbol locus validation interprets declaration text as a regular expression
    - **Severity:** minor
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` — `sourceExists`
    - **Source-grounded evidence:** `CommandInputSourceSchema` accepts any nonempty symbol string, while
    `sourceExists` interpolates that string into `new RegExp` after escaping only dollar signs. Metacharacters such
    as `.`, `[`, `(`, or `\` can therefore produce false matches or throw a raw `SyntaxError` instead of the
    declared command-input inventory failure.
    - **Rationale:** A malformed or punctuation-bearing declaration can bypass stale-source detection or abort
    inventory generation outside its typed error contract. Symbol declarations must be treated as literal source
    identities or be constrained consistently at validation.
    - **Declaration-split candidate:** false

**Withstood**

- All 23 T1 changed hunks were inspected across declarations, acquisition/resolution, interaction context, schema
  registry, AST discovery, repository projection/rendering, infrastructure policies, fixtures, and direct tests.
- Prompt cancellation is normalized before schema parsing, forbidden interaction avoids invoking prompt callbacks,
  and protected authority remains distinct from compatibility yes and ordinary no-input signals.
- Syntax scanning retains operands, options, aliases, defaults, conflicts, action loci, and current repository tests
  assert deterministic inventory ordering and schema-field representation.
- Registry construction isolates canonical schemas and aliases over the shared kernel, and resolution outcomes
  remain closed and source-tagged.
- Inventory rendering is deterministic and the development script writes only when an explicit output path is
  supplied.
- Every `implementation-audit/v1` rubric dimension was considered for the bounded T1 surface.

**Verdict:** T1 is not clean. The bounded surface has material inventory soundness and verification gaps. Direct
test execution was attempted but unavailable because the checkout's Vitest executable was not executable
(`Permission denied`); conclusions are source-based and do not rely on a passing test claim.

#### Treatment T3 — Git, release, sync, work-unit, and record closure

- **Scope:** T3
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Promotion regenerates readiness views before persisting the acquired Class
    - **Severity:** major
    - **Rubric dimension:** repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/lib/work-unit/lifecycle-executor.ts` `executeTransition`
    post-encoding sequence; `packages/arc-framework/src/lib/work-unit/verbs/promote-demote.ts` `runPromote`
    - **Source-grounded evidence:** `runPromote` passes a newly acquired value as `persistClass`, but
    `executeTransition` fires every declared side effect at lines 515-524 before `writeClassField` runs at lines
    539-544. The assigned promote-demote test context identifies the promotion side effects as
    `reconcile-roadmap` and `reconcile-status-user`, while its new assertions only check that the Class write
    eventually occurred.
    - **Rationale:** A successful unresolved-stub promotion can render and stage ROADMAP and the user readiness view
    from the relocated meta while it still contains `[TBD]`, then update only the meta afterward. The command
    therefore reports success with generated project records stale relative to the authoritative promoted work
    unit, and the added verification does not exercise this ordering boundary.
    - **Declaration-split candidate:** false

- **Title:** Release-install cancellation does not stop the acquisition sequence
    - **Severity:** major
    - **Rubric dimension:** correctness and failure behavior
    - **Stable locus:** `packages/arc-framework/src/handlers/release/setup/install.ts`
    `handleReleaseSetupInstall` and `promptForHarness`/`promptForMode`
    - **Source-grounded evidence:** The command declarations classify the harness, mode, trust, and workflow prompt
    sites with cancellation `stop`, but `handleReleaseSetupInstall` converts cancelled harness or mode prompts to
    `undefined` and continues at lines 346-349. It also continues to workflow verification at lines 374-380 after
    a cancelled or declined trust acknowledgment has already made `trustAccepted` false.
    - **Rationale:** Cancelling the harness prompt can still open the mode prompt and ultimately produce a
    missing-option failure, while cancelling or declining the protected trust prompt can still solicit
    external-workflow attestation before the command aborts. This collapses cancellation into ordinary missing/false
    values and violates the command's declared stop boundary on a trust-sensitive setup flow.
    - **Declaration-split candidate:** false

**Withstood**

- Reviewed every changed hunk in all 34 assigned T3 paths against the exact base and head SHAs.
- Git subprocess policy propagation consistently closes ambient stdin and disables Git terminal prompts for
  forbidden interaction while retaining explicitly selected commit-message stdin.
- Release setup uninstall keeps cleanup evidence distinct from generic affirmative authority and performs no marker
  removal without resolved evidence.
- Sync and user-sync preserve phase-scoped saves while preventing no-input signals from choosing contested direction
  or authorizing overwrite implicitly.
- Opaque release commit/push arguments remain passthrough data rather than being claimed by command schemas.
- Package scripts, project-record relocation, timeout observability, identity normalization, and assigned
  cross-layer test updates introduced no additional material T3 finding.
- Considered coherence and maintainability, correctness and failure behavior, intent and scope, trust boundaries and
  compatibility, verification quality and missing cases, and repository contract coherence.

**Verdict:** T3 is not clean: two major, self-contained contract failures remain in the bounded snapshot.

#### Treatment T2 — CLI and interaction consumers

- **Scope:** T2
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Global `--no-input` policy is not propagated to multiple subprocess-using commands
    - **Severity:** major
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` lifecycle command registrations around park through
    finalize; `packages/arc-framework/src/handlers/lifecycle.ts` `resolveVerbBase`
    - **Source-grounded evidence:** The root option promises to forbid ambient child-process input, and wrapped
    actions pass an `InteractionContext` into handlers. However park, resume, materialize, activate, deactivate,
    integrate, reopen, archive, teardown, set-stage, and finalize remain plain actions. For example, `arc park`
    calls `handlePark` directly at `cli.ts:294`; `handlePark` calls `resolveVerbBase()` without context at
    `lifecycle.ts:1068`; `resolveVerbBase` consequently calls `createUserIOContext(context?.subprocess)` with
    `undefined` at `lifecycle.ts:213`. Similar gaps remain for user close/save and review actions.
    - **Rationale:** These invocations bypass the command-level policy that closes ambient stdin and disables
    terminal prompting. Commands performing Git or provider subprocess work can therefore retain ordinary
    subprocess interaction despite an explicit global `--no-input` contract, undermining bounded termination and
    automation safety across a substantial CLI surface.
    - **Declaration-split candidate:** true

- **Title:** Release setup tests do not independently prove the new attestation gates
    - **Severity:** major
    - **Rubric dimension:** verification quality and missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/unit/handlers/release/setup/install.test.ts`
    trust/workflow cases; `packages/arc-framework/__tests__/unit/handlers/release/setup/uninstall.test.ts` cleanup
    verification cases
    - **Source-grounded evidence:** Install tests cover `trustAccepted=false`/`workflowVerified=false` and
    `trustAccepted=true`/`workflowVerified=true`, but never `trustAccepted=true`/`workflowVerified=false`. The
    bypass unresolved-trust case at `install.test.ts:200-209` only asserts exit code 0. Uninstall tests similarly
    pair `cleanupVerified=true` with `cleanupResult.ok=true` and `cleanupVerified=false` with
    `cleanupResult.ok=false`, never isolating `cleanupVerified=false` while `cleanupResult` is otherwise successful.
    - **Rationale:** The new flags represent separate authority boundaries. An implementation that ignores
    `workflowVerified` or `cleanupVerified` could satisfy every changed test while recording an install or uninstall
    without the required attestation, so the verification does not establish the advertised trust controls.
    - **Declaration-split candidate:** false

**Withstood**

- Fresh init and join resolve canonical input, cancellation, identity, and schema failures before their dependent
  installation or workspace mutations.
- Lifecycle schemas consistently constrain slug, class, priority, mutually exclusive modes, and destructive-input
  shapes before executor calls.
- Wrapped machine-output commands propagate subprocess restrictions while preserving explicit stdin for
  commit-message and inbox-title operands.
- Status, active, base, recover, plan, view, errand, and user adapters consistently route their supplied subprocess
  policy through their changed Git or user-I/O seams.
- The no-input end-to-end matrix checks all three unavailable-interaction signals for bounded termination and
  preserves explicitly selected stdin bytes.
- Prompt adapters correctly skip only explicitly supplied fields and preserve cancellation for remaining
  interactive acquisition.

**Verdict:** T2 is not clean: the global interaction contract has incomplete CLI coverage, and safety-critical
release attestations lack independent verification. This is a bounded raw T2 snapshot, not a whole-target
conclusion.

#### Baseline seam

- **Scope:** baseline-seam
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Global no-input policy bypasses network-capable lifecycle and errand commands
    - **Severity:** major
    - **Rubric dimension:** correctness/failure behavior; trust boundaries/compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` command actions for rename and errand retire;
    `packages/arc-framework/src/handlers/lifecycle.ts` `resolveVerbBase` and `handleRename`;
    `packages/arc-framework/src/handlers/errand.ts` `handleErrandRetire`
    - **Source-grounded evidence:** The CLI registers `rename` and `errand retire` with direct actions instead of
    `withInteractionContext`. Both handlers consequently call `resolveVerbBase()` or `createUserIOContext()` without
    a subprocess policy. `handleRename` reaches `reconcileRenameRemoteBranch`, which runs `git push`, while
    `handleErrandRetire` reaches `reconcileErrandPush`, which also runs `git push`. The B1 executor disables
    credential prompts and closes ambient stdin only when `GitExecOptions.interaction` is present, so CI, non-TTY,
    and global `--no-input` do not constrain these Git invocations.
    - **Rationale:** These commands can solicit Git credentials or wait on inherited stdin during an invocation
    explicitly required to terminate without ambient input. Rename can also complete local identity mutations
    before reaching its unconstrained remote push, making the failure boundary materially stateful. This
    contradicts the uniform no-input and terminal-subprocess contract.
    - **Declaration-split candidate:** false

- **Title:** The exact no-input matrix loses command-to-shared-subprocess call paths
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases; repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/command-input-infrastructure-policies.ts`
    `infrastructureCommandInputPolicyDeclarations`;
    `packages/arc-framework/src/lib/command-input/repository-inventory.ts`
    `buildRepositoryCommandInputInventoryFromSnapshot`;
    `packages/arc-framework/__tests__/unit/command-input/repository-inventory.test.ts` exact-matches every
    interaction-capable command; `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts`
    - **Source-grounded evidence:** Every shared `execa` site in `lib/git/process-executor.ts`,
    `lib/git/push-worktree.ts`, and `lib/io-context.ts` is declared under the single command path `sync`.
    Repository reconciliation joins declarations to physical source sites but does not derive which CLI commands
    call those shared adapters. The matrix then derives its expected command set from those declared command paths,
    so it includes `sync` but omits network-capable consumers such as `rename` and `errand retire`. Existing rename
    E2E coverage invokes a local bare remote and therefore cannot expose a credential prompt despite using non-TTY
    execution.
    - **Rationale:** The asserted exact match proves only that the manually assigned command labels match the manually
    derived matrix, not that every command reaching a terminal-capable subprocess propagates interaction policy.
    This blind spot directly permits the live bypass above while the task record claims complete AST reconciliation
    and bounded no-input coverage.
    - **Declaration-split candidate:** false

**Withstood**

- Init and join Commander declarations, command-owned schemas, handlers, and registration field maps agree at their
  cross-boundary interfaces, including identity and compatibility-yes semantics.
- Machine-readable commands represented by inventory policy are checked for interaction-context-wrapped CLI
  actions, and schema-owned inventory fields are checked against actual Zod object properties.
- The Git executor correctly applies per-invocation `GIT_TERMINAL_PROMPT`, editor, pager, and closed-stdin policy
  when a consumer supplies the resolved subprocess context.
- Typed cancellation, unavailable-input, invalid-input, and resolved outcomes remain distinct across the inspected
  command-input kernel and migrated init/join consumers.
- No unrelated scope or package-boundary drift was found in the inspected seams.

**Verdict:** The baseline seam is not clean: shared Git adapters implement the intended no-input controls, but
multiple command consumers bypass them, and the claimed exact verification oracle structurally cannot detect those
bypasses.

#### Treatment seam

- **Scope:** treatment-seam
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`

**Findings**

- **Title:** Shared Git capabilities are attributed only to sync, allowing other remote commands to bypass no-input
  policy
    - **Severity:** major
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/command-input-infrastructure-policies.ts` —
    `infrastructureCommandInputPolicyDeclarations`; `packages/arc-framework/src/cli.ts` — rename action;
    `packages/arc-framework/src/handlers/lifecycle.ts` — `handleRename`/`resolveVerbBase`
    - **Source-grounded evidence:** `infrastructureCommandInputPolicyDeclarations` assigns every shared `execa` site
    in `process-executor.ts`, `push-worktree.ts`, and `io-context.ts` to command path `sync` with mutation boundary
    `sync subprocess boundary`. Repository inventory therefore considers only sync a terminal-prompt subprocess
    consumer. However, `cli.ts` registers rename without `withInteractionContext`; `handleRename` calls
    `resolveVerbBase()` without a context, which constructs `createUserIOContext(undefined)`. `runRenameCommand`
    then performs bounded fetch and remote branch reconciliation through that ungoverned executor. Consequently
    global `--no-input`, CI, and non-TTY policy never reaches rename's credential-capable Git fetch/push operations.
    `NO_INPUT_MATRIX` omits rename because its exact-match source is the same misattributed inventory.
    - **Rationale:** The shared-source declaration models a subprocess implementation site as if it belonged to one
    command instead of discovering every command that has that capability. This defeats both the runtime trust
    boundary and its completeness proof: a declared prompt-free invocation can still inherit ambient stdin and
    permit Git terminal credential prompting or hang, while the inventory and bounded matrix report complete
    coverage. The project records claim every interactive-capable spawn is context-bound and every no-input command
    path is bounded, which the runtime wiring does not support.
    - **Declaration-split candidate:** false

**Withstood**

- Canonical schema declaration-to-registration identities, registered schema fields, and registry aliases remain
  coherent at their direct composition seam.
- Commands actually wrapped with `withInteractionContext` receive one adapter-resolved context, and inspected
  handler consumers preserve the distinction between interaction capability and confirmation authority.
- The Git executor correctly disables terminal prompts, editors, pagers, and ambient stdin when an
  `InteractionContext` subprocess policy is supplied.
- Explicit stdin paths remain separate from ambient subprocess input in the inspected release and command-input
  adapters.
- Syntax and direct interaction-source discovery reconcile deterministically; the failure is capability attribution
  through shared infrastructure rather than syntactic source discovery.
- Project metadata, roadmap placement, and runtime command-schema records otherwise agree on the active work unit
  and shipped command identities.
- Coherence and maintainability, correctness and failure behavior, intent and scope, trust boundaries and
  compatibility, verification quality and missing cases, and repository contract coherence were considered across
  all five named seams.

**Verdict:** One major cross-closure seam defect: shared repository/Git capability discovery is not
command-reachability-aware, so no-input propagation and its verification are incomplete outside sync.

#### Baseline aggregate

- **Scope:** baseline-aggregate
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`
- **Coverage:** complete

**Input dispositions**

- **B1-1 — upheld:** Targeted source confirms `persistClass` can require `writeClassField`, but `validateInputs`
  does not validate that seam; relocation runs before the missing seam or a write failure becomes
  `finalize-failed`.
- **B1-2 — upheld:** A declaration-origin interaction lookup that resolves to `undefined` is still appended using
  its declared source, and a removed interaction is absent from the later unclaimed-live-interaction loop.
- **B2-1 — upheld:** `materialize` is a direct CLI action and calls `resolveVerbBase()` without the global
  interaction context before a remote fetch; its distinct contribution is retained separately from the overlapping
  seam report.
- **B2-2 — upheld:** `TeardownCommandInputSchema` accepts husks only when the string starts with `/`, while the
  teardown domain validates through `node:path.isAbsolute`, producing a real Windows-path compatibility mismatch.
- **B3-1 — upheld:** Matrix expectations demonstrate many commands terminate at prerequisite refusals, and rows
  with explicit stdin bypass the three-signal branch and exercise only `--no-input` with supplied stdin.
- **B3-2 — upheld:** Install success tests set trust and workflow evidence true together while refusal tests leave
  both false; uninstall success similarly couples `cleanupVerified` and successful `cleanupResult`, and the E2E
  rows stop at missing input or already-uninstalled state.
- **B3-3 — upheld:** Promote tests record successful Class writes but contain no failing `writeClassField` seam or
  assertions for relocation/write ordering and the resulting forward-only state.
- **baseline-seam-1 — upheld:** `rename` and `errand retire` are direct actions that omit interaction context; both
  bind default subprocess I/O, and rename can complete local identity mutations before its remote operation. The
  overlapping errand-retire portion was not repeated in the B2-derived finding.
- **baseline-seam-2 — upheld:** The inventory reconciles discovered source sites to declarations but does not
  derive all command consumers of shared subprocess adapters; the matrix consequently has no rename, materialize,
  or errand-retire rows despite their network-capable paths.

**Findings**

- **BA-1 — Promote can relocate a provisional stub before discovering Class persistence is unavailable**
    - **Severity:** major
    - **Rubric dimension:** correctness/failure behavior
    - **Stable locus:** `packages/arc-framework/src/lib/work-unit/lifecycle-executor.ts` — `validateInputs` and the
    post-side-effect `persistClass` block
    - **Source-grounded evidence:** `runPromote` supplies `persistClass` when resolving a `[TBD]` Class.
    `executeTransition` validates other required mutators before mutation, fires relocation, and only afterward
    checks `ctx.writeClassField` and invokes it inside the finalize block.
    - **Rationale:** A missing or failing Class writer leaves the artifact relocated while `runPromote` reports a
    rejection, so callers receive failure after a material state transition.
    - **Declaration-split candidate:** false

- **BA-2 — Declaration reconciliation can accept a stale interaction locus**
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` — declaration-origin interaction
    reconciliation
    - **Source-grounded evidence:** `sourceExists` checks only file, line bounds, and symbol. When an interaction
    selector or line lookup returns `undefined`, inventory construction still appends the entry with the declared
    source; because the removed site is no longer in the discovered map, the final unclaimed-interaction loop cannot
    flag it.
    - **Rationale:** The claimed exact source-to-declaration inventory can remain green after a declared interaction
    disappears or changes character.
    - **Declaration-split candidate:** false

- **BA-3 — Materialize bypasses the global no-input subprocess policy**
    - **Severity:** major
    - **Rubric dimension:** trust boundaries/compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` materialize action;
    `packages/arc-framework/src/handlers/lifecycle.ts` `handleMaterialize`
    - **Source-grounded evidence:** The CLI invokes `handleMaterialize` directly rather than through
    `withInteractionContext`; the handler calls `resolveVerbBase()` without a context, creates default subprocess
    I/O, and then fetches the remote branch.
    - **Rationale:** `--no-input`, CI, and non-TTY policy cannot close ambient subprocess stdin or forbid terminal
    credential prompting on the materialize fetch path.
    - **Declaration-split candidate:** true

- **BA-4 — Teardown rejects valid Windows absolute husk paths at the command schema**
    - **Severity:** major
    - **Rubric dimension:** repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/handlers/lifecycle.ts` — `TeardownCommandInputSchema`
    - **Source-grounded evidence:** The command schema uses `z.string().startsWith("/")`, while `runTeardown` later
    uses `node:path.isAbsolute` for the same husk-path invariant and the repository contains explicit Windows
    support.
    - **Rationale:** Drive-qualified and UNC absolute paths cannot reach the platform-aware domain validation,
    breaking a supported platform at the adapter boundary.
    - **Declaration-split candidate:** false

- **BA-5 — The no-input E2E matrix proves early exits rather than protected interaction boundaries**
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/e2e/command-input-no-input.e2e.test.ts` and
    `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts`
    - **Source-grounded evidence:** Rows such as promote, start, stub, release commit, release setup install, and
    errand open expect prerequisite errors before their interaction or subprocess sites. When a row supplies
    `stdin`, the test runs only the explicit-stdin invocation rather than the `--no-input`, CI, and non-TTY triplet.
    - **Rationale:** Bounded termination at unrelated guards and one-signal stdin coverage do not establish that each
    protected site refuses prompts, closes ambient input, or preserves mutation boundaries.
    - **Declaration-split candidate:** false

- **BA-6 — Release setup tests do not isolate independent trust, workflow, and cleanup evidence**
    - **Severity:** major
    - **Rubric dimension:** trust boundaries/compatibility
    - **Stable locus:** `packages/arc-framework/__tests__/unit/handlers/release/setup/install.test.ts`;
    `packages/arc-framework/__tests__/unit/handlers/release/setup/uninstall.test.ts`; release-setup rows in the
    no-input matrix
    - **Source-grounded evidence:** Install success cases set `trustAccepted` and `workflowVerified` true together,
    while refusal cases default both false and therefore stop at trust. Uninstall success couples
    `cleanupVerified: true` with `cleanupResult: { ok: true }`; its E2E row reaches an already-uninstalled no-op,
    while install E2E stops at missing required input.
    - **Rationale:** The tests do not prove that each independent evidence gate controls its own protected transition
    or that no-input behavior reaches cleanup and workflow-verification boundaries.
    - **Declaration-split candidate:** true

- **BA-7 — Promote verification omits Class-write failure and mutation-order behavior**
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/unit/work-unit/verbs/promote-demote.test.ts` and the
    promote-demote task-record assertions
    - **Source-grounded evidence:** The executor fixture's `writeClassField` only records successful calls, and the
    tests assert the happy-path Class value at the relocated path. No case throws from that seam or inspects the
    resulting status and already-fired relocation.
    - **Rationale:** The verification used to support atomic persistence does not exercise the runtime failure mode
    in BA-1.
    - **Declaration-split candidate:** false

- **BA-8 — Rename and errand-retire remote operations escape global no-input policy**
    - **Severity:** major
    - **Rubric dimension:** correctness/failure behavior + trust boundaries/compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` rename and errand-retire actions;
    `packages/arc-framework/src/handlers/lifecycle.ts` `handleRename`;
    `packages/arc-framework/src/handlers/errand.ts` `handleErrandRetire`
    - **Source-grounded evidence:** Both commands use direct actions without `withInteractionContext`.
    `handleRename` calls `resolveVerbBase()` with no context and passes default I/O into the rename/retirement path;
    `handleErrandRetire` independently calls `createUserIOContext()` before record removal and push.
    - **Rationale:** Credential prompts and inherited stdin remain possible under global no-input signals, and rename
    can leave completed local mutations when a later remote operation cannot proceed non-interactively.
    - **Declaration-split candidate:** false

- **BA-9 — Shared subprocess inventory does not enumerate all network-capable command consumers**
    - **Severity:** major
    - **Rubric dimension:** verification quality/missing cases + repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/repository-inventory.ts`;
    `packages/arc-framework/src/handlers/sync.ts` interaction declarations;
    `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts`
    - **Source-grounded evidence:** Reconciliation classifies discovered interaction source sites against declarations
    but does not derive command call paths through shared subprocess adapters. The exact matrix includes sync while
    omitting rename, materialize, and errand retire, even though their handlers reach remote fetch or push through
    the same I/O infrastructure.
    - **Rationale:** Exactness is asserted over source declarations rather than the complete declaration-consumer
    graph, leaving network-capable commands outside the no-input proof.
    - **Declaration-split candidate:** false

**Withstood**

- Coherence and maintainability across command discovery, schemas, registry composition, typed outcomes, lifecycle
  identities, and represented adapter bindings.
- Correctness and failure behavior for resolution and cancellation, interaction-context signal separation,
  init/join identities, Git executor policy when context is supplied, most promote/demote mechanics, and specific
  early-exit timeout behavior.
- Intent and scope across the exact 97-file, 8,971-line, 672-hunk target as covered by B1, B2, B3, and the declared
  seam interfaces.
- Trust boundaries and compatibility for machine-output routing, explicit stdin modeling, represented machine-mode
  actions, user-overwrite behavior, and Git subprocess policy on correctly context-bound paths.
- Verification quality for inventory/schema tests, interaction-context tests, init/join, Git executor policy,
  package scripts, and the exercised happy-path lifecycle behaviors except where findings identify missing boundary
  cases.
- Repository contract coherence for command discovery, schema migration, registry coverage, self-hosting
  boundaries, and platform handling outside the teardown husk adapter mismatch.

**Verdict:** Non-clean — nine major findings remain across correctness/failure behavior, trust
boundaries/compatibility, verification quality/missing cases, and repository contract coherence.

#### Treatment aggregate

- **Scope:** treatment-aggregate
- **Target ID:** `sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e`
- **Head SHA:** `86a0d220dc87e01fed17308cddb13c5604d1a0b9`
- **Coverage:** complete

**Input dispositions**

- **T1-1 — upheld:** A selector miss leaves the declared source as `liveSource` and appends the entry without
  requiring that selector to resolve; complete classification of other discovered interactions can therefore
  coexist with an ungrounded phantom entry.
- **T1-2 — upheld:** Same-ID policy sites are replaced in the mutable command declaration before
  `defineCommandInputDeclarations` performs duplicate validation, erasing the conflicting declaration and making
  the later policy authoritative.
- **T1-3 — upheld:** The repository assertion compares command-path sets, while several matrix invocations terminate
  at setup or lifecycle guards before reaching their declared interaction or subprocess boundaries.
- **T1-4 — upheld:** `sourceExists` interpolates all symbol characters except dollar signs into a regular
  expression, so metacharacters can alter matching or make construction throw.
- **T2-1 — upheld:** Numerous lifecycle registrations call handlers directly, and those handlers call
  `resolveVerbBase` without an `InteractionContext`; their Git execution consequently lacks the process-wide
  no-input subprocess policy.
- **T2-2 — upheld:** Successful install and uninstall tests supply both the attestation flag and successful
  downstream evidence, while the core tests do not independently demonstrate that each false flag prevents its
  protected state transition.
- **T3-1 — upheld:** `executeTransition` fires `reconcile-roadmap` and `reconcile-status-user` before its
  post-side-effect Class write, so promote can render readiness projections from the relocated meta while it still
  contains `[TBD]`.
- **T3-2 — upheld:** Cancelled harness or mode prompts become `undefined` and flow onward, and declined or cancelled
  trust still permits the workflow-verification prompt despite cancellation being declared as `stop`.
- **Seam-1 — duplicate of T2-1:** Rename is a concrete instance of the same missing `InteractionContext`
  propagation established by T2-1; its shared `execa` attribution and omission from the derived matrix strengthen
  that finding but do not constitute a separate failure.

**Findings**

- **TA-1 — Interaction declarations can survive an unresolved selector**
    - **Severity:** major
    - **Rubric dimension:** correctness and failure behavior
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` —
    `reconcileCommandInputInventory` interaction join
    - **Source-grounded evidence:** The interaction branch updates `liveSource` and `claimedInteractions` only when
    lookup returns a site, but `entries.push` executes regardless. `sourceExists` validates only the declared file,
    line, or symbol, not the interaction selector.
    - **Rationale:** The reconciled inventory can contain a policy entry that is not grounded in a scanned
    interaction, undermining the inventory's role as a complete source-to-policy proof.
    - **Declaration-split candidate:** false

- **TA-2 — Policy merge silently resolves duplicate site ownership by order**
    - **Severity:** major
    - **Rubric dimension:** coherence and maintainability
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/repository-inventory.ts` —
    `buildRepositoryCommandInputInventoryFromSnapshot` policy merge
    - **Source-grounded evidence:** For every policy site, `findIndex` locates an existing ID and `splice` replaces
    it. Duplicate validation occurs only afterward in `reconcileCommandInputInventory`, when the earlier site no
    longer exists.
    - **Rationale:** Conflicting declarations are accepted with last-writer precedence, so ownership and rendered
    policy depend on declaration ordering rather than an explicit invariant.
    - **Declaration-split candidate:** true

- **TA-3 — No-input matrix does not prove interaction-boundary reachability**
    - **Severity:** major
    - **Rubric dimension:** verification quality and missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/e2e/command-input-no-input.e2e.test.ts` and
    `packages/arc-framework/__tests__/unit/command-input/repository-inventory.test.ts`
    - **Source-grounded evidence:** Matrix rows such as promote, start, release commit, and sync expect prerequisite
    or lifecycle-guard failures, while the repository test only exact-matches matrix command paths against commands
    represented by interaction entries.
    - **Rationale:** Bounded termination at an earlier guard can pass while a reachable prompt or terminal-capable
    subprocess for the same command remains unaffected by no-input policy.
    - **Declaration-split candidate:** true

- **TA-4 — Declared symbols are treated as unescaped regular expressions**
    - **Severity:** minor
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/lib/command-input/inventory.ts` — `sourceExists`
    - **Source-grounded evidence:** The symbol is interpolated into `new RegExp` after `replaceAll` escapes only `$`;
    characters such as brackets, parentheses, backslashes, quantifiers, and pipes retain regular-expression
    semantics.
    - **Rationale:** Valid source symbols containing metacharacters can produce false source matches, false
    rejections, or an uncaught regular-expression syntax error.
    - **Declaration-split candidate:** false

- **TA-5 — Lifecycle Git consumers bypass the global no-input subprocess policy**
    - **Severity:** major
    - **Rubric dimension:** trust boundaries and compatibility
    - **Stable locus:** `packages/arc-framework/src/cli.ts` lifecycle registrations;
    `packages/arc-framework/src/handlers/lifecycle.ts` — `resolveVerbBase` and `handleRename`
    - **Source-grounded evidence:** Rename, demote, park, resume, materialize, activate, deactivate, integrate, reopen,
    archive, teardown, set-stage, and finalize are registered without `withInteractionContext`. Their handlers call
    `resolveVerbBase()` without a context, which constructs `createUserIOContext(undefined)`. Rename then reaches
    remote-capable work-unit operations through that I/O context. Shared `execa` policies are declared only under
    command path `sync`, and `NO_INPUT_MATRIX` contains sync but not rename.
    - **Rationale:** CI, non-TTY, and `--no-input` authority is not propagated to credential-capable Git/provider
    subprocesses for these direct lifecycle commands, allowing terminal interaction outside the declared global
    policy.
    - **Declaration-split candidate:** true

- **TA-6 — Release setup tests do not isolate mandatory attestations**
    - **Severity:** major
    - **Rubric dimension:** verification quality and missing cases
    - **Stable locus:** `packages/arc-framework/__tests__/unit/handlers/release/setup/install.test.ts` and
    `uninstall.test.ts`
    - **Source-grounded evidence:** Successful install cases pair `workflowVerified: true` with accepted trust and
    successful recording; successful uninstall cases pair `cleanupVerified: true` with
    `cleanupResult: { ok: true }`. The core tests do not independently exercise the protected success path with each
    attestation flag false while all other evidence remains successful.
    - **Rationale:** An implementation that ignored `workflowVerified` or `cleanupVerified` could retain the tested
    successful behavior, leaving mandatory operator evidence unproved.
    - **Declaration-split candidate:** false

- **TA-7 — Promote reconciles generated records before persisting acquired Class**
    - **Severity:** major
    - **Rubric dimension:** repository contract coherence
    - **Stable locus:** `packages/arc-framework/src/lib/work-unit/lifecycle-executor.ts` — `executeTransition` steps
    6-7.25; `packages/arc-framework/src/lib/work-unit/verbs/promote-demote.ts` — `runPromote`
    - **Source-grounded evidence:** `runPromote` supplies `persistClass` when promoting a `[TBD]` stub with an
    acquired Class. `executeTransition` fires all declared side effects first, including `reconcile-roadmap` and
    `reconcile-status-user`, then calls `writeClassField` during post-side-effect finalization.
    - **Rationale:** A successful promotion can leave readiness projections generated from stale `[TBD]` metadata
    even though the authoritative relocated meta later records the acquired Class.
    - **Declaration-split candidate:** false

- **TA-8 — Release setup cancellation does not stop acquisition**
    - **Severity:** major
    - **Rubric dimension:** correctness and failure behavior
    - **Stable locus:** `packages/arc-framework/src/handlers/release/setup/install.ts` —
    `handleReleaseSetupInstall` prompt acquisition
    - **Source-grounded evidence:** `promptForHarness` and `promptForMode` map cancellation to `undefined`, after which
    acquisition continues and the final schema accepts omission. Trust acquisition compares its nullable result to
    `true`, then workflow verification is still prompted whenever `workflowVerified` is false, regardless of the
    failed trust result.
    - **Rationale:** Declared stop cancellations instead become later validation or aborted-core outcomes and can
    trigger additional prompts after the operator has cancelled or declined authority.
    - **Declaration-split candidate:** false

**Withstood**

- Complete acquisition and resolution coverage outside the identified selector and cancellation failures.
- Interaction authority separation for handlers that receive `InteractionContext`.
- Syntax scanning, command registration identities, schema ownership checks, and deterministic inventory rendering.
- Init and join acquisition paths.
- Wrapped machine-output commands and context-aware Git adapters.
- Explicit stdin separation and opaque passthrough handling.
- Shared Git execution behavior when an `InteractionContext` is supplied.
- Lifecycle schema parsing and transition guards outside the promote ordering failure.
- Sync, user-sync, release push, uninstall cleanup-evidence distinction, metadata relocation, and record-runtime
  interfaces.
- Review-gate provider, capability-discovery, and direct schema-registration seams.
- All `implementation-audit/v1` dimensions were considered across the exact treatment target.

**Verdict:** Treatment aggregate is not clean. The exact target has eight distinct findings: seven major and one
minor. The seam report is incorporated into TA-5 as duplicate evidence rather than counted separately.

### Primary classification and paired result

The ten fresh evaluator invocations used the same inherited primary capability and
`implementation-audit/v1` rubric without a model override: three isolated scopes, one isolated seam, and one fresh
aggregate per arm. Fan-out began only after B1 and B2 demonstrated protocol compliance; concurrency changed no
scope, prompt, target, or evidence visibility. No invocation encountered a rate limit. The detached checkout did
not expose an executable dependency tree to evaluators, so their conclusions remained source-based. Primary
verification used a disposable archive of the exact head with the repository's installed dependency cache:

- `npm run -s typecheck:all` passed.
- Six focused unit files passed: 82 tests.
- The focused no-input E2E file passed: 23 tests, including its target build.

Passing tests do not refute the verification findings below: those findings identify unexercised states or
early-exit coverage, not failures in the cases the suite currently runs.

| Measure                                     | Baseline | Treatment | Delta |
| ------------------------------------------- | -------: | --------: | ----: |
| Raw scope findings                          |        7 |         8 |    +1 |
| Raw seam findings                           |        2 |         1 |    -1 |
| Aggregate distinct findings                 |        9 |         8 |    -1 |
| Aggregate blocker-severity findings         |        0 |         0 |     0 |
| Classified declaration-split false blockers |        0 |         0 |     0 |

Every declaration-split candidate was checked against the complete declaration-consumer graph:

- The no-input propagation, matrix reachability, and release-attestation candidates remain genuine; cross-boundary
  source confirms rather than refutes them.
- The policy-collision candidate is a prospective composition-hardening issue: current declarations do not collide,
  but the merge algorithm would silently erase an explicit same-ID owner before duplicate validation.
- No candidate was a blocker, and none became a false blocker after full-source classification.

Under the predeclared outcome rule, the false-blocker comparison is **inconclusive**: baseline and treatment are
zero/zero. The one-finding aggregate reduction cannot be relabeled supportive because the experiment's decision
metric is declaration-split false blockers, not total findings. This result is directional evidence that the
contract-cohesive map preserved complete review coverage and yielded a slightly tighter aggregate, but it does not
test the hypothesized false-blocker reduction on this target.

### Verified advisory packet for `cli-command-inputs`

This packet is review input, not a disposition queue or review-obligation result. It is bound to target
`sha256:9cc34418be17d81a1d46e207f8d1264a0239c51f1b3bc5f7834b3c3dbe70113e` at
`86a0d220dc87e01fed17308cddb13c5604d1a0b9`; the owning session must revalidate every item against its then-current
head before deciding or mutating.

1. **Global no-input propagation and completeness are incomplete (major).** Rename, materialize, errand retire, and
   other direct lifecycle registrations omit the resolved `InteractionContext`; their Git/provider subprocesses
   can retain ambient stdin or terminal prompting. Shared subprocess policies are attributed only to `sync`, so
   inventory-derived matrix coverage omits real consumers. Stable loci: `packages/arc-framework/src/cli.ts`,
   `packages/arc-framework/src/handlers/lifecycle.ts`, `packages/arc-framework/src/handlers/errand.ts`,
   `packages/arc-framework/src/command-input-infrastructure-policies.ts`.
2. **Interaction-selector misses survive reconciliation (major).** A declaration-origin selector that resolves to
   no scanned interaction is still appended with its declared source, so a removed or drifted interaction can
   remain certified. Stable locus: `packages/arc-framework/src/lib/command-input/inventory.ts`.
3. **Teardown rejects platform-valid Windows husk paths (major).** `TeardownCommandInputSchema` requires a leading
   slash before the domain's platform-aware `node:path.isAbsolute` check. Stable locus:
   `packages/arc-framework/src/handlers/lifecycle.ts`.
4. **Promotion orders acquired-Class persistence after relocation and readiness regeneration (major).** Missing or
   failing Class persistence is discovered after relocation, and successful side effects can render ROADMAP and
   `STATUS.USER` while the relocated meta still carries `[TBD]`. Stable loci:
   `packages/arc-framework/src/lib/work-unit/lifecycle-executor.ts` and
   `packages/arc-framework/src/lib/work-unit/verbs/promote-demote.ts`.
5. **The no-input matrix proves several early exits rather than interaction-boundary behavior (major verification
   gap).** Multiple rows terminate on unrelated prerequisites, and explicit-stdin rows do not exercise the complete
   signal triplet. Stable loci: `packages/arc-framework/__tests__/e2e/command-input-no-input.e2e.test.ts` and
   `packages/arc-framework/__tests__/fixtures/command-input/no-input-matrix.ts`.
6. **Release setup attestation tests do not isolate independent evidence gates (major verification gap).** Install
   couples trust and workflow evidence; uninstall couples cleanup attestation and successful cleanup, leaving each
   mandatory flag independently unproved. Stable loci:
   `packages/arc-framework/__tests__/unit/handlers/release/setup/install.test.ts` and
   `packages/arc-framework/__tests__/unit/handlers/release/setup/uninstall.test.ts`.
7. **Release-install cancellation does not stop acquisition (major).** Cancelled harness/mode prompts become absent
   values and continue, while declined or cancelled trust still permits workflow-verification acquisition despite
   declarations specifying `stop`. Stable locus:
   `packages/arc-framework/src/handlers/release/setup/install.ts`.
8. **Composition hardening observations (non-blocking).** Explicit same-ID policy owners would currently resolve by
   array order before duplicate validation, and source-symbol validation treats unconstrained declaration strings
   as partly escaped regular expressions. Stable loci:
   `packages/arc-framework/src/lib/command-input/repository-inventory.ts` and
   `packages/arc-framework/src/lib/command-input/inventory.ts`.

## Supplemental scalability stress test

The accepted inconclusive primary result remains fixed. This supplemental run asks a different question: whether a
pathological monolith can be decomposed into genuinely reviewable leaf chunks and hierarchical seams. It has no
baseline arm, cannot change the zero/zero classification above, and carries no review or mutation authority for its
target.

### Pinned target and metrics

`session-locus-model` settled its implementation at `0c5dd045a`; its clean worktree then added only handoff commit
`6f0237287`, whose `Next Action` explicitly points review back to the implementation tip. The target therefore
excludes that session-state-only commit. Its diff base is the reconciled main parent `ebe446fe2`; using a newer main
tip would introduce unrelated post-reconcile changes rather than review the branch's exact implementation.

```json
{
  "schemaVersion": 2,
  "semanticsVersion": "review-gate/v2",
  "kind": "change-set",
  "repositoryId": "40a11822-248f-4be0-ae17-c24dfb4ae35a",
  "baseRef": "main",
  "diffBaseSha": "ebe446fe2506927ec88b944dd4a7b13feb4c048e",
  "diffBaseTree": "5d32a6b812bb204ef3e0727ec66b3fb98c7d6545",
  "headSha": "0c5dd045ac345e5121b49ffbbca3708594e1b82f",
  "headTree": "b32498d2e2c8bd39c6872d6b12dbc37bf594b556",
  "targetId": "sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b"
}
```

The CLI validated that target identity and returned `consider-chunks` with both project tripwires firing. The
immutable diff contains 333 logical files, 40,246 insertions, 3,508 deletions, 43,754 changed lines, and 1,525
zero-context hunks. Its canonical zero-context patch digest is
`sha256:926dae239bc1dacbb430ef3fe98255720192def2471a2147bb4b1b6b586c6d88`.

### Recursive ownership map

The old six-domain treatment map remains useful only as a seed: its two largest scopes would still be 17,000 and
13,000 changed lines. The recursive map below assigns every changed file and hunk to one leaf while allowing a
consumer context to repeat a targeted changed declaration as dependency context. Metrics count owned review body
once; repeated dependency context does not create another ownership claim.

| Root | Leaf | Owned contract                                             |   Files | Insertions | Deletions |      Lines |     Hunks |
| ---- | ---- | ---------------------------------------------------------- | ------: | ---------: | --------: | ---------: | --------: |
| A    | L1   | Locus schemas, record/state identity, registry, and store  |      23 |      3,502 |         0 |      3,502 |        23 |
| A    | L2   | Allocation, mutation authority, locks, and reconciliation  |      17 |      3,412 |         0 |      3,412 |        17 |
| A    | L3   | Process inspection, ancestry, reader, and roster           |      12 |      2,549 |         0 |      2,549 |        12 |
| A    | L4   | Provisioning, command runtime, and entry guidance          |      11 |      2,463 |         0 |      2,463 |        11 |
| B    | E1   | Errand identity records, claims, transactions, and proofs  |      17 |      3,763 |        17 |      3,780 |        37 |
| B    | E2   | Errand open, link, materialize, and partial settlement     |      13 |      2,366 |        24 |      2,390 |        27 |
| B    | E3   | Errand close, leave, abandon, and retirement               |      15 |      2,233 |       106 |      2,339 |        20 |
| B    | E4   | Errand-to-work-unit promotion                              |       4 |      1,190 |       303 |      1,493 |        53 |
| B    | E5   | Errand handler orchestration and round-trip tests          |       6 |      1,860 |       422 |      2,282 |       169 |
| C    | W1   | Linked placement, marker/roster, rename, and reconcile     |      27 |      2,547 |       221 |      2,768 |       193 |
| C    | W2   | Work-unit lifecycle, teardown, retirement, and verbs       |      36 |      1,632 |       147 |      1,779 |       141 |
| C    | S1   | Compaction-seed and recovery authority                     |      15 |      1,970 |        60 |      2,030 |        81 |
| C    | S2   | Session-init, status, envelopes, and recovery projection   |      43 |      1,862 |       402 |      2,264 |       288 |
| D    | P1   | Groom, housekeep, handoff, inbox, and user-sync operations |      25 |      2,950 |        72 |      3,022 |        53 |
| D    | X1   | CLI locus surface and cross-domain round trips             |      10 |      1,623 |        13 |      1,636 |        39 |
| D    | M1   | Maintained methodology, distribution, CI, and parity tests |      52 |      1,576 |     1,389 |      2,965 |       354 |
| D    | R1   | Work-unit design, task, note, meta, and roadmap records    |       7 |      2,748 |       332 |      3,080 |         7 |
|      |      | **Exact union**                                            | **333** | **40,246** | **3,508** | **43,754** | **1,525** |

The ownership classifier uses ordered first-match predicates over the exact changed-file inventory:

- **R1:** `.arc/active/**` and `.arc/backlog/**`.
- **M1:** both maintained `arc/**` methodology projections; `.arc/reference/**`; `.arc/system/**`; package recipe,
  metadata, and CI; and the framework-sync, init, update, methodology-contract, and review-workflow parity tests.
- **L1:** locus `schema/**`, state, record store, registry, root, path identity, subject metadata, errors, the
  locus-state fixture, and their direct unit tests.
- **L2:** allocator, evidence, lock, mutation, primary-safety, reconcile/resolve drivers, reconciliation, entry
  boundary, and their direct unit tests.
- **L3:** platform/process inspection, process ancestry/execution, reader, roster, the native inspector integration
  test, and their direct unit tests.
- **L4:** command/provisioning runtime and types, provisioning authority/marker, session guidance,
  user-sync-exclusion coverage, and their direct unit tests.
- **E1:** errand change-request lifecycle, identity record/snapshot/claims/transaction/transitions, record/index,
  canonical receipt identity, and their direct unit/integration tests.
- **E2:** errand open, link, materialization, partial settlement, pause-head proof, the open E2E boundary, and their
  direct unit/integration tests.
- **E3:** errand abandon, close, leave, retirement, and their direct unit/integration tests.
- **E4:** errand promotion runtime/adapter and its direct unit/integration tests.
- **E5:** the shared errand handler, handler tests, legacy containment, and the complete errand/locus round trips.
- **W1:** linked-worktree setup, markers/rosters/scaffold, in-flight derivation, work-unit locus/rename/reconcile,
  start/rename/active commands, rename composition, and their direct tests.
- **W2:** work-unit lifecycle executor/guards/transitions, teardown/retirement, lifecycle verbs and handler, the
  lifecycle-exit and park/resume boundaries, and their direct tests.
- **S1:** compaction-seed and recover libraries/handlers, recovery-locus integration, and direct unit tests.
- **S2:** session-init, session-envelope, and status libraries/commands/handlers/fixtures, session-init/envelope E2E,
  status integration/formatting, and direct unit tests.
- **P1:** groom, housekeep, handoff, inbox/user-sync libraries and commands, plan/housekeep handlers, housekeep E2E,
  user-inbox integration, and direct unit tests.
- **X1:** root CLI registration, locus command/handler, change facts/classification, shared E2E helpers, locus
  mutation/routing round trips, start dispatch, and direct handler tests.

Standard-library, third-party, and unchanged repository declarations are external or pre-existing. Changed
cross-leaf declarations are never annotated external: the owning hunk stays in its leaf, while the consumer leaf
receives the exact declaration hunk as named dependency context.

### Hierarchical seam ownership

| Root                            | Children           | Root seam ownership                                                                         |
| ------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| A — locus authority             | L1, L2, L3, L4     | Schema/state identity through mutation, process evidence, reconciliation, and provisioning  |
| B — transient lifecycle         | E1, E2, E3, E4, E5 | Identity-generation transitions through entry, exit, promotion, and handler orchestration   |
| C — work-unit/session lifecycle | W1, W2, S1, S2     | Physical placement, rename/teardown, recovery frames, session-init, and status projection   |
| D — operations and methodology  | P1, X1, M1, R1     | CLI/operation dispatch, shipped workflow claims, distribution parity, and work-unit records |

The top-level seam owns every changed edge between roots: locus authority consumed by errand/work-unit/session
operations; errand promotion and work-unit placement composition; recovery/session projections over transient and
durable loci; CLI registration into all runtime roots; and methodology/record claims about those implementations.
It also checks duplicate abstractions, inconsistent identity/generation vocabulary, and failure-policy drift across
roots.

The highest residual-attention leaf is **S2** for the fail-fast pilot: 43 files and 288 code/fixture hunks spanning
session-init and status projections. Its pilot seam is the S2↔S1 recovery-frame boundary; the later C-root seam
consumes that preserved report and reviews the remaining W1/W2/S1/S2 surfaces without re-reading the pilot body.

### Coverage proof and invocation shape

The ordered classifier assigned all 333 logical files and all 1,525 zero-context hunks exactly once. Leaf totals
reproduce 40,246 insertions, 3,508 deletions, and 43,754 changed lines; there is no unmatched file or hunk. Every
leaf is below 3,800 changed lines. Hunk density remains an explicit pressure signal—especially M1, S2, W1, and
E5—rather than being hidden by the line totals.

The complete carrier shape is 17 leaf contexts, four root-seam/domain-summary contexts, one top-level seam, and one
fresh aggregate: 23 evaluator invocations if the pilot passes without redrawing the map. The S2 pilot and its
recovery-frame seam are part of that accounting, not extra exploratory reviews.

Execution is fail-fast:

1. Draw the complete hierarchy and identify every residual large closure.
2. Pilot the highest-risk leaf and one dependent local seam.
3. Revise the map if either pilot reports partiality, context overload, or malformed scope.
4. Fan out the remaining leaf and seam contexts only after the pilot passes.
5. Reconcile leaf reports into bounded domain summaries, run the top-level seam, and give one fresh non-author
   aggregate only those summaries, coverage facts, seam results, and targeted source loci needed for adjudication.

### Predeclared reviewability result

Classify the stress test as **supports scalability** only when all of the following hold:

- Every leaf and seam completes every rubric dimension without a partiality or context-overload caveat.
- Every attention-heavy closure is split again or recorded as irreducible with the contract/test-cohesion reason
  further splitting would be dishonest.
- The recursive leaf union covers every changed hunk, and every cross-child or cross-domain surface has one named
  seam owner.
- Domain summaries and the top-level seam yield a coherent whole-target aggregate without loading every descendant
  body or raw report wholesale.

Otherwise classify the result as **limits scalability** and name the failed boundary, carrier, or aggregation
condition. Finding count is not a success metric: a clean leaf can still prove reviewability, while a finding-rich
leaf can still fail the test if its review is partial.

### Preservation and later use

Preserve every raw leaf, seam, domain-summary, and aggregate report before primary triage. The final advisory packet
must bind each finding to the tested base/head, originating chunk or seam, stable source locus, material impact, and
correction boundary. After this work unit lands and `session-locus-model` reconciles with main, its owning session
may consume the packet as review input but must revalidate every item against the moved exact target; the packet
does not satisfy that later head's review obligation.

### S2 pilot evidence

The fresh evaluator reproduced the leaf's exact 43-file, 2,264-line, 288-hunk scope and reported
`scopeCompletion: complete`, `contextOverload: none`, and `malformedScope: none`. Its raw report is preserved below
before primary classification.

```yaml
scope: S2
baseSha: ebe446fe2506927ec88b944dd4a7b13feb4c048e
headSha: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics:
  files: 43
  insertions: 1862
  deletions: 402
  lines: 2264
  hunks: 288
scopeCompletion: complete
contextOverload: none
malformedScope: none
dependencyContextInspected:
  - packages/arc-framework/src/lib/locus/process-inspector.ts: acquireSessionAnchor
  - packages/arc-framework/src/lib/locus/schema/record.ts: LocusAnchorSchema
  - packages/arc-framework/src/lib/locus/state.ts: selectCheckoutWorkUnit/deriveLocusFrames
  - packages/arc-framework/src/lib/recover/locus-context.ts: deriveRecoveryLocusContext
  - packages/arc-framework/src/lib/handoff/locus-plan.ts: deriveHandoffLocusPlan
  - packages/arc-framework/src/lib/locus/session-guidance.ts: deriveLocusSessionGuidance
  - packages/arc-framework/src/lib/git/worktree-marker.ts: transient provenance and subject types
  - packages/arc-framework/src/lib/errand/record.ts: readTransientInFlightIndexes
  - packages/arc-framework/src/lib/git/in-flight-derivation.ts: locus/transient classification
  - packages/arc-framework/src/lib/user-sync/inbox-writer.ts: listExecuteBoundInboxEntries
  - packages/arc-framework/src/handlers/recover-probes.ts: createRecoverStatusProbes
  - .arc/active/spec-session-locus-model.md: D1, D6, D9, and D10
findings:
  - id: S2-F1
    title: The shared locus probe rejects the model's valid unverifiable-anchor state
    severity: major
    rubricDimension: correctness and failure behavior
    stableLocus: packages/arc-framework/src/handlers/locus-state-probe.ts — runLocusStateProbe, head line 27
    evidence: >
      acquireSessionAnchor returns either a process anchor or an unverifiable anchor, and LocusAnchorSchema plus
      readLocusState accept both. The adapter throws for every non-process result before calling readLocusState.
    impact: >
      Legitimate unrecognized invocation boundaries lose the whole locus snapshot, so init and recovery cannot
      expose conservative state that the model explicitly represents.
    correctionBoundary: >
      Preserve an acquired unverifiable anchor as reader input and reserve the runtime-probe error arm for actual
      reader/root failures.
  - id: S2-F2
    title: Stale-worktree cleanup can report a live occupied worktree as removable
    severity: major
    rubricDimension: trust boundaries and compatibility
    stableLocus: >
      packages/arc-framework/src/lib/session-init/stale-worktree-sweep.ts — retained-role candidate composition,
      lines 203-235; packages/arc-framework/src/lib/session-init/locus-classification.ts — locusWorkUnitAtPath
    evidence: >
      The retained-role path reduces an exact locus row to only a name, then classifies all candidates using marker,
      clean-tree, merge, and user-surface predicates without a live, unknown, or malformed occupancy veto.
    impact: >
      Session-init can offer teardown for a checkout still occupied by a live session even if a later guarded
      remover would refuse.
    correctionBoundary: >
      Apply the complete locus occupancy veto before emitting a removable decision: live suppresses; unknown,
      malformed, or ambiguous stays manual; only permitted absent/dead states continue.
  - id: S2-F3
    title: Recovery silently substitutes the primary checkout when physical-worktree identification fails
    severity: major
    rubricDimension: correctness and failure behavior
    stableLocus: packages/arc-framework/src/commands/status/run.ts — runRecoverStatus, lines 516-538
    evidence: >
      A failed worktreeIdentity result becomes `{ kind: "primary" }`; that synthetic value enters the public
      worktree slot and checkoutPathForIdentity, allowing recovery to select the primary row.
    impact: >
      A transient identity-probe failure can recover the wrong work unit or incorrectly report a between-WUs frame.
    correctionBoundary: >
      Make recovery-frame, load-set, and cursor derivation depend on successful physical-worktree identification.
  - id: S2-F4
    title: One malformed inbox entry erases all otherwise valid execute-bound recovery work
    severity: major
    rubricDimension: verification quality and missing cases
    stableLocus: packages/arc-framework/src/lib/session-init/inbox-state.ts — runInboxState, lines 63-69
    evidence: >
      One whole-file listExecuteBoundInboxEntries call is wrapped by one try/catch and starts from an empty array.
      Any malformed managed heading or disposition therefore discards every valid execute-bound title.
    impact: >
      One unrelated malformed capture can hide all queued execute-now siblings from init and recovery guidance.
    correctionBoundary: >
      Retain well-formed execute-bound titles in file order while accumulating per-entry diagnostics; add mixed
      valid/malformed coverage.
withstood:
  - Shared Result/probe composition stays centralized and locus state/guidance remain consistently typed.
  - Missing identity short-circuits identity-scoped readers; exact v3 materialization remains narrowly constrained.
  - Transient marker evidence remains diagnostic-only and incomplete locus reads suppress branch cleanup.
  - Broad recovery, handoff, schema, fixture, integration, and E2E coverage exists outside the named gaps.
  - Session-envelope schemas remain strict and locus schemas stay under their own registry authority.
verdict: non-clean
```

Primary source adjudication upheld all four findings:

- **S2-F1 — upheld.** The adapter's line-27 throw contradicts the declared `SelectedSessionAnchor` union, the
  persisted `LocusAnchorSchema`, the reader's `enteringAnchor: LocusAnchor` input, and D5's explicit instruction
  that state mutation proceeds with an unverifiable anchor at unknown liveness.
- **S2-F2 — upheld.** `locusWorkUnitAtPath` discards lease/frame/diagnostic state, while the new retained-role test
  positively expects `removable` for a leaseless retained role and provides no live/unknown case. D10 and Success
  Criterion 9 require live suppression and unknown/manual behavior before an advisory can offer removal.
- **S2-F3 — upheld.** The recovery composer uses a synthetic primary identity after probe failure to choose a
  checkout and derive the recovery frame. D9 requires recovery to consume validated reader facts and says missing,
  mismatched, ambiguous, or unknown state stops rather than guesses. Existing fallback coverage exercises
  session-init, not a safe recovery identity failure.
- **S2-F4 — upheld.** The queue reader throws whole-file on any malformed heading/disposition, and the caller's
  single catch clears the entire queue. Coverage separates an all-valid queue from a sole-malformed entry but omits
  the mixed case required by D9's well-formed-in-file-order plus malformed-diagnostics contract.

The leaf therefore passes the **reviewability** pilot despite being non-clean: its exact scope completed without
partiality, overload, or malformed-boundary caveats, and each finding has a stable, source-grounded correction
boundary. Finding density is outcome evidence, not a reason to redraw a successfully bounded leaf.

### CodeRabbit S2 carrier shadow

One approved CodeRabbit CLI invocation ran as
`coderabbit review --agent --committed --base-commit fa64b32b63ab05f47e35fca5f5e644ff0dbd9742 -c REVIEW_SCOPE.md`
inside a disposable Git projection. Its two synthetic commits reproduced the exact S2 diff—43 files, 1,862
insertions, 402 deletions, and 288 hunks—at the original repository paths. The projection added unchanged
dependency context and did not mutate either real worktree.

The raw structured findings are preserved unchanged:

```json
{"type":"finding","severity":"major","fileName":"packages/arc-framework/src/commands/status/schema.ts","codegenInstructions":"Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.\n\nIn @packages/arc-framework/src/commands/status/schema.ts around lines 328 - 329, Update the strict-current schemas containing locusState and locusGuidance, including both SessionInitProbeResult and SessionRecoverProbeResult, to require locusGuidance instead of marking it optional. Keep the field validated with LocusSessionGuidanceSchema so runtime-validated envelopes match the exported required-field contract.","suggestions":[]}
{"type":"finding","severity":"minor","fileName":"packages/arc-framework/__tests__/unit/session-init/materializable-errands.test.ts","codegenInstructions":"Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.\n\nIn @packages/arc-framework/__tests__/unit/session-init/materializable-errands.test.ts around lines 56 - 76, Add a distinct matching entry via errand({ slug: \"malformed-awaiting\", branch: \"chore/malformed-awaiting\" }) in the entries array of the “excludes open, legacy, malformed awaiting, local, and work-unit bases” test, and configure the awaiting-merge record to use the same slug/branch so it no longer collides with the open paused record. Preserve the existing assertions and other exclusion cases.","suggestions":[]}
{"type":"complete","status":"review_completed","findings":2,"reviewedFileCount":43}
```

Primary classification:

- **CR-S2-1 — upheld, major.** Both strict runtime schemas make `locusGuidance` optional while the exported
  `SessionInitProbeResult` and `SessionRecoverProbeResult` contracts require it and both producers always emit it.
  The unchecked `as z.ZodType<...>` assertions hide that runtime/type mismatch, allowing incomplete external
  envelopes to validate.
- **CR-S2-2 — upheld as a minor verification weakness.** The malformed-awaiting record reuses the default
  open-paused slug and branch. The current flat-map implementation still evaluates both, so this is not a present
  production defect; distinct identity/branch evidence is nevertheless needed for the test to prove that exclusion
  independently rather than permit a future first-record/deduplicating implementation to mask it.

The carrier result is **compatible but slower**: CodeRabbit completed every projected file with exit zero and no
partiality/overload signal, but took materially longer than the Codex leaf evaluator. Its findings remain shadow
evidence and do not enter the 23-invocation completeness accounting.

### S2↔S1 recovery-frame seam pilot

The fresh seam evaluator completed the bounded cross-leaf review with no overload or malformed-scope caveat. Its
raw report is preserved before primary classification:

```yaml
scope: S2-S1-seam
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
scopeCompletion: complete
contextOverload: none
malformedScope: none
dependencyContextInspected:
  - packages/arc-framework/src/lib/locus/schema/state.ts
  - packages/arc-framework/src/lib/locus/state.ts
  - packages/arc-framework/src/lib/locus/subject-meta.ts
  - packages/arc-framework/src/lib/load-set/projection.ts
  - packages/arc-framework/src/handlers/recover.ts
  - packages/arc-framework/__tests__/unit/status/run.test.ts
  - packages/arc-framework/__tests__/unit/recover/audit.test.ts
  - packages/arc-framework/__tests__/unit/recover/locus-context.test.ts
  - packages/arc-framework/__tests__/unit/compaction-seed/emitter.test.ts
  - packages/arc-framework/__tests__/integration/recovery-locus.test.ts
findings:
  - id: S2S1-001
    title: Legacy Errand fallback can override a reader-owned recovery stop
    severity: high
    rubricDimension: correctness/failure behavior; trust boundaries/compatibility
    stableLocus: packages/arc-framework/src/commands/status/run.ts — lines 534-548
    evidence: >
      deriveRecoveryLocusContext fails closed when state.recovery is not none on the current-none arm.
      legacyLocusEligible checks only current.kind, checkout selection, and absence of managed residue; a successful
      legacyErrand result then replaces the failed recoveryContext.
    impact: >
      An authoritative stop or unresolved recovery verdict can become a successful legacy-Errand frame.
    correctionBoundary: >
      Allow legacy fallback only from explicitly clean, record-free state; cover recovery stop/residue and
      reconciliation-stop snapshots with a valid legacy candidate.
  - id: S2S1-002
    title: Cold and between-work-unit recovery silently drops active-extension context
    severity: high
    rubricDimension: correctness/failure behavior; repository contract coherence
    stableLocus: >
      packages/arc-framework/src/lib/recover/locus-context.ts — lines 314-328;
      packages/arc-framework/src/commands/status/run.ts — lines 483-550;
      packages/arc-framework/src/lib/compaction-seed/emitter.ts — lines 173-205
    evidence: >
      baseLoadSet hard-codes activeExtensions to an empty array. runRecoverStatus resolves extensions but does not
      supply them to recovery derivation, and the seed emitter replaces the session-init load set with that
      projection for cold/no-parent recovery.
    impact: >
      Required extension context can disappear from both seed and fresh load set, letting the audit agree on the
      same incomplete manifest.
    correctionBoundary: >
      Thread a successfully resolved active-extension set into recovery derivation and seed emission; keep probe
      failure visible and cover cold transient/frame-none recovery with active extensions.
  - id: S2S1-003
    title: Recovery checkout selection masks worktree-identity failure as primary
    severity: medium
    rubricDimension: correctness/failure behavior
    stableLocus: packages/arc-framework/src/commands/status/run.ts — lines 516-533
    evidence: >
      Failed worktreeIdentity becomes primary and supplies the checkout path to recovery derivation.
    impact: >
      A linked checkout identity failure can select the primary checkout's frame instead of returning a probe error.
    correctionBoundary: >
      Keep physical checkout identity as a Result through recovery authority selection and add a linked-idle-WU
      failure test.
  - id: S2S1-004
    title: Recovery audit does not bind the worktree-local seed to its repository root
    severity: medium
    rubricDimension: trust boundaries/compatibility
    stableLocus: >
      packages/arc-framework/src/handlers/recover.ts — lines 62-130;
      packages/arc-framework/src/lib/recover/audit.ts — lines 180-226 and 337-391
    evidence: >
      CompactionSeed requires repoRoot and the emitter records cwd, but handleRecoverAudit does not pass current cwd
      into auditRecoveryState and the audit never compares seed.repoRoot.
    impact: >
      A copied or stale seed from another linked worktree can pass when branch, head, dirty paths, and load set
      coincide.
    correctionBoundary: >
      Canonicalize and compare seed root with the current worktree root before declaring ready; add linked-worktree
      and foreign-repository mismatch tests.
withstood:
  coherence-maintainability: Warm WU and transient recovery share one locus-derived frame/load-set/cursor authority.
  correctness-failure: Exact-row, live-row, parent-edge, claim, and malformed-cursor checks fail closed.
  intent-scope: The seam consistently moves recovery from soft active metadata to reader-owned locus state.
  trust-compatibility: Strict schemas, safe identity paths, exact hints, and bounded legacy compatibility mostly hold.
  verification: Warm/cold roles, stages, idle WUs, hints, probe independence, and legacy precedence are covered.
  repository-contract: Session-envelope registration and producer/schema compatibility remain centralized.
verdict: non-clean
```

Primary adjudication upheld three distinct seam findings and one duplicate:

- **S2S1-001 — upheld.** `legacyLocusEligible` does not require `state.recovery.kind === "none"` or clean
  reconciliation before replacing a failed reader-derived context.
- **S2S1-002 — upheld.** The cold base manifest hard-codes no extensions; neither the recover composer nor the seed
  re-projection supplies the already-resolved extension set, so seed and audit can agree on the same omission.
- **S2S1-003 — duplicate of S2-F3.** It adds cross-seam evidence but not a fifth distinct defect.
- **S2S1-004 — upheld.** `repoRoot` is required and emitted but absent from the audit input and comparison, leaving
  worktree-local seed isolation unproved and unenforced.

The seam also passes the **reviewability** pilot: it completed every dimension at bounded context, produced stable
cross-leaf findings without loading the whole target, and did not require a map revision. Together the leaf and
seam clear the predeclared fail-fast gate for broader fan-out.

### L1 leaf evidence

The fresh L1 evaluator reproduced the exact 23-file, 3,502-line, 23-hunk leaf and completed every rubric dimension
with no overload or malformed scope. Its raw findings are preserved before classification:

```yaml
scope: L1
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 23, insertions: 3502, deletions: 0, changedLines: 3502, zeroContextHunks: 23}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: L1-F1
    title: Mutation errors escape the promised exhaustive error-code contract
    severity: major
    rubricDimension: trust boundaries and compatibility
    stableLocus: >
      packages/arc-framework/src/lib/locus/schema/mutation.ts — line 45;
      packages/arc-framework/src/lib/locus/mutation.ts — line 439;
      packages/arc-framework/src/lib/locus/errors.ts — lines 5-12
    evidence: >
      The public mutation schema accepts any locus.* string, while LocusErrorCode declares a finite seven-code
      union. popLocusRole emits locus.record-pop.failed, which is absent from that union.
    impact: >
      Consumers cannot exhaustively dispatch on the documented error type, and a live record-pop failure crosses
      the public boundary outside the typed vocabulary.
    correctionBoundary: >
      Use one shared runtime schema and inferred finite error-code type; map pop failures into that vocabulary and
      reject unknown locus.* codes.
  - id: L1-F2
    title: The runtime schema blesses incomplete successful open receipts
    severity: major
    rubricDimension: correctness and failure behavior
    stableLocus: packages/arc-framework/src/lib/locus/schema/mutation.ts — lines 47-56
    evidence: >
      Successful errand-open, plan-open, and housekeep-open results require only activeLocusPath and
      sessionHomePath; allocation, recordId, and leaseId may remain null despite the shared open-success contract.
    impact: >
      An applied/idempotent receipt can validate without the exact authority coordinates needed for safe
      continuation.
    correctionBoundary: >
      Require allocation, record ID, lease ID, active locus, and session home together; add a negative test for
      every missing coordinate.
  - id: L1-F3
    title: Persisted timestamps accept non-UTC offsets
    severity: minor
    rubricDimension: repository contract coherence
    stableLocus: packages/arc-framework/src/lib/locus/schema/limits.ts — lines 23-24
    evidence: >
      The UTC RFC3339 schema uses z.iso.datetime({offset:true}), which accepts non-Z offsets, while the governing
      persisted-record contract requires canonical UTC.
    impact: >
      External or hand-authored records can validate outside the canonical persisted format.
    correctionBoundary: Require Z-form UTC or normalize before persistence and cover the offset boundary.
withstood:
  - Schema roots, registries, record operations, and state derivation remain cohesively separated.
  - Bounded reads, digest checks, generation mismatches, and frame derivation otherwise fail closed.
  - All 23 files serve the foundational locus authority without unrelated scope.
  - Path identity, exclusive minting, lock-backed mutation, and strict variants otherwise withstand review.
  - Direct tests broadly cover corruption, size, generation, state, recovery, and primary safety.
verdict: non-clean
```

Primary adjudication upheld all three findings directly from the pinned source. In particular, the live
`locus.record-pop.failed` producer proves L1-F1 is not theoretical, and the open-success refinement visibly omits
three required authority coordinates. L1 passes reviewability independently of its non-clean verdict.

### E1 leaf evidence

The fresh E1 evaluator reproduced 17 files, 3,780 changed lines, and 37 hunks exactly. It completed every dimension
without overload or malformed scope and returned:

```yaml
scope: E1
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 17, insertions: 3763, deletions: 17, changedLines: 3780, zeroContextHunks: 37}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: E1-F1
    title: Legacy backward-compatible decoding rejects records accepted by the shipped v1/v2 codec
    severity: medium
    rubricDimension: trust boundaries and compatibility
    stableLocus: packages/arc-framework/src/lib/errand/identity-record.ts — LegacyBaseShape at line 18
    evidence: >
      LegacyBaseShape newly applies SlugSchema, bounded intent/text, and strict timestamps to v1/v2 records. The
      base codec accepted any non-empty slug, branch, and createdAt plus unbounded string intent.
    impact: >
      Existing synchronized legacy identities can become unreadable and lose their promised close-only migration
      path; one such entry can invalidate the complete snapshot.
    correctionBoundary: >
      Preserve the exact base codec's accepted legacy domain or add an explicit compatibility projection, with
      regression cases drawn from formerly accepted values.
  - id: E1-F2
    title: The in-flight index treats unreadable or malformed identity authority as empty or partial state
    severity: medium
    rubricDimension: correctness and failure behavior
    stableLocus: packages/arc-framework/src/lib/errand/record.ts — readTransientInFlightIndexes at line 313
    evidence: >
      Snapshot errors return empty maps, while complete snapshots with diagnostics are iterated without propagating
      those diagnostics. Tip/tree failure is indistinguishable from absent authority and malformed entries vanish
      from a partial index.
    impact: >
      Status and in-flight classification can treat live transient branches as non-transient exactly when identity
      authority is corrupt or unreadable.
    correctionBoundary: >
      Return complete/absent/error with diagnostics and require consumers to surface unknown/manual state; cover
      tip/tree errors and non-empty diagnostics.
withstood:
  - Identity schema, snapshot, transaction, transition, lifecycle, and claim layers are narrowly separated.
  - CAS retry, three-way reconciliation, ambiguous push recovery, and exact-generation transforms otherwise hold.
  - Git and host calls use argument arrays and mutation refuses malformed transaction bases.
  - Tests strongly cover races, lifecycle states, exact transitions, and receipt-generation identity.
verdict: changes-requested
```

Primary adjudication upheld both findings. The exact base decoder proves E1-F1's compatibility regression, and the
new `readTransientInFlightIndexes` implementation explicitly collapses snapshot error to empty and ignores complete
snapshot diagnostics. E1 therefore passes reviewability and contributes two distinct advisory findings.

### CodeRabbit E1 carrier shadow

The second CodeRabbit `--agent` invocation completed all 17 files in an exact 3,780-line/37-hunk projection with
exit zero and no partiality signal. Raw findings:

```json
{"type":"finding","severity":"minor","fileName":"packages/arc-framework/src/lib/errand/record.ts","codegenInstructions":"Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.\n\nIn @packages/arc-framework/src/lib/errand/record.ts around lines 161 - 190, Move the existing JSDoc describing io, slug, operation, return value, and thrown errors so it directly precedes the readErrandRecord function declaration. Keep the ErrandRecordReadFailure documentation immediately above its type declaration, ensuring each comment is attached to the intended symbol.","suggestions":[]}
{"type":"finding","severity":"major","fileName":"packages/arc-framework/src/lib/errand/identity-claims.ts","codegenInstructions":"Verify each finding against current code. Fix only still-valid issues, skip the rest with a brief reason, keep changes minimal, and validate.\n\nIn @packages/arc-framework/src/lib/errand/identity-claims.ts around lines 116 - 122, Update the cleanup flow around fetchGroomBase and temporaryRef so git update-ref deletion runs only when temporaryRef was actually created. Preserve the original fetch outcome when no temporary ref exists, while retaining claimGitError(\"cleanup\", ...) for cleanup failures after creation.","suggestions":[]}
{"type":"complete","status":"review_completed","findings":2,"reviewedFileCount":17}
```

Primary classification:

- **CR-E1-1 — upheld, minor.** The `readErrandRecord` JSDoc is attached to
  `ErrandRecordReadFailure` because a second doc block and the type declaration intervene before the function.
- **CR-E1-2 — rejected.** `update-ref -d` is idempotent when the unique ref is absent, and unconditional cleanup is
  necessary when fetch returns an error after ambiguously creating the ref. Gating deletion on a reported fetch
  success would weaken cleanup rather than preserve the original outcome safely.

The second shadow confirms the same carrier result as S2: exact scope completes successfully, but latency is
materially higher and findings require ordinary source adjudication.

### L2 leaf evidence

The fresh L2 evaluator reproduced the exact 17-file, 3,412-line, 17-hunk leaf and completed every rubric dimension
without overload or malformed scope. Its raw findings are preserved before classification:

```yaml
scope: L2
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 17, insertions: 3412, deletions: 0, changedLines: 3412, zeroContextHunks: 17}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: L2-F1
    title: Abandon resolution loses the selected generation before destructive dispatch
    severity: high
    rubricDimension: trust boundaries and compatibility
    stableLocus: packages/arc-framework/src/lib/locus/resolve-driver.ts — lines 9-34
    evidence: >
      resolveLocusGeneration validates one selected row but calls its subject driver with only the subject kind,
      action, and reusable key. The production abandon dispatch then invokes the ordinary lifecycle drivers by
      slug or grooming anchor without the selected record ID, lease ID, claim ID, checkout, or proof generation.
    impact: >
      Reuse of the same key between selection and dispatch can redirect abandonment to a newer generation instead
      of refusing the race, allowing mutation of newer work.
    correctionBoundary: >
      Carry an exact generation capability into every subject driver and revalidate it before identity, ref,
      checkout, teardown, or role-pop mutation; cover same-key replacement between selection and dispatch.
  - id: L2-F2
    title: A crashed stale-lock breaker permanently wedges the secondary lock
    severity: medium
    rubricDimension: correctness and failure behavior
    stableLocus: packages/arc-framework/src/lib/locus/lock.ts — lines 123-149
    evidence: >
      The persistent .break file contains only the breaker token. A process exit after exclusive creation and
      before finally cleanup leaves every later breaker returning generation-mismatch, with no liveness or stale-
      secondary recovery path.
    impact: >
      One breaker crash can leave the dead main lock unrecoverable until manual filesystem intervention.
    correctionBoundary: >
      Make the secondary holder process-anchored and safely reclaimable, or use an automatically released lock
      primitive; add crash-residue coverage that preserves live-breaker exclusion.
withstood:
  - Evidence acquisition, planning, reconciliation, application, and checkout execution remain well separated.
  - Allocation and reconciliation otherwise revalidate typed state, exact record bytes, and Git safety under lock.
  - The owned additions remain within allocator, evidence, locking, safety, reconciliation, and entry boundaries.
  - Tests broadly cover protection modes, evidence failures, lock liveness, reconciliation, and resolve refusals.
verdict: changes-requested
```

Primary adjudication upheld both findings. The production abandon callback demonstrably throws away the selected
generation before reading current subject authority, and ordinary Errand cleanup can then select the latest
same-slug claim. The secondary lock has no serialized anchor or recovery branch after a breaker crash. L2 therefore
passes reviewability while contributing two distinct safety findings.

### W2 leaf evidence

The fresh W2 evaluator reproduced 36 files, 1,779 changed lines, and 141 hunks exactly. It completed all dimensions
without overload or malformed scope and returned:

```yaml
scope: W2
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 36, insertions: 1632, deletions: 147, changedLines: 1779, zeroContextHunks: 141}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: W2-F1
    title: In-place resume attaches its locus before the deliberately deferred checkout
    severity: high
    rubricDimension: correctness and failure behavior; verification quality
    stableLocus: >
      packages/arc-framework/src/lib/work-unit/verbs/park-resume.ts — line 625;
      packages/arc-framework/src/lib/work-unit/mutators/reconcile-work-unit-worktree.ts — lines 339-359;
      packages/arc-framework/src/lib/work-unit/work-unit-locus.ts — lines 147-152
    evidence: >
      resume --here supplies attachSession and deferCheckout together. Reconciliation skips the checkout but
      immediately asks the locus driver to bind the preserved branch; the production driver requires the current
      registered worktree branch to equal that preserved branch and rejects. The real-Git round-trip injects an
      always-successful WorkUnitLocusDriver instead of exercising the production guard.
    impact: >
      The advertised in-place resume path fails before its later manual checkout boundary and cannot complete
      through the real executor/locus composition.
    correctionBoundary: >
      Defer locus establishment until after the preserved branch is actually checked out, then add a real-driver
      integration case that exercises resume --here across that boundary.
withstood:
  - Remaining lifecycle projection, retirement, teardown, and direct-test changes stay within the declared scope.
  - Teardown otherwise fails closed on liveness uncertainty, malformed authority, drift, and dirty worktrees.
  - Exact record, lease, marker, subject, roster-head, and transient-claim comparisons remain intact.
  - Lifecycle mutator naming, retirement predicates, and teardown lock transactions remain cohesive.
verdict: changes-requested
```

Primary adjudication upheld W2-F1. The exact call order pairs `deferCheckout: true` with
`attachSession: true`, the reconciler invokes locus binding without first switching branches, and the production
driver rejects the still-current base branch. The integration fixture replaces precisely that guard with an
unconditional success. W2 passes reviewability and contributes one distinct finding.

### W1 scope-binding retry

The first W1 invocation received only the semantic ownership label and expected totals. Those inputs admitted many
different 27-file subsets with the same metrics, so the evaluator spent 116,456 tokens attempting to reconstruct an
ownership set that the prompt did not uniquely identify. It was interrupted and classified as
`malformedScope: true`; it contributes no review-completeness evidence or findings.

The ordered ownership map was then materialized as an explicit rename-aware path manifest. Primary reproduction
confirmed 27 logical files, 2,547 insertions, 221 deletions, 2,768 changed lines, and 193 hunks before a fresh
evaluator received it. This is a protocol correction, not a redraw of the tested chunk: semantic ownership remains
the design input, while an invocation receives its exact derived manifest.

### W1 leaf evidence

The corrected fresh W1 evaluator reproduced the exact manifest and completed every owned hunk and rubric dimension
without overload or malformed scope:

```yaml
scope: W1
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 27, insertions: 2547, deletions: 221, changedLines: 2768, zeroContextHunks: 193}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: W1-F1
    title: An interrupted rename cannot recover the old path-keyed locus record
    severity: high
    stableLocus: >
      packages/arc-framework/src/commands/rename.ts — lines 282-299;
      packages/arc-framework/src/lib/work-unit/rename-locus.ts — lines 148-155
    evidence: >
      After a physical move lands, already-moved supplies the destination as both source and target. Re-entry reads
      the destination-keyed record instead of the still-existing source-keyed record and settles as absent.
    impact: >
      A resumable partial rename can leave the live checkout unmanaged and retain a stale old-path role.
    correctionBoundary: >
      Preserve or reconstruct both coordinates for already-moved and cover interruption after the worktree move but
      before target-record minting.
  - id: W1-F2
    title: A target-record collision is discovered only after moving the worktree
    severity: high
    stableLocus: packages/arc-framework/src/lib/work-unit/rename-locus.ts — lines 183-204
    evidence: >
      The physical move runs before target mint. An existing target record makes mint refuse after the checkout has
      moved while the source record remains unchanged.
    impact: >
      A safe record collision becomes split physical and logical state.
    correctionBoundary: >
      Validate target absence or idempotence before the move and compensate any post-move persistence failure.
  - id: W1-F3
    title: Create-new rollback leaves the newly minted locus role
    severity: high
    stableLocus: >
      packages/arc-framework/src/commands/start.ts — lines 805-855 and 875-885;
      packages/arc-framework/src/lib/work-unit/mutators/reconcile-work-unit-worktree.ts — lines 397-409
    evidence: >
      Spawn now reconciles and mints a durable role. A later scaffold failure force-removes the worktree and branch
      without removing that exact locus generation.
    impact: >
      An operation reported rolled back retains a role for a checkout that no longer exists.
    correctionBoundary: >
      Retain the role-creation receipt and compensate it by exact generation before worktree removal.
  - id: W1-F4
    title: Locus-owned local tombstones can resurrect stale remote metadata
    severity: medium
    stableLocus: packages/arc-framework/src/lib/git/in-flight-derivation.ts — lines 320-330 and 952-970
    evidence: >
      A local no-meta worktree normally shadows its same-branch remote. The locusOwned early return clears that flag,
      allowing a remote candidate with stale active meta to survive deduplication.
    impact: >
      Archived or terminal work can reappear as in flight.
    correctionBoundary: >
      Preserve the local-worktree tombstone for locus-owned suppression and cover a no-meta local plus stale-meta
      remote twin.
  - id: W1-F5
    title: Marker exact-generation replacement and removal are TOCTOU operations
    severity: medium
    stableLocus: packages/arc-framework/src/lib/git/worktree-marker.ts — lines 598-643
    evidence: >
      Replacement rechecks bytes before a later rename, and removal compares before a later unlink. Another writer
      can install a new generation between the comparison and pathname mutation.
    impact: >
      Concurrent provisioning or promotion can overwrite or delete marker authority it did not observe.
    correctionBoundary: >
      Serialize every marker writer under one shared lock or use a genuinely atomic generation primitive; add
      coordinated concurrent-writer tests.
withstood:
  - Linked-worktree creation, setup, WU-specific reconciliation, locus drivers, and receipts remain cohesive.
  - Path collisions, uncertain leases, dirty teardown, and malformed NUL-delimited topology otherwise fail closed.
  - Legacy marker/husk compatibility and diagnostic-only transient provenance preserve authority boundaries.
  - Rename pairs, imports, real-Git moves, path spellings, and normal rekeying are strongly covered.
verdict: changes-requested
```

Primary adjudication upheld all five findings from the pinned source. W1 passes reviewability after exact manifest
binding and supplies useful high-hunk-density evidence; its invalid first attempt additionally demonstrates that
totals plus semantic prose are not a sufficient evaluator boundary.

### L3 leaf evidence

The fresh L3 evaluator reproduced 12 files, 2,549 changed lines, and 12 hunks exactly, with complete scope and no
overload or malformed-scope signal:

```yaml
scope: L3
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 12, insertions: 2549, deletions: 0, changedLines: 2549, zeroContextHunks: 12}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: L3-F1
    title: A proven ARC shell wrapper can be selected as the durable session anchor
    severity: high
    stableLocus: >
      packages/arc-framework/src/lib/locus/process-inspector.ts — lines 68-70;
      packages/arc-framework/src/lib/locus/platform-inspectors.ts — lines 46-54 and 166-174
    evidence: >
      Anchor selection runs before wrapper classification. Linux and BSD label any recognized shell with a
      controlling TTY as interactive, including a noninteractive bash -lc wrapper that inherits the terminal.
    impact: >
      A lease can bind to the short-lived command wrapper and appear dead as soon as the command returns.
    correctionBoundary: >
      Classify proven wrappers first or derive genuine shell interactivity; cover a TTY-bearing ARC shell wrapper.
  - id: L3-F2
    title: Wrapper recognition crosses ambiguous Node, npm, and npx processes
    severity: medium
    stableLocus: packages/arc-framework/src/lib/locus/process-inspector.ts — lines 158-177
    evidence: >
      Recognition searches broad command-line text rather than requiring ARC in the executed script or command
      position, so unrelated processes with later arc tokens can be traversed as trusted wrappers.
    impact: >
      Ancestry selection can cross an unrelated boundary and adopt its parent session anchor.
    correctionBoundary: >
      Preserve or parse argument boundaries and require ARC at the executable/script or command position.
  - id: L3-F3
    title: Evidence errors can throw instead of returning the promised envelope
    severity: medium
    stableLocus: packages/arc-framework/src/lib/locus/reader.ts — lines 53-58
    evidence: >
      Arbitrary evidence error messages flow directly into a schema requiring nonempty text of at most 4,096
      characters.
    impact: >
      Empty or oversized acquisition errors become ZodError exceptions on the read-only error path.
    correctionBoundary: >
      Normalize error text at the reader boundary and cover empty and oversized messages.
  - id: L3-F4
    title: Subject projection bypasses the reader I/O concurrency bound
    severity: medium
    stableLocus: packages/arc-framework/src/lib/locus/reader.ts — lines 136-155
    evidence: >
      projectSubjects launches one asynchronous subject-meta projection per valid record with unbounded Promise.all,
      despite the evidence reader using a limiter.
    impact: >
      A large roster can burst filesystem operations and exhaust descriptors or fail avoidably.
    correctionBoundary: >
      Reuse a bounded scheduler for subject projection and test maximum concurrency at high cardinality.
withstood:
  - Process execution, inspection, evidence acquisition, projection, and state derivation have clear boundaries.
  - PID generations, native output, ancestry cycles/depth, and absence-versus-unknown states are handled defensively.
  - Native commands avoid shell interpolation and pin locale where required.
  - Tests cover platform adapters, native generations, normal wrapper traversal, malformed evidence, and ordering.
verdict: changes-requested
```

Primary adjudication upheld all four findings. The platform adapters visibly equate TTY-bearing shell identity with
interactivity, wrapper regexes search ambiguous command text, reader error parsing is unguarded, and subject
projection is unbounded. L3 passes reviewability and contributes four distinct findings.

### L4 leaf evidence

The fresh L4 evaluator reproduced 11 files, 2,463 changed lines, and 11 hunks exactly. It completed every dimension
without overload or malformed scope and returned six candidates:

```yaml
scope: L4
base: ebe446fe2506927ec88b944dd4a7b13feb4c048e
head: 0c5dd045ac345e5121b49ffbbca3708594e1b82f
targetId: sha256:d342fd56204dd4e735d1bcf1ada20e091ac5fb7c0498f63ea2c64581eee2148b
ownedMetrics: {files: 11, insertions: 2463, deletions: 0, changedLines: 2463, zeroContextHunks: 11}
scopeCompletion: complete
contextOverload: none
malformedScope: none
findings:
  - id: L4-F1
    title: Rollback can delete an unrelated branch sharing the expected head
    severity: high
    stableLocus: packages/arc-framework/src/lib/locus/provisioning-runtime.ts — lines 238-257
    evidence: >
      PrimaryCheckoutReceipt omits the created branch name. Rollback proves only HEAD, derives the deletion target
      from the current branch, and force-deletes it after switching away.
    impact: >
      A concurrent checkout of another branch at the same commit can cause destructive deletion of unowned state.
    correctionBoundary: >
      Bind the created branch into the receipt and require both branch and head to match before deletion.
  - id: L4-F2
    title: Attach can replace a newly live work-unit lease using stale liveness evidence
    severity: high
    stableLocus: packages/arc-framework/src/lib/locus/command-runtime.ts — lines 62-84
    evidence: >
      Attach reads the current record under lock but validates only record ID, then passes pre-lock row liveness to
      attachLocusLease without comparing the selected and current lease generations.
    impact: >
      Dead-to-live replacement before lock acquisition can authorize overwriting the newer live lease.
    correctionBoundary: >
      Compare the selected lease generation under lock or reinspect the current anchor before replacement.
  - id: L4-F3
    title: A live or unknown record lock does not prevent checkout destruction
    severity: high
    stableLocus: packages/arc-framework/src/lib/locus/provisioning.ts — lines 340-355 and 449-460
    evidence: >
      The reviewer claimed lock-live and lock-unknown proceed through spawned rollback.
    impact: A competing checkout could be removed.
    correctionBoundary: Preserve the checkout and marker for those refusal reasons.
  - id: L4-F4
    title: Spawned provisioning does not revalidate checkout head under the record lock
    severity: high
    stableLocus: >
      packages/arc-framework/src/lib/locus/provisioning.ts — lines 92-108 and 223-227;
      packages/arc-framework/src/lib/locus/provisioning-runtime.ts — lines 116-139
    evidence: >
      Initial scan records roster head, but locked revalidation checks only path, branch, detached state, and
      topology—not the current head.
    impact: >
      The receipt can attest to a stale checkout generation and retained-branch pinning can be defeated.
    correctionBoundary: >
      Require expected head during locked revalidation or build the receipt from a fresh locked proof.
  - id: L4-F5
    title: Post-checkout probe failures leave primary mutations unreconciled
    severity: high
    stableLocus: >
      packages/arc-framework/src/lib/locus/provisioning-runtime.ts — lines 224-235;
      packages/arc-framework/src/lib/locus/provisioning.ts — lines 165-206
    evidence: >
      checkout and checkout -b mutate before rev-parse constructs the receipt. If that probe fails, checkout stays
      null in the caller and rollback is skipped.
    impact: >
      An identity-only error can leave the primary checkout switched and a new branch present.
    correctionBoundary: >
      Reconcile adapter failures after mutation or expose a partial receipt sufficient for exact rollback.
  - id: L4-F6
    title: Marker create-race reread can reject outside the provisioning result contract
    severity: medium
    stableLocus: >
      packages/arc-framework/src/lib/locus/provisioning-marker.ts — lines 53-65;
      packages/arc-framework/src/lib/locus/provisioning.ts — lines 110-115
    evidence: >
      After createMarker returns exists, the second readMarker is outside a catch; provisionSpawned also does not
      catch establishReadyMarker rejection.
    impact: >
      Provisioning can reject instead of returning typed evidence and can leave a created worktree unreconciled.
    correctionBoundary: >
      Convert the reread failure into MarkerEstablishmentResult.error and cover the create-exists/read-reject race.
withstood:
  - Ports, discriminated results, authority selection, and marker/record helpers remain cohesive.
  - Expected-byte mutation, retained-head initial checks, role conflict, and incomplete-cleanup evidence mostly hold.
  - Owned changes stay within provisioning, command runtime, guidance, and machine-local exclusion.
  - Tests cover normal provisioning, retained branches, rollback, record races, authority mismatch, and replay.
verdict: changes-requested
```

Primary classification:

- **L4-F1, F2, F4, F5, and F6 — upheld.** Each claimed race is reachable in the pinned composition and lacks an
  outer generation guard.
- **L4-F3 — rejected.** `acquire` returns lock-live and lock-unknown with `identity-only` evidence.
  `canRollbackSpawnedRecordFailure` requires `marker-record-mismatch`, so those refusals never enter spawned
  rollback. The reviewer overlooked the earlier evidence-shape guard.

L4 passes reviewability and contributes five distinct findings after source adjudication.
