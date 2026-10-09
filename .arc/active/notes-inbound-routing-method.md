# Notes: Inbound Routing Method

## Evidence counts

Counted at `c009ab198` (2026-10-07).

**`quality-gate-hooks`** — the replay fixture. 30 routed-in entries, as they stood at `7ea9addfa`. Its owner's triage is
§ Buffer triage in its draft, first present at `d229217cf` and read for the verdicts at `2bc91c7a4` on
`plan/quality-gate-hooks`; it records triaging against `c009ab198`.

- Folded 6 into the body.
- Dismissed 5 as resolved elsewhere: two by Errands, two by `markdown-formatting`, one by a refactor that deleted the
  validator.
- Held 5 for the storage owners.
- Re-routed 7 to other work units' charters. Two of them arrived after its Out of scope had handed content checks to
  `knowledge-lint` — the two test 4 must catch.
- Found 7 Errand-shaped. Nine of the 30 began as `USER-INBOX § Errand` captures; two record escalating on design-fork
  wording.

**Backlog-wide:**

- 143 backlog drafts; 86 carry an `## Inbound Buffer` section, holding 509 entries (502 open, 7 marked `[x]` yet still
  present).
- Buffers total 10,023 lines, 45% of those drafts' lines. In 33 the buffer is longer than the design body, in 17 at
  least twice as long; 17 hold 10 or more entries. The oldest open entry was routed 2026-06-01.
- The two largest drafts run to 1,189 lines (`storage-seam`) and 916 (`quality-gate-hooks`).
- 62 entries came from `§ Errand` or the shared inbox, and 4 say they were reclassified. 27 carry a `WU_Target`
  naming a work unit other than their host, 12 of them in `storage-seam`. 10 drafts hold the buffer at end of file.
- The largest drain seen took 85 captures.

**Hand cleanups with no rule behind them:** `storage-seam`'s § Inbound dispositions table (2026-10-05),
`composable-workflows`' consolidated buffer dispositions (2026-07-02), and a removed `USER-INBOX` entry that
redistributed `operational-state-docs`' buffer.

**Held entries by priority** (recounted 2026-10-09). Planned P1 stubs hold 189 entries, planned P2 133, planned P3
149, and provisional stubs about 30, so the horizon advisory's trigger — provisional, planned at P3, or parked —
reaches about a third of what is held; a parked work unit's entries ride its preserved branch and are not in these
counts. Age does not track priority: 18 of the 36 planned P1 and P2 buffers hold an entry older than 60 days, against
24 of 33 at planned P3. Priority is set once and rarely revisited, so it is a coarse horizon proxy; held-entry age is
the signal that does not depend on it, which D5's drain line shows today and the back-pressure slot computes from the
flip.

These counts are the calibration data for the back-pressure slot the storage work owns.

## Hard-to-place cases from `quality-gate-hooks`

What was hard to place when that work unit routed its entries out at draft close — test cases for the replay and the
dry runs, each with the rule that now decides it:

- **The domain's home had shipped.** The E2E-guards entry belongs to the testing domain, whose work unit
  (`testing-guidance-apparatus`) has shipped, and no live charter fits; it went out with `WU_Target: TBD`. D2's
  no-home fall-through: `new-stub`, or `capture` without the commitment.
- **A named home never existed.** The hosted-CI budget entry carried `hosted-ci-test-budget-coverage (provisional)`,
  never created; its nearest live owner (`test-suite-reliability`) is in prepublication. A `WU_Target` is a candidate
  the gate checks, never a destination by itself.
- **Owners came from register rows, not the obvious work unit.** The storage-tied five needed the register's owner
  column, and two diverged: the footer-grammar row is `closed` while its owner `ghost-mode` is still planned, and the
  `active/` layout entry's rows split across `storage-seam`, `storage-projection`, and a retired
  `active-layout-nesting`. One is likely dismissed at its owner: `hold <other>`, then the owner's `dismiss`.
- **Body items left scope too.** The `arc check-gates` audit and the under-wrap prototype were design-body scope items,
  not buffer entries; leaving scope, they needed the same disposition. The cascade door covers them (D9).
- **Dismissals left residuals.** Two resolved entries left work behind (a missing test, three hard-coded limits): D2
  test 1's split dismisses the resolved part and gates the residual.
- **Errand-shaped entries arrived by domain.** Two came in with `WU_Target: quality-gate-hooks` (the TSDoc rule,
  actionlint), and two `knowledge-lint` entries arrived despite its Out of scope: tests 2 and 4.

## Coordination already routed

The consequences for other work units went out at draft close as 16 `USER-INBOX § Work Unit` captures, each with
`WU_Target` and `_Shapes:_`. Do not route them again from task generation or execution.

- `storage-seam` — the rewrite sites (the method's binding section and route-now's hand-off), the CLI reads joining
  its reroute set (the purpose read, and `arc view`'s live read of a started work unit), `_Shapes:_` as a field, the
  back-pressure slot and its register row, and the import conversions of buffer sections and owner-adoption holds.
- `planning-iteration-mechanics` — an iteration-time step at its Concern 1 would take over the `draft-design`
  readiness-exit call; the dispositions table is the record the rubric leaves.
- `shared-inbox-model` — the gate is its routing-disposition rubric, the horizon test an advisory; a discovery-at-start
  sweep pulls in same-concern items without the gate and takes the owner's-pass door for the rest.
- `skill-infrastructure-cleanup` — the route-now mode's description in `arc-inbox`, and `arc-errand`'s route shape as
  its pre-flip vehicle.
- `naming-conventions`, `errand-promotion-concurrency`, `cross-wu-coordination`, and `goal-aware-direction` — one
  capture each, on D12's wording, promotion frequency, the cascade rule, and the horizon advisory's input.
- `stub-mint-to-launch` — route-now as a second caller of a mint-and-publish flow if it resumes before the flip, and
  its blocker restated as the storage-cohort pause.

The `arc view --for` stale-copy defect found in review is D11's to fix here; no capture remains for it.
