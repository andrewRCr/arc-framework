# Metadata: Work-Routing Discipline

- **State:** Shipped
- **Owner:** andrew
- **Branch:** `feat/work-routing-discipline`

- **Origin:** [internal]
- **Design:** `spec-work-routing-discipline.md`

- **Depends On:** [none]
- **Cohort:** [none]

- **Task List:** `tasks-work-routing-discipline.md`
- **Last Completed:** Task 7.1 — Complete verification (Tier 3 gates green; 15 success criteria all met, one
  Deviation annotated). Phase 7 complete — task list fully done.
- **Next Task:** [none] — verification complete; WU ready for integration.
- **Blockers:** [none]

- **Next Action:** integrate-work-unit Step 1 — verify completion.

---

## Release Notes Entry

Discovered work now follows one routing doctrine — capture holds, never executes; an errand *is* its
execution. The personal inbox is reshaped into two sections with a uniform target grammar, a between-WU
`arc-housekeep` drain routes captures to their homes, and errands run through a dedicated execution lifecycle
rather than resting in a queue.

**Breaking Changes:**

- Capture-surface and errand-model reshape (see Removed): `BACKLOG-INBOX` and the errand queue
  (`ERRANDS.md` / `arc-errand` skill / `arc errand queue`) are retired. Projects using them move multi-step
  captures to `USER-INBOX § Backlog` and run errands via `arc-session`.

### Added

- `arc-inbox` — unified capture skill writing managed entries to `USER-INBOX`, with an optional reminder flag
  on atomic captures.
- `arc-housekeep` — skill plus a gated, phased drain workflow (classify → confirm → route → optional execution
  transition) that drains `USER-INBOX` to no un-triaged entries from a base-branch context.
- `run-errand` — an execution-only errand lifecycle (Launch → Execute → Integrate) dispatched by `arc-session`,
  with promote-to-work-unit reachable from Execute.
- `USER-INBOX` two-section shape (`## Atomic` / `## Backlog`) with a uniform `WU_Target` entry grammar.
- Session-init: an inbox-state probe with a between-WU housekeep soft-offer, errand-resume and materialize
  arms, and a rate-limited in-flight-errand / reminder sweep.
- `strategy-work-organization § Auto-Merge Lane` — one-PR-per-lane, provisional-stub auto-merge, a
  four-condition review threshold, and the housekeep carve-out.
- Config validation for `inbox.remind_after_days` (positive-integer check).

### Changed

- `DEV-RULES.ARC § Discovered Work Routing` states the core invariant, the urgency×isolation capture decision
  table, the holding-vs-execution boundary, the concern-identity anti-rider test, and the
  planning-artifacts-aren't-capture anti-pattern; the planning-module, work-organization, and
  session-operations strategies are aligned to it.
- `ATOMIC-INBOX` is the atomic-only shared inbox; it drains via the `arc-housekeep` flow.
- `init-work-unit` warns on a non-empty `USER-INBOX`; `activate-work-unit` cleanup is narrowed to user-state.

### Removed

- `BACKLOG-INBOX` (template + file) — multi-step captures live in `USER-INBOX § Backlog` and graduate to
  backlog stubs.
- The errand queue: `ERRANDS.md`, the `arc-errand` skill, and `arc errand queue` (`arc errand check`, the
  advisory overlap check, survives).
- The integration ceremony's inbox-drain step (the drain moved to `arc-housekeep`).

## Completion Notes

Codified a single doctrine for routing discovered work and reshaped the surfaces and errand model to enforce
it. The throughline: a capture surface must never hold a known-home item (the core invariant), so the inbox
*holds* while execution flows through one top-level door (`arc-session`).

**Mid-WU re-pivots (dogfooding-driven).** Two corrections surfaced during execution, not planning:

- *Errand-model re-pivot* — codifying the doctrine exposed that the errand *queue* was itself a capture surface
  holding execution-bound items (the dual of the core invariant). Errands became execution-only: the
  `ERRANDS.md` queue, `arc-errand` skill, and `arc errand queue` retired; errand state derived from branch + PR;
  capture is inbox-only via `arc-inbox`; execution runs through `run-errand`. ADR-021 carries the amendment.
- *Drain-mechanism correction* — the first live drain of a real backlog exposed that the one-pass drain lacked
  a commitment gate and phase separation. `drain-inbox` was rewritten as a gated, phased flow (classify →
  mandatory confirmation → route → optional in-session `run-errand` transition), with at-drain tier re-triage
  and a `_Hold:_` retain escape-hatch distinct from `_Remind:_`. A two-mode integration drain (the
  `Inbound Buffer`) closed the "route a note into a foreign draft" gap.

**Verification.** Tier 3 gates green (2230 tests); 15 success criteria met. One Deviation: the parser shipped as
`parseUserInbox` + a shared `parseH3Section` helper rather than a single `parseUserInboxSection`; behavior
(two-section coverage, no silent drops) holds.

**Deferred / out of scope.** Concurrent-work integration discipline routed to the `concurrent-work-conventions`
stub; residual `doc-naming-convention` prose left for the `naming-conventions` reference cascade; the dev-build
staleness hard-fail-set evaluation captured to `USER-INBOX` for the release-tooling domain. The four `_Remind:_`
stayers in `USER-INBOX` are triaged retain-with-reminder captures bound for post-merge errand runs.
