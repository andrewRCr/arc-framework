# Notes: Finalize Parallelism

Execution-reference context alongside `spec-finalize-parallelism.md` — sequencing/coordination and sizing that
the spec's design body doesn't carry.

## Contents

- [Sequencing & coordination](#sequencing--coordination)
- [Scope & sizing](#scope--sizing)

## Sequencing & coordination

No goal-aware-direction mechanism exists yet, so the pre-FP sequence and the still-live cross-WU coordination
edges are recorded here rather than in a tracked sequencing surface. The pre-FP dependency drain has landed
(the behind-base reconcile gate and the sweep base-ref index shipped as pre-FP errands; the `arc status <slug>`
drain-time check landed in the rules + strategy). The edges that remain live during FP's own run:

- **`roadmap-tooling` before wave 1.** Concurrent ROADMAP regens from different base states are a wave-1 surface;
  the deterministic renderer (full WU or its renderer slice — decide at pickup) must land before wave 1, and it
  also unblocks BI-4's CLI-complete `arc start` (deterministic ceremony-commit content). It slots *beside* FP
  Phases 1–2, not ahead of FP's start.
- **`interlock-release-refinement` consumes FP's burn-in evidence (post-waves).** Its parallelism-relevant slice
  (integration-time interlock-stacking collapse) either slice-extracts per its own draft, or — preferred —
  consumes this WU's evidence of which stops actually hurt under concurrency and which weren't decision-bearing
  after a trust grant. Inverted out of the hard pre-FP path; approval friction during the sacrificial waves is
  tolerable by design and never corrupts.
- **`sync-primitive-discipline` adjacency.** BI-3 ships the contained lock re-anchor; the principled
  ref-CAS-with-retry rewrite of the notes save routes here. Pull it adjacent to FP or name it a seam-audit input.
- **`graduation-cleanup` coordination.** BI-4's spawn-mode transition rework shares surface with
  graduation-cleanup's flip-time history-hygiene ceremony — coordinate or sequence at its pickup.
- **Coordination-seam captures** (the batch-errand/drain-shape seams, the same-entry-merge build home, the
  `/arc-shift` disposition) are routed at planning close via gitignored `USER-INBOX` captures, not by editing
  sibling WUs' tracked buffers from this branch.

## Scope & sizing

Large (week+), and deliberately long-*running* — the burn-in waves are calendar-gated and observational, which
is the intended rhythm, not drift. Broad cross-cohort surface carrying five committed build items alongside the
audit / verify / flip / gate core, plus the doctrine-reconciliation closeout deliverable. Size firms up once the
real seam count is visible; the matrix skeleton bounds the known surface, and the § Resolution model bounds the
cost of a discovered seam (absorb-if-atomic, else spawn a follow-up WU dependency).
