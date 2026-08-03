# Draft: Merge Readiness Control

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-08-03 housekeep drain after the
  `decompose-planning-lane` verification exposed the required-status producer-identity limit.
- **Purpose:** Establish a proportionate host-side control for ARC pull-request merge readiness across the whole
  delivery lifecycle, with explicit exact-head, failure, recovery, review, and auto-merge behavior.

---

## Problem / Motivation

`arc-cleared` primarily guards against an agent or human accidentally merging a pull request that ARC has not
declared ready. It is not intended to defend against a hostile status writer. The decomposition planning-lane
ownership exception exposed a larger producer-identity problem: a required status can bind to the GitHub Actions
App family, but not to one exact workflow, while a dedicated App or organization-level required-workflow adapter
appears disproportionate to the accidental-action threat.

The control should therefore be selected from the intended threat model rather than preserving `arc-cleared` by
default or replacing it solely because its strongest producer binding is unavailable.

## Decision Surface

- Define the intended merge-readiness threat model and the host guarantee ARC needs.
- Compare the existing required-status design with a draft-first pull-request lifecycle: create PRs as Draft,
  retain Draft through review, CI, composition, and base reconciliation, then invoke `gh pr ready` only after the
  exact-head integration interlock authorizes merge.
- Define the terminal ready-to-merge window, including interruption, retry, and rollback via
  `gh pr ready --undo` where appropriate.
- Decide how native auto-merge composes with Draft state and exact-head `--match-head-commit` protection.
- Audit human review requests and hosted review providers before assigning Draft the additional meaning of ARC
  merge readiness; GitHub conventionally uses Draft to mean "not ready for review."
- Decide whether `arc-cleared` is replaced, retained, narrowed, or layered with another control only after the
  threat model and lifecycle behavior are settled.

## Scope

Treat merge readiness as one cross-lifecycle contract spanning work units, Errands, lifecycle and grooming PRs,
review-provider behavior, integration recovery, auto-merge, CODEOWNERS exceptions, and the existing
`arc-cleared` setup and unlock surfaces. Preserve exact-head authorization as a separate invariant regardless of
which host control is selected.

---
