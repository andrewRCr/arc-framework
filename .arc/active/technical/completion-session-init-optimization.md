# Completion: Session-Init Optimization

- **Started**: 2026-04-18
- **Completed**: 2026-04-27
- **Branch**: technical/session-init-optimization
- **Pull Request**: {URL — added in integrate-work-unit Step 7}

- **Context**: Roadmap initiative — bring session-init token cost back below the architectural
  floor (~75–80k → ≤60k at orientation) ahead of broader dogfooding and public release.

## Summary

Reshaped session-init's loading model from monolithic up-front reads into a per-file
methods/extensions architecture with YAML frontmatter triggers, narrowed partial-reads, and
session-type conditional loading. Realized ~24–28% reduction at orientation (~57–61k vs
~75–80k baseline) and session-init wall-clock from ~2+ min to ~1 min, with constitutional
and CI machinery in place to prevent drift recurrence.

## Key Deliverables

- _Per-file methods/extensions architecture_ — `system/methods/*.md` and
  `system/extensions/*.md` replace the legacy aggregate `arc-methods.md` / `arc-extensions.md`.
  Method bodies load on workflow trigger; extensions enumerated once at session-init via a
  single `^active: true` grep producing the active-extensions list carried in session context.

- _Workflow frontmatter trigger contract_ — All `system/workflows/**/*.md` declare
  method/extension dependencies via YAML frontmatter (`arc.methods`, `arc.extensions`).
  Constitutional rule pair anchors compliance: DEV-RULES.ARC § Verification and Discovery
  (agent-side load rule) + strategy-workflow-authoring § Author-side Declaration Rule.

- _Pre-commit + CI enforcement_ — Frontmatter schema validation (CHECK 12), D7a link
  resolution (CHECK 14), D7b extension-point match (CHECK 16), plus `npm run lint:arc:triggers`
  and `lint:arc:domain-rules` for whole-repo audits.

- _Probe-side `sessionType` inference_ — `inferSessionType()` computes from the resolved
  status file's tracked fields and emits `planning | execution | integration | null` in the
  composite probe envelope. SESSION-NOTES `**Session Type:**` is opt-in personal-layer
  override. Drives conditional item-9 / item-10 loadsets in `session-init.md`.

- _Partial-read narrowing_ — QUICK-REFERENCE scoped to `## Environment & Path Context`;
  status file scoped to `## Active Work`; task list strategic partial read (header + current
  phase preamble + current task section) with graduated lookup via triple-anchor task
  references (`Task X.Y — title (line ~N)`).

- _Worktree-sync completion_ — Probe envelope reports worktree state vs `origin/<branch>`;
  session-init Step 2 prompt logic for `prompt | manual` modes; research-validated rejection
  of an `always` mode for worktree pulls.

- _Operational-context audit (Tier 1–3)_ — Sweep across constitution, briefs, strategies, and
  workflows. Non-operational extractions staged in `notes-docs-content-sweep.md` with
  greppable `[TODO-docs-site]` placeholders.

- _Template extraction_ — `template-tasks.md` extracted to `.arc/reference/templates/`;
  `2_generate-tasks.md` hosts the Quick Format Checklist; strategy-task-list-formatting
  trimmed to rules-only.

- _ADR-013 Tier 2 amendment_ — Reflects the implemented per-file model and constitutional
  rule pair.

## Implementation Highlights

- _Trigger contract is structural, not prose_ — YAML frontmatter parsed at CI time replaces
  brittle prose-grep enforcement that was the main historical drift surface.

- _Probe-computed `sessionType` requires zero handoff ceremony_ for the 99% case. The
  originally-planned `Working On:` type-prefix design (PRD P2) was superseded mid-Phase-6 by
  inference from tracked status fields plus an opt-in SESSION-NOTES override. Boundary
  preservation (no marker drift) and simpler default behavior — see PRD History 2026-04-27 row.

- _Active-extensions list pattern_ decouples extension enumeration from extension execution.
  Single grep at session-init produces the list; fire-point directives (`#post-context-load`,
  `#pre-merge-review`) consult by name; method and extension bodies still load on workflow
  trigger only.

- _Triple-anchor task references_ enable graduated lookup robust to renumbering — line hint
  first, then task number, then title fragment.

- _Worktree `always` mode rejected by research_ — No mainstream precedent for auto-pulling a
  checked-out branch on session start; categorically larger risk surface than notes auto-pull
  (hook triggers, CI webhooks, working-tree dirt). Notes auto-pull retains `always` mode.

## Verification

- _Quality gates:_ md lint, ts/sh lint, typecheck (source + tests), unit + integration + E2E
  suites, build — all passed.

- _Success criteria:_ 16 of 16 met. Three deviations annotated inline:

    - #3 — `lint:arc` script lands as `lint:arc:triggers` (with companion
      `lint:arc:domain-rules`); functional coverage matches the criterion.

    - #12 / #13 — probe-side `sessionType` inference + SESSION-NOTES override superseded the
      originally-planned `Working On:` type-prefix design (PRD History 2026-04-27 row).

- _V.1 (token measurement):_ ~57–61k tokens at orientation in clean maintainer sessions
  (~24–28% below ~75–80k baseline, at the ≥25% threshold). Session-init wall-clock ~1 min vs
  ~2+ min pre-WU. Loadset content alone ~22.6k tokens; residual ~35k is harness floor (tool
  schemas, system prompt, skill registry, Read line-number overhead).

- _V.2 (audit spot-check):_ Sampled entries in `notes-docs-content-sweep.md` all correctly
  classify as non-operational extractions (conceptual framing, why-clauses, pedagogical
  decision aids, SSOT rationale). No operational loss observed.

- _V.3 (late-session):_ Deferred to next task-executing WU per PRD design — organic exercise,
  not synthetic test material.

## Follow-Up Work

- _Docs-site integration of operational-context extractions_ — Out-of-scope per PRD Non-Goals;
  routed to `plan-docs-content-sweep.md` as a separate WU. `notes-docs-content-sweep.md`
  carries the staged extractions with `[TODO-docs-site]` placeholders.

- _V.3 late-session verification_ — Will be exercised organically by the first post-merge
  task-executing WU. No explicit follow-up task; surfaces only if regressions observed.
