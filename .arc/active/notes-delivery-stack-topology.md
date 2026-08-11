# Notes: delivery-stack-topology

## GitHub native stacked pull requests — host-facts snapshot (2026-08-11)

Research snapshot grounding the § 9 linked arm; all preview-stage (public preview 2026-07-30). Re-verify against
the live surface before binding any exact API shape — the spec binds behavior and the degrade posture, not these
signatures.

- The native stack is derived from base-branch chaining; there is no separate authority object.
- `gh stack link` registers an externally-managed chain as a native stack — the ARC bridge point.
- Merges are bottom-up, atomic, contiguous-prefix only.
- Programmatic stack merges require the new asynchronous merge API; the legacy synchronous merge endpoints refuse
  stack members.
- REST Stacks API is read/write; the GraphQL surface is read-only.
- Auto-merge is unsupported for stacks (moot for ARC — every landing is attended).
- Squash and rebase merges break native stack identity tracking; merge commits preserve it (the spec's
  merge-strategy constraint).
- Cross-fork stacks are unsupported.
- Merge-queue support was still rolling out at snapshot time.

## Contribution-proof mechanics

Candidate comparisons for suffix reconciliation (§ 4): exact tree equality via `git rev-parse <ref>^{tree}`;
patch-identity via `git patch-id --stable` over `predecessor-head..member-head` before and after a rewrite.
`git range-diff` is the human-facing analogue for surfacing what a proof refusal means.

## Known recipe-drift interaction

`init-recipe.json` is the sole ship authority and has drifted before (twelve method/workflow files known-absent
at spec time). Both renames were recipe-verified in both directions during spec discovery; re-verify per region
at implementation rather than trusting the carried result, per the standing working-memory rule.
