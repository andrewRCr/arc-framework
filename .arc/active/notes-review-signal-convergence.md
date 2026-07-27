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

## PR-Size Evaluation and Planning Pause

Task generation paused after the high-depth structural decomposition on 2026-07-27. The first-pass skeleton exposed
26 substantive parent tasks, including 11 parents whose expected leaf count was `many`. That prompted a dedicated,
read-only PR-size evaluation before content fill.

### Estimated diff

The estimate counts raw PR churn as additions plus deletions:

| Surface                                      | Low    | Likely  | High    |
| -------------------------------------------- | ------ | ------- | ------- |
| Severity and judgment model                  | ~900   | ~1,950  | ~3,400  |
| Execution, result, and convergence substrate | ~3,500 | ~5,750  | ~9,200  |
| Lane choreography and adversarial contract   | ~1,800 | ~3,200  | ~5,800  |
| Final planning artifacts                     | ~1,500 | ~1,800  | ~2,300  |
| **Total raw PR churn**                       | ~7,700 | ~12,700 | ~20,700 |

The current tracked planning branch already carries 949 changed lines before a completed task list. After
deduplicating mirrored methodology and excluding generated-only churn, the likely conceptual authored change remains
approximately 8,000 lines. The estimate is therefore not an artifact of two-copy methodology or schema generation.

The strongest sizing signal is the execution/result/convergence substrate: its likely raw diff exceeds the 5,000-line
PR ceiling by itself. Existing review architecture changes provide compatible calibration: PR #224 landed at 14,878
raw changed lines and PR #226 at 11,737. Their exact scope differs, but both confirm that this class of record,
runtime, workflow, and test change routinely reaches five figures.

### Decision

Do not continue content fill or implementation in the current shape. `generate-tasks` already resolved at `high`, so
the scale discovery cannot be answered by a deeper planning pass. The work requires either:

1. preferred: spec-level decomposition into independently coherent work units; or
2. fallback: chunked delivery with independent PR boundaries that keep every review target below 5,000 changed lines.

The structural task skeleton is retained in `tasks-review-signal-convergence.md` as decomposition input. The active
meta keeps `Task List: [none]` while the delivery topology is blocked, so the undivided WU does not present as
implementation-ready.

### Candidate decomposition

The least-coupled four-member topology found during sizing is:

1. **Judgment provenance** — severity vocabulary, reported-versus-verified disposition fields, faithful presentation,
   and agent-managed `withstood` / convergence / cap semantics.
2. **Result binding** — logical-pass and scope execution identity, generalized result records and stores, and hosted
   terminal-result persistence.
3. **Convergence evidence** — operation-bound attempts, producer/disposition validation, verified-severity derivation,
   and runtime response-plan / target-movement handling.
4. **Lane choreography** — integration and Errand ordering, early approval of complete disposition sets,
   outstanding-response handling, and workflow contract tests.

Three members are not a safe default: combining convergence evidence with lane choreography is likely to cross the
same PR-size ceiling again. These boundaries are provisional inputs to the decomposition machinery, not committed
child-WU identities; re-run its integrity checks over the settled spec and structural task skeleton rather than
hand-materializing this cut.

The decomposed members inherit their design and executable-plan slices from the current spec and task skeleton. They
do not re-enter draft or spec authoring unless the decomposition integrity pass finds a concrete design defect or an
unresolved cross-member authority seam.

### Blocker and resume condition

Primary blocker: `decompose-transform-integrity`. Decomposition is preferred because it gives each concern its own WU
identity, spec authority, dependency edge, and lifecycle rather than treating delivery topology as an afterthought.

Alternate unblocker: `chunked-delivery`, if it lands first and can provide independently reviewable PR boundaries
without weakening exact-target review evidence. Stacked delivery is acceptable as a way to avoid waiting, but remains
second choice to proper decomposition.

Resume when either mechanism lands. If both are available, use `decompose-transform-integrity`. On resume:

1. re-probe both mechanisms' landed contracts rather than relying on this notes file for their invocation details;
2. run the decomposition integrity path over the current spec, retained task skeleton, and candidate cut above;
3. materialize each child from its settled design and task slices without restarting the planning pipeline;
4. re-estimate each resulting PR, including its planning artifacts, against the 5,000-line ceiling; and
5. proceed only after every member has a credible sub-ceiling delivery boundary.

---
