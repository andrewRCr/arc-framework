# Draft: adopter-content-aware-ci

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-01); captured during
  `ci-content-aware-depth` create-spec, while naming the dev-repo CI `classify` outputs.
- **Purpose:** Generalize the dev-repo's content-aware CI depth split into something adopters can use — a
  built-in adaptable/templated feature, or at minimum a recommended recipe — so docs/non-code changes don't pay
  for full code CI, without assuming in-repo markdown is always the dominant cost.

---

## Problem / Motivation

ARC-adopting repos carry heavy in-repo markdown commit/PR volume (planning artifacts, strategies, docs), so the
"docs/non-code changes pay for full code CI" waste that motivates `ci-content-aware-depth` (the dev repo's own
CI) generalizes to adopters.

## Scope

Open between a shipped/templated feature and adopter-facing guidance only. **Load-bearing framing caveat:** per
`strategy-storage-evolution` (the arc-backend direction), in-repo tracked markdown won't always be the dominant
case — design state may materialize from a separate git backing store — but in-repo tracked artifacts will
always remain an *option*. So any feature/guidance must be **optional / conditional** on the repo actually
carrying significant tracked-markdown CI cost, never assumed.

## Approach

Generalize the `ci-content-aware-depth` mechanism — the canonical code-surface path set, the depth gate, the
Checks-API safety lookback — into a reusable shape; that WU's dev-repo implementation is the reference/source
for whatever adopter-facing form this takes.

## Scope Estimate

Medium — depends on the feature-vs-guidance cut; the dev-repo mechanism already exists as the reference.
