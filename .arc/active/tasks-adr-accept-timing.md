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

### `[x]` **2.1 Parse Status sections and resolve base versions — D3**

- _Goal:_ Every ADR path yields its number and Status section as the spec defines them, and every tree path resolves
  to its base version, a rename's base, or none.

- _Outcome:_ Added pure Status-section parsing, numeric identity, and unambiguous base-version lookup. The lookup distinguishes
  a rename from same-number collisions and competing additions.

### `[x]` **2.2 Apply the status rules and write their remedies — D3**

- _Goal:_ The status rules fail exactly the ADRs that would merge reading Proposed, return to Proposed, or lose their
  Status section, each with its remedy, and the check refuses rather than judging when no base resolved.

- _Outcome:_ Added changed-input selection, all status rules, exact base-section restore remedies, and the no-base refusal.
  Base-Proposed edits and renames remain editable; new collisions and renumbers cannot borrow another record.

### `[x]` **2.3 Detect number collisions and name the renumber — D4**

- _Goal:_ Any number two ADR paths share at the tree fails the check, naming every path that carries it and, with a
  base, which paths to renumber and to what.

- _Outcome:_ Added whole-tree number collisions with consecutive renumber targets above both revisions, precise added-path
  remedies, the first-parent rule for inherited collisions, and no-base guidance.

## **Phase 3:** Wire the checks into the merge gate

_Purpose:_ The reader, entry point, npm script, and both declarations, so `arc check` runs the rules at every local
merge gate and in CI over the check's own tree and base. An integration test over a real repository covers the git
reads the unit tier cannot reach.

### `[x]` **3.1 Read the ADR sets from the check's tree and base — D5**

- _Goal:_ The script builds its rule inputs from `ARC_CHECK_TREE` and `ARC_CHECK_BASE` alone, never the worktree,
  dispatches its rule argument, and fails on any read error or unknown rule rather than passing.

- _Outcome:_ Added the Node-only Git reader and guarded entrypoint over explicit tree/base inputs. Status reads cover only
  examined records and their originals; number checks use names alone, and read errors remain failures.

### `[x]` **3.2 Drive both rules over a temporary repository — D3, D4**

- _Goal:_ Both rules behave as specified against real git objects, with the tree and base supplied as
  `checkEnvironment` (`lib/checks/process.ts`) supplies them, including an ADR the change adds but has not committed.

- _Outcome:_ Added real-repository scenarios for both rules and their repairs, including uncommitted snapshots, renamed
  base-Proposed records, no-base outcomes, and conflicting worktree bytes.

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
