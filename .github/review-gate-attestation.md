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
