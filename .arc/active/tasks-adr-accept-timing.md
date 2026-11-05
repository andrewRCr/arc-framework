# Task List: ADR Proposed→Accepted Timing

- **Design:** `spec-adr-accept-timing.md`

---

## **Phase 1:** Accept the stale Proposed ADRs

_Purpose:_ ADR-023, ADR-024, ADR-025 and ADR-033 become Accepted once each named realization checks out at source, so
ADR-020 is the only Proposed ADR before the status check exists. One parent per ADR keeps each source check and its
flip one reviewable commit.

_Mode:_ `slice` through Phase 4 — closes on the ADR lifecycle enforced end to end: the merge gate refuses a new ADR
reading Proposed, with its remedy, and admits it once it reads Accepted.

_Design decisions:_ Each flip turns the Status line `Proposed.` into `Accepted (YYYY-MM-DD).`, dated by `date +%F` on
the day of the flip. The paragraphs after it stay as record, promotion sentences included, and one appended sentence
records that the promotion condition was met and names what shipped, as ADR-021's Status does. A realization that
shipped differently is accepted with a dated note in the Status section naming what shipped instead; a decision that
was not carried out stops for the Owner, and that ADR stays Proposed. Only Status sections change, plus ADR-024's
renamed references, so no flipped body is rewritten for reader independence.

### `[x]` **1.1 Accept ADR-023 — D7**

- _Goal:_ ADR-023 reads Accepted only after every realization its Status names is confirmed shipped, and its Status
  section records what shipped.

- _Outcome:_ Confirmed the constitutional Class model, the three spec forms (detailed split into PRD/RFC), planning-depth
  grammar, and cohort semantics at source; accepted ADR-023 with its realization recorded in Status.

### `[x]` **1.2 Accept ADR-024 and name its decide method correctly — D7**

- _Goal:_ ADR-024 reads Accepted after its realizations are confirmed, and every reference names its decide method
  by its shipped name.

- _Outcome:_ Confirmed the cohort model and its implementation at source; accepted ADR-024 and corrected all three references
  to the shipped `assess-boundary-fit` method.

### `[x]` **1.3 Accept ADR-025 — D7**

- _Goal:_ ADR-025 reads Accepted after its doctrine and each enforcement mechanism it names are confirmed shipped,
  and its Status section records what shipped.

- _Outcome:_ Confirmed the doctrine, advisory method, enforcement backstops, single-owner model, and awaiting-review seam;
  accepted ADR-025 while retaining its existing ADR-035 history-policy qualification.

### `[x]` **1.4 Accept ADR-033 — D7**

- _Goal:_ ADR-033 reads Accepted after the locus-record retirement and derived checkout roles are confirmed shipped,
  and its Status section records what shipped.

- _Outcome:_ Confirmed the retired record/lease modules and authority-only role derivation; accepted ADR-033 with the
  realized marker, lifecycle, identity, and topology sources recorded in Status.

## **Phase 2:** Build the ADR record rules

_Purpose:_ The rules both checks apply, written as pure functions over the base and tree ADR sets, the examined
paths, and the run date, so unit tests drive every case without a repository. Grouped by behavior path: reading a
record, which both checks share, then the status check and the number check.

### `[ ]` **2.1 Parse Status sections and resolve base versions — D3**

- _Goal:_ Every ADR path yields its number and Status section as the spec defines them, and every tree path resolves
  to its base version, a rename's base, or none.

    - Create `packages/arc-framework/src/scripts/check-adr-records.ts`, exporting the pure functions; the rules take
      ADR sets of path, number, and Status section, never a repository
    - Each side's ADR listing carries path and object id, as `git ls-tree` reports them, with the number derived from
      the path; the object id is what lets 2.2 tell an unchanged ADR from an edited one without reading either
    - Status section: the text under the first level-2 heading reading exactly `Status`, up to the next level-1 or
      level-2 heading, ignoring headings inside fenced code blocks; its first non-blank line is the status line; it
      is missing when no such heading exists or it holds no non-blank line
    - A status line reads Proposed when its first word, with leading `*` / `_` and trailing punctuation removed, is
      `proposed` in any case
    - Number: the digit run after `adr-` in the file name, compared as an integer; a name without one has no number
    - Base version, in order: the same path at the base; else the one base path carrying the number that is absent
      from the tree, when the tree path is the only tree path absent from the base with that number (a rename);
      else none, a new ADR
    - Unit tests in `packages/arc-framework/__tests__/unit/scripts/check-adr-records.test.ts`
    - Build `test-first` (one behavior at a time):
        - Status lines with emphasis markers, mixed case, or trailing punctuation read Proposed
        - `Accepted (2026-10-10), where …`, `Accepted · Amended 2026-03-05 …`, `Superseded by ADR-029.` and
          `Deprecated - …` do not read Proposed
        - In a multi-paragraph section only the first non-blank line is the status line
        - A `## Status` heading inside a fenced code block is not the section
        - A missing heading and an empty section both read as missing
        - The same path at the base is the base version
        - A rename resolves: one base path removed, one tree path added, same number
        - A same-number base path still present in the tree supplies no base version
        - Two added tree paths claiming one removed base path leave both without a base version
        - A name without a number is never a rename's base version

### `[ ]` **2.2 Apply the status rules and write their remedies — D3**

- _Goal:_ The status rules fail exactly the ADRs that would merge reading Proposed, return to Proposed, or lose their
  Status section, each with its remedy, and the check refuses rather than judging when no base resolved.

    - Examined set, a pure function of the arguments and both listings: each argument path matching
      `.arc/reference/adr/adr-*.md` that has no base version, or whose base version differs from it in path or object
      id; other arguments are ignored; Status sections are read only for examined paths and their base versions
    - Rules 1–5 as the spec's § 3.5 states them; a renumbered ADR has no base version and reads as new
    - Failure forms as § 3.6 gives them: `<today>` is the run date input as `YYYY-MM-DD`, `<base>` the abbreviated
      base, and a restore remedy quotes the base version's Status section indented; every failure is reported before
      the check fails
    - No base: the refusal text of § 3.7, verbatim
    - Build `test-first` (one behavior at a time):
        - A new ADR reading Proposed fails with the `Accepted (<today>)` remedy; reading Accepted, it passes
        - A new ADR with no Status section fails with the add-section remedy
        - An ADR whose base version reads Accepted fails when it reads Proposed, quoting the base Status section
        - An ADR that removes its Status section while its base version has one fails with the restore remedy
        - An ADR whose base version reads Accepted, or Superseded, passes when edited and still not Proposed
        - Restoring the base version's Status section passes
        - An ADR whose base version reads Proposed passes edited, renamed, or still Proposed, and fails only when it
          removes its Status section
        - A base version with no Status section constrains nothing
        - A rename's restore remedy names its base path; an unrenamed one names the same path
        - A same-number collision path is examined as a new ADR
        - A renumbered ADR reading Proposed fails as a new ADR reading Proposed
        - An unchanged ADR and a path outside the input glob are not examined
        - Several failures are all reported, and the check fails once
        - With no base, the check refuses with the § 3.7 text

### `[ ]` **2.3 Detect number collisions and name the renumber — D4**

- _Goal:_ Any number two ADR paths share at the tree fails the check, naming every path that carries it and, with a
  base, which paths to renumber and to what.

    - Collisions across every ADR path at the tree; a path is added when it is absent from the base's ADR list
    - Remedy per the spec's § 4.3: when the change adds some, renumber every added path except one if no colliding
      path is on the base, or every added path if one is; when it adds none, state the first-parent rule for a
      separate change without naming the path
    - Target number: the next free one, one greater than the highest at the tree or the base, written with three
      digits; further renumbers in the run take consecutive numbers; each remedy says to update the records that cite
      the renumbered ADR by number, a Tier 1 correction
    - No base: name every path, state the rule for the reader, and ask for the base branch to be made resolvable
    - Build `test-first` (one behavior at a time):
        - Two paths, the change adds one: the failure names the added path with its target number
        - Two paths, the change adds both: either may be renumbered, with the target number
        - Two paths, the change adds neither: the rule is stated with the target number
        - Three paths, one on the base: both added paths are renumbered
        - Several collisions take consecutive target numbers
        - No base: both paths are named, the rule is stated, and a resolvable base is requested
        - A name without a number joins no collision
        - No shared number passes

## **Phase 3:** Wire the checks into the merge gate

_Purpose:_ The reader, entry point, npm script, and both declarations, so `arc check` runs the rules at every local
merge gate and in CI over the check's own tree and base. An integration test over a real repository covers the git
reads the unit tier cannot reach.

### `[ ]` **3.1 Read the ADR sets from the check's tree and base — D5**

- _Goal:_ The script builds its rule inputs from `ARC_CHECK_TREE` and `ARC_CHECK_BASE` alone, never the worktree,
  dispatches its rule argument, and fails on any read error or unknown rule rather than passing.

    - Reader: the ADR list at each revision through `git ls-tree`, contents through `git show <revision>:<path>` as
      `checkEntryChanged` (`lib/reach-check.ts`) reads them; injectable, so unit tests substitute it
    - Entry point: the first argument is `status`, with paths after it, or `numbers`; anything else is a usage error;
      a guarded main as `audit-section-refs.ts` has, taking its environment as an input so the unit cases never read
      the runner's `process.env`, which a files-mode test run fills with this repository's `ARC_CHECK_*` values
    - Exit zero when every rule holds, non-zero on a failure, a refusal, or a usage error; a git or read failure fails
      the check with the git error
    - A missing `ARC_CHECK_TREE` is a usage error naming the check that matches the rule argument,
      `arc check run lint:adr:status` or `arc check run lint:adr:numbers`: every files-mode run receives one
      (`runGitCheck` in `handlers/check/run.ts` passes `content` to `executeSelectedCheck`), so only a direct
      `npm run lint:adr` lacks it
    - `<today>` is the local calendar date, built from the local date fields, never a slice of `toISOString()`, which
      reads a day late in the evening west of UTC
    - Import only Node built-ins, so each declaration's `runtime_inputs` hashes the script file alone
    - Build `test-first` (one behavior at a time):
        - A read failure injected through the reader fails with the git error
        - An unknown rule argument is a usage error
        - A missing tree under `status` is a usage error naming `lint:adr:status`; under `numbers`, one naming
          `lint:adr:numbers`
        - `status` and `numbers` each reach their rule with the reader's sets

### `[ ]` **3.2 Drive both rules over a temporary repository — D3, D4**

- _Goal:_ Both rules behave as specified against real git objects, with the tree and base supplied as
  `checkEnvironment` (`lib/checks/process.ts`) supplies them, including an ADR the change adds but has not committed.

    - `packages/arc-framework/__tests__/integration/check-adr-records.test.ts`: a temporary repository with a base
      commit; the tree for the uncommitted case comes from `createWorktreeSnapshot` (`lib/checks/tree.ts`); the script
      runs as a child process with `ARC_CHECK_TREE` and `ARC_CHECK_BASE` set
    - Build each child environment as `package-sync-check.test.ts` does: start from `environmentForGitCwd`, delete the
      inherited `ARC_CHECK_TREE`, `ARC_CHECK_BASE` and `ARC_CHECK_MERGED`, pass `extendEnv: false`, and set only the
      variables the case names; `test:integration:content` and `test:changed` are files-mode checks, so a run under
      either carries this repository's values, and the no-base case would otherwise inherit its base
    - Status cases: a new Proposed ADR fails and passes once Accepted; an ADR returned to Proposed fails quoting its
      base section and passes once that section is restored; a renamed base-Proposed ADR passes; an uncommitted new
      ADR is examined; no base refuses
    - Number cases: a collision the change adds fails naming the added path and target; with no base it names both
      paths and states the rule

### `[ ]` **3.3 Declare both checks and the `lint:adr` script — D3, D4, D5**

- _Goal:_ A merge-gate request selects `lint:adr:status` over the change's ADRs and `lint:adr:numbers` once over the
  whole set, each keyed on the script's content as well as the ADRs.

    - Root `package.json`: `"lint:adr": "node --import tsx packages/arc-framework/src/scripts/check-adr-records.ts"`
    - `.arc/system/arc-checks.yml`: both declarations as the spec's §§ 3.1 and 4.1 give them; `runtime_inputs` is an
      enumerated content hash of the script in `check-package-sync`'s form
    - `packages/arc-framework/__tests__/integration/one-shot-script-entrypoints.test.ts`: add `lint:adr` beside the
      `lint:arc:*` entries
    - Exercise through `arc check run lint:adr:status lint:adr:numbers`, which snapshots the worktree
      (`stagedWorktreeTree`, `lib/checks/tree.ts`) and receives the automatic base: an uncommitted scratch ADR reading
      Proposed fails `lint:adr:status` with its remedy, and a scratch copy carrying an existing number fails
      `lint:adr:numbers` naming it with its target; remove both
    - Run each `runtime_inputs` command directly and confirm it prints a hash, then run
      `arc check run lint:adr:status lint:adr:numbers` twice with nothing changed: the second run reports both
      `reused`. A failing hash command leaves the key null (`runtimeOutputs`, `lib/checks/key-resolver.ts`), which
      `executeNativeSelectedCheck` neither reuses nor records, and the check still passes
    - `arc check gate merge --ci --dry-run --json` forecasts both checks; neither is named in
      `.github/check-plumbing.yml`, so CI runs both at the `lint-typecheck`/`default` step (`runCiCheckStep`,
      `lib/ci-check-runner.ts`), which has no step condition
    - The CI criterion's evidence is the run dispatched at the pushed verified head (`gh workflow run ci.yml --ref
      <branch>`), which verification already requires: its setup job creates the local base branch before
      forecasting, so `lint:adr:status` judges rather than refuses, and its `lint-typecheck` job runs both checks at
      the `default` step; the pull-request run repeats this at integration over the merge with the base
    - `packages/arc-framework/__tests__/integration/ci-check-plumbing.test.ts` still passes; it parses every merge-gate
      declaration through `CheckDeclarationSchema`, and checks no entry the plumbing map leaves out

## **Phase 4:** State the lifecycle in the methodology and record it

_Purpose:_ The shipped strategy, template, readiness criterion, and index entry, this repository's two rule
surfaces, and ADR-040 written last from the updated template under the new reader rule.

_Exit criterion:_ At this work's verification, `arc check gate merge --force` fails `lint:adr:status` on ADR-040
while it reads Proposed, naming the file and its `Accepted (<today>)` remedy, and passes once it reads
`Accepted (<date>)`.

### `[ ]` **4.1 Restate the ADR lifecycle in the strategy — D1, D6**

- _Goal:_ The shipped strategy locks an ADR when the change that accepts it merges, keeps the decision and its
  disposition in the planning record until the file is written with the implementation, and states the
  reader-independence rule.

- _Note:_ Shipped-content register: no work-unit, specification, or repository-script references reach the strategy.

    - `[ ]` **4.1.a Reword the lifecycle passages**
        - § What Are ADRs › Key Characteristics, "Stable": final once the accepting change merges
        - § ADR Format and Structure › 2. Status: the section's first line carries the status; the four states with
          `Accepted (YYYY-MM-DD)`; the record locks when the change that sets `Accepted` merges
        - § ADR Lifecycle › Proposed: the When and Process of the spec's § 1.6, and the base-branch Proposed rule
        - § ADR Lifecycle › Accepted: the When and Process, later realization, and that a project can enforce the
          rule at its merge gate, without describing this repository's script
        - § Amending Accepted ADRs: the `[invariant]` opening reads final once the accepting change merges

    - `[ ]` **4.1.b Add renumbering to Tier 1**
        - Renumbering an ADR whose number collides with another's, together with the records that cite it by number

    - `[ ]` **4.1.c Add the "Reader independence" subsection**
        - Closing subsection of § ADR Format and Structure, unnumbered, since the five numbered subsections are an
          ADR's own sections
        - Names `spec-review`'s Reader independence item and quotes its three Reference-boundaries sentences, naming
          `spec-review` as their source
        - States the scope (Context, Decision, and Consequences meet it; Status carries tracking; a new ADR meets it
          across its body, an edit to an existing ADR over what the edit changes) and the goes-and-stays sentence

    - `[ ]` **4.1.d Render the `.arc/` copy**
        - Edit the package source only, then
          `npm run render:framework -- packages/arc-framework/arc/reference/strategies/arc/strategy-adr-methodology.md`

### `[ ]` **4.2 Start the ADR template at Proposed — D1**

- _Goal:_ A new ADR copied from the template starts at the bare line `Proposed`, which the status check reads as its
  status line, with the four states and their timing in a guidance comment after it.

    - Replace the `{Proposed | Accepted | Deprecated | Superseded by ADR-XXX}` placeholder with `Proposed`; the
      comment lists the four states with their timing, `Proposed` while the delivering change is unmerged and
      `Accepted (YYYY-MM-DD)` set in that change before it merges, and sits after the line, never before it
    - Edit the package source only, then render the `.arc/` copy with
      `npm run render:framework -- packages/arc-framework/arc/reference/templates/arc/template-adr.md`

### `[ ]` **4.3 Add the ADR-disposition criterion to draft readiness — D2**

- _Goal:_ A draft, or a determinacy confirmation with no draft, is not ready while any decision it settles lacks an
  ADR disposition, at every Class and planning depth.

    - § The bar gains the fourth criterion as the spec's § 2.1 quotes it, with § 2.2's four dispositions and its
      misuse gap; a missing disposition is a `needs-detail` gap
    - Count four criteria in the frontmatter `description`, "all three criteria below clear", and "ready — all three
      clear"
    - Configurable file: the same targeted edit in `packages/arc-framework/arc/system/methods/assess-draft-readiness.md`
      and `.arc/system/methods/assess-draft-readiness.md`, never a copy; the two are identical today, so `diff` them
      afterwards and expect no difference

### `[ ]` **4.4 Make the index entry a directive — D2**

- _Goal:_ An agent about to write, amend, or accept an ADR loads the strategy, and the index names draft readiness as
  the home of the planning-close test.

    - The `arc/strategy-adr-methodology.md` entry reads exactly as the spec's § 2.4 gives it
    - Configurable file: the same targeted edit in both copies' ARC Framework Strategies section, never a copy

### `[ ]` **4.5 Bring this repository's rules into line — D6, D1**

- _Goal:_ This repository's rules stop licensing planning references in ADR bodies and describe an ADR as immutable
  from the merge of the change that accepts it.

    - `.arc/system/rules/DEV-RULES.PROJECT.md` § Audience Boundaries: one sentence after the internal list's closing
      line ("These reference internal WU names, in-flight scope, transitional state, and project-internal concerns
      freely.") saying ADR bodies meet `strategy-adr-methodology.md`'s reader-independence rule, leaving planning
      references to their Status sections; this copy only, since the package copy carries no such section
    - `.arc/reference/strategies/project/strategy-package-project-sync.md` § Documentation Architecture: the ADR
      column's Mutability cell reads "Immutable once the accepting change merges (supersession)"; realign the table
      with `npm run format:tables -- .arc/reference/strategies/project/strategy-package-project-sync.md`

### `[ ]` **4.6 Write ADR-040 — D8**

- _Goal:_ ADR-040 records the accept-at-merge lifecycle, detection at planning close, the merge-gate checks, and the
  reader rule in a body that stands without planning history, and it reads Proposed until verification.

- _Note:_ Leave its Status at `Proposed`. Verification's merge gate fails on it, and setting `Accepted (<today>)` per
  the remedy exercises the status check end to end; flipping it earlier forfeits that evidence.

    - `.arc/reference/adr/adr-040-accept-adrs-when-their-work-merges.md`, titled "ADR-040: Accept ADRs When Their Work
      Merges", from the updated `template-adr.md`
    - Context: the four defects, the number-collision risk, and the spec's Alternatives & Rationale; Decision: the
      lifecycle, planning-close detection, both checks, and the reader rule; Consequences: the four acceptances and
      why ADR-020 stays Proposed
    - The whole body meets the reader-independence rule; planning references stay in its Status section
    - Before writing, confirm no ADR-040 has landed on the base (`git ls-tree --name-only origin/main
      .arc/reference/adr/`); a local number check sees only this branch's tree, so one landing later surfaces on the
      pull-request run, which checks the merge into the base, and is renumbered as that remedy names

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` The unit and integration `check-adr-records.test.ts` files and `one-shot-script-entrypoints.test.ts` pass,
  covering every case the spec's Testing list names.

- `[ ]` A merge-gate run fails `lint:adr:status`, naming the file and its remedy, for a new ADR reading Proposed, a new
  ADR with no Status section, an ADR returned to Proposed, and a removed Status section, and passes once the base
  Status section is restored or a new ADR reads Accepted.

- `[ ]` An edit or rename of ADR-020 that leaves it Proposed passes `lint:adr:status`, and a same-number file never
  supplies a base version.

- `[ ]` With no base, `lint:adr:status` refuses with the no-base text naming the resolvable-base and merge-base
  remedies.

- `[ ]` A tree holding two ADRs with one number fails `lint:adr:numbers` at any merge gate, naming both files and the
  renumber target when the change adds one or both, stating the rule when it adds neither, and asking for a
  resolvable base when none resolved.

- `[ ]` At verification, `arc check gate merge --force` fails `lint:adr:status` on ADR-040 while it reads Proposed and
  passes once it reads `Accepted (<date>)`.

- `[ ]` CI's run at the verified head executes both checks at the `lint-typecheck`/`default` step.

- `[ ]` `assess-draft-readiness` § The bar carries the fourth criterion with the four dispositions and the gap rule,
  and counts four criteria throughout, in both copies.

- `[ ]` `strategy-adr-methodology.md` locks an ADR only at the accepting change's merge, says nothing of "just before
  starting", and carries the binding disposition, the Reader independence subsection, and Tier 1's renumbering.

- `[ ]` `template-adr.md`'s Status section starts at the bare line `Proposed`, with its guidance comment after it.

- `[ ]` The `STRATEGY-INDEX` entry for `arc/strategy-adr-methodology.md` reads as the spec gives it, in package source
  and `.arc/`.

- `[ ]` At the verified head, ADR-020 is the only ADR whose Status reads Proposed, and ADR-024 names no
  `assess-cohort-fit`.

- `[ ]` At the verified head, ADR-040 reads Accepted and its body stands without planning history.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration

---
