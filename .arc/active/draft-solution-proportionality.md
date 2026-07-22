# Draft: Solution Proportionality

- **Origin:** `USER-INBOX § Work Unit`, routed at the 2026-07-21 housekeep drain from decomposition-program
  grooming.
- **Purpose:** Add a planning-time check that the proposed solution is justified by the chartered problem before
  adversarial review, task generation, and verification ratify an unnecessarily large design.

---

## Problem / Motivation

ARC's planning instruments are asymmetric: they search for missing coverage and under-delivery, but no existing
instrument asks which design elements the motivating problem does not justify. Overdesign can therefore pass every
gate and surface only when implementation effort exceeds the plan grain.

The guard must be model-agnostic and artifact-level. It should express the carrying cost of unnecessary machinery,
not encode assumptions about any current model's tendencies.

## Candidate Direction

1. Add a minimal-credible-alternative slot to the spec form: state the smallest solution that resolves the problem
   and justify the proposed design's additional machinery.
2. Add an excess dimension to planning-stage adversarial rubrics: identify elements unsupported by the charter.
3. Read materialized task-generation scale for proportionality before decomposition. Shrink before split; otherwise
   decomposition institutionalizes excess across several work units.

Coordinate the ex-ante baseline with `planning-iteration-mechanics`' appetite/continuation tripwire and with
`decomposition-doctrine`'s later split reading. Grooming decides whether the in-flight appetite half remains a
separate owner or shares one wrapper and baseline with this WU.

## Scope Estimate

Crosses spec forms, adversarial review fire sites, and generate-tasks ordering. Resolve `Class` after the shared
baseline and wrapper boundary are decided.

---
