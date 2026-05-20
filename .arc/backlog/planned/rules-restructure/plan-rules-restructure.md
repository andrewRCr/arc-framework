# Plan: Rules Restructure

- **Origin:** [internal]
- **Purpose:** Split the rules filename pattern into universal (`DEV-RULES.*`, always-loaded) and bounded
  (`DOMAIN-RULES.*`, on-demand) classes, and design + implement the wiring mechanism that auto-loads
  domain rules when relevant work is in scope.

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
