# Draft: Check Gate Semantics

- **Origin:** [internal] — minted at the 2026-10-28 housekeep drain from two `USER-INBOX § Work Unit` captures: one
  from the harvest of the CineXplorer install rehearsal (2026-10-24), one from the 2026-10-27 `lint:ts:file` routing
  assessment.
- **Purpose:** Let a check declaration say when ARC runs it as increment feedback and when another check's pass
  discharges its deadline.
- **State:** provisional stub. Concern and design questions recorded; nothing is settled.

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
  40–90 s on a remote runner. Source: `costMs` per check in the `arc check` results under `.arc/user/andrew/.internal/`,
  such as `public-ci-cost-guidance-20261027/merge-gate.json` (checkout-local).
- Routing `lint:ts:file` through the machine runner instead was assessed and dismissed (2026-10-28). The day's
  profiles put a routed plan's overhead at about 20 s before its check runs, so routing would slow the commit and
  increment runs to speed up the merge-gate ones; a cover removes the merge-gate duplicate directly.

## Related

- `test-suite-contention-hardening` reworks this repository's suite selection and may move checks between gates.
- `cli-output-contract` shapes how increment results read.
- `RELEASE-GATES` lists this work unit in `gate-a-private-beta` Nice-to-have, since that is when ARC first runs in
  repositories without a remote pool.
