# Draft: ci-content-aware-depth

- **Origin:** [internal] — promoted from an errand (`chore/ci-content-aware-depth`) once the per-push
  optimization proved to need a real safety design rather than a one-shot fix.
- **Purpose:** Make CI **cost follow the content of a change**, and cut redundant CI spend, **safely** — so the
  dev-repo's GitHub Actions bill tracks what actually needs verifying, ahead of `finalize-parallelism` raising PR
  cadence (and CI minutes) considerably. Two halves: (1) skip the code/test matrix for changes that provably can't
  affect it, gated by a precise safety check that a docs follow-up can never let unverified code merge; (2) a
  bounded efficiency pass on the workflow itself (run-cancellation, structure) that pays off most exactly when
  cadence spikes.

---

## Problem / Motivation

CI spend is disproportionate to the value delivered, and it is about to get worse:

- **Docs pay for code CI.** Before this work, any non-planning-artifact change — including pure markdown
  (`.arc/system/**` prose, READMEs, strategies) — classified as `reviewed` lane and ran the full matrix:
  the code checks, the integration/e2e suite, and the 3-OS cross-platform matrix. Observed live on PRs #153 and
  #154 (pure markdown) running the entire suite.
- **Per-push waste on code PRs.** Code work *commonly* receives markdown-only follow-up pushes (the
  archive-a-work-unit ceremony does this every time, plus handoff/doc tweaks). Each such push re-ran the full
  matrix, because PR path filters evaluate the cumulative `base...head`, not the latest push.
- **Redundant in-flight runs.** `ci.yml` has **no `concurrency` block**, so a re-push leaves the superseded run
  to finish alongside the new one — both billed to completion.
- **Acute trigger (now cleared).** The repo's Actions account hit its spending limit (run `28452133865` refused to
  start) — the very spend this work reduces is what tripped the cap. **Billing has since been restored**, so the
  live-verification phase is unblocked; the prior commits on this branch remain unproven against real Actions
  until re-run.
- **About to compound.** `finalize-parallelism` (the next milestone) raises PR cadence via worktree-based
  concurrent work, multiplying CI minutes right when the budget is already strained. This is the reason to make
  the WU slightly more cross-cutting (the efficiency pass below) rather than minimal.

### What already landed on this branch (committed, NOT yet live-verified)

Two commits are preserved as the starting point; both are provisional until CI actually runs them, and the design
below **revises** the second:

- **Pass 1 (`bab51166`) — content-aware depth.** `classify` emits two independent axes: `lane` (merge policy,
  unchanged) and `depth` (light/heavy). `depth=light` iff every changed file is `*.md`, else heavy; computed per
  event, **fail-safe to heavy** on unverifiable SHAs / empty diff. The code steps and the integration/e2e and
  cross-platform jobs gate on `depth != 'light'`; the doc/ARC linters always run. `merge-ok` (the single required
  check) is unchanged and skip-tolerant. The predicate was validated locally against 10 path sets (working around
  a sandbox `grep`→`ugrep` wrapper that mishandles `grep -qv` on multi-line input).
- **Pass 2 (`97b5d299`) — per-push depth.** On `synchronize`, `depth` is computed from the latest-push delta
  (`event.before..after`) rather than the whole PR, so a markdown-only push onto a code PR runs light; `lane`
  stays whole-PR. Force-push / unresolvable SHAs fall back to the whole change (fail-safe to heavy). **This pass
  is unsafe on its own** — CodeRabbit flagged it (major): a code PR can go light after a docs-only commit, so the
  heavy jobs skip and skip-tolerant `merge-ok` accepts the skipped needs, letting a head SHA merge having never
  run the code suite for its current code. Safe *in practice* (markdown can't change test outcomes; code was
  tested on its own push; reviewed lane requires sign-off) but a genuine silent merge-bypass when the code push
  was red/incomplete and a docs push masks it. **The design below replaces Pass 2's per-push delta heuristic with
  a precise code-tree check, retiring that approximation rather than gating on top of it.**

### The invariant this work must hold

A PR must not merge unless the integration/e2e suite **and** the cross-platform matrix succeeded for the PR's
**current code tree**. Since docs changes don't touch code, "current code" is the latest code-touching state —
identified precisely below, not approximated by per-push file diffing.

## Resolved design

The design space is settled. The decisions below supersede the open alternatives (kept at the end for the
record).

### A. One canonical code-surface path set (drives depth *and* the safety gate)

A single definition of "what, if changed, could change a build/lint/typecheck/test outcome." It drives **both**
the `depth` classification and the safety gate's notion of "code tree" — one source of truth, no drift between two
glob lists.

This corrects an unsafe assumption in Pass 1. The `depth=light iff all files *.md` rule is a leaky proxy: tests
in this repo consume markdown/JSON as **fixtures** — `packages/arc-framework/templates/**`, `init-recipe.json`,
and the shipped `packages/arc-framework/arc/**` tree (confirmed: ~165 test files reference `templates`/`arc`/`.md`
content; init / save-load / active-format tests read it). A change to that content is markdown, would go light,
and would skip tests that validate it. The path set must therefore count test-affecting content as **code**, not
docs.

- **Code surface (test-affecting → heavy):** `packages/arc-framework/{src,__tests__,arc,templates}/**`; the
  package build/test configs (`package.json`, `tsconfig*.json`, `tsup.config.ts`, `vitest.config.ts`,
  `eslint.config.js`); `init-recipe.json`; root `package.json` / `package-lock.json`; `scripts/*.sh`; and
  `.github/workflows/ci.yml` itself (it defines the commands that run).
- **Genuine docs (light-safe):** `.arc/**`, root `*.md` (`README` / `CONTRIBUTING` / `AGENTS` / `CLAUDE`),
  `docs/**`, `mkdocs.yml`.
- **Fail-safe:** any unverifiable / empty / ambiguous case classifies as code (heavy). The exact membership is
  fixed once at implementation and unit-tested (below).

### B. Safety gate — Checks-API lookback, placed as a run-decision (Option A, refined)

Resolve "is this code already verified?" by asking the **source of truth** (the Checks API), not by trusting a
cache artifact. Crucially, place the check as a **run-vs-skip decision in `classify`**, not as a post-hoc gate in
`merge-ok`:

1. `classify` (already checks out with `fetch-depth: 0`; gains `checks: read`) computes HEAD's **code-tree hash**
   over the code-surface set, and queries the Checks API: *does a completed, successful integration/e2e + cross-
   platform run exist for this exact code-tree?*
2. **Yes** → the heavy jobs skip (provably redundant — that code was actually verified).
3. **No / in-progress / API error / unresolvable** → the heavy jobs run (fail-safe).

Why this placement:

- **It dissolves the in-progress edge.** A heavy run still in flight is simply "not yet successful" → run it. No
  polling, no `workflow_run` re-trigger, no `merge-ok` second-guessing. `merge-ok` stays a dumb skip-tolerant
  rollup.
- **It is strictly more precise and safe than Pass 2.** "Is *this* code tree verified?" subsumes "did this push
  only touch docs?" — so a docs push onto a code PR skips heavy **only** after confirming the code passed, and a
  docs push can never mask a red/incomplete code run. This is what **retires Pass 2's `before..after` delta
  machinery**.

**Code-tree hash:** combine `git rev-parse HEAD:<dir>` tree-SHAs for the directory subtrees with blob-SHAs for
the individual files in the code-surface set. Tree/blob SHAs are **rebase- and squash-stable** (commit SHAs
churn, content hashes don't), which neutralizes that edge for free.

### C. Bounded efficiency pass (absorbed from the cost theme; kept narrow)

Co-located with the gate work since we are already editing `ci.yml`, and chosen for impact at rising cadence:

- **`concurrency` + cancel-in-progress (the clear win).** Add a workflow-level `concurrency` group keyed on the
  ref with `cancel-in-progress: true`, so a re-push cancels the superseded in-flight run. This is the dominant
  waste lever once `finalize-parallelism` spikes PR frequency. (`ci.yml` has none today; `docs.yml`'s
  non-cancelling `pages` group is deliberately separate and stays.)
- **Build-artifact sharing — evaluate, do not assume.** `npm run build` currently runs ~5× (the fast-checks job +
  integration/e2e + cross-platform ×3). Building once and sharing the artifact *might* help — but tsup is fast and
  the artifact upload/download round-trip may erase the gain. Measure during implementation; adopt only if net
  positive.
- **Dependency caching is already done** (`setup-node@v5` `cache: 'npm'` on every job) — nothing to add.

### D. Structure & naming (no split; extract the logic; plain vocabulary)

- **`ci.yml` is not broken up — neither into files nor more jobs.** It is a cohesive single-trigger pipeline with
  one `classify → gate` graph and one required rollup; that is the idiomatic shape (cross-file deps go through the
  decoupled `workflow_run` and can't cleanly feed one required check). And **job count is itself a cost lever**:
  Actions bills per-job rounded up to the minute, each job paying fixed startup + checkout + `npm ci` overhead, so
  jobs stay consolidated to their gate boundaries (no splitting the fast-checks job, no splitting integration from
  e2e — each split adds a billed minute for no gating benefit).
- **Extract `classify`'s inline shell → `scripts/classify-change.sh`.** This is the real "monolith" smell — ~50
  lines of bash in YAML. Extraction (a) houses the canonical code-surface path set (A) and the tree-hash (B) in
  one tested place; (b) makes the logic `shellcheck`-able (`lint:sh`) and **unit-testable locally** against path-
  set fixtures — turning the draft's ad-hoc "10 path sets" check into a real test and retiring the `grep`/`ugrep`
  gotcha; (c) shrinks `ci.yml` to orchestration. `scripts/` already holds sibling checks, so it fits the grain.
  Local testability matters disproportionately here because the cross-run lookback (B) cannot be unit-tested and
  needs scarce live runs — everything provable offline should be.
- **Naming: explicit and functional; drop legacy-generic names.** Rename "Quality Checks" to name what it does
  (lint + typecheck + unit — `verify` was considered and rejected as too vague); fix `classify`'s display name to
  cover both axes (it currently says only "lane"). **Keep `merge-ok`** — it is self-documenting, and renaming it
  carries a real branch-protection cost (it is the wired required check; a rename silently un-requires it unless
  protection is updated in lockstep). Exact strings are settled at implementation once boundaries are final.
- **No ARC vocabulary in the workflow.** No `tier-1/2/3` or other methodology lingo in names or comments — it is
  reviewer-hostile (CodeRabbit / external contributors) and violates the no-meta-references boundary for durable
  config. The depth-gating *embodies* the tiered-threshold discipline (cheap checks broad, expensive ones gated)
  without naming it; that rationale lives in the spec, not the YAML.

## Edge contract

Each path resolves to a deliberate, tested fail-closed behavior:

- **First push / new code tree** — no prior successful run for the tree → heavy runs (it *is* the verifying run).
- **Docs-only push onto a code PR** — code tree unchanged; if its heavy run succeeded → skip; if not yet / failed
  → run. (This is the safety fix.)
- **Heavy run in progress** — not-yet-successful → run (fail-safe; narrow wasteful window, never unsafe).
- **Force-push** — commit SHAs unresolvable as a delta, but HEAD's code-tree hash is still computable; no matching
  successful run → heavy runs.
- **Squash / rebase** — content hashes stable, so the code tree may be unchanged; older check-runs may not be
  found by the lookback (commits no longer in the PR) → re-run heavy (safe, mildly wasteful).
- **API error / missing `checks: read` / empty diff** — heavy runs.
- **Cache eviction** — **not applicable**: the rejected cache-ledger option (B, below) is not used, so there is no
  eviction/scoping/visibility surface to reason about.

## Verification

- **Offline (maximize):** unit-test `scripts/classify-change.sh` — path-set classification (depth) and code-tree
  hashing — against fixtures, plus `shellcheck`. The git plumbing (tree/blob hashing) is testable against real
  repo commits.
- **Live (minimize, now unblocked):** the cross-run Checks-API lookback cannot be unit-tested; validate it across
  real PR + push sequences — first code push, docs follow-up (skip), red code push then docs push (must NOT skip /
  must NOT merge), force-push, rebase. Confirm `concurrency` cancels a superseded run. Re-confirm Pass 1's
  behavior under the corrected code-surface set.

## Coordination — boundary with `ci-cross-platform-hardening`

There is **no deferral debt**: investigation confirmed the small-slice-now / defer-the-rest plan never wrote a
downstream edge — `ci-cross-platform-hardening`'s artifacts carry zero trace of this concern. The two WUs are
cleanly separated by identity:

- **This WU — CI cost & efficiency:** content-aware depth, the safety gate, run-cancellation, the `classify`
  extraction, and naming cleanup.
- **`ci-cross-platform-hardening` — CI hardening:** the cross-platform OS-matrix generalization + shake-out,
  fail-fast/matrix tuning (coupled to the matrix), supply-chain pinning (SHA-pin + Renovate/Dependabot), the
  `madge --circular` module-graph gate, and the separate-config-vs-globbed test-race fix (a correctness item,
  coordinated with `cli-test-hardening`).

The boundary is recorded in both drafts. The shared file is
`.github/workflows/ci.yml`; sequence the two WUs (rebase the later on the earlier) rather than overlapping edits.

## Alternatives (resolved — kept for the record)

- **Safety gate — Option A (Checks-API lookback): chosen**, refined to a run-decision in `classify` (§ B).
  Trusts the source of truth; rebase-stable; cost is `checks: read` + the in-progress path (dissolved by the
  placement).
- **Safety gate — Option B (code-tree-hash cache ledger): rejected.** Self-contained (no API/token), but PR cache
  scoping (merge-ref vs branch), eviction (7-day / 10 GB), and cross-run visibility are subtle and only live-
  verifiable — fragile for a *safety* gate, and the wrong trust model (an artifact, not the actual run result).
- **Ship Pass 2 without a gate — rejected.** This is the CodeRabbit finding; it leaves a silent merge-bypass in
  `main`. Promoting to a WU exists precisely so per-push and its safety ship together.

## Unknowns and Assumptions

- **Markdown-can't-affect-tests assumption — refined, not assumed.** It does *not* hold repo-wide: tests consume
  markdown/JSON fixtures. Resolved by the code-surface set (§ A), which counts test-affecting content as code.
- **Code-tree identity — resolved** via the code-surface path set + tree/blob hashing (§ A, § B).
- **Exact code-surface membership** is fixed and unit-tested at implementation; the set in § A is the design
  intent, refined against the real fixture dependencies if the offline tests surface a missed path.

## Scope Estimate

Medium (days). Code is the smaller half (the `classify` extraction + tree-hash lookup + `concurrency` block +
naming); the cost is live-Actions iteration across several PR/push cycles to prove the lookback — now unblocked by
restored billing. **Class `Heavy`**, floor `derivation` (the mechanism and the code-surface contract are real
design to author). Wanted before `finalize-parallelism` — consider bumping Priority from the default `P3`.

### Continuity

- **Readiness:** formalization-ready. The design space is settled; remaining specificity (exact path membership,
  final job-name strings) is detail-design for create-spec / implementation, not open derivation.
- **Resolved:** mechanism (Option A as a run-decision); canonical code-surface set driving depth + tree-hash;
  retire Pass 2's per-push delta; absorb the `concurrency` cancel-in-progress block; extract
  `scripts/classify-change.sh`; keep `merge-ok`; plain CI vocabulary; clean boundary with
  `ci-cross-platform-hardening`.
- **Open (detail-design):** final job-name strings; whether build-artifact sharing is a net win (measure).
- **Next:** `create-spec` → `generate-tasks` → implement (offline tests first) → live-verify the lookback.
