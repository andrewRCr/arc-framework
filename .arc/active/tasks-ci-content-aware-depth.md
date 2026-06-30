# Task List: ci-content-aware-depth

- **Design:** `spec-ci-content-aware-depth.md`

---

## **Phase 1:** Canonical code-surface script + offline-testable primitives

_Purpose:_ Stand up `scripts/classify-change.sh` as the single source of truth for "what counts as code,"
with its two pure, network-free primitives — path classification and the code-tree hash — built test-first.
Establishes the shell-script unit-test harness (a first for this repo, composing existing subprocess +
temp-git-repo helpers) and the `lint:sh` wiring so everything downstream is `shellcheck`-clean and covered by
real tests.

_Design decisions:_ The path set counts test-affecting markdown/JSON fixtures as code (the `light iff all *.md`
proxy in `bab51166` was unsafe). Tree/blob SHAs serialize a rebase/squash-stable code-tree identity.
`classify-change.sh` is structured as subcommand dispatch — `classify <files…>`, `tree-hash <ref>`, and (Phase 2)
`decide` — so each capability is invocable in isolation by unit tests and the Checks-API call stays behind an
injectable seam in `decide`. Full path membership and the fixture-dependency rationale live in
`spec-ci-content-aware-depth.md` § A and `notes-ci-content-aware-depth.md`.

### `[x]` **1.1 Establish the shell-script test harness and extend `lint:sh` coverage**

- _Goal:_ A new `scripts/classify-change.sh` can be exercised by vitest unit tests against fixtures and is
  caught by `lint:sh`, so the test-first work in 1.2–1.3 has somewhere to land and stays `shellcheck`-clean.

    - `[x]` **1.1.a Wire the shell-script unit-test harness**
        - Added `scripts/classify-change.sh` as a subcommand-dispatch skeleton (`classify` / `tree-hash` stubs
          returning 1, usage on no/unknown command via `EX_USAGE=64`) for 1.2–1.3 to fill in test-first.
        - Added `__tests__/helpers/run-script.ts` — a `bash`-subprocess spawn helper mirroring `run-cli.ts`'s
          shape. New helper rather than reusing `cli-spawn.ts` / `run-cli.ts`, which spawn the built `dist/cli.js`
          specifically; `run-script.ts` exposes `CLASSIFY_SCRIPT` + `SCRIPTS_DIR` and threads `cwd` for tree-hash
          cases against a temp git repo (`createTempRepo` from `integration.ts`).
        - `__tests__/unit/classify-change.test.ts` asserts the durable dispatch contract + temp-repo scaffolding;
          runs under `npm run test:unit`.

    - `[x]` **1.1.b Extend `lint:sh` to cover repo-root `scripts/`**
        - Added `../../scripts/*.sh` to the `run-shellcheck.sh` args in `lint:sh`, catching `classify-change.sh`
          and the existing `check-*.sh`.
        - Resolved the resulting SC1091 on `check-package-sync.sh` / `check-ts-quality.sh` with a
          `# shellcheck source=../.arc/system/.internal/scripts/arc-lib.sh` directive each (SCRIPTDIR-relative);
          `npm run lint:sh` is clean.

- _Outcome:_ Repo-root `scripts/` is now under `lint:sh` — coverage extends past the new file to the pre-existing
  `check-*.sh`, so the whole directory stays `shellcheck`-clean going forward.

### `[x]` **1.2 Canonical code-surface path set and `weight=light` docs-only classification**

- _Goal:_ Given a changed-file list, the `classify` subcommand decides code-touching vs docs-only from one
  canonical path set (§ A) — fixture content (`packages/arc-framework/{arc,templates}/**`, `init-recipe.json`)
  classifies as code, genuine docs (`.arc/**`, root `*.md`, `docs/**`, `mkdocs.yml`) as docs, and any
  ambiguous/empty input as code.

- _Outcome:_ The path set lives in `classify-change.sh` as `CODE_SURFACE_GLOBS` + `GENUINE_DOCS_GLOBS` consulted
  by `is_code_surface_path` — the single definition the code-tree hash (1.3) will reuse. `classify` short-circuits
  to `heavy` on the first code-surface or unclassified path and prints `light` only when every file is genuine
  docs; empty input is `heavy`. Fixture trees and `init-recipe.json` classify `heavy` (Success Criteria 4).
  Matching uses bash glob comparison rather than inline `grep`, sidestepping the `grep -qv` gotcha; 14 behavior
  tests cover the set. Root `*.md` is special-cased (a leading-`*` glob would also claim nested markdown the code
  surface owns).

### `[x]` **1.3 Code-tree hash over the canonical set**

- _Goal:_ The `tree-hash` subcommand computes a deterministic, rebase/squash-stable identity for the code tree
  at a given commit — so "is this exact code already verified?" can be asked without trusting commit SHAs.

- _Outcome:_ `tree-hash <ref>` enumerates tracked paths (`git ls-tree -r`), keeps those `is_code_surface_path`
  calls code, and hashes the sorted `path:blob-sha` lines via `git hash-object --stdin`. Reusing the predicate
  (rather than the originally-specced declared tree-SHA/blob-SHA set with sentinels) is the no-drift guarantee:
  a fail-safe-classified path is still hashed, closing a verified-skip gap where a code path outside the named
  dirs/files could match a prior run — `spec-*.md` § B amended to this serialization. Any failure (bad/missing
  ref, plumbing error) exits non-zero with no stdout, so a caller reads fail-safe heavy, never a stale hash;
  6 behavior tests cover it.

## **Phase 2:** `weight` run-decision and `classify` wiring

_Purpose:_ Assemble the full run-vs-skip decision (§ B) in the script and wire it into the `classify` job,
replacing `97b5d299`'s per-push file-diff heuristic with the precise Checks-API lookback. Delivers the safety
invariant: heavy jobs skip only when this exact code tree already passed.

_Design decisions:_ Output key is `weight` (renamed from on-branch `depth`, which collided with `fetch-depth`);
the gate stays the fail-open `!= 'light'` polarity (an empty/unset output runs heavy). Lookback uses
enumerate-and-recompute (pure `classify`-side read), not embed-hash-in-check-run. See
`spec-ci-content-aware-depth.md` § B, § D.

### `[x]` **2.1 Assemble the `weight` decision in the script**

- _Goal:_ The script resolves `weight` ∈ `{light, heavy}` with a logged reason ∈ `{docs-only, verified,
  unverified}` — docs-only changes and already-verified code trees skip; everything uncertain runs heavy.

    - `[x]` **2.1.a Docs-only and fail-safe arms (pure)**
        - Added the `decide <event> <base> <head>` subcommand to `classify-change.sh`: it resolves `weight` ∈
          `{light, heavy}` and `reason` ∈ `{docs-only, verified, unverified}` over the `base...head` change set,
          emitting `weight=` / `reason=` lines (`$GITHUB_OUTPUT`-shaped) plus a human decision line on stderr.
          Docs-only change (no code-surface path, reusing `is_code_surface_path`) → `light` / `docs-only` with no
          API call; an empty, unresolvable (bad/force-pushed ref), or code-touching change → `heavy` /
          `unverified` (fail-safe). The code-touching arm is the deferred `else` seam — push runs heavy by design,
          PR awaits the 2.1.b lookback (until which it fail-safes heavy). The docs-only no-API-call regression
          guard lands with that seam in 2.1.b.

    - `[x]` **2.1.b Verified-tree lookback (enumerate-and-recompute)**
        - Implemented the PR lookback in `decide`: enumerate `base..head` (`git rev-list`), keep commits whose
          code-tree hash equals HEAD's (via `_code_tree_hash`, extracted from `tree-hash` for reuse), and skip
          heavy only when one carries the full heavy check set at `success`. The Checks-API fetch is the lone live
          seam (`_fetch_check_runs`: `gh api … --jq` live, `CLASSIFY_CHECK_RUNS_DIR` tsv fixtures under test), so
          enumeration, hash-matching, and the matcher (`_all_heavy_checks_passed`) are offline-tested; the network
          call runs only in Phase 4.
        - Heavy-check display names live in one `HEAVY_CHECK_NAMES` constant — the source of truth Task 3.2
          mirrors into the `ci.yml` job `name:` fields. Settling them expanded the original two-rename set:
          `Full Test Suite` → `Integration & E2E Tests` corrects a misnomer (it runs only integration + e2e; unit
          tests live in the sibling job), alongside `Quality Checks` → `Lint, Typecheck & Unit Tests`;
          `Portability (concurrency guards)` kept. Spec § D and the 3.2 task amended to record the wider scope.

### `[x]` **2.2 Wire the `classify` job to the script**

- _Goal:_ `classify` calls `scripts/classify-change.sh`, emits the `weight` output and its reason, gains
  `checks: read`, and the heavy jobs gate on `needs.classify.outputs.weight != 'light'` — `merge-ok` unchanged.

- _Outcome:_ The `classify` job now delegates the weight axis to `bash scripts/classify-change.sh decide`
  (invoked via `bash` because git records the script `100644`), appending its `weight=`/`reason=` stdout to
  `$GITHUB_OUTPUT` and the step summary; the job gained job-level `contents: read` + `checks: read` and a
  `GH_TOKEN` env for the live lookback (exercised only in Phase 4). All heavy-job `if:` gates and the `merge-ok`
  log now read `weight`; `lane` and `changed_all` are unchanged. The per-push `changed_depth` block is left in
  place but unconsumed — its removal is Task 2.3 (expand here, contract there).

### `[x]` **2.3 Retire the per-push delta machinery**

- _Goal:_ The `before..after` latest-push file-diff logic from `97b5d299` is gone — the code-tree check
  subsumes and supersedes it — leaving no dead `changed_depth` path or stale comments.

- _Outcome:_ Removed the `push_before`/`push_after`/`changed_depth` block, its `changed (depth):` diagnostic,
  and the belt-and-suspenders comments from `ci.yml`'s `classify` step; rewrote the lead comment to describe
  only `changed_all` (still feeding `lane`) and the script-owned weight axis. `action` is retained, now only in
  the classify diagnostic log. The verified-tree lookback in `classify-change.sh` is the sole successor to the
  old per-push docs-skip heuristic.

## **Phase 3:** Bounded efficiency and structure/naming

_Purpose:_ Land the co-located efficiency win (cancel superseded runs) and the reviewer-legibility cleanup
(functional job/step names, no ARC vocabulary), within the deliberate single-file / fixed-job-count shape.

_Design decisions:_ `ci.yml` is not split and no jobs are added/removed (job count is itself a cost lever);
`merge-ok` keeps its name (it is the wired required check). See `spec-ci-content-aware-depth.md` § C, § D.

### `[x]` **3.1 Add `concurrency` with `cancel-in-progress`**

- _Goal:_ A re-push cancels the superseded in-flight CI run — the dominant waste lever once PR cadence rises.

    - Added a workflow-level `concurrency` block to `ci.yml` (above `jobs:`) keyed on
      `${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: true`; `docs.yml`'s non-cancelling
      `pages` group left untouched.

### `[ ]` **3.2 Functional naming and ARC-vocabulary scrub**

- _Goal:_ Job/step names say what they do and the workflow carries no methodology vocabulary — reviewer-legible
  and compliant with the no-meta-references rule for durable config.

    - Rename the `Quality Checks` job to `Lint, Typecheck & Unit Tests` and `Full Test Suite` to
      `Integration & E2E Tests` (it runs only integration + e2e — unit tests live in the job above, so the old
      name mis-implied containment); fix `classify`'s display name (`Classify lane`) to cover both axes. Keep
      `Portability (concurrency guards)` (already functional).
    - Apply those `name:` strings identically to the lookback's heavy-check-name constant (Task 2.1.b) — the
      workflow `name:` fields and the matcher are one coupled surface; a mismatch silently defeats the skip. The
      constant in `classify-change.sh` is the source of truth for the exact strings (matrix legs carry the
      `(<os>)` suffix GitHub appends).
    - Scrub methodology vocabulary from names and comments — including the `classify` comment citing
      `strategy-work-organization § Auto-Merge Lane` (a doc-path/§ citation in durable config); keep `merge-ok`.
      Leave the functional `lane` classification regex (the artifact-path patterns it matches) — that is
      load-bearing logic, not vocabulary, and `lane` is unchanged.

## **Phase 4:** Live CI verification

_Purpose:_ Validate the irreducibly cross-run behavior that unit tests cannot — across real PR + push sequences
on restored Actions billing. This is the safety invariant's proof; minimize live burn but cover every edge the
contract names.

_Design decisions:_ Offline coverage (Phases 1–3) is maximized so this phase only exercises what needs real
Actions. Edge contract and live scenarios are enumerated in `spec-ci-content-aware-depth.md`
§ Cross-cutting Considerations (Edge contract, Testing) and § Success Criteria.

_To minimize live burn,_ choreograph the scenarios onto as few PR lifecycles as possible: one code PR chains
first-push (heavy — the verifying run) → docs follow-up (skip) → force-push → rebase in sequence; the red-code
case (4.2) needs its own PR — a deliberately-failing commit, then a docs push, confirming no-skip + `merge-ok`
red, then discarded.

### `[ ]` **4.1 Docs-only and fixture-as-code runs**

- _Goal:_ A pure-markdown / `.arc/**` PR runs only the doc/ARC linters (full-suite + portability skip) and
  `merge-ok` passes; a fixtures-only change (`{arc,templates}/**`, `init-recipe.json`) runs the full suite.

    - Reproduces the #153 / #154 case at near-zero cost (Success Criteria 1); confirms fixture-as-code (4).

### `[ ]` **4.2 Safety invariant — docs follow-up and red-code-then-docs**

- _Goal:_ A docs-only push onto a code PR skips heavy **only** after a prior heavy run succeeded for the same
  code tree; a failed/incomplete code push followed by a docs push does **not** skip heavy and does **not** let
  `merge-ok` pass.

    - These are Success Criteria 2 and 3 — the merge invariant. Confirm `merge-ok` blocks in the red case.

### `[ ]` **4.3 Edge contract and concurrency**

- _Goal:_ Every uncertain path fails safe to heavy and superseded runs cancel.

    - Confirm force-push (no resolvable match), rebase/squash (content hash stable; out-of-range check-runs),
      in-progress prior run, and API-error / missing-token all run heavy.
    - Confirm `concurrency` cancels a superseded in-flight run (Success Criteria 5).
    - Re-confirm `bab51166`'s docs-only-skip behavior under the corrected code-surface set.

## **Phase 5:** Verification

### `[ ]` **5.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Docs-only PR runs light — only doc/ARC linters; `Full Test Suite` and `Portability` skip; `merge-ok`
  passes (reproduces #153 / #154 at near-zero cost).
- `[ ]` Docs-follow-up skip is safe — a code PR's docs-only latest push skips heavy only after a prior heavy run
  succeeded for the same code tree (confirmed live).
- `[ ]` Red-code-then-docs does NOT merge — a failed/incomplete code push followed by a docs-only push does not
  skip heavy and does not let `merge-ok` pass (confirmed live).
- `[ ]` Fixture-as-code is heavy — a change touching only `packages/arc-framework/{arc,templates}/**` or
  `init-recipe.json` classifies heavy and runs the suite.
- `[ ]` Superseded runs cancel — a re-push cancels the in-flight prior run.
- `[ ]` Offline tests + `shellcheck` pass — `scripts/classify-change.sh` has unit tests for path classification
  and tree hashing; `lint:sh` is clean.
- `[ ]` No ARC vocabulary in the workflow; job/step names read functionally; `merge-ok` unchanged and still the
  wired required check.
- `[ ]` All quality gates pass (tests, linting, type checking)
- `[ ]` Ready for integration
