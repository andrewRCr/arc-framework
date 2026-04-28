# Plan: Completion + Status File Consolidation

## Problem / Motivation

ARC currently maintains two artifacts per work unit that overlap in purpose: `status-{name}.md` (tracked
project pointer during the WU's life) and `completion-{name}.md` (created at integration time as the
durable archive record). The overlap surfaces as "doubles as" framing in `template-completion-doc.md`
and `integrate-work-unit.md` — the completion doc is described as both the archive entry point AND the PR
body draft, conflating two distinct audiences (the post-merge archive reader and the pre-merge reviewer)
into one artifact.

The deeper structural problem: most projects use the PR itself plus commit history as the durable change
record and don't carry an in-repo parallel. ARC's completion doc was an attempt to make that record
git-native — consistent with ARC's broader in-repo planning model — but ended up duplicating content the
status file already carries (during life) and the PR carries (post-merge). The artifact's unique value
reduces to "in-repo executive summary at archival" — which the status file can carry just as well if it
survives into archive instead of being deleted.

Surfaced 2026-04-28 while scoping the PR body template incidental: wording fixes needed in
`integrate-work-unit.md` Step 7 and `template-completion-doc.md` would have papered over this deeper
conceptual gap rather than resolving it. Better to consolidate.

## Relationship to Other Plans

[plan-session-operational-flow][plan-ops] § metadata-state foundation already touches status-file shape
(Spec field surfacing, Integration field surfacing at session-init). This plan extends the same artifact
along its lifecycle axis — what happens to the status file at archive. Possible paths at PRD time:

- **Fold into plan-ops § metadata-state foundation** — same artifact, related concerns; one PRD could
  carry both the field-set work and the lifecycle work.
- **Standalone WU after plan-ops lands** — keeps plan-ops's scope tight; consolidation builds on the
  finalized field set.

Either path works; the lifecycle change here doesn't depend on the field-set decisions in plan-ops, but
landing both into one artifact is cleaner if scope allows.

## Scope

### In scope

**Eliminate `completion-{name}.md` as a distinct artifact.** Stop creating completion docs at integration
time. Delete `template-completion-doc.md`. Remove the completion-metadata creation step from
`integrate-work-unit.md` (Step 3 today) and the completion freshness check (Step 6b today).

**Repurpose status file as the post-merge durable record.** At archive (post-merge), transform the status
file: clear life-phase fields (Next Action, Blockers, integration-step pointers), populate archive-phase
fields (Pull Request URL, Completed date, Executive Summary). The file moves to the archive directory
alongside the task list rather than being deleted. Filename stays `status-{name}.md` — PR link plus
executive summary keep "status" apt as the WU's terminal record.

**Status file template — single template, two-path shape.** Show life-phase fields and archive-phase
fields in the same template, clearly labeled by phase. Both variants are short; one document covers both.
Active-life shape stays as-is; archive shape is the new addition.

**Workflow updates:**

- `archive-work-unit.md` — change "delete status file" to "transform status file" (clear life-phase
  fields, populate archive-phase fields, compose executive summary). Summary composition lands as a
  Tier-1 step at archive so authorship happens close to merge while context is fresh.
- `integrate-work-unit.md` — remove the completion-metadata creation step and the freshness check;
  rewrite the push-and-PR step to drop completion-doc-as-PR-source framing. PR URL is no longer captured
  pre-merge — eliminates the standalone PR-URL-fill-in commit currently sitting between PR creation and
  merge.

**Surface sweep.** Update all references to completion docs across workflows, strategies, and rules
documents. Likely candidates: `clean-work-unit.md` (Mode 2 produces fields the completion doc reads),
`DEV-RULES.ARC.md` § Session Management (status file lifecycle text), `strategy-work-organization.md`
(archive lifecycle and WU state model), `strategy-task-list-formatting.md` (cross-references),
`AGENT-BRIEF.ARC.md` (directory structure note). Full grep audit at PRD time.

**Migration: forward-only.** Existing archived WUs keep their completion docs as historical artifacts.
New WUs use the consolidated model. Document the cutover in DEV-RULES.ARC § Session Management or
wherever the consolidation lands.

### Out of scope

- PR body template design — separate incidental currently active on this branch; PR template is drafted
  to be input-agnostic so it ships independent of this WU.
- Changes to task list lifecycle, atomic companion file lifecycle, or archive directory structure beyond
  what's needed for the status file transformation.
- Backfill or retroactive migration of existing archived completion docs to the consolidated shape.
- Changes to the `Superseded By` / partial-supersession mechanism (currently splits across status file
  and completion doc; merges to the status file alone under the new model — field move, no semantic
  change).

## Open Design Choices

**Field set for archive-phase status file.** Minimum: Pull Request URL, Completed date, Executive
Summary. Possibly also: a soft retrospective surface (deviations from plan, notable decisions worth
capturing for future planners), marked optional and fed by the PRD-alignment notes already gathered in
`integrate-work-unit.md` Step 1. Whether retrospective content is its own optional section or folds
into Executive Summary is a PRD decision.

**Authorship-gap mitigation for executive summary.** Post-merge timing means the summary is composed
later than today's pre-PR creation. Three options:

- _Tier-1 step in archive-work-unit:_ block archive completion until summary is composed.
- _Soft prompt with reminder mechanism:_ archive proceeds, but a follow-up reminder fires if summary
  remains empty after N days.
- _Author judgment:_ workflow prompts but doesn't enforce; trust authors to compose promptly.

Lean: Tier-1 step. ARC archives promptly post-merge already; one more required step at the ceremony
is consistent and avoids an empty-summary failure mode.

**Single template with phase labels vs. two sub-templates.** How to represent the dual-shape status file.
Lean: single template with phase-labeled sections — both shapes are short, and a single doc avoids
template-drift between life and archive variants.

**Folding decision** (per § Relationship to Other Plans). Resolve at PRD time once plan-ops's field-set
work is far enough along to evaluate fit.

## Unknowns and Assumptions

- **Assumption:** `archive-work-unit.md`'s transformation step is bounded — comparable to today's
  "clean status file fields" work plus summary composition. Validate by reading the current archive
  workflow at PRD time.
- **Assumption:** Forward-only migration is acceptable to users; archive directory becomes mixed-format
  during transition (existing archives have completion docs, new ones have repurposed status files).
  If beta / dogfooding feedback resists this, add backfill scope.
- **Unknown:** Surface-sweep extent. Grep audit at PRD time identifies all completion-doc references;
  scope may grow modestly if more references exist than anticipated.
- **Unknown:** Whether the consolidated-mode reviewer experience is acceptable. Today reviewers see a
  structured summary (completion doc) in the PR diff alongside code changes. Under the new model, the
  PR body alone carries that load. PR body template (separate WU) needs to be self-sufficient. If
  beta feedback shows reviewers miss the in-tree summary, revisit.

## Scope Estimate

**Small-to-medium** (1–3 days). Rough breakdown:

- Workflow edits (`integrate-work-unit.md`, `archive-work-unit.md`, `clean-work-unit.md`): 1 day.
- Status file template update (two-path representation): half-day.
- Surface sweep + reference updates: half-day to 1 day (depends on grep findings).
- Tests for workflow changes (where applicable): TBD per project conventions.

**Dependencies:**

- **Soft dependency on [plan-session-operational-flow][plan-ops] § metadata-state foundation.** That
  work is already touching status-file shape (Spec, Integration field surfacing). This consolidation
  should land after or fold into that work — folding is cleanest, standalone is acceptable.
- **Coupled with the active PR body template incidental.** PR template's design assumes its input
  (completion doc today, work + commits + spec under the consolidated model). Template is drafted
  input-agnostic; this WU makes the completion-doc input go away. PR template ships first and stands
  independent; this WU follows.

**Scheduling:** After the current PR body template incidental ships. After or folded into
plan-session-operational-flow's metadata-state foundation. Before public release / dogfooding — the
WU artifact shape should be settled before broader user exposure.

**Pre-approved split:** None — small enough to ship as one WU.

---

[plan-ops]: plan-session-operational-flow.md
