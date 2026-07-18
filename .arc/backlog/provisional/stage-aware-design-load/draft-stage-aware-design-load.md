# Draft: stage-aware-design-load

- **Origin:** [internal] — `USER-INBOX § Work Unit`, housekeep drain (2026-07-18); captured during the
  sidecar-discovery session's concurrency-guidance re-evaluation.
- **Purpose:** Grade ARC's design-load model by lifecycle stage — remaining design load = `Class` ×
  stage-decay — across `assess-parallel-fit`, the concurrent-work doctrine, and the probe's
  `inFlightComposition`, so concurrency guidance reads *remaining* rather than *intrinsic* load.
- **Commitment note:** provisional by design — the decay curve calibrates against parallelism dogfooding before
  codifying (the observation base was one operator-week old at capture).

---

## Problem / Motivation

Post-parallelism-GA dogfooding shows the attention/judgment cost of a Heavy/Novel WU is strongly front-loaded
and decays over the lifecycle: draft-design is the peak, create-spec still high, generate-tasks a noticeable
step down, impl near-free (given sound preceding stages), verification/integration a small kick back up.
`Class` records intrinsic weight; the concurrency-budget question is *remaining* weight. The binary
design-settled gate over-guarded a board whose Heavies were past spec — the settle-at-spec interim fix
(PR #285, 2026-07-18) moved the settle point to spec finalization, but the full ordinal decay model, and the
machinery that reads it, remain open here.

## Scope

- Codify the ordinal decay curve in `assess-parallel-fit` § Design-load read; align the concurrent-work
  doctrine strategy it co-anchors.
- Make the probe's `inFlightComposition` stage-aware so the session-init concurrent-workload advisory reflects
  remaining load (CLI piece — coordinate with `wu-lifecycle-state-model`, whose `State` vocabulary supplies the
  stage distinctions and which carries the slug-status stage / verb-gap buffer note).
- Calibrate the curve against accumulated multi-WU dogfooding evidence before shipping.

## Dependencies / coordination

- `wu-lifecycle-state-model` — stage vocabulary + slug-status stage reporting (buffer note routed 2026-07-18).
- `session-locus-model` — soft seam: locus/attention records as the eventual live substrate for stage-aware
  reads (buffer note routed 2026-07-18).
