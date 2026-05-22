# Draft: Compaction Seed

**Purpose:** Explore a harness-agnostic middle ground for native auto-compaction — an ARC-emitted
"seed" of structured session state that, where compaction cannot be disabled, gives it a high-fidelity
preserve-these payload — without reversing ARC's bounded-session model.

- **State:** Draft (provisional) — exploratory capture 2026-05-21. Lower priority than the model it
  backstops; revisit only if compaction interop becomes a pressing concern.
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

The open question is narrow: for platforms where auto-compaction *cannot* be disabled (the "when you
can't disable it" arm already acknowledged in `strategy-session-operations.md` § Auto-Compaction), can
ARC make compaction *less* of a black box by feeding it structured state?

## The Middle-Ground Idea

ARC already produces structured session state on demand — the session-init/handoff probe envelope, the
active `meta-{name}.md`, and SESSION-NOTES. A **compaction-seed emitter** (e.g.,
`arc status --compaction-seed`) would render a compact, ordered state summary from those sources:
position pointer (WU, branch, current task), active constraints (WORKING-MEMORY triggers), and the next
action. Where the harness supports seeding or a pre-compaction hook, that payload becomes the "preserve
these facts" instruction; where it doesn't, the user can paste it manually before allowing compaction.

This reframes compaction from "summarize whatever's in the window (black box)" toward "preserve this
known-good structured state, summarize the rest" — closer to ARC's explicit-state philosophy.

## Canonical vs. Harness-Specific (the P8 boundary)

- **Harness-agnostic (could be ARC):** the *seed emitter*. It reads ARC's own structured state and
  emits a deterministic, inspectable summary. No harness assumptions.
- **Harness-specific (not ARC):** *wiring the seed into a given harness's compaction.* Every harness
  compacts differently (triggers, what it preserves, how it's configured). A standardized cross-harness
  feed-in violates P8 (agent-agnostic). That integration is the harness's / adopter's responsibility;
  ARC at most documents the pattern per supported harness.

This boundary is why the idea stays *provisional and light* rather than a committed feature: the part
ARC can own (the emitter) is small; the part that makes it useful (harness wiring) is outside ARC's
remit.

## Relationship to the Existing Model

`research-context-degradation.md` § 4.3 names "out-of-context persistence" (Strategy 6) as a
recommended long-horizon technique — the agent writes structured notes outside the window. ARC's
**handoff is exactly this, at the session boundary.** The compaction-seed is the *mid-session* analog:
the same structured state, surfaced for a within-session reset rather than a cross-session one. Framed
this way it extends the model rather than competing with it.

## Considered — Leaning Reject

- **`arc-refresh` (mid-session reload of core T1).** A command that re-injects DEV-RULES / core
  constitutional content mid-session to counter "lost in the middle" drift. Leaning reject: observed
  drift is attributable to letting sessions run too long / span too many tasks — a session-length
  discipline matter, not a structural gap. A reload mechanism risks "ambiguous authority" (duplicate
  instructions at different context positions; `research-instruction-reliability.md` § 6) and treats the
  symptom rather than the cause. Better mitigation: keep sessions bounded. Captured here because it is
  the sibling "mid-session context-health intervention" to the seed idea.

## Graduation Trigger

Revisit when one holds: (1) ARC formally supports a harness whose compaction *cannot* be disabled and
adopters hit state-loss; (2) a concrete pre-compaction hook / seed API appears in a Tier-1 harness
worth targeting; (3) the bounded-session model proves insufficient for a real workflow. Until then, the
recommendation in `strategy-session-operations.md` § Auto-Compaction (disable it; compensate with
commits + earlier handoffs) stands.

## Cross-References

- `adr-002` — session model + agent-compatibility envelope; P5 context-preservation. A change in stance
  here would warrant an ADR amendment.
- `strategy-session-operations.md` § Auto-Compaction — the current recommendation and the "can't disable
  it" arm this plan backstops.
- `research-context-degradation.md` § 4.3 — out-of-context persistence; compaction strategies.

## Out of Scope

- Any change to ARC's default stance (disable auto-compaction; rely on bounded sessions + handoff).
- Standardized cross-harness compaction feed-in (P8).
- Reversing or weakening the bounded-session model.

---
