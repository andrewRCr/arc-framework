# Task List: Delivery Native Stack Composition

- **Design:** `spec-delivery-native-stack-composition.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:ac69e6b3f6b12c00d67f22486a17370791d2042f746b0cc90be8a0c79d6d6df8`
- **Projection:** `stack-to-main`
- **Landability:** All members are `independently-landable`.

### Members

| #   | Member                           | Chunk key                      |
| --- | -------------------------------- | ------------------------------ |
| 1   | Member-boundary verification     | `member-boundary-verification` |
| 2   | Structural contribution identity | `contribution-identity`        |
| 3   | Delivery-aware review-gate       | `review-gate-resolution`       |
| 4   | Topology transition and publish  | `topology-transition`          |
| 5   | Terminal integration arm         | `terminal-integration`         |
| 6   | Refresh and native landing       | `refresh-and-native-landing`   |
| 7   | Hosted-review fan-out            | `review-fan-out`               |
| 8   | Record retirement and doctrine   | `retirement-and-doctrine`      |

#### Member coverage

| #   | Tasks                                                                         | Design elements     |
| --- | ----------------------------------------------------------------------------- | ------------------- |
| 1   | `1.1`, `1.2`, `1.3`, `1.4`, `1.5`, `1.6`, `1.7`, `1.8`                        | `rfc:D7`            |
| 2   | `2.1`, `2.2`, `2.3`, `2.4`, `2.5`, `2.6`                                      | `rfc:D4`            |
| 3   | `3.1`, `3.2`, `3.3`, `3.4`, `3.5`                                             | `rfc:D11`           |
| 4   | `4.1`, `4.2`, `4.3`, `4.4`, `4.5`, `4.6`, `4.7`                               | `rfc:D1`, `rfc:D2`  |
| 5   | `5.1`, `5.2`, `5.3`, `5.4`, `5.5`, `5.6`, `5.7`                               | `rfc:D3`            |
| 6   | `6.1`, `6.10`, `6.11`, `6.2`, `6.3`, `6.4`, `6.5`, `6.6`, `6.7`, `6.8`, `6.9` | `rfc:D5`, `rfc:D6`  |
| 7   | `7.1`, `7.2`, `7.3`, `7.4`, `7.5`, `7.6`, `7.7`                               | `rfc:D8`            |
| 8   | `8.1`, `8.2`, `8.3`, `8.4`, `8.5`                                             | `rfc:D10`, `rfc:D9` |

### Named seams

| #   | Seam                         | Members                | Owner | Design elements                        |
| --- | ---------------------------- | ---------------------- | ----- | -------------------------------------- |
| 1   | Top-base resolution window   | 3, 4, 5                | 5     | `rfc:D1`, `rfc:D11`, `rfc:D3`          |
| 2   | Member review addressability | 3, 5, 7                | 7     | `rfc:D11`, `rfc:D3`, `rfc:D8`          |
| 3   | Member-boundary firing       | 1, 2, 3, 4, 5, 6, 7, 8 | 8     | `rfc:D7`                               |
| 4   | Single equivalence arbiter   | 2, 6, 7                | 7     | `rfc:D4`, `rfc:D5`, `rfc:D6`, `rfc:D8` |

#### Acceptance

- **1. Top-base resolution window:** A member-branch base resolves throughout the window, then terminal integration
  requires a freshly observed protected-base target.

- **2. Member review addressability:** Every member is an exact-head review subject and whole-work-unit discharge is the
  conjunction over retained member bindings.

- **3. Member-boundary firing:** Every member range closes with the shared member-scope criteria walk while union
  verification remains the terminal phase.

- **4. Single equivalence arbiter:** One structural contribution identity serves reconciliation and review applicability
  without a duplicate equivalence notion.
<!-- arc:delivery-plan:end -->

## **Phase 1:** Member-boundary verification

**Delivery member:** 1 — `member-boundary-verification`

_Purpose:_ Land the member-scope verification substrate before any member closes, so every later member's closing
task fires a real criteria walk rather than a hand-rolled one. Substrate-independent, which is why it leads:
nothing else in the design gates it, and everything downstream consumes it.

_Design decisions:_ The walk is extracted as a method taking scope as an input rather than a sibling workflow, so
the semantics are exact at both fire points and no conditional control flow enters workflow prose; the method
carries the adversarial companion at both scopes under one posture for the same reason. Grouping is by heading and
never by indentation — two- or three-space checkbox indentation drops as inert content, while four or more spaces
hard-refuse.
Members bind per task, never per phase, so member validation adds no phases and leaves the terminal verification
task unassigned. Every surface this member edits is shipped: each changes in the package source and the project
copy together.

### `[x]` **1.1 Extract the criteria walk into a `validate-criteria` method**

- _Goal:_ The success-criteria walk exists once, as a method whose scope is a parameter, so a member boundary and
  a work-unit boundary run identical semantics — walk and adversarial companion alike — over different spans.

    - `[x]` **1.1.a Author the method with scope as its input**

        - Added `validate-criteria.md` in both method corpora; one scope binds the criteria slice, bounded diff,
          and reachability span, and the report preserves immutable text, evidence, state, and span without marking.

    - `[x]` **1.1.b Carry the adversarial companion in the method contract**

        - The method now owns the identical `Class`-scaled adversarial offer at both scopes. The central method adds
          the bounded authored-partition carrier while keeping it separate from `partition-map` and review chunking.

    - `[x]` **1.1.c Reduce the verification workflow to its fire-points**

        - `verify-work-unit.md` retains terminal marking, three-state annotations, delivery-integrity checks, Tier 3,
          and attestation while delegating the walk and fresh-context companion at work-unit scope.

- _Outcome:_ Criteria validation now has one scope-parameterized method contract and one adversarial posture across
  member and work-unit boundaries; consumers no longer duplicate either half of the verification walk.

### `[x]` **1.2 Bind both `validate-criteria` fire-points by hand**

- _Goal:_ The method loads at both consuming sites, verified by reading each fire-point through rather than by
  trusting the declaration.

    - `[x]` **1.2.a Declare and fire the work-unit fire point**

        - `verify-work-unit.md` declares only `validate-criteria` and fires it directly at the work-unit walk.

    - `[x]` **1.2.b Declare and fire the member fire point**

        - Both process-loop surfaces declare only `validate-criteria` and fire it when the closing task reaches a
          delivery-member boundary.

    - `[x]` **1.2.c Confirm both fire-points resolve by reading them**

        - Read each declaration through its callsite. Witnesses: `validate-criteria: { scope: { kind: work-unit,
          criteria: complete Success Criteria, diff: complete WU diff, reachability: complete WU tree } }` and
          `validate-criteria: { scope: { kind: delivery-member, criteria: member group, diff: bounded member diff,
          reachability: cumulative member tree } }`.

### `[x]` **1.3 Specify the member-grouped Success Criteria grammar and its indent constraint**

- _Goal:_ A task list may group its success criteria by delivery member under plain `###` subheadings plus one
  cross-member seam group, and the shape that silently breaks the scanner is written down rather than rediscovered.

    - `[x]` **1.3.a Write the grouped-criteria grammar into the formatting strategy**

        - The strategy now specifies member and seam headings, root-indent-only criteria, every scanner refusal,
          the single-deliverable flat form, and `validate-criteria` as state and immutability authority.

    - `[x]` **1.3.b Carry the block into the task template**

        - The task template renders a member group plus cross-member seams and explains when to retain flat form.

    - `[x]` **1.3.c Record the assignment rule**

        - Criteria now route to the earliest boundary that can see their evidence, otherwise to cross-member seams.

- _Outcome:_ The shipped authoring contract makes headings the only grouping mechanism and states the silent-drop,
  hard-refusal, and task-like-root refusal cases that protect criteria reachability.

### `[x]` **1.4 Specify delivery-member phase metadata and the member closing-task shape**

- _Goal:_ A reader can tell which delivery member a phase belongs to without leaving the phase, and the closing
  task that fires the member-scope walk has one written shape rather than a per-author invention.

    - `[x]` **1.4.a Specify the phase-preamble delivery-member pointer**

        - The pointer is the first preamble line, carries stable ordinal and chunk key, and remains reader context;
          task coverage — not the phase — owns member assignment.

    - `[x]` **1.4.b Specify the member closing task**

        - Member ranges close with ordinary implementation parents assigned through coverage, leaving the one
          terminal Verification task unassigned and adding no phases.

    - `[x]` **1.4.c Update the task-generation workflow to emit both**

        - Both generation surfaces now emit pointers, closing tasks, grouped criteria, and matching pre-save checks.

- _Outcome:_ Delivery metadata now appears where task readers need it without turning phases into assignment
  authority or weakening the terminal verification contract.

### `[x]` **1.5 Relax the task-list invariance clause and preserve member subgroups through cleanup**

- _Goal:_ The two guards that would otherwise forbid or strip member subgroups admit them instead.

    - `[x]` **1.5.a Admit member grouping in the invariance clause**

        - The invariant now treats delivery-member and seam grouping as part of the fixed Success Criteria shape.

    - `[x]` **1.5.b Add member subgroups to the cleanup preserve list**

        - Cleanup now preserves delivery-member and cross-member seam subgroups with the Success Criteria section.

### `[x]` **1.6 Validate member order and contiguity in the delivery task inventory**

- _Goal:_ A plan whose member task ranges interleave or depart from member order is refused at authoring time,
  so the premise that member k's completion boundary is member k's cumulative tree is enforced rather than assumed.

- _Outcome:_ `validateDeliveryTaskCoverage` now refuses one typed `member-task-order` issue naming every offending
  member across noncontiguous, interleaved, reversed, and non-adjacent-sharing ranges. Adjacent sharing and empty
  ranges remain valid; the new issue blocks both authoring entries without changing assignment issue behavior.

### `[x]` **1.7 Ship `validate-criteria` through `init-recipe.json` and both copies**

- _Goal:_ The method reaches installing projects rather than existing only in the repository that authored it.

- _Outcome:_ The installation recipe, Configurable classifier, self-hosting manifest, and init/update contract tests
  now carry `validate-criteria.md`; the package and project method bodies begin aligned.

### `[x]` **1.8 Close delivery member 1** — validate criteria at member scope

- _Goal:_ Member 1's criteria group is walked at its own boundary, over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

    - `[x]` **1.8.a Refuse delivery members without a closing task boundary**

        - Empty task ranges now produce the existing `member-task-order` refusal under either authoring entry,
          superseding Task 1.6's permissive empty-range outcome so every member has a closing fire-point.

    - `[x]` **1.8.b Add method-owned dependency declarations**

        - Method frontmatter now supports protected `arc.methods`; workflow declarations root a deduplicated
          transitive graph, and the corpus audit refuses missing targets, unknown roots, cycles, and unreachable
          methods. `validate-criteria` owns its `adversarial-review` dependency without caller duplication.

    - `[x]` **1.8.c Keep unresolved member reports on the open-task path**

        - The process loop now reports and stops on an unresolved member result while leaving the task open and
          skipping parent cascade, completion extensions, and the completion-only checklist.

    - `[x]` **1.8.d Route the extracted substrate to its planned owners**

        - Captured one grooming pass to `knowledge-architecture`, naming `composable-workflows` and
          `method-conventions` as consumers of the landed seam and preserving their broader planned ownership.

- _Outcome:_ Member 1 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 1 — member-boundary-verification`.
    - _Span:_ diff `45b0e9393..c22890a42`; reachability `c22890a42`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 1 — member-boundary-verification > 1`; _State:_ `[x]`;
      _Evidence:_ grouped criteria and eight ordinary closing tasks feed the member-scoped walk; terminal
      verification remains sole and unassigned; closeout consumes recorded reports plus the seam group; all shipped
      surfaces have matching package/project coverage; validation refuses empty, interleaved, or order-departing
      ranges; and the authored-partition carrier preserves one complete logical pass. Both Heavy adversarial passes
      were consumed, and every confirmed finding was resolved.

- _Forward amendment (2026-08-25):_ The close-out above performs member-scope verification but the canonical
  delivery inventory records it as implementation. Replace that workaround with ordered role/scope classification
  while preserving the exact terminal work-unit verifier and existing member-partition semantics.

    - `[x]` **1.8.R.a Model parent task roles and verification scopes**

        - Replaced singular task fields with ordered role/scope parents across extraction, schemas, coverage,
          authoring, composition, fingerprints, handlers, and refusals; regenerated the live revision-1 plan and
          revision-32 state with stable deliverable bindings, and made repeated projection renders idempotent.

    - `[x]` **1.8.R.b Revalidate the amended Member 1 boundary**

        - _Criteria slice:_ `Success Criteria > Member 1 — member-boundary-verification`.
        - _Span:_ original diff `45b0e9393..c22890a42`; amendment `f9fac0ea9..adb7de941`; Task 1.8.R.b corrections
          `adb7de941..d6d842332`; reachability `d6d842332`; boundary-order deviation: the approved forward amendment
          reopened Member 1 after the original boundary.
        - _Criterion:_ `Success Criteria > Member 1 — member-boundary-verification > 1`; _State:_ `[~]`;
          _Evidence:_ D7.2b supersedes only the ordinary-implementation-task shape from D7.2a. The member-scoped
          criteria walk, grouped evidence, unchanged Success Criteria markers, terminal seam disposition, declared
          method reachability, ordered member ranges, and authored-partition carrier remain in force; member closeout
          is now represented by its actual verification role.
        - _Criterion:_ `Success Criteria > Member 1 — member-boundary-verification > 2`; _State:_ `[x]`;
          _Evidence:_ ordered roles and open verification scopes flow through extraction, schemas, coverage,
          fingerprints, composition, handlers, and plan revalidation. Coverage requires every member to close on a
          member verifier and every member verifier to close at least one owning member while preserving adjacent
          boundary sharing. The regenerated revision validates with eight exact member boundaries, one terminal
          unassigned work-unit verifier, no unbound verifier, and state revision 32 bound to the same plan digest.
        - _Summary:_ one met, one superseded, zero unresolved. Both Heavy adversarial passes were consumed; the final
          confirmed finding was corrected and the settled criteria, workflows, current plan, and state were reread
          coherently without a third pass.

## **Phase 2:** Structural contribution identity

**Delivery member:** 2 — `contribution-identity`

_Purpose:_ Replace the byte-identical aggregate-patch fallback with an in-core three-way reapply arbiter, and give
every consumer the path evidence its refusals currently drop. This is the single equivalence notion the refresh,
landing, and review-applicability paths all resolve against.

_Design decisions:_ Tree equality stays the fast path; only the fallback changes. The arbiter reapplies the old
member head onto the new predecessor with an explicit merge base and compares the resulting tree to the provider's
— auto-computed merge bases are wrong after a provider rewrite, so the explicit base is not optional. Stable patch
identity is rejected as the arbiter: it hashes context lines, so it false-refuses the adjacent-edit case a busy
trunk makes common, which is the observed failure with different bytes.

### `[x]` **2.1 Extract the `merge-tree` capability probe to a shared seam and widen its canary**

- _Goal:_ Both the branch-inspection path and the arbiter establish `merge-tree` support once, through one probe
  that also exercises the explicit merge base, and refuse through the existing typed reason when it is absent.

- _Outcome:_ `merge-tree-capability.ts` now resolves its own `HEAD` canary, exercises both write-tree forms, and
  memoizes the result per injected Git executor while dropping unusable-canary negatives for retry. Branch
  inspection consumes the shared probe without classification drift, and both refusal unions share the existing
  `merge-tree-write-tree-unsupported` reason.

### `[x]` **2.2 Implement the in-core reapply arbiter and its three verdicts**

- _Goal:_ A member carried across a predecessor rewrite is judged by whether reapplying its contribution onto the
  new predecessor reproduces the provider's tree — so a mechanically rebased member with an unchanged semantic
  patch is admitted, and anything else refuses with its reason named.

- _Outcome:_ The Git-backed proof now pins all four endpoints, reapplies the old member with the old predecessor as
  the explicit merge base, and compares the resulting tree to the provider tree. Only an unchanged predecessor
  can take the tree-equality shortcut; moved predecessors and merge commits are judged by mechanical reapplication.

### `[x]` **2.3 Carry conflicted and divergent paths in the result vocabulary**

- _Goal:_ A refusal names which paths caused it, so an operator resolving a carried-member refusal reads the
  evidence instead of re-deriving it.

- _Outcome:_ Accepted results distinguish tree equality from mechanical reapply. Refusals distinguish unverified
  endpoints, unsupported Git, conflicts, divergence, and hard Git failures; only conflict and divergence carry
  path arrays, while malformed conflict output remains a conflict with empty path evidence.

### `[x]` **2.4 Propagate path evidence through the six collapsing call sites**

- _Goal:_ Every consumer that today reduces the proof to a boolean carries the verdict's reason and paths into
  its own typed refusal, so no caller silently discards the evidence the arbiter produces.

- _Outcome:_ All three suffix-reconciliation paths, suffix rematerialization, landing, and reconciliation preserve
  the typed proof refusal through their public results. The strict CLI result envelope now admits the corresponding
  reason-and-path shapes, while terminal residual consumers carry the vocabulary without behavioral expansion.

### `[x]` **2.5 Retire the aggregate-patch envelope and the linearity precondition**

- _Goal:_ The byte-identical patch envelope and the linear-range precondition are gone from the code base, so no
  second equivalence notion survives beside the arbiter.

- _Outcome:_ The patch envelope, byte-patch comparator branch, and linear-range guard are absent. The pure module
  retains endpoint types plus the unchanged-predecessor tree shortcut, and suffix rematerialization remains the
  review-fix recut path using the single structural arbiter.

### `[x]` **2.6 Close delivery member 2** — validate criteria at member scope

- _Goal:_ Member 2's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

- _Outcome:_ Member 2 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 2 — contribution-identity`.
    - _Span:_ diff `22c11cc63..a8eaa4d70`; reachability `a8eaa4d70`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 1`; _State:_ `[x]`;
      _Evidence:_ the single structural arbiter reapplies every moved-predecessor case, keeps the unchanged-predecessor
      shortcut, carries equivalent results, and names exact conflict or divergence paths.
    - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 2`; _State:_ `[x]`;
      _Evidence:_ the shared capability probe preserves the typed unsupported refusal and a pinned fallback when
      `HEAD` is unusable, without another version floor or disclosure/degrade path.
    - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 3`; _State:_ `[x]`;
      _Evidence:_ the aggregate-patch envelope and linearity substrate are absent. Heavy pass 1 exposed two edge
      cases, their approved fixes landed in-span, and pass 2 returned no findings.

## **Phase 3:** Delivery-aware review-gate resolution

**Delivery member:** 3 — `review-gate-resolution`

_Purpose:_ Make ARC's own review bookkeeping able to name a delivery member as a review subject and to resolve a
change request whose base is a member branch. Both are prerequisites the topology, the terminal arm, and the
review fan-out each hit immediately.

_Design decisions:_ Nothing changes provider-side — a member pull request is an ordinary pull request, reviewed
like any other. The entire change is which subject a review addresses, internally. Resolution is fixed in the
shared primitive rather than bypassed for delivery: bypassing would leave review status broken on the top branch
throughout the landing window and leave every other consumer refusing, which is a special case to maintain forever.

### `[x]` **3.1 Resolve a member branch to its work unit at the review-gate seam**

- _Goal:_ A delivery member head resolves to its owning work unit where review reads its subject, so review status
  and the hosted request path can address a member instead of refusing.

- _Outcome:_ `resolveReviewSubject` composes ordinary branch resolution with the exact-head delivery lookup and
  preserves distinct resolved, unbound, and unavailable outcomes. Review status and hosted request composition
  consume the narrow seam; the shared branch helper and all session, roster, cleanup, and recovery machinery are
  unchanged.

### `[x]` **3.2 Convert the hosted request vehicle to a discriminated union with a delivery-member arm**

- _Goal:_ A hosted review request can name a delivery member — plan, deliverable, and exact head — alongside the
  errand binding it carries today.

- _Outcome:_ The hosted request envelope now carries an optional discriminated errand/delivery-member vehicle;
  the member arm binds plan, deliverable, and exact head through its own state validation. Errand behavior remains
  unchanged, vehicle-less requests remain valid, and resumable handles still persist only the separate errand
  progress binding rather than copying member state.

### `[x]` **3.3 Admit a member-branch base in change-request resolution**

- _Goal:_ Resolving the top's change request succeeds while its base is a member branch, so the terminal spine
  and review status keep working through the whole landing window.

- _Outcome:_ Change-request classification accepts a caller-supplied set alongside the configured base while
  preserving every existing disposition and unrelated-base refusal. The exact-head member lookup derives the
  predecessor branch, and all callers in review handling, status, pre-publication, checkpoint, and merge
  composition supply it without making the shared classifier store-backed.

### `[x]` **3.4 Derive discharge targets from the bound members at read time**

- _Goal:_ Discharge consults the delivery's member targets rather than only the current branch's single open
  request, so a work-unit obligation can be read against the whole member set.

- _Outcome:_ The repository delivery reader enumerates current plan/state on every call and projects one discharge
  target per member with retained request and coordinates, including a member whose physical ref is gone. The
  hosted target resolver preserves singleton behavior for an authoritatively unbound work unit, returns a contained
  unavailable result on read failure, and persists no target list or cursor.

### `[x]` **3.5 Close delivery member 3** — validate criteria at member scope

- _Goal:_ Member 3's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

- _Outcome:_ Member 3 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 3 — review-gate-resolution`.
    - _Span:_ diff `f9f7ed482..fde706811`; reachability `fde706811`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 3 — review-gate-resolution > 1`; _State:_ `[x]`;
      _Evidence:_ exact-head reverse lookup addresses review status and hosted member progress, every shared
      change-request caller supplies the valid delivery bases, and session/recovery authority remains with the
      originating checkout. Fresh pass 2 found no residual finding after the hosted-member composition correction.

## **Phase 4:** Topology transition and publication

**Delivery member:** 4 — `topology-transition`

_Purpose:_ Make the provider stack chain the delivery topology — every code-bearing member a first-class ref in
one ancestral chain, with the originating branch as its top. Removes the retained control branch and the
disconnected terminal request by construction rather than by patching their failure modes.

_Design decisions:_ Stacking is adopted as a topology transition, not a pre-authored branch shape: a work unit
begins with one ordinary branch and worktree, while one authoritative canonical Delivery Plan selects stacked
delivery intent before state exists. The originating branch adopts the chain by an append-only ancestry merge. The
rejected alternative — rewriting the work-unit branch to a residual-only range — would force-push a pushed session
branch, violating the append-only contract and orphaning SHA-keyed user notes, so it is excluded by construction.
Two merge semantics share the
ancestry-merge name and must not be conflated: adoption is content-neutral and keeps the top's tree exactly,
guarded by a subset check; absorption is the genuine content merge and belongs to the refresh path.

### `[x]` **4.1 Author filtered member cuts as first-class delivery refs**

- _Goal:_ Each planned member is published as a real ref in the delivery namespace, cut below the originating
  branch with lifecycle artifacts excluded, so the chain is made of branches rather than disposable projections.

- _Outcome:_ Delivery publication now admits an exact local member branch before the existing remote lease and
  refuses a divergent local head without moving it. Eligibility continues to own lifecycle filtering and now
  rejects delivery-namespace refs as authoring candidates, while derived published refs retain the planned namespace.

### `[x]` **4.2 Adopt the chain by content-neutral ancestry merge under the subset guard**

- _Goal:_ The originating branch records the member chain as ancestry without changing its own tree, so its diff
  against the highest member is exactly the residual and the branch remains both the work unit's branch and the
  stack's top.

- _Outcome:_ A containment-specific classifier now reuses structural contribution reapplication while preserving
  exact conflict, divergence, and unavailable evidence. Materialization advances the unchanged originating tree
  through a two-parent `commit-tree` plus exact `update-ref` CAS; retries adopt only the exact prior result, and the
  same top ref accepts later contained members without rewrite or force semantics.

### `[x]` **4.3 Bind the terminal member at publish**

- _Goal:_ The terminal member binds its ref, change request, and coordinates when its pull request opens, exactly
  like any other member, so no member is left unbound through the landing window.

- _Outcome:_ The terminal now derives the originating ref and its predecessor base, binds ref, coordinates, and the
  ordinary request through publication, and adopts an exact existing request without rewriting presentation. The
  member composer remains non-terminal-only, and a one-member stack follows the same protected-base-to-top path.

### `[x]` **4.4 Re-author the publish arm: push members, open requests bottom-up, optionally register**

- _Goal:_ Publication pushes the member set, opens every pull request bottom-up, then optionally registers the
  non-terminal members after their provider-assigned request IDs exist, with the terminal request in the same arm.

- _Outcome:_ Materialization publishes every delivery ref and advances the adopted top by ordinary fast-forward
  before publication opens bottom-up requests, while an interrupted request reservation resumes by exact host
  observation. The shipped workflow validates both presentation forms first and routes optional non-terminal native
  registration only after every request ID exists; opt-out and one-member paths make no registration call.

### `[x]` **4.5 Extend the window-time mutation loop with its mechanical tail**

- _Goal:_ A review fix during the landing window recuts the suffix, re-adopts it, rebinds state, and re-verifies
  only the members whose contribution actually changed — all riding the finding-disposition approval that
  triggered it, with no new attended stop.

- _Outcome:_ Rematerialization now retains arbiter-backed contribution verdicts, re-adopts and ordinarily publishes
  the recut suffix beneath the content-neutral top, then CAS-rebinds the terminal coordinate with exact retry
  convergence. Its strict next action routes only selected changed members through member-scope criteria and reruns
  Tier 1 under the originating finding disposition; equivalent carried members and the interlock count remain zero.

- _Context:_ The shipped singleton integration flow already recomposes over head movement without an added
  interlock: an approved fix applies and verifies, commits and pushes, recomposes the current target, and settles
  against the changed target under one structured approval. The delivery window inherits that loop unchanged and
  extends its tail.

- _Shape:_ Four steps ride the same approval — suffix recut and re-adoption; the ancestry re-merge of the new
  highest head, in the content-neutral adoption form because the recut suffix is re-authored from top content so
  the subset guard holds; the version-checked state rebind; and member-scope re-verification scoped by the
  arbiter's verdicts, so a member whose contribution is proved unchanged re-verifies nothing. A moved predecessor
  always reaches mechanical reapply; equal member trees alone never select the shortcut. The tail composes through
  the existing rematerialization and reconcile services and their returned next actions, never a git-mechanics
  narration in prose.

    - Build `test-first` (one behavior at a time):
        - A review fix recuts the unlanded suffix and re-adopts it without an added interlock
        - Re-adoption uses the content-neutral form and leaves the top's tree exact
        - The state rebind is version-checked and refuses a stale writer
        - Only members whose contribution changed under the recut re-verify
        - A member proved contribution-equivalent across the recut re-verifies nothing
        - Tier 1 gates re-run per the existing after-fix rule

- _Forward amendment (2026-08-24):_ Self-delivery showed that the completed path always authors and rewrites the
  whole suffix even when an exact native-stack presentation can perform the dependent mechanical refresh. D5.8
  preserves that implementation as the exact unregistered fallback and adds the provider-neutral linked route.

    - `[x]` **4.5.R Route an approved review fix through the current delivery presentation**

        - Exact registered presentation now publishes only the selected member before provider-native dependent-
          suffix refresh; exact unregistered presentation retains the complete rematerialization route.
        - Every uncertain presentation stops, selected publication is exact and recoverable, and zero provider
          movement settles only the still-owed terminal-top absorption.
        - Provider refusal before reservation now supports an attended external-refresh replan into the existing
          adoption lifecycle without automatic fallback, provider-specific state, or publication delegation.

        - _Forward amendment (2026-08-25):_ D5.9 supersedes the external-refresh continuation above. Exact
          registered delivery must route directly into ARC-triggered provider-native refresh execution after the
          selected-member baseline is state-bound; external operator refresh plus adoption remains the supported
          fallback. The core continuation stays provider-neutral and carries no provider command or stack field.

### `[x]` **4.6 Retire the control-branch vocabulary from the surfaces that survive**

- _Goal:_ The eligibility and lifecycle surfaces name the top rather than a control branch, so no field carries the
  name of a construct this member removes.

- _Outcome:_ Eligibility snapshots, normalized-tree comparison, lifecycle path discovery, materialization, and the
  prepare/materialize/publish/rematerialize request schemas now carry `top` / `topRef` end to end without changing
  the observed ref or coordinates. The strict wire cutover rejects the retired spelling; only the deliberately
  excluded terminal readiness/attachment machinery retains it for Phase 5 removal.

- _Context:_ The top's identity already flows through the control ref input and the snapshot's control
  coordinates — that is how the terminal's coordinates resolve — so this is nomenclature, not behavior. It reaches
  the eligibility inputs and snapshot, the lifecycle-contribution reader, and the command-input request schemas
  carrying the ref.

- _Note:_ The terminal machinery is deliberately excluded: it retires with the disconnected terminal request in
  the next member, so renaming it here would churn a file about to be deleted.

    - Rename the ref input, the snapshot field, and the request-schema fields to name the top
    - The same ref reaches the same consumers under a name that still describes it — no behavior changes
    - Update the tests and fixtures that spell the old field names

### `[x]` **4.7 Close delivery member 4** — validate criteria at member scope

- _Goal:_ Member 4's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

- _Outcome:_ Member 4 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 4 — topology-transition`.
    - _Span:_ diff `a202eec2a..d26adf058`; reachability `c9a753e3b`; boundary-order deviation: the Phase 5 terminal-
      path removal at `c9a753e3b` supplied the dependency required to close the Phase 4 boundary.
    - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 1`; _State:_ `[x]`;
      _Evidence:_ the bounded diff establishes first-class member refs, bound terminal publication, complete
      presentation preflight, and containment-guarded adoption; the exact deviation reachability removes the
      incompatible disconnected terminal path and delegates to the ordinary checkpoint spine.

## **Phase 5:** Terminal integration arm

**Delivery member:** 5 — `terminal-integration`

_Purpose:_ Give the checkpoint spine a typed delivery arm that composes its terminal claim from records that
already exist, and retire the absorption and terminal-attachment machinery along with the disconnected request it
served.

_Design decisions:_ The arm extends the shipped spine by composition, exactly as the native merge arm does — it
never rewrites attestation semantics. The comparison referent is derived, never read from the plan: plan members
are intent-only records carrying no tree or coordinates, and with the terminal binding to the top itself, a naive
comparison against the plan's terminal member resolves to intent or to self-reference. That self-reference is
precisely what the retired residual proof did — it passed identical before-and-after coordinates into the
comparator and trivially accepted.

### `[x]` **5.1 Compose the terminal claim from attestation, bound heads, and the derived residual**

- _Goal:_ At the terminal boundary the claim is that the attested union tree, minus the exactly-bound landed
  members' contributions, equals the top's terminal delta — composed from three existing records rather than the
  single-subject digest equality the singleton path uses.

- _Outcome:_ The checkpoint's delivery arm composes from the current Candidate, coherent plan/state records, exact
  retained non-terminal landing heads, and the derived top delta, then proves the residual through the shared
  contribution comparator. Missing or mismatched bindings refuse, while an unbound singleton keeps the existing path.

### `[x]` **5.2 Assert the delivery arm's four terminal checks**

- _Goal:_ The terminal boundary passes only when the candidate is the currently bound publication candidate,
  every non-terminal member landed at its exact bound head, the residual carries no unexplained delta, and the
  work-unit review obligation reports discharged against the delivery's derived member targets rather than the
  top's own request, including every member binding retained after physical teardown.

- _Outcome:_ Terminal composition now binds the current publication Candidate, verifies every non-terminal landing at
  its retained head, refuses a residual mismatch, and discharges hosted review only through the exact derived member
  target conjunction. A ready delivery still exits through the unchanged integration approval interlock.

### `[x]` **5.3 Expect the protected base at the instant and carry the top-retarget remedies**

- _Goal:_ A top pull request whose base is not the protected base at the terminal boundary refuses with a typed
  refusal carrying the applicable failure-only remedy after branch deletion and reobservation, and the terminal
  merge never proceeds on a stale base reading.

- _Outcome:_ The delivery arm requires a freshly observed open top against the protected base only at the terminal
  instant. Highest-member teardown retains its binding, deletes the branch, and reobserves the top; wrong-base open
  and closed observations return explicit `retarget` and `reopen-and-retarget` remedies that reassess after invocation.

### `[x]` **5.4 Re-fire member-scope verification on residual-overlapping drift**

- _Goal:_ Drift absorbed into the top during the window re-verifies only the terminal slice when it overlaps the
  residual's own paths, never the whole work unit.

- _Outcome:_ The reconcile checkpoint derives predecessor and residual path sets from retained coordinates and the
  current Candidate. Predecessor overlap refuses, residual overlap routes only the terminal member through
  verification, and disjoint drift retains the ordinary base-reconcile path.

### `[x]` **5.5 Retire the absorption and terminal-attachment machinery with both call sites**

- _Goal:_ The absorption, terminal-readiness, and post-merge attachment machinery is gone along with both
  workflow call sites, because the disconnected terminal request it served no longer exists.

    - `[x]` **5.5.a Remove the terminal module and its verbs**

        - Deleted the absorption/readiness/attachment module and unit suite, both CLI subcommands, their handler
          schemas and branches, and the command-input and E2E inventory that exposed them.

    - `[x]` **5.5.b Remove both workflow call sites**

        - Re-authored both shipped copies of the delivery handoff around the checkpoint arm and removed the
          integration workflow's post-merge mutation while preserving its cleanup ordering and link definitions.

    - `[x]` **5.5.c Re-author the landing-loop teardown step**

        - The workflow now follows the teardown verb's `continue`, `terminal-checkpoint`, `retarget`, or
          `reopen-and-retarget` result after binding retention, branch deletion, and top reobservation, with no prose
          loop.

- _Outcome:_ The disconnected terminal path has no library, command, workflow, or test surface left; the ordinary
  integration checkpoint is now the sole terminal authorization path, and cleanup begins directly after merge.

### `[x]` **5.6 Re-author both workflow guards against the contracts that survive**

- _Goal:_ Each guard asserts the contract that survives rather than the terminal machinery that does not, and
  each still fails by name when either copy of its own workflow drifts.

- _Outcome:_ The workflow guards now pin package/project parity, delivery teardown-to-checkpoint handoff and typed
  remedy routing, one checkpoint/interlock/merge sequence, merged-resume convergence, and close-before-teardown
  ordering. The obsolete terminal-command subjects are asserted absent rather than used as ordering anchors.

### `[x]` **5.7 Close delivery member 5** — validate criteria at member scope

- _Goal:_ Member 5's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

    - `[~]` **5.7.a Make active-operation reservations owner-complete**

        - Superseded by Task 5.7.R.a: the existing operation kind and payload remain authoritative, with narrow mode
          discriminators only for overloaded `rewrite` and `land` operations and no owner or retry-policy fields.

    - `[~]` **5.7.b Return executable recovery transitions for every operation owner**

        - Superseded by Task 5.7.R.a: interrupted operations return informative, typed ordinary rerun actions after
          reobservation rather than entering a general per-owner recovery transition framework.

    - `[~]` **5.7.c Preserve highest-member teardown recovery through top observation**

        - Superseded by Task 5.7.R.a, which combines this concrete specialization with the minimum closed recovery
          contract it consumes so the generic reducer and teardown continuation land coherently.

    - `[~]` **5.7.d Make terminal base reconciliation exact-head and checkpoint-rerunnable**

        - Superseded by Tasks 5.7.R.b–5.7.R.c: exact-head compare-and-set remains, while Candidate applicability is
          classified structurally and no longer defaults every changed subject digest to whole-work-unit
          verification.

    - `[~]` **5.7.e Rebind stale terminal coordinates from current observable facts**

        - Superseded by Task 5.7.R.c so terminal rebind consumes the canonical Candidate target and independently
          settled publication boundary rather than landing ahead of those contracts.

    - `[~]` **5.7.f Re-author the integration workflow and guards around informative reruns**

        - Superseded by Task 5.7.R.d, which routes the structural applicability and authority-selection results
          instead of hard-coding whole-work-unit verification.

    - `[~]` **5.7.g Run the member 5 criteria walk and record its evidence**

        - Superseded by Task 5.7.R.e so the criteria walk closes the complete forward amendment rather than the
          earlier recovery design.

    - `[x]` **5.7.R Apply the proportional recovery and Candidate-applicability amendment**

        - The final amendment replaces the superseded recovery matrix and whole-work-unit fallback through the
          D3.10, D8.7, and D9.6 seams without adding durable recovery machinery or autonomous replay.

        - `[x]` **5.7.R.a Return informative ordinary reruns from minimum operation state**

            - Required mode discriminators now route every producer and consumer, and one canonical strict result
              returns the exact action, reservation selector, transition, and precomposed text without new durable
              recovery machinery.
            - Publish and teardown revalidate preserved reservations; other exact retries clear before fresh
              preparation, while highest teardown carries its fresh top continuation and every unresolved fact stops
              without an executable action.
            - Unit and built-CLI coverage pin all eight action/selector arms, malformed pairings, exact two- and
              three-member teardown reruns, idempotent clearing, retained failures, and terminal continuation.

        - `[x]` **5.7.R.b Project exact-head Candidate applicability through D4**

            - The guarded base merge now binds both exact endpoints, classifies ancestry before mutation, and accepts
              only a divergent `--no-ff` result with the exact prior-head/base parent pair.
            - One strict storage-neutral classifier and Git producer derive the sole baseline-to-current merge base,
              preserve subject and mechanical equivalence, and keep bounded judgment, rerun, failure, unsupported,
              and unavailable outcomes distinct across unit, integration, handler, registration, and E2E coverage.

        - `[x]` **5.7.R.c Bind only an authorized applicability selection**

            - Candidate records now preserve an ordered `review-response | applicability-selection` lineage, and the
              strict versioned resolve command records only exact authority-bearing selections with idempotent replay.
            - One durable reducer plus the Git-backed effective projection serves every Candidate consumer, rederives
              mechanical carry, preserves response re-anchoring, and keeps publication settlement independent.
            - Existing delivery reconciliation now compare-and-set rebinds only stale terminal coordinates from the
              settled current Candidate and exact top request, then returns `rerun-checkpoint`; ambiguity still stops.

        - `[x]` **5.7.R.d Re-author the integration workflow around typed reruns and applicability**

            - The checkpoint now emits exact Candidate resolution selectors, CLI-composed authority prompts,
              publication refresh, and terminal rebind actions; machine applicability stays unattended and only an
              explicit `changed` selection enters ordinary verification and re-attestation.
            - Both workflow copies reconcile the WU first, route every typed correction through an exact rerun, and
              perform guarded base merges with both expected endpoints before fresh automated checks and checkpointing.
            - The obsolete terminal-member verification arm and stale workflow method declaration are gone, while
              guards preserve checkpoint/interlock/merge and close-before-teardown ordering with byte-identical copies.

        - `[x]` **5.7.R.e Run the member 5 criteria walk and record its evidence**

            - The complete member walk resolves all four immutable criteria over the bounded implementation union
              and cumulative tree after the source-confirmed composition gaps and final workflow-dispatch gap were
              corrected inside the existing D3.8-D3.10 and D9.6 contracts.

            - `[x]` **5.7.R.e.1 Preserve conditional safety for exact residual overlap**

                - Terminal drift now carries a residual-contained safety class into checkpoint reconciliation;
                  predecessor overlap and mixed or outside substantive drift remain under generic refusal.
                - Classifier and composed checkpoint coverage pin substantive residual acceptance, regenerable-only
                  generic safety, and the mixed residual-plus-outside boundary.

            - `[x]` **5.7.R.e.2 Project the Candidate against the authoritative fetched base**

                - Candidate subject and effective-target projection now prefer the materialized remote base, accept an
                  exact authoritative coordinate, and bind every checkpoint read to its fetched base OID.
                - Applicability resolution derives its subject from that same OID; unit and built-CLI coverage preserve
                  checkpoint currentness and exact selection while the local configured branch remains stale.

            - `[x]` **5.7.R.e.3 Retain unresolved native landing effects**

                - One terminal-effect classifier now permits the exact `failed` plus `none-landed` retry only after
                  its compare-and-set clear; missing identity, pending, partial, contradictory, and unavailable facts
                  retain the reservation across both native polling and general recovery.
                - Exact request observation and built-CLI recovery coverage pin submission-before-persist, safe
                  terminal retry, and mismatched-request retention; restart prose routes through general reconcile.

            - `[x]` **5.7.R.e.4 Rerun the Member 5 criteria walk**

                - The rerun resolved the applicability-durability and authoritative-base gaps, then used one final
                  fresh full-rubric pass to isolate the remaining recovery-workflow dispatch mismatch for bounded
                  correction and primary source recheck.

                - `[x]` **5.7.R.e.4.1 Persist attended applicability selections before checkpoint rerun**

                    - Fresh and interrupted `covered` or `targeted-check` resolutions now stage the existing
                      Candidate record and return a typed commit action; already-committed operational-only replay
                      skips redundant durability, while `changed` still proceeds through the new-root contract.
                    - Both integration workflow copies route the commit and push before checkpoint rerun, with E2E
                      coverage over fresh, interrupted, and already-committed replay.

                - `[x]` **5.7.R.e.4.2 Bind terminal composition and rebind to one authoritative base coordinate**

                    - Checkpoint now threads its exact fetched base OID through Candidate and terminal-delta
                      composition, refusing a nominally clean checkpoint without that coordinate.
                    - Terminal rebind normalizes the protected target branch, resolves one materialized
                      remote-preferred base OID, and reuses it for effective-target and coordinate derivation; built
                      CLI coverage pins the stale-local-versus-remote boundary.

                - `[x]` **5.7.R.e.4.3 Rerun the Member 5 criteria walk**

                    - The final fresh pass resolved criteria 1–3 and isolated criterion 4's stale workflow dispatch;
                      both shipped copies and their guard now consume every strict action/transition/selector arm, and
                      the primary recheck resolves criterion 4 without another adversarial cycle.

        - _Forward amendment (2026-08-25):_ Final whole-work-unit verification proved that an applied interrupted
          sequential landing cleared into ordinary position before the landed member's required teardown. In a stack
          of three or more members, position selects the next member and loses the only exact teardown selector.

        - `[x]` **5.7.R.f Preserve the owed teardown after applied sequential recovery**

            - Applied sequential recovery now clears only into a strict `teardown-member` continuation carrying the
              reservation-derived landed member. Both workflow copies consume that selector before ordinary position;
              other applied operations and highest-member teardown retain their existing continuations.

        - `[x]` **5.7.R.g Revalidate the amended Member 5 boundary** — validate criteria at member scope

            - _Criteria slice:_ `Success Criteria > Member 5 — terminal-integration`.
            - _Span:_ retained Member 5 report plus the exact applied-sequential recovery patch over `6c1e05ce8`;
              reachability is the complete current tree. Boundary-order deviation: final work-unit verification
              surfaced the recovery gap after the original boundary; the bounded repair absorbs no Member 6 work.
            - _Criterion 1:_ `[x]` — the ordinary checkpoint/interlock/merge composition is unchanged and remains
              covered by the terminal workflow and recovery suite.
            - _Criterion 2:_ `[x]` — retained bindings, member teardown, and highest-member top observation remain
              intact; applied sequential recovery now supplies the exact landed member to that teardown path.
            - _Criterion 3:_ `[x]` — Candidate applicability, exact terminal reconciliation, and rerunnable checkpoint
              behavior are unchanged.
            - _Criterion 4:_ `[x]` — the strict recovery result now routes applied sequential landing directly to
              `teardown-member`; all other applied, retryable, highest-teardown, and ambiguous arms retain their
              closed behavior across reducer, handler, workflow, and real-CLI recovery coverage.
            - _Summary:_ four met, zero superseded, zero unresolved. Success Criteria markers remain unchanged for
              terminal verification; the approved verification sequence reserves the fresh companion for the final
              whole-target pass rather than duplicating it at this amended member boundary.

- _Outcome:_ Member 5 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 5 — terminal-integration`.
    - _Span:_ diff `d26adf058..f2efb6c5d`; reachability `f2efb6c5d`; boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 1`; _State:_ `[x]`;
      _Evidence:_ the ordinary checkpoint/interlock/merge spine composes the exact attested terminal claim from
      retained bound heads and the residual comparison.
    - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 2`; _State:_ `[x]`;
      _Evidence:_ retained member bindings, branch deletion, fresh top observation, explicit remedy invocation, and
      protected-base readiness preserve the landing window without another automatic mutation.
    - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 3`; _State:_ `[x]`;
      _Evidence:_ authoritative-base Candidate applicability, exact endpoint comparison, versioned terminal rebind,
      and publication-boundary settlement converge through typed informative reruns and no new lineage authority.
    - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 4`; _State:_ `[x]`;
      _Evidence:_ the proportional reservation recovery contract and closed rerun union agree across reducer,
      schema, handler, both workflows, and the exhaustive guard; ambiguous or incomplete observations retain and
      stop. Success Criteria markers remain unchanged for terminal verification.

## **Phase 6:** Provider-delegated refresh and native landing

**Delivery member:** 6 — `refresh-and-native-landing`

_Purpose:_ Delegate restack and refresh mechanics to the stack provider, adopt reobserved results on structural
equivalence, and make native landing the routed path for a registered stack with the complete unlinked path as its
degrade target. Together these are what keep the protected base unfrozen for the delivery's duration.

_Design decisions:_ ARC detects drift and states consequences; the provider or the operator refreshes; ARC
reobserves and adopts only on structural equivalence, and refuses ambiguity. Building rebase machinery is out of
scope by charter. The refresh arm is demand-driven — it fires on a refused landing or explicit operator choice,
never on base movement alone — because obligating a refresh on every external landing is what froze the base
before. Registration covers the non-terminal members only: excluding the top from provider-side rewrite is a
structural guarantee rather than operator discipline.

### `[x]` **6.1 Detect drift, state consequences, and delegate the registered suffix**

- _Goal:_ When a refresh is genuinely needed, ARC emits the exact planned suffix plus its safety and
  review-invalidation consequences, and hands the mechanics to the provider or the operator.

- _Outcome:_ Added a plan-derived refresh classifier that keeps base-only drift advisory, emits the exact registered
  suffix and precomposed safety/review consequences for refused or operator-requested refresh, and refuses ambiguous
  provider movement or target rewrites.

### `[x]` **6.2 Absorb predecessor movement into the top by content merge**

- _Goal:_ The top takes on a restacked chain's content by an append-only merge, so a refreshed suffix does not
  strand the top behind it.

- _Outcome:_ Added a checked-out-top absorption primitive that performs a genuine append-only content merge,
  preserves prior reviewed ancestry, and reports exact conflict paths after restoring the pinned clean top; the
  distinct no-refresh base-movement route remains ordinary pre-materialization base-merge territory.

### `[x]` **6.3 Separate reserved ARC mutations from external refresh adoption**

- _Goal:_ ARC-issued refresh mutations remain resumable through the existing operation reservation, while an
  operator/provider refresh with unknowable result heads is adopted only after bounded observation and proof.

- _Outcome:_ Split refresh execution into a pre-reserved `rewrite/provider-adoption` arm with exact partial-result
  recovery and a reservation-free external arm; both adopt only stable bindings whose changed members pass the
  existing arbiter, using one final CAS and no new operation kind, protocol, or proof record.

- _Forward amendment (2026-08-23):_ The Member 6 lifecycle audit found that the completed split modeled an
  ARC-issued provider mutation the reference adapter cannot perform, while the reservation-free adoption published
  the suffix without composing Task 6.2's required terminal-top settlement. D5.7 supersedes that execution model:
  provider/operator refresh stays external and unreserved; `rewrite/provider-adoption` begins only after exact
  observation and proof, then owns ARC's top absorption/publication and the one final suffix-plus-top CAS.

- _Forward amendment (2026-08-24):_ D5.8 also makes this adoption service the mechanical tail of a linked review
  fix. Selected-member publication establishes the new state baseline first; external refresh then changes only
  what the provider assigns, and adoption proves those movements plus the terminal-top settlement. This remains
  provider-neutral core composition, with GitHub behavior confined to its existing adapter and operator surface.

- _Forward amendment (2026-08-25):_ Self-delivery proved the external-only Member 6 audit disposition removed the
  work unit's provider-native actuation capability. D5.9 restores that capability without changing registration
  authority or importing provider commands into the core.

    - `[x]` **6.3.R Restore reserved provider-native refresh execution**

        - Added provider-neutral complete-remainder and dependent-suffix execution, with the GitHub adapter confined
          to isolated official checkout, view, and rebase mechanics while ARC retains registration and publication.
        - Exact preparation proof, durable `rewrite/provider-refresh`, bottom-up lease publication, partial-vector
          recovery, terminal-top absorption, and one final state CAS now form the native refresh lifecycle.
        - Registered review fixes route directly through `delivery refresh execute`; external adoption remains the
          fallback, and preparation plus closeout reap stale private candidates by exact plan namespace.

### `[x]` **6.4 Route a registered stack natively and mint the `native-stack-required` refusal**

- _Goal:_ A linked stack reaches the native lifecycle rather than the singleton merge path, and a stacked-member
  rejection surfaces as a typed refusal instead of collapsing into an opaque unavailable reading.

- _Outcome:_ Preserved fresh provider-observed registered/unregistered routing through the existing exact-head,
  lock-release, and asynchronous native lifecycle, and carried a semantic stacked-member `422` as the closed
  `native-stack-required` refusal while leaving generic validation failures unavailable and plan intent unchanged.

- _Forward amendment (2026-08-23):_ D6.11 makes that semantic refusal executable: after exact no-effect proof it
  clears the sequential reservation and routes to state-derived fresh native selection, never to the distinct
  `native-stale-suffix` refresh trigger. Native selection must bind the full remaining chain from plan/state before
  observing the provider.

### `[x]` **6.5 Scope registration to the non-terminal member set**

- _Goal:_ Registration covers exactly the non-terminal members, so no provider-side stack operation can touch the
  session branch.

- _Outcome:_ Bound native registration to the coherent plan/state-derived non-terminal chain and refused any claimed
  scope mismatch before host observation or mutation; the raw REST adapter and reservation-free reobserved external
  refresh path remain the only provider seams, so the terminal branch cannot enter provider rewrite authority.

### `[x]` **6.6 Exclude the dependent unregistered request from the registration predicate**

- _Goal:_ With the top chained onto the registered set, ARC's own observation reads that set as registered rather
  than falling through to unregistered.

- _Outcome:_ GitHub observation now removes one validated unrequested pull request whose base is the highest
  registered head before cardinality and positional comparison, regardless of listing position, while preserving
  genuine member mismatches, empty-listing degradation, and ambiguous multi-stack classification.

### `[x]` **6.7 Degrade both sub-two-member floors to the unlinked route**

- _Goal:_ A delivery of two total members routes unlinked whether or not the operator opted in, instead of hitting
  a hard stop.

- _Outcome:_ Lowered the plan-bound link request floor to one registered member and reclassified a valid singleton
  service subject as unlinked for either opt-in choice, without any host call; input validation now precedes the
  opt-in branch so malformed singleton and empty subjects remain explicit refusals rather than floor degradation.

### `[x]` **6.8 Reconcile the full rewritten suffix on native landing**

- _Goal:_ A native landing that rewrites the entire remaining suffix reconciles every rewritten member by
  structural equivalence before admitting its new head to review.

- _Outcome:_ Native post-landing reconciliation now observes the complete plan-ordered registered remainder,
  validates its request/ref chain, proves every changed member against its before/after predecessor, and admits all
  coordinates in one CAS; conflicts retain exact paths, while the single-next-member and no-remainder arms remain.

### `[x]` **6.9 Make merge-method validation stack-aware**

- _Goal:_ Merge-method resolution accounts for intermediate members being held to merge commits while only the
  top is free.

- _Outcome:_ Merge-method resolution now accepts a validated stack position, forces intermediate members to merge
  commits, and preserves repository-policy selection for the top and non-delivery work. Checkpoints persist the
  position-bound fingerprint and merge-instant revalidation reuses that exact position; typed CLI refusals and
  remedies retain the same position rather than changing the policy question on retry.

### `[x]` **6.10 Disclose the registration consequence at the opt-in decision point**

- _Goal:_ An operator choosing native registration sees what it costs and what it buys before choosing, and
  declining makes no host calls at all.

    - `[x]` **6.10.a Precompose the disclosure on the native-link surface**

        - Added a read-only `decision-required` native-link arm with precomposed opt-in, opt-out, and continuation
          text before project, state, or provider resolution.

    - `[x]` **6.10.b Render it at the decision point in workflow prose**

        - The delivery workflow first invokes native link without `optIn`, renders both returned choice texts
          verbatim, and only then resubmits the otherwise exact request with the chosen boolean.

    - `[x]` **6.10.c Confirm declining makes no host calls**

        - The declined arm still returns `unlinked` before either provider observation or registration, preserving
          the complete sequential executor as the zero-native-call route.

- _Outcome:_ Native registration now presents its exact atomic-landing and stack-UI benefit, suffix-rewrite review
  cost, top exclusion, and unlinked-path limit before the operator sets `optIn`; the choice remains ungated, and
  declining performs no native host read or mutation.

### `[ ]` **6.11 Close delivery member 6** — validate criteria at member scope

- _Goal:_ Member 6's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

    - `[x]` **6.11.a Close external refresh adoption as one top-settling transaction**

        - External refresh now remains unreserved until a complete exact suffix is observed and proved. ARC then
          reserves only its adoption settlement, reobserves and reproves, absorbs and lease-publishes the terminal
          top, and installs target, suffix, and terminal coordinates in one final CAS. Recovery reruns the exact
          `delivery-refresh-adopt` reservation and recognizes the local-merge and remote-publication boundaries.

    - `[x]` **6.11.b Bind native routing and make semantic fallback executable**

        - Native selection now accepts no caller member coordinates and derives the complete current non-terminal
          remainder before provider observation. An exactly unapplied `native-stack-required` result version-clears
          the sequential reservation into fresh native selection; ambiguity and state collision retain it and stop.

    - `[x]` **6.11.c Prove the vertical lifecycle rows and reconcile every contract surface**

        - Real-Git lifecycle coverage now drives external refresh adoption, full native suffix settlement, semantic
          fallback, exact registration, two-member degradation, and opt-out through their production CLI surfaces.

- _Outcome:_ Member 6 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
    - _Span:_ Task 6 first-parent commit union from `f4db64870` through `2fae38462`; reachability `2fae38462`;
      boundary-order deviation: none.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
      _Evidence:_ protected-base movement remains advisory and creates no refresh obligation by itself.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[x]`;
      _Evidence:_ external refresh is freshly observed and proved before reserved top settlement, lease publication,
      and one atomic suffix-plus-top state write; interruption cannot expose suffix-only adoption.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
      _Evidence:_ native settlement structurally proves every member in the rewritten remaining suffix before its
      exact new head becomes review-admissible.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
      _Evidence:_ selection derives the canonical current non-terminal remainder, and exact semantic no-effect
      clears the sequential reservation into fresh native selection without conflating stale-suffix refresh.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
      _Evidence:_ registration is exactly non-terminal, filters the dependent top as registered, and degrades the
      two-member floor to the unlinked route.
    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
      _Evidence:_ the decision point discloses native review invalidation before opt-in, while opt-out is supported
      and host-silent. Success Criteria markers remain unchanged for terminal verification.

- _Forward amendment (2026-08-25):_ The prior report remains evidence for the unchanged Member 6 criteria. D5.9
  adds one criterion and intentionally supersedes the external-only clause in criterion 2, so the member boundary
  requires a fresh scoped walk after Task 6.3.R.

    - `[x]` **6.11.R Revalidate provider-native refresh and the amended Member 6 boundary**

        - The amended member reports bind the original Member 6 union, D5.9, and the exact fallback and
          retained-prefix repairs; the final walk resolves seven criteria as met and criterion 2 as intentionally
          superseded.
        - The Heavy fresh-context companion completed two full-rubric passes, with the confirmed fallback finding
          repaired and pass two returning no findings.
        - The reopened-execution return path now closes its exact `Next Task` only from a proven completed cursor;
          focused real-CLI recovery coverage preserves every non-authoritative case.

        - _Forward amendment (2026-08-25):_ The live withdrawal needed to execute this revision exposed that
          `reopen` could return only to Candidate preparation, where the now-stale Candidate blocked recovery before
          the reopened task could run. Repair the demonstrated lifecycle discontinuity before revalidating Member 6.

        - `[x]` **6.11.R.a Return substantial integration rework to exact task execution**

            - `arc reopen --task` now restores the exact task orientation and `process-task-loop`, while the ordinary
              no-task withdrawal still resumes Candidate preparation.
            - Candidate currentness now governs `Integrating` and Active Candidate preparation only, so a retained
              stale Candidate cannot block or authorize reopened task execution.
            - The withdrawal guard now observes one exact request instead of sweeping authored pull requests, while
              retaining fail-closed unavailable and merged results.
            - Unit and built-CLI coverage pin the transition, exact provider calls, stale-Candidate session recovery,
              seed emission, and a ready recovery audit; the live work unit completed the same reopen and audit path.

        - `[x]` **6.11.R.b Run the amended Member 6 criteria walk**

            - _Primary criteria report:_
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ original Task 6 first-parent commit union from `f4db64870` through `2fae38462`; exact D5.9
                  amendment `5471bdfbe..74ced41be`; and fallback repair patch
                  `a124aa4a7207d9b14d8ffa80a6db5dae748a4d1f` over `01e9b6c5e`. Reachability is `01e9b6c5e` plus that
                  exact worktree patch. Boundary-order deviation: D5.9 / Task 6.3.R landed after the original member
                  boundary in a coupled amendment with Task 4.5.R; the cumulative tree was inspected without
                  absorbing unrelated later work into the Member 6 diff.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ current refresh planning still leaves append-only protected-base movement advisory and
                  requires a refusal or explicit operator choice before emitting the exact remaining suffix.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 intentionally supersedes the external-only invocation clause. The external
                  observation/adoption route remains executable through an attended `operator-initiated` replan,
                  retaining fresh proof, terminal-top settlement, and one final suffix-plus-top state write.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native landing still observes and structurally reconciles the complete rewritten
                  remainder before admitting any refreshed coordinate.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ semantic no-effect still version-clears only the exact sequential reservation into
                  state-derived native selection over the canonical remaining chain; stale-suffix refresh remains
                  distinct.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ raw-API registration still derives exactly the non-terminal chain, excludes the
                  dependent top during observation, and degrades a singleton registered remainder to the unlinked
                  route without host access.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link still returns the review-invalidation tradeoff before opt-in, while decline
                  remains an accepted zero-host-call path.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ provider-invoked execution prepares only an exact complete or dependent suffix in an
                  isolated adapter using official checkout/view/rebase mechanics, imports and proves private
                  candidates, persists `rewrite/provider-refresh` before bottom-up lease publication, resumes only an
                  exact contiguous published prefix, and blocks every missing, foreign, or non-prefix observation.
                  Settlement reobserves and reproves the complete suffix, absorbs and publishes the excluded top,
                  cleans the private candidates, and only then writes suffix and top coordinates together. Native
                  registration remains raw API, no provider push porcelain is invoked, and an explicit attended
                  replan now reaches external adoption after pre-reservation provider refusal while registered
                  planning remains provider-invoked by default.
                - _Summary:_ six met, one intentionally superseded, zero unresolved. Fresh regression evidence is
                  137 passing focused tests across refresh planning, registration, native landing, semantic fallback,
                  native preparation, reserved execution, partial publication, review-fix routing, command
                  composition, and workflow ordering, plus the real built-CLI fallback scenario. Success Criteria
                  markers remain unchanged for terminal verification.
                - _Adversarial companion:_ Heavy pass one returned two major findings. Primary source verification
                  dropped the quiet-target-window claim because concurrent target movement refuses before reservation
                  and retries without requiring a delivery freeze. The confirmed missing external-fallback selection
                  was repaired as the attended replan above. Fresh pass two reran the complete seven-criterion rubric,
                  re-attacked both prior findings and the repair, and returned no findings; the Heavy loop converged
                  cleanly at its two-pass cap.

        - _Forward amendment (2026-08-25):_ The accepted companion exposed one real routing gap rather than a refresh
          safety defect. Restore an attended, provider-neutral external-fallback selection, then rerun the complete
          Member 6 walk and the Heavy companion's second pass before closing this report.

        - `[x]` **6.11.R.c Restore the executable external refresh fallback**

            - Refresh planning accepts an explicit `operator-initiated` selection while exact registered delivery
              remains `provider-invoked` by default.
            - A pre-reservation provider refusal now stops unchanged and offers an attended replan into the existing
              external-refresh and `delivery refresh adopt` lifecycle, with no automatic fallback or durable state.
            - Built-CLI and workflow regressions prove the default, explicit fallback, and executable transition.

        - `[x]` **6.11.R.d Revalidate the repaired Member 6 boundary**

            - The complete scoped walk resolves six criteria as met and one as intentionally superseded over the
              original Member 6 union, D5.9 amendment, and exact fallback patch.
            - Heavy pass two reran all seven criteria with both prior findings and the repair, returned no findings,
              and converged cleanly at the class-scaled cap.
            - Every Success Criteria marker remains unchanged for terminal verification.

        - _Forward amendment (2026-08-25):_ Terminal re-attestation exposed the incomplete return edge of the
          reopened-execution repair: the Candidate and workflow projections advance, but the exact reopened
          `Next Task` remains stale throughout Candidate preparation. Close that orientation only from a proven
          no-open-task cursor, then revalidate the recovery seam before restoring terminal verification.

        - `[x]` **6.11.R.e Close reopened execution orientation at Candidate attestation**

            - Candidate attestation now clears `Next Task` only when the canonical task-list cursor proves
              `no-open-task`; open, malformed, missing, unreadable, and unbound task-list evidence preserves the
              existing orientation.
            - The real CLI regression failed against the stale-field behavior, and the four preservation cases
              failed against an over-broad clearing mutant before all eight attestation E2E cases passed.

        - `[x]` **6.11.R.f Revalidate the recovery closure and amended Member 6 boundary**

            - The six-file handler, reopen, session-init, local re-entry, attestation, and Candidate-lineage set
              passed 143 tests over the completed return path. Targeted lint and both typechecks passed.
            - _Primary criteria report:_
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ the exact Candidate-orientation source and E2E patch over `54a46388e`; reachability is the
                  complete current tree. Boundary-order deviation: the post-terminal repair closes Task 6.11.R.a's
                  recovery return edge and changes no delivery core, schema, provider, or workflow contract.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ protected-base refresh planning and position routing are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 still supersedes only the external-only invocation clause, with attended external
                  adoption retained.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native suffix reconciliation and structural proof are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ state-derived native selection and exact no-effect fallback are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ non-terminal registration and singleton degradation are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link disclosure and host-silent decline are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ provider refresh preparation, reservation, publication, recovery, settlement, and
                  attended fallback are unchanged; the 143-test recovery set found no cross-boundary regression.
                - _Summary:_ six met, one intentionally superseded, zero unresolved. The Heavy member companion had
                  already converged at its two-pass cap; Success Criteria markers remain for terminal verification.

        - _Forward amendment (2026-08-25):_ Self-delivery reached a public `delivery position` command whose strict
          request still required agent-authored observation facts. Compose those facts inside the handler from the
          plan/state and repository locators, leaving the pure router and provider adapter boundary intact.

        - `[x]` **6.11.R.g Compose fresh facts for the public position read**

            - Public position now accepts only plan, repository, and remote locators, composes the existing bounded
              observer at the handler boundary, and preserves `position-unavailable` plus `operation-active`
              reconciliation. Built-CLI real-repository coverage pins all three routes, and both shipped workflow
              copies supply only locators before dispatching the typed result.

        - `[x]` **6.11.R.h Revalidate the executable position seam**

            - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
            - _Span:_ retained original Member 6, D5.9, fallback, and recovery evidence; bounded public-position
              amendment `d6d842332..125a58191` plus the exact current worktree patch. Reachability is the complete
              current tree. Boundary-order deviation: D9.8 and its finding repairs close the public execution seam
              after the original member boundary without widening the bounded diff into unrelated later work.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
              _Evidence:_ the amendment changes position composition and downstream request authority only; the
              demand-driven refresh trigger still leaves protected-base movement advisory.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
              _Evidence:_ D5.9 still supersedes only the external-only invocation clause, while attended external
              observation and adoption remain executable.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
              _Evidence:_ complete native-suffix reconciliation and per-member structural proof are unchanged.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
              _Evidence:_ public native selection now composes fresh position facts from locators before deriving
              the canonical remainder; exact sequential no-effect still clears into that selector.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
              _Evidence:_ exact non-terminal registration, dependent-top filtering, and singleton degradation are
              unchanged; the real CLI fixture now exposes the terminal request required by full position observation.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
              _Evidence:_ native-link disclosure and host-silent decline are unchanged.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
              _Evidence:_ provider preparation, reservation, bottom-up publication, contiguous-prefix recovery,
              terminal settlement, cleanup, and attended fallback are unchanged.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
              _Evidence:_ position, sequential prepare, native select/prepare, and teardown accept locators rather
              than caller facts and compose the existing observer at the handler boundary. Clean, unavailable, and
              active-operation position routes plus successful native reservation and destructive teardown run
              through the built CLI; both workflow copies prohibit caller-authored position facts.
            - _Summary:_ seven met, one intentionally superseded, zero unresolved. Heavy companion pass one exposed
              active-reservation masking and pass two exposed downstream caller-facts authority; both were repaired,
              and the primary post-settle reread found no residual seam break at the two-pass cap. Success Criteria
              markers remain unchanged for terminal verification.

        - _Forward amendment (2026-08-25):_ Final whole-work-unit verification proved that remaining-suffix
          derivation treated only null bindings as landed even though D9.1 retains exact landed bindings. Every
          post-first-landing refresh subject therefore began with a merged or deleted member and could not be
          observed as an open registered suffix.

        - `[x]` **6.11.R.i Derive refresh subjects from fresh landed position**

            - Refresh and review-fix commands now compose fresh position facts at the handler boundary and derive
              only the current non-terminal remainder, while retained landed bindings remain historical evidence.
              Core, execution, provider, lifecycle, and built-CLI regressions prove the post-first-landing route.

        - `[x]` **6.11.R.j Revalidate the amended Member 6 boundary** — validate criteria at member scope

            - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
            - _Span:_ retained Member 6 boundary reports through Task 6.11.R.h plus the exact retained-prefix repair
              over `6c1e05ce8`; reachability is the complete current tree. Boundary-order deviation: final
              whole-work-unit verification supplied the D5.9 / D9.1 repair after the original member boundary; the
              bounded member walk excludes the concurrent Member 5 recovery repair.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
              _Evidence:_ demand-driven planning still leaves protected-base movement advisory and requires a real
              refusal or explicit operator choice before selecting the freshly observed remaining suffix.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
              _Evidence:_ D5.9 still supersedes only the external-only invocation clause. Attended external refresh
              adoption remains executable and now derives its exact remaining subject from fresh position facts.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
              _Evidence:_ native landing still reconciles and structurally proves every member in the complete
              rewritten remainder before admitting new heads.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
              _Evidence:_ position authority now selects the canonical current non-terminal remainder despite
              retained landed bindings; exact semantic no-effect still returns sequential landing to fresh native
              selection without conflating stale-suffix refresh.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
              _Evidence:_ registration remains exactly non-terminal, filters the dependent top, and degrades a
              singleton registered remainder to the host-silent unlinked route.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
              _Evidence:_ native-link still discloses review invalidation before opt-in, while decline remains an
              accepted zero-host-call result.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
              _Evidence:_ provider-invoked planning, idle execution, and external adoption derive only the freshly
              observed remaining suffix; reserved partial-publication recovery continues from its exact durable
              subject. Publication, top settlement, cleanup, and atomic state adoption are unchanged.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
              _Evidence:_ public position, refresh, and review-fix commands compose Git and host facts from plan,
              state, repository, and remote locators. A built-CLI landed-prefix scenario excludes the retained
              landed member from both refresh and review-fix subjects; the pre-fix derivation failed that scenario
              behaviorally, while unavailable observation and active-operation recovery remain typed stops.
            - _Summary:_ seven met, one intentionally superseded, zero unresolved. Focused verification passed 59
              tests across the core, handler, provider, workflow, lifecycle, and built CLI; the complete Tier 3 gate
              passed 850 test files and 10,903 tests with one skip each. Success Criteria markers remain unchanged
              for terminal verification; the approved fresh-context companion is reserved for the whole-work-unit
              pass.

        - _Forward amendment (2026-08-25):_ Reopened self-delivery advanced the terminal authoring branch beyond its
          retained delivery binding. Exact public position correctly refused, but review-fix planning and
          rematerialization reused that strict read and therefore could not execute D5.8's required recovery path.

        - `[x]` **6.11.R.k Restore append-only terminal-authoring re-entry** — validate criteria at member scope

            - _Goal:_ A normally reopened work unit can route and complete its review-fix rematerialization while
              preserving exact public position and refusing every unproved terminal or non-terminal movement.

            - _Outcome:_ Member 6 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ retained Member 6 reports through Task 6.11.R.j plus the exact terminal-authoring and
                  selected-change recovery repair over `6c1e05ce8`; reachability is the complete current tree.
                  Boundary-order deviation: reopened self-delivery and its fresh companion supplied this repair
                  after the original member boundary; the bounded walk excludes concurrent Member 5 recovery and
                  unrelated dogfood corrections.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ refresh remains demand-driven, and append-only protected-base movement stays advisory
                  rather than creating a delivery freeze or refresh obligation.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 still supersedes only the external-only invocation clause; attended external
                  observation and adoption remain executable through exact settlement.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native landing still reconciles and structurally proves every member in the complete
                  rewritten remainder before admitting new coordinates.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ fresh landed-position authority selects the canonical current remainder, and exact
                  semantic no-effect still returns sequential landing to native selection without authorizing
                  stale-suffix refresh.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ registration remains exactly non-terminal, filters the dependent top, and degrades a
                  singleton registered remainder to the host-silent unlinked route.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link still discloses review invalidation before opt-in, while decline remains
                  an accepted zero-host-call result.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ registered review-fix execution now carries only freshly proved append-only terminal
                  movement into its dependent provider-refresh reservation, uses that live top for absorption and
                  publication leasing, and retains it across recovery until the final suffix-plus-top state write.
                  Interrupted selected-member publication reuses the same narrow observation authority and resumes
                  the mandatory dependent refresh after adoption. Provider preparation, bottom-up publication,
                  contiguous-prefix recovery, candidate cleanup, attended fallback, and provider neutrality remain
                  intact.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                  _Evidence:_ public position and ordinary complete-remainder refresh remain exact and caller-fact
                  free. Only review-fix-owned planning, rematerialization, dependent refresh, and rewrite recovery
                  admit the exact open-request descendant; every unproved terminal or non-terminal movement still
                  refuses.
                - _Summary:_ seven met, one intentionally superseded, zero unresolved. Fresh companion pass one
                  exposed the registered continuation break; pass two re-ran the full rubric and exposed the
                  selected-change recovery break. Both were source-confirmed and repaired, and the primary
                  post-settle walk found no remaining Member 6 gap at the Heavy two-pass cap. Success Criteria
                  markers remain unchanged for terminal verification.

        - _Forward amendment (2026-08-26):_ Self-delivery proved that an approved correction to a bound, published
          stack can be authored on the terminal branch before the owning member is selected. Exact public position
          correctly refused that movement, but its generic `position-unavailable` result did not direct the agent
          into the existing review-fix planner that can safely project the correction into the selected member.

        - `[x]` **6.11.R.l Make delivery-window correction entry mechanically actionable**

            - _Goal:_ Every approved correction to a bound, published delivery enters member-aware review-fix
              planning before replacement content is authored or published, while public position remains exact
              and provider-neutral.
            - _Outcome:_ Public position now distinguishes proved append-only terminal authoring from unavailable
              position and returns a typed, precomposed review-fix-planning route. The spec and shipped workflow
              require an explicitly selected owning member for every approved bound-delivery correction, treat an
              already-authored terminal correction only as authoring input, and preserve both mutation routes.

        - `[x]` **6.11.R.m Revalidate the amended Member 6 boundary** — validate criteria at member scope

            - _Goal:_ Re-run the Member 6 criteria over the correction-entry amendment and retain prior evidence
              for unchanged refresh, landing, cleanup, and recovery loci.
            - _Outcome:_ Member 6 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ retained Member 6 evidence through Task 6.11.R.k plus correction-entry amendment
                  `4ed049abd..f9412a2a3`; reachability is `f9412a2a3`. Boundary-order deviation: the amendment
                  landed after the original Member 6 boundary, and the bounded diff excludes unrelated later and
                  dogfood corrections.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ protected-base movement remains advisory and creates no refresh obligation by itself.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 still intentionally supersedes only the external-only invocation clause;
                  attended external observation and adoption remain executable through exact settlement.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native landing still reconciles and structurally proves every rewritten remaining
                  member before admitting its new head.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ canonical plan/state selects the current non-terminal remainder, while exact semantic
                  no-effect returns sequential landing to fresh native selection without authorizing stale-suffix
                  refresh.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ registration remains exactly non-terminal, filters the dependent top, and degrades a
                  singleton registered remainder to the host-silent unlinked route.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link still discloses review invalidation before opt-in, while decline remains
                  an accepted zero-host-call result.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ provider refresh preparation, reservation, bottom-up publication, contiguous-prefix
                  recovery, terminal settlement, cleanup, attended fallback, and provider neutrality remain intact.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                  _Evidence:_ public position remains caller-fact free and exact. Proved append-only terminal
                  authoring now returns a typed route into review-fix planning without inferring an owning member;
                  unavailable observation and active-operation recovery remain typed stops.
                - _Summary:_ seven met, one intentionally superseded, zero unresolved. Fresh Heavy companion pass
                  one re-ran the complete eight-criterion rubric, returned no findings, and converged cleanly.
                  Success Criteria markers remain unchanged for terminal verification.

        - _Forward amendment (2026-08-26):_ Closing the last reopened task correctly produced a structurally valid
          `no-open-task` cursor before Candidate attestation, but session recovery still required an open cursor and
          stopped. The same audit found that reopen accepted narrative task authority and attestation tolerated
          unresolved or still-open task lists, leaving the complete reopen-to-Candidate cycle mechanically porous.

        - `[x]` **6.11.R.n Make reopened execution closeout deterministic and exact**

            - _Goal:_ Reopened execution reaches work-unit verification and Candidate preparation through one
              storage-neutral, mechanically proven lifecycle chain.
            - Canonical cursor authority now selects task work or cursorless verification closeout, drives the
              matching load set and recovery contract, and leaves active meta free of a duplicate phase flag.
              Reopen and attestation refuse every unproved task orientation before lifecycle mutation.

        - `[x]` **6.11.R.o Revalidate the reopened lifecycle boundary**

            - _Goal:_ Focused vertical evidence proves the amended execution-to-prepublication seam without
              reopening unrelated delivery design.
            - Lifecycle, load-set, recovery, attestation, and real-CLI regressions prove exact task re-entry,
              cursorless closeout recovery, and refusal of ambiguous authority. The prior Member 6 report remains
              authoritative because neither its delivery criteria nor its implementation union changed.

        - _Forward amendment (2026-08-26):_ Live self-delivery proved that provider refresh cannot enter its normal
          selected-member continuation. After the selected member advances, the provider reports its dependent as
          based on that new live predecessor while delivery state correctly retains the dependent's old pre-refresh
          base. Refresh preflight compared those distinct facts for equality and refused before native restacking.

        - `[x]` **6.11.R.p Validate native refresh against the live provider chain**

            - _Goal:_ Provider-native refresh admits the intentional selected-member intermediate state without
              relaxing exact member-head, request, branch, order, target, or contribution checks.
            - _Outcome:_ Pre-refresh validation now binds provider bases to the freshly observed target and current
              predecessor heads while retaining stored coordinates as rewrite authority. The adapter regression
              advances a selected member over a stale dependent base and preserves foreign branch and
              branch-to-predecessor chain refusals.

        - `[x]` **6.11.R.q Revalidate the native-refresh entry boundary** — validate criteria at member scope

            - _Goal:_ Focused adapter, execution, and real-CLI evidence proves selected-member publication can enter
              provider-native dependent refresh while prior Member 6 evidence remains authoritative elsewhere.

            - _Outcome:_ Member 6 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ retained Member 6 evidence through Task 6.11.R.o; native-refresh entry commit
                  `a64f3f630..8f2241aa7`; and the exact Task 6.11.R.q worktree patch over `1ec7afb62`.
                  Reachability is the complete current tree. Boundary-order deviation: reopened self-delivery
                  supplied the provider-native entry and settlement repairs after the original member boundary;
                  the bounded diff excludes the intervening stack-restoration merge content.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ refresh remains demand-driven, and unrelated append-only target movement creates no
                  refresh obligation. A target advance during reserved settlement now continues only when the
                  reserved requested target is its proved ancestor.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 still supersedes only the external-only invocation clause. Attended external
                  adoption remains executable and shares the exact target-lineage settlement rule without gaining
                  provider mutation authority.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native landing still reconciles and structurally proves every rewritten remaining
                  member before admitting new coordinates.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ canonical plan/state still selects the remaining non-terminal chain, while exact
                  semantic no-effect returns sequential landing to fresh native selection without authorizing a
                  stale-suffix refresh.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ registration remains exactly non-terminal, filters the dependent top, and degrades a
                  singleton registered remainder to the host-silent unlinked route.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link still discloses review invalidation before opt-in, while decline remains
                  an accepted zero-host-call result.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ provider preparation validates the live target and predecessor chain, seeds the
                  selected predecessor transition only in its isolated clone, and invokes official native rebase
                  without provider publication authority. ARC still reserves before bottom-up publication, resumes
                  only an exact contiguous requested prefix, reobserves and reproves, settles the terminal top,
                  cleans private candidates, and performs one final state write. The settlement matrix accepts an
                  exact request or a target-only proved descendant, while unavailable, forked, foreign, or
                  incoherent observations stop before effects. The built-CLI registered review-fix scenario reaches
                  the dependent-suffix adapter, and focused adapter, execution, and real-Git lifecycle coverage
                  closes the remaining actuation and recovery paths.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                  _Evidence:_ public commands still compose Git and host facts from canonical plan/state plus
                  repository and remote locators. The handler supplies local ancestry and strict head/tree
                  contribution endpoints; callers author no observation facts, and recovery retains typed stops.
                - _Summary:_ seven met, one intentionally superseded, zero unresolved. Fresh pass one exposed
                  target-advance stranding; pass two exposed sibling-target acceptance. Both were source-confirmed
                  and repaired, the same seam was closed for external adoption, and the authorized full-rubric
                  third pass returned no findings. Success Criteria markers remain unchanged for terminal
                  verification.

        - _Forward amendment (2026-08-27):_ Registered self-delivery published the highest non-terminal correction
          while it still descended from the preceding member's superseded head. The provider-native continuation
          then tried to rebase the fixed selected member despite having no dependents, and collapsed the provider's
          actionable stale-base diagnostic to `unavailable`.

        - `[x]` **6.11.R.r Make selected-member publication and empty-suffix refresh chain-current**

            - _Goal:_ A registered correction publishes only from the current member chain, and a selected highest
              non-terminal member settles the terminal top without an unnecessary provider mutation.
            - Review-fix planning now returns every exact ancestor through the strict CLI envelope, publication
              rechecks the selected and current predecessor lineage before mutation, and an empty dependent suffix
              bypasses provider preparation while retaining the reserved terminal settlement.

        - `[x]` **6.11.R.s Preserve actionable provider preparation refusals**

            - _Goal:_ A failed provider preparation tells the executing session what failed without leaking
              provider-specific authority into delivery plan, state, or core routing.
            - Non-conflict provider-process failures retain `unavailable` plus whitespace-normalized diagnostic
              detail bounded to 1,000 characters. The strict CLI envelope preserves that response-only field, and
              workflow prose renders it without changing cleanup, reservation, or mutation authority.

        - `[x]` **6.11.R.t Revalidate the corrected Member 6 boundary** — validate criteria at member scope

            - _Goal:_ Re-run `Success Criteria > Member 6 — refresh-and-native-landing` over the bounded correction
              diff and current cumulative tree, retaining prior evidence where the refresh contract is unchanged.

            - _Forward amendment (2026-08-27):_ The interruption matrix demonstrated that a completed dependent
              refresh can lose its final response after state settlement, leaving no durable selector from which
              execution can resume the still-owed member verification. D5.10 admits one narrow provider-neutral
              continuation and requires exact consumption before delivery mutation resumes.

            - `[x]` **6.11.R.t.a Make settled review-fix verification replayable**

                - The selected-member verification continuation now survives refresh-settlement and acknowledgment
                  response loss, re-enters without repeating provider mutation, and clears exactly once after task
                  closure. Pending continuations block every competing delivery and native-presentation mutation;
                  ordinary settlements remain continuation-free and unchanged corrections still refuse.

            - `[x]` **6.11.R.t.b Revalidate the replayable Member 6 boundary** — validate criteria at member scope

                - _Outcome:_ Member 6 criteria report.
                    - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                    - _Span:_ retained Member 6 evidence through Task 6.11.R.q; bounded correction diff
                      `bbde7b167..3401a2f63`; reachability `3401a2f63`. Boundary-order deviation: registered
                      self-delivery supplied the chain-current publication, provider-diagnostic, and response-loss
                      repairs after the original member boundary; the diff excludes the preceding Member 1 review
                      correction and earlier integration ceremonies.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                      _Evidence:_ refresh remains demand-driven. The correction adds no base-movement trigger, and
                      every pending-continuation path stops new mutation rather than refreshing opportunistically.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                      _Evidence:_ D5.9 still supersedes only the external-only invocation clause. Attended external
                      adoption retains fresh structural proof and now shares the exact selected-member continuation
                      settlement without gaining provider mutation authority.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                      _Evidence:_ native landing still reconciles and structurally proves every rewritten remaining
                      member before admitting new coordinates; the new barrier acts only before competing native
                      presentation mutation.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                      _Evidence:_ canonical plan/state still selects the remaining non-terminal chain, and central
                      operation reservation refuses while verification is pending. Exact semantic no-effect retains
                      its distinct return to fresh native selection.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                      _Evidence:_ registration remains exactly non-terminal and singleton delivery still degrades
                      unlinked. Public link and unlink now bind canonical plan/state and the complete current native
                      member subject before provider access.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                      _Evidence:_ the unchanged decision response still discloses review invalidation before opt-in,
                      and ordinary decline remains host-silent. A pending continuation refuses the later mutation
                      arm before any provider call.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                      _Evidence:_ selected publication rechecks the current predecessor chain, empty dependent
                      suffixes bypass provider preparation, and preparation refusals preserve bounded actionable
                      detail. Provider and external settlement atomically clear the reservation, install suffix and
                      top coordinates, and retain the exact selected member for owed verification; ordinary
                      settlement records no continuation.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                      _Evidence:_ public entry and position remain derived from canonical plan/state plus locators.
                      Execution replay emits the exact verification and acknowledgment object, while native unlink
                      now requires a strict plan locator and revalidates the current member subject before host I/O.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`; _State:_ `[x]`;
                      _Evidence:_ selected correction publication proves descent from both the member's bound head
                      and its current predecessor before mutation. An empty dependent suffix skips provider
                      preparation and reaches only owed top absorption; other preparation refusals retain bounded
                      provider-neutral detail without persisting it.
                    - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`; _State:_ `[x]`;
                      _Evidence:_ discarded settlement response re-enters at the selected member without another
                      provider effect; exact acknowledgment clears once and recognizes its one-revision replay;
                      mismatched, intervening, and stale requests refuse. Reservation, rebind, composition,
                      retirement, terminal, and native-presentation mutations all stop while the continuation is
                      pending, and no check result or provider fact enters durable state.
                    - _Adversarial companion:_ the authorized fresh-context pass found one reachable omission:
                      native link and unlink bypassed the pending barrier. Primary source verification repaired both
                      with exact plan/state binding before host access; built-CLI zero-host-call coverage and the
                      final full suite exercise the corrected boundary.
                    - _Summary:_ nine met, one intentionally superseded, zero unresolved. Success Criteria markers
                      remain unchanged for terminal verification.

        - _Forward amendment (2026-08-27):_ Re-entering the bound self-delivery after the state schema changed
          demonstrated that the delivery-state store's closed refusal reason was discarded at the entry-inspection
          adapter. The command stopped safely but collapsed `record-malformed` into generic
          `evidence-unavailable`, forcing source archaeology before the existing transfer/regeneration remedy could
          be selected.

        - `[x]` **6.11.R.u Preserve delivery-state refusal reasons through entry inspection**

            - _Goal:_ A bound delivery whose state record cannot be read returns the existing provider-neutral
              storage reason and a state-specific recovery instruction, while unrelated evidence failures retain
              their current generic refusal.

            - Delivery entry now carries every closed state-store refusal through its strict result and returns a
              state-specific recovery instruction, while unrelated evidence failures remain generic.

        - _Forward amendment (2026-08-27):_ External-fallback dogfood proved that adoption's unconditional
          mechanical-reapply conflict refusal made an operator-resolved suffix impossible to adopt. D5.11 admits an
          exact operator-approved conflict set as changed work and extends the existing replayable continuation to
          every member whose contribution changed.

        - `[x]` **6.11.R.v Admit resolved dependent conflicts and preserve their verification**

            - _Goal:_ An attended external fallback can adopt one exact operator-approved conflict resolution without
              weakening structural proof for other members or losing any changed member's verification obligation.

            - _Outcome:_ Member 6 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ retained Member 6 evidence through Task 6.11.R.t.b plus the exact D5.11 / Task 6.11.R.v
                  worktree patch over `cda3090c8`; reachability is the complete current tree. Boundary-order
                  deviation: external-fallback self-delivery supplied the conflict-admission amendment after the
                  original member boundary; the bounded patch excludes no changed implementation file.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ refresh remains demand-driven, and the new consent path begins only after an attended
                  external fallback has already produced a changed suffix.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ D5.9 still supersedes only the external-only invocation clause. External adoption
                  remains freshly observed and proved before its existing reserved top settlement.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ native landing and complete rewritten-suffix reconciliation are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ canonical remaining-chain selection and semantic no-effect fallback are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ non-terminal registration, dependent-top filtering, and singleton degradation are
                  unchanged; pending verification remains the same pre-provider mutation barrier.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ native-link disclosure and host-silent decline are unchanged. Conflict admission adds
                  its own explicit approval interlock only when the external fallback returns a conflict offer.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ provider-native execution still records only the selected member for verification.
                  External adoption now stops before reservation on conflict and enters the existing settlement only
                  after an exact approved resubmission; divergence and other proof refusals remain fail-closed.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                  _Evidence:_ public commands still derive facts from plan/state and locators. The strict handler
                  accepts only the response-owned conflict object and carries no caller-authored observation facts.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`; _State:_ `[x]`;
                  _Evidence:_ chain-current selected publication, empty-dependent bypass, and bounded provider
                  diagnostics are unchanged.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`; _State:_ `[x]`;
                  _Evidence:_ settlement persists one plan-ordered verification set with its selected owner; final
                  response, entry replay, exact acknowledgment, lost-response convergence, and every pending barrier
                  preserve that set without another provider effect.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 11`; _State:_ `[x]`;
                  _Evidence:_ the first conflict result emits the complete mutation-free offer and restoration
                  leases. Exact resubmission reobserves and reproves accepted and conflicted dependents, refuses
                  malformed or pathless proof plus stale, mismatched, missing, additional, or diverged evidence,
                  and classifies only approved conflicts as changed. State and operation schemas enforce a distinct,
                  plan-ordered, non-terminal verification set containing the selected member; both workflows
                  preserve the approval/decline interlock and opaque resubmission.
                - _Adversarial companion:_ pass one found that malformed Git conflict output could become pathless
                  consent and changed-member authority. The source-verified correction now refuses pathless proof at
                  the Git producer, adoption core, shared proof schema, and strict consent boundaries. Fresh pass two
                  returned no findings over the complete Member 6 slice.
                - _Summary:_ ten met, one intentionally superseded, zero unresolved. The mixed accepted/conflicted
                  suffix, strict handler, settlement, replay, acknowledgment, workflow, real-Git contribution, and
                  complete delivery regression surfaces all passed. Success Criteria markers remain unchanged for
                  terminal verification.

        - _Forward amendment (2026-08-28):_ Compaction during an authorized review-fix refresh demonstrated that
          session initialization required the integration checkpoint's Candidate-applicability authority before it
          would identify the already-bound work unit. A legitimate `request-authority` result therefore erased the
          integration context and made recovery impossible before the owning workflow could render that choice.

        - `[x]` **6.11.R.w Restore integration recovery across pending Candidate applicability**

            - _Goal:_ Session initialization and compaction recovery preserve the exact originating integration
              context while Candidate applicability is non-current, without recognizing a changed target or moving
              any mutation authority out of the integration checkpoint.
            - Both session projectors now recover an `Integrating` context only through the exact stored boundary
              for the durable Candidate subject when the effective target is non-current. Active prepublication and
              mismatched boundary evidence remain fail-closed; real-CLI seed/recovery-audit coverage and the
              unchanged checkpoint test preserve `request-authority` at the mutation boundary.

        - `[ ]` **6.11.R.x Revalidate the amended integration-recovery boundary** — validate criteria at member scope

            - _Goal:_ Focused unit, session-init, compaction-recovery, checkpoint, and live self-hosting evidence
              prove orientation remains recoverable while authority remains exclusively at the mutation boundary.

## **Phase 7:** Hosted-review fan-out and applicability

**Delivery member:** 7 — `review-fan-out`

_Purpose:_ Fan a carried hosted-review reservation out across member pull requests, discharge the work-unit
obligation as the conjunction of member reviews, and stop non-substantive head movement from voiding reviews that
still cover the content.

_Design decisions:_ One review system, not two — the conjunction is over the same reviews per-member admission
already requires. No clearance is derived from any single member review: no pull request presents the union delta
in a stack, so a top-only resumption would review a sliver while claiming the work unit. Owning the applicability
projection does not make delivery the owner of review architecture: it owns whether an existing review still
covers the current content, and obligation, findings, clearance, and lane precedence are untouched.

_Amended 2026-08-23 — vertical ownership:_ Phase 7 now closes one selector-to-terminal spine. Task 7.1 owns the
reservation marker and exact shared vehicle; Task 7.2 carries it through request, handle, await, attempt, and settle;
Task 7.3 owns first-outstanding selection, source order, and the typed conjunction; Task 7.4 owns the pure and
Git-backed applicability projection plus its read-only query; Task 7.5 owns canonical Owner selection and the shared
request/discharge consumer; Task 7.6 makes the existing verbs and workflows reach the spine and proves it through
vertical scenarios. Task 7.7 closes the member. The re-cut adds no task ID or delivery-plan revision.

### `[x]` **7.1 Make the reservation's pinned target vehicle-typed**

- _Goal:_ A carried reservation can name a delivery marker instead of a single pinned head, so its targets resolve
  per member at read time.

- _Outcome:_ Reservations now carry either a singleton pinned head or one exact delivery-plan marker. Production
  selects the delivery arm only from a coherent plan/state read; discharge derives retained member targets at read
  time and refuses repository, work-unit, or plan drift. Hosted request and admission share one exact member selector,
  including its work unit and head, without persisting a target list.

- _Amended 2026-08-24:_ The outcome's plan/state premise is superseded for pre-publication selection. One
  authoritative canonical plan selects the delivery reservation marker even while state is absent; exact plan
  absence selects the singleton target, and unavailable or incoherent evidence refuses. Discharge continues to
  require coherent state and derive retained member targets at read time.

### `[x]` **7.2 Iterate and conjoin discharge over derived member targets**

- _Goal:_ The work-unit obligation reports discharged only when every member review has cleared, evaluated against
  each retained member's own bound head and span.

- _Outcome:_ The validated member selector now survives request, handle, await, request-time unavailability, and the
  concluded lane attempt that settlement reaches by `attemptRef`. Each discharge read matches that selector as well
  as host coordinates, so a coincident attempt for another member cannot count and the work-unit result is the
  conjunction over every retained member rather than the top review.

### `[x]` **7.3 Enforce reserved-source ordering per member at request time**

- _Goal:_ The reserved source cannot be leapfrogged by a lower-ranked carrier on any member merely because that
  member's pull request now exists.

- _Outcome:_ Status now projects retained targets in delivery order, exposes each exact member conjunct, and returns
  the complete hosted-request envelope for the first outstanding member; settling it advances selection and only an
  all-member conjunction reports discharged. Source fallback and request admission use selector-qualified attempts,
  so coincident progress from another member or a delivery attempt on a singleton cannot affect ordering.

### `[x]` **7.4 Project review applicability across non-substantive head movement**

- _Goal:_ A review survives head movement that does not change what it reviewed, and where a residual delta
  remains, that bounded delta reaches an owner decision before provider capacity is spent.

- _Outcome:_ One exact selector now projects ordinary and delivery-member prior reviews through the existing D4
  contribution arbiter: unchanged or mechanically equivalent heads remain applicable, bounded residuals stop at
  factual `decision-required`, and movement, malformed/failed Git, unsupported capability, and unavailable evidence
  retain distinct fail-closed results. Earlier attempts come from one locked, complete, read-only snapshot of the
  existing operation namespace; every record and selector dimension is validated, and incomplete or empty evidence
  cannot be mistaken for permission to spend another provider pass.

- _Rationale:_ Rewrite destroys applicability; retarget preserves it. Discharge reads a settled attempt anywhere
  in the base-to-approved-head span, so a rewritten head drops its reviewed commits out of that span while a
  retargeted request keeps its head and stays in span. A native landing rewrites the entire remaining suffix, so
  every landing would otherwise void the clean reviews of every remaining member — roughly a quadratic number of
  hosted passes for an N-member stack, against a provider baseline that does not re-review mechanical restacks at
  all.

- _Context:_ The concern is not delivery-specific: an ordinary work-unit pull request whose head moved after a
  clean review because a base merge landed separately-reviewed content wastes a metered pass for the same reason.
  That ordinary case is the simpler instance of one projection. Delivery owns it because the decision at its
  centre is the equivalence arbiter, and delivery holds the evidence that patch equality is the wrong one.

- _Shape:_ A typed contribution-applicability projection is consumed before any re-review request and at discharge.
  Its closed result is `applicable`, `decision-required`, or `review-required`; every arm binds repository, request,
  vehicle, lane, source, prior attempt, prior head, and current head. The applicable arm names a machine-proved
  basis and empty residual. The decision arm carries the exact bounded residual and digest. The review arm carries
  either a typed proof failure or the Owner's explicit selection to review. Base movement and equivalent reviewed
  contribution remain separate fields. Only arbiter-proved equivalence preserves automatically.

- _Shape:_ An Owner selection over a residual is `covered | review-required`, bound to actor, time, projection and
  residual digests, and exact heads. It publishes by version check onto the existing lane-progress attempt, so a
  retry replays rather than asks again; no new record family is introduced. `covered` makes the projection
  applicable, while `review-required` admits the normal request path. Request admission and discharge consume the
  same result, and neither `decision-required` nor `review-required` can discharge an earlier attempt.

- _Note:_ Earlier attempts are discovered through one bounded enumeration of the existing lane-progress records,
  filtered by repository, change request, vehicle, lane, and source. The enumeration is read-only. The explicit
  Owner selection is the only write and extends the selected existing attempt by version check — no review ledger,
  index, or record family.

- _Amended 2026-08-23:_ The preceding write placement is superseded. This task produces facts only: one
  storage-neutral query returns an exact complete candidate set or typed unavailable/incomplete evidence, and one
  consumer-specific projection reuses D4's arbiter without duplicating it. Only a non-empty bounded residual yields
  `decision-required`. Endpoint movement reruns; failed or malformed Git evidence stops; unsupported capability
  stops for upgrade; missing, ambiguous, empty, incomplete, or unbounded evidence stops unavailable. None becomes
  `review-required` or an Owner offer.

- **Additional Context:** `notes-delivery-native-stack-composition.md` § Applicability: contribution equivalence
  versus path carry-forward — the existing path-based proof this projection must not absorb

    - Build `test-first` (one behavior at a time):
        - A member rewritten with an unchanged contribution keeps its review applicable
        - A member whose contribution genuinely changed surfaces the exact uncovered delta rather than preserving
        - A retargeted request with an unmoved head stays applicable
        - Pure base movement is separated from contributed change in the projection's output
        - An ordinary work-unit head moved by a base merge is served by the same projection
        - The projection never auto-approves a residual delta
        - Every result arm binds the exact attempt and old/current review coordinates
        - A residual returns `decision-required` with exact delta and stable digest
        - An Owner `covered` selection is version-checked onto the existing attempt and replays on retry
        - An Owner `review-required` selection reaches request admission and never discharges the prior attempt
        - The earlier proof-conflict/unavailable-to-`review-required` behavior is superseded by D8.7's distinct
          rerun, stop, upgrade, and unavailable results
        - The bounded lane-progress query excludes attempts from another repository, request, vehicle, lane, or
          source
        - Applicability discovery writes no new record or index
        - An incomplete operation snapshot returns unavailable and never infers that no prior review exists

### `[x]` **7.5 Reach the discharge read with the applicability projection**

- _Goal:_ A recorded unavailability at a prior equivalent or still-in-span head does not re-void when the top
  moves, so a reservation that discharged through a fallback source stays discharged.

- _Outcome:_ The Candidate transition union now carries a distinct target-neutral review-applicability selection;
  both Owner choices bind the complete selector and factual digests without changing Candidate target reduction,
  and exact replay survives unrelated later transitions without duplication. Request admission and discharge reduce
  that same canonical authority, while discharge discovers the underlying prior attempt through the complete
  operation snapshot: applicable safe-unavailability advances source order, applicable settled fallback evidence
  discharges after top movement, unresolved or unavailable projection evidence spends no provider capacity, and a
  retained selection alone cannot substitute for missing review evidence.

### `[x]` **7.6 Re-author both workflows' review prose around the fan-out**

- _Goal:_ The prose an operator actually follows drives the carried reservation per member and reads the
  conjunction at the terminal boundary, so the fan-out is reachable rather than only implemented.

    - `[x]` **7.6.a Drive the reservation per member in the delivery workflow's review section**

        - The delivery workflow passes status-owned actions, handles, settlement plans, and applicability offers
          unchanged, then admits landing only from the settled typed conjunction.

    - `[x]` **7.6.b Make the integration workflow's reservation loop delivery-aware**

        - Integration review iteration re-enters status after each concluded attempt, leaving member/source
          selection to the CLI and advancing only from the complete discharge conjunction.

    - `[x]` **7.6.c Extend the existing typed review progression**

        - Status owns the complete request, applicability offer, conflict, and stop-action union; the existing
          Candidate applicability command performs the sole versioned authority write.

    - `[x]` **7.6.d Prove the selector-to-terminal lifecycle vertically**

        - The review-status handler now reads its routed obligation through production composition over one real Git
          repository and repository-backed delivery, lane, Candidate, and publication-boundary stores. The scenario
          drives fallback, equivalent-head carry, residual selection, finding settlement, next-member selection,
          terminal conjunction, and singleton handling without assembling applicability or discharge in the test.

- _Outcome:_ The existing status, hosted-review, and Candidate verbs now form one typed delivery-member spine in
  both shipped workflows. First-outstanding order, safe fallback and carry, canonical applicability authority, and
  terminal conjunction remain CLI-owned; production status composition crosses the repository-backed delivery,
  lane, Candidate, and publication-boundary stores, while package/project parity, every applicability stop class,
  and singleton compatibility remain covered without prose enumeration or selector reconstruction.

- _Amended 2026-08-24:_ Reachability also begins before ordinary integration's first push. The integration workflow
  performs a typed delivery-entry inspection after confirming `Integrating`; exact plan absence continues singleton
  integration, while a canonical unbound or coherently bound plan dispatches to `Deliver Stack` and every ambiguous
  or conflicting state stops. The earlier 7.6.d scenario began after reservation and binding, so Task 9.1's reopened
  verification adds the missing plan-present/state-absent vertical path.

### `[x]` **7.7 Close delivery member 7** — validate criteria at member scope

- _Goal:_ Member 7's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

- _Outcome:_ Member 7 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
    - _Span:_ original diff `2fae38462..e11bd763d`; forward amendment `bbde7b167` plus the Task 7.7.R.b
      worktree at `6878770ea`; reachability `6878770ea` plus that worktree. Boundary-order deviation: the approved
      post-verification reopening supplied Tasks 7.7.R.a-b without absorbing unrelated later-member changes.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`;
      _Evidence:_ retained member bindings still derive one exact target per member and settle only through the
      complete conjunction. The production lifecycle now drives both non-terminal and terminal delegated-agent
      fallbacks through real prepare and attest operations before the conjunction can discharge.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`;
      _Evidence:_ complete hosted coverage and exactly admitted local results may settle; supplemental coverage may
      inform findings but cannot discharge. The existing D4-backed applicability path carries exact local progress
      across head movement, refuses replacement pull-request coordinates, and adds no equivalence projection or
      record family.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`;
      _Evidence:_ status carries the driver's exact source, member vehicle, host target, pass, ceiling consequence,
      and status target into local prepare; prepare freshly re-runs status before publication; persisted operation,
      attest, applicability, findings resumption, and terminal conjunction consume the same admission. Retained
      findings precede any replacement request, and Success Criteria markers remain unchanged.

- _Forward amendment (2026-08-27):_ D8.5 requires delivery-member request admission to pass through the existing
  review driver. The completed implementation instead composed a hosted request directly after applicability, so a
  selected re-review could overtake retained findings response and bypass accumulated pass/ceiling admission. Reopen
  the member boundary to repair that existing-driver seam only; generalized signal-convergence policy remains with
  `review-signal-convergence`.

    - `[x]` **7.7.R.a Restore driver-governed member review re-entry**

        - Retained findings now precede re-review; exact member-lineage pass counts and D8.6-retained source progress
          pass through the standard driver at status and immediately before provider invocation. Await stays
          binding-only, while exact ceiling consequences stop for approval and re-enter unchanged through the shipped
          review workflows.

    - `[x]` **7.7.R.b Revalidate the amended Member 7 boundary** — validate criteria at member scope

        - _Goal:_ Re-run `Success Criteria > Member 7 — review-fan-out` over the amended bounded diff and cumulative
          tree; retain the existing criteria markers and replace this closing task's report with current evidence.

        - `[x]` **7.7.R.b.a Keep supplemental member reviews non-settling**

            - Requested and effective hosted coverage survive lane progress. Supplemental findings remain
              actionable, while only complete coverage can consume or discharge the member obligation.

        - `[x]` **7.7.R.b.b Carry the driver's delegated-agent fallback through member progression**

            - The driver's typed local action carries exact delivery, host, pass, and ceiling admission through
              status, local prepare, persisted operation, and attest. Its standard-lane result participates without
              adding a source, lane, or review mechanism; terminal-member admission requires that exact action.

        - `[x]` **7.7.R.b.c Resolve retained findings before any new member request**

            - Findings project across the member's complete applicable reserved-source set before request selection,
              including an exact local-resume operation. Ambiguous response authority stops before another pass.

        - `[x]` **7.7.R.b.d Revalidate the repaired Member 7 boundary** — validate criteria at member scope

            - The amended primary walk resolves all three criteria. The authorized Heavy-class convergence pass's
              final-member and exact-admission findings are repaired, and the real handler lifecycle now proves both
              non-terminal and terminal delegated fallbacks through complete conjunction settlement.

## **Phase 8:** Record retirement and doctrine

**Delivery member:** 8 — `retirement-and-doctrine`

_Purpose:_ Clear the delivery store's completed residue behind a reaping driver that actually exists, and record
the integration doctrine this topology assumes in the two surfaces that have no owner for it today.

_Design decisions:_ No archive namespace — that would be a durable record family the non-goals exclude, and
pre-release posture clears development state rather than migrating it. The retirement verb binds an explicit
work-unit identity as input rather than resolving through the active work unit, because after archival no active
meta exists and that resolution shape is the exact defect the retired terminal attach shipped.

### `[x]` **8.1 Reap member refs, authoring candidates, and gate checkouts at teardown**

- _Goal:_ A completed delivery leaves no member refs, authoring candidate refs, or gate checkouts behind, on
  either side.

- _Outcome:_ Delivery authoring now receives its private candidate refs and detached gate paths from one typed
  locator. Accepted head movements keep local refs exact; member teardown deletes both sides; and closeout reaping
  reserves paired candidate heads before exact, idempotent ref/worktree removal while retaining state bindings.

### `[x]` **8.2 Retire the completed plan and state pair under an explicit work-unit identity**

- _Goal:_ After terminal adoption and ordinary closeout, the store holds no plan or state record for the completed
  work unit, so a reopened same-slug work unit cannot rediscover the old plan and global member reverse lookup
  cannot treat historical heads as live delivery authority.

- _Outcome:_ Delivery plans and states now expose exact version-checked removal, and one explicit
  `arc delivery closeout` call verifies the terminal before mutation, reaps exact Git residue, removes state before
  bound and orphan plans, and converges on retries after a partial cross-namespace delete. The integration tail
  passes work-unit, repository, and remote identities after `arc user close` and before ordinary teardown; generic
  reconciliation preserves closeout reservations for that owning verb.

### `[x]` **8.3 Mint `strategy-integration.md` and complete its four ship mechanics**

- _Goal:_ One work unit's journey from a verified candidate to landed work on the protected base has a documented
  owner, and that document reaches installing projects.

    - `[x]` **8.3.a Author the strategy with its bounded charter**

        - Established the publication, delivery-window, exact-head review, terminal-authority, and closeout charter
          without absorbing adjacent work-organization, concurrency, review, or quality-gate ownership.

    - `[x]` **8.3.b Complete the four ship mechanics**

        - Added the package source to the install recipe and self-hosting manifest, synced the project copy, and
          indexed the strategy in both configurable navigation surfaces.

- _Outcome:_ Integration doctrine now has one installed T3 owner from verified Candidate through terminal merge and
  post-landing hand-back. Its directive trigger loads the posture when that journey is designed or changed, while
  routine execution remains with typed lifecycle workflows and always-loaded authority rules.

### `[x]` **8.4 Record the delivery-and-review posture ADR**

- _Goal:_ The canonical decision — agentic review as the primary lane with human review complementing it, and
  windowed landing as its consequence — is recorded once with its alternative and both reopening triggers.

- _Outcome:_ Accepted ADR-034 records agentic-review-led windowed landing as one decision, with land-as-you-go as the
  considered alternative and the four forces supporting the narrower posture. It preserves raw API registration as
  a worked fail-closed instance and names separate field-evidence triggers for reopening landing timing and terminal
  authorization composition.

### `[x]` **8.5 Close delivery member 8** — validate criteria at member scope

- _Goal:_ Member 8's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

- _Forward amendment (2026-08-26):_ Bound self-delivery re-entered integration with a newly published Candidate
  while the remote terminal ref still carried the prior Candidate. Delivery entry selected the bound position
  route before consuming the existing idempotent publication action, so member review saw a stale owning
  Candidate. The same run confirmed that reopened execution did not surface D5.8's pre-authoring correction
  route at its task-loop fire point.

- _Forward amendment (2026-08-26):_ The first provider-native refresh of that routed correction reached a genuine
  content conflict before reservation, then the documented external fallback discarded the selected member's
  dependent-suffix scope and refused the externally refreshed result. This task also carries that exact scope
  through fallback planning and adoption while keeping the selected and lower prefix fixed.

    - `[x]` **8.5.R.a Make bound delivery re-entry consume correction and publication routing** — validate criteria
      at member scope

        - _Goal:_ Reopened bound execution identifies the owning delivery member before correction authoring, and
          bound integration consumes a pending top publication before reading member position, using typed
          provider-neutral routes with no new durable state.

        - Exact task ownership now routes bound corrections before authoring, retained operations reconcile first,
          pending publication precedes member position, and terminal selection returns ordinary top authoring.
          External refresh fallback preserves the selected-member scope and fixed lower prefix through adoption.

- _Forward amendment (2026-08-27):_ Self-delivery completed the terminal-only correction route, fresh whole-unit
  verification, Candidate re-root, publication, and the idempotent top push. Public position then returned to the
  same review-fix planner because terminal selection had no typed post-publication continuation into the existing
  exact Candidate rebind. The documented route therefore looped instead of reaching member review.

    - `[x]` **8.5.R.b Complete terminal-authoring publication re-entry** — validate criteria at member scope

        - _Goal:_ An explicitly terminal-owned correction that has completed ordinary Candidate publication closes
          through the existing version-checked terminal rebind and resumes delivery position, while every
          non-terminal correction still requires its selected-member rewrite route.

        - Terminal correction now distinguishes pre-authoring selection from post-publication settlement. Only an
          integrating entry carrying exact fresh terminal movement reaches the existing version-checked rebind;
          stale, absent, non-terminal, or mismatched movement retains authoring or refuses before state mutation.

- _Forward amendment (2026-08-27):_ Reopened whole-unit verification completed against a work unit whose prior
  Candidate correctly made plain attestation refuse, but the typed result exposed only prose and the verification
  workflow did not consume the deliberate new-root continuation. The safety boundary exists; this task makes that
  bounded continuation executable without weakening the refusal.

    - `[x]` **8.5.R.c Make reopened verification re-rooting actionable** — validate criteria at member scope

        - _Goal:_ Freshly completed reopened work-unit verification consumes an exact typed continuation from an
          obsolete-Candidate refusal into a deliberate new Candidate root, while partial, stale, malformed, or
          still-open verification remains stopped.

        - Plain attestation now returns a closed re-root action whose exact argv binds the refused Candidate and
          staged subject. Replay reobserves both and the blocked state before writing, while verification consumes
          only an exact successful re-root and every stale, partial, malformed, or open-task path stops.

- _Forward amendment (2026-08-27):_ Self-delivery resumed from the newly published Candidate with the terminal
  request correctly based on the highest retained non-terminal member. Exact terminal rebind instead required the
  protected target, so the preterminal stack window refused `top-request-mismatch`; its green executable fixture had
  modeled only the post-teardown retargeted shape. Repair that demonstrated mismatch and rehearse the remaining
  integration state machine over this work unit's live eight-member shape so further reachable blockers surface at
  once rather than one mutation cycle at a time.

    - `[x]` **8.5.R.d Make terminal rebind stack-window exact and rehearse integration**

        - _Goal:_ A freshly published terminal correction rebinds against the exact base valid at its current stack
          position, and an executable live-shaped rehearsal reaches every remaining integration mutation boundary
          without another unmodeled lifecycle-shape refusal.

        - `[x]` **8.5.R.d.1 Admit the exact preterminal predecessor base**

            - Terminal rebind now accepts either the exact protected target or the exact immediate predecessor at
              the top request's current stack position, while every unrelated, stale, or coordinate-incoherent base
              refuses before the versioned state write.

        - `[x]` **8.5.R.d.2 Rehearse the remaining stacked integration path**

            - An executable eight-member rehearsal crosses terminal rebind, retained member-review response,
              native landing selection, seven teardowns, top retarget, terminal readiness, and complete closeout.
            - Correction publication and rematerialization derive canonical candidate/gate locators, a real CLI
              correction-to-closeout scenario proves exact cleanup, and all eight live gate pairs were restored to
              their canonical candidate heads before integration resumes.

        - `[x]` **8.5.R.d.3 Close the Member 8 amendment** — validate criteria at member scope

- _Outcome:_ Member 8 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 8 — retirement-and-doctrine`.
    - _Span:_ original diff `e11bd763d..270f42c1b`; earlier amendment diff `a374df393..b2d7ec52e`; prior amendment
      diff `530463f72..bfbf5073e`; final amendment diff `3d9ea7ef1` plus the current worktree; reachability through the
      current worktree; boundary-order deviation: the approved Tasks 8.5.R.a through 8.5.R.d -
      `tasks-delivery-native-stack-composition.md` forward amendments reopened Member 8 after its original boundary.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 1`; _State:_ `[x]`;
      _Evidence:_ exact plan/state, ref, Candidate, and gate retirement preserves each authority, requires the merged
      terminal request, retains exact closeout identifiers, and leaves every mismatch intact with a refusal. A built-
      CLI correction-to-closeout scenario derives the canonical locator pair, publishes through it, and proves both
      sides reaped; fresh observation found all eight live gate pairs exact after repair.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 2`; _State:_ `[x]`;
      _Evidence:_ the integration strategy ships byte-identically through the installation recipe and both indexes.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 3`; _State:_ `[x]`;
      _Evidence:_ ADR-034 records the posture, considered alternative, and both reopening triggers. Fresh pass 2
      converged after the two approved retirement corrections.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 4`; _State:_ `[x]`;
      _Evidence:_ typed entry inspection maps an exact open parent task to its member, gives coherent active-operation
      recovery precedence, consumes pending publication before position, and leaves unbound and work-unit-verification
      execution ordinary. Terminal correction planning returns top authoring before publication, then only an
      integrating entry with exact fresh terminal movement reaches the existing Candidate-, publication-boundary-,
      request-, and coordinate-checked rebind. Correction publication and complete rematerialization derive their
      candidate/gate locators from canonical plan and repository identity; dependent external fallback preserves the
      selected and lower prefix through structural adoption. Unit, workflow-contract, executable E2E, and live-shaped
      rehearsal coverage prove the routes without a new state transition or provider-specific plan/state field.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 5`; _State:_ `[x]`;
      _Evidence:_ plain attestation emits a closed action and argv bound to the exact refused Candidate and staged
      subject. The handler requires paired selectors with deliberate re-rooting; the verb reobserves Candidate,
      subject, and blocked currentness and refuses every mismatch before publication. Verification executes only the
      exact continuation after its fresh gates and requires `attested / re-root`. Unit, handler, workflow-contract,
      and real-CLI tests prove successful replay plus stale replay with no Candidate-record write, without adding a
      verification ledger, lifecycle state, or Candidate authority. Success Criteria markers remain unchanged.
    - _Adversarial companion:_ the earlier bounded pass found that the first re-root continuation could be replayed
      over later staged content; exact selectors and pre-write refusals repaired it. Final live-shaped passes found
      stale gate heads, retained findings bypassing response, and the missing complete rehearsal. Primary inspection
      repaired each supported-path defect; the exact live pairs, retained-attempt response route, and executable
      eight-member rehearsal now prove closure without speculative hardening.
    - _Summary:_ five met, zero superseded, zero unresolved.

## **Phase 9:** Verification

### `[x]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ The terminal full suite passed Markdown and ARC contract lint, TypeScript and shell lint, both
  typechecks, 851 test files with one skipped (11,013 tests with one skipped), package build, aggregate self-review,
  and diff hygiene. The post-report continuations added 334 focused regression tests across 20 files, then the final
  ordinary-applicability correction passed its five-file 75-test regression, targeted TypeScript lint, both
  typechecks, build/declaration generation, and diff hygiene. Fresh Member 6 and final Member 7 convergence passes
  returned no findings.
- _Success criteria:_ 36 total: 34 met, two superseded, and none unresolved. All eight member reports resolve to
  their current criteria loci and boundary spans. The final continuation consumes Member 6 diff
  `3067b21e2afef343c0c8337dedc7f8f7fb97f1a1..ca340858aa32edf06c1078b0453d64ebf40a5dcc`
  at reachability `ca340858aa32edf06c1078b0453d64ebf40a5dcc` and Member 7 diff
  `ca340858aa32edf06c1078b0453d64ebf40a5dcc..e8a12ffde9d1580f11b63d32ad7f45f6425dba09`
  at reachability `e8a12ffde9d1580f11b63d32ad7f45f6425dba09`, plus the bounded terminal correction over
  `b12094bc4a262c837dde14ef0244827fd07f2330`. Member 1's implementation-task workaround and Member 6's
  external-only refresh clause remain intentionally superseded by D7.2b and D5.9. Union coherence and all six
  cross-member seams hold through exact conflict consent, replayable multi-member verification, retained findings,
  singleton and delivery applicability, typed local fallback, cursorless closeout, and Candidate re-rooting.

- _Forward amendment (2026-08-27):_ The D5.8-D5.10 corrections added Success Criteria 34 and 35 after this terminal
  report. Consume the updated Member 6 boundary report and revalidate the continuation's cross-member mutation
  barrier without re-deriving unchanged member criteria or repeating an unchanged full-suite gate.

    - `[x]` **9.1.R Revalidate the post-report Member 6 amendments at work-unit scope**

        - _Goal:_ The terminal report accounts for every approved success criterion and proves the replayable
          verification continuation remains coherent across delivery-entry, mutation, workflow, and Candidate seams.

        - `[x]` **9.1.R.a Revalidate the delivery-state entry diagnostic repair at work-unit scope**

            - _Goal:_ The existing terminal report remains valid over the narrow state-refusal carrier, and the new
              delta adds no recovery authority, migration reader, durable state, or cross-member behavior.
            - Entry inspection preserves the closed state-store refusal and state-specific remedy without adding a
              recovery decision, compatibility reader, durable field, or alternate mutation route.

        - `[x]` **9.1.R.b Revalidate exact conflict adoption at work-unit scope**

            - _Goal:_ The terminal report accounts for D5.11 and proves that changed dependent verification composes
              with delivery entry, mutation barriers, member review, and Candidate/integration continuity.
            - Exact conflict consent retains every changed member in plan order through settlement, entry replay,
              verification, and acknowledgment. The final Member 7 correction preserves the same typed applicability
              projection for ordinary and delivery targets while keeping delivery conjunctions exact.

        - _Outcome:_ The rebound tree matches the reviewed delivery content at
          `b12094bc4a262c837dde14ef0244827fd07f2330`; delivery state revision 47 replays the exact Member 6 and Member 7
          verification set, blocks competing mutations, and exposes one digest-bound acknowledgment. The ordinary
          moved-head production path now reaches its canonical Candidate selection without weakening D8.2's complete
          retained-member conjunction.

---

## Success Criteria

### Member 1 — `member-boundary-verification`

- `[~]` Each planned member's task range closes with an ordinary implementation task that fires `validate-criteria`
  at member scope over its group in the member-grouped Success Criteria section, adding no phases and leaving the
  single terminal verification task unassigned to any member. Success criteria remain marked only during the
  verification phase. The closeout pass walks the seam group and dispositions the member groups from recorded
  boundary evidence rather than re-deriving them. Every surface D7.5 names carries the change in both copies,
  `validate-criteria` is reachable from both declared fire-points, and plan validation refuses member task ranges
  that interleave or depart from member order. The central adversarial method may use a stable authored partition
  for two or three contract-closed group reviews plus a fresh seam-and-aggregate review, preserving one complete
  logical pass without 1:1 member fan-out or satisfying the stronger `review-chunking` carrier.

  **Superseded:** D7.2b replaces the implementation-task workaround with a member-scoped verification role while
  preserving its cadence, member assignment, criteria slice, and the sole terminal work-unit verifier.

- `[x]` The ordered delivery task inventory classifies every parent as implementation or scoped verification.
  Member-scope verification remains member-assignable under the existing partition semantics; exactly one
  work-unit-scope verifier remains terminal and unassigned. Canonical plan and authoring schemas, coverage,
  fingerprints, composition, handlers, and regenerated development records all consume that classification.

### Member 2 — `contribution-identity`

- `[x]` When a predecessor moves, the member is mechanically reapplied even if its before/after trees are equal;
  only an unchanged predecessor plus equal member tree takes the tree-equality shortcut. An equivalent provider
  result carries without attended acknowledgement, a genuine reapply conflict refuses with the conflicted paths
  named, and a conflict-free divergence refuses with the divergent paths named.

- `[x]` `merge-tree --merge-base` capability is established through the existing probe and reuses the existing
  typed unsupported-refusal. No new version floor, disclosure path, or degrade path exists in the change set.

- `[x]` The aggregate-patch envelope and the linearity precondition are absent from the code base.

### Member 3 — `review-gate-resolution`

- `[x]` A delivery member branch resolves to its owning work unit through the delivery reverse lookup — not a
  branch prefix test — so `arc review status` and the hosted request path address a member; and the terminal spine
  resolves the top's change request while its base is a member branch, rather than refusing `base-mismatch`.
  Every shared-resolution caller supplies its acceptable-base set. Member and gate checkouts remain operation
  inputs outside the WU session and recovery locus; the originating checkout alone owns compaction recovery and
  its load set.

### Member 4 — `topology-transition`

- `[x]` No retained control branch and no disconnected terminal pull request exist in any delivery path. The top
  member is the work unit's own branch, its pull request is the terminal integration vehicle, and it presents with
  the ordinary work-unit template and title. Publication validates a distinct caller-authored terminal title/body
  with the complete presentation set before mutation, and an exact-request retry does not rewrite it. Content-neutral
  ancestry adoption proceeds only when a dedicated in-core containment result proves the top tree unchanged.

### Member 5 — `terminal-integration`

- `[x]` The terminal ceremony runs through the ordinary `arc integrate checkpoint` to interlock to
  `arc integrate merge` flow, with the delivery arm composing its claim from the attestation record, exact bound
  member heads, and the residual comparison.

- `[x]` After the highest non-terminal landing, its binding remains available while its remote branch is deleted
  as the host retarget trigger and the top is reobserved. Automatic retarget proceeds without another mutation;
  an open request on the wrong base yields `retarget`, and `closed-unmerged` yields `reopen-and-retarget`. Either
  remedy requires explicit invocation and another observation, and the terminal arm refuses until the top is
  freshly observed open against the protected base. A member-branch base remains valid during the landing window.

- `[x]` Terminal base reconciliation compares both the protected-base and Candidate heads before mutation, then
  converges through informative checkpoint reruns over existing durable facts. Changed Candidate content requires
  ordinary whole-work-unit verification and a new Candidate root; stale terminal coordinates require only an
  idempotent, version-checked delivery-state rebind. Neither path adds Candidate-lineage authority, a
  terminal-reconcile reservation, or autonomous replay, and every ambiguous observation stops. **Amended
  2026-08-22:** the whole-work-unit default is superseded. Ancestry is classified first: contained topology creates
  no commit, and only proven divergence uses `--no-ff` with the exact prior-head/base parent pair. Exact new-head
  checks always rerun; D4 mechanical equivalence carries Candidate verification applicability automatically, while
  every non-mechanical bounded residual requires an exact-bound `covered`, `targeted-check`, or `changed` selection
  by the applicable authority on the existing Candidate record. Endpoint movement reruns; failed, malformed,
  unsupported, unavailable, or unbounded evidence stops through its distinct typed class. Every Candidate consumer
  reads the same pure durable baseline and asynchronous Git-backed effective target, and the publication boundary
  settles that target independently before checkpoint proceeds.

- `[x]` Interrupted delivery operations reobserve the existing reservation and return an informative ordinary rerun
  action with a minimal exact reservation-subject selector and CLI-precomposed text; ordinary preparation rederives
  every other input. Only overloaded `rewrite` and `land` kinds carry a narrow mode discriminator. Exact not-applied
  `publish` and `teardown` preserve a reservation their ordinary verbs consume; other kinds/modes version-clear
  before fresh preparation or invocation through the closed
  `delivery-publish | delivery-rematerialize | delivery-refresh-adopt | delivery-land-prepare |
  delivery-native-land-select | delivery-teardown | delivery-top-remedy` rerun union. Exact applied results clear
  after their already-owed observation, while ambiguous or incomplete results retain and stop. Highest-member
  teardown stays reserved through fresh top observation across stack cardinalities, with no owner field, retry
  policy, recovery record, or autonomous replay.

### Member 6 — `refresh-and-native-landing`

- `[x]` A delivery completes while the protected base receives unrelated external landings throughout, with no
  freeze and no refresh obligated by base movement alone.

- `[~]` An externally performed registered-suffix refresh is freshly observed and structurally proved member by
  member before ARC reserves only its own adoption settlement; the excluded terminal top then absorbs the refreshed
  predecessor by genuine content merge and is lease-published before suffix and top coordinates enter state
  together. ARC invokes no provider refresh mutation, and interruption never exposes suffix-only adoption.

  **Superseded:** D5.9 replaces the external-only invocation clause with the provider-invoked path in criterion 7;
  external adoption remains an attended fallback.

- `[x]` A native landing that rewrites the entire remaining suffix reconciles every rewritten member by structural
  equivalence before admitting its new head to review.

- `[x]` Native selection observes only the canonical plan/state-derived remaining non-terminal chain. A semantic
  `native-stack-required` refusal with exact no-effect evidence clears its sequential reservation and returns to
  fresh native selection; it is never conflated with the `native-stale-suffix` refresh trigger.

- `[x]` Registration covers exactly the non-terminal member set, and ARC's own observation predicate reads that set
  as `registered` rather than `partial` when the top pull request is chained onto it. A delivery of two total
  members routes unlinked whether or not the operator opted in — the sub-two member set degrades rather than
  stopping the workflow.

- `[x]` Opting into native registration surfaces its review-invalidation consequence at the decision point, and
  declining it is a supported route that makes no host calls.

- `[x]` D5.9 supersedes criterion 2's external-only invocation clause. A provider-invoked refresh prepares and
  proves one exact registered suffix in an isolated adapter, reserves the complete requested result before remote
  mutation, lease-publishes bottom-up, resumes only an exact contiguous partial publication, settles the excluded
  terminal top and private candidates before the final state write, and retains external operator adoption as a
  fallback. GitHub registration remains raw API, provider push porcelain is never authoritative, and every
  uncertain or conflicting result stops without suffix-only state adoption.

- `[x]` The public delivery-position command composes fresh Git and host facts from canonical plan/state plus
  repository and remote locators through the existing adapter boundary. Workflow callers never author observation
  facts; unavailable observation and active-operation recovery remain typed stops.

- `[x]` Registered selected-member correction publication requires the candidate to descend from both the selected
  member's bound head and its current non-terminal predecessor when one exists. An empty dependent suffix invokes no
  provider mutation and reaches the existing reserved terminal-top settlement only when absorption is owed. Provider
  preparation refusals preserve a stable provider-neutral reason plus bounded actionable adapter detail; no
  diagnostic becomes durable state or mutation authority.

- `[x]` A dependent-suffix review-fix settlement atomically records the exact selected deliverable whose member
  verification remains owed. Its final response and a later execution entry project the same exact
  member-verification, Tier 1 continuation, and acknowledgment input. If the final refresh or adoption response is
  lost, execution entry resumes that continuation without replanning or another provider mutation; every other
  delivery mutation remains blocked. After the checks and correction-task closure, acknowledgment bound to the
  entry-emitted state revision and canonical continuation digest clears the continuation by version check and
  converges idempotently after its own lost response, while mismatched, intervening, or stale requests refuse.
  Ordinary refreshes record no continuation, and no provider-specific fact, check result, proof, review verdict, or
  generalized workflow state becomes durable.

- `[x]` An attended dependent-suffix adoption returns a mutation-free exact consent input when mechanical reapply
  conflicts, accepts only the unchanged freshly reobserved conflict set, and preserves structural proof for every
  unconflicted member. Approved conflicts are changed contributions, so settlement and replay retain the selected
  member plus every changed dependent in plan order through exact acknowledgment; decline restores the external refs
  by lease, and no proof, provider fact, check result, or reusable approval record becomes durable.

### Member 7 — `review-fan-out`

- `[x]` A carried hosted-review reservation resumes on every member pull request at its exact head, and the
  work-unit obligation reports discharged only when every member review has cleared — verified at the terminal
  boundary as the conjunction over every retained binding, including members whose physical refs were reaped,
  never satisfied by the top's own residual review.

- `[x]` Landing an N-member stack spends N member reviews plus review of genuinely uncovered deltas. A member whose
  contribution is proved unchanged under a predecessor rewrite is not re-reviewed, and a review preserved across a
  fallback-source discharge survives append-only head movement of the top. One equivalence arbiter serves both the
  delivery and ordinary base-merge cases; earlier attempts are found through a bounded read of existing
  lane-progress records. Request admission and discharge consume one closed, exact-coordinate-bound contribution-
  applicability result; a residual requires a replayable Owner selection on the existing attempt. The distinct
  path-based applicability proof remains intact, and no duplicate contribution-equivalence projection or new
  record family exists.

- `[x]` The preceding criterion's existing-attempt persistence clause is superseded: every authoritative
  review-applicability selection is a target-neutral transition on the version-checked canonical Candidate record,
  while lane progress remains non-evidentiary discovery state. An incomplete or missing earlier-attempt query stops
  unavailable; it never infers clearance or invites judgment. Existing typed review verbs carry the exact member
  selector from first-outstanding status through request, await, attempt, settle, and terminal conjunction, and
  executable vertical coverage proves the complete lifecycle without prose control flow or a new record family.

### Member 8 — `retirement-and-doctrine`

- `[x]` After terminal adoption and closeout, the delivery store holds no plan or state record for the completed
  work unit, and the retirement operation refuses while an operation, member ref, or unsettled terminal remains.
  Physical teardown retains exact member bindings until that retirement; gate-checkout reaping validates a
  deterministic ARC-owned path, expected candidate ref or head, detached state, and cleanliness without a new
  registry or HEAD-coincidence discovery. Candidate-ref reaping requires the ARC-reserved namespace plus exact
  plan/member identity and expected head; mismatches remain intact and surface.

- `[x]` `strategy-integration.md` exists in the package source, is listed in `init-recipe.json` `include_files`, is
  synced to the project copy, and is reachable from `STRATEGY-INDEX.md` in both copies.

- `[x]` One ADR records the delivery-and-review posture, its considered alternative, and both reopening triggers.

- `[x]` Bound delivery re-entry maps an exact open member task to correction planning before authoring, consumes an
  exact pending publication action before member position, and carries a selected member's dependent scope through
  external conflict-fallback planning and adoption. Unbound and work-unit-verification execution remain ordinary;
  the selected and lower prefix stay fixed; typed code owns every route without new durable state or provider-specific
  plan/state fields.

- `[x]` Reopened whole-unit verification preserves plain attestation's obsolete-Candidate refusal, then consumes its
  closed `establish-new-root` action and exact machine-readable continuation only after fresh full verification and
  structural task-list closure. Successful re-rooting is required before Candidate preparation; every other or
  malformed result stops without new verification evidence, lifecycle state, or Candidate authority.

### Cross-member seams

- `[x]` Reopened execution is mechanically continuous from one exact open task through cursorless work-unit
  verification closeout and into a newly attested Candidate. Reopen derives exact task authority from the canonical
  cursor, session init and recovery project `verify-work-unit` for only the structurally closed pre-attestation
  interval, and attestation refuses open or unresolved task lists.

- `[x]` An approved review fix routes from the canonical remaining chain's fresh provider presentation: exact
  registered delivery publishes only the selected member, delegates the mechanical suffix refresh, and adopts the
  result; exact unregistered delivery rematerializes from the updated top authoring locus. Uncertain presentation
  stops, zero provider movement is accepted only for owed top absorption, selected-change recovery is executable,
  exact eligibility refusals survive, and provider-specific data stays outside plan, state, and core contracts.

- `[x]` A unique authoritative canonical Delivery Plan selects stacked delivery before state exists. The
  pre-publication reservation carries its delivery marker from plan-only evidence, and ordinary integration
  dispatches to `Deliver Stack` before singleton change-request resolution or any push. Exact plan absence alone
  preserves singleton integration; ambiguity, unreadable or mismatched evidence, provisional residue, and
  incoherent state stop. A vertical lifecycle begins plan-present/state-absent and proves plan-only reservation,
  the publication transition, integration dispatch, first member publication and state binding, then hosted member
  fan-out in order.

- `[x]` Landing an N-member stack requires at most N landing decisions — or one contiguous-prefix decision — plus
  genuine content-conflict resolutions, with no manual recut, no per-member manual suffix adoption, and no
  synthetic ancestry-reconciliation merge on any path; every ARC-added step in the delivery path names the
  chartered failure it guards that a team on provider-native stacks does not already guard.

- `[x]` All quality gates pass (tests, linting, type checking)

- `[x]` Ready for integration
