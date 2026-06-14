# Draft: Lifecycle Closeout

- **Origin:** [internal] — `lifecycle-state-machine` cohort member (decomposed 2026-06-14). The
  global-consistency tail: runs only once the four prior members have landed their code + local docs.
- **Cohort:** `lifecycle-state-machine`
- **Purpose:** Leave the corpus **consistent**, not merely functional-in-parts — the cross-cutting documentation
  propagation (verb renames, vocabulary, lifecycle-workflow rewrites) concentrated into one auditable final member,
  plus the final consistency audit that certifies the shipped substrate matches the model. The realization of the
  cohort's consistency-on-exit standard.

> Shared context — the consistency-on-exit standard, the closeout criteria, and the shared model the sweep
> documents — lives in `cohort-lifecycle-state-machine.md`.

---

## Problem / Motivation

This cohort renames and reshapes verbs (`graduate → promote` + `demote`, `abandon` split out of `deactivate`,
`reopen` added, `start` becomes a full dispatch) and migrates transition mechanics to the CLI. The per-member
rule is **local consistency** — no member ships code whose own doc lags. But the *cross-cutting* sweep — the verb
renames propagated across every load-bearing doc, the lifecycle-workflow rewrites, the protection-mode ship-layer
documentation — is **global consistency**, and concentrating it in one final auditable member (rather than
scattering it) is how the cohort avoids shipping a half-migrated core whose authoritative definitions still
describe the old machine.

The rule: per-member docs update *with* their code (local); this member does the cross-cutting sweep + audit
(global). A pattern ARC has used before (the closeout doc-cascade member).

## Resolved model

### The cross-cutting documentation sweep

Propagate the cohort's verb/model changes across the durable surfaces no single member owns end-to-end:

- **`strategy-work-organization`** — the verb set, the `(phase, location)` model, the derived-state vocabulary
  (incl. the Parked render bucket), the `stub` required-fields *policy* (the contract is built in
  `lifecycle-transition-core`; the policy statement lands here), the protection-mode ship-layer framing.
- **The lifecycle workflows** — `init-work-unit`, `activate-work-unit`, `deactivate-work-unit`,
  `decompose-work-unit`, `integrate-work-unit`, `archive-work-unit`, `run-errand` — rewritten to the renamed verbs
  and the thinner judgment-only shells the CLI migration leaves (the workflow-shell boundary; coordinates with
  `composable-workflows`).
- **`DEV-RULES.ARC` / `AGENT-BRIEF.ARC`** — the verb vocabulary and any lifecycle-state language. (The errand /
  Atomic vocabulary entries are `errand-lattice`'s cascade; this member sweeps the WU-lifecycle verbs and
  reconciles the two so the combined vocabulary is coherent.)
- **Protection-mode shaping documentation** — the ship-layer property (mode shapes how a transition's commit
  lands, not the mutator bundle), the partial-relaxes-two-surfaces rule, the degrade-unknown-to-partial floor.

### The final consistency audit

The certifying pass: assert the shipped substrate matches the model — no documented-but-unbuilt transition, no
half-migrated mechanic, no doc describing the old verb set. The B1 code transition table (built in
`lifecycle-transition-core`) is the audit's mechanical instrument for the totality + encoding-consistency
invariants; this member runs the corpus-level static audit on top and is the gate the cohort's closeout criteria
key on.

## Open questions (→ create-spec)

- The exact surface inventory of the sweep (which workflow files, which strategy sections) — firms once the prior
  members' specs settle what actually changed.
- How much of the workflow-shell rewrite is this member's vs. deferred to `composable-workflows` (the markdown-tier
  fragment-cut owner) — a boundary to settle at this member's spec.
- Whether the final audit is a one-time manual pass or leaves a standing mechanical check (candidate: a structural
  guard asserting docs match the transition table).

## Dependencies

- **Cohort-internal:** `Depends On: lifecycle-state-resolver`, `lifecycle-transition-core`, `decompose-matrix`,
  `errand-lattice` — the tail; it sweeps what they shipped.
- **Forward-compat:** `composable-workflows` (the workflow-shell rewrite coordinates with its fragment-cut);
  `idiomatic-alignment` (the final verb-register check).
- **Downstream:** `finalize-parallelism` carries a `Depends On: lifecycle-closeout` edge — the lifecycle is coherent
  for its end-to-end trace once this member's audit is green.

## Continuity

- **Readiness:** formalization-ready in shape; the surface inventory is deliberately deferred to create-spec
  (it depends on what the prior members actually change), which is correct for a closeout member, not an open
  fundamental.
- **Next:** activate via `init-work-unit` Path A once the four prior members ship → `create-spec`.

---
