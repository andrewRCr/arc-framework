# Draft: Session Roles

- **Origin:** [internal] — minted at the 2026-10-30 housekeep drain from a `USER-INBOX § Work Unit` capture (the
  first project-management session's orientation, 2026-10-30).
- **Purpose:** Define a small set of ARC session roles, each with an entry, a load set, owned surfaces, an
  authority, a queue source, and a handoff.
- **State:** provisional stub, not now (2026-10-30: the plate is full). Concern recorded; nothing is settled.

---

## Problem / Motivation

- _Observation:_ A dedicated project-management (steering) session started on 2026-10-30 in the primary checkout. It
  advises on sequencing, capacity and milestone risk across work units and does no code work. ARC gives it no entry
  arm, load set, or handoff surface: it entered through `arc-session` as a free primary, loaded only the universal set,
  then read `RELEASE-GATES.md`, `cohort-state-storage.md` and live status by hand. Its working state (proposals awaiting
  the Owner, open lines, a watch list) has no home that survives compaction; the interim bridge is a gitignored
  `PM-NOTES.md` beside the steering map, laid out as a role charter. Roles already run ad hoc show the same gap: a
  primary session taking design-nuanced Errands, a Codex session taking determinate ones from a separate hand-kept list
  (`codex-list-a.md` and `claude-list-b.md`), and one session per work-unit worktree.

## Direction

- _Approach:_ The Owner is considering a basic role system: a few roles with defined responsibilities, each with what
  ARC supplies it — entry and load set, owned surfaces, authority (advise or decide), queue source, and handoff. Not now
  (Owner, 2026-10-30: the plate is full). Design the steering role alongside that system rather than as a one-off, since
  it may change the system's shape, and keep interim surfaces forward compatible: a role's state in personal files, no
  new ARC mechanism. Neighbors to check at drain: `goal-aware-direction`, which retires the steering map and supplies
  the recommender a steering session would read, and `agent-session-bridge`, which addresses sessions by locus.

- _Housekeeping split:_ the Owner leans toward keeping the inbox drain (`arc-housekeep`, `drain-inbox`) with the primary
  session (2026-10-30, not settled). The drain tests each capture against its target's current design, which the
  primary holds; it commits tracked backlog changes; and a full drain would crowd a long-lived steering session's
  context. The steering role would take the adjacent parts: ordering execute-bound Errands against the steering map,
  splitting them between the Codex and Claude queues, and checking a drain's new stubs and priorities against the map.

## Neighbors

- `goal-aware-direction` § Retires the steering map: the steering session is that map's working reader, and its
  working state is what `RELEASE-GATES.md`'s trial layout could not hold. That work unit also supplies the
  recommender a steering session would read.
- `agent-session-bridge` addresses sessions by locus.

---
