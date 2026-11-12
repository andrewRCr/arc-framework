# Notes: delivery-stack-topology

## GitHub native stacked pull requests — host-facts snapshot (2026-08-11)

Research snapshot grounding the § 9 linked arm. The official stacked-pull-request APIs are in public preview. Recheck
the live contract before implementation because the spec binds behavior and degradation, not dated endpoint shapes.

- The native stack is derived from base-branch chaining; there is no separate authority object.
- The Stacks REST API is read/write, while the GraphQL surface is read-only.
- `gh stack merge` and the asynchronous merge endpoint select one pull request plus everything below it. The request
  pins only the selected pull request's `sha`; GitHub derives the lower prefix from current host topology.
- Direct stack merge is atomic/all-or-none for the prefix GitHub selects. Merge-queue submission may split that prefix
  into separate groups and is not an atomic substitute.
- Programmatic stack merges use the asynchronous merge API. A pending response returns a UUID for polling; a `409`
  may return the existing request UUID and options, and result retention is currently documented as 24 hours.
- The endpoint accepts `merge`, `squash`, and `rebase`. The earlier statement that squash and rebase necessarily break
  native identity is not established by the official API contract; merge-only is presently an ARC policy assumption,
  not a verified host limitation.
- Auto-merge is unsupported for stacks, which does not constrain ARC because every landing remains attended.
- Cross-fork stacks are unsupported.
- `gh stack link` is not a presentation-only primitive: its porcelain may push branches, create or open pull requests,
  and correct bases. A metadata-only ARC adapter should use the narrow Stacks API rather than invoke that porcelain
  without a separately authorized projection mutation.

Primary sources captured for re-verification:

- [GitHub stacked pull request APIs and webhooks][github-stacks-api]
- [Asynchronous pull-request merge REST contract][github-async-merge]
- [`gh-stack` merge API reference][gh-stack-merge-api]
- [`gh-stack` command behavior][gh-stack-readme]

## Native-stack execution trust decision — settled (2026-08-11)

Decision: the § 9 linked arms adopt the host-idiomatic trust model. Exact-set authorization is an ARC/operator
validation property — the complete expected remainder (order, bases, change requests, heads) derives from validated
plan/state plus fresh host observation and must match the observed host stack exactly at arm selection, reservation,
and pre-submit reobservation — while the server request pins only the selected top head and the host atomically
applies the currently registered prefix under its own protection re-evaluation. Adoption accepts only the exact
authorized all-landed result. The earlier encoding demanded that the API contract enforce the complete submitted
exact-head set server-side; no full-set compare-and-set exists in the public contract, so that posture yielded an
unsupported arm rather than a safer one — the real choice was arm-with-disclosed-race versus no arm at all.

### Rationale

- **Consistency, not weakening.** Ordinary single-PR integration pins one reviewed head and trusts host protections
  and atomic execution, and the unlinked delivery path handles cross-landing drift by observe-and-refuse. The
  grouped arm now applies the same posture at set cardinality; the stricter reading minted a distributed-transaction
  contract appearing nowhere else in ARC, against a platform that cannot satisfy it.
- **Chartered threat model.** Accidental agent error plus ordinary single-operator concurrency. Adversarial
  collaborator mutation at the host is unchartered (cohort non-goals, single attended operator) and was not
  defended by the stricter posture elsewhere either.
- **Residual race — disclosed, not closed.** No stack-generation or full-member compare-and-set token exists, so a
  lower member, head, or relationship can change between final client observation and the server-side prefix
  snapshot. Post-effect observation detects and blocks reconciliation but cannot undo an applied prefix. Exposure
  narrows to heads independently passing the repository's protection rules and scales with that configuration (for
  example, stale-approval dismissal). The atomic arm concentrates irreversibility relative to sequential landing —
  so the disclosure lives in the interlock text itself, and sequential unlinked landing remains the default and
  the decline path at every layer.

### Settled positions

1. The single-bottom linked arm shares the same model: a singleton pinned-head merge, degenerate to ordinary
   integration trust — no special casing.
2. The all-remaining arm is explicit opt-in per invocation; unlinked sequential remains the default at every layer.
3. Merge-commit-only is v1 ARC policy, not a host limitation — the official contract does not establish that
   squash or rebase break stack identity; their interaction with § 4's contribution proof is unverified, and
   widening waits on primary-source evidence.
4. Registration uses the narrow raw Stacks API; `gh stack link` porcelain may push branches, open pull requests,
   and correct bases — mutations outside the presentation-only carve-out.
5. Settled at the whole-WU proportionality re-read: the native adapter stays in v1. It is fully planned, completes
   the work unit, and stacked delivery bounds its review cost; self-application against the live preview supplies
   the adapter pattern's first field evidence. The deferral option (unlinked is complete on its own; the arm is the
   WU's only preview-API dependency) was weighed and declined.

## Contribution-proof mechanics

Candidate comparisons for suffix reconciliation (§ 4) pin before/after predecessor and member heads/trees. Compare
the complete before/after member trees first. When they differ because the parent changed, acquire a canonical
aggregate, whitespace-preserving patch identity for `before-predecessor..before-member` and
`after-predecessor..after-member`, including binary, rename, and mode changes; refuse malformed, unavailable, or
non-linear evidence. Commit ordering is not an identity input when the aggregate contribution remains exact.
`git range-diff` remains the human-facing analogue for explaining a proof refusal, not the authoritative comparator.

## Known recipe-drift interaction

`init-recipe.json` is the sole ship authority and has drifted before (twelve method/workflow files known-absent
at spec time). Both renames were recipe-verified in both directions during spec discovery; re-verify per region
at implementation rather than trusting the carried result, per the standing working-memory rule.

---

[github-stacks-api]: https://docs.github.com/en/pull-requests/reference/stacked-pull-requests-apis-and-webhooks
[github-async-merge]: https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request-asynchronously
[gh-stack-merge-api]: https://github.github.com/gh-stack/reference/merge-api/
[gh-stack-readme]: https://github.com/github/gh-stack
