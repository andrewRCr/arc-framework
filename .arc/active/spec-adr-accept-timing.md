# Spec (`detailed` · `RFC`): adr-accept-timing

- **Origin:** [internal]

- **Purpose:** Make ADRs the reliable, standalone record of this project's decisions. Every work unit tests its
  settled decisions for ADR-worthiness when its draft or determinacy confirmation closes, whatever its Class. Each
  ADR is written with the work it records, stays freely editable until the change that completes that work merges,
  and turns Accepted in that change. A merge-gate check refuses a change that would merge an ADR it adds, or returns
  to Proposed, while the ADR is still Proposed.

---

## Introduction / Context

ADRs under `.arc/reference/adr/` are where a reader finds the human decisions behind this heavily AI-assisted project,
browsed by concern rather than by work unit. Specs and drafts carry the same rationale, but they are grouped by work
unit, read as internal, and a draft is deleted when its spec is created. Four defects keep the ADR record from serving
that reader.

1. **No planning stage prompts an ADR outside `Novel` work.** `DEV-RULES.PROJECT` § Architecture Decision Records says
   to document significant architectural decisions as ADRs, with no stage attached. Among shipped workflows and
   methods, only `create-spec.md` § Novel overlay (the ADR-companion) and `spec-review.md`'s matching nudge ask, and
   both fire only at `Class == Novel` with a `detailed` spec. The `STRATEGY-INDEX` entry for
   `strategy-adr-methodology.md` has a passive condition, "Consult when: writing an ADR, deciding whether a decision
   warrants one", which fires only when an agent already wonders.
2. **Acceptance comes at the wrong moment.** `strategy-adr-methodology.md` § ADR Lifecycle › Accepted commits the
   acceptance "alongside implementation (or just before starting)", and an Accepted body is append-only. A premise
   corrected later in the same work then lands as an amendment instead of a plain edit.
3. **Nothing catches a forgotten flip.** Five ADRs are Proposed today. For four of them (ADR-023, ADR-024, ADR-025 and
   ADR-033) every work unit their Status text names as the promotion event has shipped, as `arc status` reports. Each
   names its promotion event in prose, such as "when that work unit integrates", and none was promoted.
4. **ADR bodies lean on planning history.** `DEV-RULES.PROJECT` § Audience Boundaries classes `.arc/reference/adr/` as
   an internal surface that may "reference internal WU names, in-flight scope, transitional state, and
   project-internal concerns freely". ADR-033's Context opens with the work unit that built the mechanism it retires,
   a name an outside reader cannot resolve.

Fixing the first defect raises a risk concurrent work already carries. More work units write ADRs, each numbers its own
in the change that delivers its work, and with several in flight two changes can take the same next number, so a
citation by number no longer names one record.

## Goals

1. Every decision a work unit's draft or determinacy confirmation settles carries an ADR disposition, at every Class
   and every planning depth.
2. An ADR is written with the implementation, stays freely editable until the change that accepts it merges, and is
   Accepted in that change.
3. A merge gate refuses, deterministically and with the remedy in its output, a change that would merge an ADR it adds
   reading Proposed, an ADR it returns to Proposed, or an ADR whose Status section it removes.
4. A merge gate catches two ADRs sharing a number, and names which to renumber when a base resolves and the change adds
   one of them.
5. An ADR's body stands without planning history.
6. After this work merges, ADR-020 is the only Proposed ADR on the base branch.

## Non-Goals

_Editable in place until activation, then frozen; changes after that append: `Amended YYYY-MM-DD — <delta> — <prompt>`_

- No change to `integrate-work-unit.md` or `init-work-unit.md`, and no lifecycle backstop step.
- No meta field, no new stored record, and no acceptance-trigger grammar: an ADR names no work unit or event that
  accepts it.
- No edit to `create-spec.md` or `spec-review.md`: create-spec's Novel ADR-companion recommendation and spec-review's
  Novel-only ADR nudge stay as they are (§ 2.5).
- No acceptance of ADR-020.
- No tuning of § When to Write an ADR. Criterion 5's "could be reversed later" reads looser than the usual "costly to
  reverse", and criterion 2 alone fits nearly any decision; both stay as written.
- No sweep for ADRs that were never written.
- No retrofit of existing ADR bodies to reader independence; an edit meets it only over its changed footprint
  (§ 6.2).
- No unification of the repository's reader-surface norms (code and durable docs, commit prose, pull requests, specs,
  ADRs).
- No port to other projects and no shipped CLI verb: the checks are this repository's own declarations.

## Proposed Design

### 1. The ADR lifecycle

#### 1.1 When an ADR is written

The ADR file is written with the work's implementation and delivered by the change that completes the work; in a
multi-member delivery, that is the terminal member. Until then the draft, and then the spec, carries the decision, its
rationale, and its ADR disposition (§ 2). A disposition is part of the decision's binding design. The spec carries
each one in its design substrate (an `outline`'s Decision(s), an RFC's Proposed Design, a PRD's Requirements),
beside its decision or in one list there, and lists each new or amended ADR there among what the delivering change
delivers. A `new ADR` or `amendment` disposition makes its spec at least an `outline`; a `brief` carries only
dispositions that deliver nothing, `none` or covered by an ADR already on the base branch, and need not record them.
No ADR file exists during planning. This holds when a planning stage recommends an ADR earlier: the recommendation is
recorded as a disposition, and the file is written with the implementation.

#### 1.2 Status meanings

- `Proposed` means written but not yet accepted: in a change that has not merged, or, for a record already on the base
  branch, awaiting the change that accepts it.
- `Accepted (YYYY-MM-DD)` is set in the delivering change before it merges, dated the day of the flip.
- `Deprecated` and `Superseded by ADR-XXX` keep their current meanings.

The Status section's first line states the status. Later paragraphs in the section may record how it was reached.

#### 1.3 When it locks

The amendment tiers bind from the merge of the change that accepts the ADR, whatever the Status reads before then.
Until that merge the ADR stays freely editable, through verification and every review. After it, the three amendment
tiers apply, and a changed decision is a supersession.

#### 1.4 A Proposed ADR already on the base branch

A Proposed ADR already on the base branch, such as one in a project's existing ADR log, stays editable until the change
that accepts it, and locks when that change merges. Any change may edit it in the meantime, such as a repository-wide
formatting fix, without accepting it. No change may add an ADR as Proposed or return an ADR to Proposed.

#### 1.5 Later realization

When later work realizes an Accepted decision, the ADR notes the realization timing, and learnings from that work
arrive as dated amendments. A decision that genuinely unfolds in separable phases may be split into one record per
phase.

#### 1.6 Strategy, template, and sync-strategy text

`strategy-adr-methodology.md` states §§ 1.1–1.5. Each passage below is reworded; nothing else in the strategy changes
except § 6.1's addition.

- **§ What Are ADRs › Key Characteristics, "Stable."** The decision is final once the change that accepts the ADR
  merges.
- **§ ADR Format and Structure › 2. Status.** The format line states that the section's first line carries the status
  (§ 1.2). The valid states carry § 1.2's meanings, with `Accepted (YYYY-MM-DD)`. The note locks the record when the
  change that sets `Accepted` merges.
- **§ ADR Lifecycle › Proposed.** When: written with the implementation, in the change that completes the work, even
  when a planning stage recommends the ADR earlier; until then the draft, and then the spec, carries the decision and
  its disposition as binding design (§ 1.1). Process: write the file reading `Proposed`; edit it freely through
  verification and review; set it to `Accepted (YYYY-MM-DD)` in that change before it merges. It also states § 1.4.
- **§ ADR Lifecycle › Accepted.** When: the delivering change's work is complete, before it merges. Process: set the
  dated Status, ensure the sections are complete, and the decision locks when that change merges. It states § 1.5,
  and that a project can enforce the rule at its merge gate by refusing a change that adds an ADR reading Proposed,
  returns one to Proposed, or removes a Status section. It does not describe this repository's script.
- **§ Amending Accepted ADRs.** The `[invariant]` opening reads that an accepted ADR's decision is final once the
  change that accepts it merges.
- **§ Amending Accepted ADRs › Tier 1.** One more permitted correction: renumbering an ADR whose number collides with
  another's, together with the records that cite it by number.

`template-adr.md`'s Status section starts at the bare line `Proposed`, the strategy's starting state, in place of its
`{Proposed | Accepted | Deprecated | Superseded by ADR-XXX}` placeholder. A guidance comment after that line, never
before it, lists the four states with their timing: `Proposed` while the delivering change is unmerged, and
`Accepted (YYYY-MM-DD)`, set in that change before it merges. The status check reads the section's first non-blank
line (§ 3.2), so a comment above it would become the status line.

`strategy-package-project-sync.md` § Documentation Architecture: the table's Mutability row for ADRs reads
"Immutable once the accepting change merges (supersession)".

`reference/adr/README.md` needs no edit: its Status list (`Proposed | Accepted | Deprecated | Superseded by ADR-XXX`)
and its naming rules already agree with § 1.2 and § 4.

### 2. Detection at planning close

#### 2.1 The criterion

`assess-draft-readiness` gains a fourth criterion in § The bar:

> **Every settled decision carries an ADR disposition.** Each decision the draft settles records one, in its decision
> prose, against `strategy-adr-methodology.md` § When to Write an ADR. With no draft, the determinacy confirmation
> states each disposition. The spec carries every disposition in its design substrate (an `outline`'s Decision(s),
> an RFC's Proposed Design, a PRD's Requirements), beside its decision or in one list there, and lists each new or
> amended ADR there among what the work delivers. A `new ADR` or `amendment` disposition makes its spec at least an
> `outline`; a `brief` carries only dispositions that deliver nothing, `none` or covered by an ADR already on the base
> branch, and need not record them.

The criterion's text also lists § 2.2's four dispositions and its misuse gap. A missing disposition is a
`needs-detail` gap. The bar stays identical at every depth. The method's description and
its text count four criteria where they now count three: the frontmatter `description`, "all three criteria below
clear", and "ready — all three clear".

#### 2.2 Dispositions

A disposition is one of four:

- **a new ADR** the work unit will deliver;
- **an amendment** to a named ADR;
- **covered by** a named ADR that records the decision: one the work unit delivers or amends, so that a work unit's
  related decisions share one record, or a Proposed or Accepted ADR already on the base branch that records the
  decision unchanged;
- **`none`**, naming the § When to Write an ADR "Don't write an ADR for" category the decision falls in (a tactical
  choice, one obvious from code, or a temporary one), or stating that it meets none of the five criteria.

A "covered by" naming any other ADR is not a disposition, so it is a `needs-detail` gap as well. Examples are a number
that names no ADR on the base branch and none the work unit delivers, a Superseded or Deprecated ADR, or an ADR that
is neither on the base branch nor the work unit's own. The gap closes by citing an ADR that qualifies or by choosing
another disposition.

The criteria are any-of, as the strategy states: "Write an ADR when a decision meets any of these criteria".
Criterion 2, multiple alternatives considered, fits most decisions a draft settles, so most qualify. "Covered by" keeps
the count near one ADR per work unit.

#### 2.3 Reach

The method already fires at `draft-design`'s loop exit and in `planning-review`'s draft author checks, and
`create-spec` runs it at entry over the `low` path's determinacy confirmation. The one criterion therefore reaches
every Class and every depth. The method loads on demand, so the always-loaded set does not grow.

#### 2.4 The index entry

The `STRATEGY-INDEX` entry for `arc/strategy-adr-methodology.md` becomes a directive naming the residual:

```markdown
- `arc/strategy-adr-methodology.md`
    - ALWAYS load before writing, amending, or accepting an ADR; `assess-draft-readiness` carries the planning-close
      test of which decisions warrant one.
```

#### 2.5 The Novel ADR-companion, until it changes

`create-spec.md` § Novel overlay still recommends an ADR-companion at `Novel` with a `detailed` spec and says the ADR
"rides the normal ceremony commit", which has the ADR written at spec creation. The strategy and the criterion govern:
a companion that `create-spec` recommends is recorded as a disposition, and its file is written with the
implementation. A decision first settled in a spec or amendment outside `Novel` gets no ADR nudge until
`spec-review`'s nudge widens. The other `Novel` sites, `strategy-work-organization.md` (twice) and
`classify-work-unit.md`, name "an ADR" as part of the `Novel` planning shape without stating when its file is written,
so they do not conflict.

### 3. The status check

#### 3.1 Declaration

`.arc/system/arc-checks.yml` declares `lint:adr:status`:

```yaml
lint:adr:status:
  command: [npm, run, -s, lint:adr, --, status]
  gate: merge
  mode: files
  widen: false
  inputs:
    - .arc/reference/adr/adr-*.md
  runtime_inputs: # the script's content hash (§ 5.3)
```

As a files-mode check it receives `ARC_CHECK_TREE`, and `ARC_CHECK_BASE` when a base resolved, from `checkEnvironment`
(`lib/checks/process.ts`). Content coordinates reach only a files-mode check (`handlers/check/run.ts`,
`runNativeForecastCheck` in `lib/ci-check-runner.ts`). Its path arguments follow the command.

`requestScope` (`lib/checks/request.ts`) gives a merge-gate request scope `all`. `selectAllScopeInputs`
(`lib/checks/selection.ts`) narrows that to the check's own changed inputs only under `boundedDefaultMergeCheck`: a
default merge-gate request, files mode, no widening. That request passes only the changed paths. A named run, the retry
command a failure prints (`checkRetryCommand`, `lib/checks/remedies.ts`), or an unresolved base passes every matching
ADR, because `selectedFilePaths` (`handlers/check/run.ts`) falls back to all inputs when none are selected. Removed
paths are never passed: `select_deletions` defaults to false (`lib/checks/declaration.ts`), and `selectedFilePaths`
drops deletions. So the script works out the change itself, from the ADR lists at `ARC_CHECK_BASE` and
`ARC_CHECK_TREE`.

#### 3.2 Reading an ADR's Status

An ADR's Status section is the text under its first level-2 heading reading exactly `Status`, up to the next level-1
or level-2 heading. Headings inside fenced code blocks do not count. Its status line is the section's first non-blank
line. The section is missing when no such heading exists or the section holds no non-blank line.

A status line reads Proposed when its first word, with leading Markdown emphasis markers (`*`, `_`) and trailing
punctuation removed, is `proposed` in any case. Every other status line, such as `Accepted (2026-10-10), where …`,
`Accepted · Amended 2026-03-05 …`, `Superseded by ADR-029.` or `Deprecated - …`, does not.

#### 3.3 An ADR's base version

ADR paths are the files matching `.arc/reference/adr/adr-*.md`. An ADR's number is the run of digits after `adr-` in
its file name, compared as an integer; a name without one has no number and is never a rename's base version.

For a path `P` in the tree, its base version is found in this order:

1. When `P` exists at the base, that file is its base version.
2. Otherwise, take the base paths that carry `P`'s number and are absent from the tree. When exactly one exists, and
   `P` is the only tree path absent from the base with that number, that file is `P`'s base version: `P` is a rename.
3. Otherwise `P` has no base version and is a new ADR.

A base path still present in the tree is never another path's base version. That is a same-number collision, which the
number check reports (§ 4).

A renumber changes the number, so a renumbered ADR has no base version and reads as new: a Proposed ADR renumbered
under § 4.3 passes rule 1 only once it no longer reads Proposed, and its remedy accepts it in that change. § 1.4's
freedom to edit a Proposed ADR without accepting it does not reach a renumber, which arises only from a collision
(§ 4).

#### 3.4 Which ADRs it examines

The script examines each ADR path among its arguments that has no base version, or whose base version differs from it
in path or content. Arguments outside the input glob are ignored. Contents come from `ARC_CHECK_TREE` and
`ARC_CHECK_BASE` (`git show <revision>:<path>`, as `lib/reach-check.ts` reads them), never from the worktree. A merge
gate run locally snapshots the worktree into `ARC_CHECK_TREE`, so an ADR not yet committed is examined.

#### 3.5 Rules

1. **A new ADR merges with a Status section that does not read Proposed.** It fails when its Status reads Proposed or
   its Status section is missing. The rule keys only on Proposed because the failure it exists to catch is a forgotten
   flip, an ADR left at the template's starting state.
2. **A change does not return an ADR to Proposed or remove its Status section.** An ADR with a base version fails when
   its Status reads Proposed and the base version's Status section is present and does not read Proposed. It also
   fails when its Status section is missing and the base version's is present.
3. **An ADR already Proposed on the base branch stays editable, a rename included.** An ADR whose base version reads
   Proposed passes whatever its Status reads, provided its Status section is present. A base version with no Status
   section constrains nothing; no ADR on the base branch lacks one today.
4. **A same-number file elsewhere in the tree is a different record.** A base-branch ADR with the same number at a
   different path, still present in the tree, never supplies the base version (§ 3.3).
5. **A remedy never writes a Status the base version did not have.** For an ADR with a base version, the remedy
   restores the base version's Status section. `Accepted (<today>)`, set in this change before it merges, is the
   remedy only for a new ADR.

#### 3.6 Failure output

The check fails when any examined ADR fails, after reporting every failure. Each failure names the file and its remedy,
using these forms, where `<today>` is the run's local calendar date as `YYYY-MM-DD`:

- New ADR reading Proposed: `<path> is a new ADR reading Proposed. A new ADR merges Accepted: set its Status to
  "Accepted (<today>)" in this change before it merges.`
- New ADR without a Status section: `<path> is a new ADR with no Status section. Add "## Status" reading
  "Accepted (<today>)" in this change before it merges.`
- Returned to Proposed: `<path> returns an ADR to Proposed. Restore the Status section of its base version
  (<base path> at <base>):`, followed by that section's text, indented.
- Status section removed: `<path> removes its Status section. Restore the Status section of its base version
  (<base path> at <base>):`, followed by that section's text, indented.

`<base path>` differs from `<path>` only for a rename. `<base>` is the abbreviated `ARC_CHECK_BASE`.

#### 3.7 No base

When `ARC_CHECK_BASE` is absent, the script refuses rather than passing, or failing on every Proposed ADR, as
`scripts/check-package-sync.sh` refuses without a base. It prints:

```text
No base to compare ADRs against: the base branch did not resolve, or it has no single merge base with HEAD.
Make the base branch resolvable (its upstream or local branch) and rerun, or name the merge base itself:
arc check run lint:adr:status --range <merge-base>
```

`resolveRequestBase` (`lib/checks/resolve-request.ts`) gives scope `all` the automatic base, so a named run and the
retry receive one whenever the base branch resolves and has a single merge base with HEAD. `automaticBase` has no base
when HEAD is unknown, when the base branch does not resolve (`resolveCheckBaseBranch` reads its upstream, then the
local branch), or when the merge base is not single. An explicit range base is used as given, so naming the base
branch itself on a branch that has fallen behind would read ADRs accepted there since as returned to Proposed; the
remedy therefore names the merge base. CI resolves the base, so this arises only locally.

ADR-020 is Proposed on the base branch, so edits to it, a rename included, pass until a later change accepts it.

### 4. The number check

#### 4.1 Declaration

```yaml
lint:adr:numbers:
  command: [npm, run, -s, lint:adr, --, numbers]
  gate: merge
  mode: files
  pass_paths: false
  inputs:
    - .arc/reference/adr/adr-*.md
  runtime_inputs: # the script's content hash (§ 5.3)
```

Withholding paths runs the check once over the whole set: `checkArgumentBatches` (`lib/checks/batching.ts`) gives a
`pass_paths: false` check one invocation, as `test:store` uses. Left widening, it is selected at every merge gate,
since `selectAllScopeInputs` narrows only a bounded check, so it runs on every pull request and on each push to the
base branch.

#### 4.2 Collisions

Across every ADR path at `ARC_CHECK_TREE`, the check fails for each number two or more paths share, naming every path
that carries it. A path at the tree is **added** when it is absent from the ADR list at `ARC_CHECK_BASE`; an ADR the
change adds but has not committed is in the snapshot tree, so it counts as added.

#### 4.3 Which one to renumber

The remedy keys on the collision, not on where the run happens. For each colliding number, with a base:

- **The change adds some of them.** Renumber every added path except one when no path is on the base branch, or every
  added path when one is. With two files: renumber the one the change adds, or either when it adds both.
- **The change adds none of them.** The collision is already on the base branch. The failure names every path that
  carries the number and states the rule: in a separate change, renumber every path except the one that landed first
  in the base branch's first-parent history. The script does not work out which one that is.

Each remedy names the target number: the next free one, one greater than the highest number at the tree or the base,
written with three digits. Further renumbers in the same run take consecutive numbers. Each remedy also says to update
the records that cite the renumbered ADR by number, a Tier 1 correction (§ 1.6).

On a push to the base branch the base is the pushed tip, so a collision there reads as one the change adds none of.

#### 4.4 No base

With no `ARC_CHECK_BASE`, the check still fails on a collision, naming every path that carries the number. It states
the rule of § 4.3 for the reader to apply (renumber the one this change adds, either when it adds both, and in a
separate change the later-landed one when it adds neither) and says to make the base branch resolvable and rerun to
have the file named. A `--range <base>` rerun would not help here: a files-mode check named with an explicit range runs
only when its inputs changed (`selectCheckInputs`, `lib/checks/selection.ts`), so when the change edits no ADR, a
collision already on the base branch would go unselected.

#### 4.5 The push run is the backstop

The ruleset on `main` sets `strict_required_status_checks_policy: false`, and `.github/workflows/ci.yml` does not
re-run a pull request when the base moves. Two pull requests adding the same number in different files can each pass;
the next run on the base branch then fails until one is renumbered.

### 5. Script and placement

#### 5.1 Shape

One script, `packages/arc-framework/src/scripts/check-adr-records.ts`, serves both declarations. It runs as the root
npm script `lint:adr`, `node --import tsx packages/arc-framework/src/scripts/check-adr-records.ts`, like the
`lint:arc:*` checks. Its first argument names the rule, `status` or `numbers`; for `status`, the remaining arguments
are paths. Any other first argument is a usage error.

The rules run as pure functions over the base and tree ADR sets (path, number, Status section), the examined paths,
and the run date. A thin reader builds those inputs from `ARC_CHECK_TREE`, `ARC_CHECK_BASE`, and git, so tests drive
the rules without a repository.

#### 5.2 Outcomes

The script exits zero when every rule holds and non-zero on a failure, a refusal, or a usage error. A git or read
failure fails the check with the git error, never passing it.

#### 5.3 Caching

`currentContent` (`lib/checks/key-resolver.ts`) keys a result on the content of every file the inputs match, not only
the changed paths. Both declarations also hash the script and the repository modules it imports in `runtime_inputs`,
as `check-package-sync` hashes its script. The script stays out of the inputs: passed as an argument it names no ADR,
so a change to it alone would select the status check to examine nothing, and its tests cover it.

#### 5.4 Where the checks run

A work unit meets the checks first in `verify-work-unit`'s Step 1, which requests `arc check gate merge --force`
before its final local attestation; § 1.3 keeps the ADR editable through the reviews that follow. CI runs them as well:
`runCiCheckStep` (`lib/ci-check-runner.ts`) runs each merge-gate check `.github/check-plumbing.yml` does not name at
the `lint-typecheck`/`default` step, which has no step condition. A pull-request run checks out GitHub's merge of the
head into the current base, per `ci.yml`. An Errand meets them in CI.

`arc-checks.yml` is not in `init-recipe.json`, and projects write their own declarations;
`bootstrapRetiredChecks` (`lib/checks/bootstrap.ts`) writes a proposal only when a retired surface is removed. The
shipped strategy states the rule (§ 1.6) without this script.

### 6. ADR bodies meet reader independence

#### 6.1 The rule

`spec-review` defines reader independence: its common reader checks' Reader independence item (meaning stands without
planning history), and three sentences inside two of its Reference boundaries bullets: "Judge what supplies meaning,
not tokens.", "ARC terms and artifact names are valid subject matter when their required meaning is established or
defined locally.", and "The substantive thesis stands without tracking fields; they supply no missing design." An
ADR's Context, Decision, and Consequences meet those, and its Status section is the tracking slot. The rest of those
two bullets, and Binding completeness, the other common reader check, are specification obligations and do not apply.

`strategy-adr-methodology.md` gains a closing subsection of § ADR Format and Structure, "Reader independence". It
names `spec-review`'s Reader independence item and quotes the three sentences, since they have no anchor of their own.
The quotes are a copy that names `spec-review` as its source, and a change to those sentences carries to the strategy.
It states the rule's scope: an ADR's Context, Decision, and Consequences meet it, and its Status section carries
tracking. It then says what goes and what stays: "Process narration doing the explaining goes, such as 'surfaced
during Task 5.2' or 'ships with work unit X'. A project's own domain vocabulary stays."

#### 6.2 Footprint

A new ADR meets the rule across its whole body. An edited ADR meets it over the changed footprint, as `spec-review`
scopes an edit to an existing specification: "the changed footprint, including removals and affected surrounding
obligations and definitions". The flips (§ 7) change Status sections and ADR-024's stale references, so no flipped
body is rewritten.

#### 6.3 Audience line

`DEV-RULES.PROJECT` § Audience Boundaries keeps `.arc/reference/adr/**` internal for shipping purposes but drops ADRs
from the surfaces that reference work-unit names freely: a sentence after that list's closing line says ADR bodies meet
`strategy-adr-methodology.md`'s reader-independence rule, leaving planning references to their Status sections. ARC
concepts stay domain vocabulary in those bodies under the section's existing line, "ARC concepts are domain vocabulary
here when they are the change's subject", so an ADR about cohorts may say "cohort". The section exists only in this
repository's copy. `DEV-RULES.ARC` § Documentation Boundaries is unchanged: its list of
places process rationale may go already includes specs, which carry the same check.

The rule is meaning-level, not a token lint: a slug or ID search would flag legitimate subject matter.

### 7. The stale Proposed ADRs

ADR-023, ADR-024, ADR-025 and ADR-033 become Accepted, after each named realization is checked at source:

| ADR     | Realization to check                                                                                                                                                                                                                                                                                   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-023 | The `Class` rule in `DEV-RULES.ARC`, the `AGENT-BRIEF` vocabulary, `classify-work-unit`, the meta `Class` field, the model in `strategy-work-organization`; the three spec-form templates and the per-stage planning-depth grammar (`resolve-planning-depth`); the cohort and `Cohort` field semantics |
| ADR-024 | The cohort vocabulary entry, the `cohort-*` movable-artifact enumeration in `DEV-RULES.ARC`, the taxonomy in `strategy-work-organization`, `assess-boundary-fit`, `template-cohort.md`, `validate-cohort-consistency.ts`, and `decompose-work-unit`                                                    |
| ADR-025 | `strategy-concurrent-work`, `assess-parallel-fit`, the behind-base detector and foreign-write backstop, the single-owner model, and the awaiting-review lifecycle seam                                                                                                                                 |
| ADR-033 | Locus records retired and checkout roles derived from marker, lifecycle, transient identity, and Git topology                                                                                                                                                                                          |

- **The flip.** Each Status line `Proposed.` becomes `Accepted (YYYY-MM-DD).`, dated the day of the flip. The
  paragraphs after it stay as record, promotion sentences included, and one sentence after them records that the
  promotion condition was met and names what shipped, as ADR-021's Status does.
- **ADR-024's references.** Its decide method `assess-cohort-fit` was renamed `assess-boundary-fit` (`eaa0c68432`).
  All three references, one in its Status and two in its Decision, become `assess-boundary-fit`, a Tier 1
  correction.
- **A realization that did not ship as stated.** Accept with a dated note in the Status section naming what shipped
  instead. If the decision itself was not carried out, stop for the Owner and leave that ADR Proposed.
- **The storage plan.** `cohort-state-storage.md`'s storage-coupling register already lists ADR-024 among the Accepted
  ADRs whose old-substrate passages the storage cutover's documentation pass supersedes or amends, so accepting it
  matches that plan.
- **ADR-020 stays Proposed.** Its tier vocabulary (§§ 2–3) is replaced by ADR-023, the extension mechanism its § 9
  prefers is retired by ADR-038, and open entries elsewhere bear on § 8. The storage-coupling register's row for it
  sets its fate: amend before acceptance, in the work that owns it. After the flips it is the only Proposed ADR on the
  base branch, under § 1.4. The status check does not force its acceptance.

### 8. ADR-040

ADR-040 records this design: the accept-at-merge lifecycle (§ 1), detection at planning close (§ 2), the merge-gate
checks (§§ 3–4), and the reader rule (§ 6).

- **File.** `.arc/reference/adr/adr-040-accept-adrs-when-their-work-merges.md`, titled
  "ADR-040: Accept ADRs When Their Work Merges", from `template-adr.md`. If another ADR-040 lands first, the number
  check names the renumber.
- **Criteria.** It meets § When to Write criteria 2 (accept at agreement, at kickoff, at the realizing work's landing,
  or at merge were weighed), 4 (a reader will ask why a new ADR is never Proposed on the base branch), and 5.
- **Content.** Context states the four defects, the number-collision risk, and the alternatives of § Alternatives &
  Rationale without planning history. Consequences note the four acceptances and why ADR-020 stays Proposed.
- **Timing.** It is written with the implementation and stays Proposed until this work's verification. There the merge
  gate fails on it, and setting `Accepted (<today>)` per the remedy exercises the status check end to end.
- **Dispositions.** §§ 1, 2, 3, 4, 6, and 7 are covered by ADR-040, and § 8 is the new ADR. § 5's script shape is
  `none`, a tactical choice; § 9 records no decision.

### 9. Touched surfaces

Package source, synced to `.arc/`:

- `arc/reference/strategies/arc/strategy-adr-methodology.md` (§ 1.6, § 6.1).
- `arc/reference/templates/arc/template-adr.md` (§ 1.6).
- `arc/system/methods/assess-draft-readiness.md`, its `.default` section (§ 2.1, § 2.2).
- `arc/reference/strategies/STRATEGY-INDEX.md`, its ARC framework section (§ 2.4).

This repository only:

- `.arc/system/rules/DEV-RULES.PROJECT.md` § Audience Boundaries (§ 6.3).
- `.arc/reference/strategies/project/strategy-package-project-sync.md`, the Mutability row (§ 1.6).
- `.arc/system/arc-checks.yml`, the two declarations (§§ 3.1, 4.1); root `package.json`, the `lint:adr` script.
- `packages/arc-framework/src/scripts/check-adr-records.ts` and its unit and integration tests (§ 5), and the
  `lint:adr` entry in `__tests__/integration/one-shot-script-entrypoints.test.ts`.
- ADR-023, ADR-024, ADR-025, ADR-033 (§ 7), and the new ADR-040 (§ 8).

## Alternatives & Rationale

- **Deferred acceptance by a structured trigger.** Each Proposed ADR would name the work unit whose landing accepts
  it, and the check would resolve that edge through the lifecycle view, as `Depends On` edges resolve in
  `classifyDependencyEdge` (`lib/status/project-view.ts`). Rejected for three reasons:
    - None of the guides surveyed (Nygard, AWS Prescriptive Guidance, Azure Well-Architected, MADR) ties acceptance
      to later work. Nygard and AWS accept a decision on the team's agreement; Azure and MADR state no trigger.
      Accepting at pull-request merge comes from team-level sources (Shopware, GSA, Picodata), read only through
      search summaries.
    - CI runs every merge-gate check but fetches no `refs/arc/*`, and the ownership marker is untracked, so CI cannot
      identify the landing work unit. The check would have needed a CI identity and lifecycle refs kept reachable
      through the storage cutover.
    - An ADR left editable for months does not show what was decided when, which is how the stale Proposed ADRs
      arose.
- **Accept at agreement or at kickoff.** Today's "just before starting" text locks the record before implementation
  corrects it, which is defect 2.
- **Write the ADR at planning close.** A park at Planning copies only the planned artifact group
  (`lib/work-unit/park-planning-landing.ts`) and tears the planning branch down, so carrying ADR files would need a
  lifecycle change, and planning branches retire at the storage cutover anyway.
- **Lock the record at the status flip.** The flip lands in `verify-work-unit`'s Step 1, before the criteria walk,
  private review, and hosted review, so every review-time correction would become an amendment.
- **One ADR per qualifying decision, or tuning the threshold now.** The first floods the record with near-duplicate
  ADRs; the second stays a later candidate.
- **The pull-request-body surface boundary for ADRs.** That rule is token-level because a pull-request body is
  published under the owner's name; under it a tracking reference would be forbidden outright. Reader independence
  matches the guides: Azure links supplemental material, but "the decision must be clear and stand alone without that
  material", and MADR's "More Information" section notes that "Links to other decisions and resources might appear
  here as well".
- **Detection in `planning-review`'s author checks, or a new `assess-adr-worthiness` method.** The first makes ADR
  dispositions a review item rather than part of being ready; the second has one consumer.
- **Accept ADR-020 now and check every ADR's Status in the tree.** This would override the storage register's fate for
  ADR-020 and turn each change its owner plans into a supersession.
- **Fail any change that edits a Proposed ADR without accepting it.** Four changes have edited ADR-020 since it was
  written without accepting it: a repository-wide lint sweep (`6ec81a0c76`, emphasis styles, 182 files), a targeted
  edit (`e7eb06de92`, invariant markers), and two coordination updates (`b66073b5fe`, `eefabd310d`). Under a
  zero-tolerance `lint:md`, a sweep like the first could neither leave ADR-020 alone nor conform it, and the only way
  out would be accepting it against the register.
- **A project-mode number check that resolves its own base.** A files-mode check receives the base `checkEnvironment`
  exports and, with `pass_paths: false`, runs once (`checkArgumentBatches`), so the script needs no second
  base-resolution path.
- **Name the first-landed ADR from first-parent history when the change adds neither.** That case arises only after two
  pull requests race on the base branch, which the push run reports at once, and the earliest commit adding a path
  dates a renamed ADR at its rename. Stating the rule, as the no-base case does, leaves the choice to a reader with the
  history in hand.
- **A `--range <base>` remedy for the number check.** A named range run selects the check only when the range changes
  an ADR, so a collision already on the base branch would go unchecked (§ 4.4).
- **A step in `integrate-work-unit.md` instead of a check.** That is a delivery-workflow change, and a step depends on
  the session reaching it; a merge-gate check runs on every pull request, an Errand's included.
- **A shipped CLI verb now.** It prepays for a port to other projects, which is out of scope.

## Cross-cutting Considerations

- **Testing.** `packages/arc-framework/__tests__/unit/scripts/check-adr-records.test.ts` drives § 5.1's pure functions
  and covers the first five items below. The unit tier runs no child processes or git repositories, so the next two
  are integration tests.
    - The Status parse (§ 3.2): emphasis, case, trailing punctuation, multi-paragraph sections, a heading in a code
      fence, and a missing section.
    - The base-version lookup (§ 3.3): same path, a rename, a same-number collision that supplies no base, and two tree
      paths claiming one removed base path.
    - Each status rule (§ 3.5) passing and failing, each failure form (§ 3.6), and the no-base refusal (§ 3.7).
    - Each number-check case (§ 4.3): adds one, adds both, adds neither, several collisions taking consecutive
      numbers, and no base.
    - The outcomes (§ 5.2): a read failure injected through the reader fails with the git error, and an unknown rule
      argument is a usage error.
    - `__tests__/integration/check-adr-records.test.ts` drives the script over a temporary repository with
      `ARC_CHECK_TREE` and `ARC_CHECK_BASE` set as `checkEnvironment` sets them, for both rules, including an ADR the
      change adds but has not committed.
    - `__tests__/integration/one-shot-script-entrypoints.test.ts` gains `lint:adr` beside the `lint:arc:*` scripts.
    - The readiness criterion and the reader rule are judgment prose with no eval coverage until an eval harness
      exists.
- **Rollout.** The flips (§ 7) come first. ADR-040 is written with the implementation and flipped at verification
  (§ 8). A pull request into the base branch that carries a Proposed ADR before its change verifies shows the status
  check red in CI until the flip, which is the intended "not ready to merge" signal. Review projections open against
  their own anchor branches and run no CI (`strategy-review-projection.md`), so they never meet it. Nothing here edits
  a file the storage cutover's workflow rewrite touches, and neither check reads lifecycle state, so the work lands
  before or after that rewrite.
- **Storage.** `strategy-storage-evolution.md` § The line keeps ADRs tracked after the cutover as constitutional
  documents. Its Principle 5 retires planning branches at the cutover ("activation creates the work branch"), so the
  work branch is the one tracked place an ADR can travel. Drafts and specs become stored records, so a disposition
  recorded there is storage-neutral. The rule names no planning branch, grooming change, or park path.
- **Compatibility.** Shipped changes are the strategy, template, index entry, and readiness criterion. A project's
  existing Proposed ADRs stay editable (§ 1.4), and the checks are this repository's declarations. No CLI behavior
  changes.
- **Performance.** The number check reads only the ADR names at the tree and the base. The status check reads the
  contents of the paths it examines and their base versions.
- **Status-line variants.** Accepted lines carry dates, amendment notes, and partial supersessions, such as ADR-011's
  `Accepted · Amended …`. The parse keys only on a leading Proposed (§ 3.2), so these pass.
- **Evolution strategies.** Knowledge evolution P2 (§ 2.4's directive), P3 (§ 2.3's one site anchored to closing a
  draft), P7 (the checks' emitted remedies), and P10 (the always-loaded growth is § 2.4's index entry, one line
  longer, and § 6.3's sentence). Procedure evolution P1 (the checks compute the flip-due and number facts) and P5 (the
  judgment prose's missing eval coverage, above).
- **Boundary fit.** Stays one work unit: every surface serves one concern, making ADRs the reliable, standalone record
  of this project's decisions: which decisions warrant one, when it is born and locks, and what its body stands on. The
  flips are folded in as its first phase rather than run apart, and no piece is independently ownable.

## Success Criteria

1. Both `check-adr-records.test.ts` files, unit and integration, and `one-shot-script-entrypoints.test.ts` pass,
   covering every case Cross-cutting Considerations › Testing lists.
2. A merge-gate run fails `lint:adr:status`, naming the file and its § 3.6 remedy, for a new ADR reading Proposed, a
   new ADR with no Status section, an ADR returned to Proposed, and a removed Status section. It passes once the base
   version's Status section is restored or, for a new ADR, once it reads Accepted. A change that edits or renames
   ADR-020 and leaves it Proposed passes, and a same-number collision never supplies a base version.
3. A run with no base refuses with § 3.7's text, naming the resolvable-base and merge-base remedies.
4. A tree holding two ADRs with one number fails `lint:adr:numbers` at any merge gate, naming both files. When the
   change adds one, the failure names it with its target number, or says either may be renumbered when it adds both;
   when it adds neither, it states the rule with the target number. With no base it names both, states the rule, and
   asks for the base branch to be made resolvable.
5. At this work's verification, `arc check gate merge --force` fails `lint:adr:status` on ADR-040 while it reads
   Proposed and passes once it reads `Accepted (<date>)`.
6. CI's pull-request run executes both checks at the `lint-typecheck`/`default` step.
7. `assess-draft-readiness` § The bar carries the fourth criterion with § 2.2's four dispositions and its gap rule, and
   the method counts four criteria throughout.
8. `strategy-adr-methodology.md` has no passage that locks an ADR at acceptance rather than at the accepting change's
   merge, and no "just before starting"; it carries § 1.1's binding disposition, § 6.1's subsection, and Tier 1's
   renumbering correction. `template-adr.md`'s Status section starts at the bare line `Proposed`, with its guidance
   comment after it.
9. The `STRATEGY-INDEX` entry reads as § 2.4 gives it, in package source and in `.arc/`.
10. At the verified head, ADR-020 is the only ADR whose Status reads Proposed, and ADR-024 names no
    `assess-cohort-fit`.
11. At the verified head, ADR-040 reads Accepted and its body meets § 6.1.
12. Every declared gate passes.

## Open Questions

[none]

## Amendments

[none]

---
