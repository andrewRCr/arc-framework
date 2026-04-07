# Strategy: Session Management

> **Evidence base and rationale:** [Sessions & Context](https://andrewrcr.github.io/arc-framework/reference/sessions/)
> on the docs site covers degradation evidence, duration guidance, monitoring responsibilities,
> and auto-compaction reasoning.

Operational specification for ARC's session model. Covers the shared responsibility model for
context monitoring and session state portability. For the session lifecycle workflows, see
[session-init][session-init], [session-handoff][session-handoff], and [session-loop][session-loop].

---

## Contents

- [Shared Responsibility Model](#shared-responsibility-model) — who monitors what
- [Auto-Compaction](#auto-compaction) — operational guidance
- [Session State Portability](#session-state-portability) — cross-machine and team scenarios

---

## Shared Responsibility Model

Context monitoring is a shared responsibility between user and agent.

**The user is the primary monitor.** Users have persistent visibility into context usage through
platform-provided indicators — status bars, on-demand commands, threshold warnings. The user
decides when to trigger handoff based on context state, work progress, and judgment about session
quality. This is an active responsibility: check periodically, don't wait for emergencies.

**The agent is the secondary safety net.** Agent-specific configuration files (e.g.,
CLAUDE.ARC.md) may define threshold-based check-in behavior — "at ~150k tokens, stop and ask."
This catches cases where the user isn't monitoring, but it's imprecise: agents assess their own
token usage approximately, and the check-in interrupts workflow. It's a fallback, not the
designed mechanism.

**Monitoring thresholds:**

- General development: monitor from ~70% utilization, plan handoff by ~75-80%
- Complex reasoning: consider earlier handoffs at ~60-70%
- Light tasks: can tolerate up to ~85%
- Large windows (500K+): same proportional thresholds apply

---

## Auto-Compaction

ARC recommends disabling auto-compaction where platforms support it. This makes the user's
monitoring role explicit: the platform warns when context is filling, and the user responds
by triggering handoff.

**When you can't disable it:** Compensate with more frequent commits (reducing uncommitted work
at risk) and earlier handoffs (capturing state before compaction does). Understand your
platform's compaction behavior — when it triggers, what it preserves, how it signals — so you
can factor it into your workflow.

---

## Session State Portability

ARC's session state files — SESSION-NOTES.md and other personal workspace content in
`user/{identity}/` — are gitignored by design. This keeps personal context out of git history
but creates a portability challenge: session context doesn't travel with the branch when you
switch machines or hand off to a teammate.

### The git notes mechanism

ARC uses [git notes][git-notes] to serialize and transport personal workspace content without
polluting git history. A single notes ref — `refs/notes/arc/user/{identity}` — stores the user
directory contents as a note attached to HEAD at handoff time.

**How it works:**

- **Save** (`arc user save`): Serialize `user/{identity}/` contents to a git note on HEAD
- **Load** (`arc user load`): Restore user directory from git note (on HEAD, walking ancestors
  if needed)
- **Push/pull** (`arc user push` / `arc user pull`): Transport notes refs to/from remote

Session workflows integrate these automatically: session handoff triggers save + push; session
init triggers pull + load when local files are missing or stale.

**Push policy** (`user.sync_push` in `arc-config.yml`):

- `always` — solo default. Auto-push after save, no friction.
- `prompt` — team default. Conscious choice per handoff.
- `manual` — full control. Push only when explicitly requested.

Per-developer override via `git config arc.sync_push`.

### Scope

Any file in the `user/{identity}/` directory — session notes, inbox items (arc-in-git),
personal scratch notes — travels through one mechanism. New file types added to the user
directory are automatically included without additional plumbing.

---

[session-loop]: ../../../system/workflows/arc/session-lifecycle/session-loop.md
[session-init]: ../../../system/workflows/arc/session-lifecycle/session-init.md
[session-handoff]: ../../../system/workflows/arc/session-lifecycle/session-handoff.md
[git-notes]: https://git-scm.com/docs/git-notes
