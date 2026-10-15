# Metadata: pull-request-surface-policy

| **State**     | **Owner** | **Branch**                         | **Class** | **Priority** |
| ------------- | --------- | ---------------------------------- | --------- | ------------ |
| `Integrating` | `andrew`  | `feat/pull-request-surface-policy` | `Heavy`   | `P2`         |

- **Cohort:** `doc-conventions`
- **Depends On:** [none]

- **Origin:** [internal]
- **Design:** `spec-pull-request-surface-policy.md`
- **Task List:** `tasks-pull-request-surface-policy.md`
- **Review Rubric:** [none]
- **Candidate:** `sha256:98fed9dfafe8cc26efbd6784f3025fb43cb08df5717665cefb62e9b66609e68e`

- **Current Workflow:** `integrate-work-unit`
- **Last Completed:** Task 4.1 — Complete verification
- **Next Task:** [none]
- **Blockers:** [none]

- **Next Action:** Resume publication at the idempotent push, then resolve or open the change request.

- **PR URL:** [none]
- **Completed:** [none]

## Release Notes Entry

Pull-request titles, bodies, and decision summaries follow one configurable policy that honors a repository's own
prescriptions.

### Added

- A configurable pull-request formatting method with content-gated sections, concise decision guidance, and
  commit-pinned design links.

### Changed

- Request creation and pushed-fix guidance share the formatting policy; qualifying commit decisions retain the
  same choice, alternative, and reason.
- Default authored descriptions omit process, provenance, and review metadata, while required project disclosures
  and templates govern their requested content.

### Removed

- The Framework pull-request template; fresh installs omit it and updates remove its managed installation.

## Completion Notes

Delivered one installed, configurable presentation policy across request creation, correction upkeep, and commit
decisions. The method preserves populated project overrides, honors host prescriptions, and distinguishes authored
titles from composed delivery titles. Retired the Framework template and reconciled the rules, decision record,
recipe, indexes, mirrored content, and regression coverage. Runtime title validation and delivery title composition
remain outside the delivered scope.

Verification covered real installation and update behavior, override preservation, legacy-template removal, method
reachability, source synchronization, and description upkeep after public delivery continuation results. All 19
selected local merge checks passed or reused after unmodified lint and unit retries; 94 focused cases, 17 fresh-install
E2E cases, and three disposable Git pin scenarios passed. The local standard review covered two complete chunks,
their seams, and the complete change set through a fresh aggregate, with no findings.

Five planned observations of real requests remain deferred with approval to andrew's post-landing sampling Errand,
"Sample pull-request formatting after the new policy lands", captured in identity-global `USER-INBOX.md`. Those
observations have not run; they await landing and the next qualifying requests under the default policy.

---
