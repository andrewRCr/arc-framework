# Notes: Inbound Routing Method

## Contents

- Evidence and coordination: [counts](#evidence-counts), [hard-to-place cases](#hard-to-place-cases-from-quality-gate-hooks),
  [routed coordination](#coordination-already-routed).
- Replay and amendments: [historical comparisons](#replay-evidence), [A1 revision](#a1--revision-evidence),
  [A2 calibration](#a2--replay-calibration), [Owner dispositions](#a2--owner-dispositions-and-effective-report),
  [amended verification](#amended-segment-verification).
- Routing scenarios: [drain](#drain-scenario-evidence), [route-now](#route-now-classification-only-scenario).
- Verification: [review record](#verification-review-record); [criteria report](#verification-criteria-report).

Paths under `/tmp/` identify local scratch artifacts used by the recorded runs. The embedded comparisons,
dispositions, source checks, and scenario traces retain their results for archival reading.

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
  the subsequently retired `active-layout-nesting`. Entry 24's final disposition dismisses the stale-reader premise
  and retains the pointed recurrence assertion as an Errand with an intentional wait.
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

## Replay evidence

The first historical-parity comparison failed. A1 corrected own-work timing and passed four contrasting cases;
the renewed historical comparison still failed. A2 explicitly superseded historical equality, retained both failed
reports, and supplied Owner calibration for the effective 30-entry report. The amended segment verification closed
that accepted criterion. The following proposals and status descriptions record those stages in order.

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

At this first failed comparison, Task 2.2 remained open and no method fix, spec amendment, new acceptance criterion,
revision parent, or progression into Phases 3–6 had occurred. The disagreement required an Owner decision between
incomplete implementation/evaluation and a settled statement that needed amendment. A1 and A2 below record the
subsequent correction, renewed failure, and explicit supersession; the original criterion and this report remain
preserved.

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

The authorized sequence captured the amendment before method changes, grounded and implemented the revision, and
replayed all 30 cases blind. Contrasting checks distinguished already-covered cleanup at both planning times from an
independent all-No concern sharing a file. Historical dispositions and this audit stayed outside the new evaluator's
inputs. The next two sections preserve the revision and renewed comparison evidence.

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

### A1 — Revision evidence

The amendment capture is `e71f87d78`. Both configurable method copies now return own-work coverage as a deciding
reason, reconcile live already-covered parts at the ready-making owner's pass before the floor, and use that exception
at host re-triage. No classification or binding rule changed. The source copies are byte-identical.

Fresh evaluator `/root/blind_replay_a1` read the revised method and a separate hypothetical-case input without expected
answers. Its report is `/tmp/inbound-routing-own-work-a1/report.md`; it reported no outside-root content exposure.
Primary comparison against the revised method confirmed:

- **A:** covered live cleanup at kickoff is ordinary pull-in, with no routing outcome, matching the retained rule.
- **B:** the same cleanup at ready-making is `fold <host>`, own-work coverage, `_Shapes:_ Dispatch`.
- **C:** an independent copyright correction in the same file is `errand`, record answers all No; file identity does
  not establish concern identity.
- **D:** already-wired installation is `dismiss`; still-live ownership reconciliation is the host fold. The method's
  split and still-live check precede that reconciliation.

These four observations satisfy the appended own-work criterion at method scope. They did not pass the original
30-entry scenario or close A1's original revalidation. The following renewed replay used a new exact export with the
revised methodology overlaid, excluding earlier reports and hand verdicts from its input roots.

### A1 replay comparison

The renewed blind replay is `/tmp/inbound-routing-replay-a1-report.md`, from fresh evaluator
`/root/blind_replay_a1`. All 30 original entries were assessed; the complete content-read disclosure names 85 inputs
within the two authorized scratch roots, with no reported outside-root exposure or historical answer-key read. The
fixture manifest is `/tmp/inbound-routing-replay-a1-manifest.json`. Its three overlaid methodology files match the
current source bytes in both copies. The original Replay criterion was checked byte-for-byte against `1fb8d2136`.

**Result: the original segment scenario still fails.** Entry 7 now folds by the amended own-work rule, and the four
contrasts pass, but multiple historical outcomes remain unreproduced. An Owner pair is an unresolved classification,
not a unique historical verdict recovered. Neither this comparison nor the root's factual corrections turns the blind
report into a passing result. Task 2.2 and A1's original-scenario revalidation remained open at this stage; A2 below
records their subsequent supersession and amended revalidation.

| Entry                       | Historical verdict                                   | A1 replay                                                                        | Comparison / primary validation                                                                               |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1 — baseline recovery       | Errand or test-suite-reliability follow-up           | Errand/new-stub pair for ref recovery; Errand for affected rows                  | Errand candidate compatible; pair still needs Owner input.                                                    |
| 2 — warm practice           | Errand or follow-up                                  | Dismiss refresh; Errand practice                                                 | Compatible live residual.                                                                                     |
| 3 — machine-readable result | Errand or follow-up                                  | Errand                                                                           | Compatible.                                                                                                   |
| 4 — hosted capacity         | Errand or follow-up                                  | Dismiss existing rows; new-stub for capacity/refresh policy                      | Floor disagreement remains.                                                                                   |
| 5 — two-copy selection      | Host fold                                            | Host fold, own-work coverage                                                     | Compatible.                                                                                                   |
| 6 — completed task IDs      | Storage hold                                         | Hold task-list-conventions                                                       | Different home; proposed Shapes names another held entry.                                                     |
| 7 — ownership cleanup       | Host fold                                            | Host fold, own-work coverage                                                     | Approved timing correction works.                                                                             |
| 8 — missing hooks path      | Errand                                               | Dismiss wrapper detection and obsolete spawn absence                             | Different outcome; wrapper protects ARC commits, not every raw Git path.                                      |
| 9 — excluded lint operand   | Errand                                               | Dismiss other repaired parts; Errand operand interface                           | Compatible live residual.                                                                                     |
| 10 — raw Git status tokens  | Dismiss fix; Errand missing regression               | Dismiss                                                                          | Expected raw-status regression residual still omitted; existing four tests cover planning IDs/merge behavior. |
| 11 — large blobs            | Dismiss retired validator; Errand three local limits | Dismiss old validator; new-stub generalized hardening                            | Broad hardening survives now, but the bounded shared-limit residual needs its own split and floor.            |
| 12 — runtime examples       | Errand                                               | Errand/new-stub pair                                                             | Owner floor choice unresolved.                                                                                |
| 13 — install verifier       | Errand                                               | Dismiss old path; Errand mode-selection fix                                      | Compatible live residual; broader inventory redesign no longer substituted.                                   |
| 14 — source-only hooks      | Storage hold                                         | Dismiss old loader spelling; Errand guards; Errand/new-stub migration pair       | Outcome/holding difference remains; retirement coordination is not blanket packaging ownership.               |
| 15 — CI message ranges      | Hold ghost-mode                                      | Errand/new-stub pair                                                             | Floor unresolved; ghost-mode's actual footer-policy decision was not checked as a finalist.                   |
| 16 — message caching        | Host fold                                            | Host fold, own-work coverage                                                     | Compatible conditional question.                                                                              |
| 17 — Markdown rules         | Dismiss shipped content; host fold restage           | Dismiss basic rules; Errands for table equivalence/emoji; host fold restage      | Host fold compatible; archived upstream spec resolves the extra content premises as described below.          |
| 18 — push confirmation      | Hold history-policy                                  | Errand, all No                                                                   | Direct floor/historical-holding disagreement.                                                                 |
| 19 — TSDoc                  | Errand                                               | Errand                                                                           | Compatible.                                                                                                   |
| 20 — seam/E2E guards        | New work-unit home                                   | Dismiss tier absence; new-stub mechanical guards                                 | Compatible new-home class.                                                                                    |
| 21 — actionlint             | Errand                                               | Errand                                                                           | Compatible.                                                                                                   |
| 22 — pre-commit style lint  | Dismiss                                              | Dismiss                                                                          | Compatible.                                                                                                   |
| 23 — CI/local parity        | Host fold                                            | Dismiss omission; host fold composition                                          | Compatible live residual.                                                                                     |
| 24 — flat layout            | Storage hold                                         | Dismiss stale reader premise; Errand recurrence assertion                        | Floor/holding disagreement remains.                                                                           |
| 25 — untracked files        | Dismiss                                              | Dismiss inclusion; Errand count verification                                     | Primary verified visible count through the exact pinned linter/caller; raw report retained.                   |
| 26 — restage loop           | Host fold                                            | Host fold, own-work coverage                                                     | Compatible.                                                                                                   |
| 27 — prose citations        | Hold knowledge-lint; exclusion applies               | Hold knowledge-lint                                                              | Compatible; host exclusion expressly applied.                                                                 |
| 28 — anchors                | Hold knowledge-lint; exclusion applies               | Errand/hold knowledge-lint pair                                                  | Work-unit candidate and exclusion recovered; floor choice remains unresolved.                                 |
| 29 — complexity/test bloat  | Errand                                               | Production policy pair; Errand named test rules; new-stub count-ratchet redesign | Partly compatible; broader redesign and policy floor remain disputed.                                         |
| 30 — ceremony invocation    | Host fold                                            | Host fold after floor/coupling                                                   | Compatible.                                                                                                   |

**Primary source corrections, separate from the blind report:**

- **17, upstream policy:** the exported completed `spec-markdown-formatting.md` § Non-Goals explicitly excludes an
  emoji ban and canonical delimiter spacing. Its § 10 directs the host to drop stale table-CI/emphasis/emoji ownership
  while retaining generic orchestration and consuming the shipped check-only runner. The new report did not read that
  upstream artifact. An assumed upstream emoji rule is not a newly authorized independent policy; the captured
  enforcement premise is obsolete. A deliberate new ban would be another concern. Exact serializer bytes likewise
  are not the settled lint contract: that spec states accepted serializer spacing is not the lint contract. The
  fixture config selects aligned `MD060`; the pinned rule checks pipe alignment, not just the older per-file style
  consistency. No new check is warranted solely because the originally proposed script name does not exist.
- **25, tool output:** the fixture pins `markdownlint-cli2` 0.23.0. That exact locally installed version's
  `markdownlint-cli2.mjs:1049` prints `Linting: ${fileCount} file(s)` under normal progress; the fixture sets no
  `noProgress`, and `runWorktreeMarkdownlint` supplies explicit selected paths without formatting flags.
  `lint-markdown-worktree.ts:executeLinter` inherits stdout/stderr. The ordinary gate logs also witness this line.
  The root used dependency source outside the exported fixture for this validation; the blind evaluator did not.
- **10/11, residual bounds:** the canonical meta-reference suite still has no raw-status exemption case; its four
  tests verify genuine planning references and merge behavior. Entry 11's shared-limit request has concrete known
  sites: `validate-meta-spec.ts:279`, `remedy-roadmap-conflict.ts:50`, and `assert-roadmap-regenerated.ts:127` against
  `process-executor.ts:MAX_GIT_OUTPUT_BYTES`. The primary proposes `errand` for the raw-status regression and the
  three explicit limit replacements, each with record answers No/No/No/No: named test/edit sites, no durable exclusion,
  reversal within another Errand, and a short rationale. A separate generalized-reader analysis may need a work unit
  without turning this small explicit reuse residual into one. No out-of-scope source fix was made.
- **15, candidate omission:** the fixture's `draft-ghost-mode.md` § Settled inputs explicitly owns trailer form,
  footer settings/defaults, the commit hook, and absent-state degradation. The new evaluator did not read it. That
  decision is a legitimate candidate for CI-footer enforcement. Its Purpose is the no-footprint profile and its
  explicit exclusions concern storage implementation, review-disposition bodies, and contributor operation; none
  excludes the captured footer enforcement. The primary proposes the corrected pair `errand` / `hold ghost-mode`,
  with `_Shapes:_ Settled inputs — footer policy and absent-state degradation`, pending the same floor decision.
  This is not permission to let a destination override an all-No result.

### Replay calibration proposal

Recommend keeping D12's record floor and D2's coupling requirement. The updated method passed the approved timing
contrasts. The remaining report combines evaluator omissions, missing upstream/tool context, different captured-scope
readings, and Owner-dependent floor decisions. Another blind pass over the same underspecified Owner inputs is not a
bounded fix for all of those differences, and historical holding labels alone do not establish method defects.

A further design-arm amendment was proposed: retain the original historical-parity criterion and its failed evidence,
append an explicitly superseding criterion, and adjudicate the comparison rather than modifying the floor to force
old labels. A2 below records its acceptance. Proposed replacement behavior:

> A fixture-confined evaluator covers all 30 historical entries against the named historical tree with the current
> method, splitting distinct concerns and resolved/live parts. Each proposal names its deciding rule and source
> evidence; each fold/hold names Shapes validated against the target's actual scope and exclusions. An unclear record
> floor returns the method's Owner pair with its four answers. Both knowledge-content entries are excluded from the
> host; the own-work timing and independent-concern contrasts pass. Every difference from the historical triage,
> including a remaining source uncertainty or omitted candidate, receives an explicit Owner disposition before the
> segment closes. Historical equality is not inferred from a pair or from a primary correction to the blind report.

The disposition proposal for calibration is: accept the already-compatible rows; retain the source corrections for
17/25 and bounded Errand proposals for 10/11; use 15's validated candidate in its pair; and settle the record floor
and intentional waiting for the disputed rows (4, 6, 8, 12, 14, 15, 18, 24, 28, 29) against their bounded capture.
At this proposal stage, Owner dispositions and supersession had not been approved. No criterion, Goal, old verdict,
classification rule, or lifecycle state was changed solely from the second failed replay. The following A2 record
distinguishes the accepted amendment from the later Owner case dispositions.

### A2 — Replay calibration

Accepted the proposed criterion amendment with Owner judgment retained. This is a low-depth design-arm amendment:
the replacement criterion composes D9's existing proposal/pair contract, D12's Owner authority, source verification,
and the completed contrast checks. No routing rule, floor, production interface, or lifecycle changes. The amendment
adds a checkable criterion, a `2.R2` corrective parent, and a replacement segment verifier `2.3`; it does not rewrite
Task 2.2's Goal or the original Replay criterion. The original verifier and its failed comparison are marked
superseded, not passed; A1's revalidation pointer now names the replacement check through A2.

Superseded Success Criteria text:

> - **Replay.** An evaluator given the method and the 30 routed-in entries of `quality-gate-hooks`' draft as they stood
>   at `7ea9addfa` — and not that draft's § Buffer triage in any version that carries it, from `d229217cf` on — judges
>   liveness and homes against the tree at `c009ab198`, which those verdicts were triaged against, and reaches the hand
>   verdicts recorded there at `2bc91c7a4` from rules the method states: a split verdict as one outcome per
>   part, a two-option verdict as either option, and every disposition naming its D9 outcome and the D2 test that
>   decided it, with no judgment the method leaves unnamed. Test 4 catches the two entries that arrived after that
>   draft's out of scope had excluded their subject.

The full original criterion remains verbatim in the specification. The Phase 2 exit likewise remains verbatim,
followed by the explicit amended exit. The blind reports stay separate from primary corrections and Owner decisions;
no record calls either historical-parity run passed.

Propagation: the spec's appended criterion supersedes only historical-label equality; method inputs, result pairs,
D2/D12 authority, and the remaining implementation tasks are unaffected. The completed own-work revision remains
complete; its contrasting evidence feeds the replacement verifier. No new segment or delivery boundary is introduced.

The author-run grounding slice and reader/binding checks over this amendment found no unresolved design claim. The
30-entry report and its disclosed reads witness evaluator coverage; the actual method states pair/Owner authority;
source corrections name the archived upstream spec, pinned linter, readers, and footer-policy section. The task-audit
grounding-only read places correction before verification and retains all old Goals. These are author checks, not
independent review or Owner case dispositions. Case calibration remained open until the Owner input recorded below.

Capture structure check: `lint:md:descriptors` rejects an old segment-verifier suffix when a replacement verifier
follows it, regardless of its status marker (`validateSegmentation` in `task-list/segmentation.ts`). The approved
supersession therefore retires Task 2.2's old role suffix and marks it and its comparison `[~]` at capture; Task 2.3
alone carries the active suffix. The original role was `— validate exit criterion at segment scope`; both original
Goals, completed fixture/evaluator leaves, the failed comparisons, and the old criterion remain preserved.

### A2 — Case proposals before Owner calibration

The capture is `435e8f8b0`. Source evaluation was complete; classification choices awaited Owner input for the three
case groups below. The following Owner-dispositions section records that input. This replay executed no route and
inferred no case answer from the criterion approval.

| Group                 | Captured concern                                                                                  | Proposed floor/read                                                                                                                                                                                                | Candidate or intentional wait                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Small fixes           | 14a source-existence guards; 18 opt-in TTY confirmation; 24 pointed layout assertion              | Errand; No/No/No/No. Steps and policy default are named, no new exclusion is required, and implementation is reversible with a short rationale.                                                                    | Wait as an Errand where storage retirement makes current work throwaway. Future replacement alone does not supply a work-unit floor.                               |
| Bounded investigation | 1 ref baseline; 4 hosted capacity; 12 runtime examples; 29a cognitive metric                      | Errand with the chosen small scope and short decision record; promote if actual mapping or rationale crosses the floor. The reported unknowns remain visible until the Owner chooses that scope or written design. | No validated work-unit home for these precise decisions in the fixture; new-stub if the Owner requires a record.                                                   |
| Recorded policy       | 6 completed-ID stability; 15 footer/CI authority; 28 cross-file anchors; 29c quantitative ratchet | Written design proposed: persistent ID provenance or rationale/policy beyond a short decision line. The Owner chooses the floor; an unclear result remains a pair.                                                 | 6: task-list-conventions identifier/sequence decision, coordinated with storage; 15: ghost-mode footer policy; 28: knowledge-lint cross-references; 29c: new-stub. |

For entry 6, the targeted candidate read confirms its Purpose is task grammar/generation gaps and its held
phase-numbering section explicitly asks whether append-only identifiers stay additive while sequencing is separate.
Its present Scope has no contrary exclusion. That is a design input this concern can shape; storage remains a
coordination constraint rather than an automatic priority over the floor. `_Shapes:_ Settle phase-numbering insertion
semantics and letter-suffix drift — completed-ID persistence`. The other proposed homes retain the already-validated
Shapes and exclusions from the comparison. Actual lifecycle, owner adoption, and horizon checks remain carry-out
requirements outside this source-only replay.

Entry 14b's installed-validator migration retains the method's pair: an existing delegation pattern may remain a
bounded Errand, while new validator surfaces may require code mapping and a larger compatibility record. This is a
proposal awaiting the Owner at actual routing, not a decision that generic guard work authorizes a new CLI contract.
Entry 8's solved wrapper/spawn premises remain separate from an unproved universal raw-Git guarantee; no such added
guarantee is inferred from the capture. The source-backed corrections and compatible rows remain in the effective
report, with historical disagreements disclosed rather than erased.

### A2 — Owner dispositions and effective report

The Owner selected **all recommended** for the three calibration groups and reaffirmed the same deferred-review
scope with atomic commits. That supplies the missing classification input for the bounded cases and recorded-policy
cases below. The evaluation remains a source-only replay; these are dispositions of benchmark proposals, not writes
or execution of the unrelated concerns. Live routing still obtains its ordinary Owner decision and status evidence.

The blind evaluator's original proposals and uncertainties remain in the preceding comparison. This effective
report combines them with the separately grounded corrections and the Owner's selected scope/record judgments.

| Entry | Effective disposition                                                                                     | Deciding reason / Owner calibration                                                                                                                                       |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Errand for bounded ref measurement and affected-row reporting                                             | Bounded investigation group; short decision record, promote if mapping or a durable record is actually needed.                                                            |
| 2     | Dismiss completed refresh; Errand warm-run practice                                                       | Verified split; known practice and short record.                                                                                                                          |
| 3     | Errand machine-readable budget summary                                                                    | Named output/consumer correction under the floor.                                                                                                                         |
| 4     | Dismiss missing-row premise; Errand bounded capacity/refresh measurement                                  | Bounded investigation group; no invented baseline or larger calibration apparatus.                                                                                        |
| 5     | Fold host                                                                                                 | Own-work coverage; Shapes: Selection model — two-copy relevance.                                                                                                          |
| 6     | Hold task-list-conventions; coordinate storage                                                            | Recorded policy group; Shapes: Settle phase-numbering insertion semantics and letter-suffix drift — completed-ID persistence.                                             |
| 7     | Fold host                                                                                                 | Own-work reconciliation; Shapes: generic dispatch/dogfood ownership after the shipped runner.                                                                             |
| 8     | Dismiss solved wrapper-detection and spawn premises                                                       | Named code supplies both mechanisms. A universal native-Git guarantee is not inferred or adopted as a new obligation.                                                     |
| 9     | Dismiss repaired untracked/formatting parts; Errand explicit operand interface                            | Split liveness and the known scope-reporting/refusal fix.                                                                                                                 |
| 10    | Dismiss implementation bug; Errand raw-status regression                                                  | Grounded missing exemption test is a separate known residual.                                                                                                             |
| 11    | Dismiss retired validator; Errand three shared-limit replacements; new-stub generalized reader hardening  | Bound the explicit reuse fix separately. The wider captured hardening requires mapping; its evaluator proposal remains distinct.                                          |
| 12    | Errand bounded runtime-example boundary                                                                   | Bounded investigation group; preserve the planning-coupling guard and promote if semantic mapping exceeds that scope.                                                     |
| 13    | Dismiss renamed-path premise; Errand install-mode verifier                                                | Consume the existing installation authority, without broadening into inventory redesign.                                                                                  |
| 14    | Dismiss old loader spelling; Errand self-hosting guards with intentional wait; retain migration pair      | Small fixes group selects the guards. The distinct installed-validator migration remains the method's explicit Errand/new-stub choice for the Owner when actually routed. |
| 15    | Hold ghost-mode                                                                                           | Recorded policy group; Shapes: Settled inputs — footer policy and absent-state degradation.                                                                               |
| 16    | Fold host's conditional cache question                                                                    | Own-work coverage; Shapes: Selection model — unchanged inputs and field-data threshold. No cache implementation is authorized by folding it.                              |
| 17    | Dismiss stale content/emoji/table-CI premises; fold safe restage residual                                 | Upstream scope and actual aligned lint resolve the premises; Shapes: pre-commit dispatch — index-safe auto-fix/restage.                                                   |
| 18    | Errand opt-in TTY confirmation, with intentional wait where applicable                                    | Small fixes group; existing advisory default and noninteractive posture remain the bounded intent.                                                                        |
| 19    | Errand exported-surface lint                                                                              | Enforce already-selected TSDoc policy with a short record.                                                                                                                |
| 20    | Dismiss absence-of-tier premise; new-stub mechanical seam/coverage guard                                  | Existing tier does not prove the new guard; mapping and semantic decision require a record.                                                                               |
| 21    | Errand actionlint integration                                                                             | Known tool and surfaces; infrastructure does not lift the floor.                                                                                                          |
| 22    | Dismiss missing repo style-lint premise                                                                   | Existing indexed runner and wrapper supply the policy.                                                                                                                    |
| 23    | Dismiss omitted-script premise; fold composition residual                                                 | Own-work coverage; Shapes: command composition and local/CI parity.                                                                                                       |
| 24    | Dismiss stale reader description; Errand pointed recurrence assertion with intentional wait               | Small fixes group; a future projection is coordination, not a wrapper floor.                                                                                              |
| 25    | Dismiss inclusion/count premises                                                                          | Selection includes untracked paths; the pinned linter/caller exposes the count.                                                                                           |
| 26    | Fold host                                                                                                 | Own-work coverage; Shapes: pre-commit dispatch — safe format/restage loop.                                                                                                |
| 27    | Hold knowledge-lint                                                                                       | Shapes: Mechanical tier → Cross-references — prose citations. The host expressly excludes this content.                                                                   |
| 28    | Hold knowledge-lint                                                                                       | Recorded policy group; Shapes: Mechanical tier → Cross-references — file.md#anchor resolution. Host exclusion remains decisive.                                           |
| 29    | Errands for bounded source-metric comparison and named test rules; new-stub quantitative ratchet redesign | Bounded investigation and recorded policy groups keep distinct concerns separate.                                                                                         |
| 30    | Fold host                                                                                                 | Floor/coupling: CLI resolution/execution semantics; Shapes: command connection points and workflow-trigger consolidation.                                                 |

For the small-fix group, the four record answers are No/No/No/No. For the bounded-investigation group, the selected
small scope supports a short decision record; the source report's uncertain mapping/rationale answers remain visible
as promotion conditions, rather than claims that future execution cannot uncover a Yes. The recorded-policy group
selects a durable record: completed-ID provenance implicates costly historical reconciliation, and footer authority,
anchor grammar, and quantitative floor semantics need their longer policy rationale. The distinct migration pair
retains Unclear/No/No/Unclear and both outcomes. Accepting that proposal shape does not choose a live migration route.

The existing homes were checked by actual Purpose, named section, and exclusions. The ID section is present in the
task-grammar draft; ghost-mode's footer decision includes hook/validator policy and degradation, outside its storage,
review-body, and contributor exclusions; knowledge-lint owns the cross-reference family, which the host excludes.
Host folds name already-covered Selection/Dispatch sections except the separately justified ceremony executor.
No proposed home is decided by shared domain, mere existence, or future replacement alone. Metadata/status and
horizon uncertainty is explicitly confined to carry-out, which the replay never performs.

### Amended segment verification

Checked the effective report against **Replay calibration (A2)** and the amended Phase 2 exit criterion:

- All 30 original entries are covered in order, with distinct concerns and resolved/live parts split; the preserved
  blind report, read disclosure, and source-correction section supply the evidence chain.
- Deciding rules and the relevant record answers are present. The uncertain migration is returned as its explicit
  Owner pair; the Owner's calibration supplies the selected bounded and recorded-policy dispositions elsewhere.
- Every work-unit route names an actual Shapes and has a targeted scope/exclusion check. Both knowledge-content
  entries remain outside the host, as its explicit exclusion requires.
- The fresh four-case report still distinguishes kickoff pull-in, ready-making reconciliation, an independent
  same-file Errand, and a resolved/live split. No method input changed since that witnessed run.
- The two historical-parity reports remain failed. A2's effective, Owner-adjudicated result is not recorded as a
  third blind run or as recovery of historical equality. Source-only limitations are retained and accepted within
  this criterion; no actual routing or follow-up execution is claimed.

**Result: the amended segment criterion is satisfied.** The former historical-parity verifier stays superseded.
There is no open benchmark disagreement: outstanding choices at real routing are explicitly represented by the
method's required pair/carry-out boundary, not silently selected. A1 and A2 revalidate through Task 2.3, and the
CLI-read implementation proceeds with the original classification floor and routing contract intact.

## Drain scenario evidence

Classification-only snapshot: 102 real captures, one scratch-only seed, and 107 concern rows after splitting entries
43, 67, and 84. The scratch seed supplies the provisional/P3 horizon case; real entries already supply unclear
floors and targets holding entries. No inbox deletion, retention update, target edit, mint, or execution ran.

The primary read both live inbox sections, classified every capture, and checked target decisions and exclusions
using fresh `arc status` facts and `arc view design --for` renders. Two pointed readers gathered current source
excerpts for the 75 Errand captures; classification and scope judgments stayed with the primary. The source reads
confirm live mechanisms without claiming reproduction of historical incidents or external ecosystem readiness.

Artifacts retained locally: `/tmp/inbound-drain-inbox-scratch.md`, `/tmp/inbound-drain-entries.json`,
`/tmp/inbound-drain-status.json`, `/tmp/inbound-drain-designs/`, `/tmp/inbound-drain-source-a.md`,
`/tmp/inbound-drain-source-b.md`, `/tmp/inbound-drain-plan.json`, and `/tmp/inbound-drain-overlap.json`.

Every record vector below is ordered: steps not knowable yet, deliberate exclusion, costly reversal, decision
outgrowing its line. A bounded correction/comparison with named scope receives four No answers; infrastructure
changes keep their review signal. Pairs are proposals for the drain interlock, never a claimed Owner selection.
Existing explicit retention, sequencing and execute-bound commitments remain in the plan; reclassification proposals
do not revoke them. Work-unit captures 95, 96, 98 and 102 become Errand proposals despite their target hints.

### Per-concern plan

- `1` Retire or justify the remaining pre-public-release compatibility readers: `errand`; record `No/No/No/No`; prior
  state `retained`.

- `2` Adopt TypeScript 7 and remove the TS6 deprecation bridge when the ecosystem is ready: `errand`; record
  `No/No/No/No`; prior state `retained`.

- `3` Stop frontline resolve handing back a pending admission at a head the Errand has left: `errand`; record
  `No/No/No/No`; prior state `retained`.

- `4` Make arc review status report a planning-grooming exemption instead of review-required: `errand`; record
  `No/No/No/No`; prior state `retained`.

- `5` Move ARC's remaining GitHub merges onto the async merge API: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `6` Let an Owner's additional-pass authorization reopen a converged delivery member: `errand`; record `No/No/No/No`;
  prior state `retained`.

- `7` Turn local review live-context read failures into typed refusals with a remedy: `errand`; record `No/No/No/No`;
  prior state `retained`.

- `8` State the Conventional Commits PR title rule where the Errand PR step reads it: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `9` Name the typescript-eslint preset the linter actually uses in TECHNICAL-OVERVIEW.md: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `10` Record the warm-run practice for local test-cost baselines: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `11` Remove relative links from three backlog artifacts before their work units start: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `12` Use MAX_GIT_OUTPUT_BYTES in the three validators that hard-code 32 MiB: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `13` Pin the name-status score exemption in the meta-reference check with a test: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `14` Isolate review continuations from unrelated malformed operation records: `Owner pair: errand / hold
  review-operation-state-isolation`; record `?/No/?/?`; prior state `retained`.
  Bounded relevant-producer lookup may suffice as an Errand; a new selection/index authority needs the coupled design.
  Shapes: `[ ]` **Keep unrelated review-operation schema skew from blocking exact-target status**.

- `15` Decide which config-catalog assertions stay hand-maintained: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `16` Name a local predecessor's review source, not its evaluator, in incremental-applicability selectors: `errand`;
  record `No/No/No/No`; prior state `execute-bound`.

- `17` Keep runtime npm policy from silently skipping worktree hooks: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `18` Preserve the concrete self-hosting build qualification refusal reason: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `19` Exclude bundle-require loader transients from build input membership: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `20` Keep typed lint from traversing disposable loader bundles: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `21` Make the Errand resume refusal for a changed intent name its fix: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `22` Make the start command's source-shape refusal name its fix: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `23` Make the session-init baseBranchSync and retiredSubdirs slot refusals name the offending key: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `24` Name the staged paths when direct retirement refuses a non-empty index: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `25` Keep the cause when decompose turns an occupation failure into occupation-failed: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `26` Carry the cut-map decoder's refusal code and message through decompose's execute, extract, and advance-base:
  `errand`; record `No/No/No/No`; prior state `execute-bound`.

- `27` Keep the Errand overlap check from counting an in-progress base merge as a work unit's own edits: `errand`;
  record `No/No/No/No`; prior state `execute-bound`.

- `28` Let decompose base advancement accept authored destinations: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `29` Authorize teardown of a decomposed origin from its transition record: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `30` Report a decompose release path set that Git can stage: `errand`; record `No/No/No/No`; prior state `retained`.

- `31` Provision hooks in decompose candidate worktrees: `errand`; record `No/No/No/No`; prior state `retained`.

- `32` Give a committed decompose candidate an ARC-owned discard: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `33` Render a decomposed member's narrative Origin without a code span: `errand`; record `No/No/No/No`; prior state
  `retained`.

- `34` Make lint:md:file refuse an excluded path instead of reporting zero files as a pass: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `35` Allow managed lifecycle metadata updates on Git-converted CRLF files: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `36` Make leased remote branch deletion replay after an already completed delete: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `37` Audit non-timeout materializing-fetch failures and preserve sync JSON output: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `38` Remove neverthrow: the codebase's failure idiom is the Zod-defined discriminated union: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `39` Retire the vestigial lite active layout (.arc/active/status.md): `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `40` Find out whether Codex's read-only sandbox silently stops ARC's recovery hooks from writing: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `41` License the installed methodology content permissively, and ship the license with the npm package: `errand`;
  record `No/No/No/No`; prior state `execute-bound`.

- `42` Carry .worktreeinclude-listed gitignored files into every worktree ARC spawns: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `43a` Bring shipped prose that lists lanes and companion kinds in line with the code — planning-lane prose: `errand`;
  record `No/No/No/No`; prior state `execute-bound`.

- `43b` Bring shipped prose that lists lanes and companion kinds in line with the code — archive-companion prose:
  `errand`; record `No/No/No/No`; prior state `execute-bound`.

- `43c` Bring shipped prose that lists lanes and companion kinds in line with the code — meta-reference default:
  `errand`; record `No/No/No/No`; prior state `execute-bound`.

- `44` Make a refused frontline retry name its remedy: re-resolve for a fresh admission first: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `45` Remove the dangling arc-plan-conductor pointer from drain-inbox: `dismiss`; record `resolved`; prior state
  `retained`.
  The committed drain rewrite removes the conductor clause.

- `46` Carry the selected remote through singleton review-applicability selection: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `47` Make a raw commit in a hand-made worktree fail closed when its hooks path is missing: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `48` Scope the spec boundary carrier to when its freeze actually takes effect: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `49` Probe-ground a repair's claims about other domains before proposing its disposition: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `50` Show at the disposition gate that fixing a finding moves the head and costs a review pass: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `51` Make the workflow prose pins tolerate a rewrap: `errand`; record `No/No/No/No`; prior state `execute-bound`.

- `52` Enforce the exported-surface TSDoc rule with a scoped lint rule: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `53` Add an actionlint check for .github/workflows/: `errand`; record `No/No/No/No`; prior state `retained`.

- `54` Make integrity verification accurate for mode-scoped installs: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `55` Add the changed-file Markdown under-wrap check: `errand`; record `No/No/No/No`; prior state `retained`.

- `56` Check relative Markdown links over the installed layout, and refuse them in movable artifacts: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `57` Let the meta-reference check accept runtime Context: footer examples in code: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `58` Reconcile the Errand push three-way, as the identity transaction does: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `59` Retire the self-hosted CI runbook and runner recipe now that CI runs on hosted runners: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `60` Correct three stale rows in the storage-coupling register: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `61` Close the storage-coupling register row for quality-gate-hooks' state checks: `errand`; record `No/No/No/No`;
  prior state `execute-bound`.

- `62` Move the hand-rolled advisory-lock wrappers onto one lock-scoped helper: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `63` Flip ADR-022 to Accepted and re-point its retired cross-machine-sync-coherence references: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `64` Hold new code to the storage contract with an import ratchet, drained to zero by the rerouting: `Owner pair:
  errand / new-stub storage-boundary-ratchet`; record `?/No/No/?`; prior state `execute-bound`.
  The consumer map and existing architecture rules may make a bounded floor sweep sufficient; discovering semantic
  exceptions or a migration plan would cross the floor. Preserve the existing execution commitment until the Owner
  selects scope.

- `65` Renumber the duplicate 2026-q3 archive entry and refuse a repeated archive number: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `66` Give an Errand overlap judgment an executable reconciliation continuation: `errand`; record `No/No/No/No`; prior
  state `execute-bound`.

- `67a` Decide whether cognitive complexity replaces the cyclomatic limit — cognitive/cyclomatic comparison: `errand`;
  record `No/No/No/No`; prior state `execute-bound`.

- `67b` Decide whether cognitive complexity replaces the cyclomatic limit — test-bloat rule comparison: `errand`; record
  `No/No/No/No`; prior state `execute-bound`.

- `68` Gather the unit tests that read shipped Markdown into the contract lane: `errand`; record `No/No/No/No`; prior
  state `retained`.

- `69` Let the test-cost benchmark measure a named ref, so a pre-change baseline stays recoverable: `Owner pair: errand
  / new-stub test-cost-ref-measurement`; record `?/?/No/No`; prior state `execute-bound`.
  A bounded same-mode ref run may fit an Errand; a ref/build-capability boundary may need a recorded plan. The shipped
  test-reliability work is no pending home.

- `70` Give the test-cost benchmark a clean machine-readable result: `errand`; record `No/No/No/No`; prior state
  `execute-bound`.

- `71` Enable Node's compile cache for the CLI: `errand`; record `No/No/No/No`; prior state `untriaged`.

- `72` Start Git without the Windows launcher: `errand`; record `No/No/No/No`; prior state `untriaged`.

- `73` Dispatch the frontline resolver's offered / obtain-authorization state in run-errand: `errand`; record
  `No/No/No/No`; prior state `untriaged`.

- `74` Make the pre-commit task-numbering check match active task lists: `errand`; record `No/No/No/No`; prior state
  `untriaged`.

- `75` Right-size CPU admission for artifact-only ARC contracts: `errand`; record `No/No/No/No`; prior state
  `untriaged`.

- `76` Preserve cold-readable intent when minting planned stubs: `hold stub-mint-to-launch`; record `No/Yes/Yes/No`;
  prior state `retained`.
  Creation-side cold-readable intent constrains the exact planned-set mint, while meta-only start remains allowed.
  Shapes: D1. Extend the exact-set grooming substrate with planned-set minting.

- `77` Absorb cohort-cut coherence into decomposition doctrine: `dismiss`; record `resolved`; prior state `retained`.
  Cut completeness is integrated in the live doctrine draft.

- `78` Define maturity-preserving decomposition after task skeletonization: `dismiss`; record `resolved`; prior state
  `retained`.
  Maturity-preserving arms are integrated in the live doctrine draft.

- `79` Re-validate a dependency's landed contracts at a decomposed member's first session: `dismiss`; record `resolved`;
  prior state `retained`.
  The member-baseline section already carries the decomposition-specific residual.

- `80` Reconcile the delivery-backstop framing with the stack-first posture: `dismiss`; record `resolved`; prior state
  `retained`.
  The live stacked-delivery/decomposition section states discovery-time parity.

- `81` Inherit the re-chartered boundary checkpoint and own its decompose-arm content: `dismiss`; record `resolved`;
  prior state `retained`.
  The live doctrine consumes the shipped chassis and owns its decompose-arm content.

- `82` Admit scale and residual risk as doctrine inputs, never cutting mechanisms: `hold decomposition-doctrine`; record
  `No/No/No/Yes`; prior state `retained`.
  The overrun/checkpoint residual still needs a settled doctrine decision.
  Shapes: Boundary-read axes — structured, deliberately unsettled.

- `83` Re-derive stub launch from ordinary lifecycle status: `hold stub-mint-to-launch`; record `No/No/Yes/No`; prior
  state `retained`.
  Re-derive the obsolete receipt/handoff contract; the meta-only producer facet was resolved by 84841770a.
  Shapes: D4. Consume DTI's closed decomposition publication.

- `84a` Close the review-materialization reap gap and the locus roster's misclassification of them — materialization
  residue: `new-stub operation-resource-lifecycle`; record `Yes/Yes/No/Yes`; prior state `retained`.
  Split frontend evidence from general settled-operation/materialization residue. The current frontline draft excludes
  chunk-projection checkouts; general ownership needs its own design.

- `84b` Terminal collection for settled operation records: `hold review-orchestration-right-sizing`; record
  `No/No/Yes/Yes`; prior state `retained`.
  The settled review-record residual directly constrains the incumbent terminal ownership decision.
  Shapes: `[ ]` **Define terminal ownership and collection for review evidence**.

- `85` Give ceremony-created verification checkouts a lifecycle owner: `new-stub operation-resource-lifecycle`; record
  `Yes/Yes/Yes/Yes`; prior state `retained`.
  Ceremony, conflict, scratch and unregistered resources need creator-owned cleanup/environment contracts; the
  frontline-only draft excludes these creators.

- `86` Expose a read-only planned startability audit: `hold stub-mint-to-launch`; record `No/Yes/Yes/No`; prior state
  `retained`.
  A reusable read-only planning-tuple projection shapes launch readiness; it is not another start ceremony.
  Shapes: D5. Resolve one fresh launch projection.

- `87` Inherit the delivery lane's gate execution-environment contract: `new-stub operation-resource-lifecycle`; record
  `Yes/No/Yes/Yes`; prior state `retained`.
  General dependency/environment ownership for ceremony-created checkouts belongs with their lifecycle, outside the
  frontline-only draft.

- `88` Schedule required CI for every exact stacked-member head: `new-stub stack-ci-head-scheduler`; record
  `Yes/No/Yes/Yes`; prior state `retained`.
  Exact-head CI scheduling is independent of private reconstruction; the rebuild excludes host/checkpoint
  authorization.

- `89` Refuse a verified fix whose index carries reviewable content HEAD does not, on delivery-member targets: `errand`;
  record `No/No/No/No`; prior state `retained`.

- `90` Re-derive decomposition machinery readiness against the 2026-10-05 rehearsal: `hold decomposition-doctrine`;
  record `No/No/No/Yes`; prior state `retained`.
  Rehearsal evidence changes the readiness doctrine; the old August conclusion remains in the draft.
  Shapes: Machinery readiness — re-derived 2026-08-21.

- `91` If stub-mint-to-launch resumes before the flip, design its flow for route-now's new-stub too: `hold
  stub-mint-to-launch`; record `No/No/Yes/No`; prior state `retained`.
  A pre-flip route-only singleton is a second mint/publication caller and constrains the chosen API.
  Shapes: D1. Extend the exact-set grooming substrate with planned-set minting.

- `92` Replace stub-mint-to-launch's DTI blocker with its storage-cohort pause: `errand`; record `No/No/No/No`; prior
  state `retained`.

- `93` Guard or migrate the hook's source-script delegations that survive the cutover: `hold storage-cutover`; record
  `Yes/No/No/No`; prior state `retained`.
  Which surviving hook delegations need guards or installed verbs cannot be named before the deletion mapping.
  Shapes: Scope.

- `94` Validate commit messages across a pull request's range in CI, under the footer policy: `hold ghost-mode`; record
  `No/No/Yes/Yes`; prior state `retained`.
  A range check must enforce the chosen footer authority and merge-policy semantics, rather than duplicate the current
  hook.
  Shapes: Settled inputs (from `storage-contract`).

- `95` Offer an opt-in confirm step in the force-push advisory: `errand`; record `No/No/No/No`; prior state `retained`.

- `96` Cover the documented active/ layout in the projection's isolation acceptance test: `errand`; record
  `No/No/No/No`; prior state `retained`.

- `97` Treat a red push gate as the code leg's failure, so the state leg still publishes: `hold storage-ref-backend`;
  record `No/No/Yes/No`; prior state `retained`.
  A hook refusal must participate in the split code/state transport policy; that shared failure contract needs
  recording.
  Shapes: Scope.

- `98` Decide whether arc delivery plan inventory schema stays beside arc schema get: `errand`; record `No/No/No/No`;
  prior state `retained`.

- `99` Fire author self-review in an Errand when routing requires it, or exempt the Errand vehicle: `hold
  review-orchestration-right-sizing`; record `No/No/Yes/Yes`; prior state `untriaged`.
  Choose the authority for author-self-review obligations versus the Errand vehicle; it affects callers beyond a
  wording repair.
  Shapes: Scope (provisional).

- `100` Key the Claude Code compaction seed to its session through CLAUDE_CODE_SESSION_ID: `hold recovery-hardening`;
  record `No/No/Yes/No`; prior state `untriaged`.
  Claude’s session key and subagent rule constrain the shared seed/marker/audit binding.
  Shapes: `[ ]` **Bind compaction recovery to the live directed-worktree locus**.

- `101` Weigh routing into a work unit past planning case by case, never assuming it safe: `hold
  inbound-routing-method`; record `No/No/Yes/Yes`; prior state `untriaged`.
  The Owner’s post-planning placement principle constrains started-target eligibility; adoption needs a
  scope/amendment decision.
  Shapes: D2 — The disposition gate.

- `102` Confirm at the flip rehearsal that every hand-editable projected kind has its parser: `errand`; record
  `No/No/No/No`; prior state `untriaged`.

- `103` Specify parser-required nesting tolerance for managed captures across portable lint settings: `hold
  adopter-markdown-contract`; record `No/No/Yes/Yes`; prior state `untriaged`.
  Accepted nesting versus author preference constrains the parser/config contract still being designed.
  Shapes: `[ ]` **Define ARC's markdown-format contract with adopters (out-of-box lint fit)**.

### Coupling, scope and waits

Started targets are all owned by `andrew`. They take owner adoption in their own session, preserving their recorded
pauses; no base-branch draft receives a note. Entry 101 is an execution-stage proposal against D2, not authorization
for a scope change: its owning session must decide amendment/adoption case by case before implementing it.

The live decomposition draft already integrates entries 77–81, so those dismiss rather than accumulating another
held copy. Its still-open boundary axes and stale machinery-readiness conclusion justify 82 and 90. The live
stub-mint design’s D1, D4 and D5 cover creation, publication and readiness without its exclusions over integration
authority, scheduling, extraction or topology ownership being recruited.

The frontline checkout design explicitly excludes chunk-projection checkouts; broader ceremony resources therefore
propose `operation-resource-lifecycle`. The settled-record facet of 84 separately shapes right-sizing’s terminal
ownership entry. The delivery rebuild excludes host/checkpoint authorization and general recovery; exact-head CI
scheduling therefore proposes its own stub. Its staged-index guard and inventory-wrapper choice remain bounded
Errands. All new-stub proposals are provisional, pending the Owner’s commitment decision.

Ghost mode’s footer policy, backend Scope’s split code/state push loop, cutover Scope’s deletion passes,
right-sizing’s Scope, recovery’s directed-locus entry, and the adopter contract’s parser/config entry establish
the other homes. Their boundaries exclude no concern in this proposed set.

### Confirmation-plan offers and revised plan

- `adopter-markdown-contract`: 1 held entries; oldest provenance `2026-07-07`; offer to re-triage once.
- `recovery-hardening`: 13 held entries; oldest provenance `2026-07-05`; offer to re-triage once.
- `review-operation-state-isolation`: 2 held entries; oldest provenance `2026-09-13`; offer to re-triage once.
- `review-orchestration-right-sizing`: 20 held entries; oldest provenance `2026-08-10`; offer to re-triage once.
- `storage-cutover`: 2 held entries; oldest provenance `2026-09-28`; offer to re-triage once.
- `storage-ref-backend`: 2 held entries; oldest provenance `2026-09-28`; offer to re-triage once.

Only the seeded adopter hold carries a horizon advisory in this plan; it is copied verbatim from the listing:

```text
`adopter-markdown-contract` is provisional (P3); an entry routed here waits for it. Raise its priority or send a separable part now?
```

Simulated pick: `adopter-markdown-contract`. Its one existing parser/config concern is still live, spec-worthy and
on topic. The revised plan adds `hold adopter-markdown-contract`, Shapes “Define ARC’s markdown-format contract
with adopters (out-of-box lint fit)”, retaining the incumbent. That is one of the re-triage door’s bounded outcomes;
it folds or rejects nothing. The same count, oldest date and verbatim horizon remain visible. The simulation does
not claim an actual Owner selection or confirmation.

Destination overlap was empty for the six CLI-resolved backlog drafts. Two unrelated branch-residue warnings remain
advisory; the overlap posture is proceed, with those warnings disclosed. Fresh Errands and new-stub proposals
require their own later execution/commitment checks. This repository’s shared-inbox write ban remains in force;
deferred atomic routes wait in the identity-global inbox under that standing direction, not a tracked flush.

Coverage/heading/horizon/offer/retained-state checks ran against the prepared plan and actual source renders. The
initial checker incorrectly demanded offers for targets with no held entries; corrected to the stated “already
holding entries” condition, it passed. This was a checker defect, not a routing-scenario failure. The original
first-check failure remains in the tool record. The source-backed plan satisfies the segment exit criterion.

## Route-now classification-only scenario

The constructed fixture exercises `arc-inbox` step 1's `fast path` call before any hand-off. It records proposals,
not live captures or new work commitments. Commitment to place now is an explicit scenario input. No routing
write, stub mint, target adoption, or Errand allocation ran; the fixture's Owner pair remains unselected.
The primary classification trace and its supporting artifact checks close this bounded scenario. They are not an
independent replay or a claim that an Owner confirmed these new routes.

### Inputs and live reads

- Fixture: `/tmp/inbound-route-now-fixture.json`; artifact checker: `/tmp/inbound-route-now-validate.py`.
- Fresh project purpose rows: `/tmp/inbound-route-now-project.json`, produced by `arc status --project --json`.
  Read non-shipped purpose rows to shortlist; no `verification-resource-lifecycle` exists among them.
- Fresh semantic designs and typed individual status: `adopter-markdown-contract`, `review-checkout-lifecycle`,
  `review-orchestration-right-sizing`, and `delivery-rebuild-continuity`. The two started targets were read through
  `arc view design --for`, which selected their registered checkouts rather than the base's stale copies.
- Additional purpose/scope reads for testing neighbors: `test-suite-contention-hardening` and `quality-gate-hooks`.
- Still-live source facts: `src/lib/test-cost/cli.ts` accepts four named options but its unknown-option diagnostic
  supplies no accepted-option list; `src/lib/task-list/scanner.ts` rejects numbered checkbox bullets indented less
  than four spaces. These are inputs to constructed requests, not discoveries being implemented in this work unit.
- Resource grounding: `src/scripts/review-gate/hosts/local/review-materialization.ts` allocates immutable detached
  materializations. The new request below is an explicit hypothetical contract for ad hoc ceremony verification
  resources; it does not assert that every existing resource lacks an owner or absorb the named incumbents' work.

### Coupled concern

**Input:** Define the adopter-facing policy separating parser-required indentation from linter preference across
managed formats. Hint: `adopter-markdown-contract`.

**Record answers:** (1) No — the request is a policy decision rather than unknown implementation steps; (2) Yes —
parser invariants must remain distinct from author preference; (3) Yes — a promised formatting contract is relied
on by project-authored managed files; (4) Yes — alternatives and rationale exceed a short decision line.

**Proposal:** `hold adopter-markdown-contract`. `_Shapes:_ Define ARC's markdown-format contract with adopters
(out-of-box lint fit)`. Its existing inbound entry explicitly names parser tolerance and the adopter-facing
contract. That decision passes coupling, and the design carries no exclusion defeating it. The fast path into
another work unit holds rather than folds. No stub is proposed.

Typed status names `andrew`, provisional, not occupied. The buffer contains one entry, oldest 2026-07-07.
The caller would use a route-only Errand off the base and re-check before writing. There is no foreign-owner gap.
The listing-row advisory, shared with the unclear concern's work-unit candidate, is preserved verbatim:

```text
`adopter-markdown-contract` is provisional (P3); an entry routed here waits for it. Raise its priority or send a separable part now?
```

### Homeless spec-worthy concern

**Input:** Give ad hoc ceremony-created verification repositories a creator-owned retention, cleanup and
execution-environment contract. Explicitly exclude frontline, chunk-projection and plan-derived delivery checkout
implementations, and terminal review-record collection.

**Record answers:** (1) Yes — creator and environment relationships need mapping before the steps can be named;
(2) Yes — the named exclusions must survive later implementation; (3) Yes — a wrong cleanup/retention authority can
lose evidence or unsaved work; (4) Yes — ownership, alternatives and cleanup criteria need a durable design record.

**Shortlist, bounded to three:** `review-checkout-lifecycle` owns the frontline ephemeral checkout; its Purpose,
Success signal and Resolved work-unit boundary do not own the broader requested contract. Its chunk-projection
exclusion names `chunk-scope-binding`, whose existing implementation is also expressly excluded from this request.
`review-orchestration-right-sizing`'s terminal-collection entry shapes review records, explicitly excluded here;
its Scope and Non-goals provide no general verification-repository contract. `delivery-rebuild-continuity`'s Scope
boundary owns plan-derived candidate and resolution paths, also explicitly excluded. These are neighbors; the
request names no incumbent decision it changes. No target passes coupling and scope for this contract.

**Proposal:** `new-stub`, with every minting judgment surfaced for an Owner decision:

- Commitment: provisional — retain the future contract without claiming execution commitment.
- Priority: P2 — proposed ordinary operational improvement, not an immediate failure response.
- `Class`: Heavy — a composed design and substantial creator mapping; no invention claim.
- Slug: `verification-resource-lifecycle` — absent from the fresh project facts.
- Origin: internal — constructed route-now scenario.
- Dependencies: none proposed — the contract can be designed against existing primitives; no unsatisfied predecessor
  is asserted. Named adjacent owners remain coordination boundaries, not invented dependency edges.
- Purpose: Give ad hoc verification repositories a creator-owned retention, cleanup and execution-environment
  contract.

These are simulated proposal values, not accepted metadata. An actual confirmed route would take a route-only
Errand, re-check the shortlist and scope in its checkout, then mint the meta and referenced design together.

### Errand-shaped concern

**Input:** Add accepted option names to the existing `Unknown test-cost argument` diagnostic without changing
parsing or measurement behavior. Deliberately supplied hint: `quality-gate-hooks`.

**Record answers:** (1) No — the parser already contains the accepted list and the diagnostic locus; (2) No — the
request creates no unexpected exclusion; (3) No — correcting wording takes another bounded change, with no
persisted format or authority contract to unwind; (4) No — any choice fits a short Decided line.

**Proposal:** `errand`, decided at the record floor before homing. The target hint and infrastructure surface do not
create a work-unit home. An immediate route would enter `arc-errand`; deferral would remain a home-less Errand
capture. Neither vehicle ran.

### Unclear Errand line

**Input:** Accept two-space task subtask markers, initially changing only the task scanner. The request leaves
unresolved whether task-only tolerance deliberately excludes other managed formats or commits a shared formatting
contract. Hint: `adopter-markdown-contract`.

**Record answers:** (1) No — scanner and segmentation loci are named; (2) Unclear — whether the initial narrow
scope is a deliberate lasting exclusion is unspecified; (3) Unclear — a bounded parser adjustment is cheap to
reverse, while an adopter-facing format promise can require more than another Errand to unwind; (4) No — the local
implementation choice alone fits a short decision line.

**Proposal:** the pair `errand` / `hold adopter-markdown-contract`, with all four answers shown. The work-unit
candidate carries `_Shapes:_ Define ARC's markdown-format contract with adopters (out-of-box lint fit)` and the
same verbatim horizon advisory above. Its incumbent parser-required-versus-preference decision passes coupling
and scope. There is no default and no claimed Owner selection; a real invocation stops before carrying either
route out.

### Closure

The four distinct inputs produced the required existing-home hold, fully specified new-stub proposal, Errand, and
unclear Owner pair before minting. Artifact checks verify four-case coverage, the six named minting fields, the
absent proposed slug, live target facts, actual Shapes heading, held-entry count/date, exact horizon text, and the
unselected four-answer pair. Judgment remains the primary method application recorded above. No segment scenario
failure or forward design amendment arose.

## Verification review record

The criteria companion is advisory working review, separate from Candidate review lanes. Each fresh reviewer
received the complete specification, unmarked task list, historical scenario notes, complete change set, and reachable
tree. The primary verified every finding against source and performed only the approved response set.

- **Pass 1 of 2:** The reviewer reported ordinary bold-continuation truncation and over-width help as minor. Source
  triage confirmed the archived Purpose failure as major and the help-width E2E failure as minor. Author self-review
  separately confirmed major stub-writing mechanics outside Binding. The complete three-fix set and Pass 2 were
  approved. Both method copies were corrected; help was wrapped; ordinary emphasis and next-field regressions were
  witnessed red then green. Material fixes withheld convergence and the named Pass 2 authorization was consumed.
- **Pass 2 of 2:** An indented bold phrase ending in a colon still truncated Purpose (reported minor, verified major).
  Source reproduction returned only `Place work by the`. The approved response distinguished column-zero bare fields
  from indented emphasis; one new regression failed before correction and all 31 Purpose cases passed afterward.
  Stop state was cap-exhausted until the explicitly approved over-cap Pass 3 was consumed.
- **Pass 3 of 2:** Unmatched and escaped literal backticks suppressed sentence termination (reported and verified
  major). Source probes and the existing Markdown parser distinguished text from inline code. The approved response
  used actual inline-code source positions; both new cases failed before correction and all 33 Purpose cases passed.
  Explicitly approved over-cap Pass 4 was consumed after response performance; material fixes withheld convergence.
- **Pass 4 of 2:** Fenced examples and HTML comments supplied false metadata and selected the wrong layered Design
  artifact (reported and verified major). Approved response located real bold fields within parsed paragraphs. Three
  extraction cases and one layered-selection case failed before correction; all 37 Purpose cases then passed.
  Explicitly approved over-cap Pass 5 was consumed after response performance; material fixes withheld convergence.
- **Pass 5 of 2:** The reviewer reported minor triple-hyphen continuation truncation. Primary source triage confirmed
  minor; a separate author check confirmed minor false field boundaries within a wrapped code span. Both are narrow
  formatting defects; their carrier criterion remained unresolved until correction. The complete two-fix set and
  closure of the review loop were approved. The response removes redundant raw structural boundaries and protects
  code-span text with existing parsed positions. All three new cases failed before correction; all 40 Purpose cases
  then passed. Applied source and tests exactly match the approved proposal. Stop reason: converged with settled
  minor findings, allowance exhausted; no successor pass was requested or launched.

The last minor response has no fresh successor review. Its bounded source re-read and fail-first regression evidence
carry the approved response check; complete current quality gates are recorded with the criteria report. No canonical
producer result, lane receipt, or satisfying hosted-review evidence is created by these reports.

## Verification criteria report

The terminal walk covers the complete work-unit diff and reachable tree, including the approved verification
repairs. The flat task-list criteria remain the authority; the following loci and normalized-text digests bind
each disposition without repeating criterion wording. The working-tree delta listed below is the staged subject
for initial Candidate attestation; subsequent managed Candidate and meta records are ceremony output.

```yaml
criteria-slice: Success Criteria
span:
  diff:
    base: 159fdcdeba90a21c9d1bb11cb631d5a46111a6be
    head: ca7126e2081dfc5dfa48ff5c37d3b9453d67807f
    additional: approved verification fixes and documentation closeout
    additional-paths:
      - .arc/active/notes-inbound-routing-method.md
      - .arc/active/tasks-inbound-routing-method.md
      - .arc/system/.internal/manifest.json
      - .arc/system/methods/route-discovered-work.md
      - packages/arc-framework/__tests__/unit/status/work-unit-purpose.test.ts
      - packages/arc-framework/arc/system/methods/route-discovered-work.md
      - packages/arc-framework/src/cli.ts
      - packages/arc-framework/src/lib/status/work-unit-purpose.ts
  reachability:
    head: ca7126e2081dfc5dfa48ff5c37d3b9453d67807f
    additional: the current files at the eight paths above
  boundary-order-deviation: null
criteria:
  - locus: Success Criteria > 1
    criterion-digest: sha256:48ba2e720ddefd8e76278ba2729d039babe342ace53e37db2b578cfef88e220c
    evidence: >-
      A2 in spec-inbound-routing-method.md explicitly supersedes historical parity. Notes preserve both failed
      comparisons and the Owner-calibrated effective report; no historical equality is claimed.
    state: "[~]"
  - locus: Success Criteria > 2
    criterion-digest: sha256:0b6142cd4ddb2efb409380c0178d0fa69b07920f9c1307dec7174a90c5d62a7d
    evidence: >-
      notes-inbound-routing-method.md, Route-now classification-only scenario: four concerns return a validated
      hold with Shapes, complete simulated new-stub fields, Errand, and an unresolved Owner pair with four
      answers. The executable artifact checker passes.
    state: "[x]"
  - locus: Success Criteria > 3
    criterion-digest: sha256:2ab14ede1c5f01e7ba75ff52536b3369a768150c4030c9e9496590be9404cc1b
    evidence: >-
      notes-inbound-routing-method.md, Drain scenario evidence: 107 concern rows from 102 captures and one
      calibration seed; actual target Shapes/exclusions, exact advisory strings, count/date offers, bounded
      picked-stub re-triage, and Owner pair retained. No carry-out writes performed.
    state: "[x]"
  - locus: Success Criteria > 4
    criterion-digest: sha256:32207ac10a0fb37675b00cc1fdaf9153cb3575f65f32f37fc7fd38bb1afe2b7b
    evidence: >-
      work-unit-purpose.ts, project-view.ts and project-horizon.ts connect source-bound Design reads to per-slug
      status and listing facts. Forty focused Purpose cases pass, including twelve regressions witnessed red
      before their approved repairs. The final 699-test E2E pass covers nullable purpose, owner/state/position,
      horizons, archive/ref provenance and started-source behavior.
    state: "[x]"
  - locus: Success Criteria > 5
    criterion-digest: sha256:2c5ef848fd4fb2921583e34c196e119ed57fb9f0cd95ba1b84f2016ac0e6bf21
    evidence: >-
      started-artifacts.ts and shared selection route design/spec render, path and editor through the same
      registered checkout or local ref. view.e2e.test.ts proves dirty started checkout content and ref-only
      render/path refusal; QUICK-REFERENCE Artifact Viewing states the source contract.
    state: "[x]"
  - locus: Success Criteria > 6
    criterion-digest: sha256:5057d99d863d9af7fea210f98c99719738af3b3d0f035a0da9ab55ad504e4ab1
    evidence: >-
      Both route-discovered-work.md copies contain the required neutral gate, homing, doors and vocabulary; all
      writing mechanics are inside Binding. classify-work-unit is declared/related. Recipe, canonical skills,
      indexes and manifest resolve the method; inventory totals agree.
    state: "[x]"
  - locus: Success Criteria > 7
    criterion-digest: sha256:8b5f33b339cacc13adf4d137f478d2c7c2e5a418d71cdd71636e7e6820d2c312
    evidence: >-
      Changed workflows and arc-inbox/arc-errand skills declare and mark direct method calls. run-errand rechecks
      route-only work in its checkout; Promote Errand maps four answers to floor. Inbox strategies/header carry
      the specified readings without duplicating the gate.
    state: "[x]"
  - locus: Success Criteria > 8
    criterion-digest: sha256:eedf125871e1ea6a48ff249504accc1c820366f7f1a5b8a20bfb67c4e3cee63e
    evidence: >-
      classify-work-unit boundary test 1 supplies four record questions on its existing axes. Work-organization
      strategy points to it at all three loci, retains the maintain matrix and new-stub statement, and explains
      rename against question 1.
    state: "[x]"
  - locus: Success Criteria > 9
    criterion-digest: sha256:0d8815a59edae435c8576d39ecf9652b55ae6843006b7b7db8c6a97af2d19ba5
    evidence: >-
      DEV-RULES.ARC Discovered Work Routing contains the specified invariant verbatim in both copies. Complete
      diff inspection found no other always-loaded surface edit.
    state: "[x]"
  - locus: Success Criteria > 10
    criterion-digest: sha256:8b06fe8187451a7c97a63b380d5c3f0b8a8f0d8347e25cc38b59441297669114
    evidence: >-
      ADR-037 is Accepted and records the record test and retirement. ADR-021/027 retain their standing decisions
      and append forward-pointer amendments.
    state: "[x]"
  - locus: Success Criteria > 11
    criterion-digest: sha256:f2cf9d750387f49652000365d0d2d76842cdd2fcc93c243bf59cdbaca9bea879
    evidence: >-
      Draft, outline, detailed PRD and detailed RFC templates state the first-sentence thesis convention.
    state: "[x]"
  - locus: Success Criteria > 12
    criterion-digest: sha256:6b60c5d9e1e9e609c3460190f4e3f85778b47649bfbbc8e7f720ecdce9960dec
    evidence: >-
      Trigger checker passes. Fifteen changed Framework paths and nineteen direct package/project pairs compare
      identically. check-package-sync.sh was replayed against all thirty first-parent work-unit commits with zero
      exits and no warnings; the actual eight-path staged verification delta also passes.
    state: "[x]"
  - locus: Success Criteria > 13
    criterion-digest: sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c
    evidence: >-
      Final Tier 3 passes Markdown, TypeScript and shell lint; source and test type checks; all three ARC contract
      checks; full declaration build; aggregate change review; routine tests (17096 passed, 1188 skipped); and
      local E2E (699 passed). Final documentation and staged Markdown checks are part of this closeout.
    state: "[x]"
  - locus: Success Criteria > 14
    criterion-digest: sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f
    evidence: >-
      Complete execution subject has no unresolved criterion or review response. This is verification readiness
      for Candidate preparation; private review, publication, required host checks and exact-head merge approval
      remain separate boundaries. Landing follows RELEASE-GATES.md manual singleton bridge, with archive in a
      separate PR after landing.
    state: "[x]"
  - locus: Success Criteria > 15
    criterion-digest: sha256:c7ecd5728c5bc0eda43e7861cf6d6880b66a63f266473b885c7ed4816de7a332
    evidence: >-
      A1 method/callsite change and notes contrast trace distinguish kickoff pull-in, ready-making fold with
      own-work Shapes, resolved/live split, and independent same-file all-No Errand.
    state: "[x]"
  - locus: Success Criteria > 16
    criterion-digest: sha256:b6e6a549400ef913645561b89d29e2f906112e85267dab08b125788ab26cbb45
    evidence: >-
      A2 effective report covers all thirty fixture entries with deciding rules, actual Shapes/exclusions, split
      concerns/liveness, knowledge-content exclusions, explicit record answers/Owner calibration, and preserved
      blind failures.
    state: "[x]"
summary: 16 criteria; 15 met; 1 superseded by A2; 0 unresolved
```

### Gate and delivery evidence

The final code subject passed all nine static/build commands: `lint:md`, `lint:ts`, `lint:sh`, `typecheck`,
`typecheck:test`, `lint:arc:triggers`, `lint:arc:domain-rules`, `lint:arc:section-refs`, and `build`. The admitted
routine lane passed 17,096 tests with 1,188 skipped across 1,145 passing files and one skipped file. The admitted
E2E lane passed all 699 tests across 70 files. The approved Purpose repairs add twelve regression cases to the
original 28; every observed failure was witnessed before its repair, and all 40 focused cases pass afterward.
Documentation-only closeout edits receive fresh Markdown and ARC contract checks; the unchanged code gates carry.
The final staged Markdown gate and package-sync hook also pass. Historical hook replay tested all thirty
first-parent work-unit commits with their actual parent and index trees; every exit was zero with no warnings.

The executable started-artifact E2E checks fail if the composed command returns a stale backlog design instead of
a dirty started checkout or selected local ref. Purpose regressions similarly reject false Markdown fields and
incorrect sentence boundaries. These are observable behavior checks, rather than repetitions of implementation.
The route-now and drain artifact checks establish trace structure; classification judgment remains the recorded
source-grounded method application and explicit Owner calibration. Those scenarios were classification-only:
no real routing writes, stub minting or Errand allocation ran.

The original failed replay remains visible and is superseded only by A2. Both amendments have completed corrective
work and retained revalidation evidence. The specification's first-use questions about drain cost, cold-capture
answerability and live routes remain use questions, resolved by the first actual drain or route-now after landing;
neither scenario evidence nor this report claims production use. No essential implementation scope is deferred.
Execution readiness here hands off to Candidate preparation and grants no publication or merge authority.
