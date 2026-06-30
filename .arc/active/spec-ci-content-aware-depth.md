# Spec (`detailed` · `RFC`): ci-content-aware-depth

- **Origin:** [internal]

- **Purpose:** Make the dev-repo's CI **cost follow the content of a change**, cutting redundant Actions spend
  **safely** — gate the expensive code/test/cross-platform work behind a precise check that no docs follow-up can
  ever let unverified code merge — ahead of `finalize-parallelism` raising PR cadence (and CI minutes)
  considerably.

---

## Introduction / Context

The dev repo's GitHub Actions spend is disproportionate to the value delivered, and it is about to get worse.
Three observed costs:

- **Docs pay for code CI.** Any non-planning-artifact change — including pure markdown (`.arc/**` prose, READMEs,
  strategies) classified `reviewed` lane — ran the full matrix: the `Quality Checks` code steps, the `Full Test
  Suite`, and the 3-OS `Portability` matrix. Seen live on PRs #153 / #154 (pure markdown) running the entire
  suite.
- **Per-push waste on code PRs.** Code PRs *commonly* receive markdown-only follow-up pushes (the archive-a-WU
  ceremony does this every time, plus handoff / doc tweaks). Each re-ran the full matrix, because PR path filters
  evaluate the cumulative `base...head`, not the latest push.
- **Redundant in-flight runs.** `ci.yml` has no `concurrency` block, so a re-push leaves the superseded run to
  finish alongside the new one — both billed to completion.

The acute trigger (now cleared): the Actions account hit its spending limit (run `28452133865` refused to start).
Billing has since been restored, so the live-verification phase is unblocked, but the two commits already on this
branch (below) remain unproven against real Actions until re-run. And it is about to compound: `finalize-
parallelism` raises PR cadence via worktree-based concurrent work, multiplying CI minutes right when the budget is
already strained.

**What already landed on this branch** (committed, provisional until CI runs them; this design *revises* the
second):

- **`bab51166` — content-aware depth.** `classify` emits two independent axes: `lane` (merge policy, unchanged)
  and `depth` (light / heavy). `depth=light` iff every changed file is `*.md`; the code steps and the full-suite /
  portability jobs gate on `depth != 'light'`; doc linters always run; `merge-ok` (the single required check) is
  skip-tolerant and unchanged.
- **`97b5d299` — per-push depth.** On `synchronize`, `depth` is computed from the latest-push delta
  (`event.before..after`) rather than the whole PR. **Unsafe on its own** — CodeRabbit flagged it (major): a code
  PR can go light after a docs-only push, the heavy jobs skip, and skip-tolerant `merge-ok` accepts the skipped
  needs — letting a head SHA merge having never run the code suite for its *current* code. This design **replaces
  that per-push heuristic with a precise code-tree check**, retiring the approximation rather than gating on top of
  it.

## Goals

- **Cost follows content.** A change that provably cannot affect a build / lint / typecheck / test outcome does not
  pay for the code/test/cross-platform matrix.
- **Safety is precise, not heuristic.** A PR may merge only when the `Full Test Suite` **and** the `Portability`
  matrix succeeded for the PR's **current code tree** — identified exactly, never approximated by per-push file
  diffing. No docs follow-up can mask a red or incomplete code run.
- **One source of truth for "code".** A single canonical definition of the code surface drives both the `weight`
  decision and the safety check — no drift between two glob lists.
- **Bounded efficiency win at rising cadence.** Cancel superseded in-flight runs, the dominant waste lever once
  cadence spikes.
- **Testable offline; minimal live burn.** Everything provable without Actions (path classification, tree hashing)
  is unit-tested locally; only the irreducibly cross-run behavior consumes scarce live runs.
- **Reviewer-legible config.** No ARC methodology vocabulary in the workflow; names say what they do.

## Non-Goals

- **Cross-platform hardening** — OS-matrix generalization / shake-out, fail-fast tuning, supply-chain SHA-pinning +
  Renovate/Dependabot, the `madge --circular` module-graph gate, and the separate-config-vs-globbed test-race fix.
  All belong to the sibling WU `ci-cross-platform-hardening`; the two share `.github/workflows/ci.yml` and are
  sequenced (rebase the later on the earlier), never overlapped.
- **Restructuring `ci.yml` into multiple files or more jobs** — see Proposed Design § D (job count is itself a cost
  lever).
- **Renaming `merge-ok`** — it is the wired required check; a rename silently un-requires it unless branch
  protection is updated in lockstep.
- **A `workflow_run`-based or polling re-trigger** for in-progress runs — the run-decision placement (§ B)
  dissolves that need.

## Proposed Design

The change is concentrated in `classify` and one extracted script; the downstream jobs and `merge-ok` keep their
shape. `classify` resolves a single run-vs-skip decision — the `weight` output (renaming the on-branch `depth`; see
§ D) — that the heavy jobs already gate on, and the existing skip-tolerant `merge-ok` rollup is unchanged.

### A. One canonical code-surface path set

A single definition of "what, if changed, could change a build / lint / typecheck / test outcome." It drives
**both** the `weight` classification and the safety check's notion of "code tree" — one source of truth.

This corrects a leaky proxy in `bab51166`: the original `light iff all *.md` rule is unsafe because tests in this
repo consume markdown / JSON as **fixtures** — `packages/arc-framework/templates/**`, `init-recipe.json`, and the
shipped `packages/arc-framework/arc/**` tree (init / save-load / active-format tests read it). Such content is
markdown, would classify light, and would skip the tests that validate it. The path set therefore counts
test-affecting content as **code**.

- **Code surface (test-affecting → heavy):**
    - `packages/arc-framework/{src,__tests__,arc,templates}/**`
    - package build/test configs: `packages/arc-framework/{package.json,tsconfig*.json,tsup.config.ts,vitest.config.ts,eslint.config.js}`
    - `packages/arc-framework/init-recipe.json`
    - root `package.json` / `package-lock.json`
    - `scripts/*.sh`
    - `.github/workflows/ci.yml` itself (it defines the commands that run)
- **Genuine docs (light-safe):** `.arc/**`; root `*.md` (`README` / `CONTRIBUTING` / `AGENTS` / `CLAUDE`);
  `docs/**`; `mkdocs.yml`.
- **Fail-safe:** any unverifiable / empty / ambiguous case classifies as **code (heavy)**.

Exact membership is fixed and unit-tested at implementation, refined against the real fixture dependencies if the
offline tests surface a missed path. The set above is the design intent.

### B. Safety check — Checks-API lookback, as a run-decision in `classify`

Resolve "is this code already verified?" by asking the **source of truth** (the GitHub Checks API), not by
trusting a cache artifact — and place the check as a **run-vs-skip decision in `classify`**, not as a post-hoc gate
in `merge-ok`.

`classify` already checks out with `fetch-depth: 0`; it gains `checks: read` permission. It computes the **`weight`
decision** as follows:

1. **Docs-only?** Compute the changed set over the whole PR (`base...head`). If no path in the code-surface set
   (§ A) changed → `weight=light` (reason: `docs-only`). The heavy jobs skip; no API call needed.
2. **Code touched → already verified?** Otherwise compute HEAD's **code-tree hash** (§ below) and look for a prior
   run that already verified this exact tree:
    - Enumerate the PR's commits (`base..head`, available locally via `fetch-depth: 0`) and keep those whose
      code-tree hash equals HEAD's (typically HEAD plus any docs-only commits layered on top of the last code
      commit).
    - For each such commit, query the Checks API (`GET /repos/{owner}/{repo}/commits/{sha}/check-runs`) and test
      whether the heavy check-runs — `Full Test Suite`, all three `Portability` legs, and `Quality Checks` —
      concluded `success`.
    - If any matching commit clears that bar → `weight=light` (reason: `verified`). The heavy jobs skip — provably
      redundant, that exact code tree was actually verified.
3. **Otherwise → `weight=heavy`** (reason: `unverified` / `fail-safe`). Covers first push, a not-yet-successful or
   in-progress prior run, an API error, a missing token, force-push with no resolvable match, and every ambiguous
   case. The heavy jobs run.

The job conditions keep the same shape — the heavy jobs gate on `needs.classify.outputs.weight != 'light'`, and
`merge-ok` stays a dumb skip-tolerant rollup. `weight` answers "can the heavy suite be safely skipped" — broader
than `bab51166`'s docs-only-only signal, since `light` now also covers the already-verified case; the **reason**
(`docs-only` / `verified` / `unverified`) is logged and written to the job summary for observability. The
`!= 'light'` polarity is deliberately **fail-open**: an empty or unset output (a `classify` bug) is `!= 'light'`,
so the heavy jobs run rather than silently skip (§ D records why this beats a boolean).

**Why this placement:**

- **It dissolves the in-progress edge.** A heavy run still in flight is simply "not yet successful" → run it. No
  polling, no `workflow_run` re-trigger, no `merge-ok` second-guessing.
- **It is strictly more precise and safe than `97b5d299`.** "Is *this* code tree verified?" subsumes "did this push
  only touch docs?" — a docs push onto a code PR skips heavy **only** after confirming the code passed, and can
  never mask a red / incomplete code run. This is what retires the `before..after` delta machinery.

**Code-tree hash.** Over the code-surface set (§ A): enumerate every tracked path at the ref
(`git ls-tree -r <ref>`), keep those the canonical path set classifies as code, and hash the sorted
`path:blob-sha` lines. Deriving the hashed set from the **same predicate** the `weight` decision uses is the
no-drift guarantee — there is no second member list to maintain, and a code path *outside* the explicitly-named
dirs/files (caught by the fail-safe) is still hashed, so it can never silently match a prior run and skip the
suite. Blob SHAs are **rebase- and squash-stable** (commit SHAs churn; content hashes don't), which neutralizes
those edges for free; a removed path simply drops from the list (its absence changes the hash). Any failure to
compute the hash → fail-safe `weight=heavy`, never a stale hash.

### C. Bounded efficiency pass

Co-located since `ci.yml` is already being edited; chosen for impact at rising cadence.

- **`concurrency` + `cancel-in-progress` (the clear win).** Add a workflow-level `concurrency` group keyed on the
  ref (e.g. `${{ github.workflow }}-${{ github.ref }}`) with `cancel-in-progress: true`, so a re-push cancels the
  superseded in-flight run. This is the dominant waste lever once `finalize-parallelism` spikes PR frequency.
  (`docs.yml`'s non-cancelling `pages` group is deliberately separate and stays.)
- **Build-artifact sharing — evaluated against real run timings; not adopted.** `npm run build` runs ~5× today
  (the `quality` / `full-suite` jobs + `portability` ×3), but sharing the artifact saves no billed minutes:
  `npm ci` runs in every job regardless (the dominant cost; deps are needed to run the tests), the `tsup` build
  is a small fraction of each job, and Actions' per-minute rounding swallows the few seconds saved — while a
  shared-build job adds a billed minute plus serializes the matrix behind it. Net neutral-to-negative against the
  dominant levers (docs-only/verified skip, superseded-run cancel), so it is out of scope.
- **Dependency caching is already done** (`setup-node@v5` `cache: 'npm'` on every job) — nothing to add.

### D. Structure & naming

- **`ci.yml` is not split** — neither into files nor more jobs. It is a cohesive single-trigger pipeline with one
  `classify → gate` graph and one required rollup; cross-file deps would go through the decoupled `workflow_run`
  and can't cleanly feed one required check. Job count is itself a cost lever: Actions bills per-job rounded up to
  the minute, each job paying fixed startup + checkout + `npm ci` overhead, so jobs stay consolidated to their gate
  boundaries (no splitting `quality`, no splitting integration from e2e).
- **Extract `classify`'s inline shell → `scripts/classify-change.sh`.** This houses the canonical path set (§ A)
  and the code-tree hash (§ B) in one place that is (a) `shellcheck`-able via `lint:sh`, and (b) **unit-testable**
  against path-set and tree-hash fixtures — turning the ad-hoc "10 path sets" check into real tests and retiring
  the `grep`/`ugrep` gotcha hit during local probing. `ci.yml` shrinks to orchestration; `scripts/` already holds
  sibling checks (`check-package-sync.sh`, `check-ts-quality.sh`), so it fits the grain. The script is structured
  so its pure parts (path classification, tree hashing) run without network; the Checks-API lookback is the one
  seam that needs a live token and is exercised only in live verification.
- **Naming — explicit and functional.** Rename the `Quality Checks` job to name what it does (lint + typecheck +
  unit); fix `classify`'s display name (`Classify lane`) to cover both axes. **Keep `merge-ok`** (Non-Goals). No
  ARC vocabulary (no `tier-1/2/3`, no methodology lingo) in names or comments — reviewer-hostile and a
  no-meta-references violation for durable config. The content-aware gating *embodies* the tiered-threshold
  discipline without naming it.
- **`classify` output names — `lane` (kept) + `weight` (renamed from `depth`).** Neither CI concept has an
  industry-standard name (path-filter outputs are project-coined; merge-policy routing has no canonical term), so
  the choice is reviewer-legibility, not convention-following.
    - **`lane: auto|reviewed` — kept.** Self-disambiguating via its values; the only overlap is `fastlane`'s
      mobile-CI "lane" (a build recipe), a cross-domain and harmless collision in a non-mobile repo.
    - **`weight: light|heavy` — renamed from the on-branch `depth`.** `depth` collides with `fetch-depth`
      (clone-history depth) in the very same `classify` job, and "depth-of-change" no longer fits a field that now
      means "must the heavy suite run." `weight` sheds both.
    - **Enum, not a boolean** (`run_heavy: true|false`). The value is carried in the `merge-ok` log summary
      (`lane=… weight=…`), where an enum communicates state; and a categorical `!= 'light'` gate is **fail-open**,
      whereas a `run_heavy == 'true'` gate is **fail-closed** — on an empty/unset output it would silently skip the
      safety suite. Preserving fail-open with a boolean forces the awkward `!= 'false'`.
    - Output *keys* (`lane`, `weight`) are settled here; job/step display-name strings and the `weight` reason
      values settle at implementation.

## Alternatives & Rationale

- **Safety check — Option A (Checks-API lookback): chosen**, refined to a run-decision in `classify` (§ B). Trusts
  the source of truth; rebase-stable; cost is `checks: read` + the narrow in-progress re-run window (dissolved by
  the placement).
- **Lookback association — enumerate-and-recompute (chosen) vs. embed-hash-in-check-run.** The chosen mechanism
  computes candidate commits' code-tree hashes locally and matches against HEAD's, then confirms heavy success via
  the Checks API — a **pure `classify`-side read** that needs no change to how the heavy jobs report. The
  alternative — heavy jobs publish their code-tree hash into a check-run name/output for a direct query — couples
  the producing jobs to the lookback and adds a write surface; rejected as more moving parts for no gain at this
  scale (a PR has few commits to enumerate). Recorded as the fallback if enumeration proves slow or rate-limited.
- **Safety check — Option B (code-tree-hash cache ledger): rejected.** Self-contained (no API / token), but PR
  cache scoping (merge-ref vs branch), eviction (7-day / 10 GB), and cross-run visibility are subtle and only
  live-verifiable — fragile for a *safety* gate, and the wrong trust model (an artifact, not the actual run
  result). No eviction / scoping surface to reason about under Option A.
- **Ship `97b5d299` without a safety check — rejected.** That is the CodeRabbit finding; it leaves a silent
  merge-bypass in `main`. Promoting this to a WU exists precisely so per-push and its safety ship together.
- **Per-push depth as the optimization (status quo on-branch): retired.** Subsumed by the code-tree check, which is
  both more precise (exact tree, not file-extension heuristic) and safe (verified-before-skip).

## Cross-cutting Considerations

**Security / permissions.** `classify` gains `checks: read` (read-only; the workflow default stays `contents:
read`). No write scope added. The lookback queries only this repo's own check-runs via the default `GITHUB_TOKEN`.

**Safety — the merge invariant.** The required check (`merge-ok`) must never pass for a PR whose current code tree
lacks a successful `Full Test Suite` + `Portability` run. Because the skip decision is *gated on confirmed prior
success* (not on a file heuristic), a skipped heavy job means "already verified," and `merge-ok`'s skip-tolerance
is sound. Every uncertain path fails safe to running heavy.

**Edge contract** (each path resolves to a deliberate, tested fail-closed behavior):

- **First push / new code tree** — no prior successful run → heavy runs (it *is* the verifying run).
- **Docs-only push onto a code PR** — code tree unchanged; prior heavy succeeded → skip; not-yet / failed → run.
- **Heavy run in progress** — not-yet-successful → run (narrow wasteful window, never unsafe).
- **Force-push** — commit SHAs unresolvable as a delta, but HEAD's code-tree hash is still computable; no matching
  successful run → heavy runs.
- **Squash / rebase** — content hashes stable, so the tree may be unchanged; older check-runs may fall out of the
  enumerated range → re-run heavy (safe, mildly wasteful).
- **API error / missing `checks: read` / empty diff** — heavy runs.

**Performance / cost.** The dominant savings: docs-only PRs and docs-follow-up pushes skip the matrix; superseded
runs cancel. Added cost: one Checks-API read per code-touching classify (negligible) and local tree-hash
computation (sub-second). Net strongly positive, growing with cadence.

**Testing.**

- **Offline (maximize):** unit-test `scripts/classify-change.sh` — path-set classification (`weight`) and code-tree
  hashing — against fixtures, plus `shellcheck` via `lint:sh`. The git plumbing (tree/blob hashing) is testable
  against real repo commits.
- **Live (minimize, now unblocked):** the cross-run lookback cannot be unit-tested; validate across real PR + push
  sequences — first code push, docs follow-up (skip), red code push then docs push (must NOT skip / must NOT
  merge), force-push, rebase. Confirm `concurrency` cancels a superseded run. Re-confirm `bab51166`'s behavior
  under the corrected code-surface set.

**Migration / rollout.** Pure CI-config change; no adopter or runtime surface. The two on-branch commits
(`bab51166`, `97b5d299`) are superseded by this design — `97b5d299`'s per-push delta machinery is removed during
implementation. The `ci-cross-platform-hardening` boundary is recorded in both drafts; sequence the WUs on the
shared `ci.yml`.

**Documentation.** `TECHNICAL-OVERVIEW.md` § 3 *Merge gating* describes `merge-ok` rolling up *lane*-gated jobs;
the `weight` axis now also gates. Update that prose organically when this WU integrates.

## Success Criteria

Validated at work-unit completion:

1. **Docs-only PR runs light.** A pure-markdown / `.arc/**` PR runs only the doc/ARC linters; `Full Test Suite`
   and `Portability` skip; `merge-ok` passes. (Reproduces the #153 / #154 case at near-zero cost.)
2. **Docs-follow-up skip is safe.** A code PR whose latest push is docs-only skips the heavy jobs **only** after a
   prior heavy run succeeded for the same code tree — confirmed live.
3. **Red-code-then-docs does NOT merge.** A code push that fails (or never completes) the heavy suite, followed by a
   docs-only push, does **not** skip heavy and does **not** let `merge-ok` pass — confirmed live (the safety
   invariant).
4. **Fixture-as-code is heavy.** A change touching only `packages/arc-framework/{arc,templates}/**` or
   `init-recipe.json` (markdown / JSON fixtures) classifies heavy and runs the suite.
5. **Superseded runs cancel.** A re-push cancels the in-flight prior run (`concurrency`).
6. **Offline tests + shellcheck pass.** `scripts/classify-change.sh` has unit tests for path classification and
   tree hashing; `lint:sh` is clean.
7. **No ARC vocabulary in the workflow**; job/step names read functionally; `merge-ok` unchanged and still the
   wired required check.

## Open Questions

Resolved during the work, not deferred as debt:

- **Final job / step display-name strings and `weight` reason values** — settled at implementation once the gate
  boundaries are final (the rename of `Quality Checks` and `Classify lane`; the `docs-only` / `verified` /
  `unverified` reason strings). The output *keys* (`lane`, `weight`) are settled — see Proposed Design § D.
- **Commit-enumeration range for the lookback** — `base..head` is the default; whether to widen to recent repo
  history for the rebase/squash case (vs. accept the mild re-run) is a tuning call made against live behavior, not
  a design blocker.
