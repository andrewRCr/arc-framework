---
name: arc-session
description: Initialize an ARC session — resume or start a work unit, or handle isolated work with --errand [<slug|description>], --housekeep, or --plan <anchor> [--include <stub>...].
disable-model-invocation: false
---

# ARC Session

Run `.arc/system/workflows/arc/session-lifecycle/session-init.md`. It consumes the reader-owned locus projection,
attaches the exact entering role, and dispatches its derived workflow/load set. Never select entry from branch
shape, active-meta hints, or a second worktree scan.

An optional positional argument supplies an **entry seed** — a spec pointer or description that the workflow's
new-work arm consumes (confirmed before use). A bare invocation enters per the probe.

An optional `--next` flag is a **per-invocation auto-proceed modifier** for an active work unit's Next Action.
It never relocates the checkout, never starts new work, and is not a configuration default. The workflow decides
whether the resolved arm can skip its final proceed prompt; otherwise `--next` falls back to normal orientation.

An optional `--start <slug>` flag is the **focused-recon arm** — the agentic know-what-to-start door, symmetric
with the no-agent bare `arc start <slug>`. Checkout-preserving and arm-orthogonal (it launches the named target
into its own spawned worktree, leaving the active checkout untouched), it loads the universal context, runs a
deterministic readiness recon on the named backlog WU, and closes on an informed launch prompt. It still honors
sync, dirty-tree, and freshness surfaces and stop-and-ask mismatches; on launch, the spawned `arc start`'s
commit/push interlocks and `Class` guard fire unchanged, and it hands off to a fresh in-worktree session rather
than continuing in place.

An **explicit-intent signal** instead routes session entry through its transient allocation verb, regardless of
what is active. A WU-owned checkout is preserved and never switched or repurposed. Each signal is orthogonal to the
positional seed:

- `--errand [<slug|description>]` — isolated atomic work. A bare `--errand` (no slug/description) is supported:
  the entry elicits the concern, or adopts a flagged `USER-INBOX § Errand` capture.
- `--housekeep` — drain the user inbox to its authoritative homes (reaches the `arc-housekeep` skill).
- `--plan <anchor> [--include <stub>...]` — open one exact immutable set of branchless `planned`/`provisional`
  backlog members through `arc plan open`. The anchor-only shorthand is a one-member set. Reject any started WU;
  changing membership requires closing or abandoning before reopening the complete set.
