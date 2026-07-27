# Notes: Review Signal Convergence

## Empirical Context

On 2026-07-24, three false claims survived two independent fresh-context review passes under `withstood` and were
relayed on the strength of that label before source verification refuted them. The reviewers' cited facts were true;
the inferences drawn from those facts were false. This established that the defect was in how the primary consumed
the signal: "examined with no finding" had been treated as "cleared."

The incident supports retaining `withstood` as an attention signal while explicitly denying it correctness or
clearance authority. It also supports the claim-type risk gradient in the spec: externally verifiable statements
about source, behavior, or a diff warrant spot-checking before relay, while a reviewer's internal judgment about what
it found coherent is not independently verifiable.

## Cap-Boundary Rationale

The configured pass cap bounds the automatic effect of convergence. At `Light`, a one-pass cap ends the automatic
loop after the first pass regardless of convergence; at higher classes, a material finding can buy a bounded fresh
verification pass. A fix made on the final permitted pass remains an acknowledged final-fold residual, answered by
the planning workflow's post-settle in-context coherence re-read unless the operator explicitly authorizes another
fresh pass.

---
