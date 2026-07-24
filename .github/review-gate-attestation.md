# Review-gate attestation contract

Every satisfying local review mechanism applies `standard-review/v1` to the full current change set. The
attesting maintainer supplies exact base, diff-base, head, change-set, policy, rubric, and run-time bounds; local
reviewer prose is never authority by itself.

Forward attestations emit `review-gate/v2` records. Exact v1 parsing remains diagnostic and historical only; a v1
receipt cannot satisfy current policy. This checklist does not activate the dormant controller or grant merge
authority.

| Mechanism       | Rubric delivery       | Identity statement                        |
| --------------- | --------------------- | ----------------------------------------- |
| Codex CLI       | This instruction file | Maintainer-attested runtime and fresh run |
| Claude Code     | This instruction file | Maintainer-attested runtime and fresh run |
| CodeRabbit CLI  | This instruction file | Maintainer-attested runtime and fresh run |
| qualified human | This instruction file | GitHub-authenticated non-author reviewer  |

## Inputs

<!-- arc:review-guidance:start -->
### Standard Review Checklist

Rubric: `standard-review/v1` / `sha256:cea850203b3e821cc9f81563b30d01c91a2cc85832fd2edff8b4a1da7dae6295`

#### Coverage and evaluator boundary

- [ ] Review the complete exact requested change set, not a sample or only the latest fix.
- [ ] Bind the review to the exact requested target.
- [ ] Use a non-author evaluator working from source and governing project context.
- [ ] Do not provide author conclusions, preferred fixes, self-verification claims, or suspected weak spots.

#### Rubric dimensions

- [ ] Coherence and maintainability — Check whether the change remains understandable, cohesive, and maintainable.
- [ ] Correctness and failure behavior — Check normal behavior, boundary cases, and explicit failure handling.
- [ ] Intent and scope — Check that the complete change serves its stated intent without unrelated scope.
- [ ] Trust boundaries and compatibility — Check authority boundaries, unsafe inputs, and compatibility obligations.
- [ ] Verification quality and missing cases — Check that verification proves the behavior and covers material missing cases.
- [ ] Repository contract coherence — Check repository-specific instructions, package boundaries, and self-hosting contracts.

#### Finding requirements

- [ ] Actionable materiality — State the material impact and an actionable correction boundary.
- [ ] Rubric failure explanation — Explain which rubric dimension fails and why.
- [ ] Source-grounded evidence — Ground the finding in the reviewed source rather than speculation.
- [ ] Stable locus — Name a stable code or document locus for the finding.

#### Clean-result rule

- [ ] Return clean only after the complete requested change set and every rubric dimension were considered.
- [ ] Unavailable, partial, ambiguous, or failed review is never clean.
<!-- arc:review-guidance:end -->

## Output

Publish durable GitHub evidence and a bounded source-neutral manifest containing the reviewer claim, unique run id,
runtime kind/version, start/completion times, exact coverage identities, result, and evidence reference. Findings
carry manifest-minted ids, severity, concrete loci, and durable links. Explicit closures name known finding ids and
their authority; a bare thread resolution, generic approval, local transcript, or expiring link is not evidence.

The authenticated submitter is recorded separately from an agent reviewer claim. Agent evidence requires maintainer
attestation; human evidence requires the authenticated actor to be the non-author reviewer. All mechanisms produce
the same manifest shape and remain behind the same qualification boundary.

## Trigger and Finding Authority

An attestation is evidence, never permission to start an unreserved provider effect. The controller first records the
exact repository, pull request, frozen head, requirement generation, reviewer source, rubric/guidance identity, and
owned trigger. A direct provider command outside that reservation contaminates the generation and cannot satisfy it.
Only the configured GitHub actor may perform an emitted developer action, and the controller independently re-queries
the resulting GitHub event before binding it to the request.

Each finding keeps its manifest id and original GitHub conversation locus. A fix requires the authorized one-push
transition, exact new-head CI, a qualifying follow-up full-head review, a direct reply linking the verification and
follow-up evidence, and then thread resolution. Deferral and rejection require their own authorized rationale and
direct reply. Provider-owned closure is accepted only from the qualified source identity. A generic approval, broad
actor membership, reply elsewhere, or bare thread resolution is never settlement authority.

Reviewer-facing comments describe the repository change, risk, evidence, and disposition in ordinary engineering
language. Internal controller state, lifecycle labels, and process vocabulary do not carry reviewer meaning.
