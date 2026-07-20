---
name: implementation-audit
description: Medium-neutral rubric for reviewing how a change realizes its intent
override-active: false
---

# Method: implementation-audit

> - **When:** A review activity evaluates a completed change
>
> - **Contract:** Evaluate the complete requested change against all five dimensions below. Report every actionable
>   finding at a stable source locus; return a clean result only after considering every dimension across the full
>   change. This rubric defines the review lens, not the carrier, activity cycle, or evidentiary authority.

## implementation-audit.override

[No override configured]

## implementation-audit.default

Apply the same rubric whether the changed medium is code, configuration, or prose:

- **Intent and scope:** The change fulfills its stated purpose, stays within scope, and preserves required behavior.
- **Correctness and failure behavior:** Normal, boundary, and failure paths are correct; failures remain explicit and
  do not weaken invariants.
- **Trust boundaries and compatibility:** Inputs, authority boundaries, persistence, and integrations are validated;
  compatibility claims and migrations fail safely.
- **Verification quality and missing cases:** Tests or equivalent checks prove the important behavior and failure
  modes without relying on weak or circular assertions.
- **Coherence and maintainability:** Naming, structure, abstractions, and documentation form one understandable
  design without avoidable duplication or conditional sprawl.

Each finding identifies the failed dimension, materiality, stable locus, source-grounded evidence, and required
correction. A specialized rubric may extend this baseline; replacing it requires an override that supplies the
complete effective lens expected by its caller.
