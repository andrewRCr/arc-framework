# Notes: user-notes-retention

## Scope & sequencing

- Scope estimate: **Large** — three phases, each independently shippable (A is days-scale; B is the body; C is a
  bounded design + mechanism). Coherence + retention scope is deliberate: retention-without-coherence patches
  symptoms, so the wider cut was accepted over a retention-only unit.
- If Large proves heavy in practice, **Phase C is the natural split-out** — retention lands after coherence
  anyway, and the Phase A/B mechanisms it leans on (adopt primitive, lock/CAS discipline) ship first regardless.
- `user-sync-module-split` sequencing: Phase B touches the same files without restructuring them; whichever WU
  lands second rides the other's seams. That WU also owns the spawn-count / large-fixture perf harness — this
  WU's suite stays small deterministic interleavings.
