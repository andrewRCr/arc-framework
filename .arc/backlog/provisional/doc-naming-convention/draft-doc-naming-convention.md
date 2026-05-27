# Draft: Doc Naming Convention

**Purpose:** Formalize the `TYPE.QUALIFIER` naming convention for ARC's paired / multi-instance doc
surfaces, codify the scope-ladder qualifier, and apply it via a set of file + section renames (inbox
collapse, `STATUS` / `MEMORY` / `NOTES` families). The work is naming + cascade; no behavioral change.

- **State:** Provisional — captured from Worktree Foundation planning (2026-05-24). Convention and renames
  settled in discussion; cascade scope, sequencing, and migration not yet planned.

- **Created:** 2026-05-24

- **Origin:** Surfaced while naming WF's new user-scoped in-flight view. Choosing that name exposed an
  emergent, half-applied convention across ARC's doc surfaces (`DEV-RULES.*`, `AGENT-BRIEF.*` already
  conform; the inboxes, the readiness view, and the personal-context files do not). Capturing the whole
  convention rather than naming one new file in isolation.

---

## Problem / Motivation

ARC already uses `{TYPE}.{QUALIFIER}` for two paired doc families — `DEV-RULES.{ARC,PROJECT}` and
`AGENT-BRIEF.{ARC,PROJECT}` — but the pattern is half-applied. The inboxes (`USER-INBOX`, `ATOMIC-INBOX`,
`BACKLOG-INBOX`), the readiness view (`ROADMAP`), and the personal-context files (`SESSION-NOTES`,
`WORKING-MEMORY`) do not follow it, and WF is about to add another surface (its user-scoped in-flight
view). Naming that surface in isolation would entrench the inconsistency; naming the whole system makes
every surface legible at a glance.

## The convention

**`{TYPE}.{QUALIFIER}`**, where the qualifier is drawn from a **scope ladder**:

> `ARC` ⊃ `PROJECT` ⊃ `USER` ⊃ `SESSION` — framework, then this project (shared), then this developer,
> then this WU/session.

The TYPE names the kind of document; the qualifier names its scope. Each conforming pair shares both a
TYPE *and an update model* — that shared update model is *why* the members share a TYPE (see § Why
`MEMORY` ≠ `NOTES`). Codification home: `strategy-file-classification.md` (which already governs naming
conventions).

One accepted wrinkle: `.PROJECT` contrasts with `ARC` in `DEV-RULES.PROJECT` but with `USER` in
`INBOX.PROJECT` — the contrast member shifts by axis. `.PROJECT` consistently means "project-level"; the
sibling tells you the axis. Not worth solving.

## Renames

| Current                                 | Renamed                       | Scope            | Location           |
| --------------------------------------- | ----------------------------- | ---------------- | ------------------ |
| `USER-INBOX.md`                         | `INBOX.USER.md`               | user             | `user/{id}/`       |
| `ATOMIC-INBOX.md` + `BACKLOG-INBOX.md`  | `INBOX.PROJECT.md` (collapse) | project (shared) | `backlog/`         |
| `ROADMAP.md`                            | `STATUS.PROJECT.md`           | project          | `backlog/`         |
| *(new — WF builds)*                     | `STATUS.USER.md`              | user             | `user/{id}/`       |
| `WORKING-MEMORY.md`                     | `MEMORY.USER.md`              | user             | `user/{id}/`       |
| `SESSION-NOTES.md`                      | `NOTES.SESSION.md`            | session/per-WU   | `user/{id}/<wu>/`  |

Section anchors inside both inboxes rename from `## Atomic` / `## Backlog` to **`## Atomic` / `## Work
Unit`** — the character axis ARC already routes on ("inboxes route by character, not wrapper presence"),
retiring the bad "backlog" section name (it collides with the `backlog/` directory). Errand is *routing
language* inside `## Atomic` (an atomic capture becomes an Errand or folds into current work), not a
section name — name by character, not vehicle.

## Design decisions

**Collapse the two shared inboxes.** `INBOX.PROJECT` (two character sections) mirrors `INBOX.USER` (two
sections) — symmetric, and it makes the qualifier a *pure scope axis* (`USER` / `PROJECT`) instead of the
mixed scope+character axis a three-file `INBOX.{USER,ATOMIC,BACKLOG}` would carry. The growth concern (a
shared project surface accumulating) is a *drain-discipline signal*, not a structural defect — both
sections are designed to empty (atomics done/folded; WU-candidates graduated to stubs). The one real cost
is marginally more append-contention on a single file (atomic + WU appends can collide), pre-existing
mutated-state territory per ADR-020, mitigated by `merge=union` and low in solo/small-team use.

**Why `MEMORY` ≠ `NOTES` (don't unify to `MEMORY.SESSION`).** They have different *update models*, and the
TYPE encodes it: `MEMORY` is an accumulating store of discrete entries, each individually conditioned
(`_Remove when:_`), surviving across many sessions/WUs — you add and prune. `NOTES.SESSION` is a single
snapshot, wholesale-rewritten each handoff — you replace. Every other conforming pair (`DEV-RULES.*`,
`INBOX.*`, `STATUS.*`) shares an update model within its TYPE; unifying these two under `MEMORY` would
create the only pair whose members don't — false symmetry. They also live in different directories, so a
shared TYPE buys no sorting benefit anyway. `MEMORY.USER` joins a clean `.USER` root family
(`INBOX.USER` / `STATUS.USER` / `MEMORY.USER`); `NOTES.SESSION` is correctly the per-WU outlier. (`MEMORY`
is also an accuracy gain over "working memory," which implied transient/active — the file is
persistent-but-pruned.)

**`INBOX.USER`, not bare `INBOX`.** Location alone would disambiguate, but family consistency wins: when
`INBOX.USER` / `INBOX.PROJECT` appear together in prose or globs, the parallel reads cleanly.

**Maintenance mode is not in the name.** Within `.USER`, `STATUS.USER` is derived, `MEMORY.USER` /
`NOTES.SESSION` are agent-maintained, `INBOX.USER` is mixed. Maintenance is orthogonal to scope and varies
within a scope, so it is a documented property (or frontmatter if ever machine-legible), never a filename
component.

## Coordination and dependencies

- **`roadmap-tooling`** owns the `ROADMAP → STATUS.PROJECT` rename (it parked the ROADMAP rename and builds
  the renderer). This WU and roadmap-tooling must agree on `STATUS.PROJECT` and sequence the rename once
  (avoid a double cascade). WF's planning routed the `STATUS` lean there.
- **`handoff-optimization`** carries SESSION-NOTES *content/template* cleanup (a USER-INBOX § Backlog
  entry). That is distinct from this WU's `SESSION-NOTES → NOTES.SESSION` *filename* rename, but they touch
  the same surfaces — coordinate so one sweep does both.
- **Worktree Foundation** builds `STATUS.USER` and should name it per this convention from the start
  (forward-compat), even though the rest of the renames land here.
- The item-6 sync dispatch keys on *path/directory class* (per-WU subdir vs. user root), not filenames, so
  the file renames do not break `arc user save/load` — de-risks the cascade.

## Cascade scope (the real cost)

References to rename live across DEV-RULES (ARC + PROJECT), the session workflows (init / handoff),
strategy docs (file-classification, session-operations, work-organization), templates, CLI paths /
messages, and ROADMAP regen tooling. Mechanical but broad — comparable to the ROADMAP-rename cascade
`roadmap-tooling` already flags. Infra-touching → a planned WU, not atomic.

## Open questions

- Final sequencing with `roadmap-tooling` (STATUS.PROJECT) and `handoff-optimization` (SESSION-NOTES
  content) — one combined sweep or staged?
- `STATUS` vs `DASHBOARD` was settled to `STATUS`; confirm no live collision with the `arc status`
  command (different namespace — command vs. file — but the *render command* should not be named
  `status`).
- Whether the `## Atomic` / `## Work Unit` section rename ships with the inbox collapse or separately.

## Scope Estimate

Small–Medium. No behavioral change; the work is rename + cascade + the file-classification codification.
Size is dominated by reference breadth and cross-WU coordination, not logic.

## Coordination — ADR-022

ADR-022 classifies the managed operational-state documents *by role* and is rename-agnostic; this WU owns the
file renames (`WORKING-MEMORY → MEMORY.USER`, `SESSION-NOTES → NOTES.SESSION`, `ROADMAP → STATUS.PROJECT`,
etc.). The managed-doc class concept is a motivation for the rename, but timing stays this WU's call. See
`adr-022-managed-operational-state-documents.md` § Coordination.
