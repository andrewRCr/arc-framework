# Draft: Check Gate Semantics

- **Origin:** [internal] — minted at the 2026-10-28 housekeep drain from two `USER-INBOX § Work Unit` captures: one
  from the harvest of the CineXplorer install rehearsal (2026-10-24), one from the 2026-10-27 `lint:ts:file` routing
  assessment.
- **Purpose:** Let a check declaration say when ARC runs it as increment feedback and when another check's pass
  discharges its deadline.
- **State:** provisional stub. Concern and design questions recorded; nothing is settled.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Design the gates around what each one proves: our rules, this change, `main`, a release**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-11-16).

- _Shapes:_ Design Questions, "One gate model or two fields".

- _Observation:_ ARC names its gates for Git events (commit, push, merge), with `--force` and verification scopes
  (`targeted`, `focused`, `full`) layered on, so one gate serves several purposes. In `projection-worktrees`' review
  rounds the forced merge gate ran as feedback after every `full`-scope fix set and again as convergence attestation,
  and 151 runs repeated a command on an identical tree (2026-11-12 to 11-16). The Owner shared a frame on 2026-11-16
  that separates four validations, each with its own frequency and selection: the code follows our rules (at commit,
  fast); this change works (the tests its diff reaches); everything on `main` works (a full run after merge, failures
  fixed forward); the product is ready to release (only commits with a full pass).

- _Approach:_ take the four as the draft's frame: map each gate and verification scope to the validation it proves,
  how often it runs and what it selects, and settle whether review-round feedback and a Candidate's attestation
  should share one forced gate. Neighbors: the Errand "Find why one check runs several times on identical content…"
  (its diagnosis comes first), #1350's review-fix check cadence in `code-review.md` (merged 2026-11-16), and the
  post-merge full run in "Run every retirement, teardown and park suite on hosted Windows".

- _Captured during:_ `project-manager.ARC`, from a quote on validation tiers the Owner shared, 2026-11-16.

### `[ ]` **Decide the guarantee routed check reuse rests on**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-11-16).

- _Shapes:_ the runner contract's wording, decided under the four-validations frame of the buffered "Design the gates
  around what each one proves: our rules, this change, `main`, a release".

- _Observation:_ the external check runner's adapter answers every `check/prepare` with `runtime: {kind: "unknown"}`,
  so ARC forms no reuse key for a routed check and every gate re-runs it on an identical tree; no routed check has
  written a pass record since 2026-10-26. In `projection-worktrees`' review this was 114 repeated runs. ARC looks a pass
  up only after preparation (upload, `npm ci`, build), so a hit saves execution only: 57 of those runs' 129 minutes.
  The runner's first reuse stage, as reviewed, still gives no reuse for project checks and is not deployed: an ambient
  runner cannot prove a known runtime for npm scripts or Node programs, so it qualifies only bounded Node and npm
  version queries.

- _Approach:_ two paths are open.
    - **A bounded execution profile:** immutable toolchain images and descendant containment, Linux-only, while routed
      `typecheck` runs on the Mac runners.
    - **An accepted weaker guarantee:** reuse keyed on declared inputs plus an executor toolchain manifest and a fixed
      `PATH`, as Nx and Turborepo do, amending the wording of ARC's runner contract.

- _Lean (Owner-agreed, 2026-11-16):_ a declared-toolchain tier beside the strict one, rather than the hermetic
  profile. ARC's contract sits at the hermetic end, where Bazel's remote execution sits; the TypeScript idiom (Nx,
  Turborepo, Gradle; Bazel's `--incompatible_strict_action_env`) keys on declared inputs plus toolchain versions, with
  a fixed `PATH` and a filtered environment.
    - **The identity:** declared inputs, the lockfile, the prepare and build commands, the runner's ID, a per-runner
      manifest of Node, npm, Git, shell, OS and npm configuration, a fixed `PATH` and a filtered environment. No
      cross-runner reuse.
    - **Limits:** opt-in, with the Owner explicitly accepting the residual risk. It serves ordinary gate reuse only,
      never `--force` or anything ARC attests; hosted CI and the forced gate at convergence still run fresh. The
      strict tier stays for projects that want it.
    - **Home:** wording in ARC's runner contract, decided here under the four-validations frame. The runner's first
      stage's plumbing mostly carries over.

- _Later stage (either path):_ skipping preparation on a hit. Answer `check/prepare` from a quick probe on the chosen
  runner and defer upload, `npm ci` and build to `check/run`; a miss prepares, probes again, and reports `unavailable`
  on any change. Warm dependency generations keyed by repository, executor, lockfile, toolchain, profile commands and
  the relevant environment, published atomically, each check on a private or copy-on-write copy, with disk bounded by
  bytes, count and age. Preparation was about 72 of the 114 repeats' 129 minutes.

- _Timing:_ after the portfolio deadline; the payoff is modest.

- _Evidence:_ the routed-reuse design notes and the repeated-check diagnosis, kept outside the repository.

- _Captured during:_ `primary.ARC`'s diagnosis of repeated checks, 2026-11-16; restated with `project-manager.ARC`'s
  review of the runner's reuse work the same day.

---

## Problem / Motivation

Both concerns extend the check declaration schema (`lib/checks/declaration.ts`) and gate selection
(`selectRequestChecks`, `lib/checks/gates.ts`), and both must compose with pass reuse. Designed apart, they risk two
gate models.

### Increment feedback for a check no gate selects

`strategy-quality-gates.md` § Place checks by deadline gives two arms. By default a related-tests check holds the push
gate in `files` mode, and `arc check increment` runs it. When tests read inputs no import graph shows, a whole-suite
check holds the push gate instead, and "the related-tests check has no gate and is requested by id at the increment
boundary". No shipped workflow makes that request: `process-task-loop` and `run-errand` request only
`arc check increment`, which selects commit checks, selection checks, and push-gate `files` checks. This repository
takes the second arm and covers it with its own rule (`DEV-RULES.PROJECT` § Increment feedback runs
`arc check run test:changed test:e2e:local --changed`), so the gap never shows here; a project on that arm gets no
test feedback at increments.

### A covered check at the merge gate

Gates are deadlines, so a merge gate re-checks every check due by merge against the final head, commit-deadline checks
included. That is deliberate, since passes at each commit do not prove the merged head. But when a fast commit-time
check is a subset of a later full check (same tool, same configuration, fewer files), the merge gate runs both. Here
`lint:ts:file` (commit, changed files) repeats the type-aware ESLint work `lint:ts` (merge, whole project) does. The
quality-gates strategy's only answer for a subset/superset pair is to drop the subset's gate, which does not fit when
the subset is what keeps the commit gate fast. A project with no remote pool runs both locally at every merge gate, and
"lint changed files at commit, everything before merge" is a common setup.

## Candidate Directions

- **Increment opt-in.** A declaration field that opts a check into increment (and segment) feedback, as pre-commit's
  `stages` and lefthook's per-hook commands do, so the second arm needs no project rule and this repository's increment
  recipe becomes `arc check increment`. Not every ungated `files` check: `test:integration:content` is one, and running
  the integration tier at every increment is the cost this repository's rule avoids.
- **Cover declaration.** A declaration such as `covered_by: <check-id>`: at a head where the covering check passes, the
  covered check's deadline is discharged and recorded as covered, never as a pass of its own. Per-file result caching,
  the usual alternative in Bazel- or Nx-style tools, is unsound for type-aware lint, so it does not substitute here.

## Design Questions

- One gate model or two fields: whether increment feedback and cover discharge are facets of one "when does this check
  run" declaration.
- What a cover must prove: configuration inputs and a superset of input paths.
- How a cover composes with evidence reuse, sharding (`distributed-check-shards`) and runner placement
  (`machine-check-runner`), which build their selection on the same schema.
- What a failing covering check reports for the covered one.
- Setup's check-declaration step should start from the strategy's default arm rather than copying CI, as the
  CineXplorer rehearsal's draft did by placing the whole frontend suite at push.

## Evidence

- `lint:ts:file` runs split in two: about 280 increment runs took 1–11 s, while about 70 merge or forced-gate runs took
  80–190 s, because a gate lints every TypeScript file the branch changed. `lint:ts` over the whole project takes
  40–90 s on a remote runner. Source: `costMs` per check in the `arc check` results kept outside the repository,
  such as `public-ci-cost-guidance-20261027/merge-gate.json`.
- Routing `lint:ts:file` through the machine runner instead was assessed and dismissed (2026-10-28). The day's
  profiles put a routed plan's overhead at about 20 s before its check runs, so routing would slow the commit and
  increment runs to speed up the merge-gate ones; a cover removes the merge-gate duplicate directly.

## Related

- `test-suite-contention-hardening` reworks this repository's suite selection and may move checks between gates.
- `cli-output-contract` shapes how increment results read.
- `RELEASE-GATES` lists this work unit in `gate-a-private-beta` Nice-to-have, since that is when ARC first runs in
  repositories without a remote pool.
