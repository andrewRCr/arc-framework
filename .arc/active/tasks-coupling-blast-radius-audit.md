# Task List: coupling-blast-radius-audit

- **Design:** `spec-coupling-blast-radius-audit.md`

---

## **Phase 1:** Audit foundation and artifact contracts

_Purpose:_ Freeze the explicit corpus boundary and durable artifact contracts that every later audit phase shares.

### `[x]` **1.1 Verify the authoritative corpus and bounded delta pass**

- _Goal:_ Every later count operates on one explicit, reviewable corpus with no duplicate package/project reads and
  no unexamined self-hosting surface outside package source.

    - `[x]` **1.1.a Pin the authoritative tracked package tree**
        - Fixed the primary corpus at 1,148 tracked, valid-UTF-8 package files and recorded its complete family and
          extension distribution without filtering hidden or extensionless content.

    - `[x]` **1.1.b Resolve the self-hosting delta to an exact include list**
        - Mapped all 156 package ARC paths through the live output rule, retained the 15 byte-different installed
          copies, and fixed a 28-file tracked repo-root tooling/harness delta with explicit exclusions.
        - Reconciled recipe, classifier, and installed-manifest drift as diagnostics rather than corpus filters; the
          durable counts, exact include sets, and rationale live in `notes-coupling-blast-radius-audit.md`.

- _Outcome:_ The audit now has one closed 1,191-file UTF-8 corpus: 1,148 authoritative package files plus 15
  byte-different installed copies and 28 repo-root self-hosting files, with no duplicate package/project reads.

### `[x]` **1.2 Settle the checked-in artifact homes and machine-readable contracts**

- _Goal:_ The scanner, manifest, raw result, routing ledger, and ranked report each have one stable role and
  serialization contract that remains usable after the work unit archives.
- _Context:_ Existing dev audits use `packages/arc-framework/src/scripts/repo-root.ts`, export pure functions for
  unit tests, and expose root-package `tsx` scripts; the audit artifacts must not hardcode current `active/`
  placement.

    - `[x]` **1.2.a Choose durable locations and invocation boundaries**
        - Located pure logic under `src/lib/coupling-audit/`, the executable beside existing repository-audit
          scripts, and canonical JSON artifacts under package-local `audits/coupling-blast-radius/`.
        - Made the movable Markdown report an explicit output-path input so archival relocation cannot leave a stale
          default; recorded the dependency-free rerun contract in `notes-coupling-blast-radius-audit.md`.

    - `[x]` **1.2.b Define and validate the manifest and scan-result contracts**
        - Added strict versioned TypeScript contracts and `unknown`-input validators for manifests, scan results,
          routing ledgers, evidence spans, dispositions, volatility/quadrants, and all closed enums without a schema
          dependency or `any` boundary.
        - Added canonical candidate/member-set digest helpers and a result-bound ledger whose class order and terminal
          capture state validate at the boundary.
        - Added an ordered code-owned classifier that exhaustively maps the full 1,191-file baseline into the six
          surface kinds and fails unknown families.
        - Covered valid round trips and malformed versions, IDs, citations, regexes, idiom coverage, digests,
          quadrants, packet ordering, and result bindings with focused unit tests.

    - `[x]` **1.2.c Specify deterministic output and failure behavior**
        - Added canonical path and artifact-order normalization, recursive key-stable JSON with no timestamps, and
          explicit file/stdout emission seams suitable for byte-identical unchanged-tree comparisons.
        - Defined stable exit classes for malformed input, stale dispositions, and scan/I/O failure while preserving
          successful residue-bearing results; recorded the report/result/ledger consumption contract in the notes.

- _Outcome:_ Phase 1 leaves a closed corpus and tested machine boundary: every baseline file classifies, every
  artifact validates before use, and later scan/report phases can compare canonical bytes and digests directly.

## **Phase 2:** Pattern manifest

_Purpose:_ Derive the volatile-name and coupling-idiom inventory before scanning so coverage is inspectable and
source-grounded.

### `[ ]` **2.1 Derive the name layer from target-shape records and the live roster**

- _Goal:_ Every concrete name or layout the recorded target direction can move appears in one normalized assumption
  class with evidence naming the source and responsible mover.
- **Additional Context:** `strategy-storage-evolution.md` §§ The Storage Model and Forward-Compat Principles;
  `strategy-knowledge-evolution.md` §§ The Target Model and Forward-Compat Principles;
  `strategy-procedure-evolution.md` §§ The Target Model and Forward-Compat Principles;
  `draft-arc-backend.md` §§ The Storage Model, Placement Is a Record, and Compatibility Ledger;
  `draft-knowledge-architecture.md` §§ Architecture and Naming; `draft-composable-workflows.md` §§ D1-D3;
  `ROADMAP.md` as a concrete-name source. Resolve the live roster with `npx arc status --project`.

    - `[ ]` **2.1.a Extract storage and lifecycle names**
        - Derive current directory placements, artifact prefixes, tracked-path assumptions, branch shapes, roadmap
          names, state encodings, and git-backed layout names that the storage and lifecycle targets would move.
        - Cite the precise strategy/draft section and mover work unit on every resulting class; keep citations in
          the manifest data rather than hardcoding planning-document paths into TypeScript or tests.

    - `[ ]` **2.1.b Extract knowledge and procedure names**
        - Derive document-family names, index/reference names, workflow/method/extension layout assumptions, load-set
          and fragment vocabulary, and other concrete identifiers the knowledge/procedure target shapes displace.
        - Separate current shipped names from proposed target names so the audit searches actual coupling sites and
          uses the target only as volatility evidence.

    - `[ ]` **2.1.c Mechanically seed pending renames and resolve their live movers**
        - Run broad, recorded text queries over tracked planned/provisional artifacts and project strategies for
          rename arrows, rename/relocation language, `becomes`, and supersession signals; inspect only the candidate
          hits rather than reading the planning corpus judgment-first.
        - Resolve roster state with `npx arc status --project` and verify each candidate mover by slug with
          `npx arc status <slug>`; use the shipped/current spelling as the searched assumption, including but not
          limited to `ROADMAP` and `team.mode`.
        - Record the discovery vectors so the name-layer derivation is reproducible, then deduplicate discoveries
          already owned by a target-shape source while preserving every relevant mover citation.

    - `[ ]` **2.1.d Normalize aliases into name-keyed assumption classes**
        - Group spelling variants and path forms that represent one volatile assumption, while keeping independent
          names separate when their fan-out or mover differs.
        - Give each class stable IDs, literal/regex patterns, provenance, and an initially unresolved volatility
          field for Phase 5 rather than rating individual hits.

### `[ ]` **2.2 Encode the idiom layer and standalone coupling classes**

- _Goal:_ Every known mechanism by which code or prose can depend on a concrete name is represented independently
  of whether the name layer anticipated the token.

    - `[ ]` **2.2.a Encode code coupling mechanisms**
        - Cover path literals and joins, directory enumeration/existence checks, git invocations over tracked paths,
          filename-prefix parsing, branch-pattern matching, and configuration-key literals.
        - Record the matched idiom as a per-hit tag; avoid treating a call-site form as evidence that every argument
          is coupling until the manifest or residue disposition classifies it.

    - `[ ]` **2.2.b Encode shipped-prose coupling mechanisms**
        - Cover path-like tokens, backticked filenames/config keys, branch/name examples, and workflow/template prose
          whose concrete spelling must change when the underlying contract moves.
        - Preserve file-path-derived surface classification so prose membership stays mechanical even though later
          ranking weights it below code reads.

    - `[ ]` **2.2.c Define idiom-keyed classes for couplings with no owning name**
        - Represent mechanisms such as git operations on tracked planning paths when no single volatile token owns
          the dependency; keep their provenance, volatility, and quadrant fields identical to name-keyed classes.

### `[ ]` **2.3 Define catch-all capture vectors and manifest validation**

- _Goal:_ An unknown volatile name expressed through any known idiom still reaches residue instead of disappearing
  outside the authored name list.

    - `[ ]` **2.3.a Author one or more broad vectors per code idiom**
        - Capture relevant `readdir`/existence/path-join arguments, git command arguments, prefix-fragment families,
          branch-pattern construction, and config-key access without narrowing to known names.
        - Keep capture deliberately broad; precision comes from class matching and residue disposition, not from
          hiding ambiguous candidates at collection time.

    - `[ ]` **2.3.b Author broad vectors for shipped prose**
        - Capture path-shaped and backticked tokens across workflows, strategies, methods, rules, and templates so
          prose-only unknown names enter the same residue process.

    - `[ ]` **2.3.c Validate the populated manifest against the Phase 1 contract**
        - Run the generic manifest validator and confirm every closed idiom mechanism has at least one catch-all
          vector, every name class has a pattern/citation, standalone idiom classes explain their ownership, and
          overlapping aliases remain deterministic.
        - Record one unknown-name fixture case per idiom mechanism for Task 3.2.c, so declared vector coverage is
          later proved behaviorally rather than accepted from manifest presence alone.

## **Phase 3:** Deterministic enumeration engine

_Purpose:_ Build a re-runnable Node scanner that converts the manifest and bounded corpus into stable counts,
file lists, surface/locus tags, and residue.

### `[ ]` **3.1 Implement deterministic corpus traversal and surface-kind classification**

- _Goal:_ The same manifest and repository tree always produce the same ordered input set and mechanical surface
  kinds plus corpus-locus tags.
- _Context:_ Follow the pure-core/CLI-shell shape used by `audit-section-refs.ts` and
  `audit-domain-rules.ts`; reuse `resolveRepoRoot()` rather than deriving the repository root again.

    - `[ ]` **3.1.a Collect authoritative roots and explicit delta files**
        - Build `test-first` (one behavior at a time):
            - an injected Git executor parses NUL-delimited `git ls-files --cached -z -- <roots/delta>` output and
              includes every tracked manifest-declared root and exact delta file, including hidden paths and every
              extension;
            - duplicate, missing, generated, and outside-root entries resolve according to the contract;
            - output paths are repository-relative, POSIX-normalized, deduplicated, and sorted;
            - filesystem failures carry the path and fail the run rather than silently shrinking coverage.
        - Decode file bytes with a fatal UTF-8 `TextDecoder`; any tracked binary or non-UTF-8 file must have an
          explicit manifest exclusion and reason rather than being silently skipped.

    - `[ ]` **3.1.b Classify surfaces from normalized paths**
        - Build `test-first` coverage for the spec's ordered `test`, `workflow`, `template`, `code`, `prose`, and
          `config` rules, including shipped workflow/template Markdown, source and config files, `.mjs` harness
          hooks, `.sh` scripts, extensionless githooks, and JSON/TOML/YAML declarative files.
        - Prove precedence for paths that could match more than one category and fail any authoritative path whose
          file family has no declared rule rather than defaulting it to `config`.
        - Derive the orthogonal corpus-locus tag from the authoritative root/delta entry, and keep both
          classifications independent of file content so scan-time judgment never changes them.

### `[ ]` **3.2 Implement manifest matching, fan-out aggregation, and residue emission**

- _Goal:_ Every captured candidate deterministically contributes to one or more declared classes or appears in
  residue with enough evidence to classify later.

    - `[ ]` **3.2.a Match literal and regex patterns with stable evidence**
        - Build `test-first` behavior for multi-line files, repeated matches, Unicode/prose input, line/column
          evidence, overlapping patterns, and invalid runtime regex state.
        - Store regex source and allowed flags separately, let the engine own global iteration, and reject patterns
          that can match the empty string at both validation and execution boundaries.
        - Count fan-out by distinct normalized file, matching the design's file-count examples; retain hit counts
          and locations as supporting evidence without allowing repetition in one file to inflate fan-out.

    - `[ ]` **3.2.b Attribute name and idiom tags without losing overlap**
        - Permit one hit to evidence multiple legitimate assumption classes or idioms while deduplicating identical
          class/file/location tuples.
        - Produce per-class file lists, total hit counts, and surface-kind breakdowns from one normalized hit set.

    - `[ ]` **3.2.c Compute catch-all residue and apply recorded dispositions**
        - Build `test-first` behavior proving every catch-all candidate is partitioned as classified, dismissed, or
          unresolved, retaining vector, path, token/span, location, excerpt, surface kind, corpus locus, and its
          canonical candidate digest.
        - Classify a candidate only when a class match covers its exact token/span; attach every covering class and
          prove that an unrelated match elsewhere in the same line or file never suppresses residue.
        - Apply an exact disposition only to its candidate digest. Recompute each bulk predicate's member set and
          digest, and fail when a recorded member disappears or changes or when a new member expands the group.
        - Run the Phase 2 fixture matrix and prove an unseen token expressed through every idiom mechanism is
          captured by its declared catch-all vector and reaches residue.
        - Preserve dismissed candidates and disposition IDs in the canonical result; the engine applies validated
          records mechanically and never judgment-filters broad-vector false positives on its own.

    - `[ ]` **3.2.d Canonicalize the complete scan result**
        - Reuse `canonicalize()` from `src/lib/canonical/canonical-json.ts` and `toForwardSlash()` from `src/lib/fs.ts`
          rather than adding competing canonical JSON or path-normalization helpers.
        - Normalize set-valued arrays before canonicalization so unchanged input is byte-reproducible across runs
          and path separators.
        - Keep volatile execution metadata outside the canonical payload or in an explicitly excluded envelope.

### `[ ]` **3.3 Add a repository command and reproducibility coverage**

- _Goal:_ A maintainer can run the complete audit from the repository root with explicit inputs and receive a
  deterministic artifact or an actionable nonzero failure.

    - `[ ]` **3.3.a Wire the thin script entry point and root package command**
        - Accept the manifest and output destination through a stable non-interactive interface, resolve repository
          paths through existing helpers, and keep collection/matching logic importable for unit tests.
        - Emit concise diagnostics to stderr and machine output to stdout or an atomically written requested file;
          do not add prompts or a general-purpose product CLI surface for this project-internal audit.

    - `[ ]` **3.3.b Cover end-to-end determinism in a temporary Git repository**
        - Keep matcher, classifier, serializer, and injected-boundary behavior in pure unit tests. Add an
          `__tests__/integration/` fixture that initializes a bounded Git repository, commits code, prose, and hidden
          files, loads a real manifest, writes the result twice, and asserts byte equality and expected residue.
        - Keep CLI wiring test-after and narrow: prove argument/failure routing plus tracked-file discovery without
          retesting Node, `tsx`, or pure behavior already covered by the core.

## **Phase 4:** Corpus enumeration and residue closure

_Purpose:_ Run the tool over the authoritative surface, calibrate bounded judgment from actual distributions, and
eliminate every unclassified catch-all hit.

### `[ ]` **4.1 Execute the authoritative scan and calibrate the manifest**

- _Goal:_ The first complete result reflects the real package corpus and exact self-hosting delta without expanding
  agent reading into an uncapped corpus sweep.

    - `[ ]` **4.1.a Run the checked-in manifest over the full declared corpus**
        - Capture the repository commit, manifest version and canonical digest, command, corpus counts, and canonical
          output hash outside the reproducible payload for report provenance.
        - Verify the delta remains small and exact; route any unexpectedly broad root back to Task 1.1 rather than
          normalizing scope growth mid-scan.

    - `[ ]` **4.1.b Calibrate patterns through capped code-hit samples**
        - Before opening any classified hit, derive and record a numeric per-class cap from the code-hit distribution
          and a deterministic selection rule that covers distinct idiom tags before filling remaining slots in
          canonical path order; update the spec's open item with the settled bound.
        - Inspect only those selected code samples to distinguish real reads/parsing from incidental mentions; let
          mechanical path tags handle every other already-classified surface.
        - Tighten or split patterns only when evidence shows a class conflates assumptions; rerun after every
          manifest change and record the rationale without remediating any coupling.

### `[ ]` **4.2 Set the residue cap and record the bulk-disposition rule**

- _Goal:_ Residue judgment remains bounded by a number and grouping rule chosen from observed volume rather than an
  arbitrary pre-scan estimate.

    - Derive one global item-level cap from the residue count and distribution; make it no smaller than the number of
      nonempty capture-vector × surface-kind strata, allocate one item to each stratum, then assign the remainder in
      deterministic round-robin order.
    - Record the numeric cap, grouping predicates, allowed bulk reasons, and escalation condition in
      `notes-coupling-blast-radius-audit.md`; update the spec's open item so the rule is part of the settled design.
    - Require a group to be mechanically reproducible from residue fields before one reason may dismiss it in bulk.

### `[ ]` **4.3 Triage the catch-all residue to zero**

- _Goal:_ Every candidate coupling has a durable class or a reviewable dismissal, making comprehensiveness an
  evidenced result rather than a claim.

    - `[ ]` **4.3.a Classify item-level residue up to the cap**
        - For each item, mint/extend the owning class or record a reasoned dismissal tied to its path, vector, and
          canonical candidate digest; ambiguous real couplings become classes rather than disappearing into
          "false positive."
        - Keep the scanner's own tracked test fixtures inside the declared test corpus and disposition their
          deliberately synthetic candidates through the same evidence contract rather than an implicit self-skip.

    - `[ ]` **4.3.b Apply and record bulk dispositions past the cap**
        - Group only with the closed predicates Task 4.2 settled, store the exact member-set digest with the reason,
          and split any exception back to item-level review.

    - `[ ]` **4.3.c Rerun until no unclassified residue remains**
        - Preserve dispositions as manifest inputs and dismissed candidates as canonical-result evidence so reruns
          reproduce zero without suppressing newly unmatched candidates; fail any exact or bulk record whose member
          evidence disappears, changes, or expands.

### `[ ]` **4.4 Prove unchanged-tree reproducibility on the complete corpus**

- _Goal:_ The authoritative command reproduces the exact same canonical output when neither tree nor manifest
  changes.

    - Capture `HEAD`, clean-status evidence, and the canonical manifest digest, then run the complete command twice
      to separate output locations outside the repository without changing inputs between runs.
    - Compare bytes and canonical result hashes, confirm repository status is unchanged, then retain the evidence in
      `notes-coupling-blast-radius-audit.md` and the report provenance.
    - Confirm all file lists and counts derive from the canonical result rather than a separately maintained table.

## **Phase 5:** Volatility ranking and deterministic report inputs

_Purpose:_ Convert the complete mechanical inventory into dated, source-cited ranking data and dependency-critical
views that the routed final report projects without hand-maintained interpretation.

### `[ ]` **5.1 Rate every assumption class against its recorded mover**

- _Goal:_ Volatility is a dated class-level judgment grounded in recorded direction, never inferred from hit count or
  repeated independently per file.

    - `[ ]` **5.1.a Resolve mover evidence for every name-keyed class**
        - Verify each citation still describes a pending rename/relocation and resolve the mover's live roster state
          by slug; record the snapshot date and classify missing/retired movers explicitly rather than guessing.

    - `[ ]` **5.1.b Resolve volatility for standalone idiom classes**
        - Cite the substrate or procedure direction that would change the coupling mechanism itself, and distinguish
          stable current idioms from mechanisms already scheduled for abstraction.

    - `[ ]` **5.1.c Complete the manifest's volatility evidence**
        - Resolve every class from `unresolved` to `high | stable`: require a live mover or accepted target-direction
          citation for `high`, and a recorded rationale for `stable` after missing/completed movers are rechecked.
        - Keep `unresolved` as an authoring state and a hard report-generation error, never a third final rating.

### `[ ]` **5.2 Calibrate fan-out thresholds and assign quadrant verdicts**

- _Goal:_ Every class receives a comparable 2×2 verdict whose threshold and meaning are explicit enough for later
  consumers to reproduce.

    - `[ ]` **5.2.a Derive high-fan-out thresholds from the observed distribution**
        - Calibrate and record one numeric high threshold for each of `test`, `code`, `workflow`, `template`, `prose`,
          and `config`; document each cutoff from the observed distribution and set prose conservatively enough to
          preserve its lower weight relative to code reads.
        - Mark a class high fan-out when any surface count is greater than or equal to that surface's threshold.
          For mixed surfaces, use the maximum `count / threshold` ratio as the primary deterministic rank key.
        - Update the spec's "Ranking thresholds" open item with the settled rule rather than burying it only in the
          report.

    - `[ ]` **5.2.b Settle the four quadrant verdicts and rank order**
        - Map high-fan-out/high-volatility to `abstract`, low-fan-out/high-volatility to `change-with-mover`,
          high-fan-out/stable to `leave-alone`, and low-fan-out/stable to `retain-local` without turning verdicts into
          a remediation plan.
        - Rank verdicts `abstract` → `change-with-mover` → `leave-alone` → `retain-local`, then break ties by maximum
          surface threshold ratio, total distinct-file fan-out, and stable class ID.

    - `[ ]` **5.2.c Derive bands, verdicts, and stable rank keys**
        - Extend the existing audit module with small pure calculations over canonical counts and manifest values;
          do not create a reusable policy engine or general ranking subsystem.
        - Build `test-first` (one behavior at a time):
            - all four quadrants map to their fixed verdicts;
            - threshold equality is high and mixed surfaces use the maximum ratio;
            - total fan-out and class ID settle ties deterministically;
            - missing thresholds or unresolved volatility fail before report projection.

### `[ ]` **5.3 Prepare the ranked inventory and hard-consumer views**

- _Goal:_ Canonical audit data contains the complete ranking and both dependency-critical extracts before routing
  packets bind owner-facing implications to the settled result.

    - `[ ]` **5.3.a Materialize the complete ranked inventory data**
        - Produce exactly one canonical row record per class with corpus/manifest/result provenance, threshold
          method, residue disposition summary, distinct-file fan-out, hit count, surface-kind breakdown, volatility
          citation/rationale, quadrant, ranked verdict, and stable report anchor.
        - Keep canonical per-class file lists as the sole authority and reference them from inventory records rather
          than hand-copying them into a separately maintained table.

    - `[ ]` **5.3.b Materialize the substrate-abstraction extract**
        - Project every `abstract` class carrying concrete-path idiom evidence into an explicit list of assumptions
          the storage/path resolver must own, keyed back to ranked class records and evidence rather than a prose-only
          recommendation.
        - Review the projected membership against its evidence; resolve an incorrect member by correcting manifest
          class/idiom/verdict data and regenerating, never by hand-editing the extract or growing a generic
          consumer-tag/routing-policy schema.

    - `[ ]` **5.3.c Materialize the placement-reader extract**
        - Record the reviewed lifecycle-placement class IDs, then query the canonical result for every `code` hit in
          those classes carrying directory-enumeration, existence, or placement/prefix-reading idioms.
        - Produce the complete mechanically selected reader/parser list for `wu-lifecycle-state-model`, keyed to
          normalized files and class IDs; capped calibration samples must never define extract membership.

## **Phase 6:** Finding routing

_Purpose:_ Stage owner-ready packets through sanctioned captures, reconcile their canonical ledger, and publish the
certified report without expanding this WU into the later inbox drain or editing another WU's tracked artifacts.

### `[ ]` **6.1 Resolve affected owners and provenance-stamped finding packets**

- _Goal:_ Every design-changing finding has one real destination and enough provenance for that owner to evaluate it
  without repeating the audit.

    - `[ ]` **6.1.a Map findings to live work units by slug**
        - Resolve each destination with `npx arc status <slug>` and the live roster; do not infer existence or state
          from branch names, filenames, or the pre-audit soft-consumer list.
        - Keep the two hard-edge extracts mandatory and let all other affected owners emerge from the ranking.

    - `[ ]` **6.1.b Build one packet per owner/concern**
        - Derive a deterministic packet identity from the result hash, target slug, and sorted class IDs; include
          concrete evidence, why the owner's design changes, stable report anchor, and a recommendation framed for
          grooming rather than implementation instructions.
        - Coalesce related classes only when the destination and design implication are identical; retain the full
          class list so fan-out evidence is not lost.

### `[ ]` **6.2 Stage branch-safe routing through `USER-INBOX` captures**

- _Goal:_ Routing intent survives the session without landing foreign planning churn in the audit branch's tracked
  history.

    - `[ ]` **6.2.a Capture every packet through the standard inbox path**
        - Read the resolver-backed identity-global inbox first, then use the `arc-inbox` workflow to create only
          absent gitignored entries with deterministic packet identity and `WU_Target` routing metadata.
        - Treat an exact existing packet as an idempotent resume and surface any same-identity/different-content
          collision; do not edit planned/provisional draft bodies or inbound buffers from this worktree.

    - `[ ]` **6.2.b Reconcile captures against the canonical routing ledger**
        - Verify every routed inventory finding has exactly one capture/destination and every capture points back to
          a live class/evidence set; validate and record `captured-awaiting-housekeep` in the canonical tracked
          ledger.
        - Confirm both hard-consumer extracts are complete in canonical result data, do not invoke the broader
          housekeep drain, and verify the audit-branch diff contains no foreign WU artifact edits.

### `[ ]` **6.3 Publish and certify the settled report**

- _Goal:_ The checked-in report is one reproducible projection of the settled scan result and reconciled routing
  ledger, with no later WU task mutating its certified bytes.

    - `[ ]` **6.3.a Render the complete ranked report**
        - Add a thin deterministic Markdown projection to the existing project-internal audit tool, with one focused
          fixture proving stable output, exactly one inventory row per canonical class, and exactly one ledger entry
          per routed packet; do not add a general renderer abstraction or product command surface.
        - Project the canonical settled scan result plus canonical routing ledger. Include corpus/manifest/result
          provenance, threshold method, residue disposition summary, class rankings and evidence, both hard-consumer
          extracts, and `captured-awaiting-housekeep` routing entries.
        - Point to canonical per-class file lists without copying them into another authority; describe the operation
          and evidence directly, with no planning-process commentary in any shipped target.

    - `[ ]` **6.3.b Certify final inputs and projected bytes**
        - Run the authoritative command twice to separate locations outside the repository using the settled
          manifest and exact recorded hard-view inputs; require zero unresolved classes and zero unresolved
          candidate residue in both results.
        - Require both result digests to equal the digest bound by every routing packet. If not, return to Tasks 6.1
          and 6.2 to regenerate and reconcile packets before certification.
        - Compare canonical result bytes/digests and report bytes projected with the fixed routing ledger, confirm
          repository inputs remain unchanged, and refresh report/notes provenance with the final evidence. Phase 4's
          comparison remains calibration-manifest evidence only.

## **Phase 7:** Verification

_Purpose:_ Verify the completed work unit against its design, audit evidence, and project quality gates.

### `[ ]` **7.1 Complete verification** — load and follow `verify-work-unit.md`

## Success Criteria

- `[ ]` The checked-in manifest contains both derivation layers, source citations for every name class, and at
  least one catch-all capture vector for every idiom mechanism.

- `[ ]` The repository command emits per-class fan-out counts and file lists, and repeated runs on an unchanged
  tree are byte-stable.

- `[ ]` Catch-all candidate residue has no unresolved items, with every dismissal recorded individually up to the
  cap or covered by an explicit bulk-disposition rule above it.

- `[ ]` The tracked report deterministically projects the canonical scan result and reconciled routing ledger, giving
  every class a fan-out count, surface-kind breakdown, source-cited volatility rating, and 2×2 quadrant verdict.

- `[ ]` The tracked routing ledger accounts for every affected work unit with a deterministic packet captured and
  awaiting housekeep, and the report explicitly exposes the substrate-abstraction list and placement-reader
  enumeration.

- `[ ]` All quality gates pass (tests, linting, type checking, and build).

- `[ ]` Ready for integration.
