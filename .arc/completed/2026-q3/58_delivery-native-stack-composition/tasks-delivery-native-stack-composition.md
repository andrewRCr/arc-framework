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

- _Forward correction (2026-09-04):_ Exact-head CI exposed a deterministic command-surface failure at the first
  member boundary that the later review-resolution member happened to remove. Repair the earliest independently
  landable tree rather than relying on successor code to mask it.

    - `[x]` **1.8.R.c Repair and revalidate the Member 1 executable-gate boundary**

        - _Goal:_ Member 1's exact cumulative tree passes its required project gates without changing the strict
          method-frontmatter contract or depending on a later member's parser replacement.

        - _Outcome:_ The method-frontmatter refusal now avoids resembling an emitted ARC command while preserving
          its strict semantics. Member 1's exact cumulative tree `8bdf07dc7` passed Tier 2 at `e873ea54c` and the
          correction refreshed Members 1–2 without changing that tree's covered inputs.

            - _Criteria slice:_ `Success Criteria > Member 1 — member-boundary-verification`.
            - _Span:_ correction `65cc86ef3..e873ea54c`; cumulative reachability `e873ea54c` at tree
              `8bdf07dc7`; boundary-order deviation: the approved gate correction reopened Member 1 after review.
            - _Criterion 1:_ `[~]` under D7.2b's recorded supersession; _Criterion 2:_ `[x]` unchanged;
              _Criterion 3, Member 1 clause:_ `[x]` from the exact Tier 2 run. The separately stated publication
              clause remains assigned to Member 4. Two met, one superseded, zero unresolved at this boundary.

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

- _Forward correction (2026-09-04):_ Members 3–6 reached hosted CI with delivery-binding fixtures that published
  state without its canonical plan, so production lookup correctly returned `delivery-state-unavailable`. Repair
  the first boundary that owns those review-resolution fixtures.

    - `[x]` **3.5.R.a Repair and revalidate canonical delivery-binding fixtures at Member 3**

        - _Goal:_ Member 3's exact cumulative tree passes its required project gates with every delivery-state
          integration fixture publishing the matching canonical plan first.

        - _Outcome:_ The two review-binding integration fixtures now publish the matching canonical plan before
          state and derive their plan digest and deliverable IDs from it; the shared builder accepts only the work-unit
          identity they require. Member 3's exact cumulative tree `4b88f29de` passed Tier 2 at `3d646eb88` without
          pulling later final-member behavior backward.

            - _Criteria slice:_ `Success Criteria > Member 3 — review-gate-resolution`.
            - _Span:_ correction `7961148d2..3d646eb88`; cumulative reachability `3d646eb88` at tree
              `4b88f29de`; boundary-order deviation: the approved fixture correction reopened Member 3 after review.
            - _Criterion 1:_ `[x]`; canonical plan/state lookup now exercises the exact reverse-binding contract in
              both readiness and local-review composition. One met, zero superseded, zero unresolved.

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

- _Forward amendment (2026-08-30):_ The corrective transition audit exposed a persisted-state/physical-ref split at
  the materialization retry seam. A state-exact member bypassed ref observation, so a deleted or moved member ref
  could be reported as materialized. Reopen the Member 4 boundary to restore exact re-observation without adding a
  second recovery route or weakening the existing operation reservation.

    - `[x]` **4.7.R.a Restore physical member-ref authority on materialization retry**

        - _Goal:_ A retry reobserves every state-exact non-terminal member ref; an exact ref is an idempotent no-op,
          an absent ref republishes through the existing reserved deterministic operation, and a divergent or
          unavailable ref refuses before mutation while persisted state and physical Git remain in agreement.

        - _Outcome:_ State-exact member bindings now reobserve their physical ref. Exact refs remain idempotent,
          absence enters the existing reserved materialization operation and republishes, and moved or unavailable
          observations refuse without publication or state adoption.

    - `[x]` **4.7.R.b Revalidate the repaired Member 4 boundary** — validate criteria at member scope

        - _Goal:_ Re-run `Success Criteria > Member 4 — topology-transition` over the amended bounded diff and
          cumulative tree, retaining unchanged evidence only where the physical-ref correction cannot reach it.

        - _Outcome:_ Member 4 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 4 — topology-transition`.
            - _Span:_ original member diff `a202eec2a..d26adf058` plus corrective tree delta
              `e3b03a46c^{tree}..805749aa0`; reachability `805749aa0`. The recorded Phase 5 terminal-path
              boundary-order deviation remains unchanged.
            - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 1`; _State:_ `[x]`;
              _Evidence:_ the corrected tree retains the ordinary top branch/request, complete presentation
              preflight, and containment-guarded ancestry adoption. Materialization now reobserves a state-exact
              physical member ref, republishes only verified absence through the reserved operation, and refuses
              divergence. The member-head build and focused suite prove exact, absent, moved, and unavailable
              observations, including deletion and recreation against a real bare remote and Git-backed state.
            - _External-adoption continuation:_ the retained Member 4 head and tree remain exactly
              `68f3d325b` / `805749aa0`; the dependent-suffix rewrite changed no Member 4 contribution. The prior
              single-criterion report therefore remains exact, and the focused 28-test Member 4/6 adoption seam
              passed over the rebound top without another member-wide or adversarial cycle.

- _Forward correction (2026-09-04):_ Initial publication admitted member candidates without consuming the
  workflow-owned gate outcomes, while Member 4's exact tree also lacked three checkpoint/mock-isolation repairs
  later supplied by Member 7. Close both defects at the first publication-owning boundary.

    - `[x]` **4.7.R.c Require exact member gate evidence and repair the Member 4 boundary**

        - _Goal:_ Initial stacked publication refuses before any mutation unless every exact detached member
          candidate reports a passed Tier 2 gate, and Member 4's own cumulative tree independently passes that gate.

        - _Outcome:_ Member 4 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 4 — topology-transition`.
            - _Span:_ bounded diff `3d646eb88..0f1c1947e`; cumulative reachability `0f1c1947e` at tree
              `e7ec11979`. The recorded Phase 5 terminal-path boundary-order deviation remains incorporated; this
              correction adds no new deviation.
            - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 1`;
              _criterion-digest:_ `sha256:90e248ded8e8482bab26fb6622adec6c2274ec73dba20d780ace882bbdc44ba7`;
              _State:_ `[x]`; _Evidence:_ the current member retains the ordinary top request, complete presentation
              preflight, and containment-guarded adoption. The correction changes only eligibility admission and
              preserves a non-authorizing mechanical close for pre-binding review-target composition.
            - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 2`;
              _criterion-digest:_ `sha256:e973757b8791067d9eba6919f320a97087324c191e9ef6f62b80b147680d1045`;
              _State:_ `[x]`; _Evidence:_ initial eligibility close and publication require the complete ordered
              deliverable/head/tree result set, reobserve the exact candidates, and refuse missing, duplicate,
              reordered, failed, or stale evidence before mutation. The exact current member passed Tier 2; no
              durable receipt, gate runner, or hosted-CI coupling was added.
            - _Adversarial companion:_ declined after the primary walk and exact executable evidence.
            - _Summary:_ two met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

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

### `[x]` **6.11 Close delivery member 6** — validate criteria at member scope

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
                      pending, and no check result or provider fact entered durable state at this amendment boundary.
                      Task 7.7.R.q later supersedes only that check-result exclusion after the missing Candidate
                      bridge became reachable; the provider-fact exclusion and mutation barriers remain unchanged.
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

        - `[x]` **6.11.R.x Revalidate the amended integration-recovery boundary** — validate criteria at member scope

            - _Goal:_ Focused unit, session-init, compaction-recovery, checkpoint, and live self-hosting evidence
              prove orientation remains recoverable while authority remains exclusively at the mutation boundary.

            - _Forward amendment (2026-08-28):_ The live correction continuation reached provider preparation after
              safely publishing only Member 6, but the adapter compared GitHub's current-trunk projection to the
              delivery's older target before classifying its proved append-only movement. Repair that exact
              dependent-refresh discontinuity before completing the criteria walk.

            - `[x]` **6.11.R.x.a Admit append-only target movement during dependent refresh**

                - _Goal:_ Provider-native dependent refresh keeps the selected prefix fixed and rewrites only its
                  dependents while ordinary append-only protected-target movement remains non-blocking.

                - _Outcome:_ GitHub preparation now proves the live target's append-only lineage before accepting
                  its current-trunk projection, while core reservation holds every prefix head and tree fixed and
                  rewrites only dependent refs. Rewritten or ambiguous targets and moved prefixes still refuse.

            - `[x]` **6.11.R.x.b Revalidate the repaired integration and refresh boundary** — validate criteria at
              member scope

                - _Goal:_ Focused and live self-hosting evidence close the Candidate-recovery and dependent-refresh
                  seams without widening the Member 6 criteria walk.

                - _Forward amendment (2026-08-28):_ The repaired live preparation reached structural proof, where
                  the freshly projected target base on the fixed prefix was treated as rewritten member content.
                  Keep that provider metadata in the settlement snapshot without sending the fixed prefix through
                  the dependent-suffix contribution arbiter.

                - `[x]` **6.11.R.x.b.a Confine contribution proof to the rewritten dependent suffix**

                    - _Goal:_ Dependent refresh proves only members strictly above the selected member while still
                      validating and settling the complete provider-observed chain.

                    - Provider-native execution and external adoption now validate the fixed prefix by exact head
                      and tree, exclude its base-only provider projection from contribution proof and ref mutation,
                      and retain the full observation for target, chain, terminal, and state settlement.

                - `[x]` **6.11.R.x.b.b Revalidate the repaired integration and refresh boundary** — validate
                  criteria at member scope

                    - _Goal:_ Focused and live self-hosting evidence closes both repaired seams without another
                      mutation or proof gap.

                    - _Forward amendment (2026-08-28):_ The dependent rewrite published successfully, but terminal
                      settlement treated the ordinary local task-commit head as foreign movement because only an
                      already-published terminal authoring head could enter the refresh reservation. Preserve the
                      local absorption coordinate and its distinct remote publication lease before retrying.

                    - `[x]` **6.11.R.x.b.b.a Preserve local terminal authoring through refresh settlement**

                        - _Goal:_ Execution-mode dependent refresh absorbs onto the exact checked-out append-only
                          terminal authoring head and publishes from the separately recorded remote lease, while
                          public position and ordinary refresh remain exact.

                        - Execution-only observation now retains the exact checked-out terminal head separately from
                          its remote publication lease. Reservation recovery and settlement preserve both, and a
                          built-CLI regression proves the former `top-moved` path through final state adoption.

                    - `[x]` **6.11.R.x.b.b.b Revalidate the complete repaired boundary** — validate criteria at
                      member scope

                        - _Goal:_ Focused and live self-hosting evidence closes Candidate recovery, dependent-prefix
                          proof, and local-terminal settlement without another mutation or recovery gap.

                        - _Outcome:_ Member 6 criteria report.
                            - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                            - _Span:_ retained Member 6 evidence through D5.11; bounded integration and refresh
                              repairs `92b44ef5f`, `931d26355`, `0db1efa59`, and `a98e9c003`; reachability
                              `b333068db` plus the exact current review-fix patch. Boundary-order deviation:
                              registered self-delivery supplied these repairs after the original member boundary.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`;
                              _State:_ `[x]`; _Evidence:_ refresh remains demand-driven, while pending selected
                              topology now blocks competing scopes instead of creating a target-movement trigger.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`;
                              _State:_ `[~]`; _Evidence:_ D5.9 still supersedes only external-only invocation;
                              exact dependent adoption remains available and unscoped adoption cannot bypass it.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`;
                              _State:_ `[x]`; _Evidence:_ native landing still proves every rewritten remaining
                              member, and the new guard admits no alternate pending-correction mutation path.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`;
                              _State:_ `[x]`; _Evidence:_ canonical remaining-chain selection and exact semantic
                              no-effect fallback are unchanged.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`;
                              _State:_ `[x]`; _Evidence:_ non-terminal registration, top filtering, and singleton
                              degradation are unchanged.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`;
                              _State:_ `[x]`; _Evidence:_ opt-in disclosure and host-silent decline are unchanged.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`;
                              _State:_ `[x]`; _Evidence:_ provider execution accepts dependent scope only for the
                              state-derived pending member, refuses complete-remainder relabeling, and leaves
                              reserved recovery unchanged; exact publication and settlement remain intact.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`;
                              _State:_ `[x]`; _Evidence:_ public planning, execution, and adoption reject a wrong
                              scope from canonical state before provider observation; callers still supply only
                              locators and typed scope.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`;
                              _State:_ `[x]`; _Evidence:_ the shared exact-topology predicate preserves selected
                              publication lineage, dependent-only preparation, empty-suffix settlement, and bounded
                              diagnostics.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`;
                              _State:_ `[x]`; _Evidence:_ no omitted or complete-remainder scope can erase the owed
                              selected-member continuation; exact acknowledgment and all pending barriers remain
                              unchanged.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 11`;
                              _State:_ `[x]`; _Evidence:_ exact conflict consent and the plan-ordered changed-member
                              verification set remain scoped to dependent adoption; generic adoption now refuses
                              before observation or mutation.
                            - _Adversarial companion:_ Heavy pass one found caller-selected dependent refresh without
                              a proved correction; pass two found complete-remainder and unscoped-adoption relabeling.
                              Both source-confirmed supported-path findings were repaired. The primary post-settle
                              reread found no residual at the two-pass cap.
                            - _Summary:_ ten met, one intentionally superseded, zero unresolved. Success Criteria
                              markers remain unchanged for terminal verification.

        - _Forward amendment (2026-08-28):_ Repeating the selected-member correction after an earlier
          contribution-equivalent suffix adoption demonstrated that the recorded predecessor was no longer in the
          first dependent's ancestry. The adapter seeded that stale coordinate, so the official provider could not
          derive its fork point and refused before reservation or canonical mutation.

        - `[x]` **6.11.R.y Recover the exact fork boundary for repeated dependent refresh**

            - _Goal:_ A repeated registered correction refreshes the dependent suffix through the official provider
              after prior contribution-equivalent adoption, without weakening fixed-prefix or structural proof.

            - _Outcome:_ Isolated preparation retains a contained recorded predecessor or seeds one unique derived
              fork boundary, with closed actionable refusals before provider invocation when no unique boundary
              exists. Real-Git coverage reproduces the repeated-correction history through the preparation seam.

        - `[x]` **6.11.R.z Revalidate the repeated-refresh boundary** — validate criteria at member scope

            - _Goal:_ Focused adapter, real-Git, and live self-hosting evidence close the repeated-refresh seam over
              the amended Member 6 criteria without another broad verification cycle.

            - _Forward amendment (2026-08-28):_ Live preparation recovered the exact fork and completed the official
              provider rewrite, but structural proof still used the stale logical predecessor. It therefore
              misattributed the earlier selected-member manifest delta to Member 2 and reported a false contribution
              conflict before reservation.

            - `[x]` **6.11.R.z.a Bound repeated-refresh proof to the recovered physical fork**

                - _Goal:_ The repeated provider result proves each dependent's own physical contribution without
                  weakening the ordinary explicit-predecessor arbiter or trusting provider-authored lineage.

                - _Outcome:_ Git-backed provider-refresh proof validates the recorded endpoints, retains a contained
                  predecessor, or independently derives one unique physical fork before invoking the unchanged D4
                  arbiter. Real-Git coverage reproduces the false conflict, and missing or multiple forks refuse.

            - _Forward amendment (2026-08-28):_ The repaired live proof reached reservation, where an already-pushed
              reopen commit lay strictly between the bound terminal head and the new local task commit. Observation
              had proved both append-only edges, but reservation accepted the remote publication lease only when it
              equaled one endpoint and therefore refused the normal repeated-execution shape.

            - `[x]` **6.11.R.z.b Preserve an intermediate terminal publication lease**

                - _Goal:_ Repeated execution retains the exact proved remote lease between bound and local terminal
                  heads through reservation, recovery, absorption, and publication without a pre-settlement rebind.

                - _Outcome:_ Reservation now retains the observer-proved intermediate publication lease instead of
                  requiring an endpoint alias; crash recovery and terminal publication reuse that exact lease while
                  the bound and local terminal coordinates remain unchanged.

            - `[x]` **6.11.R.z.c Revalidate the complete repeated-refresh boundary** — validate criteria at member
              scope

                - _Goal:_ Focused proof and live self-hosting evidence close the repeated-refresh criterion without
                  another broad verification cycle.

                - _Forward amendment (2026-08-29):_ Live settlement exposed two supported-path defects after member
                  publication: terminal readiness was checked only after reservation and remote effects, with a
                  context-free retained-operation refusal, and repeated absorption used Git's incidental historical
                  merge base instead of the reservation's logical prior predecessor. Repair both before completing
                  the bounded criteria walk.

                - `[x]` **6.11.R.z.c.a Guard terminal readiness and retained-operation recovery**

                    - _Goal:_ Fresh refresh entry refuses an unready terminal locus before durable or canonical
                      effects, and every later block identifies the retained operation and typed recovery action.

                    - Provider-native and external entry now share an exact clean-top preflight before reservation;
                      provider-private candidates are reaped on refusal. Post-reservation provider blocks carry the
                      retained operation ID, reconciliation action, and actionable guidance.

                - `[x]` **6.11.R.z.c.b Absorb the repeated predecessor from the recorded logical base**

                    - _Goal:_ Repeated settlement carries the refreshed contribution into the terminal residual
                      without replaying contribution-equivalent suffix history or weakening genuine conflict
                      handling and exact two-parent ancestry.

                    - Terminal absorption now performs the genuine three-way merge from the reservation's prior
                      highest member, creates the exact top-plus-refreshed-highest parent pair, and recovers both the
                      prior merge-state boundary and an exactly prepared tree interrupted before its branch CAS.

                - `[x]` **6.11.R.z.c.c Revalidate the complete repeated-refresh boundary** — validate criteria at
                  member scope

                    - _Goal:_ Focused proof, recovery, and live self-hosting evidence close criterion 38 without
                      another broad verification cycle.

                    - _Forward amendment (2026-08-29):_ The retained-operation retry reached the strict command
                      boundary, but the handler rejected the newly actionable block as `invalid-service-result`
                      because its public result contract had not evolved with the domain result. Preserve that exact
                      recovery arm, make future contract mismatches actionable without emitting unvalidated data,
                      and cover production composition at the strict boundary before retrying live settlement.

                    - `[x]` **6.11.R.z.c.c.a Preserve actionable retained-operation command output**

                        - _Goal:_ The strict CLI envelope publishes the retained operation and recovery action, while
                          focused contract coverage catches future domain/envelope drift and runtime refusal reports
                          a bounded actionable diagnostic.

                        - _Forward amendment (2026-08-29):_ Live reconciliation proved that a retained terminal
                          content conflict cannot progress by replaying its unchanged refresh selector. Distinguish
                          that result as an attended-resolution action with exact paths before reconciliation.

                        - _Outcome:_ Strict command output now preserves both retained-operation actions, reports
                          unknown domain results through a bounded refusal, and routes terminal content conflicts by
                          exact paths through attended resolution before reconciliation and selector retry.

                    - `[x]` **6.11.R.z.c.c.b Revalidate the complete repeated-refresh boundary** — validate criteria
                      at member scope

                        - _Goal:_ The packaged CLI settles the retained operation end to end, and the bounded Member
                          6 criteria walk closes criterion 38 over the resulting exact chain.

                        - _Outcome:_ Delivery correction and Member 6 criteria reports.
                            - _Review-fix criteria slice:_
                              `Success Criteria > Member 1 — member-boundary-verification`.
                            - _Review-fix span:_ bounded diff
                              `0b8e872852ae7cde576fa7ada751f569740f46e8d..6d0e1c377e3091183598ea80f3f3048df51b77b6`;
                              reachability `6d0e1c377e3091183598ea80f3f3048df51b77b6`. Boundary-order deviation: the
                              registered review-fix commits follow the original Member 1 boundary; this walk binds
                              the exact current member head without attributing later delivery work to its diff.
                            - _Review-fix criterion:_
                              `Success Criteria > Member 1 — member-boundary-verification > 1`; _State:_ `[~]`;
                              _Evidence:_ D7.2b intentionally supersedes the implementation-task workaround while
                              retaining member cadence, assignment, criteria slices, fire-points, and the sole
                              terminal work-unit verifier.
                            - _Review-fix criterion:_
                              `Success Criteria > Member 1 — member-boundary-verification > 2`; _State:_ `[x]`;
                              _Evidence:_ the exact member tree carries scoped verification roles through task
                              inventory, coverage, schemas, planning, composition, handlers, and regenerated state;
                              its manifest fingerprint `01ca2133f67220526dbc361ee0d2fb85282b4fe94ed04799c0d1ae32e3a9f0ef`
                              matches the selected `validate-criteria.md` bytes, and the retained 98-test focused
                              role/scope run passed.
                            - _Review-fix summary:_ one met, one intentionally superseded, zero unresolved.
                            - _Member criteria slice:_
                              `Success Criteria > Member 6 — refresh-and-native-landing`.
                            - _Member span:_ retained reports through Task 6.11.R.x.b.b.b plus repeated-refresh
                              commits `8883dcc1d13fa58e4e823868d5ade72098c5b822`,
                              `034362a7d6def0ba7594d556ca1a888790bd6734`, `ab6813683`, and
                              `ca8dc2ef36e9a82a60e39e843db6155570a974c2`; reachability
                              `ca8dc2ef36e9a82a60e39e843db6155570a974c2`. Boundary-order deviation: registered
                              self-delivery supplied these supported-path repairs after the original Member 6
                              boundary; the exact commits and live absorption boundary are inspected without
                              attributing unrelated second-parent review changes to Member 6.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`;
                              _State:_ `[x]`; _Evidence:_ refresh remains refusal- or operator-triggered, so
                              unrelated append-only target movement stays advisory and creates no delivery freeze.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`;
                              _State:_ `[~]`; _Evidence:_ D5.9 still supersedes only external-only invocation;
                              attended external observation and exact reserved adoption remain executable.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`;
                              _State:_ `[x]`; _Evidence:_ native settlement still reconciles and structurally proves
                              every rewritten remaining member before admitting its new coordinate.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`;
                              _State:_ `[x]`; _Evidence:_ canonical plan/state selects the current non-terminal
                              remainder, and exact semantic no-effect retains its distinct return to native
                              selection rather than authorizing stale-suffix refresh.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`;
                              _State:_ `[x]`; _Evidence:_ registration remains exactly non-terminal, filters the
                              dependent top, and degrades a singleton registered remainder to the host-silent
                              unlinked route.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`;
                              _State:_ `[x]`; _Evidence:_ native-link still discloses review invalidation before
                              opt-in, while decline remains an accepted zero-host-call result.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`;
                              _State:_ `[x]`; _Evidence:_ provider preparation, exact reservation, bottom-up
                              publication, contiguous-prefix recovery, terminal settlement, cleanup, attended
                              fallback, and provider neutrality remain intact; repeated execution now derives the
                              unique physical fork and preserves its exact terminal publication lease.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`;
                              _State:_ `[x]`; _Evidence:_ public entry, position, refresh, and correction commands
                              continue to compose facts from canonical plan/state and locators; retained-operation
                              blocks now survive the strict envelope with typed actions and bounded mismatch detail.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`;
                              _State:_ `[x]`; _Evidence:_ chain-current selected publication, empty-dependent
                              settlement, bounded provider diagnostics, and exact terminal publication ancestry
                              remain preserved across the repeated-refresh path.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`;
                              _State:_ `[x]`; _Evidence:_ settlement response loss still replays the exact selected
                              member verification without another provider effect, and exact acknowledgment plus
                              every pending-verification mutation barrier remain unchanged.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 11`;
                              _State:_ `[x]`; _Evidence:_ attended adoption still accepts only the exact freshly
                              reobserved conflict set, preserves proof for unconflicted members, and carries every
                              changed dependent through the ordered verification continuation.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 12`;
                              _State:_ `[x]`; _Evidence:_ isolated preparation and independent D4 proof retain a
                              contained predecessor or require one unique derived physical fork; missing or
                              ambiguous forks refuse before provider or canonical mutation.
                            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 13`;
                              _State:_ `[x]`; _Evidence:_ provider and external entry preflight the exact clean,
                              checked-out terminal head before reservation; retained blocks identify their
                              operation and either reconciliation or attended conflict resolution. Absorption uses
                              the reserved prior highest member as `merge-tree --merge-base`, creates the exact
                              prior-top/refreshed-highest parent pair, and recovers an interrupted prepared tree.
                              Live settlement produced `f9647cd679225b496bb3441494a271dabd8fa8f4` with parents
                              `034362a7d6def0ba7594d556ca1a888790bd6734` and
                              `59bd93151dd81b2af788674507036e4abe14a362`, tree
                              `25a818e8006545097d030554bd8f1557cd2d3885`, and that exact remote head.
                            - _Member summary:_ twelve met, one intentionally superseded, zero unresolved. The full
                              Tier 2 suite and exact live delivery re-entry confirm settlement cleared the operation
                              into the retained Member 1 verification continuation without repeating provider
                              mutation. Success Criteria markers remain unchanged for terminal verification; the
                              prior explicit direction against another broad cycle discharged the companion offer.
                            - _External-adoption continuation:_ the retained thirteen-locus report was resolved
                              against rewritten Member 6 diff `fcbc5060c..8cf0bcbb0` and reachability `8cf0bcbb0`.
                              The approved overlap is confined to criterion 11's exact conflict-consent path; its
                              union matches the originating top, adoption preserved the other twelve dispositions,
                              and 28 focused materialization, containment, suffix, and lifecycle tests passed. The
                              Heavy companion had already converged at its two-pass cap, so no adversarial pass or
                              broader verification cycle was reopened.

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
    - _Span:_ bounded diff `341b832e2..9a202d045`; cumulative reachability `9a202d045` at tree `5a97f8583`.
      Boundary-order deviation: the Owner-terminus corrections were projected into Member 7 after its original
      boundary. Exact two-parent terminal absorption `527998ccf` at tree `ce42d9358` retains originating top
      `878e71bf1` while supplying corrected Member 7, so active WU artifacts remain outside the bounded member diff.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _Criterion digest:_
      `sha256:44218da267415d541532b9a18ec7279d88418b22d048ce5b548ef029cb1b11ad`; _State:_ `[x]`;
      _Evidence:_ production status offers exact-current-head Owner termination on the first outstanding member,
      and acceptance records only that member's boundary terminus. A newly committed boundary re-enters through the
      selector-free correction driver, which performs any owed terminal rebind before returning the next retained
      member. Candidate and review-operation snapshots remain unchanged, so conjunction order and provider evidence
      are not replaced by the terminal decision.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _Criterion digest:_
      `sha256:885873d1d7d13a01106c5ae4586bec158cff2f3a94ec255a7f476d4d3c039ec6`; _State:_ `[x]`;
      _Evidence:_ accepting the exact terminus suppresses historical replay without classifying any residual as
      covered or invoking another review. Declining it preserves the existing applicability action; zero-pass and
      incremental-only histories receive no offer. The contribution arbiter and path-based proof are unchanged.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _Criterion digest:_
      `sha256:209edac1da9cbaba26c40b757e62f55960880e62947ba1a3e37abf928f7d61ea`; _State:_ `[x]`;
      _Evidence:_ the existing applicability result carries its unchanged Candidate selection beside a submit-ready
      exact member terminus action. Both workflow copies present the terminal authority first, while acceptance
      revalidates Candidate, boundary, vehicle, current head, and complete-pass count through the existing verb. Only
      the record-producing arm enters correction rebind; exact replay and stale-offer refusal remain direct status.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _Criterion digest:_
      `sha256:3dbea54c1f0b785f7297ccc7e0cddf16b5b2466e7b3adebb3030f8d24fa9dd65`; _State:_ `[x]`;
      _Evidence:_ the live selector-free correction rebound and published only Member 7, refreshed the terminal top,
      and installed one exact scoped-verification continuation for target `527998ccf` / tree `ce42d9358` without
      replaying whole-WU verification, Frontline, or provider review.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _Criterion digest:_
      `sha256:65eef3825f1d4230c7b06d8491b954a0794149de8691b314d1b9eec36d829c6d`; _State:_ `[x]`;
      _Evidence:_ the resumable driver rebound authoring, published the selected member once, retained the provider
      operation across a dirty-terminal project-gate stop, and resumed to consolidated verification after the
      terminal amendment commit. Targeted Tier 1 then passed on exact tree `ce42d9358`; no orchestration record,
      quality ledger, convergence policy, or generalized control loop was added.
    - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 6`; _Criterion digest:_
      `sha256:7ff005972cd6fd2054df8145446149a6bd9c7c61c131f5fcadf34a79be3ee725`; _State:_ `[x]`;
      _Evidence:_ execution entry selected Member 7 from open Task 7.7, and the correction driver reached publication
      without an ambiguous route. The projected member commit contains only the two Framework workflow copies and
      their contract test; active notes, spec, and tasks remain terminal lifecycle content.
    - _Adversarial companion:_ declined under the Owner's no-further-review direction; the Heavy Member 7 two-pass
      cap is already exhausted.
    - _Summary:_ six met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

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

    - `[x]` **7.7.R.c Restore changed-target settlement for delivery-member findings**

        - _Goal:_ An approved fix to a hosted delivery-member finding resolves the member's current coordinates from
          authoritative delivery state, records the verified changed exact target, and reaches after-fix hosted
          settlement without weakening the pinned-target confirmation used by ordinary member review admission.

        - _Outcome:_ Hosted delivery-member responses retain the exact member vehicle, resolve current coordinates
          from coherent delivery state, append the verified transition monotonically to the approved disposition
          record, and return the exact hosted fix target that both delivery workflows pass unchanged. Production
          handler coverage proves first application and idempotent replay while pinned-target confirmation remains
          unchanged.

    - `[x]` **7.7.R.d Revalidate changed-target member response** — validate criteria at member scope

        - _Goal:_ Re-run `Success Criteria > Member 7 — review-fan-out` over the amended bounded diff and cumulative
          tree, retaining the existing criteria markers and proving the complete findings-fix-settlement path through
          production composition.

        - _Outcome:_ All three Member 7 criteria resolve. The fresh adversarial pass exposed that changed-target
          coverage stopped before settlement; the repaired production lifecycle now consumes the exact returned fix
          target, proves settlement replay, and reaches the complete member conjunction through the existing response
          record and D4 applicability path.

- _Forward amendment (2026-08-29):_ Self-delivery exposed two coupled projection defects after the stack was already
  public: reopening moved the work unit backward and replayed private review, while pre-publication composition
  offered one aggregate Candidate to Frontline despite a canonical Delivery Plan. Reopen this member boundary for
  the delivery-owned correction. Stored `Integrating` remains monotonic, recovery follows only structurally proven
  same-work-unit progress, every private review target is a member, and public correction resumes the existing
  hosted-member conjunction. Generic review progression and source policy remain outside this amendment.

    - `[x]` **7.7.R.e Project corrective work from the durable integration phase**

        - _Goal:_ Session entry selects an open corrective task or applicable verification from canonical task,
          Candidate, delivery-continuation, and integration-boundary facts while stored State and session type remain
          `Integrating`; ordinary public review remains the default when no correction stage is owed.

        - _Outcome:_ Session entry now derives task work and verification inside the durable integration phase from
          canonical cursor, Candidate, and delivery-continuation facts. The shared load set selects the task slice,
          `process-task-loop`, `verify-work-unit`, or ordinary integration without changing stored State; exact
          repository-relative reads keep linked-WU inspection anchored to its checkout, and the closed envelope
          schema rejects skipped open corrections while preserving planning, execution, and prepublication behavior.

    - `[x]` **7.7.R.f Recover only exact integration-correction progression**

        - _Goal:_ Compaction recovery admits the same derived correction stage as ordinary entry and explains only
          exact same-checkout, same-work-unit stage changes whose prior cursor closure and new canonical cursor are
          structurally proven; deletion, substitution, reverse movement, and cross-locus drift still stop.

        - _Outcome:_ Recovery admits only the closed public-to-task, task-to-task, task-to-verification, and
          verification-to-public correction matrix from coupled checkout, work-unit, load-set, boundary, and task
          evidence. The original public-seed incident and every destructive, reverse, or cross-locus shape refuse.

    - `[x]` **7.7.R.g Compose exact pre-binding delivery-member review targets**

        - _Goal:_ A canonical plan derives its ordered private targets from plan-owned candidate refs and gate
          checkouts closed through fresh delivery eligibility and materialization, including the originating top for
          the terminal member; any missing, dirty, moved, or incoherent member refuses with no aggregate fallback.

        - _Outcome:_ Private review composition now closes every plan-derived candidate ref and detached gate through
          fresh eligibility, then materializes exact plan-order target and delivery-member vehicle bindings with the
          originating top as the terminal head. True plan absence alone permits singleton routing; bound delivery or
          missing, dirty, moved, reordered, incoherent, or mismatched evidence refuses without an aggregate target.

    - `[x]` **7.7.R.h Progress initial Frontline review member by member**

        - _Goal:_ The pre-publication procedure applies the unchanged Frontline policy driver to the first
          outstanding exact member in plan order, recomposes after each result, and never invokes Frontline on the
          whole Candidate or persists a parallel target/progress ledger.

        - _Outcome:_ Pre-publication now prepares fresh plan-owned private candidates and gates, selects the first
          outstanding exact member through existing head-keyed lane progress and the unchanged policy driver, and
          recomposes after every result without aggregate fallback, delivery-side review state, or prose iteration;
          one-pass ceiling approval stays bound to its exact member through fallback and cannot cross into the next.

    - `[x]` **7.7.R.i Resume public hosted-member review without private-lane replay**

        - _Goal:_ A bound public correction bypasses Frontline and generic prepublication, then resumes the existing
          retained hosted-member target/discharge conjunction at the exact affected heads through typed integration
          status actions.

        - _Outcome:_ Published delivery reservations now project a typed hosted-review continuation that enters exact
          retained-member status directly, rejects reservation/action mismatches, and re-enters status after each
          result without replaying private policy. The singleton prepublication path remains unchanged.

    - `[x]` **7.7.R.j Refuse ordinary reopen for a coherently bound delivery**

        - _Goal:_ `arc reopen` establishes exact delivery composition before any host or lifecycle mutation and
          refuses a coherent bound stack; absent/unbound singleton work retains the existing withdrawal path, while
          unavailable or incoherent delivery evidence fails closed.

        - _Outcome:_ Ordinary reopen now composes rename-aware plan, canonical task-list, authoring, and revisioned
          state evidence before host observation or lifecycle execution. Determinate absence and coherent unbound plans
          retain withdrawal; bound, unavailable, and incoherent composition refuses without GitHub or lifecycle mutation.

    - `[x]` **7.7.R.k Persist and recover public Candidate renewal**

        - _Goal:_ Corrective attestation preserves `Integrating` and version-writes one exact public member-review
          continuation bound to current Candidate, plan, state, and member evidence; integration consumes it before
          generic publication/position routing, and every stale or mismatched binding stops.

        - _Outcome:_ Corrective attestation now carries the public delivery reservation onto an exact
          Candidate/plan/state/member continuation, with forward retry when Candidate persistence precedes the boundary
          version write. Integration revalidates the live binding before hosted resumption, while recovery refuses a
          corrective verification return without it and ordinary first-publication routing remains unchanged.

    - `[x]` **7.7.R.l Revalidate the corrected member and restore this WU's public locus** — validate criteria at
      member scope

        - _Goal:_ Executable coverage proves task and verification entry, exact compaction recovery, private
          member-only Frontline, public hosted resumption, Candidate renewal, and pre-mutation reopen refusal. After
          those mechanics pass, normalize this WU once to `Integrating` and resume its published member reviews.

        - _Forward amendment (2026-08-29):_ The maintainer authorized advancing the one-time normalization after the
          new recovery checks exposed legacy `Active` / `prepare-work-unit` residue that could not seed a valid
          continuation. This task now revalidates the persisted `Integrating` locus and resumes the published member
          reviews; it does not repeat normalization or re-enter private review.

        - _Outcome:_ All three Member 7 criteria resolve over the corrected member and rebound top. The final
          finding-driven correction closes request-time first-outstanding admission through the production handler,
          preserving the existing conjunction, policy driver, applicability authority, and member-only public review
          continuation without replaying Frontline or adding delivery review state.

- _Forward amendment (2026-08-30):_ A production-seam audit replaced the synthetic rehearsal's confidence claim with
  four reachable correction failures: review status checked Candidate authority at the historical terminal head,
  same-Candidate continuation drift could not repair forward, incremental member requests could not pass canonical
  admission, and a completed incremental attempt blocked the still-unsettled standard lane. Reopen Member 7 once for
  the complete reachability correction; source policy, review obligation, and member ordering remain unchanged.

    - `[x]` **7.7.R.m Restore corrective hosted-member reachability through production admission**

        - _Goal:_ A renewed Candidate remains authoritative at the originating WU head while exact member targets
          retain their immutable historical heads; status validates the persisted continuation against current
          plan/state revision and member evidence, same-Candidate stale continuation refresh repairs forward through
          versioned boundary storage, and an explicitly incremental first-outstanding request is emitted and admitted
          without settling or blocking the required complete standard lane.

        - _Outcome:_ Corrective status now authenticates the renewed Candidate at the originating head and validates
          the exact persisted plan/state/member continuation before member projection. Same-Candidate retries refresh
          that continuation through versioned boundary writes, explicit coverage survives canonical request
          admission, and incremental results leave the complete first-outstanding lane executable.

    - `[x]` **7.7.R.n Revalidate Member 7 with a Git-backed corrective transition rehearsal** — validate criteria at
      member scope

        - _Goal:_ Replace mocked shape confidence with repository-backed evidence over real commits, refs, versioned
          plan/state/Candidate/boundary stores, production status and hosted admission handlers, interruption retry,
          first-outstanding ordering, incremental non-settlement, and terminal conjunction; external provider effects
          alone remain adapter-bound.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ original bounded diff `bb7e093c2..8106628b1` plus corrective tree delta
              `8106628b1^{tree}..2f9822d92`; cumulative reachability `2f9822d92`. The retained boundary-order
              deviation remains unchanged; the correction introduces no terminal-member content.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`;
              _Evidence:_ the eight-member Git-backed rehearsal publishes real member refs and requests, persists
              plan, state, Candidate, boundary, and lane records through repository stores, advances exactly one
              retained member at a time, and settles only after all eight exact bindings discharge.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`;
              _Evidence:_ prior exact contribution-applicability evidence remains reachable and unchanged. The
              correction proves an effective incremental result stays non-settling and status immediately returns
              the same member's required complete lane; no new review authority, attempt family, or equivalence
              projection is introduced.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`;
              _Evidence:_ production status validates current continuation evidence, emits the exact first-outstanding
              action with requested coverage, and production request admission recomposes and compares that action
              before provider access. Real-store coverage proves renewed-Candidate entry, stale-state refusal,
              later-member refusal, exact admission, await persistence, ordered progression, and terminal conjunction.

- _Forward amendment (2026-08-30):_ Live selected-member publication advanced canonical delivery state before its
  dependent refresh, correctly invalidating the public continuation but making session-init and compaction recovery
  unresolved before the existing Candidate-renewal route could run. Reopen Member 7 for this exact continuation
  projection gap; no lifecycle state, verification replay, review authority, or general recovery tolerance enters.

    - `[x]` **7.7.R.o Renew stale public continuation inside integration**

        - _Goal:_ When the canonical task list is closed and the exact current Candidate retains the public delivery
          reservation, a typed older delivery-state continuation selects Candidate renewal inside the existing
          integration workflow. Attestation remains the sole versioned refresher; verification does not reopen, and
          every other Candidate, plan, boundary, reservation, subject, or state mismatch stays unresolved.

        - _Outcome:_ Delivery entry now distinguishes one exact forward-stale public continuation from every other
          mismatch and emits `candidate-renewal-required` with the ordinary attestation action. The session projector
          keeps that result in `integrate-work-unit`; it never selects verification closeout. Both shipped workflow
          copies invoke the typed action unchanged, require `unchanged`, and reinspect before hosted review. Unit,
          workflow-contract, type, lint, and live state-130 evidence prove the route without new persisted state. A
          clean post-commit probe also proved that a genuinely non-current Candidate must bypass delivery mismatch
          refusal and project the existing verification closeout; the typed companion route now does so without
          synthesizing attestation or review authority.

    - `[x]` **7.7.R.p Revalidate Member 7 continuation re-entry** — validate criteria at member scope

        - _Goal:_ Re-run `Success Criteria > Member 7 — review-fan-out` over the bounded projector correction and
          cumulative tree, retaining the existing markers and proving stale-state renewal reaches exact hosted-member
          resumption without replaying verification, Frontline, or generic prepublication.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ retained report through Task 7.7.R.n plus the exact Task 7.7.R.o projector, entry-inspection,
              workflow, and regression patch over `b17f21925`; reachability is the complete current tree. The prior
              boundary-order deviation remains unchanged.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ canonical
              delivery state still owns first-outstanding selection and the retained conjunction. The renewal route
              writes no review result and reaches the same hosted-review action only after exact boundary refresh.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ no
              applicability, equivalence, attempt, or discharge authority changed; stale continuation is never
              accepted as review authority and every non-forward or mismatched binding still refuses.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ live
              delivery progression advanced the state from revision 127 through adopted suffix verification to 130,
              session-init remained resolved in `Integrating`, entry inspection emitted the exact attestation action,
              attestation returned `unchanged` with a state-130 continuation, and reinspection returned
              `continue-hosted-review` without Frontline, prepublication, or verification dispatch.
            - _Adversarial companion:_ the Heavy-class Member 7 companion already consumed its two-pass cap; this
              bounded re-entry proof adds no third pass and the primary walk retains judgment over the correction.
            - _Summary:_ three met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

- _Forward amendment (2026-08-31):_ Live Member 1 correction verification cleared its typed delivery continuation,
  but the corrected top made the Candidate genuinely non-current. Entry therefore routed the already verified
  member delta into whole-work-unit verification and compaction recovery followed it, losing the retained hosted
  review position. Reopen Member 7 for the missing scoped-verification-to-Candidate bridge; preserve the existing
  Candidate lineage, fixed-origin ownership, durable `Integrating` lifecycle, and exact public reservation.

    - `[x]` **7.7.R.q Advance the Candidate through acknowledged scoped correction verification**

        - _Goal:_ A completed delivery correction records its exact scoped verification on the existing Candidate
          before clearing the pending delivery continuation, survives interruption on either side of that state
          clear, and returns the ordinary public-continuation renewal action without replaying whole-WU verification,
          Frontline, or generic prepublication.

        - _Outcome:_ Candidate acknowledgment now version-writes and stages one exact scoped verification response
          before clearing the pending state, recognizes matching replay on either side of that clear, and returns the
          ordinary attestation action. Registered refresh, unregistered rematerialization, and terminal correction
          share one pending continuation and acknowledgment locator; exact target, ownership, state, evidence, and
          replay mismatches fail closed without changing lifecycle or review policy.

    - `[x]` **7.7.R.r Revalidate Member 7 scoped correction recovery** — validate criteria at member scope

        - _Goal:_ Prove through production handlers and Git-backed stores that interruption before or after the
          state clear converges, ordinary attestation returns `unchanged`, fresh entry resumes the exact retained
          hosted member, and session-init/compaction projection remains `Integrating` without borrowing authority
          from review-signal convergence.

        - _Forward amendment (2026-08-31):_ Self-delivery proved that the correction path remained too expensive and
          that cursorless recovery mapped pending scoped verification onto terminal whole-work-unit verification.
          Close the current criterion through one typed, resumable correction procedure; automatically absorb only
          a structurally contained predecessor; and reuse Tier 1 only over an exact already-green rebound tree. This
          pulls forward the delivery-specific usability floor while leaving generalized workflow composition,
          review convergence, and gate-evidence architecture with their existing owners.

        - `[x]` **7.7.R.r.a Keep scoped correction closeout out of terminal verification**

            - Cursorless correction closeout now projects `delivery-correction` inside `Integrating`, loads the
              integration workflow, and admits recovery's exact `task-to-continuation` transition only when the
              closed cursor, pending scoped verification, checkout, work unit, and load-set progression all match.

        - `[x]` **7.7.R.r.b Compose one resumable review-fix continuation**

            - `arc delivery review-fix continue` derives the current member and next exact action from the active
              cursor, plan, State, operation, Candidate, and public boundary. It emits strict dispatch or existing
              authority leaves without accepting caller-authored member, operation, revision, or digest selectors.

        - `[x]` **7.7.R.r.c Absorb already-contained predecessor movement mechanically**

            - Fresh Git tree-entry comparison now proves every refreshed-predecessor change is already present in a
              clean top before creating an exact two-parent commit that retains the top tree. Unavailable or
              divergent proof continues through the existing content-merge and attended-conflict path.

        - `[x]` **7.7.R.r.d Bind Tier 1 reuse to the exact rebound tree**

            - Scoped verification now names the exact terminal head and tree and exposes only rerun or unchanged-input
              exact-tree reuse. Acknowledgment revalidates that target and refuses any tree mismatch without adding a
              delivery-owned gate record or quality authority.

        - `[x]` **7.7.R.r.e Revalidate and dogfood the Member 7 continuation** — validate criteria at member scope

            - Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded member diff `bb7e093c2..8106628b1`; cumulative implementation reachability is
                  `26158c88e02e9fc4102f8211bd982adf5c8bb24c` plus exact worktree tree
                  `a5cefaf8df4aff00dcdbfec30c0232db943ef430`. Boundary-order deviation: the approved Member 7 correction
                  sequence through Task 7.7.R.r supplies the later dependency; no terminal-member content enters the
                  bounded member diff.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
                  Git-backed eight-member lifecycle still derives every exact retained target, advances only the
                  first outstanding member, and discharges only at the complete conjunction. Scoped-response recovery
                  returns to that same hosted authority only after Candidate renewal and creates no clearance itself.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  existing contribution-applicability path and single structural arbiter remain authoritative for
                  review preservation. Contained absorption uses fresh tree-entry proof solely to preserve ancestry;
                  unavailable or divergent proof retains the ordinary content-merge path and writes no review state.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ status,
                  request admission, await, settlement, and conjunction retain their exact member/source/pass/ceiling
                  progression. The new controller returns the existing hosted action as an authority boundary and
                  never enumerates members, reconstructs request input, or introduces a review record family.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ all
                  correction settlement arms share the pending scoped-verification projection, exact target, and
                  acknowledgment locator. Production response-loss coverage proves re-entry before clear and, after
                  clear, a current Candidate `verification-response` followed by unchanged renewal and exact hosted
                  resumption without mutation replay or whole-work-unit/private-review routing.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
                  selector-free controller composes deterministic correction steps from canonical records, scoped
                  closeout and compaction recovery remain in delivery integration, contained movement alone receives
                  content-neutral absorption, and Tier 1 reuse is schema- and handler-bound to the exact rebound tree.
                  No orchestration record, gate ledger, generic workflow engine, or convergence policy was added.
                - _Adversarial companion:_ the Heavy-class Member 7 companion already consumed its two-pass cap; this
                  bounded correction receives no third pass, and the primary walk retains judgment over all findings.
                - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

        - _Outcome:_ Scoped correction closeout now stays inside durable integration and resumes through one
          selector-free controller. Exact structural containment and exact-tree gate reuse narrow the automatic
          branches, while production response-loss coverage closes acknowledgment through unchanged Candidate renewal
          and retained hosted-member re-entry without new orchestration, review, quality, or convergence authority.

- _Forward amendment (2026-08-31):_ Live supplemental review proved that the public member cursor omitted an exact
  incremental attempt from its factual history, and the same status surface could not carry the standard driver's
  existing invocation-scoped source selection. Reopen Member 7 for this status-composition correction only. Complete
  pass accounting, source ordering, discharge, ceiling policy, and the default configured source remain unchanged.

    - `[x]` **7.7.R.s Retain supplemental progress and explicit per-pass source choice**

        - _Goal:_ Work-unit review status reports every identity-qualified member attempt without letting incremental
          coverage consume or steer the required complete lane, and one explicit invocation may select a configured
          standard source through the existing policy driver without persisting that choice into later passes or
          members.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ original bounded member diff `bb7e093c2..8106628b1`; cumulative correction reachability is
              terminal head `3bcb3c86889a0129fcda35d9c393cc01f6822722` at exact scoped-verification target tree
              `86bc3a81fbf800debe25535da102f9db7ff05fd8`. Boundary-order deviation: the approved
              supplemental-progress correction is projected back into Member 7 after publication; no terminal-member
              content enters the bounded member diff.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ every
              exact identity-qualified hosted attempt now appears in the ordered public member history, while the
              existing first-outstanding member selection and complete retained-member conjunction remain the sole
              discharge route. Git-backed production composition proves the supplemental attempt is visible without
              advancing to another member.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ a pure
              incremental attempt remains outside the complete-lane tail and consumes no complete pass, so it cannot
              alter source fallback, discharge, or applicability. The correction changes no contribution comparison,
              Candidate selection, or record family.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ work-unit
              status passes one explicit configured hosted source through the existing policy driver, returns it in
              the exact first-outstanding action, and carries the invocation through request-time canonical
              recomposition. Production admission accepts that exact action; omission immediately returns to the
              configured source, while unconfigured and progress-reversing selections refuse before provider access.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the source
              invocation is carried only in the request envelope and writes no delivery, Candidate, continuation, or
              lane authority. The retained scoped-verification continuation and response-loss recovery paths are
              unchanged and remain covered by the complete repository suite.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ source
              judgment composes through the existing driver and hosted action rather than a delivery selector or new
              procedure branch. Default ordering resumes on the next invocation; no orchestration record, quality
              ledger, workflow engine, convergence policy, or persisted source preference was introduced.
            - _Adversarial companion:_ the Heavy-class Member 7 companion already consumed its two-pass cap; this
              bounded correction adds no third pass, and the primary walk retains judgment over the exact delta.
            - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

- _Forward amendment (2026-08-31):_ An approved hosted delivery-member finding exposed that the review-fix
  controller selected correction ownership only from an open task cursor. Review findings deliberately remain
  review responses rather than task-list work, so the cursorless controller fell through to generic Candidate
  verification despite an exact pending delivery-member authorization. Reopen Member 7 for this authority-composition
  repair only; task-owned conformance correction routing, changed-target response settlement, and ordinary
  no-correction integration remain unchanged.

    - `[x]` **7.7.R.t Derive review-fix ownership from approved review responses**

        - _Goal:_ With no open task, the review-fix controller selects exactly one pending approved delivery-member
          fix response for the active work unit and current plan, validates its member against canonical Delivery
          State, and dispatches the existing member correction procedure. Settled, unrelated, unauthorized, stale,
          malformed, or ambiguous responses never become correction authority; an open conformance task retains the
          existing task-cursor route.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ original bounded member diff `bb7e093c2..8106628b1`; the current correction is the exact
              worktree delta from terminal tree `7b3d3af2521fee16600cb27510104d87f6934480` to implementation tree
              `c6302a049885034a0ade1192e55e0fa56115652b`. Boundary-order deviation: the already-approved Member 1
              verification correction at `ee364c02e` precedes this Member 7 controller repair on the originating
              branch; its content remains outside the Member 7 correction delta.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
              controller now derives one exact pending hosted member response from the Git-common disposition
              snapshot, proves its current plan and state membership, and dispatches the existing member route.
              Settled and unrelated records remain non-authoritative, while ambiguity and stale evidence refuse.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
              correction changes no contribution-applicability, lane, or discharge projection. Existing
              repository-backed changed-target settlement still advances and replays the authorized member response
              at its current hosted head through the same durable record.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ the
              selector-free continuation accepts only repository and remote, derives the reviewed member from
              canonical response authority, and returns the existing typed rematerialization or publication action.
              An open task still takes the prior cursor-owned route, and production E2E coverage proves both paths.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ pending
              scoped verification, acknowledgment, Candidate renewal, and response-loss recovery are unchanged. The
              complete correction and delivery suites retain all three settlement arms without whole-work-unit,
              Frontline, or generic-prepublication fallback.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ one typed
              continuation now composes both legitimate ownership sources: open conformance tasks first, otherwise
              exactly one approved hosted member response. The existing disposition index and Delivery State supply
              authority; no selector input, task manufactured from a finding, record family, ledger, workflow engine,
              quality authority, or convergence policy was added.
            - _Post-publication correction:_ live Member 1 dogfooding proved that selected-member publication advances
              canonical state beyond the response's reviewed head before dependent refresh. Cursorless re-entry now
              retains that response only when the first dependent still names the exact reviewed head and the selected
              member is the sole chain break; arbitrary movement and an already-refreshed chain refuse. The production
              controller and a built-CLI E2E both project the exact dependent-suffix refresh from this state.
            - _Post-renewal correction:_ live response settlement proved that the same pending disposition remains
              intentionally unresolved after the dependent refresh, scoped verification, and Candidate renewal. Once
              the reviewed head is an ancestor of the corrected selected head, the controller now accepts only the
              integration reader's `candidate-renewal-required` or `continue-hosted-review` authority instead of
              replaying correction ownership; non-ancestral movement and every other entry state remain stale.
            - _Adversarial companion:_ the Heavy-class Member 7 companion already consumed its two-pass cap; this
              bounded authority-composition repair adds no third pass, and the primary walk retains judgment over the
              exact delta.
            - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

- _Forward amendment (2026-08-31):_ Six days of self-delivery proved that the selector-free correction projector
  returned correct individual actions but still left the agent to execute the deterministic procedure. Reopen
  Member 7 for one delivery-correction-specific driver that owns those existing actions through the next real
  decision, preserves exact authority across mechanically proved movement, and removes its self-inflicted
  unchanged-Candidate renewal cycle. General workflow composition, convergence policy, storage redesign, and
  user-configurable commit autonomy remain with their recorded owners.

    - `[x]` **7.7.R.u Drive the delivery correction to one typed stop**

        - _Goal:_ One selector-free invocation executes the existing deterministic correction tail, resumes after
          interruption without rederivation, and returns only at the closed judgment, review-spend, conflict,
          destructive, or integration-authority boundaries while disclosing every machine-owned record effect.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31).

        - `[x]` **7.7.R.u.a Execute the six correction dispatch actions in-process**

            - Keep the pure projector as the typed next-step classifier and add one injected, hard-coded action
              executor around the existing services; never spawn the CLI recursively. Compose the complete entry once,
              advance an invocation snapshot from validated results and targeted reads, and stop on a repeated
              action/state/operation/boundary/head progress fingerprint. Build `test-first` through dispatch success,
              idempotent replay, retained-operation resume, no-progress refusal, hosted status re-entry, publication,
              and the closed attended-stop set without a generalized step engine or orchestration record.

        - `[x]` **7.7.R.u.b Make authoring and same-pass batching first-class**

            - Add one read-only authoring-readiness classifier over the existing candidate/top locators and the same
              cleanliness, changed-head, and required-ancestor predicates enforced by publication and
              rematerialization. Return `authoring-required` for terminal and non-terminal routes with the exact locus,
              ancestor requirements, complete approved disposition set, and resume envelope. Defer a stale publish
              action while newer same-member work remains, and require that one disposition set to share one
              publication unless an explicit early-publish reason is supplied.

        - `[x]` **7.7.R.u.c Run record-only commits and pushes with an effect log**

            - Define a closed effect-log union for `dispatch`, `commit`, `push`, `boundary-carry`, and
              `no-op-replay`, then execute boundary-projection commits, applicability selection commits, and the
              post-carry top push as machine-owned correction effects. Reuse the pure release commit/push
              orchestrators so hooks, branch guards, audit attribution, deterministic messages, and Context footers
              remain enforced; capture diagnostics away from JSON stdout. Return exact commits, refs, before/after
              heads, Candidate/state bindings, and replay outcomes in order; preserve approval stops for content,
              destructive, review-spend, and merge effects.

        - `[x]` **7.7.R.u.d Preserve exact authority across mechanical movement**

            - Generalize the retained-response correction to pending review-fix responses only when strict ancestry
              plus the existing Git review-contribution projection proves an empty residual. Preserve an Owner
              applicability selection by composing its immutable exact bound segment with a newly proved mechanical
              segment at the consumer read, never by writing or impersonating a new selection. Return the exact proof
              basis, and retain every existing stale-response or re-selection stop when proof is absent,
              non-ancestral, divergent, interacting, or ambiguous.

        - `[x]` **7.7.R.u.e Remove manufactured renewal and repair the returned contracts**

            - Carry the same-Candidate public boundary directly across acknowledgment's state revision instead of
              dispatching an `attest unchanged` cycle; keep genuine `establish-new-root` as a typed stop. Make every
              action submit-ready, make `idle` honest, return exact conflict preparation coordinates and resume input,
              and prove contribution-equivalent dependents escape redundant criteria walks while changed dependents
              remain owed.

        - `[x]` **7.7.R.u.f Prove and revalidate the driven correction boundary** — validate criteria at member scope

            - The production-style E2E drives approved response ownership through publication, provider refresh,
              verification, acknowledgment, same-Candidate boundary carry, and unresolved hosted settlement. The
              first live drive published Member 7, refreshed the terminal top, and returned one exact verification
              stop without hosted spend; exact-tree Tier 1 passed. Live acknowledgment then exposed that the record-
              effect selector rejected the workflow's correctly staged task closure, so the forward amendment below
              owns final criteria reconciliation and the Member 1 attended acceptance.

        - _Forward amendment (2026-09-01):_ Live acknowledgment proved that machine-owned Candidate/boundary commits
          could not coexist with the staged correction-task closure required by the task workflow. The exact record
          commit already uses path-limited `--only` semantics, so unrelated staged content is safe to leave untouched.
          The resumed acceptance also proved that an older pending verification masked newer exact correction
          authoring. Reopen the rescue only to select exact record paths from a mixed index, supersede stale
          verification through the existing authoring-readiness proof, project both repairs through Member 7, and
          finish the same acceptance; no commit-autonomy, staging-policy, review, or workflow-engine authority is added.

        - `[x]` **7.7.R.u.g Complete staged-closure acceptance and Member 1 re-entry**

            - _Goal:_ Machine-owned record settlement ignores unrelated staged task content while committing only
              exact Candidate and boundary projections, while newer clean correction authoring supersedes an older
              pending verification through the same route and ancestry proof. The driven live correction then reaches
              scoped verification, acknowledgment, boundary carry, and the retained Member 1 review stop with the task
              closure still staged. Re-run the Member 7 criteria walk and reconcile its final two master criteria
              without another hosted pass.

            - _Outcome:_ Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ original bounded member diff `bb7e093c2..8106628b1`; cumulative correction reachability is
                  terminal head `0cf5eeb1582acd936c4400290488d9371cc7eb55` at tree
                  `78a7161f4fd49007311b6cd70155ce7b60d642a3`. Boundary-order deviation: the driven correction rescue is
                  projected back into Member 7 after publication; no terminal-member content enters the bounded diff.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
                  existing ordered member-status and conjunction projection remain the only discharge route. The
                  production-style E2E returns to the retained hosted action only after the exact corrected member is
                  verified, and the live drive spent no hosted pass while replacing the obsolete verification target.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  existing contribution arbiter and Candidate applicability records remain unchanged. Mechanical
                  authority preservation still requires strict ancestry plus an empty contribution residual, while
                  stale-verification supersession requires the existing clean, changed-head, and ancestry readiness
                  proof; unavailable, dirty, unmoved, or divergent authoring retains the prior stop.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ one
                  selector-free request carries repository and remote only; canonical entry, route, state, member,
                  operation, and hosted status facts select every action. The production E2E and live drive both
                  execute publish then refresh without caller-authored member, pass, or continuation coordinates.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the
                  shared persisted continuation and acknowledgment locator still cover registered refresh,
                  rematerialization, and terminal correction. The E2E loses and supersedes one verification response,
                  commits an open correction, stages its closure, then acknowledges only the replacement exact tree
                  before same-Candidate boundary carry and hosted re-entry; all 21 production cases pass.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
                  delivery-specific driver executes only its six closed dispatch kinds plus boundary carry and record
                  settlement, detects repeated canonical progress, and returns typed verification, conflict, hosted,
                  or integration stops with an ordered effect log. A valid response whose contribution changed now
                  yields only to the exact canonical hosted continuation; unavailable, malformed, moving, and
                  non-hosted states still refuse. The extended E2E failed first on the stale refusal and then passed
                  all 21 production cases. The repeated live drive published Member 7 and refreshed the top in one
                  invocation; its rebound tree exactly equals the already-green correction tree, so the typed Tier 1
                  reuse contract applies without a rerun. No orchestration record, quality ledger, generic workflow
                  engine, or convergence policy was added.
                - _Adversarial companion:_ the Heavy-class Member 7 companion already consumed its two-pass cap; this
                  bounded rescue receives no third pass, and the primary walk retains judgment over the exact delta.
                - _Summary:_ five met, zero superseded, zero unresolved. The final two Success Criteria markers are
                  reconciled below.

            - _Forward amendment (2026-09-01):_ The first staged-closure acceptance completed every machine-owned
              effect, then proved that an older response whose contribution is no longer mechanically preservable can
              preempt the canonical `continue-hosted-review` entry with `review-fix-response-stale`. When the exact
              response, operation, member, ancestry, and contribution projection are valid and that projection
              returns its existing `decision-required` authority boundary, yield to the canonical hosted status so it
              returns the exact applicability or finding-response stop. Keep malformed, non-ancestral, unavailable,
              unsupported, moving, ambiguous, and non-hosted re-entry states fail-closed. Extend the production-style
              E2E through this cross-member stale-response case, then repeat only the live post-ack acceptance without
              requesting a hosted pass.

        - _Forward amendment (2026-09-01):_ Live Member 1 re-entry returned one semantic CodeRabbit applicability
          judgment as five serial exact-attempt offers. Preserve the exact Candidate transition contract but compose
          equivalent pending offers into one attended class and settle its individual selections through one record
          write, commit, and push. Review-evidence supersession, convergence, standing grants, and generic workflow
          composition remain with their recorded owners.

        - `[x]` **7.7.R.u.h Aggregate equivalent applicability offers atomically**

            - _Goal:_ Review status returns one attended offer for equivalent retained attempts of the same member,
              source, and current head; one bounded Owner answer atomically records every exact selection in stable
              order; and the correction driver discloses one Candidate commit and push before recomposing. Any stale
              class member or changed source, member, head, or residual writes nothing and remains independently
              attended.

            - Extend the production correction E2E with two equivalent retained attempts and prove one offer, two
              durable exact transitions, and one commit/push effect pair. Retain singleton selection compatibility
              and add no persisted grant, evidence-supersession rule, convergence policy, storage family, or generic
              workflow engine.

            - _Outcome:_ Review discharge now selects the first deterministic equivalence class by member, source,
              current head, and contribution-residual facts while retaining each exact attempt projection. Status
              emits the singleton contract unchanged or one bounded batch offer. Candidate resolution rederives the
              entire batch before one version-checked write, rejects duplicate/conflicting/stale members without a
              partial append, and preserves each existing exact transition. The production correction E2E records
              two retained selections from one answer and then observes exactly one Candidate commit and one push;
              a distinct residual remains outside the class. All 21 delivery-position E2E cases, 82 focused unit
              cases, production/test typechecks, and TypeScript lint pass. No standing grant, supersession,
              convergence, new storage family, or generic workflow control was added.

        - `[x]` **7.7.R.u.i Preserve the exact refresh operation through conflict resume**

            - _Goal:_ A provider-refresh conflict resumed after exact two-parent resolution reuses its persisted
              operation selector and cannot fall into an `operation-mismatch` retry.

            - The two focused cases failed against the prior projector, then passed after the pending-refresh arm
              carried a matching active provider-refresh `operationId` and refused every non-matching operation.
              Initial unreserved refresh remains selector-free and continues to reserve normally.
            - All 59 focused review-fix tests and all 21 production delivery-position E2E cases pass, along with
              production/test typechecks, focused TypeScript and Markdown lint, and all three ARC contract checks.

        - `[x]` **7.7.R.u.j Finish a published member refresh before Candidate verification**

            - _Goal:_ An exact published-member chain break remains the correction driver's next deterministic
              action even when the originating WU checkout has also advanced the terminal Candidate.

            - The focused case failed against the live priority inversion, then passed after Candidate-verification
              entry supplied canonical Delivery State to the projector and a unique chain break composed the exact
              provider-refresh action. Candidate verification remains unchanged when no such break exists.
            - All 60 focused review-fix tests and all 21 production delivery-position E2E cases pass, along with
              production/test typechecks and focused TypeScript lint. The next live Member 7 projection is the
              handler-level acceptance run for the source-checkout movement that exposed the gap.

        - `[x]` **7.7.R.u.k Resume an interrupted published correction without replanning**

            - _Goal:_ A fresh selector-free invocation observes an exact published-member chain break and executes
              its retained provider refresh without returning through correction planning, even when the prior
              driver process ended between those two effects.

            - _Outcome:_ The pure projector and production handler now dispatch the exact pending refresh directly
              from canonical Delivery State after an interrupted publication. Initial correction authoring still
              plans normally, and persisted-operation mismatch guards remain unchanged.

        - `[x]` **7.7.R.u.l Absorb provider history collisions through exact natural-merge semantics**

            - _Goal:_ A provider rebase collision caused only by duplicate branch history does not become an attended
              conflict when the exact logical-base/two-parent merge is clean; a genuine content conflict retains its
              paths and complete preparation coordinates.

            - Build `test-first` through a real-Git provider preparation that collides during history replay, then
              prove the natural merge prepares contribution-equivalent suffix candidates without provider push
              authority. Keep actual merge-tree conflicts as typed stops and preserve ordinary provider success.

            - _Outcome:_ Provider preparation now distinguishes replay-only collisions from semantic conflicts. After
              aborting the provider's retained rebase, it preserves the already refreshed prefix and uses the exact
              recorded logical base to construct clean two-parent suffix absorptions without pushing provider refs.
              A genuine merge-tree conflict is promoted with stable paths and complete resume coordinates. The
              real-Git collision integration, 34 focused unit cases, all 21 production correction E2E cases,
              production/test typechecks, and focused TypeScript lint pass.

        - `[x]` **7.7.R.u.m Resume retained provider operations with one exclusive selector**

            - _Goal:_ A correction retry submits an active provider refresh or adoption by its persisted operation ID
              alone; it never combines that recovery selector with the initial suffix scope and therefore cannot
              reject its own canonical resume as `operation-mismatch`.

            - Strengthen the pure projector cases to require exact submit-ready input for both resume entry shapes,
              preserve initial selector-free scope derivation, and rerun the live retained Member 1 operation.

            - _Outcome:_ Active provider refresh and adoption dispatches now carry only their persisted operation ID;
              initial refreshes still derive the selected suffix through `scope`. The exact-shape projector case
              failed against the combined selectors, then all 42 focused continuation/driver cases and both
              typechecks passed. The live retained operation accepted the exclusive selector, reached its known
              terminal manifest conflict, and applied after the approved exact two-parent resolution.

        - `[x]` **7.7.R.u.n Select only the pending response during correction acknowledgment**

            - _Goal:_ Historical completed responses for the selected delivery member do not make its one current
              pending response ambiguous during scoped verification acknowledgment.

            - _Outcome:_ Acknowledgment now excludes completed historical member responses before enforcing pending
              response uniqueness. The production correction E2E retains both a completed prior response and one
              current pending response, while the existing multiple-pending refusal remains unchanged.

        - `[x]` **7.7.R.u.o Bind acknowledgment evidence to the verified terminal revision**

            - _Goal:_ Newer WU authoring does not block acknowledgment of an already-verified delivery terminal or
              become covered by that older scoped verification.

            - _Outcome:_ Acknowledgment collects Candidate evidence from the exact delivery terminal named by the
              scoped verification, even when the WU checkout has advanced. The newer reviewable delta remains
              outside that evidence and deterministically returns through Candidate verification.

        - `[x]` **7.7.R.u.p Resume a pre-reservation provider conflict from its approved local merge**

            - _Goal:_ An attended provider-history conflict can resume from the exact approved two-parent commit
              without publishing outside the refresh reservation or making the selector-free driver rederive work.

            - _Outcome:_ The driver accepted the approved local resolution only after exact ref, readability,
              ordered-parent, and remote-stasis checks, then the ordinary refresh reservation lease-published the
              resolved Member 4 and its dependents. Delivery State revision 223 has no active operation and retains
              one exact scoped-verification continuation for Members 3–7 at terminal head `ec6eea08f` and tree
              `417b50d04`. The five continuation-selected criteria reports resolve as follows.

                - _Criteria slice:_ `Success Criteria > Member 3 — review-gate-resolution`.
                - _Span:_ bounded diff `e6319fb94..7f10d5d2d`; cumulative reachability `7f10d5d2d` at tree
                  `02bf93f0a`. Boundary-order deviation: the approved Member 3 review correction and later Task
                  7.7.R.u.p settlement are inspected through the current terminal tree `417b50d04`.
                - _Criterion:_ `Success Criteria > Member 3 — review-gate-resolution > 1`; _State:_ `[x]`;
                  _Evidence:_ reverse lookup now resolves one current plan, validates the bound state against that
                  plan before deriving a member, and refuses absent, duplicated, stale-revision, or reordered plan
                  evidence. Status and integration discharge share the same coherent lookup, while member and gate
                  checkouts remain operation inputs rather than session loci.

                - _Criteria slice:_ `Success Criteria > Member 4 — topology-transition`.
                - _Span:_ bounded diff `7f10d5d2d..8c636f511`; cumulative reachability `8c636f511` at tree
                  `65d44651e`. Boundary-order deviation: the post-publication correction is carried by the exact
                  two-parent absorption of prior Member 4 `57ccba1d5` and corrected predecessor `7f10d5d2d`.
                - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 1`; _State:_ `[x]`;
                  _Evidence:_ the canonical state still binds the originating branch as the terminal top and one
                  connected member chain. The resumed correction published no control branch or disconnected
                  request; Member 4's approved natural merge records the old member first and refreshed predecessor
                  second without changing the terminal presentation or adoption contracts.

                - _Criteria slice:_ `Success Criteria > Member 5 — terminal-integration`.
                - _Span:_ bounded diff `8c636f511..60c603b93`; cumulative reachability `60c603b93` at tree
                  `371c9fe19`. Boundary-order deviation: the refreshed topology predecessor is absorbed by the exact
                  two-parent Member 5 commit over prior head `b7cdfdf20`.
                - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 1`; _State:_ `[x]`;
                  _Evidence:_ checkpoint composition still enters the ordinary integration spine and now supplies
                  the production delivery host when deriving the complete retained review conjunction.
                - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 2`; _State:_ `[x]`;
                  _Evidence:_ the correction leaves teardown, retained bindings, host retarget observation, and the
                  explicit failure-only top-remedy route untouched; current state retains every request binding.
                - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 3`; _State:_ `[x]`;
                  _Evidence:_ no base-reconcile or Candidate-applicability contract changed. The correction is bound
                  instead to the exact scoped target and pending continuation, so it cannot authorize terminal
                  integration or substitute whole-work-unit verification.
                - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 4`; _State:_ `[x]`;
                  _Evidence:_ the retained provider operation resumed by its exclusive operation selector, settled
                  to `activeOperation: null`, and re-entered through the unchanged informative continuation rather
                  than reconstructing a reservation subject.

                - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
                - _Span:_ bounded diff `60c603b93..3490d939a`; cumulative reachability `3490d939a` at tree
                  `a73338aa6`. Boundary-order deviation: the terminal predecessor refresh is absorbed by the exact
                  two-parent Member 6 commit over prior head `d2e29cea9`.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`; _State:_ `[x]`;
                  _Evidence:_ protected-target movement remains observation input only; the live correction was
                  selected by an owed dependent refresh, not by unrelated movement of `main`.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`; _State:_ `[~]`;
                  _Evidence:_ the recorded D5.9 supersession remains authoritative; external adoption is still an
                  attended fallback and was not used to grant the live provider publication.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`; _State:_ `[x]`;
                  _Evidence:_ the correction leaves native landing's full-suffix structural reconciliation intact;
                  every refreshed dependent entered the verification selector instead of receiving clearance.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`; _State:_ `[x]`;
                  _Evidence:_ no native selection or semantic stacked-refusal route changed; the active provider
                  refresh followed its retained rewrite operation and never became a landing authorization.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`; _State:_ `[x]`;
                  _Evidence:_ registration remains scoped to the seven non-terminal members and the originating top
                  remains outside provider registration and rewrite authority.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`; _State:_ `[x]`;
                  _Evidence:_ the correction changes no native opt-in decision or host-call-free opt-out path.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`; _State:_ `[x]`;
                  _Evidence:_ approved local conflict content remained local until the provider-refresh reservation
                  existed; that reservation then lease-published the exact requested suffix bottom-up and installed
                  the complete chain in one versioned state settlement.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`; _State:_ `[x]`;
                  _Evidence:_ the selector-free driver rederived the refresh from canonical plan/state and returned
                  the exact verification continuation; callers supplied no member observation facts.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`; _State:_ `[x]`;
                  _Evidence:_ the selected Member 3 correction remained fixed while only its dependent suffix was
                  refreshed; the terminal top was settled separately through the existing absorption arm.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`; _State:_ `[x]`;
                  _Evidence:_ final settlement atomically retained the selected member plus all four changed
                  dependents, and response replay returns the same exact target, Tier 1 reuse offer, and
                  acknowledgment locator without another provider mutation.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 11`; _State:_ `[x]`;
                  _Evidence:_ the external-adoption consent contract and lease-restoration path are unchanged; the
                  live path used the stricter provider-refresh resolution evidence instead.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 12`; _State:_ `[x]`;
                  _Evidence:_ repeated correction preparation still uses the unique provider fork boundary and the
                  single structural arbiter; no new lineage or provider assertion was introduced.
                - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 13`; _State:_ `[x]`;
                  _Evidence:_ pre-reservation conflict output kept state and remotes unchanged and named the logical
                  base, exact parents, local ref, and paths. Re-entry accepted only the exact local two-parent
                  resolution, and every suffix absorption retains exact old-member/refreshed-predecessor ancestry.

                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded diff `3490d939a..3dbf99df6`; cumulative reachability `3dbf99df6` at tree
                  `e56607f4c`; the later terminal absorption is `ec6eea08f` at tree `417b50d04`. Boundary-order
                  deviation: Task 7.7.R.u.p's driver repair and the Member 3 review correction are projected after
                  the original Member 7 boundary and inspected through that terminal tree.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`;
                  _Evidence:_ discharge freshly observes every retained pull request, preserves a merged request's
                  immutable reviewed head, and builds the cumulative member bases in plan order. Both production
                  status and integration checkpoint consume that complete conjunction.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`;
                  _Evidence:_ the correction changes no applicability authority or structural arbiter. Every
                  refreshed dependent remains explicitly verification-owed; no head movement is treated as review
                  clearance.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`;
                  _Evidence:_ Candidate transitions remain the sole durable applicability authority, while the
                  current request observations only supply fresh immutable review coordinates and fail closed on an
                  open-head mismatch.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`;
                  _Evidence:_ registered refresh settlement installed the same pending scoped-verification contract
                  used by every correction arm, with selected and dependent members retained in plan order.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`;
                  _Evidence:_ one selector-free driver invocation resumed the approved local merge, completed the
                  reserved suffix publication and terminal absorption, and returned only at the consolidated exact
                  verification stop. Its effect log contains the refresh dispatch and no hosted-review spend.

                - _Summary:_ 23 met, one superseded, zero unresolved. The Heavy-class adversarial companion remains
                  exhausted at its recorded two-pass cap, so this bounded correction receives no third pass.

        - `[x]` **7.7.R.u.q Preserve executable parents across cascading provider conflicts**

            - _Goal:_ Every pre-reservation provider content-conflict stop names locally readable exact parents even
              when its refreshed predecessor was created earlier in the same isolated preparation.

            - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue —
              decision record (2026-08-31), Amendment 4.

            - Build `test-first` through a real-Git cascading conflict:
                - Accept one exact local two-parent resolution, construct at least one later predecessor only inside
                  provider preparation, and then reach a second genuine content conflict.
                - Before isolated-workspace cleanup, import that exact predecessor under its deterministic private
                  refresh-candidate ref and verify both returned parents remain readable while remotes and Delivery
                  State remain unchanged.
                - Resolve the second conflict on its exact named local member ref, rerun selector-free preparation,
                  retain the referenced anchor only after exact parent/tree proof, and complete ordinary reserved
                  suffix publication without recreating its identity.
                - Retain the anchor only for the typed content-conflict stop; malformed, unavailable, cleanup, and
                  every other refusal keep the existing complete-candidate cleanup behavior.

            - _Outcome:_ Provider preparation now imports a temporary-only conflict predecessor before workspace
              cleanup and returns the stop only after that exact parent is readable under the deterministic private
              candidate ref. Resume derives authority only from the named local two-parent resolution, retains or
              restores its anchor, and recursively reuses each exact mechanical predecessor after ordered-parent
              and merge-tree proof; it no longer assumes plumbing commit identities reproduce across attempts.
              Non-conflict refusal still cleans every candidate. The real-Git regression exercises two attended
              conflicts separated by two isolated absorptions, missing-anchor restoration, exact resume, and
              unrelated-refusal cleanup. All 26 focused tests, both typechecks, targeted TypeScript and Markdown
              lint, and all three ARC contract checks pass. The live Member 7 stop returned locally readable parent
              `b89ccf457`, preserved unchanged remotes, and accepted its exact local merge; the pre-commit retry then
              reached the correct dirty-top guard rather than losing the conflict coordinates.

        - `[x]` **7.7.R.u.r Make final driven re-entry self-binding and lossless**

            - _Goal:_ A restarted selector-free correction consumes exact existing authoring, response, request, and
              temporary-preparation evidence without manual Git repair, lost authority, duplicate review spend, or a
              new attended stop.

            - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue —
              decision record (2026-08-31), Amendment 5.

            - Build `test-first` (one behavior at a time):
                - Author in the existing detached gate without updating its candidate ref, then prove continuation
                  exact-validates and compare-and-swap binds that head before ordinary publication. Dirty, divergent,
                  non-descendant, raced, or ambiguous authoring refuses unchanged.
                - Remove the transient lane-operation projection after an approved delivery-member fix response is
                  durable, then prove entry/status/continuation recover that one exact response without recreating
                  approval; historical, completed, mismatched, and ambiguous records remain excluded.
                - Persist one pending hosted request handle, restart before await, and prove status/continuation
                  return the complete await envelope for that handle with no second request, pass increment, or
                  provider spend.
                - Seed the deterministic provider-resolution locator with exact clean stale residue and prove the
                  driver safely reuses or replaces it before returning a prepared detached workspace. Dirty, moved,
                  foreign, malformed, or ambiguous residue refuses without cleanup or remote/Delivery-State mutation.
                - Drive all four through the production correction fixture to the next established typed stop and
                  assert idempotent replay and effect disclosure; retain the existing complete correction suite and
                  focused refusal coverage.

            - _Outcome:_ Restarted correction entry now compare-and-swap binds valid detached authoring, replays one
              exact durable approved response with its stored verification evidence, persists and resumes one exact
              pending hosted request handle, and prepares conflicts in deterministic detached ARC-owned workspaces.
              Durable response replay rebinds the rediscovered attempt and returns the exact outstanding hosted
              settlement as `hosted-settlement-required` rather than repeating approval or falsely advancing review.
              The production correction fixture also proves equivalent-offer batching, individual durable selections,
              one record-only commit/push, settlement continuation, pending-handle replay, idempotence, and effect
              disclosure. The complete 21-case production E2E, 93 focused continuation/driver/respond tests, isolated
              composition coverage, both typechecks, full TypeScript/Markdown/shell lint, all ARC contract checks, the
              standalone build, and the full 11,284-test matrix pass; one unrelated test remains intentionally skipped.

        - `[x]` **7.7.R.u.s Reuse the exact retained predecessor before conflict-workspace adoption**

            - _Goal:_ A provider retry that recreates a contribution-equivalent mechanical predecessor with a new
              commit identity still consumes the already-prepared exact two-parent resolution, rather than making
              its own detached-workspace resume impossible.

            - _Forward clarification:_ The attended resolution retains exact ordered parents. Its provider-rebased
              mechanical predecessor may be single-parent; reuse instead requires the deterministic candidate ref,
              the exact three-way merge result, and ancestry from the current predecessor.

            - _Outcome:_ Detached resolution workspaces now seed retained-predecessor discovery before replay.
              Provider preparation replaces a recreated mechanical identity only after the candidate ref, object and
              tree, exact merge result, and predecessor ancestry agree, then consumes the originally named
              two-parent resolution. The real-Git regression proves two provider attempts with different commit
              identities complete through ordinary workspace adoption while mismatched evidence retains refusal.

        - _Final driven-acceptance hardening:_ The production correction E2E exposed three seams that only compose
          after record settlement: Candidate-accepted terminal movement had to preserve the exact public review
          continuation in both entry and hosted-status readers; the driver had to reconcile that terminal record
          before projecting a Candidate-renewal carry; and open delivery requests had to derive applicability from
          each retained member's bound base rather than the work-unit Candidate root. The shared strict-ancestry Git
          proof now preserves only a terminal-coordinate-only advance, the ordinary reconcile action performs the
          record rebind before renewal, and merged-request discharge retains its historical rolling-base behavior.
          Repeated identical record settlement and an advancing non-terminating drive now fail at explicit bounded
          stops instead of spinning. The complete 21-case production correction E2E, both typechecks, all lint and
          ARC contract gates, the standalone build, and the full 11,259-test suite pass; no hosted pass was spent.
          The live Candidate re-root then exercised the drive bound by making each terminal rebind chase its own
          boundary-only commit. Public-continuation proof now also considers an exact single-parent prior coordinate
          only when strict ancestry and unchanged Candidate subject prove that record movement is mechanical; the
          state rebind still occurs once so hosted request coordinates remain current, while the resulting record
          commit no longer manufactures another carry. The focused classifier and all 21 production E2E cases pass.

    - `[x]` **7.7.R.v Restore per-member Owner terminus parity**

        - _Goal:_ An explicit Work Unit Owner terminus closes only the exact first-outstanding delivery member,
          remains durable across re-entry, and advances status to the next member without claiming a clean or
          converged review result.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31), Amendment 2.

        - Build `test-first` (one behavior at a time):
            - Return one submit-ready Owner-terminus offer from a delivery-member ceiling stop, bound to the exact
              Candidate, boundary version, member vehicle and head, and completed-pass count.
            - Authenticate the active identity as the Work Unit Owner, re-resolve every bound coordinate, and append
              or replay one member terminus through the version-checked integration-boundary store.
            - Apply a stored terminus only to its exact member, preserve pending findings and applicability stops,
              invalidate changed member coordinates, and advance the conjunction without affecting later members.
            - Preserve the record through unrelated corrective boundary renewal, update the public integration
              workflow in both Framework copies, and prove durable re-entry without provider spend.

        - _Outcome:_ Work-unit review status now emits one submit-ready Owner-terminus offer at the exact delivery
          member ceiling. The acceptance command authenticates the live Work Unit Owner, revalidates Candidate,
          boundary, member, head, and pass coordinates, and records or replays the exact member conclusion through
          boundary CAS. Pending findings and applicability remain first, changed member coordinates stop applying,
          corrective Candidate renewal preserves exact records, and admission selection now advances to the next
          outstanding member before composing its executable action. The shipped integration workflow carries the
          typed stop/accept/re-entry path without calling the member clean or converged. Both typechecks, lint gates,
          ARC contract checks, the production-style ceiling-to-next-member case, and the complete 11,247-test suite
          pass; acceptance and re-entry leave the hosted review-operation store unchanged.

        - _Forward amendment (2026-09-02):_ Live Member 6 review completed one full pass and two incremental passes,
          the latter clean, while status still exposed only another complete pass because the explicit Owner terminus
          was transported solely at the configured ceiling. Present the same exact-head authority alongside an
          ordinary next-pass action after one complete pass, without inferring convergence or weakening any pending
          obligation.

        - `[x]` **7.7.R.v.a Offer explicit member terminus after one complete pass**

            - _Goal:_ After at least one exact complete or effective-complete standard-review pass, the Work Unit
              Owner can explicitly terminate the current member before its ceiling while the ordinary next-pass
              action, all higher-priority obligations, and every exact-currentness guard remain intact.

            - _Outcome:_ Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded diff `8a45168e6..9c0dc2b7a`; cumulative reachability `9c0dc2b7a` at tree
                  `5e11cb196`. Boundary-order deviation: the approved Owner-terminus correction is projected into
                  Member 7 after its original boundary, and exact terminal absorption `f3b8e0d95` carries the
                  amended member at tree `3f064906f` without adding terminal content to the bounded diff.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
                  ordered retained-member conjunction remains the only work-unit discharge. The production lifecycle
                  records one exact Owner terminus, advances only that member, and selects the next member while the
                  ordinary hosted action remains selected until explicit acceptance.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  optional offer reads already-derived complete-pass progress and performs no mutation or provider
                  request. Contribution applicability, residual handling, and the single structural arbiter are
                  unchanged; incremental-only and zero-pass histories cannot produce the offer.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ the
                  existing status and acceptance verbs carry Candidate, boundary, member, head, pass, and qualifying
                  complete-attempt coordinates through the canonical boundary store. Pending findings, applicability,
                  request, await, and malformed-progress arms retain precedence.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the
                  correction changes no scoped-verification continuation or recovery state. The live selector-free
                  drive published only Member 7, refreshed the terminal top, and returned the existing exact-tree
                  verification continuation without hosted spend.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
                  offer is metadata on the ordinary hosted or local action rather than a new stop. Acceptance reuses
                  the existing typed command and currentness checks; the correction adds no workflow engine,
                  convergence policy, review verdict, or delivery-owned quality authority.
                - _Adversarial companion:_ the Heavy-class Member 7 companion remains exhausted at its recorded
                  two-pass cap; this bounded amendment adds no third pass.
                - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

        - _Forward amendment (2026-09-02):_ The live Member 6 acceptance committed its boundary record and then its
          task-closure record above the Delivery State terminal coordinate. Status recognized only the current head
          or its immediate parent and therefore lost the still-valid state anchor, returning a singleton stale-target
          remedy instead of selecting Member 7.

        - `[x]` **7.7.R.v.b Preserve terminus re-entry across a record-only suffix**

            - _Goal:_ After an exact member terminus is committed, pushed, and followed by additional
              operational records already represented by the current Candidate, work-unit status uses the exact
              state-bound terminal coordinate on the bounded ancestry path and advances to the next member without
              Candidate renewal.

            - _Outcome:_ Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded diff `8a45168e6..b469b7727`; cumulative reachability `b469b7727` at tree
                  `6c2c0f602`. Boundary-order deviation: exact terminal absorption `a22272342` retains the newer
                  WU-top machinery at tree `0de9dd8b5` while adding the corrected Member 7 as predecessor.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_
                  work-unit status validates the retained public continuation from the exact state-bound terminal
                  anchor, then composes the same ordered member conjunction. The live command selected Member 7
                  after six discharged members without Candidate renewal or hosted-provider execution.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  proof reuses canonical Candidate-subject collection and strict ancestry, while exact stored-tree,
                  non-ancestral, and subject-change cases refuse. No applicability or contribution arbiter changed.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_
                  repository entry and production status carry exact Delivery State terminal coordinates into the
                  existing continuation proof; only the final open request may substitute the separately proved
                  current head, and every other member or mismatch remains fail-closed.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the
                  correction changes no scoped-verification, acknowledgment, Candidate-renewal, or recovery record.
                  The existing continuation installed one exact Member 7 verification target after refresh.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
                  selector-free driver rebound and published the exact Member 7 candidate, accepted one exact
                  two-parent terminal resolution, completed refresh, and returned at the typed verification stop.
                  The exact target tree passed 83 focused tests and both typechecks; no hosted pass was spent.
                - _Adversarial companion:_ the Heavy Member 7 companion remains exhausted at its recorded two-pass
                  cap; this bounded re-entry amendment adds no third pass.
                - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

        - _Forward amendment (2026-09-02):_ Fresh whole-work-unit verification re-rooted the Candidate after the
          state-bound terminal coordinate. The continuation proof handled only a state coordinate at or after the
          durable Candidate baseline, so it attempted reverse ancestry and again exposed the invalid singleton
          stale-target remedy instead of Member 7.

        - `[x]` **7.7.R.v.c Preserve terminus re-entry after a post-state Candidate root**

            - _Goal:_ Work-unit review status advances to the exact first-outstanding member when a freshly verified
              Candidate baseline equals or descends from the exact state-bound terminal coordinate, without allowing
              the superseded Candidate to carry reviewable task closure or weakening stored-tree and ancestry guards.

            - Build `test-first`:
                - Prove an exact state head below a fresh Candidate baseline reaches the recognized terminal request
                  through Candidate currentness and selects the next retained member.
                - Cover a state head equal to the Candidate baseline, a mismatched stored tree, and non-ancestral
                  state movement.
                - Retain the baseline-before-state subject-equality path and every existing refusal unchanged.

            - _Outcome:_ Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded diff `8a45168e6..b806cd1e8`; cumulative reachability `b806cd1e8` at tree
                  `abb672573`. Boundary-order deviation: exact terminal absorption `e22da2bc9` retains the newer
                  WU-top Candidate and task machinery at tree `0740094f5` while adding the corrected Member 7 as
                  predecessor.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
                  production status lifecycle now composes an exact state terminal below a later verified Candidate
                  root and its machine record, resolves the current terminal request, and advances the same ordered
                  retained-member conjunction.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  new direction admits only a stored state head at or below the durable Candidate baseline, requires
                  strict ancestry through the recognized target, and reproduces the stored tree. Equal-baseline,
                  mismatched-tree, non-ancestral, and existing baseline-before-state cases are executable coverage.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ the
                  proof consumes the already-current managed Candidate and exact public continuation; it does not
                  infer that the superseded Candidate covered task closure or add review-applicability authority.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the
                  selector-free live driver rebound and published only Member 7, completed the terminal refresh, and
                  returned the existing scoped-verification continuation at state revision 328 for exact target
                  `e22da2bc9` and tree `0740094f5`.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
                  correction extends the existing Git proof and production status composition without a new record,
                  stop, workflow, convergence rule, or hosted pass. Four affected suites pass 23 tests; targeted
                  TypeScript and Markdown lint, ARC contract checks, and both typechecks pass.
                - _Adversarial companion:_ the Heavy Member 7 companion remains exhausted at its recorded two-pass
                  cap; this bounded proof correction adds no third pass.
                - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

        - _Forward amendment (2026-09-03):_ The live post-verification re-entry preserved exact-head Owner termini
          but reset their Candidate-scoped applicability selections. Status therefore asked Member 5 to repeat an
          exact `covered` decision that was already durable before the fresh Candidate root.

        - `[x]` **7.7.R.v.d Preserve an exact Owner terminus across a fresh-root applicability replay**

            - _Goal:_ Work-unit review status advances past an unchanged exact-head, exact-pass Owner terminus when a
              fresh Candidate root merely re-exposes an applicability projection settled on the superseded Candidate,
              without masking pending findings or allowing changed member or pass coordinates to inherit authority.

            - _Outcome:_ Member 7 criteria report.
                - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
                - _Span:_ bounded diff `8a45168e6..5f74a8bed`; cumulative reachability `5f74a8bed` at tree
                  `e821a9d5b`. Boundary-order deviation: exact terminal absorption `2a810b450` retains the newer
                  WU-top records at tree `a773f4003` while adding the corrected Member 7 as predecessor.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ an
                  exact current member vehicle, head, and completed-pass terminus now survives a fresh Candidate
                  root's replayed applicability projection and advances the ordered conjunction to its next
                  outstanding member.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ the
                  correction reorders no contribution proof and writes no applicability selection. Changed heads or
                  completed-pass counts remain outstanding, and conflicting applicability authority still stops.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ the
                  existing exact boundary terminus is the sole durable authority; no superseded Candidate transition
                  is copied. Pending findings and active hosted-request state retain precedence over that terminus.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ the
                  existing correction continuation published Member 7 and installed one exact scoped-verification
                  target at state revision 334 without replaying verification or spending a hosted pass.
                - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ one
                  selector-free drive rebound the exact authored candidate, published it, refreshed the terminal
                  top, and stopped only for the consolidated project-gate judgment. Focused status and production
                  lifecycle coverage prove the corrected priority without a new record, workflow, or convergence
                  policy.
                - _Adversarial companion:_ the Heavy Member 7 two-pass cap remains exhausted; this bounded
                  durability correction adds no hosted pass.
                - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

    - `[x]` **7.7.R.w Bind approved member fixes to their exact authoring locus**

        - _Goal:_ An approved delivery-member finding enters the selector-free correction driver before authoring,
          returns the exact route-owned checkout, and recovers the same continuation without inviting edits from the
          session checkout when that checkout is not the selected member's authoring locus.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31), Amendment 6.

        - Build `test-first` (one behavior at a time):
            - Return a distinct submit-ready delivery-correction action from an approved hosted member fix while
              preserving the generic `ready-to-fix / apply-fix` contract for singleton Candidate and Errand review.
            - Bind the driver's authoring stop to the existing fix authorization, disposition set, plan, work unit,
              selected member, reviewed head, and exact route-owned ref/checkout; reject stale or mismatched loci
              before publication or response persistence.
            - Preserve registered non-terminal candidate-gate authoring, unregistered top rematerialization, and
              terminal work-unit-branch authoring without creating another session or recovery locus.
            - Make delivery entry, status, and compaction recovery recognize the pending durable response as the same
              delivery-correction continuation, then update both Framework workflow copies.
            - Prove the production-shaped response-to-authoring path and affected recovery/status contracts without
              requesting a hosted pass or spending provider capacity.

        - _Outcome:_ Approved hosted delivery-member fixes now return a distinct selector-free correction action;
          singleton Candidate and Errand fixes retain `ready-to-fix / apply-fix`. Integration entry and session
          recovery recognize the durable pending response as `delivery-correction`, while an active operation or
          pending scoped verification retains priority. The driver returns the exact route-owned checkout/ref with
          the existing fix authorization, disposition, plan, work unit, member, and reviewed-head binding; terminal
          authoring no longer emits an unlocated stop. Registered candidates, unregistered top rematerialization,
          and terminal top authoring retain their existing topology. The built-CLI production case, 167 focused
          tests, both typechecks, TypeScript/shell/Markdown lint, all ARC contract checks, package build, and the full
          861-file / 11,291-test suite pass with one intentional skip each; no hosted provider request ran.

    - `[x]` **7.7.R.x Project the bootstrap guard through its Member 7 authoring locus**

        - _Goal:_ The already-proven guard reaches the planned `review-fan-out` member through ARC's exact
          route-owned authoring gate, and the dependent suffix plus terminal top settle without duplicate authoring,
          re-derived topology, or hosted-provider spend.

        - **Additional Context:** This is the one-time bootstrap acceptance for Task 7.7.R.w: its implementation had
          to exist on the originating checkout before that implementation could return and enforce the member-owned
          locus. No contract expansion or new implementation is authorized here.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ bounded diff `da1ef4994..d83d908a5`; cumulative reachability `d83d908a5` at tree
              `59f5033d1`. Boundary-order deviation: the bootstrap projection followed terminal source head
              `485fb461a`; exact two-parent absorption `94b84c13d` retained its tree `e5f18fb26` while adding the
              repaired Member 7 as predecessor.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the
              projected status, response, request-handle, and workflow contracts preserve the existing ordered
              retained-member conjunction. The live driver rebound and published only Member 7 before returning
              through the same delivery continuation.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ every
              replayed source change is already reachable from the terminal top, and the Member 7-only conflict
              workspace extraction changes no contribution arbiter, applicability authority, or review record.
              The dependent refresh required scoped verification rather than treating head movement as clearance.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ durable
              approved responses and hosted request handles now replay their exact member, source, pass, and await
              envelopes. The authoring guard binds that progression to the existing fix authorization, disposition,
              plan, member, reviewed head, ref, and checkout before mutation.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ refresh
              settlement installed the shared pending scoped-verification continuation at state revision 269 and
              returned exact target `94b84c13d` at tree `e5f18fb26`; its typed Tier 1 reuse is limited to that already
              green unchanged tree.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ one
              selector-free live drive compare-and-swap rebound detached authoring, published Member 7, and stopped
              with complete coordinates at the semantic top conflict. Exact local two-parent resolution then resumed
              unchanged, completed the refresh, and returned the consolidated verification stop without hosted spend,
              duplicate authoring, selector reconstruction, or new orchestration authority.
            - _Adversarial companion:_ the Heavy-class Member 7 companion remains exhausted at its recorded two-pass
              cap; this bootstrap projection adds no third pass.
            - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

    - `[x]` **7.7.R.y Refuse provider refresh over checked-out member refs**

        - _Goal:_ Provider refresh never moves a canonical member ref behind a registered worktree's index and files,
          and its typed refusal identifies the exact checkout that must be realigned or removed before retry.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ bounded diff `f4b0716bf..58eef1f4a`; cumulative reachability `58eef1f4a`. Boundary-order
              deviation: exact top absorption `3cef71b98` retained the newer integration machinery and supplied one
              top-only dependency-fixture update required by the guard's production composition.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the guard
              composes only into provider refresh execution and leaves carried review reservations, per-member
              targets, and conjunction discharge unchanged.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ occupied
              canonical refs refuse before reservation and publication, while unoccupied execution retains the
              existing contribution arbiter and publishes only the already-proved changed vector.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ no review
              record, applicability selection, attempt lookup, or exact member selector changes; the observation is
              a Git mutation precondition only.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ fresh
              refusal reaps private candidates without state movement, while retained-operation refusal preserves
              the exact operation for typed reconciliation and recovery.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the existing
              correction driver returns the typed conflict and verification stops unchanged; real-Git worktree
              coverage proves exact paths, unchanged state and refs, detached-gate exclusion, and ordinary
              unoccupied publication without a new orchestration record or control loop.
            - _Adversarial companion:_ the Heavy Member 7 two-pass cap remains exhausted; this bounded guard does not
              claim or spend a third pass.
            - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

    - `[x]` **7.7.R.z Rematerialize exact stale candidate gates before correction authoring**

        - _Goal:_ A registered non-terminal correction reaches the current public member through its exact clean
          machine-owned candidate gate without discarding authored work, re-deriving topology, or requiring manual
          gate repair after provider movement.

        - _Outcome:_ Member 7 criteria report.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ bounded diff `4683d9080..3f26eb8e2`; cumulative reachability `967980960` at tree
              `b3e6e9e88`; boundary-order deviation: exact two-parent terminal absorption `967980960` preserves the
              newer WU-top integration machinery while supplying the repaired Member 7 driver.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`; _State:_ `[x]`; _Evidence:_ the new
              private preparation action composes before the existing authoring stop and does not alter retained
              review reservations, member targets, provider requests, or conjunction discharge.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`; _State:_ `[x]`; _Evidence:_ stale-gate
              preparation decides no applicability or convergence question, spends no hosted review, and leaves the
              shared contribution arbiter plus incremental-review posture unchanged.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`; _State:_ `[x]`; _Evidence:_ the action
              reads no lane-progress authority and writes no Candidate or review record; it binds only the exact
              plan/member/state coordinates and the deterministic private ref/gate pair.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`; _State:_ `[x]`; _Evidence:_ fresh,
              replay, stale, dirty, attached, operation, foreign, split, authored-ahead, and rollback coverage proves
              that private preparation precedes the unchanged strict rebind, publication, and scoped-verification
              continuation without moving Delivery State, canonical refs, or remotes.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`; _State:_ `[x]`; _Evidence:_ the
              production-style composed loop rematerialized a non-ancestral clean stale gate, disclosed the exact
              dispatch, returned ordinary authoring, then retained the existing rebind/publish/refresh/verification
              tail. The live bootstrap published only Member 7 and reached its exact Tier 1 continuation after one
              attended semantic top merge.
            - _Adversarial companion:_ the Heavy Member 7 two-pass cap remains exhausted; this bounded lifecycle
              guard adds no hosted pass or new review authority.
            - _Summary:_ five met, zero superseded, zero unresolved. Success Criteria markers remain unchanged.

    - `[x]` **7.7.R.aa Compose chunked local standard review for oversized delivery members**

        - _Goal:_ An oversized first-outstanding member reaches the existing exact-target chunked local
          standard-review carrier before hosted spend, while bounded members, singleton review, delivery topology,
          source ordering, pass accounting, and convergence authority remain unchanged.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31), Amendment 8.

        - Build `test-first` (one behavior at a time):
            - `[x]` **7.7.R.aa.a Select chunked local review from the exact member size**
                - _Goal:_ Work-unit status measures the first-outstanding member before requesting a hosted carrier
                  and returns one submit-ready exact-head local action when the existing attention signal selects
                  chunking; bounded delivery members and singleton status preserve their current routes.
                - _Outcome:_ Exact member metrics now enter the existing chunking policy before source admission;
                  work-unit targets retain delivery-bound suppression, while a prior non-completing whole-target
                  refusal remains factual but cannot block the selected delegated chunk carrier or consume a pass.
            - `[x]` **7.7.R.aa.b Carry the explicit chunk scope through local review**
                - _Goal:_ Delivery reservation admission, local prepare/resume, durable operation state, and
                  attestation preserve the exact `chunked` selection without caller reconstruction, while changed
                  target coordinates refuse stale scope.
                - _Outcome:_ One exact chunked selection now crosses admission, status, local operation persistence,
                  resume, and attestation. Target drift fails schema validation, and only a clean aggregate marked as
                  a complete chunk series can discharge the member.
            - `[x]` **7.7.R.aa.c Prove the production route without a global CLI dependency**
                - _Goal:_ A production-shaped delivery-position E2E repository resolves its commit hook through the
                  repository-local ARC CLI and drives an oversized member through status, chunked local admission,
                  resume, and exact-target attestation without hosted spend.
                - _Outcome:_ The production fixture installs its own repository-local ARC launcher and removes
                  inherited package-bin paths, then drives an oversized member through exact status, local prepare,
                  durable resume, aggregate attestation, and ordered next-member progression without a hosted request.
            - `[x]` **7.7.R.aa.d Run the live Member 7 chunked review acceptance**
                - _Goal:_ Contract-closed Member 7 chunks plus a dedicated seam cover the complete exact diff, and a
                  fresh aggregate evaluator emits the only result eligible as one standard-review pass.
                - _Outcome:_ Five contract-closed chunks plus the dedicated seam covered the complete exact Member 7
                  diff. One fresh aggregate result recorded five verified findings as a single complete standard
                  pass; six atomic fixes closed them and two live-only composition gaps, then the selector-free drive
                  reached the exact green terminal verification target without hosted spend.

        - _Scope boundary:_ No dynamic delivery-plan resegmentation, provider-refusal parser, convergence policy,
          generalized orchestration or step vocabulary, storage redesign, standing grant, or new configuration axis.

    - `[x]` **7.7.R.ab Refuse silent review-coverage broadening at local carrier selection**

        - _Goal:_ An explicit incremental member-review request either reaches a carrier that preserves incremental
          coverage or stops before preparation; oversized-member routing can never silently spend a complete local
          pass under narrower authority.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31), Amendment 9.

        - Build `test-first` (one behavior at a time):
            - `[x]` **7.7.R.ab.a Type the unsupported coverage collision at status**
                - _Goal:_ When oversized-member routing selects the complete-only chunked local carrier for an
                  explicit incremental request, status returns `blocked / coverage-unsupported / stop` with the
                  exact delivery cursor before any local action can be prepared.
                - _Outcome:_ Delivery obligation composition now stops every explicit incremental request whose
                  ready source is the complete-only delegated carrier. The public stop has its own delivery-only
                  schema, requires an outstanding conjunction and cursor, emits no local action, and retains
                  incremental coverage in its safe retry rather than defaulting to complete.
            - `[x]` **7.7.R.ab.b Preserve adjacent review routes and live recovery**
                - _Goal:_ Complete chunked-local review, hosted incremental review, ceiling-override binding, source
                  ordering, pass accounting, changed-target settlement, and singleton status retain their existing
                  behavior; the already-prepared live operation ends without consuming pass 4.
                - _Outcome:_ The exact unavailable attestation removed only the mismatched prepared operation and
                  recorded no receipt or lane attempt. Unit coverage proves that the same source, pass 4 override,
                  and chunk scope remain available for an explicit complete request; the production integration
                  case preserves hosted incremental and complete chunked-local routing. The live WU-scoped command
                  stopped on PR 556 at `5609e63c1`, retained Member 7 with three completed passes, and emitted no
                  review action.

        - _Verification:_ 50 focused status unit cases, 14 production fan-out integration cases, 77 Framework
          contract cases, production and test typechecks, focused TypeScript lint, per-file Markdown lint, and all
          three ARC contract checks pass. The live exact-target status probe independently exercised the built CLI.

        - _Scope boundary:_ No local incremental carrier, new coverage record, prior-head selector, source-policy
          change, convergence decision, or generalized review orchestration.

    - `[x]` **7.7.R.ac Separate the correction entry seam's two non-current-Candidate states** — validate criteria
      at member scope

        - _Goal:_ A non-current Candidate whose work-unit branch carries non-lifecycle content while a non-terminal
          member review is outstanding never receives a confident verification-closeout route; the entry seam
          classifies the terminal delta and returns a typed ambiguous stop naming both candidate routes.

        - **Additional Context:** `spec-delivery-native-stack-composition.md` D5.14. The prompt is the resumed
          Member 7 correction that reached `candidate-verification-required` with its fix committed on the
          work-unit branch and not yet replayed into the member ref; following that route would have attested a new
          root with member-owned content absorbed into the terminal member.

        - Build `test-first` (one behavior at a time):
            - `[x]` **7.7.R.ac.a Classify the terminal delta at integration entry**
                - _Goal:_ Entry inspection separates a delta composed only of the work unit's lifecycle artifacts
                  from one carrying non-lifecycle content, from facts it already reads. A lifecycle-only delta, and
                  any delta carried while no non-terminal member review is outstanding, retain the existing
                  verification-closeout route unchanged.
                - _Outcome:_ The separation composes from three exported units: a pure partition of a change set
                  against the work unit's lifecycle-contribution group, a pure selector for the first plan-ordered
                  non-terminal member still bound to a change request, and a Git adapter that reads the range
                  between the state-bound terminal coordinate and the current head. The read-only candidate port
                  carries the classification on its non-current result; an unreadable range, an unresolved active
                  work unit, and an absent terminal coordinate all report the classification as unavailable rather
                  than guessing a partition. Route selection is unchanged and remains Task 7.7.R.ac.b's.
            - `[x]` **7.7.R.ac.b Return a typed ambiguous stop instead of a confident route**
                - _Goal:_ When non-lifecycle content is carried while a non-terminal member review is outstanding,
                  entry returns a typed stop naming both candidate routes, the classified delta, the outstanding
                  member, and each route's exact next action. It attributes no content and selects no member, and an
                  unavailable classification retains the closeout answer rather than inventing a route.
                - _Outcome:_ Integration entry answers a non-current Candidate with `correction-route-ambiguous`
                  only when the classified delta carries non-lifecycle content and a non-terminal member is still
                  bound to a change request. The stop carries both delta partitions, the outstanding member and its
                  request, and an ordered pair of routes with each one's exact next action; it selects neither.
                  Lifecycle-only deltas, entries with no outstanding non-terminal member, and unavailable
                  classifications retain the closeout route unchanged. The session probe surfaces the stop as an
                  unresolved subject instead of projecting ordinary integration, and both Framework copies of the
                  integration workflow dispatch it.

        - _Outcome:_ The seam now separates the two non-current-Candidate states from facts entry already
          reads: a lifecycle partition of the terminal delta and a plan-ordered outstanding-member selector
          decide together whether the closeout route is still a confident answer. The partition counts the work
          unit's machine-owned Candidate and boundary records as lifecycle, without which ARC's own record-only
          commits read as member content and produce spurious stops. It fired on this member's own projection:
          the drive reached publication and refresh with no ambiguous stop, because the delta was lifecycle-only.

        - _Verification:_ 864 test files and 11396 tests pass on the verification target tree `833756c8e`, with
          both typechecks, TypeScript, shell, and Markdown lint, and all three ARC contract checks green.

        - _Scope boundary:_ No content attribution, member selection, heuristic route choice, new record, or review
          authority. Route execution remains D5.13's resumable procedure; this task governs only what entry answers.

    - `[x]` **7.7.R.ad Let exact-head Owner terminus authority preempt applicability replay**

        - _Goal:_ A first-outstanding delivery member with completed complete-review evidence may receive explicit
          exact-current-head Owner terminus authority before historical applicability bookkeeping, while every
          unresolved evidence choice remains available when that authority is not accepted.

        - **Additional Context:** `notes-delivery-native-stack-composition.md` § Correction-cycle rescue — decision
          record (2026-08-31), Amendment 13.

        - Build `test-first` (one behavior at a time):
            - `[x]` **7.7.R.ad.a Bind exact terminus authority to an applicability status**
                - _Goal:_ A non-conflicting delivery applicability result carries both its unchanged Candidate
                  selection and one submit-ready terminus offer for the exact current member when complete-pass
                  evidence exists. Zero-pass, incremental-only, conflicting, and higher-priority intervention
                  states preserve their existing behavior.
                - _Outcome:_ Applicability status now admits the existing exact-member terminus binder without
                  changing its Candidate selection. The shared complete-pass guard excludes zero-pass and
                  incremental-only histories, while every non-applicability intervention remains ineligible.
            - `[x]` **7.7.R.ad.b Put the terminal Owner decision first and prove durable discharge**
                - _Goal:_ The integration workflow presents the terminus alternative before applicability; a
                  production-shaped moved-head case accepts it, records no applicability claim, spends no provider
                  pass, and advances beyond every replayable historical projection for that member.
                - _Outcome:_ Both Framework workflow copies route the exact terminus first. A real-Git moved-target
                  lifecycle accepts that current-head offer, leaves the Candidate record unchanged, preserves the
                  review-operation snapshot, and advances directly to the next member.

        - _Outcome:_ Exact-current-head Owner authority can now end one member's review before historical
          applicability bookkeeping. Declining that authority preserves the original selection path, and accepting
          it records no applicability evidence or convergence claim.

        - _Scope boundary:_ No automatic attempt supersession, applicability inference, convergence policy, standing
          grant, attempt chronology, new record family, or generalized workflow control loop.

    - `[x]` **7.7.R.ae Re-enter a committed Owner terminus through terminal rebind**

        - _Goal:_ After committing and pushing an exact delivery-member Owner terminus on the work-unit branch,
          integration resumes through the existing selector-free correction driver so an owed terminal-coordinate
          rebind completes before status selects the first outstanding member.

        - _Outcome:_ Both Framework workflow copies now route a newly committed and pushed terminus through the
          selector-free correction driver, while exact replay and stale-offer refusal remain direct status re-entry.
          The contract test failed against the old route and passes on the correction; the live Member 7 drive then
          published once, resumed its retained operation, and reached exact-tree scoped verification.

        - _Scope boundary:_ No new state, authority, convergence rule, provider call, Candidate renewal, or generic
          driver behavior.

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

- _Forward amendment (2026-08-29):_ Codex compaction while the work-unit branch was intentionally resident in a
  clean registered checkout exposed that PreCompact recognized only ARC transients, so it ignored the current
  work-unit locus and seeded from the detached harness root. Its 15-second nested timeout then killed a valid status
  probe inside a 30-second enclosing hook before the typed topology refusal could surface.

    - `[x]` **8.5.R.e Preserve compaction recovery across an exact work-unit locus transfer** — validate criteria at
      member scope

        - _Goal:_ PreCompact follows only a reader-proved one-to-one transfer of the same work-unit locus, retains
          exact seed and recovery-audit validation at the replacement checkout, excludes every member, gate,
          sibling, ambiguous, or unresolved candidate, and gives a valid seed command a coherent execution budget.

        - PreCompact now uses the fast locus projection to follow only the exact unresolved-to-resolved successor
          for the same work unit, then emits and audits the seed at that checkout. A shared hook deadline lets a
          valid command run past the former nested cutoff while refusal matrices and real-hook E2E cover exclusions.

- _Forward amendment (2026-08-29):_ Investigation of that transfer found it was an unclosed workaround, not an
  intended lifecycle transition. Two completed-work-unit Candidate records had been opportunistically rewritten in
  the active checkout during review response, prompting a clean temporary branch carrier; the transfer amendment
  then normalized the abandoned origin. Restore the fixed-origin contract, keep Candidate mutation with the active
  checkout owner, and prove repeated stacked-delivery re-entry stays stationary.

    - `[x]` **8.5.R.f Restore stable checkout isolation across stacked-delivery cycles** — validate criteria at
      member scope

        - _Goal:_ The originating checkout remains the work unit's one session and recovery locus while delivery
          member operations cycle around it, and review/Candidate commands cannot dirty another work unit's record
          in that checkout.

        - `[x]` **8.5.R.f.1 Restore fixed-origin locus authority and fail closed on branch-carrier collisions**

            - The locus reader now treats a marker-owned origin plus any competing same-work-unit carrier as an
              unresolved collision with restore-to-origin guidance. Recovery and PreCompact retain ready-transient
              routing and the shared deadline, but never transfer work-unit authority away from the origin.

        - `[x]` **8.5.R.f.2 Keep Candidate mutation in the active checkout owner**

            - Review response and explicit applicability now derive Candidate mutation authority from the entering
              locus: an active owner can select and mutate only its own lineage, while an ownerless checkout requires
              positive completed-lifecycle evidence. Fresh checks guard record writes and index staging; foreign dirt
              remains visible and every refusal leaves Candidate bytes and the index unchanged.

        - `[x]` **8.5.R.f.3 Rehearse stationary stacked-delivery re-entry and close the amendment**

            - A real three-member delivery rehearsal crosses correction routing, Candidate-backed review response,
              convergence verification, and integration entry from one stationary origin while detached member and
              gate inputs remain lifecycle-free. Carrier collisions, restored-origin success, archived continuation,
              non-completed ownerless refusal, and authority movement at mutation are covered at their real seams.

        - _Outcome:_ The workaround that moved the work-unit branch has been removed from recovery authority, and the
          checkout-local Candidate boundary now prevents the foreign rewrites that motivated it. Repeated delivery
          re-entry remains stationary without weakening completed-lineage maintenance or hiding foreign dirt.

    - `[x]` **8.5.R.g Give the authoring executors a typed surface** — validate criteria at member scope

        - _Goal:_ A correction interrupted between authoring on the work-unit branch and replaying into its member
          gate completes through typed verbs rather than a hand-written candidate ref inside the namespace D9.4
          reserves to ARC.

        - **Additional Context:** `spec-delivery-native-stack-composition.md` D9.9. `authoring-locate` already
          publishes the read half of the locus; the rematerialize and rebind executors implement the write half and
          are reachable only through the in-process correction dispatch, so an interrupted replay has no completion
          path — publication refuses `candidate-unchanged` until the gate advances.

        - `[x]` **8.5.R.g.1 Expose rematerialize and rebind as typed verbs**

            - `arc delivery authoring rematerialize` and `arc delivery authoring rebind` route the existing request
              schemas straight into the executors, which now live at the command scope so the in-process dispatch
              and the verbs share one implementation. The strict result envelope admits the executors' four success
              shapes unchanged.

        - `[x]` **8.5.R.g.2 Preserve refusal identity and adjacent routes**

            - Real-CLI coverage in a temp repository drives the locate read half into both write verbs: a pair is
              prepared at the public member and replays idempotently, a stale revision refuses
              `authoring-rematerialize-authority-moved`, and rebind refuses `authoring-locus-dirty`,
              `authoring-rebind-moved`, and `authoring-rebind-not-descendant` while leaving the candidate ref
              untouched. `deliver-stack.md` names the two verbs beside the locate read.

        - _Forward amendment (2026-09-04):_ Exposing the verbs showed the rebind executor's `already-rebound` arm is
          unreachable: the moved check requires the ref at `beforeHead` and the descendant check requires
          `beforeHead` to differ from `requestedHead`, so the ref can never already sit at the target except by a
          race. A rebind verb interrupted after its ref update therefore refuses `authoring-rebind-moved` on the
          exact rerun that the interrupted-recovery purpose calls for, while rematerialize replays cleanly.

        - `[x]` **8.5.R.g.3 Make an exact rebind replay converge**

            - _Goal:_ A rebind request whose ref and clean checkout already sit at exactly the requested head and
              tree returns `already-rebound` without mutation, through the verb and the in-process dispatch alike,
              while every genuinely moved, dirty, or non-descendant case keeps its existing refusal.
            - The shared executor now recognizes the converged state after the dirty check and before the moved
              check, so the arm the driver already accepts is reachable on the exact rerun. The e2e replays the
              successful rebind, then proves moved against a ref that advanced under a stale `beforeHead` and
              non-descendant against a checkout detached at an ancestor, with the candidate ref unchanged throughout.

        - _Scope boundary:_ No record, authoring-locus lifecycle, ownership registry, gate provisioning change, or
          authority beyond what the in-process dispatch already holds.

    - `[x]` **8.5.R.h Absorb an acknowledgement's own record movement without renewing its verification**

        - _Goal:_ A scoped review-fix verification that has just been acknowledged is not re-installed by the
          terminal rebind that absorbs the acknowledgement's own record-only commit, so the correction procedure
          reaches a fixed point. Substantive append-only terminal movement still renews it.

        - **Additional Context:** The prompt is this work unit's own live Member 7 projection. Each acknowledgement
          wrote its boundary carry, committed the two machine-owned records, and moved the terminal head; the
          rebind then re-installed the identical pending verification and the continuation demanded the same member
          again, across three observed cycles. The relaxed pending-verification guard and the unconditional
          re-install arrived together with append-only terminal rebinding. The driver already holds the
          distinguishing fact — it records the head of the record commit it has just settled — so the rebind needs
          that fact rather than a fresh classification of the delta.

        - `[x]` **8.5.R.h.1 Retire the settled verification at the driver's own record movement**
            - _Goal:_ The rebind admits the settled record-effect head and, when the observed terminal
              coordinates are exactly that commit, leaves the acknowledged verification retired instead of
              re-installing it, so the continuation stops demanding the member it has just settled.
            - The correction driver now owns the settled record head: it reads the head off each settlement's
              commit effect and passes it to every action it dispatches, so the reconcile input no longer depends
              on handler-closure state. Port-call-order unit coverage proves the settled settlement, the idle
              settlement that follows it, the projection, and the reconcile dispatch carrying that exact head.
        - `[x]` **8.5.R.h.2 Renew verification across every other terminal movement**
            - _Goal:_ Predecessor absorption, substantive append-only movement, and any terminal advance
              carrying a non-record path retain the re-installed pending verification and its exact member
              scope; every existing refusal is unchanged.

        - _Outcome:_ The retirement arm never fired because its input arrived undefined: the handler cleared its
          settled head on every non-refused settlement, and the driver always runs one idle settlement between the
          commit and the reconcile it dispatches, so the reconcile was dispatched without the head on every cycle.
          The fact now travels with the driver's dispatch context; the handler retains its own copy only as the
          record-reconstruction guard and never clears it on idle. Live fixed-point confirmation runs at the next
          correction continuation.

        - _Scope boundary:_ No new record, state field, orchestration surface, or review authority, and no change
          to acknowledgement, boundary carry, or record settlement. This task governs only whether the rebind
          renews a verification it has just settled.

- _Forward amendment (2026-09-04):_ The first fixed-point run past the renewal loop stopped on
  `authoring-required` without naming the open task that derived the route, and the preceding
  `verification-required` stop returned two candidate input objects (`acknowledgementInput` and `resumeAction`)
  for one submission. Both are output-shape gaps on the unshipped continuation this member minted; fix them in
  place before the shape ships rather than after.

    - `[x]` **8.5.R.i Make correction stops self-explaining**

        - _Goal:_ Every attended stop of the review-fix continuation names the exact fact that derived its route,
          and a stop that expects a resubmission offers exactly one input shape for it.

        - `[x]` **8.5.R.i.1 Name the deriving fact on routed stops**
            - `correction-routing-required` and the continuation's `authoring-required` carry a typed `derivedFrom`
              with three arms: the open task (section and leaf ids), the pending approved review response
              (reviewed head and disposition set), or the pending verification being superseded (continuation
              digest). All four entry producers populate it and the execution-entry text names the open task.

        - `[x]` **8.5.R.i.2 Offer one resubmission shape on the verification stop**
            - The continuation's `verification-required` no longer echoes `acknowledgementInput`; `resumeAction`
              is the one input the caller completes with `verification`. The low-level settlement verbs and
              `entry inspect` keep the locator for the controller and for direct verb tests, which now read it
              from `entry inspect`. `deliver-stack.md` names the single shape and the `derivedFrom` field.

        - _Scope boundary:_ Result-shape and workflow-prose changes only. No new state, record, orchestration
          surface, or change to routing decisions.

- _Forward amendment (2026-09-04):_ The first correction after the settled acknowledgement refused
  `candidate-not-current` at the terminal rebind. Retiring the verification (Task 8.5.R.h) leaves the bound terminal
  one record-only commit past the Candidate's durable baseline with no pending verification, and the reconcile
  admitted a baseline-descendant terminal only under a pending verification. The state the fixed point produces was
  therefore one the next correction could not enter.

    - `[x]` **8.5.R.j Admit contribution-equivalent terminal movement at the next correction**

        - _Goal:_ A terminal bound past the Candidate's durable baseline by movement whose Candidate subject digest
          equals the baseline's is admitted to the terminal rebind without a pending verification, so a settled
          record commit (or any operational-only write) never strands the next correction; a non-equivalent
          descendant without a pending verification still refuses.

        - _Outcome:_ The reconcile derives a third retained-target relation, `equivalent`, by collecting the
          Candidate subject at the retained terminal head with the same collector it already uses for the current
          head and comparing digests against the durable baseline; the rebind admits it like `exact`. Because the
          subject classifies the Candidate's own record and boundary as projections and lifecycle writes as
          operational, the relation covers settled record commits, applicability-selection records, and handoff
          commits alike. A real-CLI reconcile over a record-only terminal reproduced the live refusal before the
          fix and now rebinds with the verification renewed for the substantive head.

        - _Scope boundary:_ One new baseline relation derived with the Candidate's existing subject collection. No
          new record, state field, or authority.

- _Outcome:_ Member 8 criteria report.

    - _Criteria slice:_ `Success Criteria > Member 8 — retirement-and-doctrine`.
    - _Span:_ original diff `e11bd763d..270f42c1b`; earlier amendment diff `a374df393..b2d7ec52e`; prior amendment
      diff `530463f72..bfbf5073e`; live-rehearsal amendment diff `3d9ea7ef1`; recovery amendment diff `8b401796f`;
      fixed-origin amendment in the current worktree over `a3905981b`; correction fixed-point amendment diff
      `ca50a8c33..1ae134f03` (Tasks 8.5.R.g through 8.5.R.j); terminal-publication amendment commit
      `acbdaa740` plus the exact verification-repair patch (Task 8.5.R.k); reachability: the complete staged tree;
      boundary-order deviation: the approved Tasks 8.5.R.a through 8.5.R.k -
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
      The fixed-point amendment keeps every route typed: the authoring executors are reachable as verbs that share
      one implementation with the in-process dispatch, routed stops carry the deriving open task or pending
      response, the verification stop offers one resubmission shape, an acknowledgement's own record commit no
      longer renews the verification it settled, and the next correction is admitted past a contribution-equivalent
      terminal. Terminal correction planning now also holds a clean local descendant at the existing
      `authoring-required` stop until the hosted request exposes that exact head: the prior public head returns
      explicit verify, commit, push, and resume guidance with no effect, the exact published head reconciles, and an
      unrelated hosted head refuses. Real-CLI coverage reproduces each prior refusal and proves the route; no new
      state or record.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 5`; _State:_ `[x]`;
      _Evidence:_ plain attestation emits a closed action and argv bound to the exact refused Candidate and staged
      subject. The handler requires paired selectors with deliberate re-rooting; the verb reobserves Candidate,
      subject, and blocked currentness and refuses every mismatch before publication. Verification executes only the
      exact continuation after its fresh gates and requires `attested / re-root`. Unit, handler, workflow-contract,
      and real-CLI tests prove successful replay plus stale replay with no Candidate-record write, without adding a
      verification ledger, lifecycle state, or Candidate authority. Success Criteria markers remain unchanged.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 6`; _State:_ `[~]`;
      _Evidence:_ the prior successor route and its exact seed audit proved the shared hook budget but normalized an
      abandoned-origin workaround. Fixed-origin D1.5 supersedes work-unit succession; the deadline evidence is
      retained under criterion 7 while successor selection and its transfer fixture are removed.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 7`; _State:_ `[x]`;
      _Evidence:_ the derived locus reader makes an origin plus a same-work-unit carrier unresolved on both rows,
      including a carrier whose Candidate context is otherwise only subject-unresolved. Recovery follows only the
      marker-owned origin; PreCompact follows that origin or a registered ready transient and retains the shared
      enclosing deadline. Unit and real-hook coverage prove carrier refusal, actionable restoration, restored-origin
      seeding, ready-transient routing, and slow valid seed completion without replacement authority.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 8`; _State:_ `[x]`;
      _Evidence:_ review response and explicit applicability project one fresh Candidate owner from the derived locus.
      An active owner exposes only its own lineage; an ownerless checkout exposes only lifecycle-indexed completed
      lineages, including at fresh pre-write and pre-stage checks. Real carrier E2E leaves Candidate bytes and the
      index unchanged, restored-origin and archived-lineage continuations succeed, foreign dirt stays blocking, and
      the stationary three-member rehearsal crosses correction, review response, verification, and integration entry
      from the origin with lifecycle-free member and gate inputs. Fail-first unit coverage additionally proves that
      ownerless non-completed records and authority movement at the mutation seam refuse before mutation. Repeated
      re-entry now also converges live in this work unit: two consecutive correction cycles (state revisions 392
      through 397) each verified, acknowledged, committed and pushed their records, reconciled without re-installing
      the settled verification, and returned to authoring from the origin, where five cycles had previously looped.
    - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 9`; _State:_ `[x]`;
      _Evidence:_ `arc delivery authoring rematerialize` and `arc delivery authoring rebind` expose the existing
      executors without adding authority. The verbs and in-process correction dispatch share one implementation and
      retain the exact clean-locus, before/requested-head-and-tree, state-revision, and active-operation guards. The
      real-CLI authoring scenario proves idempotent rematerialization and exact rebind replay, plus dirty-locus,
      moved-head, stale-revision, and non-descendant refusals without changing the candidate ref.
    - _Adversarial companion:_ pass 1 found active-owner bypass and the absent stationary-cycle rehearsal; both were
      repaired and source-verified. Pass 2 found ownerless explicit applicability lacked positive completed-lineage
      evidence and that this report still certified the superseded transfer; both were repaired under the approved
      disposition. The Heavy two-pass cap is exhausted, so no third independent pass is claimed; the fixed-point
      and terminal-publication amendment spans were walked by the primary only.
    - _Summary:_ eight met, one superseded, zero unresolved.

- _Forward amendment (2026-09-04):_ Live Member 8 correction resumed after a local content commit but before its
  work-unit branch push. The rescued driver dispatched reconciliation and exposed the existing host exactness guard
  only as `top-request-mismatch`, creating a decision-free stop. Hold that effect at authoring instead.

    - `[x]` **8.5.R.k Hold terminal reconciliation until authored content is public**

        - _Goal:_ A locally authored terminal correction remains at the existing submit-ready `authoring-required`
          stop until the hosted request exposes that exact head; the prior public head receives explicit verify,
          commit, push, and resume guidance, while unrelated host movement refuses before reconciliation.

        - Build `test-first` through the live-shaped unpushed descendant, the published exact-head continuation, and
          unrelated hosted movement. Keep content publication outside the driver's machine-owned record effects and
          add no stop kind, durable state, standing authority, or generalized control flow.

        - _Outcome:_ Terminal correction planning now composes the existing append-only local-head proof with its
          remote publication lease. An unpushed clean descendant returns `authoring-required` with commit/push
          guidance and an empty effect log; the exact published head proceeds to reconciliation, while a third head
          refuses before dispatch. The pending-verification fallback applies the same host check instead of exposing
          `top-request-mismatch`. Focused controller, route, workflow-contract, type, and built-CLI tests pass.

## **Phase 9:** Verification

### `[x]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

- _Quality gates:_ The final union at `ff86f1326` passed Markdown and ARC contract lint, TypeScript and shell lint,
  both typechecks, package build, diff hygiene, 865 test files, and 11,429 tests, with one intentional skip each in
  files and tests. The closing task-record delta then passed its applicable Markdown and ARC contract checks.
- _Success criteria:_ 47 total: 44 met, three superseded, and none unresolved. All 45 previously recorded
  digest-bound loci still match; the amended Member 1 and Member 4 reports supply the two added loci. Delivery State
  revision 428 is an exact contiguous eight-member chain whose repaired cumulative boundaries and final union prove
  independent gate readiness without successor-only masking.

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

        - `[x]` **9.1.R.c Revalidate repeated refresh at work-unit scope**

            - _Goal:_ The terminal report consumes the amended Member 6 boundary and proves the complete delivery
              remains coherent after repeated provider refresh settlement.
            - _Quality gates:_ The current Markdown and ARC contract gates, TypeScript and shell lint, both
              typechecks, package build, and full suite pass; 852 of 853 test files and 11,068 of 11,069 tests pass,
              with one intentional skip each. The aggregate post-Candidate delta review and complete diff hygiene
              found no material finding.
            - _Success criteria:_ Work-unit criteria report.
                - _Criteria slice:_ `Success Criteria`, comprising all eight recorded member groups and
                  `Cross-member seams`.
                - _Span:_ complete work-unit diff `main...66da99a8f` plus this exact terminal-verification evidence
                  patch; reachability is the complete staged tree. Boundary-order deviations remain bound inside
                  the recorded member reports; no new member attribution is introduced here.
                - _Member groups:_ thirty criteria met, Member 1 criterion 1 and Member 6 criterion 2 remain
                  intentionally superseded by D7.2b and D5.9, and zero criteria are unresolved. The latest Member 6
                  report reaches `ca8dc2ef36e9a82a60e39e843db6155570a974c2` and closes its unique-fork and exact
                  terminal-preflight, logical-base, two-parent, retained-operation, and attended-conflict loci.
                - _Seam 1:_ exact task closure now projects `no-open-task` and `verify-work-unit`; the recovery audit
                  and attestation guards retain cursorless closeout without admitting an unresolved task list.
                - _Seam 2:_ the registered correction settled through provider refresh, exact Member 1 verification,
                  and digest-bound acknowledgment at state revision 79 without repeating provider mutation.
                - _Seam 3:_ canonical plan/state still select the eight-member chain before position or host routing;
                  the live position read returns Member 1 as the exact first unlanded member with no active operation.
                - _Seam 4:_ the repeated correction used the provider-native path, exact lease publication, and one
                  terminal absorption, adding no manual recut or synthetic ancestry-reconciliation merge.
                - _Seam 5:_ all current quality gates pass.
                - _Seam 6:_ the composed tree is ready for Candidate attestation and integration. The executable
                  eight-member rehearsal fails on shape drift across review, native landing, teardown, terminal, and
                  closeout; the focused repeated-refresh lifecycle and live exact settlement cover the amended path.
                - _Integrity:_ implemented behavior is distinguished from live proof: the repeated provider refresh,
                  terminal absorption, remote head, and continuation settlement were proven live; remaining provider
                  and lifecycle variants are executable test evidence. The two superseded clauses have implemented
                  replacements, and no essential original intent is deferred or unowned.
                - _Summary:_ thirty-six met, two intentionally superseded, zero unresolved. Success Criteria markers
                  now reflect this terminal report; prior explicit direction declined another broad companion pass.

        - `[x]` **9.1.R.d Revalidate exact compaction-locus succession at work-unit scope**

            - _Goal:_ The terminal report consumes the amended Member 8 boundary and proves the one-locus transfer
              composes with cursorless closeout, exact recovery, delivery-member exclusion, and the already-settled
              delivery review conjunction without replaying unaffected member verification.

            - _Success criteria:_ Work-unit criteria report.
                - _Criteria slice:_ `Success Criteria`, comprising all eight recorded member groups and
                  `Cross-member seams`.
                - _Span:_ complete work-unit diff through `2e774482e` plus this terminal-verification evidence
                  patch; reachability is the complete current tree. The recorded member-boundary deviations remain
                  exact, including Member 8's approved recovery amendment.
                - _Member groups:_ thirty-one criteria met, Member 1 criterion 1 and Member 6 criterion 2 remain
                  intentionally superseded by D7.2b and D5.9, and zero criteria are unresolved. The amended Member 8
                  report reaches `2e774482e` and proves its sixth criterion through exact reader-owned transfer
                  selection, refusal coverage, shared deadline behavior, and real-hook seed-to-audit execution.
                - _Seam 1:_ task-list closure still projects `no-open-task` into `verify-work-unit`; transfer changes
                  only the seed-command cwd, while the unchanged seed and audit readers retain exact branch, head,
                  dirty-set, load-set, and task-cursor validation at the replacement checkout.
                - _Seam 2:_ registered correction and provider-refresh routing are untouched. Work-unit succession
                  accepts only a resolved `work-unit` row and explicitly excludes member, gate, sibling, ambiguous,
                  detached, and unresolved transcript candidates before seed emission.
                - _Seam 3:_ canonical plan/state selection remains upstream of delivery position and host routing;
                  the recovery adapter consumes only the locus reader's topology envelope and creates no delivery
                  identity, reverse lookup, or alternate session authority.
                - _Seam 4:_ native delivery, contribution equivalence, and review applicability are unchanged. The
                  transfer path neither mutates Git nor participates in member review discharge, so the retained
                  exact-head conjunction carries forward without a second equivalence notion.
                - _Seam 5:_ the final full suite and build remain green over the amendment, and the closure-only
                  Markdown delta passes Markdown plus all three ARC contract checks.
                - _Seam 6:_ the composed tree is ready for Candidate attestation. Automatic successor selection is
                  executable E2E evidence until the hook lands on the protected branch; the live recovery audit has
                  independently proven exact recovery at the same replacement checkout.
                - _Integrity:_ implemented automatic selection is distinguished from live proof. The real-hook E2E
                  proves the new pre-merge behavior; the live recovery exercised the unchanged seed/audit chain after
                  manual seeding, and no essential intent is deferred or assigned to an unowned follow-up.
                - _Summary:_ thirty-seven met, two intentionally superseded, zero unresolved. Unaffected member
                  criteria were carried from their exact boundary reports rather than re-derived.

        - `[x]` **9.1.R.e Revalidate stable origin and Candidate isolation at work-unit scope**

            - _Goal:_ The terminal report accounts for the corrected fixed-origin contract and proves Candidate
              ownership keeps repeated stacked-delivery re-entry isolated without weakening foreign-dirt detection,
              transient recovery, review conjunction, or the shared hook deadline.

            - _Success criteria:_ Work-unit criteria report.
                - _Criteria slice:_ `Success Criteria`, comprising all eight recorded member groups and
                  `Cross-member seams`.
                - _Span:_ complete work-unit diff through `7dd8a9ac5` plus this terminal-verification evidence patch;
                  reachability is the complete current tree. Recorded member-boundary deviations remain exact, and
                  only Member 8's fixed-origin amendment changes a carried disposition.
                - _Member groups:_ thirty-two criteria are met, Member 1 criterion 1, Member 6 criterion 2, and
                  Member 8 criterion 6 are intentionally superseded, and zero criteria are unresolved. Member 8's
                  report reaches `7dd8a9ac5`: its corrected criteria prove fixed-origin collision/refusal and
                  checkout-owned Candidate mutation while retaining the shared hook deadline and completed-lineage
                  continuation.
                - _Seam 1:_ terminal task closure still projects `no-open-task` into `verify-work-unit`. Recovery and
                  PreCompact now stay at the marker-owned origin or an ARC-declared ready transient, so exact branch,
                  head, dirty-set, load-set, and task-cursor validation no longer depend on a replacement carrier.
                - _Seam 2:_ registered correction and provider-refresh routing remain operation-local. Member and gate
                  checkouts carry no lifecycle artifacts, while the origin's derived owner permits review response
                  and explicit Candidate mutation only for this work unit.
                - _Seam 3:_ canonical plan and state still select the eight-member chain before delivery position or
                  host routing. Candidate ownership consumes the existing locus and lifecycle indexes without adding
                  delivery identity, mutable state, or a second recovery authority.
                - _Seam 4:_ native delivery, structural contribution equivalence, and exact-head review applicability
                  remain unchanged. Completed-lineage lookup is available only without an active owner, and the
                  retained member-review conjunction cannot be discharged through a foreign Candidate rewrite.
                - _Seam 5:_ Markdown and ARC contract lint, TypeScript and shell lint, both typechecks, package build,
                  11,078 passing tests, aggregate preflight, and complete diff hygiene pass over the amended tree.
                - _Seam 6:_ the composed tree is ready for Candidate re-attestation and integration. Real carrier
                  refusal, restored-origin success, archived continuation, and the stationary three-member cycle
                  provide executable forcing evidence for the corrected union behavior.
                - _Integrity:_ the fixed-origin and Candidate boundaries are executable behavior, while the recorded
                  live provider observations remain distinct. No essential intent is deferred or assigned to an
                  unowned follow-up; the foreign Candidate recovery stash remains visible and untouched.
                - _Summary:_ thirty-eight met, three intentionally superseded, zero unresolved. The prior broad
                  companion-pass decline carries forward; Member 8 consumed the complete Heavy two-pass allowance,
                  and no third independent pass is claimed.

        - `[x]` **9.1.R.f Revalidate the corrective transition matrix at work-unit scope**

            - _Goal:_ The terminal report consumes the amended Member 4 and Member 7 boundaries and proves the full
              delivery remains coherent across physical ref/state authority, corrective Candidate continuation,
              compaction re-entry, incremental review non-settlement, exact member ordering, and terminal review
              conjunction without replaying private review or re-deriving unaffected member criteria.

            - _Outcome:_ Work-unit criteria report.
                - _Criteria slice:_ `Success Criteria`, comprising all eight recorded member groups and
                  `Cross-member seams`.
                - _Span:_ complete work-unit diff through `a491cff17` plus the exact Member 4 tree `805749aa0`,
                  Member 7 tree `2f9822d92`, and this terminal evidence patch; reachability is the final corrective
                  worktree. Previously recorded boundary-order deviations remain attached to their member reports.
                - _Member groups:_ thirty-eight criteria are met, Member 1 criterion 1, Member 6 criterion 2, and
                  Member 8 criterion 6 remain intentionally superseded, and zero criteria are unresolved. Member 4
                  now proves physical ref authority at its published head; Member 7 proves the renewed public
                  Candidate-to-terminal review progression at its published head.
                - _Seam 1:_ corrective tasks and verification remain derived substages of stored `Integrating`.
                  Interruption coverage refreshes Candidate/boundary evidence across state revisions, and the live
                  recovery audit reproduced the exact origin, branch, head, dirty set, load set, and current cursor.
                - _Seam 2:_ published correction resumes the retained hosted-member conjunction without private
                  Frontline or generic prepublication. Existing provider-refresh and review-fix continuations remain
                  unchanged and no review finding becomes task-list authority.
                - _Seam 3:_ canonical plan and versioned state remain upstream of member status. The real eight-member
                  rehearsal materializes exact refs from Git-backed stores, validates the persisted continuation,
                  rejects stale evidence, and advances only the first outstanding member.
                - _Seam 4:_ materialization reuses the existing reserved operation to repair only observed absence;
                  moved or unavailable physical refs refuse. Review applicability continues to use the existing
                  structural arbiter, while incremental coverage changes neither discharge nor equivalence authority.
                - _Seam 5:_ both isolated member trees build and pass their focused suites. The aggregate build and
                  full suite pass with 855 test files and 11,154 tests passing, plus one intentional skip each;
                  Markdown, ARC contracts, TypeScript and shell lint, and both typechecks pass.
                - _Seam 6:_ the correction trees attach cleanly to the historical Member 4 and Member 7 heads and are
                  ready for ordinary correction-candidate construction. The live read-only position verb classifies
                  the current append-only movement as `review-fix-routing-required` from stored `Integrating`; no
                  provider or public delivery state moved during validation.
                - _Integrity:_ the general singleton-withdrawal lifecycle gap is durably routed to
                  `wu-lifecycle-state-model` with `review-checkout-lifecycle` coordination. A reusable scenario engine
                  remains owned by `composable-workflows` and review architecture; neither concern rides this WU or
                  remains unowned.
                - _Summary:_ thirty-eight met, three intentionally superseded, zero unresolved. Unaffected member
                  criteria carry only from their exact boundary reports; the corrected Member 4 and Member 7 groups
                  were rechecked against their historical-head trees and the complete union.

        - `[x]` **9.1.R.g Revalidate stale-continuation recovery at work-unit scope**

            - _Goal:_ Consume the amended Member 7 report and prove exact Candidate renewal composes with compaction
              recovery, provider-refresh state progression, first-outstanding member review, and the complete retained
              conjunction without reopening execution verification or re-deriving unaffected member criteria.

            - _Outcome:_ The amended Member 7 report carries three met criteria into the retained work-unit report.
              External operator refresh moved exactly Members 5–7, ARC adopted their exact chain at state revision
              129, and the scoped Member 4/6 continuation passed 28 focused tests before exact acknowledgment advanced
              state to 130. Against the resulting genuinely stale state-127 public continuation, session-init stayed
              in `Integrating`, typed entry selected ordinary Candidate renewal, attestation version-wrote the exact
              state-130 continuation, and the next inspection resumed first-outstanding hosted review. The correction
              also passed 46 focused unit tests, four workflow-contract tests, both typechecks, targeted ESLint,
              Markdown lint, all ARC contract audits, build, and diff hygiene. No execution verification, whole-WU
              verification, Frontline, prepublication, unaffected member walk, or new adversarial pass ran; all other
              retained member reports and the complete conjunction remain unchanged.

        - _Outcome:_ The rebound tree matches the reviewed delivery content at `66da99a8f` with tree `7758a3b4a`;
          delivery state revision 94 has acknowledged the exact Member 7 verification continuation and blocks
          terminal rebinding until the freshly verified Candidate root is established. The ordinary moved-head
          production path reaches that canonical re-root without weakening D8.2's complete retained-member
          conjunction.

- _Forward amendment (2026-09-03):_ The D5.14 and D9.9 corrections added Success Criteria 49 and 50 after this
  terminal report. Consume the amended Member 7 and Member 8 boundary reports and revalidate the correction entry
  seam and the authoring surface without re-deriving unchanged member criteria or repeating an unchanged full-suite
  gate.

    - `[x]` **9.1.R.h Revalidate the correction entry and authoring amendments at work-unit scope**

        - _Goal:_ The terminal report accounts for Success Criteria 49 and 50, and the amended entry seam and
          authoring verbs compose with delivery entry, the resumable correction procedure, Candidate transitions,
          and closeout without reopening execution verification or repeating an unaffected member walk.

        - _Outcome:_ Work-unit criteria report.
            - _Criteria slice:_ all eight recorded member groups plus `Cross-member seams`.
            - _Span:_ complete work-unit diff through `5464871b3` plus this terminal-report patch; reachability is
              the complete staged tree. Member 7's approved entry-seam amendment and Member 8's approved typed-
              authoring amendment remain explicit boundary-order deviations in their recorded reports.
            - _Member groups:_ thirty-six criteria met, three intentionally superseded, and none unresolved. The
              Member 7 report carries all six current loci. The corrected Member 8 report carries all nine current
              loci, including the authoring verbs' shared executor, exact guard, refusal, and replay evidence.
            - _Seam 1:_ task closure and Candidate transitions stay exact. The integration-entry classifier adds no
              authority: lifecycle-only or unavailable deltas retain closeout, while an ambiguous non-lifecycle
              delta stops before choosing verification or member correction.
            - _Seam 2:_ review-fix continuation remains selector-free and resumable. Its typed authoring verbs expose
              the same guarded executors the driver dispatches in process, so interrupted replay neither hand-writes
              a reserved ref nor opens a second mutation route.
            - _Seam 3:_ canonical plan, state, and originating-checkout ownership remain upstream of member routing,
              authoring, review, and Candidate mutation. Neither amendment introduces content attribution, a record,
              a locus lifecycle, or provider-specific durable state.
            - _Seam 4:_ provider-native refresh and ordered stack landing retain their existing member boundaries;
              the entry stop selects neither candidate route, and authoring replays only an exact guarded request.
            - _Seam 5:_ the implementation gate evidence remains bound to `c2a231b78`; the subsequent delta contains
              only task-list, meta, and Candidate-boundary records, and the final documentation gates pass.
            - _Seam 6:_ the complete union is ready for Candidate re-attestation after the retained Member 7 review
              authority is consumed. Forty-two criteria are met, three are intentionally superseded, and none remain
              unresolved; no unaffected member criterion was re-derived.
            - _Integrity:_ the typed entry and authoring behaviors are executable implementation evidence, while the
              live correction-cycle observations remain identified as live proof. No essential intent is deferred
              or assigned to an unowned follow-up.
            - _Summary:_ forty-two met, three intentionally superseded, zero unresolved. The prior declined broad
              adversarial companion carries forward; this narrow amendment adds no new complete-pass claim.

- _Forward amendment (2026-09-04):_ Task 8.5.R.k added the terminal publication lease after the latest terminal
  report. Consume that Member 8 boundary amendment and the deterministic gate-fixture repairs found by the fresh
  full suite without replaying unaffected member verification or spending another provider review.

    - `[x]` **9.1.R.i Revalidate terminal publication gating at work-unit scope**

        - _Goal:_ The complete retained criteria union accounts for the terminal publication lease and remains
          coherent across correction entry, Candidate transitions, provider refresh, hosted review, and closeout.

        - _Outcome:_ Work-unit criteria report.
            - _Criteria slice:_ all eight recorded member groups plus `Cross-member seams`.
            - _Span:_ complete work-unit diff through `acbdaa740` plus this exact gate-fixture and terminal-report
              patch; reachability is the complete staged tree. The Member 8 report now reaches Task 8.5.R.k, and all
              prior member-boundary deviations remain recorded at their original loci.
            - _Member groups:_ thirty-six criteria are met, three remain intentionally superseded, and none are
              unresolved. Member 8's nine-criterion report now includes the publication-lease behavior: an unpushed
              clean terminal descendant remains at `authoring-required`, the exact published head reconciles, and
              unrelated hosted movement refuses before dispatch.
            - _Seam 1:_ structural task closure, Candidate subject exactness, and deliberate re-rooting remain the
              verification authority. The malformed closed-parent/open-descendant cursor and lost in-session route
              selection exposed by compaction are routed to their existing backlog owners and are not claimed fixed
              by this amendment.
            - _Seam 2:_ review-fix continuation remains selector-free and returns its existing typed authoring stop
              with the canonical deriving fact, locus, and submit-ready guidance. Publication stays an ordinary
              author effect; the driver records no commit, push, or reconciliation effect before the hosted head is
              exact.
            - _Seam 3:_ canonical plan, versioned delivery state, originating checkout, terminal coordinates, and
              hosted request jointly establish publication exactness. The repair adds no delivery identity, durable
              field, standing authority, or alternate mutation route.
            - _Seam 4:_ provider refresh, member ordering, contribution equivalence, and native landing are
              unchanged. The corrected refresh fixture proves that an occupied changed-member ref refuses before
              provider preparation, while the production-style correction fixture retains the adjacent local and
              hosted review routes without dirtying its authoring locus.
            - _Seam 5:_ Markdown and ARC contract lint, TypeScript and shell lint, both typechecks, the package
              build, and the full suite pass over the amendment: 865 test files and 11,421 tests pass, with one
              intentional skip each. Targeted ESLint, the focused production E2E, and diff hygiene also pass.
            - _Seam 6:_ forty-two criteria are met, three are intentionally superseded, and none remain unresolved.
              The composed tree is ready for deliberate Candidate re-rooting before Member 8's approved incremental
              hosted pass; no provider review was spent while verification was stale.
            - _Integrity:_ the publication behavior is executable implementation evidence, the live unpushed stop
              is identified as its prompting observation, and the cursor/provenance defects are captured as
              out-of-WU follow-up rather than hidden inside this report. The Heavy two-pass allowance remains
              exhausted, so this primary correction walk makes no new independent adversarial-pass claim.
            - _Summary:_ forty-two met, three intentionally superseded, zero unresolved.

- _Forward correction (2026-09-04):_ The terminal review correction was recorded as a second parent after
  `Complete verification`, and the criterion-identity contract landed without regenerating this work unit's earlier
  boundary reports. Restore the single terminal parent and regenerate the unpublished development records in place;
  add no compatibility reader or migration contract.

    - `[x]` **9.1.R.j Preserve the terminal member's stacked base across proved head advance**

        - _Goal:_ Work-unit review status resolves the retained terminal member pull request after a proved
          append-only Candidate advance, preserving its canonical predecessor base and returning the outstanding
          member action instead of a false `base-mismatch` refusal.

        - _Outcome:_ Status selection now retains the resolved member's state head solely for stacked-base lookup
          while the proved current head binds the exact request. Live Member 8 status resolved PR 557 on its
          predecessor branch, retained all seven earlier discharges, and returned its exact pass-3 ceiling and
          terminus choices; singleton base admission and unproved-movement refusal remain unchanged.

    - `[x]` **9.1.R.k Regenerate digest-bound criteria reports**

        - _Goal:_ The current 45 Success Criteria identities bind the existing eight member reports and terminal seam
          report by exact locus and digest, so the completed evidence survives only where the current immutable text
          still matches and this pre-release work unit needs no compatibility mechanism.

        - _Outcome:_ Digest-bound criteria report regeneration.
            - _Regeneration basis:_ all 39 member loci resolve in prior exact-locus reports. The six terminal
              seam entries were rewalked from the latest work-unit report and the relocated terminal-base
              correction. Existing evidence and states carry only after the current locus resolves.
            - _Digest normalization:_ SHA-256 over the root criterion's parsed first paragraph after removing
              its bullet and checkbox marker and folding Markdown soft line breaks; marker state, wrapping, and
              nested disposition annotations are excluded.
            - _Criteria slice:_ `Success Criteria > Member 1 — member-boundary-verification`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 1.8.R.b -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 1 — member-boundary-verification > 1`;
              _criterion-digest:_ `sha256:1b3a07ca39bc9c4b8ebfad90bc488d00a9e73e87898ac4a48d45c85f8864f860`;
              _State:_ `[~]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 1 — member-boundary-verification > 2`;
              _criterion-digest:_ `sha256:748a9b8c0c465e2f8ecd3e19b6bbf0642da114b550170c5e238fd4dce92065bd`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 1 met, 1 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 2 — contribution-identity`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 2.6 -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 1`;
              _criterion-digest:_ `sha256:3db47321cab1d64f10711e208deb12da3b7f240e8fccae228d81601b2dd55240`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 2`;
              _criterion-digest:_ `sha256:d3f00bbf106fd2de20c1be0871446ef4447c59111fbcc6e4a1293e0aaed9aa57`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 2 — contribution-identity > 3`;
              _criterion-digest:_ `sha256:cb5e08ccf14f5054f1ce2f7d4fe1759d06035a452bd890dd1b5252099aed8a65`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 3 met, 0 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 3 — review-gate-resolution`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 3.5 and Task 9.1.R.j -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 3 — review-gate-resolution > 1`;
              _criterion-digest:_ `sha256:ec2c2f6b0796634f88b2dc64f280ad1d43c013b902d871cf802d80c4b3100f39`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 1 met, 0 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 4 — topology-transition`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 4.7.R.b -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 4 — topology-transition > 1`;
              _criterion-digest:_ `sha256:90e248ded8e8482bab26fb6622adec6c2274ec73dba20d780ace882bbdc44ba7`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 1 met, 0 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 5 — terminal-integration`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 5.7.R.g -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 1`;
              _criterion-digest:_ `sha256:e12067d88d83733a5daacf74ed913f8316f9d881e69c40a63fb18ced1ca0d1b7`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 2`;
              _criterion-digest:_ `sha256:37af4ca129170e8c7614b3319b7958198b4dadb658d1838a1805092dbaa2b09b`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 3`;
              _criterion-digest:_ `sha256:132fb4468451f8df8673537b42ec987ec4005b28c8b7fbb5a875f0efdfa794af`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 5 — terminal-integration > 4`;
              _criterion-digest:_ `sha256:f97a2bb5463eafafc2c5f77085e2016fa07956763f20ba0479b6930511a90c31`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 4 met, 0 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 6 — refresh-and-native-landing`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 6.11.R.z.c.c.b -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 1`;
              _criterion-digest:_ `sha256:e45fde4acc9cfed521f3f7161f685b5204741f32c1722eb5bee70e26cd13a80d`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 2`;
              _criterion-digest:_ `sha256:d95cdf7054a38dd9ef1b5ec9e247d292682afdff68bf0c3d33b5849d61cb9539`;
              _State:_ `[~]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 3`;
              _criterion-digest:_ `sha256:f58864b841e8fbac1ea4db7bba62675d278c575472b2a79d821d7999befa3304`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 4`;
              _criterion-digest:_ `sha256:bf96b2c754f186fa501772463e19b29b8e4fe777a3ae710a67629e65b38f3ce7`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 5`;
              _criterion-digest:_ `sha256:44de4fba2a5e6f7b96520fc0f82cd9528ad7b0bb176cec59a562f7b809d2a362`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 6`;
              _criterion-digest:_ `sha256:75fa04daea4ffe5b9fdc77e9a3403b5ee945ca1d92f0772d7cd12cecc03d15f3`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 7`;
              _criterion-digest:_ `sha256:9074d6415d9ac684eefd53daf8758a317f268037337c7d7370416d6e9fcbda0b`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 8`;
              _criterion-digest:_ `sha256:1f909dc1e831b56ea0d0c7d2a8ef72eca85a4f0c986e7c23db12ea70aac2b950`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 9`;
              _criterion-digest:_ `sha256:4b88f3db4550a11e32fd66ed3e46ae3deee9b6e2d71693b1b2ea70460100e385`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 10`;
              _criterion-digest:_ `sha256:0e13dbc412c6e93c258935b8fa4d23dd7e7567b020d89dbea935928c980c9e24`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 11`;
              _criterion-digest:_ `sha256:82fb5fc78bbf59c30a7589acda3f1634227491ac01565551a47e787ecfc8cd99`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 12`;
              _criterion-digest:_ `sha256:f8aa90c09818b5145419c12d0f8d7c3cfbf11b91053963253691a9d37af0a9e0`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 6 — refresh-and-native-landing > 13`;
              _criterion-digest:_ `sha256:8e7e936d59bbc83ead9fb0e022f038301e48ef235fdd16daebd5375a9b104885`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 12 met, 1 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 7 — review-fan-out`.
            - _Span:_ exact recorded span and boundary-order deviations in Tasks 7.7.R.x–7.7.R.ac -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 1`;
              _criterion-digest:_ `sha256:44218da267415d541532b9a18ec7279d88418b22d048ce5b548ef029cb1b11ad`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 2`;
              _criterion-digest:_ `sha256:885873d1d7d13a01106c5ae4586bec158cff2f3a94ec255a7f476d4d3c039ec6`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 3`;
              _criterion-digest:_ `sha256:209edac1da9cbaba26c40b757e62f55960880e62947ba1a3e37abf928f7d61ea`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 4`;
              _criterion-digest:_ `sha256:3dbea54c1f0b785f7297ccc7e0cddf16b5b2466e7b3adebb3030f8d24fa9dd65`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 5`;
              _criterion-digest:_ `sha256:65eef3825f1d4230c7b06d8491b954a0794149de8691b314d1b9eec36d829c6d`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 7 — review-fan-out > 6`;
              _criterion-digest:_ `sha256:7ff005972cd6fd2054df8145446149a6bd9c7c61c131f5fcadf34a79be3ee725`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 6 met, 0 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Member 8 — retirement-and-doctrine`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 8.5 and its revisions through Task
              8.5.R.k - `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 1`;
              _criterion-digest:_ `sha256:495d7dd1795f0a767340e8cd63ee20871318c83e9f4af274177da3f8cefbf053`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 2`;
              _criterion-digest:_ `sha256:4f39cf4696d4117704b6d98475561722551ec40468b0ab597cd27c89fa969c75`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 3`;
              _criterion-digest:_ `sha256:344666833311630b33cc13b73082fd164c9a555639d3bcd787469f8651ea36ca`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 4`;
              _criterion-digest:_ `sha256:171e0856ad9749c2c018d0d166be20c0d0499d47205791e28854fecdf4c01b36`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 5`;
              _criterion-digest:_ `sha256:8c287e8d7f231afad572ec0df1aa168be9f6056ade7a6f38ff6a5719b57ff07c`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 6`;
              _criterion-digest:_ `sha256:2b65ec545217a80dfceba7c597496d32a5bea0aeeab9641a85248c31531cedb2`;
              _State:_ `[~]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 7`;
              _criterion-digest:_ `sha256:ebe15c79af5979f531f707c5b82d5574b0c915c17e01660fc1aa8dde0b45ecc4`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 8`;
              _criterion-digest:_ `sha256:e1312da73d5135ce8933ce9f0ba97db118f6f4fc4d02e7ea37c4581a50401ed4`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Member 8 — retirement-and-doctrine > 9`;
              _criterion-digest:_ `sha256:92753cb4cf6b7a06106f0cb946ea0170ca74577882705093a2e798fce958d5c0`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 8 met, 1 superseded, zero unresolved.
            - _Criteria slice:_ `Success Criteria > Cross-member seams`.
            - _Span:_ exact recorded span and boundary-order deviations in Task 9.1.R.i and Task 9.1.R.j -
              `tasks-delivery-native-stack-composition.md`; reachability is the current task-list tree.
            - _Evidence basis:_ the cited exact-locus report lineage, revalidated against the current criterion
              text; each entry below carries that basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 1`;
              _criterion-digest:_ `sha256:ebe680e00d4778b3d0630c64c584818c083eebd75235d9fe5d21f28c0cd20551`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 2`;
              _criterion-digest:_ `sha256:91d1ed34ebe0fddd11dd0ac462b41a1cf484ceba3e3ba350e8030a1434f4b409`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 3`;
              _criterion-digest:_ `sha256:2db4ede9922464c68336f7d70b7fe540edc5024a651b01d668d85c4d3bc1f4f5`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 4`;
              _criterion-digest:_ `sha256:5bfad955035111a104174b881c44a4cd2d181e17c0497b14494233980e0c8e52`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 5`;
              _criterion-digest:_ `sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Criterion:_ `Success Criteria > Cross-member seams > 6`;
              _criterion-digest:_ `sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f`;
              _State:_ `[x]`; _Evidence:_ the cited group evidence basis.
            - _Summary:_ 6 met, 0 superseded, zero unresolved.
            - _Union summary:_ 42 met, three superseded, zero unresolved across 45 unique loci.

        - _Verification:_ Independent recomputation matched all 45 recorded digests and states at 45 unique loci;
          Phase 9 contains one parent; task structure closes with no open task; targeted Markdown lint and all three
          ARC contract checks pass. The changed path is Markdown-only, so the unchanged code suite was not repeated.

- _Forward correction (2026-09-04):_ Accepting the final delivery member's exact Owner terminus committed its boundary
  record onto that same member branch, advanced the public head, and immediately re-offered the decision. Reuse the
  existing terminal record-advance proof so the accepted authority survives only its provably mechanical suffix.

    - `[x]` **9.1.R.l Preserve the final member terminus across its own record commit**

        - _Goal:_ The final delivery member's accepted Owner terminus settles review after its boundary record is
          committed and pushed, while substantive or unproved head movement still requires fresh review authority.

        - _Outcome:_ Work-unit status now composes the existing terminal record-advance proof for the final member and
          applies the stored terminus only across that mechanically represented suffix. Exact identity, pass-count,
          and pending-intervention guards remain authoritative; a production-style Git lifecycle settles after the
          terminus boundary commit without another Owner decision or provider request.

- _Forward correction (2026-09-04):_ The terminal green union masked deterministic red cumulative member trees, and
  initial publication did not require the workflow-owned gate outcome it bracketed. Reconcile the repaired member
  boundaries with the work-unit verification contract before any new review or CI spend.

    - `[x]` **9.1.R.m Revalidate independent member gate readiness at work-unit scope**

        - _Goal:_ Every current delivery member is independently gate-clean at its exact cumulative tree, initial
          publication mechanically refuses absent or stale evidence, and the final union remains unchanged except
          for the bounded admission repair and its tests/docs.

        - _Outcome:_ The amended Member 1, 3, and 4 reports bind exact Tier 2 results to cumulative trees
          `8bdf07dc7`, `4b88f29de`, and `e7ec11979`. The revision-428 chain is contiguous and every stored head
          resolves to its stored tree, so Member 2 inherits the first repair and Members 5–8 inherit all three;
          final-union Tier 3 proves no later regression. The 45 prior criterion digests remain exact, and the two
          added loci close the union at 44 met, three superseded, and zero unresolved.

- _Forward correction (2026-09-05):_ The first atomic landing preparation persisted its reservation after the
  caller lost the response, and recovery could not distinguish that prepared-only state from a submission whose
  provider identity was lost. Preserve the conservative submitted-effect boundary while making preparation
  resumable and its independent readiness reads bounded by the slowest member rather than their sum.

    - `[x]` **9.1.R.n Recover an interrupted prepared native landing exactly**

        - _Goal:_ A lost native preparation response returns the exact same landing interlock without provider
          observation or mutation; provider identity-loss recovery remains fail-closed only after submission begins;
          and set-wide readiness runs concurrently with exact member-specific refusal diagnostics.

        - _Outcome:_ Native landing reservations now persist their exact arm and prepared/submitting phase; prepared
          recovery returns the exact submit-ready presentation through native status and general reconciliation
          without provider access, submission CAS-publishes its phase before the provider call, and concurrent
          readiness reports every failed member/head in plan order. The packaged and installed workflow routes that
          envelope through the existing integration interlock, with focused unit, contract, and built-CLI E2E proof.

        - _Verification:_ Fresh Tier 3 passed Markdown and ARC contract lint, TypeScript and shell lint, both
          typechecks, package build, and the complete matrix: 865 test files and 11,433 tests passed, with one
          intentional skip each. The first matrix run found two stale direct-reservation fixtures; an exhaustive
          call-site scan proved those were the only omitted native-arm discriminators, their focused 22-test E2E and
          13-test unit files passed, and the complete matrix then passed. The 47-criterion section remains
          byte-identical to the recorded `1aed04955` union, so all eight exact member reports carry unchanged; the
          native recovery and submission-boundary seam remains coherent at 44 met, three superseded, zero unresolved.

- _Forward correction (2026-09-05):_ Live seven-member preparation ran one complete eight-member review reduction
  per selected member, multiplying hosted reads and falsely classifying six exact green, discharged heads as
  review-unsettled. Share the authoritative conjunction across only this prepared set while preserving each
  member's exact host and check reads.

    - `[ ]` **9.1.R.o Compose atomic readiness from one delivery-review conjunction**

        - _Goal:_ Native atomic preparation performs one routed delivery-review reduction per selected set, fans
          only exact member request/head/check readiness, and reserves the effect only when every member is ready.

        - _Build:_ `test-first` (one behavior at a time):
            1. Prove two members remain ready when a full delivery status source can be consumed only once.
            2. Reuse that one settled conjunction through target-bound status ports while retaining independent
               exact member observations.
            3. Re-run the live seven-member preparation and require a submit-ready reservation within the slowest
               bounded member read rather than seven complete delivery reductions.

        - _Live-acceptance amendment (2026-09-05):_ Preparation completed, but the first approved submit repeated
          the full delivery-review reduction through its member-shaped final-revalidation dependency and refused
          before lock release or provider mutation. Close the same concern through the terminal handoff rather than
          repairing one more callsite in isolation.

            4. Make native submit request one set-scoped readiness result, with one shared routed conjunction and
               independent exact request/head/check observations for every reserved member.
            5. Prove the set boundary fails before the correction when its routed admission can be consumed once,
               while merge policy, lock release, phase persistence, and provider submission retain their order.
            6. Drive the built CLI from recovered preparation through submit, persisted effect polling, all-landed
               settlement, fresh position, highest-member teardown, and `terminal-checkpoint`.
            7. Re-run the live seven-member preparation and exact-head integration interlock on the corrected head;
               require the approved submit to cross the provider boundary without repeated review reduction.

        - _Prepared-submit amendment (2026-09-05):_ The shared submission reduction still consumed ordinary
          corrective review status, whose idle-state and live-Candidate guards necessarily reject the reservation
          and later terminal-only correction commits. Preserve those guards for every ordinary caller while letting
          the exact prepared submit validate the review subject that existed immediately before its own reservation.

            8. Reproduce the live refusal with a real corrective delivery continuation, hosted reservation, active
               prepared native operation, and a terminal work-unit commit after preparation.
            9. Bind the exception to the exact current plan and prepared operation, validate the continuation against
               its pre-reservation idle state and terminal coordinate, and retain fresh per-member host and check
               observations. Prove ordinary review status remains blocked during the same reservation.
            10. Re-run the live preserved seven-member submit under a fresh exact-head integration interlock and
                require it to cross the provider boundary before closing this corrective task.

        - _Terminal-target amendment (2026-09-05):_ The exact prepared scope reached review-target resolution, but
          that reducer still substituted PR 557's later work-unit head for the historical unselected terminal target
          and rejected the conjunction. Retain the prepared terminal review coordinate without weakening any member
          in the approved seven-member effect.

            11. Make the production E2E advance the fake terminal pull request together with the local work-unit head
                and require the unchanged submit to fail before the resolver correction.
            12. Retain only the exact prepared operation's unselected terminal historical head while freshly checking
                the same open request identity and ref; keep every affected member exact at its current host head.
            13. Re-run the live preserved seven-member submit under a newly presented exact interlock and require the
                provider boundary to be crossed before closing this corrective task.

        - _Atomic-settlement amendment (2026-09-05):_ The live effect merged all seven requests into one aggregate
          commit, but settlement treated their shared merge coordinate as seven independent member merge commits and
          rejected the completed effect as ambiguous.

            14. Reproduce the exact GitHub result in the production E2E: every selected request is merged at its
                authored head and base, every request reports the same aggregate merge commit, and the protected
                target advances to that commit.
            15. Prove the complete request set and common aggregate merge once against the highest selected head;
                retain refusal for a partial set, divergent merge coordinates, or an invalid aggregate result.
            16. Reconcile the retained live effect, require the completed seven-member landing to settle, then
                continue through position, member teardown, and the terminal checkpoint.

        - _Post-landing entry amendment (2026-09-05):_ After settlement, the integration seam treated the seven
          intentionally retained teardown bindings as seven still-reviewable members. That fabricated a Member 1
          correction fork, blocked session resolution, and made compaction recovery unable to load the work unit.

            17. Reproduce the retained-binding false positive after the protected target reaches the highest
                non-terminal cumulative tree while every landed request binding remains in Delivery State.
            18. Exclude only that exact settled prefix from outstanding-review selection; retain selection of the
                first bound member above a partially settled prefix and the existing ambiguity before landing.
            19. Require the live entry to route the terminal delta to Candidate verification, then require a fresh
                compaction seed and recovery audit to resolve this checkout without manual locus reconstruction.

        - _Terminal-closeout amendment (2026-09-05):_ Candidate renewal after aggregate landing exposed three
          coupled false stops: the review boundary still claimed hosted work, review status rebound landed member
          spans to the new Candidate base, and teardown rejected each request's retained stacked base.

            20. Reproduce a post-landing Candidate root beyond the aggregate target and require exact retained member
                coordinates to preserve their authored review spans. Keep the existing sequential changed-target
                reconstruction when state coordinates differ from merged request heads.
            21. Replace the delivery reservation's hosted-specific locus and action with one provider-neutral
                continuation across entry, status, terminus, correction, checkpoint, session, and workflow consumers.
                Reserve hosted wording and spend for an actual hosted-request result only.
            22. Route a same-Candidate stale continuation with recognized subject movement through the ordinary
                attestation renewal, while retaining mismatch refusal for different Candidates and non-stale state.
            23. Accept teardown only against the protected target or the selected landed member's exact immediate
                predecessor ref, using the same derived base set in initial execution, final reobservation, and
                interrupted-operation recovery. Prove an arbitrary stacked base still refuses.
            24. Renew the live boundary, record the already-directed Owner terminus for the exact terminal head,
                tear down the landed non-terminal refs, and require the fresh position to reach terminal checkpoint.

        - _Past-review terminology amendment (2026-09-05):_ The provider-neutral continuation still told the
          operator to continue delivery review after the Owner had ended review. Make the boundary describe only the
          unresolved status reduction; reserve review language and spend authority for a downstream explicit review
          action.

            25. Rename the canonical locus, action, entry field, and correction dispatch to delivery-status terms
                across schemas, consumers, recovery, session projection, and both workflow copies.
            26. Prove the work-unit reducer may return settled immediately from the neutral action and that only an
                exact hosted-request result claims review work; retain exact read-only normalization of the older
                delivery-shaped hosted boundary.

        - _Changed-Candidate recovery amendment (2026-09-05):_ The live closeout correctly routed to Candidate
          verification, but the session reader discarded the integration frame because its boundary guard ran before
          the delivery-entry reducer could identify that verified route.

            27. Let a structurally closed, non-current Integrating Candidate project `verify-work-unit` only when
                delivery entry independently returns `candidate-verification-required`; carry no integration
                boundary and retain the ordinary mismatch refusal for every other state.
            28. Prove the exact live seed and recovery audit select the originating checkout, integration session,
                verification workflow, closed task cursor, and matching dirty path set without reconstructing or
                reviving review authority.

        - _Base-moved terminus amendment (2026-09-05):_ The renewed exact terminal Candidate retained the Owner's
          no-further-review direction, but status hid the submit-ready terminus offer behind a base-moved checkpoint
          rerun. That left no review decision to make and entered reconcile before the required teardown and top
          retarget.

            29. Retain the exact first-outstanding member terminus offer on `base-moved` only after a completed
                complete pass; keep checkpoint rerun as the default and preserve every base, check, and zero-pass
                refusal.
            30. Prove the built live status exposes the already-directed terminal offer, record it, then require the
                existing continuation to rebind exact terminal coordinates and resume teardown without review spend.

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

- `[x]` A member's criteria walk never substitutes for executable quality gates: its close-out still requires the
  task-loop Tier 2 run, and initial publication separately requires a passed Tier 2 result for the exact filtered
  candidate tree so a later green union cannot mask an earlier broken boundary.

  **Boundary clarification (2026-09-04):** Member 1's walk evaluates the close-out clause. The separately stated
  publication clause points to the matching Member 4 criterion, whose own boundary owns that later evidence.

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

- `[x]` Initial publication consumes one ephemeral passed Tier 2 result for every candidate in plan order, bound to
  its exact deliverable ID, head, and tree and revalidated inside the fresh mutation window; missing, duplicate,
  failed, reordered, or stale evidence refuses before any ref push or host mutation, with no durable gate store.

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
  entry-emitted state revision and canonical continuation digest first appends an exact scoped verification response
  to the existing Candidate lineage and then clears the continuation by version check. Replay converges both before
  and after state clear, while mismatched, intervening, or stale requests refuse. The exact returned attestation
  action refreshes the public boundary and fresh integration entry resumes hosted member review without whole-WU
  verification. Ordinary refreshes record no continuation; no provider fact, proof, review verdict, generalized
  workflow state, or authority beyond that exact scoped verification becomes durable.

- `[x]` An attended dependent-suffix adoption returns a mutation-free exact consent input when mechanical reapply
  conflicts, accepts only the unchanged freshly reobserved conflict set, and preserves structural proof for every
  unconflicted member. Approved conflicts are changed contributions, so settlement and replay retain the selected
  member plus every changed dependent in plan order through exact acknowledgment; decline restores the external refs
  by lease, and no proof, provider fact, check result, or reusable approval record becomes durable.

- `[x]` A repeated provider-native correction to the same selected member remains executable after a prior
  contribution-equivalent suffix adoption. If the recorded predecessor is no longer contained by the first
  dependent, isolated preparation seeds the official provider refresh only from one unique common fork boundary;
  missing or ambiguous boundaries refuse before mutation, and the result still passes the exact fixed-prefix,
  complete-chain, and structural-contribution checks before reservation or publication.

- `[x]` Fresh provider refresh and external adoption check the exact terminal authoring locus before reservation or
  canonical publication; an unready top leaves state and member refs untouched, while a post-reservation block names
  the retained operation and typed next action. Repeated terminal absorption uses the reserved prior highest-member
  coordinate as its logical merge base, carries only the refreshed contribution into the residual top, preserves
  exact two-parent ancestry, and directs genuine conflicts to attended resolution without replaying
  contribution-equivalent suffix history.

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

- `[x]` Registered dependent refresh, complete unregistered rematerialization, and exact terminal correction rebind
  all install and return the same pending scoped-verification continuation. Response loss re-enters that continuation
  without repeating mutation or routing to whole-WU verification, Frontline, or generic prepublication; no second
  state mechanism, review authority, or convergence policy exists.

- `[x]` An approved member correction advances through one resumable, typed delivery procedure that stops only at
  existing judgment, project-gate, conflict, review-policy, and integration-authority boundaries. Cursorless recovery
  resumes that exact procedure; structurally contained predecessor movement absorbs content-neutrally; and Tier 1
  reuse is admitted only for an exact already-green rebound tree. No orchestration record, quality ledger, generic
  workflow engine, or convergence policy is added.

- `[x]` A non-current Candidate whose work-unit branch carries non-lifecycle content while a non-terminal member
  review is outstanding does not receive a confident verification-closeout route. The integration entry seam
  classifies the terminal delta and returns a typed ambiguous stop naming both candidate routes, the classified
  delta, the outstanding member, and each route's exact next action. Lifecycle-artifact-only deltas, deltas carried
  with no outstanding member review, and an unavailable classification retain the existing closeout route, and no
  content attribution, member selection, or new record is introduced.

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

- `[~]` Codex compaction seeding follows a clean-checkout transfer only when the derived locus reader proves the
  harness-root checkout unresolved and exactly one transcript-named registered checkout resolved for the same work
  unit. Exact seed and audit validation bind the replacement checkout; member, gate, sibling, ambiguous, detached,
  and unresolved candidates remain excluded, and nested execution time fits the enclosing hook budget.
    - _Superseded:_ automatic work-unit checkout succession normalized an unclosed workaround; the shared deadline
      remains required and is retained by the fixed-origin criterion below.

- `[x]` The marker-owned originating checkout remains the work unit's sole physical session and recovery locus until
  teardown. Moving its branch produces an explicit same-work-unit collision and no replacement checkout resolves;
  restoring the branch restores the origin. PreCompact follows only that origin or an ARC-declared ready transient,
  while valid slow seed execution retains the coherent shared hook deadline.

- `[x]` Repeated stacked-delivery correction, review, verification, and integration re-entry stays in the origin
  without foreign Candidate rewrites. An active checkout permits review-response and Candidate mutation only for its
  owning work unit; completed lineages remain available when no active work unit owns the checkout, foreign dirt
  stays blocking, and cross-work-unit refusal makes no file or index mutation.

- `[x]` An authoring replay interrupted between the work-unit-branch commit and its member-ref publication completes
  through typed verbs rather than a hand-written candidate ref. The rematerialize and rebind executors are publicly
  reachable under the guards they already enforce, refuse with their existing typed reasons on a dirty locus, a
  moved head or tree, a stale state revision, or an active operation, and introduce no record, locus lifecycle,
  ownership registry, or authority beyond the in-process dispatch.

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
