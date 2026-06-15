# Draft: Compaction Recovery

**Purpose:** Define a small recovery bridge for native auto-compaction — an ARC-emitted seed, a
`session-recover` workflow, and optional harness adapters — without reversing ARC's bounded-session
model.

- **State:** Planning — promoted from provisional on 2026-06-01 after the trigger model narrowed to a
  reliable hook path plus a manual recovery skill fallback.
- **Created:** 2026-05-21
- **Origin:** Surfaced 2026-05-21 revisiting ARC's compaction stance. Native compaction (Claude Code,
  Codex) has improved markedly; some practitioners now forgo manual session-state recording entirely.
  ARC's position (bounded, human-controlled sessions; `strategy-session-operations.md` § Auto-Compaction
  recommends disabling auto-compaction) intentionally rejects black-box compaction in favor of explicit
  handoff. This plan does not challenge that — it explores a fallback for the "can't disable it" case.

---

## Context

ARC bypasses compaction by design. Rationale (`adr-002`, P5): session state must be recoverable
through *human-controlled, transparent* mechanisms; bounded sessions also enforce scope discipline
(P1/P3) and create natural review points. The position is unchanged — the bounded-session model is a
deliberate choice, not a workaround for weak compaction, and improving compaction does not retire it.

The open question is narrow: for platforms where auto-compaction *cannot* be disabled, or where a
session unexpectedly needs to survive compaction long enough to reach handoff, can ARC make recovery
deterministic without pretending it can inspect or control the harness's compacted summary?

## Design

ARC owns the recovery path, not the compaction event. The design has three ARC-owned surfaces and one
optional harness-adapter layer:

- **Compaction-seed emitter:** `arc status --compaction-seed` renders a compact, inspectable summary
  from ARC state: repo root, ARC invocation convention, branch/HEAD/dirty state, active WU, meta path,
  current task, next action, session type, current workflow pointer, active constraints, recent
  post-handoff decisions, and uncommitted-work summary. A `--write` mode stores the latest seed in a
  predictable local path for hooks and recovery workflows.
- **`session-recover` workflow:** re-enters through normal session-init, reloads the T1/T2 context set
  selected by the current state, compares current reality to the seed, and resumes only when the
  recovery audit matches. Mismatch, missing identity, dirty-state surprise, or lost task pointer stops
  for user direction.
- **`arc-recover` skill:** thin user-invocable wrapper over `session-recover`, for harnesses without
  usable hooks or for manual recovery when the user notices compaction just happened.
- **Harness adapter recipes:** optional reference integrations that invoke the same seed/recover path
  from a harness hook system. These are convenience adapters, not methodology requirements.

The seed is deliberately not a full reload of `AGENT-BRIEF`, `DEV-RULES`, or strategy content. It is a
recovery manifest: enough state to know what must be reloaded, what must match, and when to stop.

## Trigger Model

Compaction recovery is only reliable when something invokes it. ARC cannot define one universal trigger,
so the model ranks trigger paths explicitly:

1. **Harness hook path (preferred):** a pre-compaction hook writes the seed; a post-compaction or
   compact-session-start hook injects the recovery instruction or blocks when the seed is unavailable.
2. **Manual skill path:** the user invokes `arc-recover` after noticing compaction. Less elegant, but
   portable and honest.
3. **Behavioral tripwire:** if a retained seed appears in context after compaction, its first instruction
   tells the agent to run `session-recover` before continuing. Useful as a backstop, not a guarantee.

Current Codex CLI hook docs make a stronger reference recipe possible than a generic post-hook alone:
`PreCompact` can write the seed, `SessionStart` with source `compact` can add model-visible recovery
context, and `PostCompact` can validate or warn. ARC can package this as a reference implementation and
offer installation during verify-and-configure, but installation must remain explicit because hooks run
local commands and require harness trust.

## Canonical vs. Harness-Specific

- **Harness-agnostic (ARC-owned):** seed schema/emitter, `session-recover`, `arc-recover`, recovery
  audit semantics, and portable instructions.
- **Harness-specific (adapter-owned):** hook event names, hook config files, trust prompts, how context
  is injected, and whether compaction can be detected automatically.

This preserves P8: ARC defines the recovery contract; harness adapters bind it to particular tools.

## Relationship to the Existing Model

`research-context-degradation.md` § 4.3 names "out-of-context persistence" (Strategy 6) as a
recommended long-horizon technique — the agent writes structured notes outside the window. ARC's
**handoff is exactly this, at the session boundary.** The compaction seed is the *mid-session* analog:
the same structured state, surfaced for a within-session reset rather than a cross-session one. Framed
this way it extends the model rather than competing with it.

The default recommendation remains unchanged: disable auto-compaction where possible, monitor context
usage, commit at natural boundaries, and hand off earlier. `session-recover` is an emergency bridge for
sessions that compact before they can reach handoff.

## Considered

- **`arc-refresh` (mid-session reload of core T1).** A command that re-injects DEV-RULES / core
  constitutional content mid-session to counter "lost in the middle" drift. Leaning reject: observed
  drift is attributable to letting sessions run too long / span too many tasks — a session-length
  discipline matter, not a structural gap. A reload mechanism risks "ambiguous authority" (duplicate
  instructions at different context positions; `research-instruction-reliability.md` § 6) and treats the
  symptom rather than the cause. Better mitigation: keep sessions bounded. Captured here because it is
  the sibling "mid-session context-health intervention" to the seed idea.
- **Post-compaction reload as recovery, not refresh.** `session-recover` intentionally reloads
  session-init context after a compaction discontinuity. That is different from a routine mid-session
  refresh: it restores the authoritative load set after the harness has rewritten the conversation.

## Implementation Notes

Interim implementation can consume today's `arc status --session-init --json` envelope plus the current
markdown state files. ADR-022 remains the target model: once managed operational-state records exist, the
seed reads records/schema instead of parsed markdown. Do not block the first recovery slice on ADR-022.

The Codex adapter should live as an optional recipe: hook config, small scripts, and verify-and-configure
offer text. The portable `arc-recover` skill remains the fallback even when a hook recipe exists, because
hooks may be unavailable, disabled, untrusted, or tool-version-specific.

## Cross-References

- `adr-002` — session model + agent-compatibility envelope; P5 context-preservation. A change in stance
  here would warrant an ADR amendment.
- `strategy-session-operations.md` § Auto-Compaction — the current recommendation and the "can't disable
  it" arm this plan backstops.
- `research-context-degradation.md` § 4.3 — out-of-context persistence; compaction strategies.
- Codex CLI hooks documentation — reference adapter target for `PreCompact`, `PostCompact`, and
  `SessionStart` with source `compact`.

## Out of Scope

- Any change to ARC's default stance (disable auto-compaction; rely on bounded sessions + handoff).
- Standardized cross-harness compaction feed-in (P8).
- Reversing or weakening the bounded-session model.
- Automatic hook installation without explicit user opt-in and harness trust.

---

## Coordination — ADR-022

The target seed reads the managed operational-state document records/schema (ADR-022) — its premise that
ARC "already produces structured state" is fully realized by the model; the final emitter consumes records,
not parsed markdown. The first slice may use today's probe + markdown readers as an interim bridge. See
`adr-022-managed-operational-state-documents.md` § Coordination.

## Coordination — `unit-scoped-review` (cross-cohort: `approval-flow-refinement`)

`unit-scoped-review` (deferring the review increment to a whole WU) leans on this plan as a **backstop**, not a
prerequisite: its orchestration architecture keeps every context bounded (judgment in a lean primary; execution
in disposable per-phase subagents), so it *sidesteps* compaction rather than depending on surviving it. Even so,
the orchestrator reads each phase's diff to validate, so a very large WU can still compact — `session-recover`
(the recovery-after-discontinuity path here, **not** the rejected routine `arc-refresh`) is its safety net.

**Two-way alignment, flagged for this draft's next planning iteration.** Several framing assertions here —
"emergency bridge only," the unchanged "disable auto-compaction" default, and the `arc-refresh` rejection
rationale ("drift is from sessions running too long / spanning too many tasks") — are in tension with a
deliberately-long, opt-in batch mode and are likely overcautious. The resolution is *alignment, not workaround*:
orchestration answers the bounded-*context* concern (no single context holds too much), so this plan's blanket
anti-long-session stance should soften from "no" to "a scoped, orchestrated exception exists, with
`session-recover` as its backstop." Neither draft is more authoritative; reconcile them. See
`draft-unit-scoped-review.md` § ADR-002 / P5 reckoning and `cohort-approval-flow-refinement.md` § Cross-cohort.
