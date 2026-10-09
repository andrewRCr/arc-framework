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

## Task 2.2 replay evidence

Compared the fixture-confined evaluator's 30-entry report against `quality-gate-hooks`' hand verdicts at
`2bc91c7a4`. This is a failed scenario, not a clean replay or an implementation approval.

Fixture: export of `c009ab198`, host draft at `7ea9addfa`, with the landed routing method and classification/strategy
copies overlaid. No `.git`, this work unit's early backlog directory, hand triage, or author conclusions entered the
fixture. The evaluator reported no outside-source exposure. Raw report: `/tmp/inbound-routing-replay-report.md`.

The fixture's missing live status/advisory data limits carry-out claims; the replay performs no routing writes.
That limitation alone does not account for the substantive disposition differences below.

| Entry                             | Hand verdict                                                            | Blind replay                                                                             | Comparison                                              |
| --------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1 — Recover pre-change baseline   | Errand or test-suite-reliability follow-up                              | Errand/new-stub pair for named-ref measurement; Errand for changed-path reporting        | Errand option compatible; Owner choice unresolved       |
| 2 — Warm-run practice             | Errand or test-suite-reliability follow-up                              | Dismiss completed numerical refresh; Errand for practice                                 | Compatible live residual                                |
| 3 — Machine-readable cost result  | Errand or test-suite-reliability follow-up                              | Errand                                                                                   | Compatible                                              |
| 4 — Hosted CI fallback            | Errand or test-suite-reliability follow-up                              | Dismiss native rows; new-stub for capacity/key policy                                    | Disagreement on live residual                           |
| 5 — Two-copy sync selection       | Fold into host D4/D11                                                   | Fold into host selection model                                                           | Compatible                                              |
| 6 — Completed task identifier     | Hold for storage owners                                                 | Hold task-list-conventions                                                               | Different home                                          |
| 7 — Markdown ownership cleanup    | Fold into host coordination/D7                                          | Errand                                                                                   | Different outcome                                       |
| 8 — Unprovisioned hooks path      | Errand                                                                  | Dismiss guard/spawn premises; fold general availability into host                        | Different live-residual outcome                         |
| 9 — Excluded lint operand         | Errand                                                                  | Dismiss formatting/untracked fixes; Errand for unsupported operand                       | Compatible live residual                                |
| 10 — Raw Git R100/C100            | Dismiss fix; Errand for missing regression coverage                     | Dismiss                                                                                  | Missing hand-verdict residual                           |
| 11 — Large validator blobs        | Dismiss retired validator; Errand for three local output-limit literals | Dismiss retired validator and generalization                                             | Missing hand-verdict residual                           |
| 12 — Runtime Context examples     | Errand                                                                  | New-stub                                                                                 | Different wrapper                                       |
| 13 — Mode-scoped integrity        | Errand                                                                  | Dismiss retired path; hold adopter-install-authority                                     | Different live-residual outcome                         |
| 14 — Dev-only hook delegation     | Hold for storage owners                                                 | Errand for guards; new-stub for installed validator contracts                            | Different outcomes/home                                 |
| 15 — Commit-message CI ranges     | Hold for ghost-mode                                                     | New-stub                                                                                 | Different home                                          |
| 16 — Message-only caching         | Fold into host D5                                                       | Fold into host unchanged-tree selection                                                  | Compatible                                              |
| 17 — Markdown enforcement         | Dismiss shipped rules; auto-fix residual folds with entry 26            | Dismiss verified rules; fold restaging; retain unverified emoji enforcement as Errand    | Main dispositions compatible; emoji evidence unresolved |
| 18 — TTY force-push confirmation  | Hold history-policy                                                     | Hold history-policy                                                                      | Compatible                                              |
| 19 — Scoped TSDoc rule            | Errand                                                                  | Errand                                                                                   | Compatible                                              |
| 20 — E2E/seam guards              | Work Unit needing a new home                                            | Dismiss existing CLI-test absence; new-stubs for standing coverage and seam-input guards | Compatible new-home class, split by concern             |
| 21 — actionlint                   | Errand                                                                  | Errand                                                                                   | Compatible                                              |
| 22 — Pre-commit markdownlint      | Dismiss                                                                 | Dismiss                                                                                  | Compatible                                              |
| 23 — Tier 3/CI parity             | Fold into host D9                                                       | Dismiss repaired enumeration; fold shared authority/parity                               | Compatible live residual                                |
| 24 — Flat active layout           | Hold for storage owners                                                 | Errand                                                                                   | Different outcome                                       |
| 25 — Untracked Markdown           | Dismiss                                                                 | Dismiss                                                                                  | Compatible                                              |
| 26 — Add/format/restage loop      | Fold into host D7                                                       | Fold into host dispatch/restaging                                                        | Compatible                                              |
| 27 — Prose section citations      | Hold knowledge-lint; host exclusion applies                             | Hold knowledge-lint, explicitly applying test 4                                          | Compatible                                              |
| 28 — Cross-file anchors           | Hold knowledge-lint; host exclusion applies                             | Hold knowledge-lint, explicitly applying test 4                                          | Compatible                                              |
| 29 — Complexity/test-bloat policy | Errand                                                                  | New-stubs for source metric and test structure                                           | Different wrappers                                      |
| 30 — Ceremony gate invocation     | Fold into host D3                                                       | Fold into host resolution/execution                                                      | Compatible                                              |

### Primary source checks and amendment triage

- Both exclusion cases, 27 and 28, name actual `knowledge-lint` cross-reference sections and explicitly apply the
  host's exclusion. This portion of the exit criterion holds.
- Entry 7 explicitly requests pruning superseded ownership while retaining dispatch/restaging and consuming the
  shipped runner. The method's test 2 sends an Errand-shaped concern to Errand whatever its target; the evaluator
  answers all four questions No. The hand verdict instead folds the cleanup into the host. The method's own-work
  pull-in names planning start/activation, while this replay uses the ready-making owner's pass. The relationship
  between this rule, own-scope cleanup, and the expected fold needs a settled reading rather than a silent special case.
- The source's storage coupling register assigns lifecycle hook checks, including task-list modification, to
  `storage-cutover`, with surviving content rules moving to `storage-seam`; it assigns the footer grammar to
  `ghost-mode` (the row is closed although that work unit remains planned). The evaluator's task-list-conventions
  and new-stub choices did not recover the hand triage's program-owned destinations. This is not evidence that
  changing names alone repairs the homing rule.
- Entry 11 explicitly asks to reuse the shared Git-output limit and generalize to other validators. The fixture's
  `validate-meta-spec.ts:279`, `remedy-roadmap-conflict.ts:50`, and `assert-roadmap-regenerated.ts:127` each still use
  `maxBuffer: 32 * 1024 * 1024`. The evaluator dismissed the broader residual as unspecified; that dismissal is
  incomplete against the entry and source.
- Entry 10 asks to retain regression coverage. The canonical meta-reference integration suite contains no R100/C100
  case, consistent with the hand verdict's missing-test residual. The replay dismissed the implementation without
  recording that residual; unrelated Git rename tests do not pin this check's exemption.
- For 12, 13, and 29, the evaluator cites concrete mapping, exclusion, contract, and rationale demands as Yes answers
  where the hand triage used Errand. These are differing record-test judgments, not proof that touching
  infrastructure is itself a floor. The classification is reserved to the Owner; no automatic rewrite of the floor
  or substitution of the evaluator's judgment for the Owner's has been authorized.

Task 2.2 remains open. No method fix, spec amendment, new acceptance criterion, revision parent, or progression into
Phases 3–6 was made from this failed report. The `amend-design` entry gate is open over the disagreement: a narrowed
Owner decision is needed to distinguish incomplete implementation/evaluation from a settled statement that must
change. Preserve the original criterion and this report while settling that decision; corrective work belongs ahead
of the verifier in a revision parent, followed by a fresh, fixture-confined replay.

### Advisor-assisted mismatch audit

The bounded consultation with `/root/advisor` asked how to distinguish evaluator mistakes, method gaps, and historical
judgments without fitting the method to the answer key. The consultation is fulfilled; its advice was checked against
the fixture by the primary. The advisor recommended four discriminating source checks, preserving the failed replay
and distinguishing acceptance failure from rule fidelity. Advice supplies neither verification nor amendment authority.

The following checks use the original fixture and report. Historical outcomes were used only for comparison after the
blind replay. No source fix, new expected answer, or acceptance change was applied.

| Case                                     | Captured scope and governing clause                                                                                                               | Source fact and replay inference                                                                                                                                                                                                                                              | Audit conclusion                                                                                                                                                                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10/11 — residual completeness            | D2 test 1 and D9 split a resolved part from its live residual. The captures require regression coverage and reuse of the shared Git-output limit. | The complete `pre-commit-meta-ref.test.ts` has four planning-ID/merge cases, with no raw-status exemption case. Three named scripts still use local 32 MiB limits. The replay dismissed both entries whole.                                                                   | These are incomplete evaluations under an existing rule. Retain dismissal of the shipped fix/retired validator, and evaluate the bounded test/constant residuals separately. No routing rule needs to change for this correction.                                            |
| 7 — host's own cleanup                   | D2 exempts an already-covered same concern at kickoff/activation; its ordered gate otherwise sends all-No work to Errand.                         | The host's own Scope and entry explicitly retain generic dispatch/restaging while removing duplicate Markdown ownership. The evaluator correctly finds the cleanup determinate, but routes it away at the ready-making pass.                                                  | The historical fold requires a temporal extension of the own-work exemption. This is a design-arm change to D2, rather than an implementation patch or an exception to the Errand floor.                                                                                     |
| 14 — storage ownership versus dependency | D2 test 2 precedes homing; test 3 requires a decision shaped by the captured concern.                                                             | The coupling-register lifecycle-hook row names `storage-cutover` and deletion, while its draft Scope names those deletion passes. It does not assign every surviving validator's packaging design there. The replay splits cheap guards from a new validator-contract design. | The register establishes retirement coordination, not blanket ownership of current hardening or surviving CLI contracts. A historical storage hold does not justify adding a program-ownership override to the gate. Per-check scope and the Owner's wait remain unresolved. |
| 29 — evidence for the record floor       | D12 asks for costly reversal, durable exclusion, or rationale exceeding a couple of lines; infrastructure alone is insufficient.                  | The capture asks to compare measured rule signals and consider replacing a recorded floor, plus distinct test-structure measures. The replay asserts a costly measurement contract and rich rationale without naming dependent work to unwind or the required long rationale. | The source supports a decision to investigate, but those assertions do not establish every Yes. Reassess each captured part narrowly, retaining an Owner-decided pair where the floor is unclear. The old Errand label alone does not settle it either.                      |

**Residual checks in full.** `pre-commit-meta-ref.test.ts` constructs its normal requirement token, so absence of literal
`R100`/`C100` text was not the test: each test body and hook invocation was read. The hook's quoted raw-status stripping
is present; the missing regression concerns that exemption and genuine planning tokens sharing a line. For entry 11,
`validate-meta-spec.ts:279`, `remedy-roadmap-conflict.ts:50`, and `assert-roadmap-regenerated.ts:127` retain the local
limits, while `process-executor.ts:15` defines `MAX_GIT_OUTPUT_BYTES` at 64 MiB. This proves the captured reuse residual,
not a demonstrated overflow in all three readers. Those unrelated fixes remain outside this work unit.

**Other disagreements.** Entries 4, 8, and 12 contain actual policy/boundary choices; the audit does not dismiss those
choices simply because the historical verdict was Errand. Entry 13 asks to consume existing installation authority,
whereas the candidate `adopter-install-authority` replaces or guards that authority: the proposed larger contract needs
to be separated from the captured verifier fix. Entry 6's proposed Shapes cites another held entry; that is input to
the target's design, not by itself a settled ownership decision. Entry 15 has a stronger omitted coupling argument:
`ghost-mode` § Settled inputs explicitly owns footer form, defaults, the commit hook, and absent-state degradation.
Validate whether CI enforcement shapes that policy before claiming it lacks a home. Entry 24's prospective layout
replacement is coordination evidence, while the captured recurrence assertion may still be an Errand. Entry 17's
emoji residual needs its own liveness evidence; a non-goal in another work unit does not prove enforcement shipped.

The historical alternative `test-suite-reliability` has no design/meta in the exported tree, although the hand-triaged
draft's Coordination names it as active. This limits reconstruction of that optional home. The Errand alternative
remains testable; the absent context is not a reason to silently change the original acceptance criterion.

### Approved correction boundary — A1

Recommend the **design arm at low depth** for the timing conflict, composing an existing concern-identity rule with the
existing owner's-pass table. It is a local correction, with no new floor, destination, storage mechanism, or lifecycle.
The exact proposal is:

> At the ready-making owner's pass, first split and verify each entry. A live part already covered by the host's own
> change, under the same-concern test, is reconciliation of that change and folds into the host before the record-floor
> gate. Record `fold <host>` with own-work coverage as its deciding reason. Independent residuals still take tests 1–4.
> Kickoff and activation retain their existing pull-in without a routing outcome.

This supersedes D2's limitation of the own-work exemption to kickoff/activation and propagates into D9's owner's pass,
the shipped method, and any remaining task wording depending on that limitation. A separate `2.R` parent precedes the
open replay verifier; its Goal cites the amendment. The original replay criterion and failed report stay intact.

The complete proposed disposition is: amend the timing rule; correct the two proven evaluator omissions; reassess the
other differences against the captured scope and explicit floor/coupling evidence; retain unresolved classifications
as Owner decisions. Do not add a storage-priority shortcut or rewrite D12 to reproduce old labels. No historical
answer is superseded by this proposal. If the renewed comparison still conflicts with a settled rule, return with
that exact conflict for a further Owner decision.

After authorization, capture the amendment before method changes, perform the bounded grounding review, implement the
revision, and run all 30 cases blind again. Add contrasting checks showing that already-covered cleanup stays with its
host at both planning times, while an independent all-No concern sharing a file still goes to Errand. Keep historical
dispositions and this audit out of the new evaluator's inputs; factual evidence is available through the fixture.

### A1 — Amendment capture and propagation

Accepted the narrow design amendment: own-work reconciliation also applies at the ready-making owner's pass. The
amendment remains at low depth because the correction composes the existing concern-identity and liveness rules;
it does not author a new classification model. The original replay criterion and its failed report are retained.

Superseded D2 text:

> The gate places discovered work. When a work unit starts planning or activates, an item its own change already covers
> — the same concern, by the anti-rider rule's concern-identity test (`DEV-RULES.ARC` § Anti-rider) — is that change's
> work, not a concern to route: planning kickoff and activation pull it in without the gate, and it takes no routing
> outcome. Everything else takes the gate, applied in order at every door:

Superseded D9 host rule:

> With `host`, a held entry runs the same gate against its current home as the incumbent candidate: staying is
> `hold <host>`, folding is `fold <host>`, and moving is `hold <other>`, `new-stub`, `errand`, or `dismiss`.
> Re-triage is the gate run in reverse, not a second procedure.

Propagation footprint: D2's timing rule and D9's result/host rule revise together; D5's re-triage description names the
same exception. The existing method criterion still applies, and the appended own-work criterion discriminates the
changed rule. Task 2.1 keeps its completed marker and Goal, with the additive amendment locator; `2.R` is placed before
Task 2.2. Task 5.3's inbox kickoff/activation guidance is unaffected, as are other doors, the binding, the record floor,
and all original Success Criteria. No lifecycle state or meta update is required.

Capture checks: the author-run `spec-review` grounding slice over A1 and the `task-audit` grounding-only read over
`2.R` found no unresolved claim or binding gap. The method's actual split, gate, host, owner's-pass, and table sections
are the implementation sites; both consumers already invoke that method with the host at their ready-making doors.
The independent-Errand contrast uses the unchanged four-question floor. The task predecessor is complete, its
successor remains the original verifier, and the capture adds no undeclared code prerequisite. Reader independence
and binding completeness hold over the revised footprint; no independent review is claimed by this author check.
