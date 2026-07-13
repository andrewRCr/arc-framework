# Review-gate attestation contract

Every satisfying local review mechanism applies `independent-analysis/v1` to the full current change set. The
attesting maintainer supplies exact base, diff-base, head, change-set, policy, rubric, and run-time bounds; local
reviewer prose is never authority by itself.

| Mechanism | Rubric delivery | Identity statement |
| --- | --- | --- |
| Codex CLI | This instruction file | Maintainer-attested runtime and fresh run |
| Claude Code | This instruction file | Maintainer-attested runtime and fresh run |
| CodeRabbit CLI | This instruction file | Maintainer-attested runtime and fresh run |
| qualified human | This instruction file | GitHub-authenticated non-author reviewer |

## Inputs

- The exact full current change set from diff base through head.
- `independent-analysis/v1`: intent and scope; correctness and failure behavior; trust and compatibility;
  verification; coherence and maintainability.
- Project orientation, applicable development rules, and the authored design for the reviewed work.

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
