# Draft: Meta-Mutation Staging Contract

- **Origin:** [internal] — captured after a create-spec ceremony dropped an unstaged meta update.
- **Purpose:** Make ceremony-owned meta mutations land reliably with their ceremony commit without surprising callers'
  intentional staging state.

## Problem / Motivation

`arc repoint-design`, `arc finalize create-spec`, and `arc set-stage` edit the active meta file but leave it unstaged.
Ceremonies explicitly stage their other products and retirement moves auto-stage through Git, so the meta can silently
fall out of the commit unless the agent remembers a separate `git add`. The failure has already required an amend.

## Approach / Scope

- Inventory meta-mutating commands and every ceremony that consumes them.
- Decide whether the mutator family owns stage-on-edit or each workflow must explicitly stage its meta output.
- Preserve intentional partial staging and compatibility with release-wrapper preflight.
- Align the selected contract across create-spec, handoff, and other meta-writing ceremonies, with regression coverage
  for the dropped-meta failure mode.

---
