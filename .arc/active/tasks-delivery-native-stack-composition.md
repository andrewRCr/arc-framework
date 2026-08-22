# Task List: Delivery Native Stack Composition

- **Design:** `spec-delivery-native-stack-composition.md`

---

<!-- arc:delivery-plan:start -->
## Delivery Plan

- **Plan Revision:** `1`
- **Plan Digest:** `sha256:6b1cff308d87a84276630923d7cd7e585f1a9a72798e17ec1fb206e7a154e260`
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

- _Outcome:_ The Member 1 criterion resolved `[x]` over `45b0e9393..c22890a42` and the cumulative tree: grouped
  criteria and eight ordinary closing tasks feed the member-scoped walk; terminal verification remains sole and
  unassigned; closeout consumes recorded reports plus the seam group; and every shipped surface has matching
  package/project coverage. Delivery validation refuses empty, interleaved, or order-departing ranges; workflow
  roots plus method-owned dependencies make both fire-points reachable; and the authored-partition carrier retains
  one complete logical pass. Both Heavy adversarial passes were consumed, and every confirmed finding was resolved.

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

- _Outcome:_ All three Member 2 criteria resolved `[x]` over `22c11cc63..a8eaa4d70` and the cumulative tree.
  The structural arbiter reapplies every moved-predecessor case and carries exact conflict or divergence paths;
  the shared capability probe preserves the typed refusal while verifying a pinned fallback when `HEAD` is
  unusable; and the aggregate-patch and linearity substrate is absent. The first Heavy adversarial pass exposed
  both edge cases, their approved fixes landed in the evidence span, and the second full pass returned no findings.

## **Phase 3:** Delivery-aware review-gate resolution

**Delivery member:** 3 — `review-gate-resolution`

_Purpose:_ Make ARC's own review bookkeeping able to name a delivery member as a review subject and to resolve a
change request whose base is a member branch. Both are prerequisites the topology, the terminal arm, and the
review fan-out each hit immediately.

_Design decisions:_ Nothing changes provider-side — a member pull request is an ordinary pull request, reviewed
like any other. The entire change is which subject a review addresses, internally. Resolution is fixed in the
shared primitive rather than bypassed for delivery: bypassing would leave review status broken on the top branch
throughout the landing window and leave every other consumer refusing, which is a special case to maintain forever.

### `[ ]` **3.1 Resolve a member branch to its work unit at the review-gate seam**

- _Goal:_ A delivery member head resolves to its owning work unit where review reads its subject, so review status
  and the hosted request path can address a member instead of refusing.

- _Rationale:_ Ownership resolves through the delivery reverse lookup, never a branch-name prefix test — written
  as a prefix test it rots at convergence, where work-unit identity decouples from branch identity. The fallback
  is added where review resolves its subject rather than by widening the shared branch-to-slug helper, whose
  delivery guard is load-bearing for its other consumers: teardown's reap filter and the orphan sweep both key off
  a non-null slug, so widening it there would draw member branches into destructive cleanup. A narrow fallback in
  the read, never a new roster authority. It is a review-subject resolution only: the originating checkout remains
  the sole work-unit session and compaction-recovery locus, while member and gate checkouts are operation inputs
  that carry no lifecycle context or load-set authority.

- _Shape:_ The reverse lookup is head-keyed — both selector arms require an observed head, which is the exactness
  guard — so the seam resolves a head before consulting it, and reuses the existing delivery binding lookup's
  bound / authoritatively-unbound / unavailable outcomes rather than restating them.

    - Build `test-first` (one behavior at a time):
        - A bound member head resolves to its owning work unit
        - An unbound head in the delivery namespace resolves to nothing rather than throwing
        - An unavailable delivery read is distinguishable from an authoritatively unbound head
        - An ordinary work-unit branch resolves exactly as before
        - The review-gate consumers take ownership from the lookup rather than from the branch name
        - The shared branch-to-slug helper is unchanged, and its roster and cleanup consumers gain no new
          resolutions
        - A member or gate checkout cannot become a WU session locus, provide a recovery seed, or borrow the
          originating checkout's load set
        - Compaction recovery from the originating checkout resolves exactly as before

### `[ ]` **3.2 Convert the hosted request vehicle to a discriminated union with a delivery-member arm**

- _Goal:_ A hosted review request can name a delivery member — plan, deliverable, and exact head — alongside the
  errand binding it carries today.

- _Context:_ The vehicle is a single kind-tagged errand schema on an optional field, not yet a union, with
  errand-specific binding validation inline in the request path. Two sibling vehicle unions already carry a
  delivery-member arm and the head-keyed member admission machinery shipped with the first delivery topology, so
  this aligns the request vehicle with those rather than minting a fourth notion.

- _Shape:_ The arm names plan, deliverable, and exact head, and stays projection-neutral so storage evolution
  does not touch it.

- _Note:_ Only the request envelope's vehicle becomes a union. The request handle carries a second, separate
  errand-kinded binding, and it stays errand-only: member targets derive fresh from bound state at each read
  rather than being stored, so a member request has no progress binding to record.

    - Build `test-first` (one behavior at a time):
        - The errand arm parses and validates exactly as before the union
        - A delivery-member arm parses with plan, deliverable, and exact head
        - Binding validation is extracted per arm rather than remaining inline in the request path
        - A delivery arm resolves its own binding rather than falling through the errand binding's parse
        - A request naming neither arm is still valid
        - A malformed arm refuses at parse rather than at the request call

### `[ ]` **3.3 Admit a member-branch base in change-request resolution**

- _Goal:_ Resolving the top's change request succeeds while its base is a member branch, so the terminal spine
  and review status keep working through the whole landing window.

- _Context:_ Resolution filters candidates by base equality and blocks with a base-mismatch reading when every
  visible candidate targets a different base, and callers throw before their own base checks execute. Once the
  terminal member binds at publish, a member-branch base is the top's normal state for the entire window, so the
  terminal spine cannot resolve the top's request at all today.

- _Shape:_ The classifier stays pure. Its caller holds the delivery state, so the caller supplies the
  additionally-acceptable member bases alongside the configured base rather than the classifier consulting
  delivery state itself — which would make a shared primitive store-backed for one consumer.

- _Note:_ Wire every caller of `resolveChangeRequest`: `handlers/review.ts`,
  `review-gate/policy/pre-publication-composition.ts`, `review-gate/status-composition.ts`,
  `integration/checkpoint-composition.ts`, and `integration/merge-composition.ts`. Each derives the acceptable-base
  set from its own resolved subject and context; no terminal-only bypass stands in for the shared contract.

- _Note:_ This admits a member-branch base; it does not relax the terminal boundary's own expectation that the
  base is the protected branch at the merge instant. That expectation is asserted by the delivery arm.

    - Build `test-first` (one behavior at a time):
        - A candidate based on a member branch resolves rather than blocking with a base mismatch
        - A candidate based on an unrelated branch still blocks with a base mismatch
        - The open, merged-at-head, merged-stale-head, and closed-unmerged readings are unchanged
        - An ambiguous multi-candidate result is unchanged
        - Review status on the top branch succeeds while the base is a member branch
        - Every shared-resolution caller supplies the delivery-member base when its resolved subject permits it

### `[ ]` **3.4 Derive discharge targets from the bound members at read time**

- _Goal:_ Discharge consults the delivery's member targets rather than only the current branch's single open
  request, so a work-unit obligation can be read against the whole member set.

- _Shape:_ Targets derive fresh from every retained bound member at each discharge read, including members whose
  physical refs were already reaped — never copied into a target list and never walked by a mutating pointer, so
  facts re-derive per operation as the rest of delivery state does.

    - Build `test-first` (one behavior at a time):
        - A non-delivery work unit resolves the single current-branch target exactly as before
        - A delivery work unit derives one target per bound member from current state
        - A member bound after the previous read appears in the next read without a stored list being updated
        - A physically reaped member remains a discharge target through its retained binding
        - An unavailable delivery read degrades to a contained result rather than throwing into the caller
        - No discharge read writes state

### `[ ]` **3.5 Close delivery member 3** — validate criteria at member scope

- _Goal:_ Member 3's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

## **Phase 4:** Topology transition and publication

**Delivery member:** 4 — `topology-transition`

_Purpose:_ Make the provider stack chain the delivery topology — every code-bearing member a first-class ref in
one ancestral chain, with the originating branch as its top. Removes the retained control branch and the
disconnected terminal request by construction rather than by patching their failure modes.

_Design decisions:_ Stacking is adopted as a transition, not a starting shape: a work unit begins ordinary and the
originating branch adopts the chain by an append-only ancestry merge. The rejected alternative — rewriting the
work-unit branch to a residual-only range — would force-push a pushed session branch, violating the append-only
contract and orphaning SHA-keyed user notes, so it is excluded by construction. Two merge semantics share the
ancestry-merge name and must not be conflated: adoption is content-neutral and keeps the top's tree exactly,
guarded by a subset check; absorption is the genuine content merge and belongs to the refresh path.

### `[ ]` **4.1 Author filtered member cuts as first-class delivery refs**

- _Goal:_ Each planned member is published as a real ref in the delivery namespace, cut below the originating
  branch with lifecycle artifacts excluded, so the chain is made of branches rather than disposable projections.

- _Context:_ Publication pushes a commit directly to the delivery namespace today and creates no local branch, so
  the shipped remote-only teardown leaves nothing behind locally. First-class member branches make the local side
  real, which is what gives the reaping work in the retirement member something to reap.

    - Build `test-first` (one behavior at a time):
        - Each non-terminal member materializes as a ref in the delivery namespace under the work unit
        - A member cut excludes the owning work unit's lifecycle artifacts per the existing eligibility contract
        - Member refs are created locally as well as remotely
        - An ineligible member refuses through the existing eligibility refusal rather than a new one
        - A local member ref already present at a different head refuses rather than being moved
        - Authoring candidate refs stay outside the delivery namespace

### `[ ]` **4.2 Adopt the chain by content-neutral ancestry merge under the subset guard**

- _Goal:_ The originating branch records the member chain as ancestry without changing its own tree, so its diff
  against the highest member is exactly the residual and the branch remains both the work unit's branch and the
  stack's top.

- _Rationale:_ An ordinary content merge is the wrong instrument here — merging equivalent content under two
  independently authored histories is what produced the fourteen-conflict reconciliation the retained control
  branch forced. Adoption records ancestry and keeps the top's tree exactly, guarded by a dedicated pure
  containment classifier rather than the eligibility comparator's equality verdict. The classifier takes the
  exact common pre-adoption base, top head/tree, and highest-member head/tree, then reuses the in-core merge
  machinery to reapply the member onto the top. Only a clean result equal to the pre-merge top tree is contained;
  conflict, a changed result, or unavailable evidence refuses with exact paths or a typed reason.

- _Note:_ "Top" is never a moving designation. A later member is carved from beneath the top and adopted the same
  way.

    - Build `test-first` (one behavior at a time):
        - Containment is a closed pure result distinct from normalized tree equality
        - Reapplying a fully contained highest member produces the unchanged top tree
        - A top with an allowed residual beyond the contained member still classifies as contained
        - Conflict and clean-but-changed results refuse with exact paths
        - Unavailable merge evidence returns the typed unavailable refusal
        - Adoption leaves the top's tree byte-identical while adding the highest member head as a parent
        - The top's diff against the highest member equals the residual after adoption
        - Adoption refuses when the chain's contribution is not contained in the top's content
        - Adoption never rewrites or force-updates the originating branch
        - A second member carved beneath the top adopts without changing which branch is the top

### `[ ]` **4.3 Bind the terminal member at publish**

- _Goal:_ The terminal member binds its ref, change request, and coordinates when its pull request opens, exactly
  like any other member, so no member is left unbound through the landing window.

- _Context:_ Materialization derives a null ref and null request base for the final index today and binds the
  terminal only after merge. That rule is what the disconnected terminal request required; with the top chained
  onto the highest member it no longer applies.

- _Shape:_ The terminal's coordinates already flow from the snapshot's top slot rather than from the member list,
  so its ref is the originating branch and stays outside the delivery namespace that every other member ref
  occupies. That is what keeps the recut path's direct-delivery-ref guard discriminating the case it was written
  for.

- _Note:_ The top pull request uses the ordinary work-unit template and the ordinary Conventional-Commits title,
  which the pull-request template already prescribes for the terminal member. Stack affiliation is conveyed
  structurally by the base ref, so no delivery-specific title convention is introduced — pull-request title policy
  is owned elsewhere and consumed here, not pre-empted.

- _Note:_ A null ref is what excludes the terminal from the publish arm's presentation and request loops today, so
  binding it draws the terminal into both. The presentation route dispatches by index — the ordinary work-unit
  form at the terminal, the member composer below it — and the member composer keeps its terminal guard as an
  internal invariant rather than as the exclusion mechanism. Left unrouted, the terminal reaches a composer that
  refuses it and publication returns a reason-free refusal.

- _Shape:_ Publication accepts one strict caller-authored `terminalPresentation` with the ordinary `title` and
  `body`, separate from the non-terminal presentation array. The calling workflow authors it through the existing
  ordinary template. The complete presentation set validates before any push or host mutation. On replay, an
  already-open request at the exact head and base is adopted without rewriting presentation; the terminal input is
  consumed only when the request is missing and is not persisted in delivery state.

    - Build `test-first` (one behavior at a time):
        - The terminal member derives its ref from the top and a request base pointing at the highest member's
          branch
        - Terminal binding populates ref, change request, and coordinates at publish rather than post-merge
        - The terminal receives the ordinary work-unit presentation, and the member composer is never called for it
        - The member composer still guards its terminal index when called directly
        - A missing or malformed terminal presentation refuses before any ref push or host mutation
        - Retrying an already-open exact terminal request does not rewrite its title or body
        - Existing tests encoding the terminal-unbound invariant are updated to the new contract, not worked around
        - A single-member plan still publishes coherently

### `[ ]` **4.4 Re-author the publish arm: push members, open requests bottom-up, optionally register**

- _Goal:_ Publication pushes the member set, opens every pull request bottom-up, then optionally registers the
  non-terminal members after their provider-assigned request IDs exist, with the terminal request in the same arm.

- _Context:_ The shipped boundary is unchanged around it: whole-work-unit attestation over the top branch's union
  tree precedes publication at the publication-step head. What changes is the push arm's shape.

- _Approach:_ The workflow's materialize and publish sections are re-authored around the transition and this arm.
  Prose stays dispatch-shaped — the returned next action selects the member and prose implements no loop.

- **Additional Context:** `strategy-workflow-authoring.md` — this task re-authors sections of a shipped workflow
  that exists in the package source and the project copy

    - Build `test-first` (one behavior at a time):
        - Publication pushes every member ref before opening any request
        - The complete non-terminal and terminal presentation input validates before the first push
        - Requests open bottom-up, each based on its predecessor's branch
        - The terminal request opens in the same arm, based on the highest member's branch
        - Optional registration runs only after every request ID exists and covers the non-terminal members only
        - Declining registration issues zero registration calls
        - A failure partway through leaves state resumable rather than half-bound

### `[ ]` **4.5 Extend the window-time mutation loop with its mechanical tail**

- _Goal:_ A review fix during the landing window recuts the suffix, re-adopts it, rebinds state, and re-verifies
  only the members whose contribution actually changed — all riding the finding-disposition approval that
  triggered it, with no new attended stop.

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

### `[ ]` **4.6 Retire the control-branch vocabulary from the surfaces that survive**

- _Goal:_ The eligibility and lifecycle surfaces name the top rather than a control branch, so no field carries the
  name of a construct this member removes.

- _Context:_ The top's identity already flows through the control ref input and the snapshot's control
  coordinates — that is how the terminal's coordinates resolve — so this is nomenclature, not behavior. It reaches
  the eligibility inputs and snapshot, the lifecycle-contribution reader, and the command-input request schemas
  carrying the ref.

- _Note:_ The terminal machinery is deliberately excluded: it retires with the disconnected terminal request in
  the next member, so renaming it here would churn a file about to be deleted.

    - Rename the ref input, the snapshot field, and the request-schema fields to name the top
    - The same ref reaches the same consumers under a name that still describes it — no behavior changes
    - Update the tests and fixtures that spell the old field names

### `[ ]` **4.7 Close delivery member 4** — validate criteria at member scope

- _Goal:_ Member 4's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

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

### `[ ]` **5.1 Compose the terminal claim from attestation, bound heads, and the derived residual**

- _Goal:_ At the terminal boundary the claim is that the attested union tree, minus the exactly-bound landed
  members' contributions, equals the top's terminal delta — composed from three existing records rather than the
  single-subject digest equality the singleton path uses.

- _Context:_ The ancestry-merge construction plus merge-commit member landings advance the recomputed merge base
  between the top and the base through each landed member. The currentness projection computes its candidate
  subject against a fresh merge base, so the top's freshly computed candidate at the terminal instant is the
  residual, never the attested union — deterministically, drift or no drift. The union attestation therefore
  exists once per publication candidate, recomposed mechanically by the window loop when movement produces a new
  candidate. Physical teardown may already have removed a landed member's refs, so the terminal composition reads
  the exact ref, change-request, and coordinate bindings retained in active delivery state until final retirement.

- _Note:_ The arm lands in the integration checkpoint's composition, while the comparator it calls lives in the
  delivery library — the direction the review gate's delivery member lookup already takes.

- **Additional Context:** `notes-delivery-native-stack-composition.md` § Consumed `integration-boundary-accuracy`
  substrate — the typed reads this composition builds on rather than re-deriving

    - Build `test-first` (one behavior at a time):
        - The claim composes from the attestation record, the state's exact bound member heads, and the derived residual
        - The residual is derived from the attested union and bound contributions, never read from the plan
        - Comparison runs through the eligibility comparator's content-comparison machinery over exact trees
        - A composition whose bound heads do not match observed landings refuses rather than recomposing silently
        - A landed member whose physical refs were reaped still contributes through its retained exact binding
        - The singleton non-delivery path composes exactly as before

### `[ ]` **5.2 Assert the delivery arm's four terminal checks**

- _Goal:_ The terminal boundary passes only when the candidate is the currently bound publication candidate,
  every non-terminal member landed at its exact bound head, the residual carries no unexplained delta, and the
  work-unit review obligation reports discharged against the delivery's derived member targets rather than the
  top's own request, including every member binding retained after physical teardown.

- _Rationale:_ The fourth check is load-bearing rather than defensive. The shipped composition derives its
  hosted-review requirement from exactly one target — the current branch's open change request — and that request
  is now the top's, whose diff is the residual only. Left unchanged, the terminal boundary would clear the whole
  work-unit obligation on a review of a sliver. This arm binds the check to the derived member targets; the
  conjunction over them is the review fan-out member's, verified here at the terminal boundary.

- _Note:_ Exact-head pinning, the integration interlock, and the refusal posture are unchanged. This arm adds
  checks; it removes none.

    - Build `test-first` (one behavior at a time):
        - A boundary whose candidate is not the currently bound publication candidate refuses
        - A non-terminal member landed at a head other than its bound head refuses, naming the member
        - A residual carrying an unexplained delta refuses with the delta surfaced
        - The obligation check reads the derived member targets, never the current branch's single request
        - The obligation check includes a member whose physical refs were already reaped
        - A discharge read reporting the obligation outstanding refuses rather than clearing the work unit
        - The interlock still gates the merge after all four checks pass

### `[ ]` **5.3 Expect the protected base at the instant and carry the top-retarget remedies**

- _Goal:_ A top pull request whose base is not the protected base at the terminal boundary refuses with a typed
  refusal carrying the applicable failure-only remedy after branch deletion and reobservation, and the terminal
  merge never proceeds on a stale base reading.

- _Context:_ Under this topology the top's base is legitimately a member branch while unlanded non-terminal
  members remain, and the configured base is required only at the terminal instant. The enforcement point is not
  the checkpoint composition's own base equality — that check is unreachable, because change-request resolution
  refuses a mismatched base upstream and the composition throws before reaching it. This element owns only the
  expectation the delivery arm asserts.

- _Shape:_ After the highest non-terminal member lands, teardown retains its delivery-state binding but deletes
  its remote branch as the host's retarget trigger, then immediately reobserves the top request. An automatically
  retargeted open request proceeds. An open request still on the wrong base yields the narrow `retarget` remedy;
  `closed-unmerged` yields `reopen-and-retarget`. Both are explicit, failure-only invocations followed by another
  observation, and the terminal arm refuses until the top is freshly observed open against the protected base.
  The delivery workflow reports the typed next action and implements no loop of its own.

- _Note:_ Retargeting a pull request's base rewrites no ref, so the append-only contract is untouched. Remedies
  are offered, never auto-applied, and the refusal is fail-closed.

    - Build `test-first` (one behavior at a time):
        - A top based on a member branch during the landing window does not refuse
        - Highest-member teardown retains the member binding, deletes its remote branch, and then reobserves the top
        - An automatic retarget to the protected base proceeds without another host mutation
        - An open top still on a member base yields a retarget remedy
        - A top observed closed-unmerged yields a reopen-and-retarget remedy instead
        - Applying either remedy is followed by reobservation before the terminal arm proceeds
        - No remedy is applied without explicit invocation

### `[ ]` **5.4 Re-fire member-scope verification on residual-overlapping drift**

- _Goal:_ Drift absorbed into the top during the window re-verifies only the terminal slice when it overlaps the
  residual's own paths, never the whole work unit.

- _Approach:_ Drift absorbed by the top's predecessor merges is fail-closed at the same seam. Drift overlapping
  the residual's paths re-fires member-scope verification for the terminal slice, because the residual is the
  terminal member's scope. Drift outside those paths reconciles as ordinary absorbed base movement.

    - Build `test-first` (one behavior at a time):
        - Drift outside the residual's paths reconciles without re-verification
        - Drift overlapping the residual's paths re-fires verification at member scope for the terminal slice
        - Whole-work-unit re-verification is never triggered by window drift
        - The overlap test reads the residual's paths rather than the whole union

### `[ ]` **5.5 Retire the absorption and terminal-attachment machinery with both call sites**

- _Goal:_ The absorption, terminal-readiness, and post-merge attachment machinery is gone along with both
  workflow call sites, because the disconnected terminal request it served no longer exists.

- _Note:_ The archival-refusal defect this machinery carried — resolving its owner only through the active work
  unit, which archival has already removed — is fixed rather than inherited. It is removed because its subject no
  longer exists, not because it is broken.

- _Note:_ Two carriers arrive with the contribution-proof vocabulary and retire here, compile-only and no more:
  the terminal module's two residual-proof call sites, and the attach verb's stubbed refusal literal.

    - `[ ]` **5.5.a Remove the terminal module and its verbs**

        - The absorption assessment and execution, terminal readiness, and post-merge adoption, with their tests
        - The prepare and attach verbs that expose them

    - `[ ]` **5.5.b Remove both workflow call sites**

        - The delivery workflow's terminal-handoff section, re-authored around the delivery arm
        - The integration workflow's post-merge attachment step, removed outright
        - Both are shipped workflows, so each changes in the package source and the project copy together
        - The delivery workflow's link definitions sit inside that section and one is consumed earlier in the
          file, so the re-author keeps them

    - `[ ]` **5.5.c Re-author the landing-loop teardown step**

        - The step retains the binding, deletes the landed member branch, and reports the reobserved top state or
          typed failure-only remedy returned by the CLI rather than sequencing or repairing in prose

### `[ ]` **5.6 Re-author both workflow guards against the contracts that survive**

- _Goal:_ Each guard asserts the contract that survives rather than the terminal machinery that does not, and
  each still fails by name when either copy of its own workflow drifts.

- _Rationale:_ The attachment guard's eleven assertions are anchored on the terminal-attachment block, and the
  delivery workflow's own guard pins a terminal-prepare invocation. Removing that machinery reddens both, which
  is the intended signal rather than a breakage to route around — but not every assertion goes red, because the
  ordering comparisons still hold against a missing anchor. Author each replacement from the surviving contract
  rather than by deleting whatever failed, asserting presence, uniqueness, and ordering over that contract —
  never a digest over a shared document.

- **Additional Context:** `notes-delivery-native-stack-composition.md` § Guard-test digest history — why the
  whole-file digest was removed and what replaced it

    - Retire the assertions whose subject is gone; rewrite the rest against the delivery arm's contract
    - Pin the delivery arm's handoff in place of the delivery workflow guard's terminal-prepare invocation
    - Keep each guard's package and project parity assertion so both copies change together

### `[ ]` **5.7 Close delivery member 5** — validate criteria at member scope

- _Goal:_ Member 5's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

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

### `[ ]` **6.1 Detect drift, state consequences, and delegate the registered suffix**

- _Goal:_ When a refresh is genuinely needed, ARC emits the exact planned suffix plus its safety and
  review-invalidation consequences, and hands the mechanics to the provider or the operator.

- _Shape:_ The arm fires on a refused landing — genuine conflict, native stale-suffix requirement, host
  up-to-date policy — or on explicit operator choice. Append-only external drift that blocks nothing is disclosed,
  not acted on. Conflicts, rewritten targets, and ambiguous provider movement refuse. The arm returns a typed
  result carrying the planned suffix and its consequences as recommended-action text — the precomposition carrier
  the native surfaces already use, and the one the registration disclosure mirrors. Whether ARC invokes the
  provider or observes an operator-initiated refresh is explicit in the result, because only the former can reserve
  a known mutation before it happens.

    - Build `test-first` (one behavior at a time):
        - Base movement alone obligates no refresh and produces a disclosure only
        - A refused landing fires the refresh arm with the exact planned suffix
        - The emitted consequences name review invalidation as well as safety
        - Ambiguous provider movement refuses rather than being adopted
        - A rewritten target refuses rather than reconciling
        - Explicit operator choice fires the arm without a refused landing

### `[ ]` **6.2 Absorb predecessor movement into the top by content merge**

- _Goal:_ The top takes on a restacked chain's content by an append-only merge, so a refreshed suffix does not
  strand the top behind it.

- _Rationale:_ This is the absorption form, not the adoption form, and the distinction is load-bearing: a
  restacked chain carries base content the top lacks, so the content-neutral form would silently drop it and fail
  late at the residual check instead of early at the merge. Conflicts stay attended by design.

- _Note:_ The top is never provider-restacked. Absorption by merge is the same base-merge doctrine pushed
  branches already follow, and it is what keeps the top's reviewed heads ancestors and therefore in span.

    - Build `test-first` (one behavior at a time):
        - Absorption merges the refreshed chain's content into the top rather than recording ancestry alone
        - A conflict during absorption surfaces for attended resolution rather than auto-resolving
        - The top's previously reviewed heads remain ancestors after absorption
        - The content-neutral adoption form is never selected on this path
        - Execution-time base movement before materialization stays ordinary base-merge territory

### `[ ]` **6.3 Separate reserved ARC mutations from external refresh adoption**

- _Goal:_ ARC-issued refresh mutations remain resumable through the existing operation reservation, while an
  operator/provider refresh with unknowable result heads is adopted only after bounded observation and proof.

- _Shape:_ An ARC-issued provider mutation reserves the existing rewrite operation before the call, reobserves,
  mutates, reobserves, and reconciles under that reservation; the existing suffix-retarget reconcile remains its
  interruption-recovery arm. An externally initiated provider/operator refresh cannot pre-reserve unknown heads:
  ARC performs bounded post-mutation observation, proves each adopted head through the arbiter, and writes current
  coordinates with the existing version check. Neither path adds an operation kind, protocol, or record.

    - Build `test-first` (one behavior at a time):
        - An ARC-issued refresh reserves the single active operation before its provider mutation
        - An interrupted ARC-issued refresh resumes to exact partial adoption from state
        - A second ARC-issued mutation refuses while an operation is reserved
        - An external refresh creates no fictitious pre-mutation reservation for heads ARC cannot know
        - External results are observed, proved member by member, and adopted through a version-checked write
        - Reconciliation records only resulting current coordinates, never a durable proof record
        - The operation union gains no new kind

### `[ ]` **6.4 Route a registered stack natively and mint the `native-stack-required` refusal**

- _Goal:_ A linked stack reaches the native lifecycle rather than the singleton merge path, and a stacked-member
  rejection surfaces as a typed refusal instead of collapsing into an opaque unavailable reading.

- _Context:_ Native registration is reobserved before the singleton arm is selected. The merge endpoint remains
  the shipped checkpoint-interlock-merge spine with its exact-head pin, in-verb lock release, bounded checks
  await, and merge-method revalidation; the native arm extends that spine rather than replacing it, using the
  asynchronous stack-merge API and returning the complete settled suffix.

- _Note:_ The native merge submission's refusal union widens to carry the new arm beside its existing unsupported
  reason — the same closed-union work the arbiter's landing port needs. Native linkage stays provider-observed and
  is never plan authority.

    - Build `test-first` (one behavior at a time):
        - A registered stack routes through the native lifecycle rather than the singleton arm
        - An unregistered delivery routes to the complete unlinked path
        - A stacked-member rejection mints a typed native-stack-required refusal rather than an opaque unavailable
        - The native arm preserves the exact-head pin and the interlock
        - Native linkage is never written into the plan record
        - Every provider-retargeted member reconciles by structural equivalence before its new head is admitted

### `[ ]` **6.5 Scope registration to the non-terminal member set**

- _Goal:_ Registration covers exactly the non-terminal members, so no provider-side stack operation can touch the
  session branch.

- _Rationale:_ The top chains natively as an ordinary pull request based on the highest member's branch —
  connected, presenting the residual delta — but stays outside the registered stack. Excluding it makes immunity
  from provider rewrite structural rather than a matter of operator discipline; the host UI rebase, CLI stack
  rebase, and native suffix rewrites stay fully usable over the registered set.

- _Note:_ The tax is named and bounded: the top forfeits stack-UI membership and native retarget machinery,
  relying on the guarded retarget at the final landing. It retires at convergence. The porcelain stays excluded —
  it pushes branch arguments, creates missing pull requests, and auto-corrects mismatched bases, which is silent
  repair of exactly the topology mismatch ARC must surface; the raw endpoint is what the adapter already calls.

    - Build `test-first` (one behavior at a time):
        - Registration requests exactly the non-terminal member set
        - The top is never included in a registration request
        - The porcelain is never invoked for registration
        - Operator-side refresh over the registered set is adopted through reobservation, not treated as authority

### `[ ]` **6.6 Exclude the dependent unregistered request from the registration predicate**

- _Goal:_ With the top chained onto the registered set, ARC's own observation reads that set as registered rather
  than falling through to unregistered.

- _Rationale:_ The predicate counts a stack as registered only when the provider returns exactly as many pull
  requests as the requested member set, positionally matched. With the chained top present, every requested member
  still matches at its index and only the cardinality check fails — so the affected set stays empty and the result
  falls through to unregistered, which drives a fresh registration attempt and routes landing to the unlinked arm
  with no downgrade surfacing anywhere. Left unfixed, the delivery is permanently and silently downgraded.

- _Note:_ Widening registration scope is not an available remedy — the only scope that removes the dependent
  request from the listing is registering the top, which the append-only contract excludes by construction. If the
  filter is not achievable against the provider's actual response shape, the single fallback is the complete
  unlinked path, which stays correct: a degrade target, not a failure.

- _Note:_ The cardinality and base-ref test is one expression, so exclusion must identify the dependent request
  rather than assume its position; the affected set is loop-external and accumulates across multiple stacks.

    - Build `test-first` (one behavior at a time):
        - A listing containing exactly the registered members reads as registered
        - A listing containing the registered members plus the chained dependent top reads as registered
        - A listing where a requested member genuinely mismatches still reads as partial with that member affected
        - A listing with no matching stack still reads as unregistered
        - An ambiguous multi-stack match is unchanged

### `[ ]` **6.7 Degrade both sub-two-member floors to the unlinked route**

- _Goal:_ A delivery of two total members routes unlinked whether or not the operator opted in, instead of hitting
  a hard stop.

- _Context:_ Native registration needs at least two registered members, so it applies at three or more total. A
  two-member delivery has one non-terminal member. There are two floors, not one: the request schema rejects a
  sub-two member array at parse time so the CLI refuses before the service guard is reached, and the service guard
  then refuses independently. Reclassifying only the service guard leaves the operator's stop exactly where it is.

- _Note:_ The floor's refusal must be distinguishable from the malformed-member refusal that shares its reason
  code today.

    - Build `test-first` (one behavior at a time):
        - A two-member delivery with opt-in declined routes unlinked
        - A two-member delivery with opt-in accepted routes unlinked rather than stopping
        - The schema-level floor degrades rather than refusing at parse
        - The service-level floor degrades rather than refusing
        - A genuinely malformed member array still refuses, distinguishably from the floor

### `[ ]` **6.8 Reconcile the full rewritten suffix on native landing**

- _Goal:_ A native landing that rewrites the entire remaining suffix reconciles every rewritten member by
  structural equivalence before admitting its new head to review.

- _Context:_ The native reconciler models only the single next-member retarget today, which is the shape a
  sequential unlinked landing produces. Native landing rewrites the whole remaining suffix, so full-suffix
  observation and structural reconciliation become part of the landing result.

    - Build `test-first` (one behavior at a time):
        - Landing observes the complete remaining suffix rather than the next member alone
        - Every rewritten member is reconciled by the arbiter before its new head is admitted
        - A member that fails reconciliation blocks admission and names its paths
        - A suffix whose moved members are all mechanically equivalent reconciles each through reapply
        - The single-next-member case still reconciles correctly

### `[ ]` **6.9 Make merge-method validation stack-aware**

- _Goal:_ Merge-method resolution accounts for intermediate members being held to merge commits while only the
  top is free.

- _Context:_ Resolution reads repository-level allowances, while the platform holds intermediate stack members to
  merge commits. This is a confirmed platform fact and compatible with the merge-commit default; it bounds any
  title-or-commit-promotion policy to the top member.

- _Shape:_ Resolution takes the member's stack position as an input, which it has none of today, and the validated
  result's policy fingerprint binds that position — so revalidation at the merge instant cannot accept a
  top-resolved method for an intermediate member.

- _Note:_ The disclosed host-evidence residuals — branch-scoped rules unread, absent versus unconfigured required
  checks — are external couplings and stay out of scope here.

    - Build `test-first` (one behavior at a time):
        - An intermediate member resolves to a merge commit regardless of repository squash allowances
        - The top member resolves against repository allowances as before
        - A non-delivery work unit resolves exactly as before
        - Revalidation at the merge instant applies the same stack-aware reading
        - A fingerprint resolved for the top does not validate an intermediate member

### `[ ]` **6.10 Disclose the registration consequence at the opt-in decision point**

- _Goal:_ An operator choosing native registration sees what it costs and what it buys before choosing, and
  declining makes no host calls at all.

- _Rationale:_ The native arms rewrite the remaining suffix while the unlinked path only retargets, so the
  registration decision is where review-invalidation cost is incurred — the same posture the refresh arm already
  takes for drift decisions, applied at one more point rather than as new mechanism. There is no capability gate:
  registration is blocked on nothing.

- _Shape:_ The opt-in is a field on the native-link request — no flag or config key exists — so the disclosure
  lands at the decision point in the workflow prose that composes that request, with the text itself precomposed
  on the native-link surface and rendered by prose rather than templated into it.

- _Note:_ What native buys is narrower than it looks once the arbiter automates the manual equivalent-tree
  adoption: a single landing decision for the whole remaining set, plus the reviewer-facing stack UI. Unlinked
  remains the zero-churn default, with one limit named — it is immune to provider-initiated rewrite, not to
  rewrite generally, so under strict up-to-date branch protection forced refreshes rewrite heads on either arm.

    - `[ ]` **6.10.a Precompose the disclosure on the native-link surface**

        - Recommended-text shape, consistent with the other precomposed operator-facing texts

    - `[ ]` **6.10.b Render it at the decision point in workflow prose**

        - Prose renders the precomposed text and never templates its own

    - `[ ]` **6.10.c Confirm declining makes no host calls**

        - A declined opt-in issues zero provider requests

### `[ ]` **6.11 Close delivery member 6** — validate criteria at member scope

- _Goal:_ Member 6's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

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

### `[ ]` **7.1 Make the reservation's pinned target vehicle-typed**

- _Goal:_ A carried reservation can name a delivery marker instead of a single pinned head, so its targets resolve
  per member at read time.

- _Context:_ The reservation record keeps what it carries today — the obligation and the ordered sources — while
  its single pinned target becomes vehicle-typed: a pinned head for the singleton case, a delivery marker here.
  Member targets derive fresh from the state's retained bound members at each discharge read, including members
  whose physical refs were already reaped, never copied into a target list and never walked by a mutating pointer.

- _Note:_ The reservation-admission guard binds the candidate's head, which is the top rather than the member, so
  that binding becomes vehicle-typed alongside the target resolution.

    - Build `test-first` (one behavior at a time):
        - A singleton reservation with a pinned head behaves exactly as before
        - A delivery-marker reservation resolves one target per bound member
        - A physically reaped member remains targetable through its retained binding
        - Admission binds the member's head rather than the candidate's head on the delivery arm
        - No target list is persisted by either arm
        - A reservation whose repository does not match its target still refuses

### `[ ]` **7.2 Iterate and conjoin discharge over derived member targets**

- _Goal:_ The work-unit obligation reports discharged only when every member review has cleared, evaluated against
  each retained member's own bound head and span.

- _Context:_ Per-member readiness admission and head-keyed member lookup shipped with the first topology. The
  hosted request path is the rework: it carries three current-checkout bindings that each refuse a member request
  today — local review-target head equality, change-request resolution against the configured base, and the
  reservation-admission guard binding the candidate's head — and its vehicle and reservation arms are disjoint,
  since the vehicle arm never reads the carried reservation and the reservation arm takes no vehicle. The
  delivery-member arm composes against the carried reservation. This task changes the first binding; the base
  admission is member 3's and the candidate-head guard belongs to the vehicle-typing task, so the three-binding
  behavior below is the integration check over all three.

- _Shape:_ Fan-out is target multiplicity, not concurrency — reviews run bottom-up as members become ready,
  typically one at a time. Cross-member seams stay covered by the member-boundary substrate and the chunked local
  lane's seam doctrine where it runs.

    - Build `test-first` (one behavior at a time):
        - Discharge evaluates each derived member target against its own bound head and span
        - Discharge includes a member whose ref was physically reaped but whose binding remains active
        - An obligation with one member unreviewed reports undischarged
        - An obligation with every member cleared reports discharged
        - A top-only clean review does not discharge the work-unit obligation
        - The singleton non-delivery discharge is unchanged
        - The three current-checkout bindings admit a member request on the delivery arm

### `[ ]` **7.3 Enforce reserved-source ordering per member at request time**

- _Goal:_ The reserved source cannot be leapfrogged by a lower-ranked carrier on any member merely because that
  member's pull request now exists.

- _Approach:_ The ordering rule fans out with the reservation and is enforced per member at request time through
  the existing driver check, made member-aware by the vehicle-typed target resolution. No new mechanism.

    - Build `test-first` (one behavior at a time):
        - A lower-ranked carrier is refused on a member while the reserved source remains admissible
        - The reserved source is admissible per member independently
        - A safely-unavailable reserved source admits the next source in order, per member
        - The singleton ordering behavior is unchanged

### `[ ]` **7.4 Project review applicability across non-substantive head movement**

- _Goal:_ A review survives head movement that does not change what it reviewed, and where a residual delta
  remains, that bounded delta reaches an owner decision before provider capacity is spent.

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
        - Proof conflict, divergence, or unavailable evidence reaches a typed `review-required` result
        - The bounded lane-progress query excludes attempts from another repository, request, vehicle, lane, or
          source
        - Applicability discovery writes no new record or index

### `[ ]` **7.5 Reach the discharge read with the applicability projection**

- _Goal:_ A recorded unavailability at a prior equivalent or still-in-span head does not re-void when the top
  moves, so a reservation that discharged through a fallback source stays discharged.

- _Rationale:_ The top absorbs predecessor movement by merge, so its reviewed heads stay ancestors and stay in
  span — but this holds for the reservation's first source only. The discharge loop consults the exact current
  head when deciding whether an earlier source was safely unavailable, so a reservation that discharged through a
  fallback after a rate-limited first source re-voids on the next append-only merge, even though the fallback's
  clean attempt remains in span. The top moves once per predecessor absorption, so this recurs across the window.

- _Note:_ The insertion point is therefore the discharge read itself, not only the request path. A projection
  gating only re-review requests would leave the discharge status re-voiding regardless. The discharge read uses
  the bounded existing-record query from the projection task rather than assuming an exact-head keyed lookup can
  discover an earlier attempt. It consumes any exact versioned Owner selection through the same closed projection;
  an unresolved decision or review-required result cannot discharge.

    - Build `test-first` (one behavior at a time):
        - A first-source settled attempt anywhere in span still discharges, unchanged
        - A rate-limited first source at a prior head remains safely unavailable after the top moves
        - A fallback-source discharge survives an append-only merge of the top
        - A genuinely unavailable determination at the current head still blocks progression through sources
        - The projection result reaches the discharge read, not only the request path
        - Request admission and discharge agree on the same replayed Owner selection
        - An unresolved residual decision keeps discharge false without spending provider capacity
        - The discharge read can discover the applicable earlier attempt without a new ledger or index

### `[ ]` **7.6 Re-author both workflows' review prose around the fan-out**

- _Goal:_ The prose an operator actually follows drives the carried reservation per member and reads the
  conjunction at the terminal boundary, so the fan-out is reachable rather than only implemented.

- _Context:_ The delivery workflow's member-review section never mentions the hosted-review reservation — its
  reservation references are all the delivery operation's. The integration workflow carries the only
  reservation-driving prose there is, and it is singular: one boundary read, one request, one settle.

- _Shape:_ Prose stays dispatch-shaped — the returned next action selects the member and prose implements no loop
  — and the conjunction is read from the typed discharge rather than derived in prose. Both are shipped workflows,
  so each changes in the package source and the project copy together.

    - `[ ]` **7.6.a Drive the reservation per member in the delivery workflow's review section**

        - The delivery-member vehicle, with the same typed request, await, and settle driver the singleton uses

    - `[ ]` **7.6.b Make the integration workflow's reservation loop delivery-aware**

        - Per-member requests during the window, with the terminal boundary reading the typed conjunction

### `[ ]` **7.7 Close delivery member 7** — validate criteria at member scope

- _Goal:_ Member 7's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

## **Phase 8:** Record retirement and doctrine

**Delivery member:** 8 — `retirement-and-doctrine`

_Purpose:_ Clear the delivery store's completed residue behind a reaping driver that actually exists, and record
the integration doctrine this topology assumes in the two surfaces that have no owner for it today.

_Design decisions:_ No archive namespace — that would be a durable record family the non-goals exclude, and
pre-release posture clears development state rather than migrating it. The retirement verb binds an explicit
work-unit identity as input rather than resolving through the active work unit, because after archival no active
meta exists and that resolution shape is the exact defect the retired terminal attach shipped.

### `[ ]` **8.1 Reap member refs, authoring candidates, and gate checkouts at teardown**

- _Goal:_ A completed delivery leaves no member refs, authoring candidate refs, or gate checkouts behind, on
  either side.

- _Context:_ The first field delivery left six candidate refs and six gate worktrees with no cleanup driver, hand
  reaped once. That deferral is not restated here: the authoring stage that materializes candidate refs and gate
  checkouts survives, so reaping them is in scope. First-class member branches make the local side real, so
  teardown reaps both sides plus the authoring candidates and ARC-owned gate checkouts. Removing a physical
  member ref does not erase its exact ref, change-request, or coordinate binding from active delivery state.

- _Shape:_ Residue is derived, never recorded. The deterministic authoring-candidate namespace is ARC-reserved;
  candidate-ref cleanup authority is the conjunction of that namespace, exact plan/member identity, and expected
  candidate head, never an unrecorded claim about which process created it. Gate checkout paths derive
  deterministically from the same identities. Before removal the driver validates the exact path, expected
  candidate ref or head, detached state, and clean worktree. A candidate ref outside the reserved namespace or at
  another head remains intact and surfaces. The driver never discovers ownership by HEAD coincidence and adds no
  checkout or ref-ownership registry.

    - Build `test-first` (one behavior at a time):
        - Teardown removes local and remote member refs for a landed member
        - Teardown removes the exact expected candidate ref in the ARC-reserved namespace
        - Teardown removes the exact gate checkout at the derived ARC-owned path
        - Teardown retains the landed member's exact binding in active delivery state
        - A candidate ref outside the reserved namespace or at a mismatched head is left alone and surfaced
        - A checkout at another path or with the wrong ref, head, or attached state is left alone and surfaced
        - A dirty gate checkout surfaces rather than being force-removed
        - A checkout sharing the expected HEAD by coincidence is never reaped
        - Reaping is idempotent across a repeated run

### `[ ]` **8.2 Retire the completed plan and state pair under an explicit work-unit identity**

- _Goal:_ After terminal adoption and ordinary closeout, the store holds no plan or state record for the completed
  work unit, so a reopened same-slug work unit cannot rediscover the old plan and global member reverse lookup
  cannot treat historical heads as live delivery authority.

- _Context:_ After the first live integration the store still held two canonical plan records and one bound state
  record for shipped, unoccupied work units. The store exposes publish, enumerate, read, and reverse lookup only,
  so nothing removes them.

- _Shape:_ One idempotent, version-checked operation deleting the completed bound plan and state pair plus any
  orphan plan with no state belonging to the same work unit. It refuses while an operation, an unreaped member ref
  on either side, or an unsettled terminal remains — which are the reaping postconditions, so retirement fires in
  the same tail as the reaping above. Both stores gain an exact removal method, since neither exposes one today,
  so this is a port change as well as a service. The transfer restore is the only other writer over the same
  records; retirement runs after closeout, so a later restore is a deliberate operator act rather than a
  resurrection to guard against. This final state retirement, not per-member physical teardown, is the sole point
  that clears the retained member bindings.

    - Build `test-first` (one behavior at a time):
        - Retirement deletes the bound plan and state pair for the named work unit
        - An orphan plan with no state for the same work unit is deleted with it
        - Retirement refuses while an operation is active
        - Retirement refuses while a member ref remains on either side
        - Retirement refuses while the terminal is unsettled
        - Successful retirement clears every retained member ref, change-request, and coordinate binding
        - A repeated retirement is idempotent rather than an error
        - The verb takes the work-unit identity as input and never resolves it from an active meta

### `[ ]` **8.3 Mint `strategy-integration.md` and complete its four ship mechanics**

- _Goal:_ One work unit's journey from a verified candidate to landed work on the protected base has a documented
  owner, and that document reaches installing projects.

- _Rationale:_ The posture is adopter-facing doctrine with no existing home: concern boundaries and vocabulary
  belong to the work-organization strategy, and running several work units at once and merge ordering between them
  belongs to the concurrent-work strategy. Neither owns this.

- _Shape:_ Owns the publication boundary and its attestation; delivery topology and landing posture — members,
  order, and window; review admission at exact heads; the integration interlock and terminal merge; and the
  post-landing closeout hand-back. Does not own which concerns become which work units, running several at once,
  review obligation and clearance semantics, or quality-gate tiers. Initial content is the charter plus this work
  unit's posture only — deliberately partial, sized to grow.

- _Note:_ All four ship mechanics are required or the file reaches nobody: author in the package source, add the
  path to the recipe, sync to the project copy, and add a firing-condition entry to the strategy index in both
  copies.

    - `[ ]` **8.3.a Author the strategy with its bounded charter**

    - `[ ]` **8.3.b Complete the four ship mechanics**

        - Recipe entry, project sync, and a strategy-index firing condition in both copies

### `[ ]` **8.4 Record the delivery-and-review posture ADR**

- _Goal:_ The canonical decision — agentic review as the primary lane with human review complementing it, and
  windowed landing as its consequence — is recorded once with its alternative and both reopening triggers.

- _Rationale:_ One ADR, not two: the windowed-landing decision is a consequence of the review-lane posture rather
  than an independent decision with its own alternatives, and splitting them would leave each needing the other's
  context.

- _Shape:_ Records the considered land-as-you-go alternative and the named reasons for the narrow divergence —
  amendment freedom until the window, agent-reviewer latency removing the pipelining payoff, restack-triggered
  re-review churn, and the native machinery's current maturity. Records the reopening trigger: field use showing
  late-batched hosted review producing rework that boundary-time landing would have prevented. Records the second
  reopening trigger for terminal authorization: field evidence that residual-overlap re-verification or the
  delivery-arm composition dominates window ceremony. Records the raw-API registration decision as a worked
  instance of typed fail-closed host surfaces over silently-repairing porcelain, rather than its own record.

- **Additional Context:** `strategy-adr-methodology.md` — decision criteria and the stability model

### `[ ]` **8.5 Close delivery member 8** — validate criteria at member scope

- _Goal:_ Member 8's criteria group is walked at its own boundary over the member's bounded diff and the
  cumulative tree, with the evidence recorded as ordinary task completion.

## **Phase 9:** Verification

### `[ ]` **9.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

### Member 1 — `member-boundary-verification`

- `[ ]` Each planned member's task range closes with an ordinary implementation task that fires `validate-criteria`
  at member scope over its group in the member-grouped Success Criteria section, adding no phases and leaving the
  single terminal verification task unassigned to any member. Success criteria remain marked only during the
  verification phase. The closeout pass walks the seam group and dispositions the member groups from recorded
  boundary evidence rather than re-deriving them. Every surface D7.5 names carries the change in both copies,
  `validate-criteria` is reachable from both declared fire-points, and plan validation refuses member task ranges
  that interleave or depart from member order. The central adversarial method may use a stable authored partition
  for two or three contract-closed group reviews plus a fresh seam-and-aggregate review, preserving one complete
  logical pass without 1:1 member fan-out or satisfying the stronger `review-chunking` carrier.

### Member 2 — `contribution-identity`

- `[ ]` When a predecessor moves, the member is mechanically reapplied even if its before/after trees are equal;
  only an unchanged predecessor plus equal member tree takes the tree-equality shortcut. An equivalent provider
  result carries without attended acknowledgement, a genuine reapply conflict refuses with the conflicted paths
  named, and a conflict-free divergence refuses with the divergent paths named.

- `[ ]` `merge-tree --merge-base` capability is established through the existing probe and reuses the existing
  typed unsupported-refusal. No new version floor, disclosure path, or degrade path exists in the change set.

- `[ ]` The aggregate-patch envelope and the linearity precondition are absent from the code base.

### Member 3 — `review-gate-resolution`

- `[ ]` A delivery member branch resolves to its owning work unit through the delivery reverse lookup — not a
  branch prefix test — so `arc review status` and the hosted request path address a member; and the terminal spine
  resolves the top's change request while its base is a member branch, rather than refusing `base-mismatch`.
  Every shared-resolution caller supplies its acceptable-base set. Member and gate checkouts remain operation
  inputs outside the WU session and recovery locus; the originating checkout alone owns compaction recovery and
  its load set.

### Member 4 — `topology-transition`

- `[ ]` No retained control branch and no disconnected terminal pull request exist in any delivery path. The top
  member is the work unit's own branch, its pull request is the terminal integration vehicle, and it presents with
  the ordinary work-unit template and title. Publication validates a distinct caller-authored terminal title/body
  with the complete presentation set before mutation, and an exact-request retry does not rewrite it. Content-neutral
  ancestry adoption proceeds only when a dedicated in-core containment result proves the top tree unchanged.

### Member 5 — `terminal-integration`

- `[ ]` The terminal ceremony runs through the ordinary `arc integrate checkpoint` to interlock to
  `arc integrate merge` flow, with the delivery arm composing its claim from the attestation record, exact bound
  member heads, and the residual comparison.

- `[ ]` After the highest non-terminal landing, its binding remains available while its remote branch is deleted
  as the host retarget trigger and the top is reobserved. Automatic retarget proceeds without another mutation;
  an open request on the wrong base yields `retarget`, and `closed-unmerged` yields `reopen-and-retarget`. Either
  remedy requires explicit invocation and another observation, and the terminal arm refuses until the top is
  freshly observed open against the protected base. A member-branch base remains valid during the landing window.

### Member 6 — `refresh-and-native-landing`

- `[ ]` A delivery completes while the protected base receives unrelated external landings throughout, with no
  freeze and no refresh obligated by base movement alone.

- `[ ]` A native landing that rewrites the entire remaining suffix reconciles every rewritten member by structural
  equivalence before admitting its new head to review.

- `[ ]` Registration covers exactly the non-terminal member set, and ARC's own observation predicate reads that set
  as `registered` rather than `partial` when the top pull request is chained onto it. A delivery of two total
  members routes unlinked whether or not the operator opted in — the sub-two member set degrades rather than
  stopping the workflow.

- `[ ]` Opting into native registration surfaces its review-invalidation consequence at the decision point, and
  declining it is a supported route that makes no host calls.

### Member 7 — `review-fan-out`

- `[ ]` A carried hosted-review reservation resumes on every member pull request at its exact head, and the
  work-unit obligation reports discharged only when every member review has cleared — verified at the terminal
  boundary as the conjunction over every retained binding, including members whose physical refs were reaped,
  never satisfied by the top's own residual review.

- `[ ]` Landing an N-member stack spends N member reviews plus review of genuinely uncovered deltas. A member whose
  contribution is proved unchanged under a predecessor rewrite is not re-reviewed, and a review preserved across a
  fallback-source discharge survives append-only head movement of the top. One equivalence arbiter serves both the
  delivery and ordinary base-merge cases; earlier attempts are found through a bounded read of existing
  lane-progress records. Request admission and discharge consume one closed, exact-coordinate-bound contribution-
  applicability result; a residual requires a replayable Owner selection on the existing attempt. The distinct
  path-based applicability proof remains intact, and no duplicate contribution-equivalence projection or new
  record family exists.

### Member 8 — `retirement-and-doctrine`

- `[ ]` After terminal adoption and closeout, the delivery store holds no plan or state record for the completed
  work unit, and the retirement operation refuses while an operation, member ref, or unsettled terminal remains.
  Physical teardown retains exact member bindings until that retirement; gate-checkout reaping validates a
  deterministic ARC-owned path, expected candidate ref or head, detached state, and cleanliness without a new
  registry or HEAD-coincidence discovery. Candidate-ref reaping requires the ARC-reserved namespace plus exact
  plan/member identity and expected head; mismatches remain intact and surface.

- `[ ]` `strategy-integration.md` exists in the package source, is listed in `init-recipe.json` `include_files`, is
  synced to the project copy, and is reachable from `STRATEGY-INDEX.md` in both copies.

- `[ ]` One ADR records the delivery-and-review posture, its considered alternative, and both reopening triggers.

### Cross-member seams

- `[ ]` Landing an N-member stack requires at most N landing decisions — or one contiguous-prefix decision — plus
  genuine content-conflict resolutions, with no manual recut, no per-member manual suffix adoption, and no
  synthetic ancestry-reconciliation merge on any path; every ARC-added step in the delivery path names the
  chartered failure it guards that a team on provider-native stacks does not already guard.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
