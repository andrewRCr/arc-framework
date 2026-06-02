---
purpose: Activation-time in-flight scope check — an advisory, non-gating pass over in-flight work units before a new one is scaffolded.
audience: agent
---

# Workflow: In-Flight Scope Check

A shared advisory step run **before a new work unit is scaffolded** — identically from spawn (which creates the
work unit's worktree) and cold-start (which scaffolds into the current one). It surfaces possible scope overlap
with work already in flight so the operator can choose to parallelize or sequence. It **never gates** — activation
proceeds regardless of the outcome.

**Data input.** The in-flight set is supplied by a data source the step treats as opaque; the step's shape is
independent of how that set is gathered. The source is the in-flight **oracle** (`arc active in-flight --json` —
identity-filtered remote refs + PRs), which sees work units and errands in flight across worktrees *and* machines,
including remote-only ones with no local worktree.

## Step

1. **Gather.** Run `arc active in-flight --json`. It returns `entries` (in-flight work units and errands) plus a
   `reachable` flag. A work-unit entry carries `branch`, `name`, `state`, `remoteOnly`, an optional `worktreePath`
   (absent when remote-only), an optional `design` (the meta's scope pointer), and an optional `cohort`. An errand
   entry carries `branch`, `slug`, `remoteOnly`, and an optional `worktreePath`. The work unit being activated is
   not yet in the set — its worktree is new, or, for cold-start, still bare.
2. **Degrade.** An empty `entries` means nothing else is in flight — skip silently and produce no output.
   `reachable: false` (offline, or `--local`) means the set derives from last-known local refs: it may miss
   cross-machine work, but the advisory still runs over what is known. Never gates.
3. **Assess.** For each in-flight work unit, read its stated scope from `design` — the spec pointer the oracle
   carries from the meta `**Design:**` field; absent means scope is unstated. Compare against the work unit being
   activated. An errand carries no meta and no stated scope. **Bias toward surfacing:** unstated scope, shared
   files or modules, or any uncertainty warrants a flag. `cohort` is a neutral fact only — a shared cohort implies
   nothing about safe concurrency (it may reflect a shared domain, which raises overlap odds) and never suppresses
   a flag.
4. **Surface.** For each flagged entry, raise a concern the operator can act on — name the branch, where it is in
   flight (its `worktreePath`, or "remotely on `origin/<branch>`" when `remoteOnly`), and the overlap, then offer
   the choice. For example: `` `feat/x` is in flight in `../repo.x` and touches the same module — parallelize, or
   sequence after it integrates? `` Proceed with activation unless the operator redirects.

---
