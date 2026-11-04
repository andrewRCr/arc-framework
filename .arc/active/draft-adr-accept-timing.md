# Draft: ADR Lifecycle — Capture at Planning Close, Accept at Merge

- **Origin:** [internal]. Routed from `BACKLOG-INBOX` at the work-routing-discipline retirement pass (2026-06-01),
  after an integration-time ADR amendment raised amend-vs-edit and the cause traced to Proposed→Accepted timing.
  Widened on 2026-11-04 by the Owner-approved PM brief to cover detection at planning close and the stale-Proposed
  flips. Targeted to land by 11-20, a target rather than a constraint now that nothing here collides with
  `cutover-flip`.
- **Purpose:** Make ADRs the reliable, standalone record of this project's decisions. Every work unit tests its
  settled decisions for ADR-worthiness when its draft closes, whatever its Class. Each ADR is written with the work it
  records, stays freely editable until the change that completes that work merges, and turns Accepted in that change.
  A merge-gate check refuses a change that would merge an ADR it adds, or returns to Proposed, while the ADR is still
  Proposed.

---

## Inbound dispositions

Folded at the Owner's planning pass (2026-11-04).

| Entry                                                        | Outcome   | Fold location                       | Reason                                                                                                          |
| ------------------------------------------------------------ | --------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Deferred-acceptance trigger convention — the trigger         | `reject`  | Alternatives, "Deferred acceptance" | Accepting at merge leaves nothing to defer; the deferral diverges from common practice and costs a CI identity  |
| Deferred-acceptance trigger convention — lifecycle backstops | `reject`  | Scope boundary                      | No change to `init-work-unit` or `integrate-work-unit`; the merge-gate check replaces both                      |
| Stale-Proposed sweep — (a) which ADRs a work unit advances   | `fold`    | Decision 2                          | The change that completes the work unit carries its ADRs, and that merge accepts them; no pointer or meta field |
| Stale-Proposed sweep — (b) the one-time sweep                | `fold`    | Decision 6                          | Own-work coverage: the flips phase                                                                              |
| Stale-Proposed sweep — the ADR-021 instance                  | `dismiss` | —                                   | Accepted on 2026-06-19                                                                                          |

## Problem / Motivation

ADRs are where a reader finds the human decisions behind this heavily AI-assisted project, browsed by concern
rather than by work unit. Specs and drafts carry the same rationale, but they are grouped by work unit, read as
internal, and the draft is deleted at spec creation. Four defects keep the ADR record from serving that reader:

1. **No planning stage prompts an ADR outside `Novel` work.** `DEV-RULES.PROJECT` § Architecture Decision Records
   says to document significant architectural decisions as ADRs, with no stage attached. Among shipped workflows and
   methods, only `create-spec.md` § Novel overlay (the ADR-companion) and `spec-review.md`'s matching nudge ask, and
   both fire only at `Class == Novel`, `detailed`. The `STRATEGY-INDEX` entry for `strategy-adr-methodology.md` has a
   passive condition, "Consult when: writing an ADR, deciding whether a decision warrants one", the weakest-firing
   style per knowledge evolution P2.
2. **Acceptance comes at the wrong moment.** `strategy-adr-methodology.md` § ADR Lifecycle accepts an ADR
   "alongside implementation (or just before starting)", and an Accepted body is append-only. A premise corrected
   later in the same work unit then lands as an amendment instead of a plain edit.
3. **Nothing catches a forgotten flip.** Five ADRs are Proposed today. For four of them, ADR-023, ADR-024, ADR-025
   and ADR-033, every work unit their Status text gates promotion on has shipped by `arc status`:
   `class-model-foundation`, `scalable-authoring-pipeline`, `decomposition-machinery`, `concurrent-work-doctrine` and
   its enforcement siblings, and `session-locus-operability-hardening`. ADR-024 also names forward seams, among them
   `composable-workflows`, which it calls "non-blocking constraints, not gates". Each names its promotion event in
   prose, such as "when that work unit integrates" or, for ADR-023, "when those ratify the spec-form and cohort
   pieces", and none was promoted.
4. **ADR bodies lean on planning history.** `DEV-RULES.PROJECT` § Audience Boundaries classes `.arc/reference/adr/`
   as an internal surface that may "reference internal WU names, in-flight scope, transitional state, and
   project-internal concerns freely". ADR-033's Context, for example, opens with the work unit that built the
   mechanism it retires: "`session-locus-model` gave every ARC-managed checkout a durable role record". An outside
   reader cannot resolve that name.

## Decisions

### Decision 1 — Detection fires in the draft-readiness bar

`assess-draft-readiness` gains a fourth criterion: every settled decision carries an ADR disposition, recorded in the
draft's decision prose. On the `low` path, where no draft exists, the determinacy confirmation states each
disposition and the spec records it with its decision; the criterion's own text says so, since `create-spec` runs the
method at entry, before the spec exists. A missing disposition is a `needs-detail` gap, and the bar stays identical
at every depth. A disposition is one of four:

- a new ADR the work unit will deliver;
- an amendment to a named ADR;
- **covered by** a named ADR that records it: one the work unit delivers or amends, so that a work unit's related
  decisions share one record, or a Proposed or Accepted one already on the base branch that records the decision
  unchanged;
- `none`, naming the § When to Write an ADR "Don't write an ADR for" category the decision falls in (a tactical
  choice, one obvious from code, or a temporary one), or stating that it meets none of the five criteria.

A "covered by" that names any other ADR, such as a number that does not exist or an ADR that is neither on the base
branch nor this work unit's, is not a disposition, so it is a `needs-detail` gap as well. It closes by citing an ADR
that qualifies or choosing another disposition.

The criteria are any-of, as the strategy states them: "Write an ADR when a decision meets any of these criteria".
Criterion 2, multiple alternatives considered, fits most decisions a draft settles, so most qualify. "Covered by"
keeps the count near one ADR per work unit, and tuning the threshold stays a later candidate.

- **Reach.** The method already fires at `draft-design`'s loop exit and in `planning-review`'s draft author checks,
  and `create-spec` runs it at entry over the `low` path's determinacy confirmation. One site therefore reaches every
  Class and every depth (knowledge evolution P3), and it loads on demand, so the always-loaded set does not grow
  (P10).
- **Index entry.** The `STRATEGY-INDEX` entry becomes a directive naming the residual, per the index's own
  maintenance note: ALWAYS load before writing, amending, or accepting an ADR; `assess-draft-readiness` carries the
  planning-close test.
- **Left for after the flip.** `create-spec.md`'s Novel ADR-companion paragraph and `spec-review.md`'s Novel-only
  nudge stay as they are; a held post-flip Errand (`USER-INBOX § Errand`, Owner, 2026-11-04) retires the companion
  recommendation, replaces its sentence that the ADR "rides the normal ceremony commit", and widens the nudge, against
  `cutover-flip`'s rewritten text. Until then the companion paragraph contradicts Decision 2 for Novel `detailed`
  work: it has the ADR written at spec creation. The strategy and this criterion, both edited here, govern: a
  companion that `create-spec` recommends is recorded as a disposition, and its file is written with the
  implementation. A decision first settled in a spec or amendment outside Novel gets no ADR nudge until the Errand
  lands. The other Novel sites, `strategy-work-organization.md` (twice) and `classify-work-unit.md`, name "an ADR" as
  part of the Novel planning shape without stating when its file is written, so they do not conflict.

### Decision 2 — An ADR is written with its work and Accepted when that work merges

- **When it is written.** The ADR file is written with the work unit's implementation and delivered by the change
  that completes the work unit; in a multi-member delivery, that is the terminal member. Until then the draft or spec
  carries the decision, its rationale, and its disposition. No ADR file exists during planning.
- **Status meanings.** `Proposed` means written but not yet accepted: in a change that has not merged, or, for a
  record already on the base branch, awaiting the change that accepts it. `Accepted (YYYY-MM-DD)` is set in the
  delivering change before it merges, dated the day of the flip.
- **When it locks.** The amendment tiers bind from the merge of the change that accepts the ADR, whatever the Status
  reads before then. Until that merge the ADR stays freely editable, through verification and every review. After it,
  the three amendment tiers apply, and a changed decision is a supersession.
- **A Proposed ADR already on the base branch.** One merged before this convention, or carried in a project's
  existing ADR log, stays editable until the change that accepts it, and locks when that change merges. Any change
  may edit it in the meantime, such as a repository-wide formatting fix, without accepting it. No change may add an
  ADR as Proposed or return an ADR to Proposed.
- **Later realization.** When later work realizes an Accepted decision, the ADR notes the realization timing, and
  learnings from that work arrive as dated amendments. A decision that genuinely unfolds in separable phases may be
  split into one record per phase.
- **Forward compatibility.** `strategy-storage-evolution.md` § The line keeps ADRs tracked after the cutover as
  constitutional documents. Its Principle 5 retires planning branches at the cutover ("activation creates the work
  branch"), so the work branch is the one tracked place an ADR can travel. Drafts and specs become stored records, so
  a disposition recorded there is storage-neutral. The rule names no planning branch, grooming change, or park path.

### Decision 3 — Two project-local merge-gate checks enforce it

One script serves two files-mode declarations in `.arc/system/arc-checks.yml`, both `gate: merge` over
`.arc/reference/adr/adr-*.md`. Each declaration passes the script the rule it runs as an argument. Both receive
`ARC_CHECK_BASE` and `ARC_CHECK_TREE` from `checkEnvironment` (`lib/checks/process.ts`), which content coordinates
reach only for a files-mode check (`handlers/check/run.ts`, `runNativeForecastCheck` in `lib/ci-check-runner.ts`).
Each failure names the file and its remedy (knowledge evolution P7).

- **The status check** (`mode: files`, `widen: false`). It holds five rules over every ADR the change adds or
  edits:
    1. A new ADR merges with a Status section that does not read `Proposed`.
    2. A change does not return an ADR to `Proposed` or remove its Status section.
    3. An ADR already Proposed on the base branch stays editable, a rename included (Decision 2).
    4. A base-branch ADR with the same number at a different path, still present in the tree, is a different record,
       never the base version; the number check reports that collision.
    5. For an ADR with a base version, a remedy never writes a Status that version did not have: it restores the
       base version's Status section. `Accepted (<today>)`, set in this change before it merges, is the remedy only for
       a new ADR.

  The spec pins how the script finds an ADR's base version, the remedy wording, and a test for each rule. The script
  is not passed removed paths (`select_deletions` defaults to false in `lib/checks/declaration.ts`, and
  `selectedFilePaths` drops them), so it compares the ADR lists at `ARC_CHECK_BASE` and `ARC_CHECK_TREE` itself.
    - **Selection.** `requestScope` (`lib/checks/request.ts`) gives a merge-gate request scope `all`, and
      `selectAllScopeInputs` (`lib/checks/selection.ts`) narrows that to the check's own changed inputs only under
      `boundedDefaultMergeCheck`: a default merge-gate request, files mode, no widening. That request passes only
      the changed paths.
    - **The script still works out the change itself.** A named run, the retry command a failure prints
      (`checkRetryCommand`, `lib/checks/remedies.ts`), or an unresolved base passes every matching ADR, because
      `selectedFilePaths` (`handlers/check/run.ts`) falls back to all inputs when none are selected. So the script
      examines an ADR only when its content differs from the base exported as `ARC_CHECK_BASE`, and reads the base
      version from there. `resolveRequestBase` (`lib/checks/resolve-request.ts`) gives scope `all` the
      automatic base, so a named run and the retry receive one whenever the base branch resolves and has a single
      merge base with HEAD. With no base, the script refuses rather than passing, or failing on every Proposed ADR. Its
      remedy is to make the base branch resolvable and rerun, or to name the merge base itself
      (`--range <merge-base>`): an explicit range base is used as given (`resolveRequestBase`), so naming the base
      branch on a branch that has fallen behind would read ADRs accepted there since as returned to Proposed.
    - ADR-020 is Proposed on the base branch, so edits to it pass until `scalable-core` accepts it (Decision 6).
- **The number check** (`mode: files`, `pass_paths: false`, widening left on). Across every ADR in the tree at
  `ARC_CHECK_TREE`, it fails when two files share a number, naming both. The remedy keys on the collision, not on
  where the run happens, and the script tells the cases apart against `ARC_CHECK_BASE`. When the change adds one of
  them, one not yet committed included, renumber that one to the next free number; when it adds both, renumber
  either. When it adds neither, the collision is already on the base branch, so renumber, in a separate change, the
  one that landed later in the base branch's first-parent history. Either way, update the records that cite it by
  number. With no base it still fails, naming both files and stating that rule for the reader to apply, and says to
  make the base branch resolvable and rerun. A `--range <base>` rerun would not help here: a files-mode check named
  with an explicit range runs only when its inputs changed, so when the change edits no ADR, a collision already on
  the base branch would go unselected. `automaticBase` (`lib/checks/resolve-request.ts`) has no base when the base
  branch does not resolve (`resolveCheckBaseBranch` reads its upstream, then the local branch) or has no single merge
  base with HEAD; CI resolves both, so this arises only locally.

  Withholding paths runs the check once over the whole set: `checkArgumentBatches` (`lib/checks/batching.ts`) gives
  a `pass_paths: false` check one invocation, as `test:store` uses. Left widening, it is selected at every merge
  gate, since `selectAllScopeInputs` narrows only a bounded check, so it runs on every pull request and on each push
  to the base branch. On a push the base is the pushed tip, so a collision there reads as one the change adds
  neither of. That push run is the backstop: the ruleset on `main` sets `strict_required_status_checks_policy: false` and
  `ci.yml` does not re-run a pull request when the base moves, so two pull requests adding the same number in
  different files can each pass. The next run on the base branch then fails until one is renumbered.
- **Caching.** `currentContent` (`lib/checks/key-resolver.ts`) keys a result on the content of every file the inputs
  match, not only the changed paths. Both declarations also hash the script in `runtime_inputs`, as
  `check-package-sync` does; listing it in a files-mode check's inputs would pass the script its own path.
- **Placement.** A work unit meets the checks first in `verify-work-unit`'s Step 1, which requests
  `arc check gate merge --force` before its final local attestation, and Decision 2 keeps the ADR editable through
  the reviews that follow. CI runs them as well: `runCiCheckStep` (`lib/ci-check-runner.ts`) runs each merge-gate
  check the CI map does not name at the `lint-typecheck`/`default` step, which has no step condition, and a
  pull-request run checks out GitHub's merge of the head into the current base, per `ci.yml`. An Errand meets them in
  CI.
- **Shape.** A script under `packages/arc-framework/src/scripts/`, run as an npm script, like the `lint:arc:*`
  checks. `arc-checks.yml` is not in `init-recipe.json`, and projects write their own declaration;
  `bootstrapRetiredChecks` (`lib/checks/bootstrap.ts`) writes a proposal only when a retired surface is removed.
  The shipped strategy states the rule and says a project can enforce it at its merge gate, without describing this
  repository's script. The CineXplorer port is the one thing that would promote it to a shipped CLI verb.

### Decision 4 — ADR bodies meet the spec reader-independence check

`spec-review` already defines reader independence: its common reader checks' Reader independence item (meaning
stands without planning history), and three sentences inside two of its Reference boundaries bullets: "Judge what
supplies meaning, not tokens.", "ARC terms and artifact names are valid subject matter when their required meaning
is established or defined locally.", and "The substantive thesis stands without tracking fields; they supply no
missing design." An ADR's Context, Decision, and Consequences meet those, and its Status section is the tracking
slot. The rest of those two bullets, and Binding completeness, the other common reader check, are specification
obligations and do not apply.

- **Footprint.** A new ADR meets the check across its whole body. An edited ADR meets it over the changed footprint,
  as `spec-review` scopes an edit to an existing specification: "the changed footprint, including removals and
  affected surrounding obligations and definitions". The flips change Status sections and ADR-024's stale
  references, so no flipped body is rewritten.
- `strategy-adr-methodology.md` references the Reader independence item by name and quotes the three sentences,
  since they have no anchor of their own. The quotes are a copy that names `spec-review` as its source, and a change
  to those sentences carries to the strategy.
- In this repository ARC concepts are the domain: an ADR about cohorts may say "cohort". What goes is process
  narration doing the explaining, such as "surfaced during Task 5.2" or "ships with work unit X".
- `DEV-RULES.PROJECT` § Audience Boundaries keeps ADRs internal for shipping purposes but drops them from the
  surfaces that reference work-unit names freely. `DEV-RULES.ARC` § Documentation Boundaries is unchanged: its list
  of places process rationale may go already includes specs, which carry the same check.
- This is not a token lint: the rule is meaning-level, and a slug or ID search would flag legitimate subject matter.

### Decision 5 — ADR-040 records this work unit's decision

ADR-040 records the accept-at-merge doctrine with its detection, reader convention, and enforcement. It meets § When
to Write criteria 2 (alternatives weighed: accept at agreement, at kickoff, at the realizing work's landing, at
merge), 4 (a reader will ask why a new ADR is never Proposed on the base branch), and 5. It is written with this
work unit's implementation and stays Proposed until this work unit's verification flips it, so its own merge gate
exercises the status check end to end. Its Consequences note the four acceptances and why ADR-020 stays Proposed.

Dispositions: Decisions 1, 2, 3, 4, and 6 are covered by ADR-040.

### Decision 6 — Four stale Proposed ADRs are accepted as the first phase

- **ADR-023, ADR-024, ADR-025, ADR-033** become `Accepted (date)`, keeping their promotion paragraphs as record,
  after each named realization is checked at source. ADR-024's named decide method `assess-cohort-fit` was renamed
  to `assess-boundary-fit` (`eaa0c68432`), so its flip corrects those references. `cohort-state-storage.md`'s
  storage-coupling register already lists ADR-024 among the Accepted ADRs whose old-substrate passages
  `storage-cutover` supersedes or amends at its documentation pass, so accepting it now matches that plan.
- **A realization that did not ship as stated.** Accept with a dated note naming what shipped instead. If the decision
  itself was not carried out, stop for the Owner.
- **ADR-020 stays Proposed** (Owner, 2026-11-04). The storage-coupling register's open row for it names
  `scalable-core` as owner, with the fate "amend ADR-020 before acceptance". The overtaken and contested parts of
  ADR-020 are captured for `scalable-core` in `USER-INBOX § Work Unit`: ADR-023 replaces the tier vocabulary of
  §2–3, ADR-038 retires the extension mechanism §9 prefers, and `scalable-core`'s draft holds open entries on §8.
  After this phase ADR-020 is the only Proposed ADR on the base branch, under Decision 2's rule for a Proposed ADR
  already there. Its acceptance rests on that register row and the capture; the status check does not force it.

## Alternatives considered

- **Deferred acceptance by a structured trigger** (the PM brief's item 3, reversed by the Owner on 2026-11-04). Each
  Proposed ADR would name the work unit whose landing accepts it, and the check would resolve that edge through the
  lifecycle view, as `Depends On` edges resolve in `classifyDependencyEdge` (`lib/status/project-view.ts`). Rejected
  for three reasons:
    - The guides we checked (Nygard, AWS Prescriptive Guidance, Azure Well-Architected, MADR) accept a decision on
      agreement or merge and treat implementation as separate. None ties acceptance to later work.
    - CI runs every merge-gate check but fetches no `refs/arc/*`, and the ownership marker is untracked, so CI
      cannot identify the landing work unit. The check would have needed a CI identity and lifecycle refs kept
      reachable through the cutover.
    - An ADR left editable for months does not show what was decided when, which is how the five stale ADRs
      arose.
- **Accept at agreement or at kickoff.** Today's "just before starting" text locks the record before
  implementation corrects it, which is defect 2.
- **Write the ADR at planning close.** A park at Planning copies only the planned artifact group
  (`lib/work-unit/park-planning-landing.ts`) and tears the planning branch down, so carrying ADR files would need a
  lifecycle change, and planning branches retire at the cutover anyway.
- **Lock the record at the status flip.** The flip lands in `verify-work-unit`'s Step 1, before the criteria walk,
  private review, and hosted review, so every review-time correction would become an amendment.
- **One ADR per qualifying decision, or tuning the threshold now.** The first floods the record with near-duplicate
  ADRs; the second is the PM brief's deferred candidate.
- **The pull-request-body surface boundary for ADRs.** That rule is token-level because a pull-request body is
  published under the owner's name; under it a tracking reference would be forbidden outright. Reader independence
  matches the guides: Azure's "the decision must be clear and stand alone", with tracker links in metadata or "More
  Information".
- **Detection in `planning-review`'s author checks, or a new `assess-adr-worthiness` method.** The first makes ADR
  dispositions a review item rather than part of being ready; the second has one consumer and fails P6.
- **Accept ADR-020 now and check every ADR's Status in the tree.** This would override the storage register's fate
  for ADR-020, and give `scalable-core` a supersession for each change it plans to make.
- **Fail any change that edits a Proposed ADR without accepting it.** Four changes have edited ADR-020 since it was
  written without accepting it: a repository-wide lint sweep (`6ec81a0c76`, emphasis styles, 182 files), a targeted
  edit (`e7eb06de92`, invariant markers), and two coordination updates (`b66073b5fe`, `eefabd310d`). Under a
  zero-tolerance `lint:md`, a sweep like the first could neither leave ADR-020 alone nor conform it, and the only way
  out would be accepting it against the register.
- **A shipped CLI verb now.** It prepays for the CineXplorer port, which is out of scope.

## Touched surfaces

- `strategy-adr-methodology.md`:
    - § ADR Format › Status and § ADR Lifecycle for Decision 2's timing. § ADR Lifecycle › Proposed says the file is
      written with the implementation even when a planning stage recommends the ADR earlier.
    - Reader independence: the Reader independence item by name and the three quoted sentences (Decision 4).
    - Every passage that locks the record at acceptance is reworded so it locks when the change that accepts it
      merges: § What Are ADRs › Key Characteristics ("Stable"), § ADR Format › Status's note, § ADR Lifecycle ›
      Accepted, and the `[invariant]` opening § Amending Accepted ADRs.
    - § Amending Accepted ADRs › Tier 1 names renumbering an ADR whose number collides, with the records that cite
      it, as a metadata correction.
- `strategy-package-project-sync.md` (project strategy): the Documentation Architecture table's Mutability row for
  ADRs, reworded to lock when the accepting change merges.
- `template-adr.md`: the Status guidance under Decision 2.
- `reference/adr/README.md`: kept consistent with the strategy's status meanings, without growth.
- `STRATEGY-INDEX.md` package source: the directive entry.
- `assess-draft-readiness.md`: Decision 1's criterion.
- `DEV-RULES.PROJECT.md`: the audience line in Decision 4.
- The check script, its npm script, its two `arc-checks.yml` declarations, and its tests.
- ADR-023, ADR-024, ADR-025, ADR-033, and the new ADR-040.

Every shipped file above edits in package source and syncs to `.arc/`.

## Constraints

- **Stay clear of `cutover-flip`.** This work unit edits no file the flip's rewrite touches, so it can land before or
  after the flip, and Decision 3 reads no lifecycle state.
- **No delivery-workflow change and no new record shape** (`cohort-state-storage.md` pull-forward filter).
- **The storage register stands.** ADR-020's row keeps its owner and fate, and ADR-024's acceptance matches its row.
- **Evolution strategies.** Knowledge evolution P2, P3, P7, P10 as noted per decision; procedure evolution P1 (the
  merge checks compute the flip-due and number facts) and P5. The readiness criterion and the reader check are
  judgment prose, and `workflow-eval-harness`, which would cover them, is planned, not shipped. Storage evolution
  § The line and Principle 5, as Decision 2 notes.

## Success signal

- The spec's tests cover each of the status check's five rules. A merge-gate run fails the status check, naming the
  file and its remedy, for a new ADR reading Proposed, an ADR returned to Proposed, and a removed Status section. It
  passes once the base version's Status section is restored or, for a new ADR, once it is Accepted. A change that
  edits or renames ADR-020 and leaves it Proposed passes, and a same-number collision never supplies a base version.
  A run with no base refuses, naming the resolvable-base and merge-base remedies. This work unit's ADR-040 shows the
  new-ADR case at its own verification.
- A tree holding two ADRs with one number fails the number check at any merge gate, naming both files and which one
  to renumber, or that either may be when the change adds both; with no base it names both, states the rule, and asks
  for the base branch to be made resolvable.
- After this work unit merges, ADR-020 is the only Proposed ADR on the base branch.
- `assess-draft-readiness` returns a `needs-detail` gap for a settled decision with no ADR disposition, at every
  Class.

## Unknowns and assumptions

- **Status-line variants.** Accepted lines today carry dates, amendment notes, and partial supersessions, such as
  ADR-011's "Accepted · Amended…". The rule keys only on a leading `Proposed`, so these pass, but the spec states
  the exact parse.
- **Flip evidence.** `arc status` reports every named realizing work unit shipped. ADR-024's realization was
  spot-checked at source (`template-cohort.md`, `decompose-work-unit.md`, `validate-cohort-consistency.ts`,
  `assess-boundary-fit.md`); the rest are verified in the flips phase.
- **Pull requests opened early.** A pull request into the base branch that carries a Proposed ADR before its change
  verifies shows the status check red in CI until the flip, which is the intended "not ready to merge" signal.
  Review projections open against their own anchor branches and run no CI, per `strategy-review-projection.md`, so
  they never meet it.

## Scope boundary (Won't Do)

- No change to `integrate-work-unit.md` or `init-work-unit.md`, and no lifecycle backstop step.
- No meta field, no new stored record, and no acceptance-trigger grammar.
- No edit to `create-spec.md` or `spec-review.md`; the held post-flip Errand carries them.
- No acceptance of ADR-020; the storage register gives it to `scalable-core`.
- No tuning of § When to Write an ADR. Criterion 5's "could be reversed later" reads looser than the usual "costly
  to reverse", and criterion 2 alone fits nearly any decision; both are candidates for later.
- No sweep for ADRs that were never written; that follows once this lands, with the PM offering a read-only
  candidate list.
- No retrofit of existing ADR bodies to reader independence.
- No unification of this repository's reader-surface norms (code and durable docs, commit prose, pull requests,
  specs, ADRs). It is a separate concern, captured in `USER-INBOX` for a planned follow-on work unit,
  `reader-surface-norms`, not yet minted.
- No CineXplorer port and no shipped CLI verb.

## Planning record

- **Depth:** `medium`. A bounded set of decisions composed from existing patterns: the readiness bar, the reader
  check, and the check declaration.
- **Class:** `Heavy`, up from the `Light` estimate (Owner, 2026-11-04). Derivation fired: the acceptance timing,
  the check's evidence model, and the detection site each carried real alternatives. Scale does not fire, and
  nothing is invented.
- **Boundary fit:** stays one work unit. Every surface serves one concern, when an ADR is born and when it locks.
  The flips are the first phase, folded here deliberately rather than run as an Errand, and no piece is
  independently ownable. The `create-spec.md` and `spec-review.md` edits left as a held post-flip Errand:
  `create-spec.md` is in `cutover-flip`'s rewrite, and `spec-review.md`'s nudge points at create-spec's Novel
  overlay (`spec-review.md` § Novel overlay), so the two change together.
- **Research basis:** a single-pass external survey (2026-11-04) of Nygard's 2011 post, MADR's templates, AWS
  Prescriptive Guidance, Google Cloud's and Azure Well-Architected's ADR guidance, and log4brains. The pull-request
  merge convention rests on team-level sources (Shopware, GSA, Picodata), read only through search summaries.

## Continuity

- **Readiness:** `formalization-ready` by the author's assessment, with both independent passes folded: five
  fix-check rounds followed the first and two followed the second.
- **Next:** `create-spec`.
