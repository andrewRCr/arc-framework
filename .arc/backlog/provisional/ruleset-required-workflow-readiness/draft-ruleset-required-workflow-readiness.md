# Draft: ruleset-required-workflow-readiness

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-22); captured during the hosted review of
  `treat-unreported-required-checks-as-pending`.
- **Purpose:** Represent host rules that require workflows independently of named status-check contexts, so
  readiness cannot report green before every authoritative workflow requirement is satisfied on the exact head.
- **State:** Provisional — low-priority design concern; not committed to near-term sequencing.

---

## Problem / Motivation

GitHub organization and enterprise rulesets can require workflows independently of required status-check contexts.
ARC's current readiness adapter models configured context names only, so an unreported required workflow can be
misread as no requirement rather than pending.

## Direction

- Define a provider-neutral required-workflow readiness fact separate from required status contexts.
- Map GitHub's workflow-rule identity—source repository, path, and ref or SHA—to exact-head observed completion.
- Preserve pending until authoritative satisfaction and fail closed when the requirement cannot be resolved.
- Coordinate with `host-policy-evidence`; do not pull this provisional concern into that WU without a later
  sequencing decision.

## Scope Estimate

Resolve during grooming. The provider-neutral contract and host evidence mapping likely clear the design floor, but
the capture remains provisional until its practical urgency and host-support boundaries are established.

---
