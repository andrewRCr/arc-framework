---
purpose: Activation-time in-flight scope check — an advisory, non-gating pass over in-flight work units before a new one is scaffolded.
audience: agent
---

# Workflow: In-Flight Scope Check

A shared advisory step run **before a new work unit is scaffolded** — identically from spawn (which creates the
work unit's worktree) and cold-start (which scaffolds into the current one). It surfaces possible scope overlap
with work units already in flight so the operator can choose to parallelize or sequence. It **never gates** —
activation proceeds regardless of the outcome.

**Data input.** The in-flight set is supplied by a data source the step treats as opaque; the step's shape is
independent of how that set is gathered. Today the source is the local cross-worktree roster
(`arc active roster --json` — identity-filtered work-unit worktrees).

## Step

1. **Gather.** Run `arc active roster --json`. Each entry carries `branch`, `worktreePath`, `state`, and an
   optional `cohort`. The work unit being activated is not yet in the set — its worktree is new, or, for
   cold-start, still bare.
2. **Degrade.** An empty result means nothing else is in flight. Skip silently and produce no output.
3. **Assess.** For each in-flight work unit, read its stated scope — the spec named in its meta `**Design:**`
   field (the meta carries no dedicated scope field); `**Design:** [none]` means scope is unstated. Compare
   against the work unit being activated. **Bias toward surfacing:** unstated scope, shared files or modules, or
   any uncertainty warrants a flag. `cohort` is a neutral fact only — a shared cohort implies nothing about safe
   concurrency (it may reflect a shared domain, which raises overlap odds) and never suppresses a flag.
4. **Surface.** For each flagged work unit, raise a concern the operator can act on — name the branch, its
   worktree path, and the overlap, then offer the choice. For example: `` `feat/x` is in flight in `../repo.x`
   and touches the same module — parallelize, or sequence after it integrates? `` Proceed with activation unless
   the operator redirects.

---
