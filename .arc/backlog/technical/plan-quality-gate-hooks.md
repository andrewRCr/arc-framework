# Plan: Quality Gate Tiers and Hook Integration

## Problem / Motivation

ARC's tiered quality gate system — Tier 1 (per-task), Tier 2 (coherent unit), Tier 3 (pre-PR) — is
workflow-oriented: it tells developers/agents *when in their flow* to run which checks. The methodology
is sound, but the execution model has two gaps:

**1. No automatic enforcement at commit/push stages.** Pre-commit hooks at `.arc/system/githooks/pre-commit`
enforce structural properties (commit format, context footer, task staging, frontmatter validation, etc. —
14 CHECKs as of 2026-04-24). They do NOT run the adopter's linters or tests. The assumption has been that
agent/developer discipline plus CI is sufficient. In practice this creates a gap: a commit landed on
2026-04-24 with known-deferred markdown lint errors that Tier 2 would have caught, but Tier 2 hadn't run
because the task wasn't "coherent unit" complete yet. CI went red; the agent committed through the
discipline window. This is the kind of preventable failure that hooks exist to prevent.

**2. Tier semantics don't map explicitly to standard git hook stages.** External research (completed
2026-04-24) confirmed the universal idiom: pre-commit (fast, staged files only) → pre-push (full local)
→ CI. ARC's tiers correspond naturally — Tier 1 ↔ pre-commit, Tier 2 ↔ pre-push, Tier 3 ↔ CI — but this
alignment is nowhere expressed in the methodology, so adopters can't take advantage of auto-enforcement
without inventing their own mapping. Pre-push is particularly underserved: there is no ARC-recognized
pre-push stage at all.

**Related concerns surfaced during discussion:**

- **Tier naming.** "Tier 1 / 2 / 3" is generic and requires readers to remember the mapping.
  Gate-stage-aligned naming ("commit-gate / push-gate / pr-gate" or similar) is self-documenting and
  idiomatic. Current lean is toward a full rename, but the exact shape (rename vs. dual-naming vs.
  align-in-doc) is a PRD-time decision.
- **Structural vs. adopter-impl separation.** The line between *what ARC enforces* (commit format,
  frontmatter schemas, task staging — framework-owned) and *what's adopter-configurable* (linters, tests,
  typecheck, build — stack-dependent) is fuzzy in current docs. ARC should define the tier abstraction +
  enforcement surfaces + connection points, but never assume a specific tech stack in its shipped
  defaults. Hook-manager integration already handles this at the manager layer (ADR-014: detect and
  integrate with husky / lefthook / pre-commit.com, fall back to `core.hooksPath`); the equivalent
  discipline needs to apply to tier-gate *commands*.

This matters now because:

- Pre-1.0 polish window — the methodology shouldn't ship underspecified on a surface this central.
- Dogfooding (upcoming in the release path) will compound the discipline-window gap for real adopters.
  We want the safety net in place first.
- External research is complete; no blocking unknowns before PRD drafting.

## Relationship to Gate Model Frame

[ADR-016][adr-016] establishes configurable autonomy gates for session-operational flow, formalizing
the commit-gate / push-gate / integration-gate vocabulary this plan was already converging on
independently. Good alignment — this plan's gate-stage naming becomes the canonical vocabulary,
not this plan's invention.

Impacts on scope:

- **Handoff-gate added to the picture.** The frame introduces handoff as an orthogonal ceremony with
  its own configurable interior actions. Hook placement gains a fourth stage: pre-handoff validation
  (session-close checks). This plan picks up handoff-gate hook support alongside the existing
  commit-gate / push-gate / pr-gate stages.
- **Interaction with configurable autonomy modes.** When [plan-session-operational-flow][plan-ops]
  ships auto-commit and auto-push modes, hook invocation timing changes slightly — hooks fire as
  part of the cascade rather than as standalone gates. The cascade-visibility requirement from
  ADR-016 means hook output remains visible to the user even under auto modes. Plan needs to confirm
  hook behavior composes cleanly with cascade semantics.
- **Integration-gate terminology.** ADR-016 uses "integration-gate" for merge-to-main (human-invariant).
  This plan's "pr-gate" terminology (at least in scope bullet text) should align — either rename to
  integration-gate or document that pr-gate and integration-gate refer to the same stage.

Scope impact: lighter overall. The gate-model frame provides vocabulary and semantic home this plan
was inventing independently; handoff-gate adds a small new scope item; autonomy-mode interaction
needs a design check but not new mechanics.

## Scope

### In scope

**Tier model reshape.** Rename "Tier 1/2/3" to gate-stage-aligned naming, using the canonical vocabulary
from [ADR-016][adr-016]. Current lean: `commit-gate / push-gate / integration-gate` (aligning with
ADR-016 terminology — the frame uses "integration-gate" for merge-to-main, and this plan's
pr-gate referred to the same stage). Rename touches DEV-RULES.ARC, strategy-quality-gates.md,
3_process-task-loop.md, QUICK-REFERENCE.md, session-init.md, and scattered tier references throughout
the framework. Final naming shape decided at PRD drafting — see Alternatives.

**Pre-push hook as recognized stage.** New `.arc/system/githooks/pre-push` that dispatches to the
adopter's push-gate commands. Config-gated via `hooks.pre_push` in `arc-config.yml`. Integrates through
the existing hook-manager detection layer (ADR-014) — husky / lefthook / pre-commit.com / fallback all
get the pre-push stage wired up.

**Pre-handoff hook as new stage (ADR-016 integration).** Additional hook placement for handoff-gate:
session-close validation before handoff artifacts are finalized. Config-gated via `hooks.pre_handoff`
(naming TBD at PRD, aligned with autonomy-axis naming from [plan-session-operational-flow][plan-ops]).
Complements commit-gate and push-gate checks with handoff-specific validation — e.g., status-file
rotation validity, git-notes consistency, worktree cleanliness.

**Connection points between tiers and hooks.** Extend the `quality-gate-commands` method with tier
metadata on each command (Option A from decision analysis — tier attached to each command entry, not
split across multiple methods). Hook CHECKs read the method, filter by current stage, and run matching
commands against the appropriate scope (staged files for commit-gate; full repo for push-gate).

**Pre-commit tier 1 dispatch.** New CHECK in the existing pre-commit hook: runs commit-gate commands
on staged files only. Staged-files scoping follows universal idiom (`git diff --cached --name-only
--diff-filter=ACM | grep ext`). Auto-fix where supported (e.g., `markdownlint-cli2 --fix`,
`eslint --fix`); auto-re-stage fixed files (aligned with husky + lint-staged default behavior and
research recommendation). The current `--no-verify` prohibition in DEV-RULES.ARC stays unchanged.

**Bootstrap during initial-setup.** Add a step to `.arc/system/workflows/arc/initial-setup/` (exact
placement TBD at PRD) that prompts the adopter to configure their gate commands per tier. ARC ships
no tech-stack defaults in the method — the adopter declares what runs at each gate for their stack,
once, at setup time. Examples for common stacks go to the docs site, not into the shipped method.

**Explicit structural-vs-adopter-impl separation.** Add or extend a section (likely in
strategy-quality-gates.md) naming the distinction. ARC enforces structural checks (14 current CHECKs +
new gate-dispatch CHECKs for 2 stages); adopters configure tier commands via the method. Hook-manager
choice (husky, lefthook, pre-commit.com, fallback) is adopter-impl, already handled via ADR-014.

**Docs routing for common-stack examples.** JS/TS (husky + lint-staged wiring), Rust (cargo fmt/clippy),
Go (gofmt + golangci-lint), Python (pre-commit.com) — route to `notes-docs-content-sweep.md` for
eventual docs-site placement. Not live framework reference docs; those stay stack-agnostic.

**This repo's own adoption** — route to `user/andrew/ATOMIC-INBOX.md` as a separate atomic task
after this WU's framework-level design lands. Mechanical configuration: wire lint-staged into our
existing husky setup to dogfood the new dispatch method. Not a framework-delivery concern.

### Out of scope

- Switching ARC's shipped hook script format (stays shell-based in `.arc/system/githooks/`).
  Hook-manager integration is already handled per ADR-014.
- Rewriting or consolidating the existing 14 structural CHECKs. Framework-owned and fine.
- Tech-stack-specific defaults in the shipped method. Configuration at initial-setup is the entry
  point, not shipped defaults.
- Tier 3 auto-enforcement at the hook layer. Tier 3 = CI + human review; no local hook equivalent
  planned. Possible `pre-pr` dispatcher can come later if demand emerges.
- Lint tool selection opinions. ARC doesn't pick between markdownlint and prettier for adopters.

## Alternatives

**Tier naming:**

- **A — Full rename (current lean).** "Tier 1/2/3" → "commit-gate / push-gate / pr-gate." Self-
  documenting, idiomatic, aligns with git hook stages. Downside: methodology-wide rename touches many
  files and breaks mental models for early adopters who've internalized the numeric tiers.
- **B — Keep numeric tiers, document alignment.** Tier 1/2/3 stays canonical; every surface documents
  "Tier 1 runs at commit-gate stage." Minimal churn but less discoverable; readers must still learn
  the mapping.
- **C — Hybrid / dual naming.** Use gate names as headings/titles; keep tier numbers in parenthetical
  reference. Verbose, compatible, but neither fully communicative nor minimal.

**Pre-push opt-in model:**

- **A — Config-gated smart default (current lean).** `hooks.pre_push: auto | enabled | disabled`.
  `auto` = "enabled if push-gate commands are configured, disabled otherwise." Zero friction for
  adopters without a test suite; auto-wires for those with one.
- **B — Always opt-in.** `hooks.pre_push: enabled | disabled`, default `disabled`. Explicit, no
  surprises, but misses the easy win for mature adopters.
- **C — Always on (when configured).** No config key; pre-push always enabled if push-gate commands
  exist. Surprising for early-stage projects that just added tests and aren't ready for pre-push yet.

**Method dispatch shape:**

- **A — Extend `quality-gate-commands` with tier metadata (current lean).** Each command entry
  includes `tier: commit-gate | push-gate | pr-gate` (or equivalent). Hook filters by stage, runs
  matching commands. Single method, expressive.
- **B — Separate method per tier.** `commit-gate-commands.md`, `push-gate-commands.md`,
  `pr-gate-commands.md`. More files, less flexible, harder to misconfigure but harder to reason about
  holistically.
- **C — Flat commands + side-channel stage map.** Commands stay flat; a sibling method maps stages
  to command subsets. More indirection, less cohesion.

**Auto-restage behavior on fix:**

- **A — Auto-restage (chosen).** Aligned with research + husky/lint-staged default + user preference.
  Linter fixes get staged automatically; commit proceeds. Fast, agent-friendly.
- **B — Block and report.** Linter fixes happen but commit is blocked; user/agent re-stages
  manually. More explicit, more friction.

## Unknowns and Assumptions

**External research (completed 2026-04-24) validated:**

- Staged-files-only discipline is universal best practice — no significant dissent.
- Pre-commit time target: <500ms ideal, <5s acceptable, >10s corrodes discipline.
- Tier 2 equivalent (full test suite) in pre-commit is a documented anti-pattern — belongs in
  pre-push or CI.
- Agent-friendly hook design: structured errors, auto-fix, idempotent retries. Claude Code has 15
  hook events and documented patterns for agents reacting to hook failures.
- `--no-verify` bypass pressure scales inversely with hook speed and signal density.

No external research blockers remain before PRD drafting.

**Assumptions to validate during PRD:**

- Renaming "Tier 1/2/3" produces net-positive readability despite methodology churn. If PRD
  discovery finds the rename touches >50 files or disrupts established mental models, fall back to
  Option B.
- `hooks.pre_push: auto` default works for both early-stage adopters (no tests yet) and mature ones
  (has tests). If beta dogfooding reveals confusion, fall back to explicit opt-in.
- Initial-setup is the right configuration point. If the bootstrap step adds material friction to
  onboarding, consider making it an optional later step.
- Extending `quality-gate-commands` with tier metadata (Option A) stays readable as commands
  accumulate. If the method becomes crowded in practice, revisit splitting.
- Auto-re-stage behavior is safe when combined with ARC's existing structural CHECKs. Needs test
  coverage ensuring re-staged fixes don't re-trigger or loop.

## Scope Estimate

**Medium** (days-week).

Rough breakdown:

- Methodology rename + doc sweep (if Option A chosen): 1-2 days.
- Pre-push hook + structural CHECK + two-copy sync: 0.5-1 day.
- Method extension + dispatch logic + tests: 1 day.
- Initial-setup bootstrap workflow edit + tests: 0.5 day.
- Docs-content-sweep routing entry: 0.25 day.
- Config schema update + CI audit updates: 0.5 day.
- Repo dogfooding (lint-staged wiring in atomic inbox — sibling task, not counted here).

**Dependencies:**

- **[plan-session-operational-flow][plan-ops] Phase 1 (constitutional foundation) must land first** so
  the gate vocabulary is formally canonicalized before this plan's rename pass. Phase 3 (config
  surface) landing first is preferred — the autonomy-axis naming influences `hooks.pre_push` /
  `hooks.pre_handoff` config shape and avoids retroactive churn.
- Session-Init Optimization must land first — overlapping edits on DEV-RULES.ARC, session-init.md, and
  `quality-gate-commands.md` would conflict with ongoing audit work.
- User Sync UX Polish landing first is preferred — both are pre-1.0 polish; reduces overlap on shared
  adopter-facing surfaces (`arc-config.yml`, DEV-RULES, `arc status`).
- Work-Unit Mobility landing first is preferred — its session-init orientation and status-file template
  edits overlap with surfaces this WU also touches. Clean separation.
- ADR-014 (hook-manager detection) is already in place — prerequisite met.
- Landing before ARCd Rebrand means rebrand picks up the new tier naming in its bulk rename pass,
  avoiding double-churn (same argument as User Sync UX Polish).

**Scheduling:** After plan-session-operational-flow Phases 1-3 land, after Work-Unit Mobility, before
ARCd Rebrand. Pre-1.0 polish window.

**Pre-approved split at PRD-drafting time:** If the methodology rename (Option A) proves to touch more
surface than anticipated, split into:

- WU-A: Hook integration only (new pre-push hook, method dispatch, bootstrap, repo dogfooding).
  Low-churn, architectural.
- WU-B: Tier rename across all surfaces. Editorial, mostly find-and-replace with contextual review.

Both halves are independently valuable. Keep unified if rename stays manageable.

---

[adr-016]: ../../reference/adr/adr-016-configurable-autonomy-gates-for-session-operations.md
[plan-ops]: plan-session-operational-flow.md
