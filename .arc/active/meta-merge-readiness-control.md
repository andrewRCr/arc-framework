# Metadata: merge-readiness-control

| **State**     | **Owner** | **Branch**                     | **Class** | **Priority** |
| ------------- | --------- | ------------------------------ | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/merge-readiness-control` | `Heavy`   | `P2`         |

- **Cohort:** [none]
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-merge-readiness-control.md`
- **Task List:** `tasks-merge-readiness-control.md`
- **Review Rubric:** [none]

- **Current Workflow:** [none]
- **Last Completed:** Phase 5 (Task 5.1) — verification complete: Tier 3 green and all ten success criteria
  met, with the draft lock's refusal of every merge path exercised live
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** open the PR

- **PR URL:** [none]
- **Completed:** [none]

---

## Release Notes Entry

Pull requests can now be held unmergeable from the moment they open until the work is authorized to land, using
the host's own draft state. The control needs no workflow, required check, or branch-protection setup: enabling it
is a configuration edit against machinery the CLI already ships, and it refuses every merge path — web interface,
command line, and API alike — including an administrator override.

- **Added:** A `merge.lock` setting (`draft` or `none`, defaulting to `none`) and three commands that resolve how a
  pull request should open and move a live one between held and released, each answering with a typed action its
  caller follows rather than a status to interpret.
- **Changed:** The work-unit, errand, and inbox-drain lifecycles open pull requests held when the setting is
  enabled, and release only at the authorized final step, against the exact approved commit.

## Completion Notes

Delivered the draft-first merge lock described by the spec: the `merge.lock` configuration axis, the three lock
verbs behind a closed set of typed actions and refusal reasons, fire-site substitution across the work-unit,
errand, and drain lifecycles, and the host-side cutover that retired the `arc-cleared` producer and its required
status together. `ADR-031` records the mechanism change and `ADR-029` carries the amendment narrowing its
predecessor.

Two material corrections came out of review rather than implementation. The release path was returning
`already-in-state` before its lifecycle-readiness gate could run, so a pull request someone had already marked
ready skipped readiness entirely; closing it prompted restructuring the path into three explicit obligations —
bind the live target at the exact head, gate the candidate, settle the lock state — because the ordering had been
accidental rather than chosen. Separately, the verb contract was overstating what a release provides: draft is a
property of the pull request rather than of a commit, so a release reports that the lock came off and never that
it came off for one head. That contract is now stated at all three fire sites, and head safety is enforced where
it can be, at the head-matched merge.

Verification exercised the mechanism live rather than deferring it. A throwaway fixture pull request against a
disposable base established that draft state refuses `gh pr merge`, the same command with `--admin`, the REST
merge endpoint, and auto-merge arming, then merges only on the exact approved head once released and re-locks on
demand — the administrator-refusal claim had until then rested on a research pass. Host-side teardown was
confirmed against the live API: classic protection returns 404 and the ruleset alone protects the base with
`merge-ok` as its sole required check. Final gates passed Markdown and ARC contract linting, TypeScript and shell
linting, both typechecks, build, and 9,599 tests in 734 files with one intentional skip.

One criterion could not be closed before merge. The renamed lane-classification context cannot post until this
change is itself the base branch, because the workflow resolves from the base rather than the head — so it stays
read-verified here and becomes observable on the next pull request opened after this lands.

---
