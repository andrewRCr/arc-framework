# Draft: Constructed-Fixture Verification Evidence

- **Origin:** `USER-INBOX § Work Unit`, housekeep drain (2026-08-10); surfaced during
  `merge-readiness-control` verification.
- **Purpose:** Define when a bounded constructed fixture can provide live-host evidence for a success criterion
  without becoming self-attestation or mutating production state.

---

## Problem / Motivation

The delivery-integrity verification path currently presents a false binary when a criterion requires live host
evidence: prove it against existing production state or defer it. A deliberately constructed, bounded fixture can
sometimes exercise the real host and contract directly, but the methodology does not license or constrain that
middle path.

A fixture is evidence only when its construction is independently checkable and the observed behavior comes from
the real boundary under test. It is not appropriate when the setup would alter shared production state, carry a
large blast radius, or encode the expected answer into the fixture itself.

## Direction

- Add a third verification arm gated on constructibility, reversibility, bounded blast radius, and use of the real
  host or authority boundary.
- Require the fixture recipe, observed result, and cleanup evidence to be inspectable separately from the claim it
  supports.
- Define when fixture construction itself needs review or operator authorization.
- Keep justified deferral available when no safe, representative fixture can be built.

## Commitment Boundary

This remains provisional until the constructibility and authority tests are sharp enough to prevent fixture-shaped
self-attestation.

---
