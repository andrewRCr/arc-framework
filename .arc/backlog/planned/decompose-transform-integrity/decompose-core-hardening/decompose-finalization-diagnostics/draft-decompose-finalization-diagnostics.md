# Draft: Make Decomposition Finalization Refusals Actionable

- **Origin:** [internal] — routed from `USER-INBOX § Work Unit`, housekeep drain (2026-07-30); captured across the
  first `chunked-delivery` decomposition attempts.
- **Purpose:** Preserve fail-closed finalization while making each refusal name the correct operating locus,
  differing evidence, and next action, and while preventing unrelated pre-existing repository state from blocking
  a scoped transform.

---

## Problem / Motivation

Three diagnostic classes made a correct prepared candidate difficult to finish:

1. **Hidden locus requirement.** `--finalize` reads receipt evidence from the current checkout and separately
   requires candidate `HEAD`, but the workflow and emitted command do not say where to run it. From another
   checkout the command reports `evidence-missing` and recommends re-preflight, which discards and rebuilds an
   already-correct candidate.
2. **Mismatch without evidence.** Prospective-projection refusals name a surface but provide no differing paths or
   expected/actual digests, forcing the operator to guess which edit deviated.
3. **Repository-wide gating.** Cohort consistency checks can block a scoped transform on unrelated pre-existing
   grouping defects that the candidate did not introduce and cannot repair within its reported destinations.

Two incidents from the same run are evidence only, not open scope here: retirement-aware ROADMAP validation and
the concrete missing cohort documents have since been repaired. This work must not recreate decomposition-only
projection policy that belongs to `roadmap-tooling`.

## Approach

- Make finalization locus-independent by resolving the candidate from its claim, or reject early with a typed
  `candidate-locus-mismatch` that names the expected checkout and correct command location.
- Attach differing paths or expected/actual digest pairs to every projection mismatch while retaining stable,
  machine-readable refusal codes.
- Move repository-wide consistency to its own corpus gate, scope it to transform-touched paths, or treat
  pre-existing violations as advisory while refusing only violations the transform would introduce.
- Reconcile workflow prose, emitted `next.command`, and runtime remedies as one contract.

## Unknowns and Assumptions

- Is claim-based candidate discovery authoritative enough to remove the current-checkout precondition?
- Which diagnostic details are safe and stable enough for structured output across large projections?
- Can pre-existing-versus-introduced corpus violations be derived solely from the prepared base and result?

## Scope Estimate

Medium — finalization resolution, refusal schema, workflow contract, and scoped consistency coverage.
