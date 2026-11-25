# Draft: Personal Guidance Home

- **Origin:** [internal] — minted at the 2026-10-13 housekeep drain from the `USER-INBOX` capture "Give standing
  personal guidance a user-scoped, harness-neutral home".
- **Purpose:** Give standing personal guidance a home scoped to the person and independent of any one agent harness.
- **Planning posture:** provisional, `P3`; `Class` settles at planning.

---

## Captured concern

### Give standing personal guidance a user-scoped, harness-neutral home

- _Observation:_ `WORKING-MEMORY` is the only user-scoped surface ARC loads, and every entry needs a `_Remove when:_`
  trigger, so it frames all content as temporary. Standing guidance (a preference, or a fact about how this developer
  works that stays true while a condition holds) has nowhere natural to go. What exists is per-harness
  (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`), so it is written once per harness and drifts, or tracked
  (`QUICK-REFERENCE`, a project `CLAUDE.md`), so it binds every clone and contributor. Surfaced placing a note about
  this machine's check runner: it fit only as a `WORKING-MEMORY` entry with a contrived trigger.

- _Approach:_ keep the anti-rot discipline the removal trigger provides rather than adding an untriggered section:
  a standing entry names the condition that keeps it true (`keep while`), reviewed at handoff as removal triggers are.
  Separate user scope from machine scope: `WORKING-MEMORY` follows the identity across machines, so a machine fact
  there is safe only when phrased conditionally; machine facts belong with the per-machine configuration tier
  `config-storage-architecture` is designing. Weigh the always-loaded cost: every standing entry is paid each session.

- _Captured during:_ the `check-runner-hook` Errand's close-out discussion, 2026-10-11.

## Coupling

- `handoff-optimization` § Approach item 3 moves `WORKING-MEMORY`'s `_Remove when:_` lines to structured triggers the
  CLI evaluates; a standing entry's trigger variant meets it there.
- `seam-locus` § 6 owns the `WORKING-MEMORY` entry grammar from the flip.
- Machine facts meet `config-storage-architecture` § Approach's tier table.
- Always-loaded cost meets `loadset-composition`'s Layer 2 audit.

---
