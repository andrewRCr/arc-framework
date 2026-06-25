# Draft: Coordination Probe

**Purpose:** Establish ARC's first external-coordination integration surface — a `coord-probe` method
backed by a CLI subcommand and pluggable adapters. Answers "where should I be working" at session-init's
branch-gone fire point and other discovery moments where in-git state alone is insufficient. Ships in-git
default and bundled GitHub adapter; documents custom-adapter contract for Linear / Jira / etc.

- **State:** Draft — re-grounded 2026-06-25 (folded in shipped dependencies, absorbed ADR-020, drained the
  inbound buffer, and settled the open questions against `strategy-storage-evolution.md`). Substantially
  PRD-ready; remaining openness is spec/impl tuning (exact probe timeout, whether a read-cache earns its keep).

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
  merged-and-gone; meta files in `.arc/active/` may or may not reflect current state depending on how
  recently this machine pulled.
- **In-flight WUs across worktrees / machines** (post-mobility): each in-flight WU occupies its own
  worktree with a single active meta (single-owner), and some are checked out only on another machine — so
  the question isn't disambiguating files in one place but _which_ in-flight WU to pick up here. The shipped
  in-flight-awareness oracle answers this for in-git signals; coord-probe adds the external-tracker signal
  and the branch-gone target resolution it can't see.
- **Team scale** (above ~5 devs): in-git tracking has a hard staleness ceiling. Tracked state is only
  as fresh as the most recent merge to a branch this machine has pulled. Real teams coordinate via
  issue trackers — that's where "what is @alex working on" lives, with low latency.

ARC's external-tracker integration point — historically `pm.mode: external` — has no behavioral hook beyond
suppressing arc-in-git artifact installation. (ADR-020 collapses `pm.mode: external` into module-off +
tracker-configured, so the activation key becomes a configured tracker pointer, not a mode value — see Design
Decisions.) There's no surface for "ask the external tracker where I'm assigned" at session-init or elsewhere.

This plan fills the gap with a contained architectural addition: one method, one CLI subcommand, three
flat config keys, two bundled adapters (`in-git`, `gh`). Adopters using GitHub get zero-config "where am
I" detection. Adopters using other trackers get a documented custom-command contract.

### Why now, why bounded

- **Branch-gone detection** (shipped in Worktree Foundation) needs target-resolution signals to be useful
  for team-scale adopters. Without coord-probe, branch-gone detection works for solo and small teams via
  meta-file walks, then degrades to "stop and ask" for larger teams.
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
- **Composable with existing signals.** Probe results merge with meta-file walks, `git worktree
  list`, and the notes-discovery breadcrumb (HEAD-independent notes load shipped in `user-sync-ux`). All
  sources contribute candidates; recency and confidence drive ordering.
- **Adapter is escape hatch, not replacement.** In-git remains the durable coordination substrate
  (PRDs, plans, meta files, ROADMAP). Probe answers ephemeral questions in-git can't. Tracked state
  never depends on an external system.

---

## Scope

### In scope

1. **Method file: `coord-probe.md`.** Contract definition: invocation, output schema (JSON candidate
   list with `branch`, `source`, `recency`, `confidence`, `title` fields), default behavior (in-git
   meta-file walk), override slot. Loaded on-demand at consuming-workflow fire points per existing
   method-loading model.

2. **CLI subcommand: `arc coord probe`.** Reads `coord.adapter` from config, dispatches to bundled
   adapter, returns JSON candidate list on stdout. Standard `--identity`, `--json`, `--max-results`
   flags. Errors gracefully when adapter unavailable (e.g., `gh` not installed, network unreachable)
   without blocking session-init.

3. **Bundled `in-git` adapter (default).** Walks `.arc/active/meta-*.md` (flat layout), reads each meta's
   `**Branch:**` and `**Owner:**` fields, and filters by `**Owner:**` matching the identity. Emits one
   candidate per matching meta file.

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
   Cascade logic itself shipped in Worktree Foundation's branch-gone detection; probe output is one
   signal among several into that cascade.

8. **Documentation.** Method file documents the contract. Config keys documented in `arc-config.yml`
   template comments. Strategy doc addition (likely `strategy-team-coordination.md`) frames ARC's stance
   on external coord — durable state in git, ephemeral coord via adapter.

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
  user's confirmation drives state changes. Probe never directly modifies meta files or other tracked
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

Branch-gone detection's cascade (shipped in Worktree Foundation) is: `git worktree list`
→ meta files → recent remote branches → coord probe → fall back. Probe is one signal among several.
Keeps probe results from over-driving session-init when in-git signals are clear, and from
under-driving when probe is unavailable.

### Read-only, advisory

Probe never writes. Session-init never auto-acts on probe results — always proposes, always waits for
confirm. Higher-autonomy modes (auto-commit, auto-push, shipped in Session-Operational Flow) don't
extend to coord-probe-driven branch switching. Branch-switching is too consequential to gate on a probe.

### Flat config preserved

Three flat keys (`coord.adapter`, `coord.command`, `coord.recency_days`) cover the full surface. Shell
hooks don't read coord config, so the flat-parse constraint isn't a blocking factor for these
specifically. Nested structures rejected — would require revisiting hook config-read mechanism for no
current benefit.

### Activation keys off a configured tracker pointer (ADR-020)

ADR-020 collapses `pm.mode: external` into module-off + tracker-configured, so `external` ceases to be a
config value. `coord.adapter` therefore activates whenever a tracker pointer is configured, in _any_
Planning Module state — including `module-on + tracker` (an in-git backlog whose `Origin`s link to an
external tracker). The project-level adapter stays singular; heterogeneous per-WU trackers ride each
`Origin`, not a second adapter.

### Forward-compat with the storage-evolution target

Checked against `strategy-storage-evolution.md`. Coord-probe is already its cited example of a
forward-compat-clean external integration: **read-side and advisory** (Principle 4 — never takes ownership
of WU artifacts; the external tool stays an integration surface, ARC's store stays canonical),
**WU-identity-decoupled** (Principle 5 — the in-git adapter detects by path/content + ownership marker,
never branch-name → WU), and **axis-disciplined** (Principle 9 — three flat keys under one `coord.*`
feature namespace, not a new structural mode or storage axis). Any cache stays a local read-side
convenience, never shared/canonical state, so the version-checked-write discipline (Principle 3) doesn't
apply.

### Probe invocation — branch-gone fire point only (v1)

v1 invokes the probe at exactly one fire point: session-init's branch-gone resolution. Broader fire points
(orientation "you have N PRs assigned", mid-session `arc status`, post-handoff hint) each add latency and
noise; they are explicit follow-ons, not v1 scope. Keeps the probe off the common session-init path.

### Per-identity adapter override

`coord.adapter` is overridable per-identity via git config (`arc.coord.adapter`), mirroring the existing
per-developer `arc.syncPush` / `user.notes_push` precedent — a developer on a shared repo points at their
own tracker without rewriting project config. Forward-compat: this per-developer override rides the
per-developer config substrate `config-storage-architecture` is building (git config interim →
`config.user.yml` target); don't invent a parallel per-developer mechanism.

### Versioned adapter contract from day one

The adapter JSON output carries `schema_version: 1` from the first release, so the contract can evolve
without breaking custom adapters — cheap now, and consistent with the records-carry-versions discipline.

### No cache in v1; advisory failure

The probe runs only at the low-frequency branch-gone fire point, so v1 ships **no cache** — the latency
mitigations are branch-gone-only invocation and a hard timeout (order ~3s; exact value spec-time). A local
read-side cache is a forward-compat-safe future optimization if a broader fire point lands. Adapter failure
(network down, auth expired, `gh` absent) **never blocks** session-init: silent fallback to the in-git
adapter, with a single one-line orientation note when a _configured_ adapter failed (so a degraded probe
isn't invisible).

---

## Dependencies and Sequencing

### Upstream (all shipped)

Session-Init Optimization, Session-Operational Flow, Worktree Foundation, and User Sync UX have all shipped.
Worktree Foundation built the branch-gone cascade with a hand-rolled fallback (meta-file / roster walk +
remote-recency) and left coord-probe's consumption point as the seam to fill — this WU wires the probe in as
one additional cascade signal. User Sync UX shipped HEAD-independent notes load, so the notes-discovery
breadcrumb is available as a signal now (not "later"), and its multi-clone test harness
(`__tests__/helpers/multi-clone.ts`) is inheritable for branch-gone signal coverage rather than re-extracted.

### Cohort sibling

`cross-machine-sync-coherence` (same cohort). Its remote sync-state freshness is a candidate signal into this
probe's ranking once it lands — soft, not a gate; coord-probe v1 ships with in-git + `gh` signals only. See
`cohort-cross-machine-coherence.md` § Shared contracts.

### Downstream

`finalize-parallelism` depends on this WU (with its cohort sibling) — this cohort is its last open gate.

### Cross-cohort — configuration

This WU adds project-level config surface (`coord.adapter` / `coord.command` / `coord.recency_days`) plus a
per-identity override, so it coordinates with the `configuration` cohort (checked 2026-06-25):

- **Read through the resolver, not raw yaml** (`config-storage-architecture`). The CLI resolves `coord.*` via
  the config resolver (`lib/config/resolved-settings.ts`) / the planned `arc config get` probe — never a
  hand-read of `arc-config.yml` — so it doesn't accrue the resolver-drift that WU's "flexible CLI config probe"
  item exists to fix, and rides the per-developer substrate (`config.user.yml`) once per-developer keys move
  there.
- **New keys, not a rename** (`config-migration-registry`). The three keys ship with template defaults and land
  via `arc update`'s three-way merge — coord-probe is not itself a migration trigger, but its keys are
  candidates the registry should track if a later rename touches them.
- **A method-as-runtime-call data point** (`customization-arch-realign`). Coord-probe is the first method whose
  behavior is a runtime CLI call selected by config (the method/CLI/config split above) — a worked example for
  that WU's "which mechanism for which concern" decision tree. It should not pre-empt the tree; fold it in as an
  example when that WU codifies `strategy-configurability-architecture.md`.

### Readiness

Ready now: every upstream dependency has shipped. Parallelizable with its cohort sibling (no hard edge). Pick
order at activation by re-grounding cost, not dependency.

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
branch-gone fire point (not every session-init); hard timeout (e.g., 3s); a read-cache stays a future
option only if a broader fire point lands (see Design Decisions § No cache in v1).

### Conflation of "assigned to me" with "what should I work on next"

GitHub Issues / PRs assigned to @me may include things you're reviewing, things you've been tagged on,
things waiting on someone else. Probe surfaces all as candidates; user picks. Risk: noisy candidate
list. Mitigation: filter by state (`--state open`), by recency (`coord.recency_days`), by branch
existence locally; sort by recency; cap result count.

### Custom adapter UX

Custom-adapter contract is a shell command emitting JSON. Adopters writing custom adapters handle their
own error semantics, JSON shape, and auth. Real work for the adopter. Mitigation: ship a documented
worked example (Linear via curl is the obvious choice) in strategy or adapter-contract docs.

### Owner-field absence in solo mode

In-git adapter filters candidates by each meta's `**Owner:**` field — structured, and more reliable than the
old inline `(@identity)` markers, but it may be unset or `[TBD]` in solo-mode metas. Mitigation: fall back to
"any active meta" when no `**Owner:**` resolves (the typical solo case); rely on the field once team mode
populates it. The convention is documented in `strategy-team-coordination.md`.

---

## Open Questions (residual — spec/impl tuning)

The design questions are settled in Design Decisions above. What remains is implementation tuning, not
design: the exact probe timeout value, and — only if a broader fire point is later added — whether a local
read-cache earns its keep over pure on-demand. Neither changes the task-list shape.

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
6. **Session-init integration.** Wire the branch-gone fire point to invoke the probe — the cascade shipped
   in Worktree Foundation; the consumption-shape lands here.
7. **Documentation + tests.** Method doc, config doc, strategy doc addition, integration tests (mocked
   `gh`, real-tracker tests skipped in CI).

Phases 3–5 can parallelize (independent adapters). Phase 6 depends on Phase 2.
