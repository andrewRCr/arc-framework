# Draft: ci-content-aware-depth

- **Origin:** [internal]
- **Purpose:** Make CI cost follow the *content* of a change rather than its merge-lane — docs/markdown work
  should not pay for the full code test matrix — and make the per-push optimization *safe* so a docs-only
  follow-up push can never let unverified code merge.

---

## Problem / Motivation

CI spend is too high for the value delivered, and it is about to get worse:

- **Docs pay for code CI.** Before this WU, any non-planning-artifact change — including pure markdown
  (`.arc/system/**` prose, READMEs, strategies) — classified as `reviewed` lane and ran the full matrix:
  `Quality Checks` (build/ts/typecheck/unit), `Full Test Suite` (integration/e2e), and the 3-OS `Portability`
  matrix. Observed live on PRs #153 and #154 (pure markdown) running the entire suite.
- **Per-push waste on code PRs.** Code WUs *commonly* receive markdown-only follow-up pushes (e.g.
  `archive-work-unit` does this every time, plus handoff/doc tweaks). Each such push re-ran the full matrix
  because `pull_request` path filters evaluate the cumulative `base...head`, not the latest push.
- **Acute trigger:** the repo's GitHub Actions account is currently **billing-blocked** (spending limit hit /
  payment failed — jobs refused to start, run `28452133865`). The very spend this WU reduces is what tripped the
  cap. *Live CI is blocked until billing is restored* — which gates this WU's verification phase.
- **About to compound:** `finalize-parallelism` (next WU) raises PR cadence via worktree-based concurrent work,
  multiplying CI minutes right when the budget is already strained.

### What has already landed on this branch (committed, NOT yet live-verified)

Promoted from an errand; two commits are preserved and considered provisional until CI can actually run them:

- **Pass 1 (`bab51166`) — content-aware depth.** `classify` now emits two independent axes: `lane` (merge policy,
  unchanged) and `depth` (light/heavy). `depth=light` iff every changed file is `*.md`, else heavy; computed per
  event, **fail-safe to heavy** on unverifiable SHAs / empty diff. `Quality Checks`' code steps and the
  `Full Test Suite` / `Portability` jobs gate on `depth != 'light'`; the doc/ARC linters always run. `merge-ok`
  (the single required check) is unchanged and skip-tolerant. Predicate validated locally against 10 path sets
  (had to bypass a sandbox `grep`→`ugrep` wrapper).
- **Pass 2 (`97b5d299`) — per-push depth.** On `synchronize`, `depth` is computed from the latest-push delta
  (`event.before..after`) rather than the whole PR, so a markdown-only push onto a code PR runs light. `lane`
  stays computed from the whole PR. Force-push (non-ancestor `before`) / unresolvable SHAs fall back to the whole
  change (fail-safe to heavy). Git plumbing validated against real repo commits.

### The open problem this WU must solve (the reason it's a WU, not an errand)

Pass 2 is **unsafe on its own** — CodeRabbit flagged it (major): a code PR can go light after a docs-only commit,
so `Quality Checks` code steps + `Full Test Suite` + `Portability` skip and `merge-ok` accepts the skipped needs.
The head SHA can thus merge having never run the code suite. Safe *in practice* (markdown can't change test
outcomes; code was tested on its own push; reviewed-lane requires human/CR sign-off) but it is a genuine silent
merge-bypass for the case where the code push was red/incomplete and a docs push masks it.

**Required invariant:** a PR must not merge unless `Full Test Suite` + `Portability` succeeded for the PR's
**current code tree**. Since docs pushes don't change code, "current code" = the last code-touching commit's tree.

## Alternatives

For the safety gate (the core design decision to resolve in `draft-design`):

- **Option A — Checks-API lookback in `merge-ok`.** When a run is light *and* the PR cumulatively contains code,
  walk the PR's commits, find those whose code-tree matches the head's code-tree, and require a successful
  `Full Test Suite` + `Portability` check-run on at least one. Trade-offs: explicit/inspectable logic; needs
  `checks: read` permission; ~40-60 lines bash+`gh`; must handle "run still in progress" and squash/rebase SHA
  changes.
- **Option B — code-tree-hash cache ledger.** On heavy success, write an Actions cache keyed by the code-tree
  hash (`heavy-ok-<hash>`); a light `merge-ok` requires the key present, fail-closed if absent. Trade-offs:
  self-contained (no API/token); but PR cache *scoping* (merge-ref vs branch), eviction (7-day / 10GB), and
  cross-run visibility on the same PR are subtle and only verifiable live.
- **Rejected — ship Pass 2 without a gate.** This is the CodeRabbit finding; leaves a silent merge-bypass in
  `main` during the interim. Promoting to a WU exists precisely so per-push and its gate ship together.

## Unknowns and Assumptions

- **Live-verification is the dominant cost and is currently blocked.** A cross-run CI gate cannot be unit-tested
  locally; validating cache scoping / API behavior / fail-closed edges needs real PR+push sequences — and CI is
  billing-blocked right now. Restoring billing is a prerequisite for the implementation/verification phase.
- **Code-tree identity:** assumes "code paths" can be cleanly defined (`packages/**`, `.github/**`, scripts,
  config) and hashed (e.g. `git rev-parse HEAD:packages` + others). Needs confirming.
- **Edge contract to design either way:** first push, in-progress heavy run, cache eviction, squash/rebase SHA
  changes, force-push — each needs a deliberate, tested fail-closed path.
- **Assumption:** markdown changes can never affect code test outcomes (the basis for per-push safety). Holds for
  this repo's structure; worth a sanity check that no test reads markdown.

## Scope Estimate

Medium (days). Code is ~half a day; the cost is the live-Actions iteration across several PR/push cycles —
**gated on GitHub Actions billing being restored.** Class `Heavy`, floor `derivation` (the mechanism choice is a
real design to author). Wanted before `finalize-parallelism` (consider bumping Priority from the default P3).

### Next session

1. Resolve the mechanism (Option A vs B) and the edge contract.
2. `create-spec` → `generate-tasks` → implement.
3. Live-verify once billing is restored; only then is Pass 2 trustworthy.
