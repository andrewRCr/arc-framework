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

### `[ ]` **1.3 Code-tree hash over the canonical set**

- _Goal:_ The `tree-hash` subcommand computes a deterministic, rebase/squash-stable identity for the code tree
  at a given commit — so "is this exact code already verified?" can be asked without trusting commit SHAs.

    - Serialize tree-SHAs (`git rev-parse <sha>:<dir>`) for directory subtrees and blob-SHAs for individual
      files in the set, as sorted `path:sha` lines, then hash; a path absent at the commit records a sentinel.

    - Build `test-first` (one behavior at a time):
        - Same code tree across two commits (docs-only delta layered on top) → identical hash.
        - A change to a code-surface file → different hash.
        - A change to a genuine-docs file only → unchanged hash.
        - An absent code-surface path → sentinel recorded, no failure.
        - Any failure to compute (bad ref, plumbing error) → surfaces as fail-safe heavy, never a stale hash.

## **Phase 2:** `weight` run-decision and `classify` wiring

_Purpose:_ Assemble the full run-vs-skip decision (§ B) in the script and wire it into the `classify` job,
replacing `97b5d299`'s per-push file-diff heuristic with the precise Checks-API lookback. Delivers the safety
invariant: heavy jobs skip only when this exact code tree already passed.

_Design decisions:_ Output key is `weight` (renamed from on-branch `depth`, which collided with `fetch-depth`);
the gate stays the fail-open `!= 'light'` polarity (an empty/unset output runs heavy). Lookback uses
enumerate-and-recompute (pure `classify`-side read), not embed-hash-in-check-run. See
`spec-ci-content-aware-depth.md` § B, § D.

### `[ ]` **2.1 Assemble the `weight` decision in the script**

- _Goal:_ The script resolves `weight` ∈ `{light, heavy}` with a logged reason ∈ `{docs-only, verified,
  unverified}` — docs-only changes and already-verified code trees skip; everything uncertain runs heavy.

- _Approach:_ The Checks-API call is the one live-only seam — structure it so the pure parts (commit
  enumeration, code-tree-hash matching, reason resolution) are unit-testable with the API result injected, and
  the network call itself is exercised only in Phase 4. On a `push` event (no PR base — `quality` still runs),
  `decide` does the docs-only check only and otherwise returns `heavy`; the verified-tree lookback is a
  pull-request concern (per-tree verification history is the PR's job, and branch pushes keep fast heavy-on-code
  feedback).

    - `[ ]` **2.1.a Docs-only and fail-safe arms (pure)**
        - Whole-PR changed set (`base...head`) touches no code-surface path → `light` / `docs-only`.
        - Missing token, API error, no resolvable diff, force-push with no match → `heavy` / `unverified`.

        - Build `test-first` (one behavior at a time):
            - Docs-only PR diff → `light` / `docs-only`, no API call attempted.
            - Empty / unverifiable diff → `heavy` / `unverified`.

    - `[ ]` **2.1.b Verified-tree lookback (enumerate-and-recompute)**
        - _Goal:_ A code-touching PR skips heavy only when some enumerated commit with HEAD's code-tree hash
          has all the heavy checks (`Full Test Suite`, the three `Portability` legs, and the lint/typecheck/unit
          job) concluded `success`.

        - Enumerate `base..head` commits, keep those whose code-tree hash equals HEAD's, query the Checks API
          (`GET /commits/{sha}/check-runs`, via `gh api` with the default `GITHUB_TOKEN`) for each, and require
          the full heavy set at `success`.

        - _Note:_ Match against the heavy check **display names** from a single declared constant at the top of
          the script — settle those names up front (their final post-rename form) so the constant and the
          workflow `name:` fields are written identically in one pass. Only the lint/typecheck/unit name changes
          in the Phase 3 naming task (3.2); `Full Test Suite` / `Portability` are stable. The constant and 3.2's
          rename are one coupled surface — a name drift here fails safe (heavy) but silently defeats the skip.

        - Build `test-first` (one behavior at a time):
            - Injected: a matching commit with all heavy checks green → `light` / `verified`.
            - Injected: a matching commit with a heavy check failed/in-progress/absent → `heavy` / `unverified`.
            - No commit matches HEAD's hash → `heavy` / `unverified`.

### `[ ]` **2.2 Wire the `classify` job to the script**

- _Goal:_ `classify` calls `scripts/classify-change.sh`, emits the `weight` output and its reason, gains
  `checks: read`, and the heavy jobs gate on `needs.classify.outputs.weight != 'light'` — `merge-ok` unchanged.

    - Grant the `classify` job `checks: read` (workflow default stays `contents: read`; no write scope added).
    - Replace `classify`'s inline shell with a call to the script; surface `weight` + `reason` as outputs and in
      the job summary; keep `lane` as-is.
    - Rename `depth` → `weight` in every heavy-job `if:` condition and in the `merge-ok` rollup log line.

### `[ ]` **2.3 Retire the per-push delta machinery**

- _Goal:_ The `before..after` latest-push file-diff logic from `97b5d299` is gone — the code-tree check
  subsumes and supersedes it — leaving no dead `changed_depth` path or stale comments.

    - Remove the per-push `depth` computation and its belt-and-suspenders comments; keep `changed_all` only
      where `lane` still needs the whole-PR set.

## **Phase 3:** Bounded efficiency and structure/naming

_Purpose:_ Land the co-located efficiency win (cancel superseded runs) and the reviewer-legibility cleanup
(functional job/step names, no ARC vocabulary), within the deliberate single-file / fixed-job-count shape.

_Design decisions:_ `ci.yml` is not split and no jobs are added/removed (job count is itself a cost lever);
`merge-ok` keeps its name (it is the wired required check). See `spec-ci-content-aware-depth.md` § C, § D.

### `[ ]` **3.1 Add `concurrency` with `cancel-in-progress`**

- _Goal:_ A re-push cancels the superseded in-flight CI run — the dominant waste lever once PR cadence rises.

    - Add a workflow-level `concurrency` group keyed on `${{ github.workflow }}-${{ github.ref }}` with
      `cancel-in-progress: true`; leave `docs.yml`'s non-cancelling `pages` group untouched.

### `[ ]` **3.2 Functional naming and ARC-vocabulary scrub**

- _Goal:_ Job/step names say what they do and the workflow carries no methodology vocabulary — reviewer-legible
  and compliant with the no-meta-references rule for durable config.

    - Rename the `Quality Checks` job to name its work (lint + typecheck + unit); fix `classify`'s display name
      (`Classify lane`) to cover both axes.
    - Apply the renamed lint/typecheck/unit display name identically to the lookback's heavy-check-name constant
      (Task 2.1.b) — the workflow `name:` and the matcher are one coupled surface; a mismatch silently defeats
      the skip.
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
