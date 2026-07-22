# Spec (`detailed` · `RFC`): wu-rename

- **Origin:** [internal]

- **Purpose:** Give work-unit renames a sanctioned, gate-accepted transition — one verb (`arc rename`) that emits
  one rename receipt CHECK 20 accepts and sweeps every surface a slug reaches, from lifecycle artifacts through
  branch, worktree path, and user-notes subdir, so the new name is coherent everywhere the developer looks.

---

## Introduction / Context

A work unit's slug is discovered to be wrong precisely when its design has matured enough to understand the
work — while the unit is active. ARC has no sanctioned transition for that discovery at any lifecycle tier.

The structural refusal is commit-time. The CHECK 20 gate (`validate-decompose-record.ts`) computes apparently
retired slugs as *deleted lifecycle-meta slugs minus added ones*, then requires each to be covered by a
finalized retirement receipt whose `transitionPatchDigest` binds the exact staged non-record patch. A rename
stages a deletion of `meta-<old>.md` and an addition of `meta-<new>.md`; because the slugs differ, `<old>` never
cancels, and the coverage scan admits only `abandon` and `decompose` transitions. The commit fails with
`lifecycle retirement is missing a finalized retirement record for: <old>`. The gate's lifecycle-meta patterns
span `active/`, both backlog tiers, and `completed/`, so the refusal is tier-wide. The three shipped
receipt-producing transitions are all semantically wrong for a rename — `abandon` and `decompose` end the
subject, `park-planning` relocates it under the same slug — so a wanted retitle is refused with no correct way
to satisfy the gate.

Two retitles are blocked on this today, each recorded in its own draft header: `pr-decomposition` →
`review-chunking` (a cohort-fit cut left the origin slug on the half that emits exactly one PR, inverting its
meaning) and `cohortless-decomposition` → `decomposition-machinery` (a consolidation widened its scope past the
original cohort-less-split concern). The cost is paid on the surfaces the developer parses most — shell prompt,
worktree path, `git branch`, the session-header branch line — and it compounds: the decomposition program is
designed to make cuts more frequent, and every extraction risks stranding another origin slug on an active unit.

The design question this RFC answers is therefore not *whether* to support renames but *what mechanism* makes a
slug change safe: how it satisfies a gate built to refuse exactly this shape, how it produces evidence through
an authority port whose shipped transitions all assume basename-preserving moves, how it sequences legs that
span tracked artifacts and untracked git identity, and how it behaves when it moves the worktree the caller
stands in.

## Goals

- **Name coherence across visible surfaces.** Done means the shell prompt, worktree directory, branch name, and
  session-header branch line all read the new name — not only the surfaces ARC renders from artifact internals.
- **Gate acceptance on the rename's own evidence.** A rename commit passes CHECK 20 by presenting a finalized
  receipt that binds its exact patch, with no weakening of the gate for any other transition.
- **Conservation, not just continuity.** The work unit must provably *survive* the rename — its artifact set
  carried across intact, not silently thinned. Proven at the producer against the committed tree (D2); the
  commit gate independently checks the weaker property it can see, old-to-new correspondence (D3).
- **Convergent resume.** Every leg is check-then-do, so a re-run after a partial failure completes the remainder
  rather than double-applying or refusing.
- **Host-agnostic remote handling.** The remote leg uses raw git only — no `gh` dependency, no host API call.
- **Self-rename as the normal case.** The verb runs from inside the worktree it moves; that path is first-class,
  not a refused edge.
- **Self-proving first use.** Both pending retitles execute through the shipped verb.

## Non-Goals

- **A PR-preserving remote rename.** No host offers one (see Alternatives); the design refuses rather than
  pretends.
- **Errand rename.** Errand identity is branch plus errand record — no meta, no lifecycle artifacts, no CHECK 20
  exposure — so it needs none of this machinery and gains nothing from it.
- **Cohort rename.** The subject is always a work unit. Renaming a cohort *leaf* is a different transform over
  `cohort-*.md` and the member directory tree. D4 does rewrite one member-section heading inside a cohort doc —
  a bounded edit that keeps CHECK 18 passing — but never the doc's filename, `Purpose`, or grouping identity.
- **Renaming a `completed/` subject.** CHECK 20's patterns cover the completed tier, but an archived unit's name
  is history; renaming it would rewrite a settled record for no operational gain.
- **New multi-machine reconciliation machinery.** A deleted old branch name lands in session-init's existing
  branch-gone recovery and the orphan-branch sweep; the design leans on both and adds neither.
- **Base-side stub rewriting.** The sweep never writes to the base branch.
- **Relocating the retirement-record store.** That is `retirement-record-relocation`'s; this design reads the
  store through its shipped path resolver.

## Proposed Design

Eight design elements. D1–D4 carry phase 1 (unblocks the refused commit); D5 carries phase 2 (delivers the
motivation); D6 and D7 span both, since the guard set and the verb are single surfaces; D8 is the acceptance
proof. The unit is not done at phase 1.

**Subject shapes.** Three, all in scope. D1–D4 apply to every shape; D5's identity legs and D6's identity guards
vary by shape, and a leg that does not apply is a designed skip, never a faked success.

| Shape | Definition | Identity legs |
| ------------------ | -------------------------------------------------------------------- | ------------------------ |
| **Spawned** | active location, `Branch:` set, own linked worktree | all four |
| **In-place** | active location, `Branch:` set, no dedicated worktree | branch, notes, remote |
| **Stub** | backlog tier, `Branch:` is `[none]` | none |

**In-place** is not an edge: `reconcile-worktree`'s shipped `spawn` + `inPlace: true` arm checks the branch out in
the current worktree with no `worktree add` and no ownership marker, and it backs `arc start --here` and every
cold start. Git cannot `worktree move` a main working tree, so the worktree leg is a **designed no-op** for this
shape — detected by the absence of a registered linked worktree for the branch, not by catching a git failure. The
same shape covers a WU whose worktree was removed while its branch was preserved.

### D1 — `rename` receipt transition

Extend the receipt vocabulary rather than mint a parallel record family (Alternatives, A3).

- **`RetirementTransition`** (`receipt-id.ts`) gains `"rename"`. `receiptId` derivation is unchanged — the
  transition is already a hashed field, so a rename receipt keys distinctly with no other change. Note the
  consequence for resume, which D2 owns: `receiptId` hashes only `{schemaVersion, subject, transition,
  sourceBranch, sourceHead}`, so it does **not** vary with the sweep's content.
- **Result kind.** `RetirementReceipt["result"]` gains
  `{ kind: "rename"; targetSlug: string; artifactDigest: CanonicalDigest }`. `targetSlug` binds the new slug so
  the gate can prove the old slug was renamed rather than discarded. `artifactDigest` digests the renamed set at
  its new names, mirroring the shipped `source.artifactDigest` so the record carries **both endpoints** of the
  rename as a durable audit pair. It is deliberately *not* claimed as the conservation verifier: the gate's
  `transitionPatchDigest` equality already binds every staged write, so a digest over a deterministic subset of
  that same patch proves nothing further. Conservation is proven at the producer (D2).
- **Authorization.** Mint `"identity-renamed"` in a **receipt-scoped** union rather than widening
  `HuskAuthorization`, so the two unions stay separated by meaning: `HuskAuthorization` is teardown's
  preservation vocabulary and `RetirementReceipt["authorization"]` is receipt evidence.
  `RetirementReceipt["authorization"]` becomes `Exclude<HuskAuthorization, "merged-preserved"> |
  "identity-renamed"`.
- **Matrix row.** `validateReceiptMatrix` (`retirement-authority.ts`) gains exactly one row:
  `transition === "rename" && authorization === "identity-renamed" && expectedLifecycle === "nonexistent" &&
  result.kind === "rename"`. The old slug ends nonexistent; the WU persists under the new slug at its unchanged
  lifecycle location.
- **Projection.** `retiringProjection` is `"direct-transition"` — the old slug transitions directly out of
  existence, as with `abandon`. Both of the codec's derived expectations already resolve correctly for a new
  transition without modification (`expectedLifecycle` defaults to `"nonexistent"` for everything but
  `park-planning`; `expectedProjection` to `"direct-transition"` for everything but `decompose`).
- **Codec edits — three, not two.** `parseRetirementReceipt` needs its transition accept-set widened, its
  authorization accept-set widened, **and** a new `parseResult` arm for the `rename` kind, parsed under the same
  closed `hasExactKeys` discipline as `discard` and `relocate`. `targetSlug` is narrowed at parse time with the
  shipped `SlugSchema` rather than admitted as a bare `string` — the codec's peer fields all narrow
  (`isCanonicalDigest`, `isManagedPath`), and this one reaches the filesystem.
- **Subject restriction.** The shipped `retirementSubjectRefusal` is transition-agnostic and refuses only
  errands, so it admits `{kind: "branch"}`. Restricting `rename` to work-unit subjects therefore needs a
  transition-aware check — either a signature change on that helper or an explicit subject guard on the rename
  path. Choose the explicit guard; the shipped helper keeps its current meaning for every other caller.
- **Two type breaks, both named.** Widening the unions breaks compilation at two sites, and both are where the
  "rename is not teardown authority" decision physically lives:
    1. `validateReceiptResult` in `git-retirement-authorization-context.ts` — a three-case `switch` with no
       `default` in a function returning `Promise<TeardownAuthorizationRefusal | null>`. Widening
       `RetirementTransition` makes it non-exhaustive; the new arm returns `"unsupported-transition"`.
    2. `authorizeFromReceipt` in `retirement-authorization.ts` passes `receipt.authorization` to
       `authorizedDecision`, whose parameter is typed `Extract<TeardownAuthorizationDecision,
       { status: "authorized" }>["authorization"]` — that is, `HuskAuthorization`, which excludes
       `"identity-renamed"` by construction (A4). Resolve it by refusing before the call, never by widening the
       decision type or casting: a rename receipt must not be able to reach an authorized teardown decision.
- **Not teardown authority.** A rename receipt must never authorize a husk teardown. Independently of the arm
  above, `readReceiptCandidates` derives candidate IDs for only `decompose`, `abandon`, and `park-planning`, so a
  rename receipt is never a candidate and `authorizeFromReceipt` refuses with `evidence-missing`. The safety
  property therefore already holds by invisibility; the explicit arm makes it hold by intent as well.

### D2 — Receipt production through the retirement authority port

The receipt is produced through the shipped `RetirementAuthorityPort`, not written directly (Alternatives, A7).
The port supplies the compare-and-set authority version, the record lock, the post-stage rollback, and — the
property this design leans on hardest — a **tree-anchored source derivation** that no caller-supplied list can
substitute for. Reusing it requires five changes, because every shipped transition assumes a basename-preserving
directory move while a rename is the transposed case: a directory-preserving basename change.

- **Transition config.** `DirectTransitionConfig.transition` widens to include `"rename"`, with its
  `expectedLifecycle` of `"nonexistent"` and its own label. `receiptMatchesBinding` gains a `rename` arm keyed to
  `result.kind === "rename"`; without it a rename receipt is rejected as `authority-conflict`. The arm also
  verifies `result.artifactDigest` against `readResultArtifactDigest(binding.source)` — the shipped helper already
  in scope, and the exact parity `park-planning`'s arm has for `plannedArtifactDigest`. Without that clause the
  field is an assertion the record makes about itself.
- **Slug-mapped result derivation — the conservation anchor.** `captureSource` derives `sourceArtifactPaths` from
  the **committed tree** (`listArtifactPaths` at `head`), then derives each result path as
  `join(resultDir, basename(path))` — basename-preserving, so it cannot express a rename. Generalize that one
  step to apply a **slug map** to the basename (`<prefix>-<old>.md` → `<prefix>-<new>.md`) while keeping the
  source derivation exactly as shipped. This preserves the property that matters: every artifact the WU has at
  `HEAD` yields exactly one delete and one write, and `readTransitionPatch` still throws when a source artifact
  is left in the index or a result artifact is missing. Conservation is therefore proven against the tree, not
  against the sweep's own enumeration — an artifact the sweep forgot cannot pass, because the port derived it
  independently. Only the derivation of the *basename* moves; the completeness anchor stays where it is provable.
- **Additive path list — membership by rule, not by example.** The caller supplies an **additional** list the port
  appends to the patch, never a replacement for the derived set. Its membership rule is exact: *every path the
  sweep stages that is neither one of the derived source/result pairs nor ROADMAP.* Stating it as a rule matters
  because the sweep touches more than sibling metas — the cohort doc's member-section rewrite and cross-reference
  rewrites inside sibling *artifacts* (`draft-*`, `spec-*`, `tasks-*`, `notes-*`, `research-*` of other units) both
  qualify, and both would otherwise be omitted by an enumeration and refused by the port as `evidence-mismatch`,
  which `recordRetirementReceipt` raises for any staged path outside the patch set. ROADMAP is the one exclusion:
  the port already diffs it against the source head and appends its own operation, and `patchDigest` throws
  `duplicate patch path` on a repeat. Together with the derived pairs this makes the whole rename land as **one
  atomic commit** (Alternatives, A8).
- **Index rollback on a refused commit — closing the re-mint hazard.** Because `receiptId` hashes only
  `{schemaVersion, subject, transition, sourceBranch, sourceHead}` and not the patch, a run whose commit is
  refused *after* `record` succeeded leaves a written record and a fully staged index; a re-run at the same `HEAD`
  derives the same `receiptId` and `createRecord` refuses on `EEXIST` with `authority-conflict`, while D6's
  clean-tree guard and the port's own `readSnapshot` both refuse the dirty index. The verb therefore **rolls back**
  when the commit is refused, through the port's shipped `rollbackTransition` — which restores index *and working
  tree* from the source head (`git restore --source=<head> --staged --worktree`). Unstaging alone would not do:
  the sweep's `git mv`s and field rewrites are working-tree changes, so an index-only reset leaves a dirty tree
  that D6's clean-tree guard refuses on the next run. The rollback must cover the additive paths as well as the
  derived pairs, since the shipped restore is scoped to the patch path set. Remove the written record in the same
  step. A preflight reuse check cannot substitute — at preflight there is no staged sweep to recompute a digest
  from, and the port exposes no reuse arm. If rollback itself fails, refuse with a diagnostic naming the record
  path and the command to discard it; that residue is operator-visible rather than silent.
- **Conservation refusals need their own diagnostic.** The tree-anchored throw above is raised inside the port's
  transaction and swallowed by `recordRetirementReceipt`'s outer catch, which returns `authority-unavailable` —
  rendered as "retirement authority is unavailable", indistinguishable from a transient failure. The design's
  headline property must not report itself as an infrastructure hiccup: surface the sweep-omission case with its
  own reason, on the same argument D3 applies to the gate side.
- **Ordering is the port's, not ours.** `readSnapshot` refuses when anything is already staged, and
  `captureSource` throws unless the process is on the source branch. The sequence is fixed: capture source (clean
  index) → read snapshot → stage the sweep → `record` the receipt → commit, with rollback on refusal. D7 follows
  it. Note this is a constraint the port imposes, not a change to it.

### D3 — CHECK 20 acceptance

Four changes in `validate-decompose-record.ts`, all additive; no shipped refusal is relaxed.

**Scope of what the gate can prove.** The gate sees one staged change set and a receipt. It cannot see the
committed tree's full artifact set, so it cannot prove *completeness* — that is D2's job, anchored on
`listArtifactPaths`. What the gate proves is **correspondence**: the old slug left, the new slug arrived, the
receipt binds this exact patch, and the artifacts on both sides line up. Stating the division honestly matters,
because a correspondence check derived from the sweep's own output would otherwise read as a conservation proof
it is not.

- **Coverage allowlist.** `receiptCoveredRetirements` admits `"rename"` alongside `"abandon"` and `"decompose"`.
  Coverage already keys on `receipt.subject.name`, which is the **old** slug — the retiring subject — so the
  covered-set semantics need no change.
- **Target-presence closure.** A rename receipt covers its old slug only when `result.targetSlug` also appears as
  an **added** lifecycle-meta slug in the same staged change set. Without this, a `rename`-labelled receipt could
  cover an abandon-shaped deletion that adds nothing.
- **Correspondence assertion.** Compute the staged **deleted** artifact set for the old slug and the staged
  **added** set for `targetSlug`, both restricted to the WU artifact-filename shape, and require their filename
  prefixes to match as multisets — every `meta`, `spec`, `draft`, `tasks`, or companion present on one side is
  present on the other. This catches a hand-built or corrupted patch that renames the meta while dropping a
  companion; it does not catch an artifact absent from the patch entirely, which is why D2 holds the anchor.
- **Rename diagnostic path.** `receiptCoveredRetirements` is a set builder whose failure modes are all `continue`,
  so a rename receipt failing any assertion currently falls through to the generic
  `lifecycle retirement is missing a finalized retirement record for: <old>`. Add a rename-specific path: when a
  staged record parses as a `rename` receipt for an apparently-retired slug but fails one of its assertions, emit
  the specific reason — absent target, correspondence mismatch, amended or pre-existing record, or patch-digest
  mismatch. Without this the gate is untestable at the granularity the success criteria require.
- **Freshness inherited.** The shipped guard that the record is a fresh add (`status === "A"` and absent at
  `HEAD`) already excludes amended or pre-existing records from the covered set; rename inherits it unchanged.
- **Deep decompose block untouched.** The single-record validation block is `transition === "decompose"`-scoped
  and early-returns for other transitions. A rename receipt is bound by the coverage path's
  `transitionPatchDigest === stagedPatchDigest` equality plus the assertions above.
- **Merge exemption untouched.** `novelMergeChanges` continues to exempt result states inherited exactly from a
  parent — the mechanism the base-side-stub deferral (D4) relies on.

### D4 — Artifact and reference sweep

- **`rename-artifacts` mutator.** A sibling of the shipped `relocate-artifacts`, transposed: `relocate-artifacts`
  moves a **fixed slug** between directories; this moves a **fixed directory** to a new slug. It reuses the same
  slug-anchored `<prefix>-<slug>.md` matcher, which excludes a foreign WU whose name merely ends with the slug
  (the prefix is hyphen-free). Each file moves by `git mv`. Note the pattern does **not** exclude
  `cohort-<slug>.md` — it matches whenever a cohort leaf equals the renamed slug — but the mutator is
  directory-scoped and the layout never files a cohort doc in a member's artifact directory, so the exclusion is
  dead here. It belongs on the tier-wide cross-reference sweep below, which would otherwise rewrite a
  `cohort-<old>.md` reference into a filename that does not exist.
- **Field rewrites in the renamed meta.** The `# Metadata: <slug>` title, the `Branch:` field
  (`<type>/<old>` → `<type>/<new>`), and every slug-bearing pointer field — `Design:` and `Task List:` — which
  otherwise keep pointing at `draft-<old>.md` / `tasks-<old>.md` and break design resolution for the renamed unit.
- **Backlog containing directory.** For a stub subject the artifacts live in
  `.arc/backlog/{planned,provisional}/<slug>/` (or `<cohort>/<slug>/`), so the sweep also renames that leaf
  directory — only the member leaf, never the cohort segment.
- **Cohort member section.** CHECK 18 enforces three conditions, not one. Condition (a) — a member's `Cohort:`
  field path-matching its filed directory — survives a leaf rename untouched. Condition (c) — a cohort doc's
  per-member `### \`<slug>\`` sections being a subset of derived members — does **not**: the renamed member leaves
  an orphan section, and the check fires on the next commit that stages that cohort doc, not at rename time. The
  sweep therefore rewrites that one heading. This is a bounded, slug-anchored edit to a member section, not the
  cohort rename excluded in Non-Goals; the cohort doc's own filename and `Purpose` are untouched.
- **Cross-reference sweep.** Backticked references to **any** `<prefix>-<old>.md` artifact — matching the same
  slug-anchored pattern the mutator moves, not an enumerated `draft`/`spec`/`tasks` subset, since real companions
  exist (`notes-*`, `research-*`) and CHECK 13 skips link-like text inside code spans, so a dangling backticked
  reference is caught by no gate. **Excluding `cohort-<old>.md`** — cohort docs are out of scope (Non-Goals), and
  a cohort leaf that merely shares the renamed slug names a different thing. Plus bare-slug occurrences in other
  metas' `Depends On:` and `Cohort:` fields, across `active/` and the backlog tiers.
- **Companion H1 titles are out of scope.** The renamed `draft-*`, `spec-*`, and `tasks-*` keep first-line titles
  carrying the old slug (`# Spec (…): <old>`). No gate reads them and no resolution depends on them — unlike the
  meta's `# Metadata: <slug>` heading, which the foreign-write check matches exactly. Recorded as a conscious
  exclusion rather than left silent, since the Purpose claims coherence "everywhere the developer looks."
- **ROADMAP regeneration in the same commit.** Required on two counts: the renamed WU's own row carries the slug,
  and the cross-reference sweep rewrites `Depends On:` on sibling metas — a render field. The shipped checks cover
  it unchanged: CHECK 17 nudges (warn-only, triggered by a render-field edit with no staged ROADMAP) and CHECK 19
  asserts the staged ROADMAP matches a fresh render. Because the whole sweep is one commit (D2), ROADMAP never
  renders a dangling dependency edge at an intermediate state.
- **Base-side stub by deferral.** The sweep lands wholly on the WU branch and never writes to the base. The
  old-slug copy still on the base reconciles at the ordinary integration merge — the same window graduation
  already creates, and CHECK 20's merge exemption composes with it.

### D5 — Identity relocation legs

Per the subject-shape table: all four legs for a spawned subject, the first three for an in-place subject, none
for a stub. Each leg names the shipped primitive it composes from.

| Leg | Primitive | Status |
| ------------------ | ----------------------------------------------------------- | ------------------ |
| Local branch | `reconcileBranch({ mutation: "rename", branch, toBranch })` | reused, guarded |
| Remote ref | `git push -u origin <new>` + `deleteRemoteBranch(…, oid)` | composed |
| User-notes subdir | directory move + `arc user save` | new op |
| Worktree directory | `reconcile-worktree` gains a `move` mutation | new mutation |

- **Local branch.** The shipped `rename` mutation runs `git branch -m` and clears any inherited upstream. Its only
  no-op is a **same-name** rename, which is not the resume state this design must converge from: after a
  completed leg the old ref is absent and the new one present, and re-invoking the mutator would fail with
  `refname refs/heads/<old> not found`. The caller therefore checks ref presence first and skips a completed leg —
  the mutator is reused, but never as the idempotence mechanism.
- **Remote.** Push the new branch with upstream tracking, then delete the old head through the shipped
  `deleteRemoteBranch`, passing the old head's OID so the delete is **leased** (`--force-with-lease`). An
  already-absent ref returns `absent` — the idempotent no-op. A `stale` outcome means the old head moved after the
  proof was taken; see Cross-cutting for its accepted terminal behavior. Skip the push entirely when the branch
  was never pushed — publishing a deliberately-unpublished branch is not this verb's business. **Capture that
  predicate at preflight**, not here: the branch leg (step 6) unsets the inherited upstream, destroying the
  natural signal before this leg runs. Resolve it from the old branch's remote head with a preflight
  `git ls-remote --heads origin <old-branch>`, and carry the resulting OID forward — it is also the lease operand.
- **User-notes subdir.** Move `.arc/user/{identity}/<old>/` to `<new>/` and save. This is a directory move, not a
  workspace close-then-open through the shipped `user-workspace` side-effect — close is a recursive remove that
  discards `SESSION-NOTES.md`, breaking handoff continuity across the rename (Alternatives, A5). Notes *content*
  is commit-keyed and survives the branch rename untouched; only the path-keyed subdir moves.
- **Worktree directory** (spawned subjects only). `reconcile-worktree` gains `{ mutation: "move"; from; to }`
  running `git worktree move`. The destination keeps the worktree's parent directory and rewrites its **final path
  segment**, replacing the `<old>` substring with `<new>` — under the default `../{repo}.{name}` template that
  turns `arc-framework.wu-rename` into `arc-framework.<new>`, preserving the `{repo}.` prefix rather than
  collapsing the segment to the bare slug. The shipped `resolveWorktreeLocation` template is documented as
  creation-time-only and is deliberately not re-expanded, so a worktree the operator placed off-template is not
  pulled to the template path. When the leaf contains no occurrence of `<old>`, skip the leg and surface it with
  the same follow-up notice the Windows path uses — there is no principled destination to invent.

    Self-move is detected with the shipped path-containment test that backs `isSelfTeardown`; on a self-move the
    injected `chdir` seam hops the process locus after the move and the verb closes with a relocation handoff
    naming the new path — the same shape teardown's locus-hop already uses. Where the platform refuses to move a
    cwd-occupied directory (Windows), degrade gracefully: every durable leg has already completed, so surface the
    move as a follow-up to run from outside the worktree rather than failing the rename.

### D6 — Guards and preconditions

Guards are preflight — evaluated before any mutation, so a refusal leaves nothing applied. Each guard notes the
shapes it applies to; unmarked guards apply to every shape.

- **Execution locus.** For a spawned or in-place subject the verb runs from the checkout that holds the subject's
  branch. This is not a preference: `captureSource` throws when the process branch differs from the expected
  source branch, and git forbids a second checkout of the same branch elsewhere. A run from any other checkout
  refuses with a diagnostic naming the holding worktree. For a **stub** subject there is no WU branch, so the
  sweep runs from the primary checkout on a short-lived branch — never on the base itself, which CHECK 1 refuses
  under `branch.protection: full`, and which would make a stub rename fail the very gate this unit exists to
  satisfy. The Non-Goal that the sweep never writes to the base therefore holds for every shape.

  The short-lived branch is the verb's to manage, not the operator's, and its four sub-decisions are settled here
  rather than left to the task list. **The verb cuts it** (`git switch -c` from the resolved base), following the
  shape ARC's own base-context relocation uses for off-WU work — but verb-driven, since `resolveWriteContext`
  only classifies a write context and creates nothing. **Name:** `chore/rename-<old>-to-<new>`, which is
  self-describing and collides with no WU branch pattern. **Integration:** it merges to the base like any
  `chore/` branch, through the ordinary review path — backlog stub artifacts are canonical on the base, so until
  it lands the rename is invisible to the ROADMAP and every other checkout, and the verb says so on completion
  rather than reporting an unqualified success. **Resting state:** the primary checkout returns to the base
  afterward, matching the shipped off-WU convention.
- **Target-slug validity.** Validate the new slug with the shipped `SlugSchema` before anything else. The slug
  reaches `git mv` destinations, a branch name, a `git worktree move` destination, a user-notes directory, and a
  hashed record field; the collision guard does not incidentally cover shape, since a traversal-shaped string
  simply resolves to `nonexistent`. This is the same contract `promote-demote`, `reopen`, and `teardown` already
  apply at comparable boundaries.
- **Subject resolution — either slug, exactly one.** The verb resolves its subject from **`<old>` or `<new>`,
  whichever currently exists**, and refuses only when neither or both do. This is what makes a resume possible at
  all: once the D7 step-5 commit lands, `meta-<old>.md` is gone and `meta-<new>.md` is present, so a subject
  resolver keyed to `<old>` alone would refuse every re-run and strand legs 6–9 — the entire phase-2 payload — in
  exactly the mixed-name state A2 calls worse than either pole. Resolving to `<new>` after the commit also tells
  the remaining legs they are resuming: each then runs its own post-state check (D5) and skips what has landed.
- **Name collision.** Refuse when the new slug already resolves to a **different** work unit anywhere in the
  lifecycle — resolved against `resolveComposedLifecycleIndex` with the in-flight oracle (`localOnly: false`,
  `expandLiveOnly: true`), not the checkout-local `buildLifecycleIndex` that backs the bare `hasNameCollision`
  floor. A rename mints a branch and an `active/` meta exactly as `start`'s branch-minting arms do, and every
  sibling in-flight WU's meta lives only on its own branch — invisible to a tree-only index. Mirror `start`'s
  handling of indeterminate live truth: refuse rather than guess. The *different*-unit scoping is load-bearing
  and pairs with the resolver above: an unscoped guard would fire on the subject's own post-commit meta and make
  the resume it enables unreachable. Without the guard at all, a rename onto a live sibling's slug passes every
  other check and surfaces only as an integration conflict.
- **No open PR** (spawned and in-place). Refuse when the meta's `PR URL:` field is not `[none]`. Keying on ARC's own
  tracked state keeps the guard host-agnostic — no host API query. A trip refuses the **entire** rename; the design
  never produces a partial rename beside a live PR. *Accepted residual:* a PR opened out-of-band is absent from the
  meta, invisible to the guard, and would be closed by the remote delete-old.
- **Clean tree.** Refuse a dirty working tree in whichever checkout the sweep runs from — including the primary
  checkout for a stub subject. Required twice over: the receipt binds the exact staged patch, and `readSnapshot`
  refuses outright when anything is already staged.
- **Subject kind and tier.** Work units only (D1), and not a `completed/` subject (Non-Goals).
- **Occupancy** (spawned and in-place). Best-effort dirty and liveness checks now; consume `session-locus-model`'s
  lease model when it ships.

### D7 — `arc rename <slug> <new-slug>`

A Commander subcommand alongside the shipped lifecycle verbs, dispatching through the existing three-layer flow
(`cli → commands → lib`). It takes both slugs explicitly and defaults neither.

Execution order — the port fixes steps 1–5; everything durable completes before the one physically disruptive leg:

1. Resolve the subject from whichever of `<old>` / `<new>` exists (D6), run the preflight guards, and read the
   old branch's remote head — whose OID feeds step 8 (D5). For a stub subject, cut the short-lived branch (D6).
2. Capture source evidence against a clean index and read the authority snapshot (D2).
3. Stage the artifact and reference sweep, the backlog directory move and cohort member-section rewrite where
   applicable, and the ROADMAP regeneration (D4).
4. `record` the receipt through the port, which re-digests the staged set and stages the record with it (D2).
5. Commit. CHECK 20 validates the result (D3). **On refusal, roll back through `rollbackTransition`** — restoring
   index and working tree over the full patch path set, and removing the written record — so a re-run starts from
   the clean precondition (D2).
6. Local branch rename, guarded by a ref-presence check (D5).
7. User-notes subdir move and save (D5).
8. Remote push-new (skipped when never pushed), then leased delete-old (D5).
9. Worktree move, self-rename locus hop, relocation handoff (D5).

Steps 6–9 are skipped for a stub subject; step 9 is additionally a designed no-op for an in-place subject. Each
leg checks its own post-state before acting, and step 1's either-slug resolver is what lets a re-run reach those
checks at all once the commit has landed — together they converge on the completed rename rather than
double-applying or refusing.

### D8 — First-use execution

Execute both pending retitles through the shipped verb: `pr-decomposition` → `review-chunking` and
`cohortless-decomposition` → `decomposition-machinery`. Each runs **both phases in one invocation**, which is also
the mitigation for the teardown edge in Cross-cutting — no cross-time window opens.

Both subjects are **spawned** shape: each holds a linked worktree and a `plan/` branch with a remote head, and its
authoritative meta lives in `active/` on that branch. The `backlog/planned/` copies visible from the base are the
stale old-slug artifacts graduation left behind — precisely the base-side-stub case D4 defers — so reading them
would misclassify these subjects as stubs and understate the acceptance proof. First use therefore exercises the
full identity path, not phase 1 alone.

## Alternatives & Rationale

**A1 — A PR-preserving remote rename via the host API.** Rejected because none exists. Verified against GitHub's
branch-rename documentation: "If the renamed branch is the head branch of an open pull request, this pull request
is closed." Only *base* references retarget, a WU branch is always its PR's *head*, and PR head refs are not
editable after creation — so the host API closes the PR exactly as raw push-new plus delete-old does. The no-open-PR
guard is therefore permanent design, not v1 debt, and the remote leg stays host-agnostic raw git with no `gh`
dependency, consistent with ARC's external-agnosticism principle.

**A2 — Artifact-only rename, deferring identity relocation.** Rejected. The motivating cost is wrong names on
visible tooling surfaces; an artifact-only rename fixes only what ARC renders and leaves every surface the
developer visually parses wrong — and newly *mixed*, with the slug saying one name while branch and path say
another. Meta-to-branch indirection makes slug/branch divergence *representable* (resolution runs meta → branch,
and the occupancy guard derives state from the meta rather than inferring from `git branch`), which licenses
**phased delivery inside the unit** — not stopping at phase 1.

**A3 — A new record family instead of extending retirement receipts.** Rejected. CHECK 20 is keyed on the
retirement-record namespace and its deterministic digest-to-path binding; a parallel family would duplicate the
codec, the path codec, the freshness rule, and the patch-digest binding, and would need its own gate branch. The
transition union is the designed extension point.

**A4 — Widening `HuskAuthorization` with the rename authorization.** Rejected on type precision rather than
reachability. Both unions are reachable from the husk surface in principle — `RetirementEvidenceRef` carries a
`RetirementTransition`, and this design widens that union — so unreachability does not distinguish them. What does
is meaning: `HuskAuthorization` answers "what preserved this worktree's work," a question a rename never asks. A
receipt-scoped union confines the new value to the vocabulary where it is meaningful and keeps teardown's enum
closed over teardown's own cases.

**A5 — Reusing the `user-workspace` close-then-open side-effect for the notes subdir.** Rejected: `runUserClose`
is a recursive remove of the WU subdir, so a close-then-open would discard `SESSION-NOTES.md` and break handoff
continuity. A directory move preserves it.

**A6 — A separate follow-up work unit for identity relocation.** Rejected on the same grounds as A2, plus
deliverability: phase 2 cannot ship without phase 1 (the gate refuses), and phase 1 alone delivers the mixed-name
state A2 identifies as worse than either pole.

**A7 — Writing rename records outside `RetirementAuthorityPort`.** Rejected. A bespoke producer would avoid the
port's basename-preserving patch model (D2's real friction) but forfeit the compare-and-set authority version, the
record-creation lock, and the post-stage rollback — precisely the machinery the convergent-resume goal rests on.
Paying for a generalized patch path set once is cheaper than re-deriving transactional safety.

**A8 — Splitting the rename across two commits.** Rejected. Confining the receipt commit to the typed rename patch
and moving the cross-reference rewrites to a follow-up commit would need less port surgery, but ROADMAP renders the
renamed unit's row and its siblings' dependency edges from the same sources — so the intermediate commit would
publish a dangling edge and a self-inconsistent readiness view. A transition whose entire purpose is name coherence
should not pass through an incoherent state; the atomic commit is also what CHECK 20's whole-staged-patch binding
naturally wants.

## Cross-cutting Considerations

**Testing.** Unit coverage on the receipt codec and matrix row (including the closed-schema rejections and the
`SlugSchema` narrowing), the CHECK 20 coverage path with its target-presence and correspondence assertions and each
of its distinct diagnostics, the cross-reference sweep's `cohort-<old>.md` exclusion, and the post-refusal
rollback restoring both index and working tree. Integration coverage on the preflight guard set — including a
collision against a live sibling WU visible only through the in-flight oracle, and the either-slug resolver
accepting a post-commit resume that the collision guard must not refuse. End-to-end coverage on the full sweep for
all three subject shapes, including a self-rename that exercises the locus hop and a resumed run after an injected
failure at each leg boundary.

**Package-project sync.** The pre-commit hook and any workflow or rules edits are Framework files: author them in
`packages/arc-framework/arc/**` and sync to `.arc/`, never the reverse and never by copying between the copies.

**Compatibility and rollout.** No migration — the verb is new and the schema change is additive at
`schemaVersion: 1`. One forward-compatibility note: the codec's closed transition union means a CLI predating this
change decodes a rename receipt as `null`. Records are local-repo state under the adapter-owned namespace, and the
persisted-evidence type already preserves unknown kinds without authorizing them, so the failure mode is a refused
read rather than a corrupt one. Acceptable; recorded rather than engineered around.

**Trust boundary.** Receipt JSON is untrusted input. The new result kind is parsed under the same exact-keys,
canonical-round-trip discipline as the shipped kinds, with `targetSlug` narrowed at the boundary, and the gate
continues to fail closed on anything it cannot prove.

**Accepted terminal state — a stale remote lease.** If the old remote head moves between the proof and the delete,
`deleteRemoteBranch` returns `stale` deterministically, and a re-run reproduces it rather than converging. This is
the one leg where convergent resume does not hold, and it is accepted rather than engineered around: a moved head
means someone else pushed to the branch being renamed, which warrants a human look. The verb surfaces the old
branch name, the expected and actual OIDs, and leaves the old head in place; every earlier leg has already landed,
so the rename is complete apart from an orphaned remote ref the operator deletes once satisfied.

**Cross-machine behavior.** A deleted old branch name reaches other machines through session-init's branch-gone
recovery and the orphan-branch sweep — both shipped, neither extended. *Accepted residual:* the retired-subdir
reconcile gates on a WU being **shipped**, so a renamed-away user-notes subdir on another machine is preserved as
`not-shipped` and lingers until that WU ships. Harmless — a stale directory, no data loss, and the operator-stash
guard still applies — but it does not self-clean, and this design does not add machinery for it.

**Coordination seams.** `session-locus-model` is a two-way soft seam: its per-checkout locus records are
rename-affected (the record ID digests the checkout path and the role subject carries the slug — both stale under
the sweep), while its occupancy/lease model and process-locus hop are patterns the identity leg composes with. Its
reconciliation already tolerates stale records, so whichever unit lands first, the other absorbs the seam.
`retirement-record-relocation` owns the record store's location — read it through its path resolver, never a
hard-coded namespace. `wu-lifecycle-state-model` owns transition vocabulary; this design extends the shipped
receipt transitions and mints no parallel state names.

Two sequencing constraints bind D8 specifically. `pr-decomposition` is fast-laned and running its own grooming and
spec-settle ceremonies, so its retitle must be timed not to collide with them. `cohortless-decomposition` still
lists the rename transition as an area of its own held draft; re-point that area to this work unit at that unit's
own first-use ceremony — the base merge and retitle, which consumes the verb anyway — rather than editing the held
draft ahead of time.

**Forward-compatibility with the storage target.** The meta-to-branch indirection this design strengthens is the
storage strategy's WU-identity-decoupled-from-branch-identity principle directly, and the rename receipt is a
storage-agnostic slug-keyed record. No new configuration axes. The artifact leg routes through the layout and
path-resolution layer so the sweep lifts to a materialized storage tier unchanged.

**Known edge — teardown during slug/branch divergence.** Teardown resolves a WU's branch by slug projection over
`refs/heads` (by design: the meta `Branch:` field is `[none]` post-archive). Between the commit and the branch
rename the projection misses, so tearing down a mid-window WU reports the branch already reaped and orphans branch
and worktree. Mitigated by D7 running every leg in one invocation, which opens no operator-visible window; recorded
here for the general case. Every other branch-to-slug derivation site is fallback-only, creation-time, or
display-only: cold-start name derivation, the per-WU notes-sync fallback, the orphan-branch sweep, in-flight and
status derivation (cosmetic mixed-name display), the session-type branch-pattern fallback, and worktree location
(creation-time; live location reads from `git worktree list`).

## Success Criteria

1. A commit renaming a WU's artifact set passes the pre-commit gate, carrying exactly one finalized `rename`
   receipt whose patch digest binds the staged sweep.
2. The gate refuses a `rename` receipt whose `targetSlug` is absent from the staged additions, one whose staged
   additions drop an artifact the deletions carried, one that is amended or pre-existing, and one whose patch
   digest does not match — each naming its specific reason rather than the generic missing-record message.
3. The producer refuses a sweep that omits any artifact the WU carries at `HEAD`, proven against the committed
   tree rather than against the sweep's own enumeration — verified by a test that deletes one companion from the
   sweep's output and asserts the run fails.
4. No shipped transition changes behavior: `abandon`, `decompose`, and `park-planning` commits, and the merge
   exemption, pass their existing tests unchanged; a rename receipt is refused as teardown authority and cannot
   reach an authorized decision.
5. After `arc rename <old> <new>` on a spawned WU, all of the following read the new name: the meta filename, its
   `Branch:`, `Design:`, and `Task List:` fields, every companion artifact filename, every backticked reference to
   them in sibling artifacts, any cohort member section naming the subject, the local branch, the worktree
   directory, the user-notes subdir, and the ROADMAP row.
6. After the same rename on an **in-place** WU, every criterion in 5 holds except the worktree directory, which is
   unchanged and reported as a designed skip rather than an error.
7. After the same rename on a backlog **stub**, the artifact set, its containing directory, any cohort member
   section, and the ROADMAP row read the new name; no identity leg runs; the commit lands on a short-lived branch
   rather than the base; and all three CHECK 18 conditions still pass.
8. The old remote head is gone and the new one exists with upstream tracking; a branch that was never pushed is
   left unpublished and the leg completes without error.
9. A rename invoked from inside the WU's own worktree completes, hops the process locus, and reports the new path;
   where the platform refuses to move a cwd-occupied directory, every other leg still completes and the residual
   move is surfaced as a follow-up.
10. A rename interrupted at any leg boundary converges when re-run, with no duplicated or skipped leg. Two cases
    are tested explicitly: a re-run after a commit refused with the record already written, which finds a clean
    index *and a clean working tree* with no orphaned record; and a re-run after the commit has landed but a later
    identity leg failed, which resolves the subject by its new slug and completes only the outstanding legs. The
    accepted stale-lease terminal state is the sole exclusion.
11. A rename onto a slug held by a different in-flight work unit is refused, while a re-run of a partially applied
    rename — where the new slug resolves to the subject itself — is not.
12. A rename is refused, with nothing applied, when the target slug is malformed, the target slug collides with a
    work unit visible only through the in-flight oracle, the meta carries a PR URL, the worktree is dirty, or the
    verb is invoked from a checkout that does not hold the subject's branch.
13. Both pending retitles are executed through the verb, and `arc status <new-slug>` resolves each afterward.

## Open Questions

None blocking. Two implementation-level details resolve during the work: the exact traversal used for the
cross-reference sweep (a bounded scan of `active/` and the backlog tiers versus reusing an existing artifact
index), and whether the worktree `move` mutation reuses `isSelfTeardown` directly or introduces a
neutrally-named sibling for the shared containment test.

---
