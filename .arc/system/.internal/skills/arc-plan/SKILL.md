---
name: arc-plan
description: Begin or resume pre-spec design drafting for one explicit branchless backlog set, via iterative collaboration.
disable-model-invocation: false
---

# ARC Plan

Run `.arc/system/workflows/arc/draft-design.md`. It resolves planning depth and shapes the design at that depth: a
quick determinacy confirmation, a bounded draft, or an iterative shaping loop where a real design must be authored.

Use one anchor plus optional explicit included members: `<anchor> [--include <stub>...]`. Pass that exact set to
`arc plan open`; the anchor-only shorthand is a one-member set. Every member must be a branchless planned or
provisional stub. Reject started WUs, and never enlarge a live set in place — close or abandon it before reopening
with the complete membership.

This is collaborative facilitation: the developer formulates the design with the agent, not a finished plan
produced for approval. It is not a spec gate — create-spec remains the readiness gate downstream — and not for
use during active work-unit execution, where questions belong in the task loop.
