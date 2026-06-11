# Notes: concurrent-work-doctrine

## Contents

- [Focus-role model rejection — ADR rationale](#focus-role-model-rejection--adr-rationale)
- [Concurrency-model framing](#concurrency-model-framing)
- [Append-only-until-integration — incident grounding](#append-only-until-integration--incident-grounding)
- [Research synthesis — ADR evidence base](#research-synthesis--adr-evidence-base)
- [Design-decision rationale compressed in the spec](#design-decision-rationale-compressed-in-the-spec)
- [Interlock-frame relationship](#interlock-frame-relationship)
- [Execution-relevant risks](#execution-relevant-risks)

> Internal companion holding the rationale the adopter-facing strategy deliberately omits. Source material for the
> ADR (spec R23–R26), authored during execution. Not shipped.

## Focus-role model rejection — ADR rationale

The plan's earlier shape proposed a `**Focus Role:**` meta-file field with values
`primary | companion | awaiting-external | parked`, blessed pairings, swap discipline, and per-WU tenure tracking
via `**Focus Since:**`. Rejected.

**External research (two independent directions):**

- **2026-05-08 PM-tool survey** — no PM-tool precedent. Every tool surveyed (Linear, Jira, GitHub Projects,
  Shortcut, Notion, Asana, Trello, Height) models active work via Status enum + Assignee, not role annotation.
- **2026-05-12 worktree-tool convergence** — no agent-workspace tool (Conductor, emdash, Maestro, Warp, Worktrunk,
  Zed, Super, Superset, T3code, Soloterm, Nora) models focus role as a discipline annotation either (§ 5.2).

The underlying *concepts* (single-thread attention, single-active-focus, awaiting-review as a distinct state) are
evidence-aligned across Kanban, Deep Work, and GTD literature — but expressing them as a separate field invents
net-new vocabulary adopters won't recognize.

**The lighter posture: agent judgment + protocols, not field-encoded roles.** Each proposed value maps to an
existing signal:

- **"Primary"** → the implicit signal: which worktree is the agent currently in. No field needed.
- **"Awaiting-external"** → `**State:** Integrating` (WOR's 4-state machine, merge-position folded in).
- **"Companion"** → conflated runtime focus with backlog grouping; covered by WOR's group-dir convention + derived
  cohort membership. No runtime equivalent needed.
- **"Parked"** → GTD's Someday/Maybe — soft convention guidance, not field-encoded.

**Cost ledger.** *Saved:* a new tracked field, validation rules, migration of in-flight WUs, adopter education on
net-new vocabulary. *Paid:* relying on agent judgment at activation rather than field-encoded role. Research
strongly supports the lighter posture. The anti-pattern intuitions (single-thread attention, same-domain
concurrents) survive as soft guidance in the strategy, framed as conventions adopters apply by judgment, not field
validations a tool enforces.

## Concurrency-model framing

ARC's concurrency model is **parallel sessions, one WU per session, with shift as the in-session escape hatch for
short detours.** Multi-WU work means multiple sessions, each scoped to one WU/worktree/branch with isolated
SESSION-NOTES; sessions don't interact internally except at boundaries (spawning WUs, sweep ceremonies, planning).

- "Developers pivot between WUs" means alt-tab between separate sessions, not in-session WU switching. The
  in-session worktree pivot remains available for the niche short-detour case but is not the dominant pattern.
- Single-active-focus is implicit in worktree presence — the worktree the agent is in is the active focus. No field.
- Transitions between active worktrees happen at review-increment boundaries (the same task-interlock invariance
  ADR-016 establishes for in-WU work).

## Append-only-until-integration — incident grounding

Grounded in a live 2026-06-10 incident: a laptop-scaffolded branch was rebased + force-pushed from the primary
worktree, orphaning the laptop's pre-rebase tip; recovered losslessly via `reset --hard origin/<branch>`. The rule
is not "never rebase" but "never rewrite a branch still serving as a live multi-machine sync target." Worktrees are
*enabling hygiene, not the guarantee* — a per-WU worktree removes the *occasion* for a mid-flight rebase but cannot
*prevent* a rebase + force-push; convention + worktrees together are what make it robust.

**Forward-compat (ADR R26).** The "a pushed WU branch is the cross-machine sync substrate" framing is **tier-1
(in-repo) truth, not permanent** — under the materialized-git-backing-store direction, operational WU state syncs
via the backing store and the code branch carries code. The append-only *discipline* composes forward at every tier
(you never rewrite shared code history), but the doctrine must frame it as **git-branch-safety for shared history**,
not "your WU branch is your personal multi-machine state store." Checked against `strategy-storage-evolution`
Principles 2 (records storage-agnostic) & 5 (WU identity decoupled from branch identity). This reasoning stays in
the ADR — invisible to the shipping doctrine.

## Research synthesis — ADR evidence base

The ADR cites these five files (in `reference/supplemental/research/`), the strategy cites none:

- `research-focus-wip-attention-discipline.md` — single-thread attention, WIP limits, attention-residue.
- `research-active-work-coordination-vocabulary.md` — PM-tool survey (Status + Assignee, not focus role).
- `research-concurrent-work-mechanism-layer.md` — branch/rebase/merge mechanics, lifetime thresholds.
- `research-integration-conflict-handling.md` — concrete parallelize-vs-serialize examples, conflict heuristics.
- `research-worktree-tool-convergence.md` — 11-tool convergence pass (Clusters: Zed/Warp/Worktrunk;
  Conductor/emdash/Maestro; Super/Superset/T3code/Soloterm/Nora). Substantive findings: every tool optimizes for
  many simultaneous sessions / fast spawn / minimal per-WU review (§ 3.3, § 6.4) — opposite posture from ARC's; no
  tool models focus role (§ 5.2, confirms the rejection from a second direction); tool ecosystem + ARC compose by
  sitting on the same git-worktree substrate (§ 3.1) with no extension-point integration (§ 4.3).

## Design-decision rationale compressed in the spec

- **Shared-file concurrency — derived vs. mutated (ADR-020).** Derived shared state (ROADMAP) is solvable in-git:
  a pure projection over branch-isolated `meta-*`, deterministically regenerated at one serialization point
  (post-merge on the integration branch, never hand-edited on feature branches). Mutated shared state (inbox
  drains, human-editable priority/ordering) is *not* solvable in-git — git's line-merge is not a CRDT — so it is
  `draft-arc-backend.md` territory. `merge=union` via `.gitattributes` makes concurrent inbox *appends* auto-merge
  but loses intentional deletions (a drained entry can resurrect) — an append-safety aid, not a drain-safe
  solution; document the caveat if adopted. Shared-mutable planning state (`cohort-{name}.md`) rides per-member
  partition + the behind-base net (**partition-first**); escape hatch if partition proves insufficient: route
  cohort-doc edits as errands through the primary worktree (serialized via `main`). Two seams: the Errand matrix's
  advisory "owning-WU-in-flight" gate keys on a *single* owning WU, so it is ill-defined for a cohort-owned doc —
  the behind-base detector is the net that applies.
- **ROADMAP parallelism is conventions-side, not infrastructure-side.** Likely not reliably deterministic at all
  (meta files don't declare file-scope/domain; predicted paths ≠ actual; cognitive load is judgment). Industry
  leans on conventions + pick-time accounting (WIP limits, swimlane/value-stream partitioning, module ownership)
  over a computed "safe-to-parallelize." On-contact convention, not a rendered field. Hard constraint from WOR: a
  hand-curated parallel view is a **sibling** artifact; the derived ROADMAP stays hand-maintenance-free.
- **Sibling relationship to team mode, not inheritance.** Concurrent usage could theoretically reuse team-mode
  conventions (`(@name)` markers, `user.sync_push: prompt`). Rejected — team-specific (cross-identity), not
  concurrency-specific (multiple WUs, each single-owner). Concurrent-work users can enable team mode independently;
  the patterns are structurally distinct.

## Interlock-frame relationship

ADR-016 establishes configurable autonomy interlocks for session-operational flow. The doctrine consumes the frame
as an enabler — configurable autonomy modes reduce approval ceremony under multi-session load, which is the
ergonomic gap multi-worktree introduces. With configurable autonomy in place, modest concurrency (2–3 sessions)
becomes principled rather than tolerated. Resolved posture (spec R2/R13): **principled at modest scale**, honest
that heavy concurrency is the adopter's call and may strain P2 co-development bandwidth.

## Execution-relevant risks

- **Activation-check judgment quality.** The advisory read relies on agent judgment from in-flight status files.
  Quality depends on (a) adequate scope description in `**Purpose:**` / spec content, (b) careful reading, (c)
  surfacing concerns rather than rubber-stamping. Mitigation: concrete heuristics with worked examples; advisory
  not gating, so false negatives still surface at integration. (This is *why* the evidence-tiering of R17 matters —
  thin inputs → conservative read.)
- **Tool-ecosystem composition friction.** Adopters composing ARC with an agentic worktree tool hold two postures
  in tension by design (ARC: fewer/deeper/more-reviewed; tools: many/faster/less-reviewed). Friction surfaces when
  tool-native cadence (10+ simultaneous sessions, minimal review) meets ARC-managed work, or vice versa. Lean
  (spec R9): light onboarding guidance ("pick which frame dominates per session"), no deep per-tool integration
  docs.

---
