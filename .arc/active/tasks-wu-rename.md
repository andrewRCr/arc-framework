# Task List: wu-rename

- **Design:** `spec-wu-rename.md`

---

## **Phase 1:** Rename receipt vocabulary

_Purpose:_ Extend the retirement-receipt schema so a rename is expressible at all, and prove in the type system
that a rename receipt can never authorize a teardown. Every later phase binds to this vocabulary, so it lands
first and stands alone — fully unit-testable with no producer, gate, or verb in place.

_Design decisions:_ The transition union is the designed extension point (Alternatives, A3), and the rename
authorization lives in a receipt-scoped union rather than widening `HuskAuthorization` (A4) — so the two named
compilation breaks are where "rename is not teardown authority" physically lives, not incidental fallout.

### `[x]` **1.1 Transition and authorization unions with their refusal arms**

- _Goal:_ The receipt vocabulary admits a rename, and the two sites that would otherwise let one through as
  teardown authority refuse it explicitly.
- _Outcome:_ Rename now has distinct, stable receipt identity and receipt-scoped authorization vocabulary, while
  both result validation and teardown authorization explicitly refuse it as `unsupported-transition`; the shipped
  authorization paths remain unchanged.

### `[x]` **1.2 Rename result kind and matrix row**

- _Goal:_ A receipt can name the slug the subject becomes and digest the renamed set at its new names, and the
  fixed matrix admits that combination and no other.
- _Outcome:_ Rename receipts now carry the target slug and renamed artifact digest, and the fixed matrix admits
  only `rename` + `identity-renamed` + `nonexistent` + the rename result kind while rejecting crossed pairings.

### `[x]` **1.3 Receipt codec `rename` arm**

- _Goal:_ An untrusted rename receipt decodes only when it is exactly well-formed — closed key set, canonical
  round-trip, and a slug-shaped `targetSlug` — and every malformation decodes to `null` rather than a partial value.
- _Outcome:_ The closed-schema codec accepts only canonical rename receipts with a `SlugSchema`-validated target,
  exact result keys, the designed projection and authorization, canonical digests, and a re-derived receipt ID.

## **Phase 2:** Receipt production through the authority port

_Purpose:_ Generalize the direct-transition binding so a result path may differ from its source in basename as
well as directory — the transpose of every shipped transition, which preserves the basename and moves the
directory — without moving the conservation anchor off the committed tree. Delivers the producer half of the
design's headline property: a sweep that omits an artifact the WU carries at `HEAD` cannot pass.

_Design decisions:_ Reuse the shipped `RetirementAuthorityPort` rather than a bespoke producer (A7) — the
compare-and-set version, record lock, and post-stage rollback are exactly what convergent resume rests on. Only
the derivation of the _basename_ moves; source derivation stays `listArtifactPaths` at `head`.

### `[x]` **2.1 Slug-mapped result derivation**

- _Goal:_ Every artifact the work unit carries at `HEAD` yields exactly one delete and one write at its renamed
  path, derived by the port rather than supplied by the caller.
    - `[x]` **2.1.a Transition config, label, and rename context factory**
        - Added the rename-specific direct-transition factory and carried its source/result directories and slug
          map in captured evidence, including result-digest access for receipt construction.

    - `[x]` **2.1.b Slug map on the result basename**
        - Added the shared basename mapper; committed-tree source enumeration now derives renamed result paths in
          either the same directory or a distinct stub leaf while shipped transitions remain basename-preserving.

    - `[x]` **2.1.c `receiptMatchesBinding` rename arm**
        - Rename binding now requires the designed result kind, target slug, and digest of the staged renamed set.

- _Outcome:_ The authority binding independently derives one renamed result for every committed source artifact,
  preserving the existing source-left-behind and result-omitted refusals across active and backlog subject shapes.

### `[x]` **2.2 Additive patch path list**

- _Goal:_ Paths the sweep stages beyond the derived pairs reach the transition patch, so the rename commits as
  one atomic change set instead of being refused for staging something the patch does not describe.
    - `[x]` **2.2.a Thread the additional path list through the binding**
        - Capture now owns a validated additive path set that participates in patch construction, staging, and
          rollback without replacing or shadowing committed-tree-derived source/result pairs.

    - `[x]` **2.2.b ROADMAP exclusion**
        - ROADMAP remains port-derived and is rejected from the additive set, producing exactly one patch entry.

- _Outcome:_ Sibling-artifact and cohort rewrites can join the rename's atomic patch through an additive,
  collision-checked list while undeclared staged paths remain subject to the port's existing refusal.

### `[x]` **2.3 Conservation refusal diagnostic**

- _Goal:_ A sweep that omits an artifact the work unit carries at `HEAD` fails with a distinguishable
  conservation error naming the missing artifact, rather than as a generic preparation failure.
- _Outcome:_ Patch and result-digest reads now raise `DirectTransitionConservationError` with the omitted
  committed artifact's expected result path, leaving genuinely unavailable authority on its existing refusal.

### `[x]` **2.4 Post-refusal rollback**

- _Goal:_ The binding can restore a clean index, a clean working tree, and no written record — the exact
  precondition a re-run needs.
    - `[x]` **2.4.a Restore index and working tree**
        - The refused-commit rollback restores derived pairs, additive paths, and ROADMAP in both index and tree
          from the captured source head.

    - `[x]` **2.4.b Remove the record and diagnose an incomplete rollback**
        - The same operation removes the deterministic receipt record; incomplete cleanup returns a typed refusal
          naming the record path, underlying failures, and an explicit discard command.

- _Outcome:_ A refused rename commit can return to the clean captured source state without leaving same-ID
  evidence behind, while cleanup failures remain operator-visible and actionable.

## **Phase 3:** CHECK 20 acceptance

_Purpose:_ Teach the commit gate to accept a rename on its own evidence, and to refuse a malformed one with a
reason specific enough to test. Additive only — no shipped refusal is relaxed.

_Design decisions:_ The gate proves **correspondence** (old slug left, new slug arrived, artifacts line up on
both sides), not conservation — it cannot see the committed tree. Phase 2 holds the completeness anchor; stating
the division keeps the correspondence check from reading as a proof it is not.

### `[ ]` **3.1 Coverage allowlist, target presence, and per-record reasons**

- _Goal:_ A rename receipt covers its retiring slug only when the slug it names actually arrives in the same
  staged change set — and when it doesn't, the gate can say which assertion failed.
- _Shape:_ `receiptCoveredRetirements` grows a second return channel carrying per-record failure reasons. It is
  the only place that decodes a staged record and can name which assertion failed; a parallel validation pass
  would re-decode the same records and could drift from this one. The channel lands here, with the first
  assertions, so every later assertion arrives with its diagnostic rather than being retrofitted one.
- _Note:_ The loop currently skips a non-fresh record with a `continue` **before** decoding it, so an amended or
  pre-existing record is never recognized as a rename receipt at all. Reporting that case specifically — which a
  later task in this phase requires — means decoding first and classifying freshness after. Plan the restructure
  here rather than discovering it there.
- _Note:_ Coverage already keys on `receipt.subject.name`, the retiring slug, so the covered-set semantics need
  no change beyond admitting the transition.

    - Admit `"rename"` alongside `"abandon"` and `"decompose"`.
    - Require `result.targetSlug` to appear as an added lifecycle-meta slug in the same change set; without it a
      rename-labelled receipt could cover an abandon-shaped deletion that adds nothing.
    - Build `test-first` (one behavior at a time):
        - A rename whose target meta is staged as an addition is covered.
        - A rename whose target meta is absent from the additions is not covered, and the gate names the absent
          target rather than emitting the generic missing-record message.
        - A rename whose target meta appears only as a modification, not an addition, is not covered.
        - Shipped transitions resolve their covered set exactly as before.

### `[ ]` **3.2 Old-to-new correspondence assertion**

- _Goal:_ The artifacts leaving under the old slug and arriving under the new one line up, so a hand-built or
  corrupted patch that renames the meta while dropping a companion is refused.
- _Shape:_ Both sides select artifacts with the shipped `artifactMatcher` — documented as the one definition of a
  work unit's artifact set, and the same matcher the rename mutator moves — so the gate's notion and the mutator's
  cannot drift apart. Import it in place; the gate already imports from the library and has `basename` in scope.

    - Compute the staged deleted set for the old slug and the staged added set for the target slug, both selected
      with that matcher, and require their filename prefixes to match as **multisets**. The matcher runs over
      basenames while the gate reasons over paths spanning several tiers, so a prefix identifies a filename, not
      a file — set equality would admit a patch staging the same filename from two directories, and this gate
      fails closed on anything it cannot prove.
    - This does not catch an artifact absent from the patch entirely — that is the producer's anchor, not the
      gate's; the gate cannot see the committed tree.
    - Build `test-first` (one behavior at a time):
        - Matching prefix multisets on both sides pass.
        - A companion present among the deletions but absent from the additions fails, naming correspondence.
        - A companion present among the additions but absent from the deletions fails, naming correspondence.
        - The same artifact filename staged from two directories does not cancel against a single counterpart.
        - A foreign file sharing the change set participates in neither side.

### `[ ]` **3.3 Reasons for the pre-existing failure modes**

- _Goal:_ A rename receipt that is amended, pre-existing, or bound to a patch digest that does not match the
  staged set reports that specific fact instead of the generic missing-record message.
- _Context:_ Neither is a new assertion — the fresh-add guard already excludes amended and pre-existing records,
  and the digest equality already binds the staged patch. Both are invisible from outside the builder loop, where
  an amended record and no record at all look identical, which is why they report through the channel above.

    - Build `test-first` (one behavior at a time):
        - An amended or pre-existing rename record reports that fact rather than a missing record.
        - A rename record whose patch digest does not match the staged set reports the digest mismatch.
        - A well-formed rename emits no error.

### `[ ]` **3.4 Shipped-transition non-interference**

- _Goal:_ Adding the rename path perturbs no shipped behavior — `abandon`, `decompose`, and `park-planning`
  commits and the merge exemption resolve exactly as they did before.

    - The single-record validation block is `decompose`-scoped and early-returns for other transitions, so a
      rename receipt is bound by the coverage path's patch-digest equality plus the assertions above.
    - The merge exemption continues to exempt result states inherited exactly from a parent — the mechanism the
      base-side-stub deferral relies on.
    - Cover the interaction rather than re-running the existing suite: a rename record coexisting with each
      shipped-transition scenario, and a merge commit carrying a rename record, which the shipped merge guard
      already refuses.

## **Phase 4:** Artifact and reference sweep

_Purpose:_ Move a work unit's artifact set to its new slug and repair every reference that named the old one, as
one staged change set the receipt can bind.

_Design decisions:_ The mutator is the transpose of the shipped `relocate-artifacts` and reuses its slug-anchored
matcher. The `cohort-<old>.md` exclusion is dead in the mutator (directory-scoped) and load-bearing in the
cross-reference sweep, which would otherwise rewrite a cohort reference into a filename that does not exist.

### `[ ]` **4.1 `rename-artifacts` mutator**

- _Goal:_ A work unit's artifact set reads the new slug within its own directory, with foreign files and cohort
  docs left untouched.
- _Shape:_ `relocate-artifacts` moves a fixed slug between directories; this moves a slug within a directory it
  is also given. It takes both axes — a destination directory and the slug map — so the stub case below is a call
  shape rather than a second mechanism. Same matcher, `git mv` per file.

    - Reuse the shipped `<prefix>-<slug>.md` matcher, whose hyphen-free prefix anchors the slug so a foreign work
      unit whose name merely ends with the slug cannot match.
    - Apply the shared basename mapping the port derives its result paths from, never a second implementation of
      the same rule.
    - Build `test-first` (one behavior at a time):
        - Every artifact matching the old slug moves to the new one.
        - A missing optional artifact is a no-op rather than an error.
        - A foreign work unit's meta sharing the directory is not moved.
        - A file whose name ends with the old slug but carries a hyphenated prefix is not moved.
        - The moved paths equal the result paths the port derives for the same subject.

### `[ ]` **4.2 Renamed-meta field rewrites**

- _Goal:_ The renamed meta describes itself correctly — its title, its branch, and both slug-bearing pointer
  fields resolve to files and refs that exist.
- _Shape:_ The field rewrites go through the typed meta writers, never hand-rolled regex — `Branch` and the
  bullet-rendered `Design` and `Task List` all have setters over the shared field model. The `# Metadata: <slug>`
  H1 is the exception: it has no setter, and it is exactly what the foreign-write check compares, so it needs a
  new setter beside the others or a deliberate line edit. Choose one and say which.

    - Rewrite the `# Metadata: <slug>` title.
    - Rewrite `Branch:` from `<type>/<old>` to `<type>/<new>`.
    - Rewrite the slug-bearing pointer fields `Design:` and `Task List:`, which otherwise keep naming
      `draft-<old>.md` / `tasks-<old>.md` and break design resolution for the renamed unit.
    - Build `test-first` (one behavior at a time):
        - Title, `Branch:`, `Design:`, and `Task List:` all read the new slug after the rewrite.
        - A `Design:` or `Task List:` field set to a sentinel rather than a filename is left unchanged.
        - Fields that do not carry the slug are untouched.

### `[ ]` **4.3 Backlog containing-directory rename**

- _Goal:_ A stub's artifacts and the directory holding them both read the new slug, with any cohort segment of
  the path preserved.
- _Shape:_ Not a second move. The new leaf is passed as the mutator's destination directory, so each artifact
  lands directly at its final path in one `git mv`, and the emptied old leaf is dropped with the shipped backlog
  prune — which walks up only while it stays strictly below a tier root, so the tier itself is never removed.
  Moving the directory first and renaming inside it would split the move across two passes and leave the prune
  with nothing to do.

    - For a stub subject the artifacts live under a per-work-unit leaf directory in a backlog tier, optionally
      nested under a cohort segment; only the member leaf changes.
    - Build `test-first` (one behavior at a time):
        - A flat backlog stub's leaf directory reads the new slug and the old leaf is gone.
        - A cohort-nested stub renames only its leaf, leaving the cohort segment intact.
        - A cohort parent still holding a sibling member is not pruned.

### `[ ]` **4.4 Cohort member-section heading rewrite**

- _Goal:_ A cohort doc naming the renamed member keeps all three of its structural conditions passing, with no
  orphan member section left to fail a later commit.
- _Rationale:_ The member's own cohort field survives a leaf rename untouched; the cohort doc's per-member
  section heading does not, and the check fires on the next commit that stages that doc rather than at rename time.

    - Rewrite the one member-section heading, leaving the cohort doc's filename, purpose, and grouping identity
      untouched — a bounded slug-anchored edit, not a cohort rename.
    - Build `test-first` (one behavior at a time):
        - A cohort doc with a member section for the old slug reads the new slug afterward.
        - A cohort doc with no section for the subject is not modified.
        - Sections for sibling members are untouched.

### `[ ]` **4.5 Tier-wide cross-reference sweep**

- _Goal:_ No reference to the old slug survives anywhere in the lifecycle tiers — neither backticked artifact
  filenames nor bare slugs in dependency and cohort fields.
- _Context:_ Backticked references are invisible to the dangling-link check, which skips link-like text inside
  code spans, so a stale reference is caught by no gate.

    - `[ ]` **4.5.a Settle and implement the traversal**
        - Resolve the open question, then implement the chosen traversal once for both rewrite classes below.
        - Two candidates are out. The lifecycle index indexes metas, not artifact bodies, so it cannot serve a
          content sweep. The cohort validator's recursive walker is unexported, synchronous, lives under
          `src/scripts/`, roots differently (it includes `completed/`), and filters to `meta-*` / `cohort-*` —
          discarding exactly the artifact bodies this sweep reads; reusing it would also invert the established
          scripts-depend-on-lib direction.
        - The real choice is a purpose-built bounded scan of the active and backlog tiers versus the exported
          async `listArcFiles` in the filesystem library, which already returns every file under a root and
          already skips the internal and per-identity user trees.

    - `[ ]` **4.5.b Backticked artifact references**
        - Match the same slug-anchored pattern the mutator moves — not an enumerated subset, since real
          companions exist beyond `draft` / `spec` / `tasks`.
        - Exclude `cohort-<old>.md`: cohort docs are out of scope, and a cohort leaf that merely shares the
          renamed slug names a different thing.
        - Build `test-first` (one behavior at a time):
            - A backticked reference to any renamed artifact reads the new slug.
            - A backticked `cohort-<old>.md` reference is left unchanged.
            - Prose containing the bare old slug outside a field or backticked filename is left unchanged.

    - `[ ]` **4.5.c Bare-slug dependency edges**
        - Rewrite bare-slug occurrences in other metas' `Depends On:` fields across the active and backlog tiers.
          It is a bullet-rendered field with a typed setter, so the rewrite goes through the shared field model
          rather than regex over rendered markdown, and it is a list — rewrite the matching element and leave its
          siblings untouched.
        - `Cohort:` is **excluded**. Its value names a cohort leaf, never a work-unit slug — the consistency
          check requires it to path-match the directory the meta is filed under — and the rename subject is
          always a work unit. It could match the old slug only where a cohort leaf coincidentally shares it,
          which is the same collision the artifact sweep refuses to touch. Rewriting it there would set a value
          that no longer matches the filed path and fail the cohort gate.
        - The sweep writes into sibling work units' artifacts, which trips the foreign-write advisory on every
          rename. That check warns and always exits zero, so it refuses nothing — but the notices are expected
          output, not a symptom, and the end-to-end fixtures will surface them.
        - Build `test-first` (one behavior at a time):
            - A sibling's `Depends On:` edge naming the old slug reads the new one.
            - A `Depends On:` entry naming a different work unit whose name contains the old slug as a substring
              is left unchanged.
            - A sentinel-valued field is left unchanged.
            - A `Cohort:` field whose value equals the old slug is left unchanged, and the cohort gate still
              passes.

### `[ ]` **4.6 ROADMAP regeneration**

- _Goal:_ The staged readiness view matches a fresh render, so the rename commit never publishes a dangling
  dependency edge or a self-inconsistent view.
- _Shape:_ Compose the shipped readiness-regen side-effect rather than rendering here; this task wires it into
  the sweep and confirms the staged output is what a fresh render produces.
- _Note:_ No behavior list — the regen only has a staged set to act on once the verb assembles one, so its
  coverage lands with the orchestration rather than in this phase.

    - Required on two counts: the renamed unit's own row carries the slug, and the cross-reference sweep rewrites
      a render field on sibling metas.
    - The shipped nudge and freshness checks cover it unchanged; because the whole sweep is one commit, no
      intermediate state is ever published.

## **Phase 5:** Identity relocation legs

_Purpose:_ Move the work unit's git and workspace identity to the new name — the surfaces the developer visually
parses, and the motivation the unit exists for. Each leg checks its own post-state before acting, so a re-run
completes the remainder rather than double-applying.

_Design decisions:_ Every leg names the shipped primitive it composes from; a leg that does not apply to a
subject shape is a designed skip, never a faked success. Idempotence lives in the caller's post-state checks, not
in the mutators' own no-op arms.

### `[ ]` **5.1 Local branch rename leg**

- _Goal:_ The local branch reads the new name, and a re-run over an already-renamed branch skips the leg rather
  than failing on a missing ref.
- _Rationale:_ The shipped rename mutation's only no-op is a same-name rename, which is not the resume state this
  must converge from — after a completed leg the old ref is absent, and re-invoking would fail on the missing
  refname. The mutator is reused; it is never the idempotence mechanism.

    - Check ref presence first, then delegate to the shipped rename mutation, which also clears any inherited
      upstream.
    - Build `test-first` (one behavior at a time):
        - A branch at the old name is renamed and its inherited upstream cleared.
        - A branch already at the new name is skipped without error.
        - Neither ref present is an error naming both names.

### `[ ]` **5.2 Remote push-new and leased delete-old**

- _Goal:_ The new remote head exists with upstream tracking and the old head is gone — unless the branch was
  never published, in which case nothing is published now.
- _Note:_ The never-pushed predicate must be captured at preflight. The branch leg unsets the inherited upstream,
  destroying the natural signal before this leg runs; the preflight remote-head lookup supplies both the predicate
  and the lease operand.

    - `[ ]` **5.2.a Push the new branch with tracking**
        - Skip entirely when the preflight found no remote head — publishing a deliberately-unpublished branch is
          not this verb's business.
        - Build `test-first` (one behavior at a time):
            - A previously-pushed branch is pushed under its new name with upstream tracking set.
            - A never-pushed branch results in no push and no error.

    - `[ ]` **5.2.b Leased delete of the old head**
        - Pass the preflight OID so the delete is leased against the proven tip.
        - Build `test-first` (one behavior at a time):
            - A present old head at the expected OID is deleted.
            - An already-absent old head is the idempotent no-op.
            - A head that moved since the proof yields the stale outcome, leaving the old head in place and
              surfacing both OIDs.

### `[ ]` **5.3 User-notes subdir move**

- _Goal:_ Session continuity survives the rename — the developer's working notes move with the subdirectory
  rather than being discarded.
- _Rationale:_ The shipped workspace close is a recursive remove, so a close-then-open would discard
  `SESSION-NOTES.md` (A5). Notes content is commit-keyed and survives the branch rename untouched; only the
  path-keyed subdir moves.

    - Move the identity-scoped work-unit subdir from the old slug to the new one, then save through the
      non-interactive save function rather than the CLI handler, matching how the workspace side-effect routes.
      The destructive hazard this task guards against belongs to the workspace _close_ path — a recursive remove
      that would discard the session notes — not to save; a move plus save never reaches it.
    - Build `test-first` (one behavior at a time):
        - The subdir and its contents appear under the new slug, with session notes intact.
        - An already-moved subdir is skipped without error.
        - An absent source subdir is a skip, not a failure.
        - Both subdirs present — an interrupted move — refuses and surfaces both paths rather than choosing.
          No shipped primitive merges two workspaces, a single destination holds one set of session notes, and
          silently picking a winner is the loss this leg exists to prevent; the operator reconciles.

### `[ ]` **5.4 `reconcile-worktree` `move` mutation**

- _Goal:_ The worktree directory's final path segment reads the new slug, or the leg is skipped with a reason the
  operator can act on.
- _Shape:_ A new `{ mutation: "move"; from; to }` arm running `git worktree move`. The destination keeps the
  parent directory and rewrites only the final segment, replacing the old slug substring with the new one.
- _Note:_ The source path is the live location from the worktree registry, never a re-expansion of the location
  template — that template is documented as a creation-time artifact, so re-expanding it would drag a worktree the
  operator placed off-template to the template path. The same registry lookup is the shape discriminator: no
  registered worktree for the branch means an in-place subject.

    - Build `test-first` (one behavior at a time):
        - A worktree whose leaf contains the old slug moves to the leaf with the new slug, preserving the parent
          directory and any prefix within the segment.
        - A leaf containing no occurrence of the old slug is skipped and surfaced, since there is no principled
          destination to invent.
        - A worktree placed off-template moves relative to where it actually is, not to the template path.
        - An in-place subject with no registered linked worktree is a designed skip, detected by the absent
          registration rather than by catching a git failure.

### `[ ]` **5.5 Self-move locus hop and relocation handoff**

- _Goal:_ A rename run from inside the worktree it moves completes, leaves the process in the moved directory,
  and reports the new path — the normal case, not a refused edge.

    - `[ ]` **5.5.a Detect the self-move and hop the locus**
        - Reuse the shipped path-containment test; hop the process locus through the injected seam after the move
          and close with a relocation handoff naming the new path.
        - Build `test-first` (one behavior at a time):
            - A self-move hops the locus and reports the new path.
            - A move of some other worktree does not hop the locus.

    - `[ ]` **5.5.b Degrade gracefully where the platform refuses**
        - Where the platform refuses to move a directory the process occupies, every durable leg has already
          completed, so surface the move as a follow-up to run from outside the worktree rather than failing the
          rename.
        - Build `test-first` (one behavior at a time):
            - A refused move reports a follow-up notice and a successful rename, not a failure.

### `[ ]` **5.6 Worktree ownership marker rewrite**

- _Goal:_ ARC's own worktree-identity surfaces name the renamed unit, so the stale-worktree sweep, worktree
  cleanup, the branch-gone cascade, and teardown stop offering commands built from a slug that no longer resolves.
- _Rationale:_ The marker holds `wuName` and `createdFor`, and the shipped consistency check only requires the two
  to agree with each other — so a stale pair stays structurally valid while naming the wrong unit. Nothing else in
  the sweep touches it: the marker is gitignored, so it sits outside the staged patch and perturbs neither the
  receipt nor the gate.
- _Note:_ A separate leg, not a step of the move — the marker names the subject rather than the path, so it is
  equally wrong when the move is skipped or degrades. It runs ahead of the move, so the corrected marker travels
  with the directory. Spawned subjects only; the in-place shape mints no marker.

    - Build `test-first` (one behavior at a time):
        - Both marker fields read the new slug after the rewrite, and the pair stays internally consistent.
        - The rewrite lands even when the worktree move is skipped or degraded.
        - An in-place subject with no marker is a designed skip, not a failure.
        - A marker naming some other work unit is left alone.

## **Phase 6:** Guards and the `arc rename` verb

_Purpose:_ Compose the legs behind one verb whose guards are all preflight — a refusal leaves nothing applied —
and whose execution order the authority port fixes.

_Design decisions:_ The either-slug subject resolver and the different-unit scoping on the collision guard are a
matched pair: an unscoped guard would fire on the subject's own post-commit meta and make the resume the resolver
exists to enable unreachable.

### `[ ]` **6.1 Either-slug subject resolution**

- _Goal:_ The verb finds its subject under whichever slug currently exists, which is what lets a re-run after the
  commit has landed reach the outstanding identity legs at all.
- _Rationale:_ Once the commit lands, the old meta is gone and the new one is present. A resolver keyed to the old
  slug alone would refuse every re-run and strand the identity legs in exactly the mixed-name state the design
  calls worse than either pole.
- _Note:_ First because the guards depend on it — the execution-locus guard cannot name the subject's branch until
  the subject resolves, which is why the verb's own order resolves before it guards.

    - Resolve from the old or the new slug, whichever exists; refuse only when neither or both do.
    - Resolving to the new slug also tells the remaining legs they are resuming, so each runs its own post-state
      check and skips what has landed.
    - Build `test-first` (one behavior at a time):
        - Only the old slug present resolves to the subject.
        - Only the new slug present resolves to the same subject and marks the run as resuming.
        - Neither present refuses.
        - Both present refuses.

### `[ ]` **6.2 Preflight guard set**

- _Goal:_ Every refusal happens before any mutation, so a refused rename leaves the repository exactly as it
  found it.
- _Note:_ Occupancy needs no guard of its own. Its dirty half is the clean-tree check below, and no shipped
  primitive reads session liveness — the existing worktree-occupancy guard answers a different question, and the
  sweeps are age-based. Liveness arrives with the lease model; inventing one here would mean authoring a design
  this unit has no reason to own.

    - `[ ]` **6.2.a Execution locus**
        - For a spawned or in-place subject the verb runs from the checkout holding the subject's branch — not a
          preference but a constraint, since source capture throws when the process branch differs and git forbids
          a second checkout of the same branch. A run from elsewhere refuses with a diagnostic naming the holding
          worktree.
        - Build `test-first` (one behavior at a time):
            - A run from the holding checkout proceeds past the guard.
            - A run from another checkout refuses and names the holding worktree.

    - `[ ]` **6.2.b Target-slug validity**
        - Validate the new slug with the shipped schema before anything else. The collision guard does not
          incidentally cover shape — a traversal-shaped string simply resolves to nonexistent.
        - Refuse a target slug equal to the current one. It is well-formed, resolves to exactly one subject, and
          is not a collision, so every other guard passes it through — and it then fails mid-mutation, where a
          same-path move errors and source and result paths coincide in the patch.
        - Build `test-first` (one behavior at a time):
            - A malformed target slug refuses before any resolution work runs.
            - A target slug equal to the current slug refuses, with nothing applied.

    - `[ ]` **6.2.c Subject kind, tier, and clean tree**
        - Work units only, never an archived subject, and never a dirty checkout — the last required twice over,
          since the receipt binds the exact staged patch and the authority snapshot refuses when anything is
          already staged.
        - Build `test-first` (one behavior at a time):
            - An errand or branch subject refuses.
            - An archived subject refuses.
            - A dirty checkout refuses, including the primary checkout for a stub subject.

    - `[ ]` **6.2.d No open PR**
        - Refuse when the meta's PR field is populated — keying on tracked state keeps the guard host-agnostic. A
          trip refuses the entire rename; the design never produces a partial rename beside a live PR.
        - Build `test-first` (one behavior at a time):
            - A meta carrying a PR URL refuses the whole rename, with no leg applied.

### `[ ]` **6.3 Live name-collision guard**

- _Goal:_ A rename onto a slug held by a different in-flight work unit is refused, while a re-run whose new slug
  resolves to the subject itself is not.
- _Rationale:_ A rename mints a branch and an active meta exactly as the start verb's branch-minting arms do, and
  every sibling in-flight work unit's meta lives only on its own branch — invisible to a tree-only index.

    - Resolve against the composed lifecycle index with the in-flight oracle — configured to read live membership
      rather than local-only, and to expand live-only branches absent from local remote-tracking refs — not the
      checkout-local index that backs the bare collision floor.
    - Refuse outright when live truth is indeterminate, through the shipped indeterminacy predicate rather than a
      hand-rolled reading of marks and warnings. The start verb reads the same predicate but downgrades to a
      confirmation prompt when a terminal is attached, hard-refusing only when confirmation is suppressed; this
      verb takes no confirmation flag, so its refusal is unconditional — do not model the prompt.
    - Build `test-first` (one behavior at a time):
        - A target slug held by a live sibling visible only through the oracle refuses.
        - A target slug that resolves to the subject itself does not refuse.
        - Indeterminate live truth refuses rather than proceeding.
        - A target slug held by no unit passes.

### `[ ]` **6.4 Short-lived branch for stub subjects**

- _Goal:_ A stub rename commits on its own branch and reports itself invisible to the readiness view until that
  branch lands, rather than reporting an unqualified success.
- _Rationale:_ A stub has no work-unit branch, and committing on the base is refused under full protection — which
  would make a stub rename fail the very gate this unit exists to satisfy.

    - `[ ]` **6.4.a Cut and rest**
        - The verb cuts `chore/rename-<old>-to-<new>` from the resolved base, and the primary checkout returns to
          the base afterward. The shipped write-context resolver only classifies a write context and creates
          nothing, so the cut is the verb's own act rather than a call into it.
        - Check-then-do, like every other mutation: when the branch already exists, attach to it rather than
          cutting again. This is the stub shape's only resume seam — its identity legs are all skipped, so the
          leg-level post-state checks never run, and a stub re-run after a refused commit reaches this cut first.
          The subject also still resolves by its **old** slug on a re-run, since the rename is invisible to the
          base until the short-lived branch merges.
        - Build `test-first` (one behavior at a time):
            - A stub rename runs on the short-lived branch, never the base.
            - The checkout rests on the base after the run, including when the commit was refused.
            - A re-run with the short-lived branch already present attaches to it and completes, rather than
              failing to cut a branch that exists.

    - `[ ]` **6.4.b Report the pending-integration state**
        - The branch merges through the ordinary review path; until it lands the rename is invisible to the
          readiness view and every other checkout, and the completion report says so.

### `[ ]` **6.5 `arc rename` orchestration**

- _Goal:_ One invocation carries a subject through every applicable leg in the order the port fixes, and a re-run
  after any interruption completes only what is outstanding.
- _Shape:_ Everything durable completes before the one physically disruptive leg. The port fixes steps 1–5;
  steps 6–10 are the identity legs, skipped wholesale for a stub, with the marker and worktree legs additionally
  designed no-ops in place.

    - `[ ]` **6.5.a Verb module, preflight, and evidence capture**
        - Create the rename verb module beside the shipped lifecycle verbs. Everything Phases 2–5 built is
          binding- and mutator-level; this is the first task that assembles a verb, and it owns the error
          presentation those phases deliberately left to it — including rendering the binding's conservation
          error as a conservation failure rather than a generic "receipt could not be prepared".
        - Resolve the subject, run the guards, read the old branch's remote head for the later lease, and — for a
          stub — cut or attach the short-lived branch. Then capture source evidence against a clean index and
          read the authority snapshot.

    - `[ ]` **6.5.b Stage, record, commit, roll back on refusal**
        - Stage the sweep, the backlog directory move and cohort edit where applicable, and the regenerated
          readiness view; record the receipt through the port; commit. On refusal, roll back over the full patch
          path set and remove the record so a re-run starts clean.
        - Build `test-first` (one behavior at a time):
            - The staged set, the recorded patch digest, and the committed change set agree.
            - A refused commit leaves a clean tree, a clean index, and no record.

    - `[ ]` **6.5.c Sequence the identity legs and their skips**
        - Branch, notes, remote, ownership marker, worktree — in that order, each gated on its own post-state
          check. The marker precedes the move so the corrected file travels with the directory.
        - Build `test-first` (one behavior at a time):
            - A spawned subject runs all five legs.
            - An in-place subject runs three and reports the marker and worktree legs as designed skips.
            - A stub subject runs none.
            - A re-run after an interruption at each leg boundary completes only the outstanding legs.

### `[ ]` **6.6 CLI registration and handler**

- _Goal:_ `arc rename <slug> <new-slug>` is reachable from the command line, takes both slugs explicitly, and
  defaults neither.

    - Register a subcommand alongside the shipped lifecycle verbs, dispatching through the existing three-layer
      flow with the handler owning presentation and the lib owning the transition.
    - Thin wiring by design: argument parsing, handler dispatch, and result rendering. The behavioral surface is
      covered by the task below rather than here.

### `[ ]` **6.7 End-to-end coverage across the subject shapes**

- _Goal:_ The verb is exercised as an operator invokes it — real repository fixtures, real git state — across
  every shape and every interruption point the convergence claim rests on.
- _Rationale:_ Its own increment rather than a bullet on the CLI wiring: three shaped fixtures plus an injected
  failure at each leg boundary is the heaviest work in the phase, and burying it under registration would hide it
  from review.

    - Cover a spawned subject, an in-place subject, and a backlog stub end-to-end.
    - Cover a self-rename exercising the locus hop and the relocation handoff.
    - Cover a resumed run after an injected failure at each leg boundary, asserting only the outstanding legs run.

## **Phase 7:** Ship surface and integration readiness

_Purpose:_ Document the verb where the other lifecycle verbs are documented, and settle the two seams that must
hold before this unit integrates.

_Design decisions:_ First use is **not** in this phase. Each retitle must commit from the subject's own checkout —
the execution-locus guard requires it, and git forbids a second checkout of that branch — where the pre-commit
gate is the one that checkout carries. Until a subject branch merges a base holding the rename-aware validator,
its gate decodes a rename receipt as nothing and refuses the commit as an uncovered retirement. No sequencing
inside this unit reaches past that, so first use is a post-integration act, tracked outside this task list.

### `[ ]` **7.1 Command-surface documentation**

- _Goal:_ Someone reading the lifecycle-verb reference finds the rename verb, its arguments, and what it does to
  branch, worktree, and remote.
- _Shape:_ The command reference is a **Configurable** file with a template counterpart, not a Framework file —
  there is no same-named copy in the package source to author into and sync down. Make the equivalent
  framework-section edit in the template and in the project instance, never by copying between them. The
  blind-copy guard cannot enforce that here — it compares against a same-named package file and skips when none
  exists — so for this file the discipline is convention, not a gate that will catch a slip.

    - Add the verb to the § Lifecycle Verbs surface in the shipped-content register, in both copies.
    - No workflow or rules edit is required — a rename is not a lifecycle-state transition, so nothing in the
      state model or its ceremonies changes. Recorded so the absence reads as a decision.
    - Run the markdown gate over both copies.

### `[ ]` **7.2 Pre-integration seam reconciliation**

- _Goal:_ The assumptions this work unit records about the session-locus model still hold against that unit's
  settled design at the moment of integration, rather than against the design as it stood at spec time.
- _Context:_ That unit is in flight and being right-sized: its leases are now verb-scoped, and its record types
  are narrowing. Both surfaces this design touches — the deferral of liveness to that unit's lease model, and the
  worktree move's effect on path-keyed locus records — read against a design that is still moving.

    - Re-read the sibling unit's settled design and confirm the deferred liveness signal still arrives with it,
      and that a worktree move staling a path-keyed record is still absorbed by its reconciliation.
    - Where the sibling has landed first, confirm the composed behavior rather than the recorded assumption.
    - A divergence that the sibling should absorb is cross-unit routing, not work here — capture it and carry on.

## **Phase 8:** Verification

### `[ ]` **8.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` A commit renaming a work unit's artifact set passes the pre-commit gate, carrying exactly one finalized
  rename receipt whose patch digest binds the staged sweep
- `[ ]` The gate refuses, each with its own specific reason, a rename receipt whose target slug is absent from the
  staged additions, one whose additions drop an artifact the deletions carried, one that is amended or
  pre-existing, and one whose patch digest does not match
- `[ ]` The producer refuses a sweep that omits any artifact the work unit carries at `HEAD`, proven against the
  committed tree — verified by deleting one companion from the sweep's output and asserting the run fails
- `[ ]` Shipped transitions are unchanged: `abandon`, `decompose`, and `park-planning` commits and the merge
  exemption pass their existing tests, and a rename receipt cannot reach an authorized teardown decision
- `[ ]` After renaming a spawned work unit, the meta filename and its branch and pointer fields, every companion
  filename, every backticked reference in sibling artifacts, any cohort member section, the local branch, the
  worktree directory, the worktree ownership marker, the user-notes subdir, and the readiness row all read the
  new name
- `[ ]` After renaming an in-place work unit, every surface above reads the new name except the worktree
  directory and the ownership marker, which are unchanged and reported as designed skips
- `[ ]` After renaming a backlog stub, its artifact set, containing directory, cohort member section, and
  readiness row read the new name; no identity leg runs; the commit lands on a short-lived branch; and the cohort
  structural conditions still pass
- `[ ]` The old remote head is gone and the new one exists with upstream tracking, and a branch that was never
  pushed is left unpublished with the leg completing cleanly
- `[ ]` A rename invoked from inside the work unit's own worktree completes, hops the process locus, and reports
  the new path; where the platform refuses to move an occupied directory, every other leg completes and the
  residual move is surfaced as a follow-up
- `[ ]` A rename interrupted at any leg boundary converges when re-run, with no duplicated or skipped leg —
  tested both for a commit refused with the record already written and for a later identity leg failing after the
  commit landed; the accepted stale-lease terminal state is the sole exclusion
- `[ ]` A rename onto a slug held by a different in-flight work unit is refused, while a re-run of a partially
  applied rename is not
- `[ ]` A rename is refused with nothing applied when the target slug is malformed, equals the current slug,
  collides with a work unit visible only through the in-flight oracle, the meta carries a PR URL, the worktree is
  dirty, or the verb runs from a checkout that does not hold the subject's branch
- `[ ]` The design records why first use cannot precede integration — each subject's own commit gate must carry
  the rename-aware validator before it will accept the rename commit — so the constraint is read rather than
  rediscovered at a refused commit; the verb's behavioral proof rests on the end-to-end coverage
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration

---
