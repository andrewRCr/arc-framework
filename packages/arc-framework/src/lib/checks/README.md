# Repository content checks

This library resolves project declarations into content-based check requests. Command orchestration and process
adapters live in [the check handlers](../../handlers/check/).

- `declaration.ts` defines the typed configuration; `request.ts`, `resolve-request.ts`, and `selection.ts` establish
  scope, checked content, and input reach. `gates.ts` assigns gate membership and result kind.
- `tree.ts`, `matching.ts`, and `merged.ts` read Git content. `index-view.ts`, `divergence.ts`, and `fixers.ts` preserve
  the event's index view and distinguish checked content from worktree rewrites.
- `key-resolver.ts`, `key.ts`, and `record.ts` publish disposable successful-execution shortcuts keyed by content
  and runtime fingerprints. Unavailable observations never authorize reuse.
- `batching.ts` bounds literal argument lists. `forecast.ts` describes native invocations and shard expansions;
  `reports.ts` retains full logs and measured costs, and `remedies.ts` names work-preserving retries.
