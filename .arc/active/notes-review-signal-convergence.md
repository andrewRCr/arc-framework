# Notes: Review Signal Convergence

## Resume assessment — 2026-09-07

### Decision and baseline

Resume `review-signal-convergence` as one WU, with native-stack delivery partitioning its landing. This supersedes
the July preference for four child WUs and the wait for decomposition or chunked-delivery machinery. The earlier
reasoning and estimates below remain history, not current instructions. `delivery-native-stack-composition` is
confirmed shipped; `plan-segmentation` is active in its own worktree and is advisory design input only.

The clean planning worktree retained five commits. Merge `b2313cf29` incorporates fetched `origin/main`
`e1b173981` without rewriting those commits. The sole conflict was the generated ROADMAP, regenerated from the
merged index. No RSC artifact conflicted. Rebuilding the local CLI was necessary to expose the landed commands.

The assessment retains `Heavy` and high-depth task generation: the concern is cohesive, but its authority-bearing
schemas, producers, stores, policy, and lifecycle consumers require substantial grounding. Boundary outcome:
`stays one WU + delivery-plan candidate`. There is no evidence requiring child WUs or a fresh problem-framing draft.
There is evidence requiring targeted spec amendment before task content fill.

### Landed-source reconciliation

Source paths in this section are relative to `packages/arc-framework/src/scripts/review-gate/`.

| Retained design               | Current evidence                                                                                                                                                     | Remaining work                                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Severity rename (§ 2)         | `core/review-primitives.ts` and `hosted/await.ts` still accept `blocker`.                                                                                            | Retain the occurrence-sensitive strict-current sweep, including generated schemas and both methodology copies.                                                                               |
| Judgment split (§ 4)          | `core/disposition-records.ts` already distinguishes agreeing grades, regrades, and unsupported findings through `effectiveDispositionSeverity` and reviewer helpers. | The explicit reported/verified shape is a simplification of shipped provenance, not its introduction. Preserve its settled intent; map every current variant and independently verified nit. |
| Verified-only gating (§ 4)    | `runtime/respond-command.ts` copies source fields and permits regrading; unsupported grades still fall back to reported severity in canonical gating paths.          | Make null verified severity explicitly record-only; never let reported severity or nit control ARC gating.                                                                                   |
| All-lane preparation (§§ 4–5) | `RespondProposalRequestSchema`, `resolveHostedSource`, and opaque source references already support local, frontline, and hosted findings.                           | Extend the existing preparation path; remove tasks whose sole purpose was adding already-present lane support.                                                                               |
| Hosted durability (§ 5)       | `HostedLaneAttemptBindingSchema` and `recordHostedAwaitAttempt` persist the complete hosted snapshot in mutable lane progress.                                       | Hosted evidence is not absent. Reuse immutable frontline result storage for result identity/replay; retain progress as a projection rather than inventing another hosted store.              |
| Pass/scope identity (§ 5)     | `bindFrontlineRun` identifies target/source/generation; local identities and hosted handles lack the proposed logical-pass/scope binding.                            | Bind execution at runtime, distinguish logical review from retries, and propagate policy/rubric/scope through actual producers.                                                              |
| Convergence (§ 6)             | `ReviewAttemptSchema` accepts source/outcome summaries; `resolveReviewPolicy` completes clean and `settled-findings` without approved severity evidence.             | Admit durable producer/disposition evidence and derive materiality. Settlement must cease to imply convergence.                                                                              |
| Lane order (§ 7)              | Response preparation, retained findings, current-head rerouting, and member progress already exist across several policy consumers.                                  | Reconcile every production caller with evidence-before-policy and response-before-continuation; do not replace landed progress with an older driver-only model.                              |

The hosted snapshot already has replay protection: `recordLaneAttempt` rejects conflicting terminal replays and
admits the bounded pending-to-terminal transition. The retained generalization would additionally separate result
content identity from mutable settlement progress; its justification cannot be absent durability or absent replay
checks. Reassess that marginal benefit against exposing a validated immutable result view over existing snapshots.
Preserve distinct receipt, result, approved-disposition, and progress responsibilities without assuming they require
another physical write. This proportionality question belongs in the spec review, not an implementation shortcut.

### Routed concern dispositions

The three held entries were read from the identity-global `USER-INBOX.md`, including all follow-up evidence.
They are adopted into this WU here; their mechanical resolutions are not yet claimed complete. Keep the held
captures until the reviewed spec amendment absorbs their acceptance obligations.

**Guard convergence attestation sequencing before publish-readiness — open; adopt.**
`prepare-work-unit.md` dispatches `run-convergence-verification` before `publish-candidate`, while
`verify-work-unit.md` § Step 3 says the staged attestation projection rides the verification commit. The return
path does not mechanically prevent committing that projection before readiness consumes the reviewed head.
Preferred amendment: a typed post-attestation continuation resumes prepublication with the projection staged;
the publication transition commits the final lifecycle projection once. A publication-spine scenario must prove
that this sequence neither invalidates the reviewed head prematurely nor manufactures another review pass.
Do not broaden record-only applicability simply to accommodate an avoidable intermediate commit.

**Preserve delivery-member progression through signal convergence — partly landed; adopt residuals.**
`projectHostedReservationPolicyProgress` retains member identity and counts complete effective hosted attempts
across head movement. `projectHostedReservationDischarge` presents retained outstanding responses before admitting
another request. Preserve both repairs. The remaining gap is verified-severity convergence per member, with the
ordinary policy ceiling and ordered first-outstanding selection. Retained applicability must never discharge a
material pass merely because its findings were settled. A clean member still advances after one complete pass.

The capture's concrete regression inputs remain useful: one member had five complete hosted passes with finding
counts `6, 7, 5, 2, 3`, while another discharged after one clean pass; a later local incremental correction was
persisted as complete coverage. `LocalLaneAttemptBindingSchema` still has no requested/effective coverage fields;
`earlier-review-attempts.ts` and `hosted-reservation-admission.ts` hardcode local coverage as complete. Preserve
requested and effective coverage through local attestation, persistence, history, accounting, and discharge;
surface adapter upgrades without overwriting the original request.

**Preserve native finding identity in disposition reports — open; adopt.**
`NormalizedReviewFindingSchema` retains identity/locus/evidence but no native label or source ordinal. Add bounded,
non-authoritative navigation metadata at normalization and preserve it through the default report. Show a native
label when available and explicit source ordinal; retain deterministic canonical record ordering and identities.
Cover titleless sources, duplicate titles, and mixed thread/review-body findings. The native phrase never decides
severity, disposition, settlement, or convergence; report-local `F1` labels do not replace durable identity.

**Owner authority remains separate.** `resolveDeliveryReviewTerminusAcceptance` already authenticates the Owner,
revalidates the exact first-outstanding member and boundary, and records an explicit accepted-risk terminus.
Preserve it as Owner authority. It neither proves convergence nor authorizes another pass. Conversely, a pass-cap
override authorizes exactly one additional review, not an accepted-risk terminus.

### Design decisions to settle before content fill

1. **Coverage, logical pass, and ceiling accounting.** The old spec describes logical-pass identity and convergence
   without the now-landed distinction between complete and incremental review. Hosted progress currently consumes
   complete effective reviews; local progress erases that distinction. Specify which execution advances which
   counter, how retries/fallback/chunks remain one logical review, and what evidence permits an incremental
   correction check to establish convergence against retained complete coverage. Preferred direction: preserve the
   existing coverage/applicability substrate, distinguish execution identity from complete-pass accounting, and
   require coverage sufficient for the current subject. An incremental clean result alone is not whole-target
   clean evidence. Do not introduce a WU-wide budget ledger or automatically demand complete review after every fix.
2. **Post-attestation publication continuation.** Settle the typed continuation and interruption/re-entry behavior
   described above, including a refusal or recovery after a premature commit. This is a missing lifecycle design
   in the retained spec, not merely a stale file path.
3. **Native navigation projection.** Settle the bounded field shape, source ordinal across mixed finding classes,
   and whether presentation uses source order or retains canonical order with explicit source ordinals. Lean toward
   the latter: it preserves current `F1` proposal order while making native matching straightforward. Define content
   digest treatment explicitly; display metadata has no decision authority, but result replay still needs an
   unambiguous complete-content contract.
4. **Result-storage composition.** Re-evaluate § 5 against the shipped hosted snapshot and its conflicting-replay
   checks. Compare generalizing the frontline immutable store with deriving the required result view/content
   identity from the existing hosted record. Lean toward reusing existing persistence where it can prove the full
   binding contract; keep the settled store generalization if that comparison demonstrates the need. No design
   reduction is approved by this assessment, and neither approach may weaken clean-result or disposition binding.

Keep the explicit reported/verified design and its null unsupported case unless the spec review finds a concrete
reason to amend it. Existing regrading alone is not grounds to discard the settled design. Update the description
of current behavior and map it into the chosen contract. Likewise, preserve the fail-closed chunk-carrier boundary;
this WU must not silently acquire automated chunk transport or union-proof construction.

Agent ergonomics is an acceptance constraint across these decisions: each public result must expose the next usable
action and source references, retaining runtime-owned identity and accounting. A resumed session should be able to
complete triage, approval, response, and continuation from public outputs without importing internals, constructing
digests, or reconstructing pass history from prose. Test that path at the behavioral member boundaries; adding more
precise schemas alone does not satisfy it.

### Provisional delivery partition and sizing

These are seven delivery members of one WU, not seven independently authored WUs. Each strict-current member must
update its complete affected acceptance graph and leave the shipped callers coherent. Numbers are rough raw
additions-plus-deletions estimates, including tests, generated changes, mirrored methodology, and assigned planning
artifacts; they are not measured future diffs or a certified sub-ceiling plan.

| Member                                      | Complete boundary                                                                                                                                                             | Rough raw churn |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1 — Review vocabulary and advisory contract | Severity sweep plus `withstood`, visible caps, and agent-managed convergence; assign shared planning artifacts explicitly.                                                    | 2,500–4,500     |
| 2 — Disposition judgment and navigation     | Existing three-lane proposal → explicit verified judgment → source-bound approval → faithful native-identifiable report and verified-only gating.                             | 2,000–4,000     |
| 3 — Execution and coverage identity         | Runtime-issued pass/scope binding through producers, retries, fallback and durable local/hosted coverage projections.                                                         | 2,000–4,000     |
| 4 — Immutable terminal results              | Frontline store generalization and hosted request → await → immutable result → response source; replay/conflict scenarios use the real producer path.                         | 2,000–4,000     |
| 5 — Local/frontline signal convergence      | Durable evidence admission → policy → approved response → current-target continuation, with material/minor/refuted/clean and cap scenarios.                                   | 3,000–4,500     |
| 6 — Hosted/member convergence               | Hosted and native-stack callers consume the same signal rule; retained responses, coverage, changed heads, first-outstanding progression, and Owner terminus remain distinct. | 2,500–4,500     |
| 7 — Publication closeout                    | Convergence attestation → readiness → publication projection without an artificial head-change loop, including interrupted re-entry.                                          | 1,000–2,500     |

The largest uncertainty is Members 3, 5, and 6: their contracts cross operation identity, history projection, policy,
and delivery discharge. Members 5 and 6 must share one reducer and must not temporarily force unbound hosted callers
through a newly strict local-only contract. Content fill must specify the legal intermediate contract and complete
caller inventory before accepting that cut. If this seam cannot land coherently within the ceiling, revise delivery
boundaries before implementation; do not hide a compatibility lane or move essential wiring to terminal verification.

This working range is approximately 15,000–28,000 changed lines overall. It is intentionally not the July estimate
minus already-landed tasks: the acceptance graph and publication/delivery coverage have grown. As one calibration,
the current response command, driver, two hosted reservation projections, and operation-state schema alone total
3,816 existing lines. That is surface size, not predicted churn. Measure file-level deltas during content fill;
target appreciable headroom below 5,000 per member and split again if generated or planning churn consumes it.

### Planning safeguards from plan-segmentation

Read `spec-plan-segmentation.md` from its active implementation worktree. Apply its useful reasoning manually:

- Prefer a settled substrate boundary for the vocabulary/identity contracts, then complete behavior paths for
  producer persistence, signal convergence, member progression, and publication. A shared schema alone cannot
  close a lifecycle obligation.
- Inventory every mandatory lifecycle row before finalization; give each a production callsite and executable
  scenario owner. Include replay, refusal, partial/unavailable results, response performance, target movement,
  coverage upgrades, cap stops, and publication re-entry, not only successful review.
- Put those outcome obligations into member/seam Success Criteria before any criteria report is recorded. Keep
  exactly one terminal WU verification task and use the shipped member-scope verification parents.
- Record temporary scaffolding and its retiring owner if any is unavoidable. Verification tasks collect evidence;
  discovered corrective work belongs with the behavior it changes.
- Do not claim segmentation lint, `segment` inventory typing, or any other unshipped machinery is available.

The seven-member proposal is delivery topology, not a forced one-member/one-segment equivalence. Its key improvement
over the old skeleton is that each behavioral member must exercise its production path before the next boundary.

### Remaining planning gates

1. Review this assessment and settle the targeted spec-amendment direction, especially coverage/accounting and
   publication continuation. Re-enter spec authoring in place; preserve the retained goals and historical decisions.
2. Refresh §§ 4–7, current-source context, acceptance criteria, and the three routed concerns. Audit the refreshed
   design before treating its former `Open Questions: None` claim as current. Preserve the existing
   `review-protocol-alignment` cohort membership: the merged base retains its coordination document. The initial
   probe's reference advisory is not evidence of retirement. Its shared constraints reinforce source provenance,
   reachable request shapes, proportional applicability, and keeping automated chunk transport outside this WU.
3. Rebuild the high-depth structural pass from the retained task inventory and reviewed member boundaries. Add the
   provisional Delivery Plan, member pointers/verifiers, lifecycle scenario ownership, and member/seam criteria.
   Recheck proportionality, complete coverage, and actual sizing inputs before the structural-pass interlock.
4. After structural approval, fill bounded task bodies; then run the normal per-phase grounding/decision gates and
   final suite-coherence pass. Recommend the normal fresh-context adversarial review for this Heavy WU.
5. Only after those folds settle, compose the canonical task-derived delivery plan with the landed inventory and
   authoring commands. Finalize through its review interlock. Activation and implementation remain unapproved.

## Empirical Context

On 2026-07-24, three false claims survived two independent fresh-context review passes under `withstood` and were
relayed on the strength of that label before source verification refuted them. The reviewers' cited facts were true;
the inferences drawn from those facts were false. This established that the defect was in how the primary consumed
the signal: "examined with no finding" had been treated as "cleared."

The incident supports retaining `withstood` as an attention signal while explicitly denying it correctness or
clearance authority. It also supports the claim-type risk gradient in the spec: externally verifiable statements
about source, behavior, or a diff warrant spot-checking before relay, while a reviewer's internal judgment about what
it found coherent is not independently verifiable.

## Cap-Boundary Rationale

The configured pass cap bounds the automatic effect of convergence. At `Light`, a one-pass cap ends the automatic
loop after the first pass regardless of convergence; at higher classes, a material finding can buy a bounded fresh
verification pass. A fix made on the final permitted pass remains an acknowledged final-fold residual, answered by
the planning workflow's post-settle in-context coherence re-read unless the operator explicitly authorizes another
fresh pass.

## PR-Size Evaluation and Planning Pause

Task generation paused after the high-depth structural decomposition on 2026-07-27. The first-pass skeleton exposed
26 substantive parent tasks, including 11 parents whose expected leaf count was `many`. That prompted a dedicated,
read-only PR-size evaluation before content fill.

### Estimated diff

The estimate counts raw PR churn as additions plus deletions:

| Surface                                      | Low    | Likely  | High    |
| -------------------------------------------- | ------ | ------- | ------- |
| Severity and judgment model                  | ~900   | ~1,950  | ~3,400  |
| Execution, result, and convergence substrate | ~3,500 | ~5,750  | ~9,200  |
| Lane choreography and adversarial contract   | ~1,800 | ~3,200  | ~5,800  |
| Final planning artifacts                     | ~1,500 | ~1,800  | ~2,300  |
| **Total raw PR churn**                       | ~7,700 | ~12,700 | ~20,700 |

The current tracked planning branch already carries 949 changed lines before a completed task list. After
deduplicating mirrored methodology and excluding generated-only churn, the likely conceptual authored change remains
approximately 8,000 lines. The estimate is therefore not an artifact of two-copy methodology or schema generation.

The strongest sizing signal is the execution/result/convergence substrate: its likely raw diff exceeds the 5,000-line
PR ceiling by itself. Existing review architecture changes provide compatible calibration: PR #224 landed at 14,878
raw changed lines and PR #226 at 11,737. Their exact scope differs, but both confirm that this class of record,
runtime, workflow, and test change routinely reaches five figures.

### Decision

Do not continue content fill or implementation in the current shape. `generate-tasks` already resolved at `high`, so
the scale discovery cannot be answered by a deeper planning pass. The work requires either:

1. preferred: spec-level decomposition into independently coherent work units; or
2. fallback: chunked delivery with independent PR boundaries that keep every review target below 5,000 changed lines.

The structural task skeleton is retained in `tasks-review-signal-convergence.md` as decomposition input. The active
meta keeps `Task List: [none]` while the delivery topology is blocked, so the undivided WU does not present as
implementation-ready.

### Candidate decomposition

The least-coupled four-member topology found during sizing is:

1. **Judgment provenance** — severity vocabulary, reported-versus-verified disposition fields, faithful presentation,
   and agent-managed `withstood` / convergence / cap semantics.
2. **Result binding** — logical-pass and scope execution identity, generalized result records and stores, and hosted
   terminal-result persistence.
3. **Convergence evidence** — operation-bound attempts, producer/disposition validation, verified-severity derivation,
   and runtime response-plan / target-movement handling.
4. **Lane choreography** — integration and Errand ordering, early approval of complete disposition sets,
   outstanding-response handling, and workflow contract tests.

Three members are not a safe default: combining convergence evidence with lane choreography is likely to cross the
same PR-size ceiling again. These boundaries are provisional inputs to the decomposition machinery, not committed
child-WU identities; re-run its integrity checks over the settled spec and structural task skeleton rather than
hand-materializing this cut.

The decomposed members inherit their design and executable-plan slices from the current spec and task skeleton. They
do not re-enter draft or spec authoring unless the decomposition integrity pass finds a concrete design defect or an
unresolved cross-member authority seam.

### Blocker and resume condition

Primary blocker: `decompose-transform-integrity`. Decomposition is preferred because it gives each concern its own WU
identity, spec authority, dependency edge, and lifecycle rather than treating delivery topology as an afterthought.

Alternate unblocker: `chunked-delivery`, if it lands first and can provide independently reviewable PR boundaries
without weakening exact-target review evidence. Stacked delivery is acceptable as a way to avoid waiting, but remains
second choice to proper decomposition.

Resume when either mechanism lands. If both are available, use `decompose-transform-integrity`. On resume:

1. re-probe both mechanisms' landed contracts rather than relying on this notes file for their invocation details;
2. run the decomposition integrity path over the current spec, retained task skeleton, and candidate cut above;
3. materialize each child from its settled design and task slices without restarting the planning pipeline;
4. re-estimate each resulting PR, including its planning artifacts, against the 5,000-line ceiling; and
5. proceed only after every member has a credible sub-ceiling delivery boundary.

---
