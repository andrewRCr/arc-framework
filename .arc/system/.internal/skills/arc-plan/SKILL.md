---
name: arc-plan
description: Begin or resume pre-spec design drafting for a new work unit, via iterative collaboration.
disable-model-invocation: false
---

# ARC Plan

Run `.arc/system/workflows/arc/draft-design.md`. It resolves the planning-depth level on the derivation axis —
pairing that read with the work unit's `Class` — and shapes the design at that depth: a quick determinacy-confirm
where the design reads off existing patterns, a bounded draft, or an iterative shaping loop where a real design
must be authored.

An optional positional argument supplies the starting point — a problem framing, an idea, or an existing
`draft-*` to resume from. A bare invocation starts from the problem as described.

This is collaborative facilitation: the developer formulates the design with the agent, not a finished plan
produced for approval. It is not a spec gate — create-spec remains the readiness gate downstream — and not for
use during active work-unit execution, where questions belong in the task loop.
