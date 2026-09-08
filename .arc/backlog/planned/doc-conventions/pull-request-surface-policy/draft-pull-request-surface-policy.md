# Draft: Pull-Request Surface Policy

- **Origin:** `USER-INBOX § Errand`, housekeep drain (2026-08-20).
- **Cohort:** `doc-conventions`
- **Purpose:** Define pull-request title and local-review marker conventions from their actual reviewer and history
  roles rather than from incidental workflow proxies.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Generate the host-side pull-request template from the canonical template**

- _Routed from:_ `USER-INBOX § Errand`, housekeep drain (2026-09-07); captured during
  `delivery-native-stack-composition` dogfooding.
- _Concern:_ repository-host PR creation still permits an empty or divergent description when the contributor does
  not enter through an ARC workflow. Establish a generated host template from the canonical ARC template so the
  ordinary host surface carries the same reviewer contract without becoming a second hand-maintained authority.
- _Fold-in:_ settle generation and drift enforcement with this WU's broader PR-surface policy, including the lean
  Errand and grooming-PR exceptions.

## Problem / Motivation

The canonical pull-request template universally requires Conventional Commits syntax for PR titles even though
ARC defaults to merge commits and validates the preserved commits themselves. The proxy is valid when a merge mode
promotes the PR title into history, but otherwise conflates review metadata with commit metadata.

The local-review marker has the complementary problem: a bare `Local` label renders a multi-pass, chunked,
seam-covered campaign identically to a single bounded pass, and names a harness where the reviewer model is the
capability-bearing identity.

## Direction

- Derive title guidance from reviewer navigation, configured merge strategy, and any downstream consumer that
  promotes or parses the title.
- Decide whether a readable work-unit slug belongs in ordinary and stacked PR titles, accounting for external
  readers, rename stability, private design storage, and ARC's public-surface boundaries.
- Content-gate any `Design` field by whether intended reviewers can actually resolve the referenced artifact.
- Define a small fixed local-review activity vocabulary over reviewer model plus activity shape, without outcome,
  finding, disposition, or clearance claims.
- Reconcile the canonical template, integration workflows, errand lane, and validation coverage without weakening
  commit-format enforcement.

---
