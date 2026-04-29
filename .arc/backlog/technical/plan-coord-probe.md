# Plan: Coordination Probe

**Purpose:** Establish ARC's first external-coordination integration surface — a `coord-probe` method
backed by a CLI subcommand and pluggable adapters. Answers "where should I be working" at session-init's
branch-gone fire point and other discovery moments where in-git state alone is insufficient. Ships in-git
default and bundled GitHub adapter; documents custom-adapter contract for Linear / Jira / etc.

- **State:** Draft — pre-PRD exploration captured during cross-machine resume on 2026-04-28.
  Iteration expected before PRD promotion.

- **Created:** 2026-04-28

- **Origin:** Surfaced during cross-machine session resume — primary machine returned to a
  merged-and-deleted feature branch from prior-night laptop work. Worktree probe correctly reported
  `remote-unavailable` (upstream gone), but had no way to identify the right target branch. Discussion
  confirmed detection is straightforward (post-fetch `gone` upstream + recently-active remote branches),
  but **target resolution at team scale needs a pluggable signal source** beyond `.arc/active/` walks.
  ARC's `pm.mode: external` config slot has no behavioral hook today; this plan fills it.

---

## Problem / Motivation

Session-init has no answer to "given my identity, where should I be working" when in-git signals fail or
are insufficient:

- **Cross-machine resume:** the canonical case. Work continued elsewhere; this machine's branch is
  merged-and-gone; status files in `.arc/active/` may or may not reflect current state depending on how
  recently this machine pulled.
- **Multi-WU sessions** (post-mobility): multiple status files exist; which is primary for *this*
  identity?
- **Team scale** (above ~5 devs): in-git tracking has a hard staleness ceiling. Tracked status is only
  as fresh as the most recent merge to a branch this machine has pulled. Real teams coordinate via
  issue trackers — that's where "what is @alex working on" lives, with low latency.

`pm.mode: external` already exists for adopters tracking work in external tools, but it has no
behavioral hook beyond suppressing arc-in-git artifact installation. There's no surface for "ask the
external tracker where I'm assigned" at session-init or elsewhere.

This plan fills the gap with a contained architectural addition: one method, one CLI subcommand, three
flat config keys, two bundled adapters (`in-git`, `gh`). Adopters using GitHub get zero-config "where am
I" detection. Adopters using other trackers get a documented custom-command contract.

### Why now, why bounded

- **Branch-gone detection** ([Worktree Foundation][worktree-foundation] item 3) needs target-
  resolution signals to be useful for team-scale adopters. Without coord-probe, branch-gone
  detection works for solo and small teams via status-file walks, then degrades to "stop and ask"
  for larger teams.
- **Pre-1.0 polish window** is the right time to land the architectural shape. Adding external-coord
  support post-release means adopters bake in "ARC doesn't know about my tracker" as a permanent
  expectation.
- **Bounded scope avoids over-reach.** Ships the architecture and one adapter (GitHub). Linear / Jira /
  Asana / Shortcut adapters land later if demand surfaces. Custom adapters cover everyone in the
  meantime.

---

## Working Thesis: Probe-and-Stop, Not Probe-and-Drive

The coord probe is **read-side, advisory**. It returns candidate signals; doesn't decide actions.
Session-init consumes results and either proposes a clear winner (high-confidence single result),
prompts with candidates (multiple), or stops and asks (no results).

This framing keeps the probe principled:

- **No autonomous resolution.** The probe never auto-switches branches or modifies state. Even with
  `coord.adapter: gh`, session-init surfaces suggestions and waits for confirm.
- **Composable with existing signals.** Probe results merge with status-file walks, `git worktree
  list`, and the notes-discovery breadcrumb (when [User Sync UX Polish][user-sync-ux] lands
  HEAD-independent notes load). All sources contribute candidates; recency and confidence drive
  ordering.
- **Adapter is escape hatch, not replacement.** In-git remains the durable coordination substrate
  (PRDs, plans, status files, ROADMAP). Probe answers ephemeral questions in-git can't. Tracked state
  never depends on an external system.

---

## Scope

### In scope

1. **Method file: `coord-probe.md`.** Contract definition: invocation, output schema (JSON candidate
   list with `branch`, `source`, `recency`, `confidence`, `title` fields), default behavior (in-git
   status-file walk), override slot. Loaded on-demand at consuming-workflow fire points per existing
   method-loading model.

2. **CLI subcommand: `arc coord probe`.** Reads `coord.adapter` from config, dispatches to bundled
   adapter, returns JSON candidate list on stdout. Standard `--identity`, `--json`, `--max-results`
   flags. Errors gracefully when adapter unavailable (e.g., `gh` not installed, network unreachable)
   without blocking session-init.

3. **Bundled `in-git` adapter (default).** Walks `.arc/active/{category}/status-*.md`, extracts
   `**Branch:**` field, filters by `(@identity)` ownership markers (per existing team-coordination
   conventions). Emits one candidate per matching status file.

4. **Bundled `gh` adapter.** Calls `gh pr list --assignee @me --state open` and `gh issue list
   --assignee @me --state open` (with linked PR/branch JSON fields), merges results, emits candidates
   with PR/issue title and updated-at timestamp. Activates when `coord.adapter: gh` and
   `platform.type: github`.

5. **Custom adapter contract.** When `coord.adapter: custom`, the CLI runs `coord.command` (configured
   shell command), expects same JSON output schema. Failure modes documented (non-zero exit, malformed
   JSON, timeout).

6. **Three new flat config keys** in `arc-config.yml`:
    - `coord.adapter: in-git | gh | custom` (default: `in-git`)
    - `coord.command:` (used when `adapter: custom`)
    - `coord.recency_days: <int>` (default: `14`; filters stale candidates)

7. **Session-init consumption point.** Branch-gone fire point in session-init invokes the probe.
   Cascade logic itself lives in [Worktree Foundation][worktree-foundation]'s branch-gone detection
   scope; probe output is one signal among several into that cascade.

8. **Documentation.** Method file documents the contract. Config keys documented in `arc-config.yml`
   template comments. Strategy doc addition (likely [strategy-team-coordination][strategy-team]) frames
   ARC's stance on external coord — durable state in git, ephemeral coord via adapter.

### Out of scope

- **Bundled Linear / Jira / Asana / Shortcut adapters.** Custom contract covers them. Built-ins land in
  follow-on WUs if demand surfaces.
- **Auth and credential management.** `gh` adapter delegates to `gh` CLI's auth (already set up by
  GitHub-using adopters). Custom adapter handles its own auth.
- **Bidirectional sync.** Reads from external trackers; doesn't write. No "ARC marks issue done when WU
  archives." Future possibility, not this plan's scope.
- **Multi-tracker fan-out.** Single `coord.adapter` value at a time. Adopters with mixed setups
  configure `custom` and merge sources in their shell command.
- **Probe results affecting tracked state.** Probe is read-only. Session-init proposes; user confirms;
  user's confirmation drives state changes. Probe never directly modifies status files or other tracked
  state.

---

## Design Decisions

### Method-as-declarative + CLI-as-runtime split

Coord-probe is the first ARC method whose behavior is a runtime call rather than a decision rule the
agent applies. The clean separation: the **method file declares the contract**; the **CLI implements
the runtime**. The agent invokes `arc coord probe`; the CLI handles dispatch, auth, error handling,
JSON parsing.

Rejected alternative: method-as-shell-script (`.override` block contains shell commands the agent
executes). Pulls runtime concerns into method files, fights existing method-as-declarative role across
the codebase.

### Bundled GitHub adapter, custom contract for everything else

ARC ships and maintains the GitHub adapter because `gh` is widely installed, auth-pre-handled, and
covers GitHub-native teams that use issues or PRs as their primary work-tracking unit. Linear / Jira /
Asana / Shortcut adapters land later if demand surfaces; custom contract covers them in the meantime.
Balances adopter ergonomics (zero-config GitHub) against ARC's surface area (no third-party API
integrations to maintain).

### Probe as cascade input, not cascade driver

Branch-gone detection's cascade (per [Worktree Foundation][worktree-foundation]) is: `git worktree list`
→ status files → recent remote branches → coord probe → fall back. Probe is one signal among several.
Keeps probe results from over-driving session-init when in-git signals are clear, and from
under-driving when probe is unavailable.

### Read-only, advisory

Probe never writes. Session-init never auto-acts on probe results — always proposes, always waits for
confirm. Higher-autonomy modes (auto-commit, auto-push from
[plan-session-operational-flow][session-operational-flow]) don't extend to coord-probe-driven branch
switching. Branch-switching is too consequential to gate on a probe.

### Flat config preserved

Three flat keys (`coord.adapter`, `coord.command`, `coord.recency_days`) cover the full surface. Shell
hooks don't read coord config, so the flat-parse constraint isn't a blocking factor for these
specifically. Nested structures rejected — would require revisiting hook config-read mechanism for no
current benefit.

---

## Dependencies and Sequencing

### Upstream

- **Session-Init Optimization** (shipped): lean session-init substrate to extend.
- **[Session-Operational Flow][session-operational-flow]** (current planning branch). No frame
  dependency, but landing after avoids surface conflicts on session-init workflow edits.
  Coord-probe's session-init fire point is the new branch-gone resolution step (introduced by
  Work-Unit Mobility), not a gate-model gate.

### Sibling (parallelizable)

- **[User Sync UX Polish][user-sync-ux].** Notes-discovery fix lives there; coord-probe consumes
  notes-as-signal once that fix lands. Coord-probe ships v1 with in-git + gh signals; notes signal
  joins later. Plans touch different files (CLI subcommand + adapter modules vs sync state machine +
  load semantics) and can ship in either order.

### Downstream

- **[Worktree Foundation][worktree-foundation].** Consumes coord-probe at branch-gone detection.
  Worktree Foundation's session-init worktree-awareness scope absorbs the cascade design that
  includes coord-probe as one input; Worktree Foundation can ship without coord-probe but degrades
  to status-file-walk + remote-recency only (loses team-scale signal).

### Recommended sequencing

[Session-Operational Flow][session-operational-flow] (frame) → **Coord Probe** ‖ [User Sync UX
Polish][user-sync-ux] ‖ [Worktree Foundation][worktree-foundation] (three parallel) → [Agile WU
Lifecycle][awl] → [Concurrent Work Conventions][cwc].

---

## Pressure Points and Risks

### Adapter maintenance burden

ARC ships one adapter (GitHub). `gh` CLI's output format is stable but not contract-guaranteed. If `gh`
changes JSON output, the adapter breaks. Mitigation: pin to specific flags with stable output, ship
integration tests against real `gh` (skippable in CI when unavailable), document the version
expectation.

### Probe latency at session-init

Session-init is on a critical path; network calls slow it down. `gh pr list` typically returns in
200–500ms; combined `pr list` + `issue list` easily hits 1s. Mitigation: probe runs only at
branch-gone fire point (not every session-init); hard timeout (e.g., 3s); consider caching for repeat
session-init within a short window.

### Conflation of "assigned to me" with "what should I work on next"

GitHub Issues / PRs assigned to @me may include things you're reviewing, things you've been tagged on,
things waiting on someone else. Probe surfaces all as candidates; user picks. Risk: noisy candidate
list. Mitigation: filter by state (`--state open`), by recency (`coord.recency_days`), by branch
existence locally; sort by recency; cap result count.

### Custom adapter UX

Custom-adapter contract is a shell command emitting JSON. Adopters writing custom adapters handle their
own error semantics, JSON shape, and auth. Real work for the adopter. Mitigation: ship a documented
worked example (Linear via curl is the obvious choice) in strategy or adapter-contract docs.

### Identity-marker convention drift

In-git adapter relies on `(@identity)` ownership markers in status files.
[strategy-team-coordination][strategy-team] documents the convention but it's not enforced. Mitigation:
fall back to "any active status file" when no `@identity` markers are present (typical for solo-mode);
document the convention more visibly when team mode is enabled.

---

## Open Questions

### Probe invocation point — branch-gone only, or broader?

Plan scopes probe invocation to session-init's branch-gone fire point. Other candidate fire points:
orientation summary in normal sessions ("you have N PRs assigned"), `arc-status` mid-session info,
post-handoff hint. Each adds value but also adds latency / noise. PRD decision.

### Per-identity vs per-machine config

Should `coord.adapter` be settable per-identity (`git config arc.coord.adapter`)? Aligns with existing
`arc.syncPush` per-developer override pattern. PRD decision.

### Adapter contract versioning

Declare schema version in output (`schema_version: 1`) from day one to allow breaking changes later, or
defer until needed? PRD decision.

### Caching policy

Probe results have natural recency (assignment changes, new PRs). Caching helps latency; staleness
hurts accuracy. TTL? 60s? Per-session? Configurable? PRD decision.

### Failure surfacing

When adapter fails (network down, auth expired, `gh` not installed), session-init still proceeds —
probe is advisory. How prominently is failure surfaced? Silent fallback to in-git? Brief warning? Full
error in orientation? PRD decision.

---

## Scope Estimate

**Medium** (week-ish). Architecture-light, implementation-bounded.

Phases (provisional):

1. **Method file + contract.** `coord-probe.md` with default and override sections, JSON schema
   documented. Doc-only.
2. **CLI subcommand scaffolding.** `arc coord probe` with adapter dispatch, JSON output, error
   handling. No adapter logic yet.
3. **In-git adapter.** Status-file walk, ownership-marker filtering, recency.
4. **GitHub adapter.** `gh pr list` + `gh issue list` integration, error handling for `gh`
   unavailable.
5. **Custom adapter.** Shell exec, JSON parsing, timeout handling.
6. **Session-init integration.** Branch-gone fire point invokes the probe; cascade itself lives in
   [Worktree Foundation][worktree-foundation], but the consumption-shape land here.
7. **Documentation + tests.** Method doc, config doc, strategy doc addition, integration tests (mocked
   `gh`, real-tracker tests skipped in CI).

Phases 3–5 can parallelize (independent adapters). Phase 6 depends on Phase 2.

---

[worktree-foundation]: plan-worktree-foundation.md
[awl]: plan-agile-wu-lifecycle.md
[cwc]: ../feature/plan-concurrent-work-conventions.md
[user-sync-ux]: plan-user-sync-ux.md
[session-operational-flow]: plan-session-operational-flow.md
[strategy-team]: ../../reference/strategies/arc/strategy-team-coordination.md
