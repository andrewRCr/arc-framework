---
name: arc-session
description: Initialize an ARC session — resume or start a work unit, or handle isolated work with --errand [<slug|description>], --housekeep, or --plan <stub>.
disable-model-invocation: false
---

# ARC Session

Run `.arc/system/workflows/arc/session-lifecycle/session-init.md`. It resolves the session probe and
dispatches the entry mode — resume or start a work unit, orient when none is active, or enter errand
mode — establishing session context.

An optional positional argument supplies an **entry seed** — a spec pointer or description that the workflow's
new-work arm consumes (confirmed before use). A bare invocation enters per the probe.

An optional `--next` flag is a **per-invocation auto-proceed modifier** for an active work unit's Next Action.
It never relocates the checkout, never starts new work, and is not a configuration default. The workflow decides
whether the resolved arm can skip its final proceed prompt; otherwise `--next` falls back to normal orientation.

An optional `--start <wu-slug>` flag is a **no-active-WU start shortcut** for the existing work-unit start
transition. It bypasses discovery and the confirm-only init offer for the named backlog WU, but still honors
sync, dirty-tree, and freshness surfaces; stop-and-ask mismatches; init commit/push interlocks; and the `Class`
guard.

An **explicit-intent signal** instead routes session entry to an out-of-work-unit locus, regardless of what is
active — the resumed work unit's checkout is preserved. Each is orthogonal to the positional seed:

- `--errand [<slug|description>]` — isolated atomic work. A bare `--errand` (no slug/description) is supported:
  the entry elicits the concern, or adopts a flagged `USER-INBOX § Errand` capture.
- `--housekeep` — drain the user inbox to its authoritative homes (reaches the `arc-housekeep` skill).
- `--plan <stub>` — groom a `backlog/` stub's draft (`planned` or `provisional`) in place, resumable via
  `--plan <stub>` across sessions.
