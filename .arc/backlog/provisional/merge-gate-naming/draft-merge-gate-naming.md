# Draft: merge-gate-naming — reconsider the `merge-ok` required-check name

- **Origin:** [internal] — routed from the `merge-ok-error-naming` errand (2026-07-07); the "reconsider the
  name" half of the `USER-INBOX § Errand` capture _Improve the CI `merge-ok` rollup: name the failing job,
  reconsider the name_. The error-message-diagnosability half shipped in that errand; this stub carries only the
  name reconsideration.
- **Purpose:** Decide whether to rename the `merge-ok` required-status-check convention to one that reads as
  "required CI passed" rather than "approved to merge" — and, if so, execute the rename across the shipped
  merge-gate recipe, the work-organization strategy, the setup workflows, this repo's own CI, and GitHub branch
  protection.

---

## Problem / Motivation

`merge-ok` misleads: a green `merge-ok` means the required CI rollup passed, not that the PR may merge — on the
reviewed lane a CODEOWNERS review is still required before merge. The name reads as a merge verdict when it is
only a CI-status rollup. This surfaced during the same review that produced the error-message fix.

## The decision (open — provisional until made)

Three live outcomes:

- **Rename to `ci-ok`** — reads as "required CI passed," the accurate assertion. Front-runner if we rename.
- **Rename to `all-green`** — candidate, but slightly less precise (implies all checks, including non-required).
- **Keep `merge-ok`** — it is an established, documented convention that adopters may already require by name in
  their own branch protection; renaming churns their setups and mental model. The shipped `merge-gate/README.md`
  can instead clarify that green means "required CI passed," not "approved to merge." A one-line doc fix, no
  cascade.

Recommend settling `ci-ok`-vs-keep before scoping execution — the answer decides whether any of the cascade
below runs at all.

## Blast radius (only if we rename)

Shipped / adopter-facing — two-copy, so edit the package source and sync to `.arc/`:

- `reference/templates/arc/merge-gate/README.md` — the gate snippet plus "the one check to mark Required in
  branch protection"
- `reference/templates/arc/merge-gate/CODEOWNERS`
- `reference/templates/arc/README.md`
- `reference/strategies/arc/strategy-work-organization.md` — the recipe text ("call it `merge-ok`")
- `system/workflows/arc/initial-setup/01_verify-and-configure.md`
- `system/workflows/arc/supplemental/setup-merge-gate.md`

Internal-facing:

- `reference/TECHNICAL-OVERVIEW.md`
- `reference/adr/adr-021-introduce-errand-work-class.md` — confirm whether the mention is load-bearing or
  incidental before editing an ADR
- backlog drafts that reference it (`quality-gate-hooks`, `agile-parallelism` cohort) — update on touch, low
  stakes

This repo's own CI plus out-of-band:

- `.github/workflows/ci.yml` — job id, display `name:`, and the success-echo string
- GitHub branch protection required-status-check — out-of-band, via `gh api`; not a file in the repo

## Sequencing hazard — branch-protection self-gating

`main` branch protection currently requires a check named `merge-ok` (full enforcement, `enforce_admins` on).
The moment a rename PR changes the job name, that PR reports `ci-ok` and the required `merge-ok` never arrives —
so the rename PR cannot satisfy its own required check and cannot merge. Any execution plan must stage the
branch-protection swap around the merge, coordinated with a maintainer at merge time:

1. Land the workflow rename on a branch. The new-named check reports on that branch's runs.
2. Before merging, update branch protection to require the new name and drop the old (`gh api`), so the PR's new
   check satisfies protection.

Alternative — a transitional alias: keep a thin `merge-ok` job that always passes (or `needs: ci-ok`) for one
release window so adopters and existing branch-protection configs migrate without a hard break. Weigh the
migration smoothness against the cost of shipping an alias that itself later needs removing.

## Scope estimate

Small–Medium. The edits are mechanical (find/replace across ~10 files in two copies), but the real weight is the
branch-protection sequencing and the adopter-migration call — which is why this stays provisional until the
rename-vs-keep decision is made.
