# Draft: Rules Restructure

- **Origin:** [internal]
- **Purpose:** Split the rules filename pattern into universal (`DEV-RULES.*`, always-loaded) and bounded
  (`DOMAIN-RULES.*`, on-demand) classes, and design + implement the wiring mechanism that auto-loads
  domain rules when relevant work is in scope.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Disambiguate the commit-footer `(activation)` context (init vs. activate)**

- _Routed from:_ `USER-INBOX § Atomic`, work-routing-discipline housekeep drain (2026-06-01).
- _Concern:_ `init-work-unit` (creates the WU on a `plan/` branch at State **Planning**) and `activate-work-unit`
  (flips Planning → **Active**, renames `plan/` → `<type>/`) are distinct ceremonies, but both land under the
  single `(activation)` footer context — defined as the "backlog → active transition." A State-Planning init
  commit wears activation vocabulary belonging to the State-Active flip, and history cannot distinguish init from
  activate by the context line. No `(init)` context exists.
- _Shape (carries a design fork):_ add a distinct init context, rename `activation`, or clarify its scope —
  touches `commit-footer.md` (both copies), the commit-msg validator's allowed-contexts list, and
  `init-work-unit.md` commit guidance. Quick-tier (infra-touching); triage the fork at planning.

### `[ ]` **Rebalance the Errand concept across AGENT-BRIEF.ARC / DEV-RULES.ARC (progressive disclosure)**

- _Routed from:_ `USER-INBOX § Backlog` (`WU_Target: TBD`), work-routing-discipline housekeep drain (2026-06-01).
- _Concern:_ an agent reaching an errand workflow has loaded AGENT-BRIEF.ARC + DEV-RULES.ARC but not strategies —
  yet Errand is not a first-class Vocabulary term in AGENT-BRIEF.ARC (only a passing mention under _Atomic_),
  while DEV-RULES.ARC carries conceptual framing partly duplicating `strategy-work-organization § Errand Work
  Class`. Rebalance for progressive disclosure: AGENT-BRIEF.ARC § Vocabulary introduces Errand (peer to Work
  Unit); DEV-RULES.ARC § Discovered Work Routing keeps operational routing but defers the conceptual model;
  § Errand Work Class stays the authoritative deep model.
- _Fold-ins:_ (a) write-for-reader fix — remove "no queue, no `errand-*` file, and no State field" from
  DEV-RULES.ARC § Holding ≠ execution (it contrasts against the retired queue a reader with no memory of it
  can't parse); state what an errand _is_ (state derived from its branch + PR). (b) Broaden the `taskCommit`
  class-tag and `post-task-quality` extension _definitions_ to the **review increment** (task or errand) rather
  than inventing errand variants — definitional cleanup, keep the names.
- _Update (2026-06-02, in-flight-awareness session):_ **fold-in (a) done early** — the
  DEV-RULES.ARC § Holding ≠ execution trim shipped with the `arc-errand` revival errand. It removed the
  retired-queue contrast **and** the then-newly-false "sole top-level execution entrypoint / no standalone
  errand command" clause (false once `arc-errand` exists), and named the warm `arc-errand` / cold
  `arc-session --errand` entries. Remaining scope unchanged — AGENT-BRIEF.ARC § Vocabulary intro, the
  DEV-RULES.ARC conceptual-model deferral, fold-in (b) — **plus a new residual:**
  `strategy-work-organization § Errand Work Class`'s dispatch line still reads "dispatched by `arc-session`
  (via `--errand`)" and now needs the warm `arc-errand` entry added.
- _Home:_ constitutional/doctrine surfaces (AGENT-BRIEF.ARC, DEV-RULES.ARC, `strategy-workflow-authoring`
  § Routing class tags, the `post-task-quality` extension); reviewed-lane, two-copy. (Landing here as the
  rules/doctrine home; could be a focused doctrine-cleanup pass instead — decide at integration.)

---

## Problem / Motivation

After WOR Phase 6.11 lands, the rules directory is at `system/rules/` with the universal pair
(`DEV-RULES.ARC.md`, `DEV-RULES.PROJECT.md`) loaded every session. The framework also supports
domain-specific rules — teams can add `DEV-RULES.{DOMAIN}.md` files (e.g., `DEV-RULES.FRONTEND.md`) that
load on-demand when work touches that domain.

The current `DEV-RULES.*` pattern conflates two categorically different things into one filename
pattern:

- **Universal / always-loaded** — `DEV-RULES.ARC` and `DEV-RULES.PROJECT`. Foundational; govern every
  session.
- **Bounded / on-demand** — `DEV-RULES.{DOMAIN}`. Apply only when a task touches the relevant domain.

Three concrete consequences of the conflation:

1. **Loading model is implicit.** The agent has to remember "ARC and PROJECT load always, everything
   else loads on-demand." A filename-encoded distinction makes the rule self-evident.
2. **No stable contract for wiring.** Auto-loading domain rules needs a name pattern to match against.
   The current `DEV-RULES.*` glob matches the universals too, requiring an exclusion list. A separate
   `DOMAIN-RULES.*` prefix is a clean contract.
3. **Sort order mixes tiers.** In a directory listing, universal and domain rules interleave
   alphabetically. A prefix split clusters universals at the top (`DEV-*` sorts before `DOMAIN-*`).

Additionally, domain rules today aren't wired into workflows or session operations — they're only
loaded when a user manually directs the agent to read them. This works but leaves usability on the
table; the framework could surface domain rules automatically when relevant work is in scope.

## Scope

- Rename the existing pattern: `DEV-RULES.{not-ARC,not-PROJECT}` → `DOMAIN-RULES.{domain}`. Forward-only
  migration; pre-public-release status means no adopter migration cost.
- Update `system/rules/README.md` to document both classes (the WOR 6.11.b README rewrite explicitly
  drops the existing "Domain-Scoped Rules" section in anticipation; this WU reintroduces it correctly).
- Design the wiring mechanism — how domain rules auto-load when relevant work is in scope.
- Implement the wiring mechanism — likely involves session-init, workflow declarations, and/or
  extension contracts.
- **CLI module/identifier rename (deferred from WOR Phase 6.11).** WOR repointed the domain-rules
  paths to `system/rules/` but intentionally left the CLI's "constitution" naming in place to keep
  that phase scoped to paths, not renames: the `commands/constitution/` module, the `constitutionDir`
  resolver helper, and related identifiers still say "constitution" while resolving `system/rules`.
  Rename them to the `rules` / `domain-rules` vocabulary here (e.g., `commands/constitution/` →
  `commands/rules/`, `constitutionDir` → `rulesDir`). Mechanical; no behavior change.

## Alternatives

Three viable trigger models for auto-loading domain rules. Decision deferred to plan-doc iteration:

- **Extension declaration.** A new extension (or amendment to existing extension contract) declares
  `domain: frontend`; session-init / workflow-fire reads the declaration and pulls in
  `DOMAIN-RULES.FRONTEND.md`. Pro: explicit, opt-in, no inference. Con: requires per-extension wiring.
- **File-path heuristics.** Map paths to domains (`src/frontend/**` → `frontend`); when a task touches
  the path, the agent loads the matching domain rules. Pro: zero-config for users with conventional
  layouts. Con: heuristic, brittle, configuration sprawl for non-conventional layouts.
- **User-invoked.** Status quo formalized — user references the rule explicitly when needed. Pro:
  simplest. Con: defeats the auto-loading premise; arguably no work needed here.

Combination model also viable (e.g., declaration as primary, heuristics as fallback).

## Unknowns and Assumptions

- **Loading surface.** Session-init item, new method (`domain-rules`), or extension-managed?
- **Contributor scope.** Do contributor-mode sessions load domain rules for the domains they touch?
  Probably yes, but worth confirming against the contributor briefing's load discipline.
- **Trigger granularity.** Domain rules load per-task (more precise) or per-session (simpler)?
- **Path-detection model** (if heuristics-based). Keyword match on file paths, task-domain tags,
  or task-list section annotations?
- **Default domain inventory.** Ship with stock `DOMAIN-RULES.*` templates for common domains
  (frontend, backend, infra, security, testing) or leave entirely to teams?

## Forward-Compat Note

WOR Phase 6.11 establishes the substrate this WU builds on:

- `system/rules/` directory (replaces `reference/constitution/`)
- `system/rules/README.md` documents the universal pair only — the "Domain-Scoped Rules" section is
  explicitly dropped in 6.11.b in anticipation of this WU reintroducing it correctly with the
  `DOMAIN-RULES.*` pattern (avoids leaking in-flight scope into the adopter surface per
  DEV-RULES.PROJECT § Audience Boundaries).
- The CLI domain-rules **paths** (resolver, frontmatter regex, audit script) are already repointed to
  `system/rules/` by WOR Phase 6.11; only the "constitution" **naming** of the CLI module and
  identifiers is deferred to this WU (see Scope).

This WU cannot activate until WOR ships. `Depends On: work-organization-reform` reflects that
sequencing constraint.

## Scope Estimate

Medium (days-week).

- Filename pattern rename: small, mechanical (forward-only, no migration shim).
- README rewrite: small.
- Wiring design: needs plan-doc iteration before tasks generate — likely an ADR-worthy decision
  (trigger model selection has downstream implications for extensions and session-init).
- Wiring implementation: moderate — touches session-init, possibly new method or extension contract,
  and the load mechanism itself.

Dependencies: WOR ships first (provides `system/rules/` substrate and the directory-placement criterion
codified in `strategy-file-classification.md`).
