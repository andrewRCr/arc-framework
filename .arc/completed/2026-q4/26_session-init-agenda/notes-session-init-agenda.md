# Notes: Session-Init Agenda

## Contents

- [A4 — Store Start evidence](#a4--store-start-evidence)
- [A5 — Repaired-kit acceptance](#a5--repaired-kit-acceptance)
- [Standard review repairs](#standard-review-repairs)

**Design and coordination**

- [Today's workflow, step by step](#todays-workflow-step-by-step)
- [Surface census](#surface-census)
- [The always-loaded cut audit](#the-always-loaded-cut-audit)
- [Who the expected contracts are](#who-the-expected-contracts-are)
- [Neighbouring work](#neighbouring-work)
- [Inbound items](#inbound-items)
- [Strategy fit](#strategy-fit)
- [Coordination pointers](#coordination-pointers)
- [Carried context](#carried-context)

**Measurement and verification**

- [Sizing and measurement](#sizing-and-measurement)
- [Plain-resume rehearsal](#plain-resume-rehearsal)
- [Remaining-arm rehearsals](#remaining-arm-rehearsals)
- [Shipped-surface verification](#shipped-surface-verification)
- [Work-unit verification](#work-unit-verification)

**Implementation decisions**

- [Test pins](#test-pins)
- [Shipping a file](#shipping-a-file)
- [A1 — Literal elicitation](#a1--literal-elicitation)
- [A2 — Literal recovery branch operands](#a2--literal-recovery-branch-operands)
- [A3 — Backend capture selectors](#a3--backend-capture-selectors)
- [Grooming resume entry](#grooming-resume-entry)
- [Start lifecycle selection](#start-lifecycle-selection)

## Today's workflow, step by step

How each part of today's `session-init.md` (at `9eea962ce5`) maps onto the agenda. Section numbers are the spec's.

| Today                                       | Becomes                                                                       |
| ------------------------------------------- | ----------------------------------------------------------------------------- |
| Step 1 frame resolution, unavailable or     | `render` the `locus` surface, then `gate stop` (§ 5.4)                        |
| unresolved                                  |                                                                               |
| Step 2 branch-gone recovery                 | `exec`, `offer`, or `render` from the recovery slot and worktree list (§ 5.3) |
| Step 2 signal arms and transient resumes    | the compiler selects from the signals; a workflow `fragment` (`run-errand`,   |
|                                             | `drain-inbox`, `draft-design`) (§ 5.4)                                        |
| Step 2 `--start` focused recon              | `fragment` `assess-start-readiness` (§ 8.2)                                   |
| Step 2 cold-start                           | `fragment` `in-flight-scope-check`, then an offer (§ 5.7)                     |
| Step 2 materialize                          | an offer; accepting recompiles in place or hands off (§ 5.8, § 7.2)           |
| Step 2 sync channels, base sync, notes load | `exec` and `offer` steps carrying compiler-composed argv (§ 5.2, § 7.1)       |
| Step 3 load list and read rules             | `read` steps, executed by `read-load-set` (§ 4.3, § 8.1)                      |
| Step 4 freshness                            | compiler-computed from SESSION-NOTES; a `note` only on a gap (§ 4.9)          |
| Step 4 next-work discovery                  | `fragment` `discover-next-work` (§ 8.3)                                       |
| Step 5 orientation format                   | the spine (§ 9.1 item 5)                                                      |
| Step 5 conditional surfaces                 | `render` and `note` steps carrying CLI-composed text (§ 6)                    |
| Step 6 mismatch handling                    | the spine (§ 9.1 item 7)                                                      |

## Surface census

Composing every orientation surface CLI-side is the largest CLI piece. Of today's ~32 conditional Step 5 surfaces, about
eleven already carry composed text: `deliveryPosition.value.line`, `locusGuidance`, base drift, base-branch sync, both
reconciles, the hooks path, superseded divergence, rename-move remedies, and materialize refresh. About twenty are prose
templates the agent fills from slot fields today: local-ahead, no-upstream, detached HEAD, no-remote, dirty, the notes
surfaces, husk, the cleanup-residue lists, in-flight work units, materialize candidates, and the housekeep offer. Their
fields (`teardown.text` and `argv`, `remedy.text`, typed reasons) already exist. Two earlier counts gave 31 and 32;
`draft-operational-advisory-registers.md` holds the census both units share.

## Sizing and measurement

- **Per-piece projections**, in bytes from today's text each piece keeps:
    - spine ~16 KB unbudgeted: output discipline, the orientation format, the SESSION-NOTES boundary, mismatch handling
      (~2.3 KB of prose), the step rules, and about 1.5 KB restored at planning review (subject framing, the
      `--context` and cohort lines, the hand-off and its opt-in, WORKING-MEMORY binding, the crash-recovery trigger);
    - `read-load-set` ~3.5 KB;
    - `discover-next-work` ~2.5 KB;
    - `assess-start-readiness` ~3.1–3.8 KB.

  Holding the spine to its ~13 KB budget means compressing that kept text by about 3 KB, most of it from the
  orientation rules, with mismatch handling contributing.
- **A fresh start with the cheap tier** projects near ~20k tokens: the six always-read documents ~50 KB; the spine,
  `read-load-set`, and an arm method ~16.5–20 KB at the spine's budget; agenda output about envelope-sized (~12 KB); the
  skill ~0.5 KB. A fresh start under ~10k is out of reach without rule-placement design: the text that stays
  always-loaded is ~10.5k on its own.
- **The done-signal's percentages** restate absolute targets: ~5k of ~18k tokens for part 1 and ~22k of ~37k for
  part 2. A metered read put `session-init.md` about 60% above its bytes ÷ 4 figure.
- **Instruments.** Itemized runs use `claude -p --output-format json --tools "" --no-session-persistence` with the item
  on stdin, so each run is one turn: an item read through a tool spans several turns and counts the base context again
  on each, which inflates every figure by a constant and distorts the ratio. A run's figure sums `input_tokens`,
  `cache_creation_input_tokens`, and `cache_read_input_tokens`. The harness context report is readable only after the
  first response, so each real-session figure states whether that response counts. Part 1's real session reads
  only the files it compares; Part 2's is the whole load entering Orient.
- **The rehearsal kit** is `cinexplorer-migration/kit/` in the primary checkout's identity directory, absent from
  linked worktrees. Every recorded run (2026-10-22 to 10-23) failed the install's first commit on 28 broken links the
  recipe leaves; the script continues with the primary dirty, which derives `unresolved-checkout` rather than Orient.
  The kit's `fill-link-targets.sh <sandbox> <run-dir>` fills them by copying package files in, which departs from an
  install exactly as a new project gets it, so both the baseline and the result record whether it ran. The kit README
  documents `--source-ref`, which fails on `main` from a linked worktree's clone; `--source` takes the checkout.
- **Assumptions.** Arm usage skews toward a plain resume; no session-arm telemetry exists. The fresh envelope's ~12 KB
  is a brief's figure, not re-measured on a fresh install, and the agenda output's size is unmeasured until built.
- **Build estimate:** about a week; the forecast change set of 7–8k lines suggests that is tight.

### Baseline install

- Source head: `eaf54487d4efd718ae3cab6576e37d03deeb14f9`; base: `279aa8ebf9dfdd9d3dbc9ea8819c36b385ff3a07`.
  The source's `packages/` tree is identical to the base. The full build, pack, global-prefix install, and init passed.
- Kit run: `2026-11-01T145902`, under the primary checkout's `cinexplorer-migration/kit/runs/`. The first commit
  reproduced 28 broken links. The prescribed fill copied 10 missing targets; its second commit attempt passed with
  hooks enabled and pushed to the sandbox's local bare origin.
- Project: `~/dev/sandbox/2026-11-01T145902/agenda-baseline/`. A fresh session-init probe reports clean `main`, zero
  ahead/behind, and entering row `free-primary`, selecting Orient.
- Evidence: `~/dev/arc-evidence/session-init-agenda/baseline/` contains `metadata.json`, the raw probe, `items.json`
  with frozen measurement inputs, and reusable `measure-items.py`. Harness: Claude Code `2.1.316`.
- The itemized instrument uses one stdin item per `claude -p --output-format json --tools "" --no-session-persistence`
  call. It sums `input_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`, then subtracts the empty
  run's 6,564 tokens. Raw outputs and `summary.json` live in the evidence directory's `itemized/` subdirectory.

| Installed item                                 | Net input tokens |
| ---------------------------------------------- | ---------------: |
| `session-init.md`                              |           27,283 |
| `AGENT-BRIEF.ARC`                              |            3,546 |
| `AGENT-BRIEF.PROJECT`                          |              779 |
| `DEV-RULES.ARC`                                |           11,798 |
| `DEV-RULES.PROJECT`                            |            1,817 |
| `STRATEGY-INDEX`                               |            1,973 |
| `QUICK-REFERENCE` § Environment & Path Context |              488 |
| `arc-session` skill                            |            1,058 |
| Session-init probe envelope                    |            3,059 |
| **Total**                                      |       **51,801** |

The real-session instrument uses `claude --ax-screen-reader` plus the identical `--append-system-prompt` value recorded
in `real-context-summary.json` for all three controls. That instruction suppresses intermediate assistant prose.
Each value is the first `/context` report after the first completed turn and **includes the first response**; the
result-side measurement uses the same rule. The harness reports rounded token estimates, so the net values below
are approximate rather than exact usage counters.

| Real session                           | Context report | Less empty |
| -------------------------------------- | -------------: | ---------: |
| Empty: reply `OK`, no reads or tools   |          40.8k |          — |
| Part 1: only read `session-init.md`    |          71.1k |     ≈30.3k |
| Part 2: full bare init entering Orient |         101.8k |       ≈61k |

`context-*-controlled.terminal` and `context-*-controlled.jsonl` retain the reports and complete tool transcripts.
The controlled Orient transcript has one assistant text block, its final orientation. The earlier uncontrolled Orient
attempt emitted progress prose before completing its reads and is retained but excluded; the empty and Part 1 controls
were repeated with the same suppression instruction. The full baseline therefore precedes all shipped-text and
implementation changes, while the source remains at base `279aa8ebf9` plus planning-only activation and measurement
records.

### Result install and comparison

The result kit was built and packed from `bee3d5dc94a02a799cb52a1012860fef31495b1a`, after all shipped-text changes.
Run `2026-11-02T130014` installed into `~/dev/sandbox/2026-11-02T130014/agenda-result/`. Its first commit found 19
broken links; the documented fill copied seven missing targets. The retry committed with hooks enabled and pushed to
its local bare origin. The fresh probe selected Orient on clean `main` with entering row `free-primary`; all five
measurement sessions left tracked state and installed head `6cb7875c8eda19bc10e1261b190d1b898fd6eb31` unchanged.
This is the same documented link-fill accommodation as the baseline, with the changed missing-target counts retained.

`~/dev/arc-evidence/session-init-agenda/result/` retains the frozen inputs, raw itemized outputs, all five real-session
terminals and complete transcripts, launch metadata, installed agenda and probe, kit metadata, and
`real-context-summary.json`. The itemized script is unchanged from the baseline; its empty comparator is 6,563 tokens.

| Result installed item                          | Net input tokens |
| ---------------------------------------------- | ---------------: |
| `session-init.md`                              |            3,839 |
| `read-load-set`                                |              867 |
| `discover-next-work`                           |              789 |
| `assess-start-readiness`                       |            1,012 |
| `AGENT-BRIEF.ARC`                              |            3,386 |
| `AGENT-BRIEF.PROJECT`                          |              348 |
| `DEV-RULES.ARC`                                |           11,281 |
| `DEV-RULES.PROJECT`                            |              999 |
| `STRATEGY-INDEX`                               |            1,664 |
| `QUICK-REFERENCE` § Environment & Path Context |              297 |
| `arc-session` skill                            |              177 |
| Session-init agenda                            |            1,061 |

The Part 1 sums include the spine and `read-load-set`, plus the entered method for Orient and Start. Each real-session
control reads exactly those files and replies `OK`; the empty control replies `OK` without tools. The denominator is
baseline workflow input: 27,283 itemized tokens and approximately 30.3k real-session tokens after subtracting empty.

| Part 1 row | Itemized tokens | Baseline share | Real report | Less empty | Baseline share |
| ---------- | --------------: | -------------: | ----------: | ---------: | -------------: |
| Resume     |           4,706 |         17.25% |       46.3k |      ≈5.5k |        ≈18.15% |
| Orient     |           5,495 |         20.14% |       47.4k |      ≈6.6k |        ≈21.78% |
| Start      |           5,718 |         20.96% |       47.6k |      ≈6.8k |        ≈22.44% |

All three rows are below the approximately 28% target by both instruments. The full Orient itemized sum excludes
`assess-start-readiness`, includes the agenda instead of the envelope, and totals 24,708 tokens: **47.70%** of the
baseline's 51,801. Full real-session Orient reports 74.2k; less the matched empty session's 40.8k gives approximately
33.4k: **54.75%** of the baseline's approximately 61k. Both are below the approximately 60% target.

The real sessions use Claude Code `2.1.316`, `claude-opus-5-5`, and the baseline's identical flags and suppression
instruction. Every value is the first `/context` report after the first completed answer, including that answer;
rounding makes these estimates rather than exact counters. Each transcript contains one assistant text block after
all tools: `OK` for the controls, the final orientation for the full session. All required reads completed without
truncation. Full Orient also read the session-state method, fresh working-memory template, discovery status and inbox,
and directory listings; those real execution costs remain included. Its extra method read and sequential universal
reads are observed execution choices, not evidence that the spine's grouping instructions were followed exactly.
No early-prose result attempt was excluded or repeated.

## The always-loaded cut audit

Two read-only passes over the shipped copies on 2026-10-31, spot-checked at source:

| Tier                   | Bytes  | ~Tokens | What                                                                    |
| ---------------------- | ------ | ------- | ----------------------------------------------------------------------- |
| Cheap: `DEV-RULES.ARC` | 1.5 KB | ~360    | § When to Load's stale clause and duplicate bullets; two duplicate      |
|                        |        |         | pointers; artifact-relocatability narrative                             |
| Cheap: other documents | 8.7 KB | ~2,200  | the skill's restatement of session-init's flags (2.4 KB), template      |
|                        |        |         | fill-time comments (3.3 KB, mostly a fresh-install cost), duplicates in |
|                        |        |         | the `DEV-RULES.PROJECT` template, ~1 KB of stale text                   |
| Needs design           | 7.3 KB | ~1,800  | test-pinned or deliberately placed passages, several claimed elsewhere  |
| Keep                   | ~42 KB | ~10,500 | constraint and vocabulary text                                          |

`judgment-authority-model` already ran a constraint-first audit of `DEV-RULES.ARC`
(`notes-judgment-authority-model.md` § The always-loaded ledger) and reversed several cuts under review, so that file's
cheap tier was mostly taken. `adversarial-review`, `planning-review`, and `verification-review` hand both briefs to
fresh reviewers as their fixed orientation, so a brief passage that duplicates `DEV-RULES.ARC` is redundant only for
the session agent. `STRATEGY-INDEX` stays in the load set although its value is unmeasured: the session that audited it
had it loaded and still reached the two project check-docs only when prompted.

## Who the expected contracts are

- **§ 14.1's worktree-lock change** is `projection-substrate` (`spec-projection-substrate.md` § 12.6).
  `recommendBranchGoneRecovery` already composes `arc teardown <name>` for a shipped worktree, with no unlock.
  Whichever of the two changes lands second carries the other's wording.
- **The flip** is `storage-cutover` (`draft-storage-cutover.md`). It rewrites each affected workflow step from the
  consumer map in `notes-storage-contract.md`; for session-init that removes the notes dispatch and surfaces, moves the
  freshness anchor to the store state version, and reads session notes from the meta (`spec-storage-contract.md` D5).
  The register in `cohort-state-storage.md` sequences this change after the storage seam's locus and session-init work,
  which has landed.
- **Removing the contributor variant** follows `spec-storage-contract.md` § Fork contributors (D14), whose consumer map
  records "contributor scope collapses" for the file. `AGENT-BRIEF.CONTRIBUTOR` and the contribution ceremony stay with
  `contributor-path`.

## Neighbouring work

- **`draft-composable-workflows.md`.** D3 supplies the step vocabulary, invocation by signals, recompile, and the
  `offer` encoding; its § Worked example hand-compiles session-init. This change departs from D3 where § 3's choices
  and § 8.3's `pm.mode` handling say: D3's binding-time rule keeps install-time `arc:if` for config-static variation.
  D2's candidate layout, one directory per decomposed workflow with its arms beneath the spine, would later move
  `discover-next-work` and `assess-start-readiness` there as `private` and `fixed` methods, a mechanical move behind its
  resolver; `read-load-set` stays public, since `session-recover` calls it too.
- **`draft-loadset-composition.md`** § Working Framing: demote only to an explicit trigger, never to implicit
  awareness, and never demote a constraint. The `session-state` method's retirement stays with `loadset-composition`.
- **`analysis-load-set-scoping.md`:** the demotion precondition and its unresolved irrelevance defect, the
  unsafe-versus-pointless distinction, the `QUICK-REFERENCE` / `AGENT-BRIEF.PROJECT` mutual exclusion, the comparator
  constraints, that init and recovery are not parity-identical consumers, and § Why workflow range-addressing needs an
  authoring contract.
- **Ownership around this change:**
    - `instruction-optimization` defers its agenda work here (§ Inbound items);
    - `operational-advisory-registers` owns the advisory register vocabulary and cadence, and whether the session-start
      reminder nudges survive;
    - `cli-output-contract` co-owns the `render` and `offer` argument types after the cutover; its live draft is on
      `plan/cli-output-contract`, ahead of the backlog copy;
    - `orientation-surface-compression` and `rules-restructure` own the design tier inside the always-loaded documents;
    - `session-init-performance` owns probe speed in the same `handlers/status.ts`;
    - `session-roles` would generalize `--context`, and `stub-mint-to-launch`'s shared start core is what compiling
      the `--start` vet waits on.

## Inbound items

| Inbound item                                                 | Disposition                                                      |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| IO: always-loaded set loads however `arc-session` is invoked | Absorbed — the entry prefix (§ 5.1)                              |
| IO: a `--context` arm (load, skip discovery, orient)         | Absorbed — the `--context` signal (§ 2.1, § 5.4)                 |
| IO D3.1: a freshness slot from `Commit at Handoff`           | Absorbed — the compiler reads it (§ 4.9); the flip moves the     |
|                                                              | anchor                                                           |
| IO D3.2: phase-preamble offsets as a read-mode entry         | Out — both consumers slice from the cursor anchors in one        |
|                                                              | procedure (§ 8.1); precomputed offsets would split it            |
| IO D3.4: a precomposed orientation prelude                   | Absorbed — every surface is CLI-composed (§ 6)                   |
| IO D3.5: a `mismatches` slot                                 | Out — mismatch handling stays judgment in the spine (§ 9.1)      |
| CW: bound read groups by aggregate output                    | Absorbed — `read` groups (§ 4.3)                                 |
| CW: dispatch published remedy argv, not prompt text          | Absorbed — `exec` steps and `offer` choices carry                |
|                                                              | `SessionAction` (§ 3.3, § 4.11)                                  |
| CW: `--start` recon from the concrete start preflight        | Deferred — `stub-mint-to-launch`'s shared start core             |
| CW: release-wrapper mechanics as a config-selected fragment  | Out — `DEV-RULES.ARC` placement, design tier                     |
| CW: re-run rule classification where a step replaces prose   | Absorbed — withheld actions keep their limits (§ 4.11)           |
| CW: lift the envelope schema reference onto `arc schema get` | Absorbed — agenda schema registered (§ 2.3); `probe-envelope.md` |
|                                                              | deleted (§ 10)                                                   |

IO is `instruction-optimization`; CW is `composable-workflows`.

## Strategy fit

`strategy-procedure-evolution`, `strategy-knowledge-evolution`, and `strategy-session-operations` all fire on this
change:

- **Procedure P1 and P6** (the CLI computes; emitted text precomposed): the agenda and CLI-composed surfaces are the
  target shape. Where a choice needs judgment (the housekeep soft offer, a materialize pick), the CLI emits the closed
  choice set and the facts; the recommendation stays with the agent and the decision with the person.
- **P2** (no control flow in markup): the agenda is a flat list, and arm mutation recompiles rather than nesting.
  `assess-start-readiness`'s own reads are the known residual (§ 8.2).
- **P3** (verbs over mechanics): `exec` steps carry CLI argv, and today's `git fetch origin <base>:<base>` and
  `git pull --ff-only` lines move into emitted argv.
- **P4** (schemas generated): the agenda schema is registered and cited through `arc schema get`.
- **P5** (evals gate prose): no eval instrument exists (`workflow-eval-harness`), so rehearsal sessions on a kit
  install stand in, named as a proxy.
- **P7** (controlled vocabulary): agenda, step, spine, and fragment are defined in the spine, their only consumer
  (knowledge P6, extract on fan-in), not in `AGENT-BRIEF.ARC` (knowledge P10).
- **Knowledge P1** (constraints never on-demand): an arm's constraints may live in its method because the agenda loads
  it exactly when the arm fires.
- **Knowledge P4 and P5** (derived access paths; declare at point of use): no per-fragment tier or loading field; the
  spine's `arc.methods` declares the methods, and a workflow path the CLI supplies is a load-set read.
- **Knowledge P8** (don't blind-shard): the arms are procedural units with their own entry conditions and outcomes.
- **Session-operations tiers:** the spine is read at every session start; `read` steps carry the T1 and T2 documents;
  the three methods are T3, loaded at their fire-point. No load-set membership is demoted, honoring "when uncertain,
  prefer T1".

## Coordination pointers

Captured on 2026-10-31; each concern lives in its own home:

- `storage-cutover`: retarget the flip's session-init rewrite at the spine and § 7's module.
- `orientation-surface-compression`: it keeps only the design tier.
- An Errand: the stale `constitution/` references in the shipped README tree and the configurability strategy.
- `operational-advisory-registers`: decide whether the session-start reminder nudges survive before building cadence on
  their markers; this change keeps them as they are.
- No owner yet: a command that moves a `--plan` grooming session onto its grooming branch.
- An Errand held until the flip: rename this cohort to `instruction-discipline` with `arc rename`.

New prose says "work unit"; the visible rename to "design unit" (`naming-conventions`) sweeps after the cutover.

## Plain-resume rehearsal

The frozen baseline install and the branch kit from `ae765bbaf7` received the same scripted, committed `resume-pilot`
fixture. Its meta, spec, task list, and implementation bytes match between projects; only the commit hash in each
SESSION-NOTES differs. The current task is the open mid-phase leaf `2.2.b`; both repositories remained clean and the
implementation remained unchanged after their fresh Claude sessions.

Evidence is under `~/dev/arc-evidence/session-init-agenda/rehearsals/`: `apply-resume-fixture.py` and its meta input,
`resume-baseline.jsonl`, `resume-spine.jsonl`, their final orientations and metadata, the exact branch agenda, and
`resume-comparison.json`. The new kit lives at `~/dev/sandbox/2026-11-01T204644/agenda-spine`. Its install encountered
the recorded missing-link-target inventory issue; the same sandbox fill used for baseline supplied nine targets and
the retry committed with hooks enabled.

Both sessions emitted the clean header, identical notes/disk-drift surface, last-completed `2.2.a`, current `2.2.b`,
no blockers, the same next task, and “Awaiting direction — proceed to Next Action?” Both also surfaced the still-active
post-install Working Memory entry. The spine session loaded the reading method and read task-list lines 1–6, 16–19,
and 25–34: header, phase preamble, and current section, anchored at the emitted cursor. Its 11,315-byte spine is
inside the ~13 KB budget; with the reading method it is 18.9% of the frozen 73,573-byte workflow.

The empirical result establishes those orientation and read outcomes, not perfect instruction adherence. Both
sessions emitted progress prose despite the shared suppression instruction. The spine session first tried `npx arc`
in the globally installed sandbox, observed executable-resolution failure, then used the specified `arc` command;
it did not honor the spine's failure stop on that mistaken attempt. Its Working Memory warning also framed the
agenda's selection more strongly than baseline. These deviations remain in the complete transcripts. The amendment
entry-gate read is its first arm: the tasks still produce the stated resume exit outcome; no settled statement or
missing derivation needs changing. They are retained as empirical limitations, not erased by another run.

## Test pins

The implementation moved pins with the text they cover. `framework-sync`, `review-gate-workflows`, and `pr-lifecycle`
run at the commit gate (`ARC_CONTRACT_SUITES`), so their pins move in the same commit as the text they pin, and the two
copies of every Framework file stay equal on every commit. The integration-tier pins run in CI and move in the task that
changes their text. `lint:arc:section-refs` refuses `§` anywhere in `src` and `__tests__`, so a replacement test or a
`.describe()` string names behavior, not a section.

| Pin                                                  | What it pins                                    | Disposition                              |
| ---------------------------------------------------- | ----------------------------------------------- | ---------------------------------------- |
| `review-gate-workflows` `:671-685` (commit gate)     | Session Type override limits, two workflows     | session-init half retires at 3.2.b       |
| `locus-methodology-contracts` `:67-76`               | frame authority                                 | Task 1.5 compiler test, at 3.2.b         |
| `locus-methodology-contracts` `:151-154`             | cleanup surfaces                                | Task 2.6 compiler test, at 3.2.b         |
| `locus-methodology-contracts` `:77`                  | the Errand materialize argv                     | retires at 3.2.b; Task 4.5.a replaces it |
| `locus-methodology-contracts` `:82-83`               | groom and housekeep dispatch                    | retires at 3.2.b; Task 4.3 replaces it   |
| `locus-methodology-contracts` `:214-229`             | `--errand`, `--housekeep`, `--plan` entry text  | retires at 3.2.b; Task 4.2 replaces it   |
| `locus-methodology-contracts` `:230-251`             | `--errand --next` outcomes, in init and skill   | retires at 3.2.b; Task 4.2.a replaces it |
| `locus-methodology-contracts` `:252-270`             | materialize exactness                           | retires at 3.2.b; Task 4.5.a replaces it |
| `locus-methodology-contracts` `:159`                 | the `inboxState` routable-count note            | reads the served schema, Task 5.1.b      |
| `locus-methodology-contracts` `:155-161`, `:291`     | the removed file's absence                      | retire, Task 5.1.b                       |
| `session-init-reconcile-workflow`                    | the reconcile surfaces' wording                 | Task 2.4 compiler test, at 3.2.b         |
| `session-init-delivery-position-workflow`, init text | the delivery-position line                      | Task 2.4 compiler test, at 3.2.b         |
| `session-init-delivery-position-workflow`, `:59-67`  | `probe-envelope.md`'s copies and passivity text | retire, Task 5.1.b                       |

`review-gate-workflows`' override test reads both workflows and names session-init's `.template.md` path, which the
rename removes; its session-init half gives way to Task 2.3.b's override tests, and its `session-handoff` half stays.
The Phase 4 pins retire in Phase 3 because their rules compile only in Phase 4, and until then the verb refuses those
rows. These need no change, though a path search finds them: `session-authority-docs` reads only `session-handoff`;
`verify-integrity` and `change-facts` name the rendered path `session-init.md`, which the rename keeps; `validate-links`
names `session-init.template.md` only in a comment; `skills.test.ts` checks the skill through fake IO, never the shipped
`SKILL.md`; and `e2e/session-init.e2e.test.ts` prepares a repository, not the workflow file. `framework-sync`'s source
loader falls back to the plain path on its own. No test pins `session-recover.md` Step 3.

## Shipping a file

Adding, renaming, or removing a shipped file — the three methods, the spine's dropped `.template.md` suffix,
`assess-parallel-fit.md` and `in-flight-scope-check.md`, the two removals — updated one set of records in the same
commit, because `framework-sync.test.ts` pins them to the recipe at the commit gate:

- the `init-recipe.json` `include_files` entry;
- `CONFIGURABLE_FILES` (`lib/classification.ts`) for a method;
- `.arc/system/.internal/manifest.json`, the self-hosting manifest's membership and classification;
- `strategy-package-project-sync.md`'s Framework, Configurable, and installed-file counts, its Configurable list, and,
  for the spine, the `arc:if` template table, the template-counterpart list, and its count;
- for a method, a row in `strategy-session-operations.md` § Method Classification by Trigger, and a declaration in a
  workflow's or method's `arc.methods`, which `lint:arc:triggers` requires for every method in the directory.

Check each destination against `init-recipe.json` in both directions before relying on its ship status.

`integration/init.test.ts` holds two fixed lists of `system/methods/` files: "installs every registered per-file method"
checks the installed files, and "registers all per-file methods in the manifest" checks their Configurable
classification. Neither enumerates the directory, so a new method missing from them never fails the test; each method's
shipping task adds it to both, so a fresh `arc init` is shown to carry it. A shipped workflow such as
`in-flight-scope-check.md` belongs in neither; `framework-sync`'s recipe-membership check pins it. A shipped method also
carries `override-active: false` and `[No override configured]`, which the package-neutrality check requires.

## Carried context

- **The flip's field reader.** On a store whose state lives off the branch, the load set omits SESSION-NOTES
  (`resolveLoadSetManifest`), so until the flip rewrites the reader every resume there would get the "no handoff
  baseline" note. `parseMetaRecord` already reads `commitAtHandoff` and `sessionType` from the meta, which is where the
  flip moves them (§ 4.9); rewriting the compiler's reader is the cutover's job, like the rest of § 7.
- **`--start` from a work-unit checkout.** `inFlightComposition` is composed only with no active work unit and a
  resolved roster, so `--start` from a work-unit checkout carries no `concurrent-workload` note, and
  `assess-start-readiness`'s Tier 2 has no composition to read there. Today's focused-recon arm reads the same slot and
  has the same gap.
- **A store pull's no-op.** `describeStorePull` folds notices into the summary even on `noop`, so a no-op is defined by
  status and an empty notice set, and `no-remote` counts as one: nothing was pulled and nothing failed.
- **Freshness compared with today.** Today's check compares the meta's last commit with HEAD; the compiler reports
  whether the meta changed since the handoff (§ 6.3). The handoff writes the hash abbreviated
  (`session-handoff.template.md`), so the compiler resolves it before comparing.

## A1 — Literal elicitation

The settled § 3.2 text said: “runs its `recompile` argv with `--<signal> <answer>` appended; that argv omits the
signal.” Section 4.5 likewise allowed only “an `elicit` choice's appended answer.” These statements are superseded by
insertion before any `--` delimiter, with `--flag=value` binding for a leading-dash answer.

At detection, `buildAgendaArgv` preserved a leading-dash seed after `--`; its private `appendValue` already bound
leading-dash option values with `=`. The detecting `parseNonRepeatedOptions` regression reconstructs the registered
non-repeatable option grammar from `cli.ts` and passes the carried argv plus the elicited concern to Commander.
Appending that option after the delimiter fails with too many positional arguments. Focused run
`34a236680f494c2d9a1579b87548f700` completed with 15 passing cases and this one failure. Commander's
`Command.parseOptions` consumes every remaining argument as literal operands once it sees `--`, corroborating the
observed failure. Inserting the signal before that delimiter preserves both operands and option interpretation.

The bounded propagation covered § 3.2, § 4.5, § 9.1, appended criterion 15, corrective parent 1.R, Tasks 1.3.c and
3.2.a, and the completed schema's description via its additive amendment pointer. Shape, cardinalities,
question keys, recorded decisions, and the baseline measurements are unaffected. No delivery plan is bound.

Author review covers reader independence, binding completeness, coherence, and source grounding over this footprint;
the revision tasks target the existing schema and pending shared builder and close on the detecting regression.
Independent amendment review is omitted at the determinate correction depth. The approved scope changes no field or
command shape and requires no new planning segment.

Closure: reconstruction run `6f82cb4928534ea1ae66c098eecc53cf` retained 15 passing cases and three delimiter failures.
After `appendAgendaOption` inserted before `--`, run `9d9e68fc918245bc9eda7083a927bef5` passed all 78 agenda unit
cases, including those three, and focused TypeScript lint passed. The served `elicit.recompile` description carries
the same insertion and leading-dash binding rule. Task 3.2.a subsequently carried that rule into the spine.

## A2 — Literal recovery branch operands

Superseded § 5.3 statement:

> A **free** destination, checked out in no worktree, becomes the actions `git fetch origin <branch>` (only when the
> branch has no local ref) and `git switch <branch>`, with a recompile `then`.

`parseLiveMembership` retains the short name from each live `refs/heads/` record, and
`analyzeRecentRemoteBranchesSnapshot` and `runBranchGoneRecovery` pass eligible recent branch names through to
`resolveCascade`. Thus option-looking names and the literal `-` reach recovery composition through production data.
Native Git accepts `git fetch origin -- --dry-run` and `git switch -- --dry-run` for that literal branch. However,
`git switch -- -` selects the previous checkout even when `refs/heads/-` exists. The retained native trace in
`~/dev/arc-evidence/session-init-agenda/rehearsals/git-recovery-operand-evidence.json` records Git 2.55.0 selecting
`previous` rather than the requested literal branch. `git-switch` documents that alias independently.

The correction delimits every composed branch operand and holds only the literal alias for manual recovery. It
adds no branch-name validator, schema field, or change to other candidates. The propagation sweep covers § 5.3,
criteria 5, 7, and 14, Task 4.1, and the 4.7 fixture/rehearsal verifier: existing general criteria remain
applicable, 4.1 points forward to 4.R, and 4.7 closes the amended contract. Other rows and published actions are
unaffected.

The A2 author check covers the written delta, surrounding recovery rules, revision task, and producer paths named
above. Reader independence and binding completeness hold: the body defines the exception and observable behavior;
no obligation lives only in this note. Grounding-only task audit resolves all named symbols and test seams. The
post-settle coherence read retains the common held path and per-candidate dispositions with this explicit exception.
Independent review is omitted at the amendment's determinate correction depth.

## A3 — Backend capture selectors

Superseded § 5.4 statements:

> a seed naming a flagged `§ Errand` capture passes it as `fromInbox`
>
> a `signal` choice per `§ Errand` capture flagged `_Remind:_` or `_Hold:_` (`extractReminderEntries`)

`extractReminderEntries` returns title keys. `prepareHandlerErrandAdoption` selects the backend and calls
`resolveInboxEntryOperand`, which accepts legacy titles before the flip but requires `personal:<id>` or
`project:<id>` afterward. `compileErrandSignal` previously forwarded the title in either mode, making a post-flip
picker selection reach an operand refusal. The read-only resolver probe retained in the personal workspace as
`errand-capture-selector-evidence.json` demonstrates title acceptance before the flip, title refusal afterward, and
qualified-ID acceptance. `parseEntryList` exposes each store capture's ID without a title join, preserving distinct
captures with duplicate titles. `prepareErrandAdoption` resolves that exact list and ID and retains missing/moved,
conflict, and open-holder refusals; its returned writes are plans and are not applied by compilation.

The amended body defines the backend rule completely. Explicit qualified seeds remain references even if removed
since selection; other text is a new concern after the flip. No title-to-ID fallback or new lifecycle authority is
introduced. Reader independence and binding completeness require no information unique to this note.

The propagation sweep covers § 5.4's rows and compile-time resolution paragraph, criterion 5, appended criterion 17,
completed Task 4.2.a, revision 4.R2, Task 4.2.d's workflow handoff, and the 4.7 fixture/rehearsal verifier.
The rows and paragraph fold into A3, 4.2.a takes an additive pointer, and 4.R2 carries the correction. Existing
criteria 5, 7, and 14 and the 4.2.d argument shape are unaffected and remain applicable. Queue-head selection already
carries qualified keys through `resolveQueueExecutionOffer` and is unaffected. The schema, prefix, Plan and other
signal rows, and earlier baseline evidence are unaffected; no new planning segment or Class ratchet is needed.

Author review covers the specification delta, surrounding § 5.4 obligations and selector definition, and revision
4.R2 with its immediate neighbors. Grounding-only task audit traces the producers and adoption consumer named above;
reader independence, binding completeness, and coherence hold over this footprint. Independent amendment review is
omitted at the determinate correction depth. The final post-settle read retains flagged-personal picker scope,
qualified explicit references, unchanged owning refusal authority, and criterion coverage without an open decision.

## Grooming resume entry

Explicit `--plan` admission and a selected grooming resume carry distinct arguments. `compilePlanSignal` supplies
`stub` and the exact computed `onGroomingBranch`; `compileTransientResume` carries the existing grooming set's subject
kind, key, and marker generation, not a new backlog target. `validateGroom` requires the full-protection record's
branch to derive from its anchor, and `projectDerivedCheckoutRow` corroborates that expected topology through
`corroborateCheckoutRole`. `projectIdentityAuthority` refuses a marker-selected ordinary transient without its exact
identity; there is no marker-only groom admission. Partial grooming legitimately permits the base. The legacy
`classifyPlanningEntry` admits a full-protection fresh request only on a Planning-meta branch, so reapplying that
fresh-entry check to an established groom would redirect a valid resume.

Task 4.2.d scopes its changed skip to explicit `--plan` arguments. Task 4.3 adds the owning workflow's separate resume
entry while preserving the subject kind and key, marker generation, and selected checkout. A grooming-set key is not
silently reinterpreted as a stub. Bounded advisor consultation `/root/advisor` supported this interpretation; source
validation and checkout corroboration above establish its required premise. The scalar fragment-argument contract
carries `subjectKind`, `subjectKey`, and `generation`; orientation retains its subject object. No agenda schema change
is needed.

## Start lifecycle selection

`resolveLifecycleSubject` shares backend acquisition and subject selection with `handleLifecycleStatus`; the
presentation and Start admission policies remain separate. Status retains its explicit passive-live legacy fetch and
optional Store refresh, outside selection. Agenda selects locally. The shared Store result preserves the inventory,
standing holders, named record and exact refusals, including the handler's existing primary-conflict refusal.

A successful Store view can still carry an unreadable inventory; Start reports its condition and remedy before
considering state. Target diagnostics and withheld projections similarly precede state. Unrelated malformed records
remain warnings for status and do not deny a healthy planned target. Legacy selection retains its composed quality
facts, and Start applies the existing minting predicate before admitting provisional or planned state. The bounded
advisor consultation supported this factoring over reusing human status output or creating another lifecycle model.

An unresolved Start retains its invocation intent in the agenda but compiles continuation commands as if that signal
were absent, preventing a recompile loop. Its diagnostic also withholds automatic proceed on an otherwise clean
`--next` resume.

## Remaining-arm rehearsals

The branch kit `2026-11-02T105957` packed the qualified working tree subsequently committed as `face641aa4`.
Its first install commit found 19 broken links; the same documented sandbox fill used for baseline supplied seven
missing targets, and the retry committed with hooks enabled and pushed to its local bare origin. Twelve fresh Claude
sessions compared six matched fixtures against the frozen baseline install: Plan, queued Errand, flagged-capture
Errand, branch-gone, remote-only Orient, and Context. Every run exited successfully, retained its original HEAD, and
left the tracked tree clean. `~/dev/arc-evidence/session-init-agenda/rehearsals/arms/` holds fixture producers, probes,
agendas, complete transcripts, final responses, metadata, and `comparison.json`.

Plan reaches the same missing-framing question after the planning-entry check. Queued Errand selects the same exact
capture and requests missing target details before overlap or open. Branch-gone holds at recovery direction because
`main` is occupied by the primary; the compiled menu names that checkout. Both Orient runs discover `remote-pilot`;
the compiled menu supplies the specified spawned and in-place routes. The baseline bare Errand picker also exposed
the unflagged queue head, while the compiled picker contains only the flagged capture, elicitation, and decline.
The baseline ignored the undefined `--context` signal and resumed its work unit; the compiled Context row reads no
work-unit artifacts and emits only checkout surfaces, as specified in § 5.4.

These outcomes do not establish perfect model adherence: the Plan and queued-Errand spine runs emitted two read-group
progress lines, and remote Orient emitted one. The queued-Errand final response put its queue announcement above the
header. The complete transcripts retain these deviations. The amendment entry gate returns design holds: the stated
row outcomes remain produced; the specified Context and picker changes and these presentation limits are explicit.

The fixture batch also passes the full agenda unit set and native Start, cold-start, and passive-inspection cases.
The native proof snapshots each Orient, queued Errand, Plan, and Start invocation against the same real inbox, errand,
lifecycle, stub, and worktree fixture, including both temporary-ref families. The operand matrix retains delimited
branch names and the held literal alias, while real-store capture/adoption fixtures retain qualified keys and their
refusal boundaries. These checks close A2 and A3 at Task 4.7.

## Shipped-surface verification

The §§ 10–12 census covers both current package and instance copies, recipe/manifest membership, and TypeScript source.
The current-surface search finds no removed contributor workflow, probe-reference file, old numbered init step, or
Conditional Sync Pulls reference. Broader searches retain matches in historical ADR and supplemental analysis records;
those are not current shipped instructions. The five named source modules carry no retired-step citations, and the
`constitution/types` import is a live command module rather than a stale rules-directory reference.

The pre-reconciliation full integration run includes all 12 framework-sync cases and passes 4,997 tests across 510 files,
with 755 tests and one file skipped. Full link validation passes. The segment request passes, including both type checks,
TypeScript lint, the full unit suite, Markdown checks, and package sync. Evidence is retained under
`~/dev/arc-evidence/session-init-agenda/result/shipped-surface/`.

The initial integration run `a668f1e4a5304c5f9a6188c8ef11e9b2` had one 15-second timeout in the unchanged
`one-shot-script-entrypoints.test.ts` failure-output case; the other 4,996 tests passed. Runner diagnostics were inspected
before attribution. The unchanged focused file passed all five cases, and the approved unchanged full-suite retry
`804f3c438e19478db2df3794f71a6619` passed. Those passes established intermittence while the cause was unidentified.
The original failure, focused pass, full retry log, and runner histories remain retained; no timeout or source change
was made between those runs.

The PM follow-up identified upstream #1235, merge `ee7da5f6c80814540a69571a4c6b16dec342bab8`, as the existing fix.
Inspection confirms that the failure-output subprocess gains the shared 30-second `CALL_LIMIT`, and its case budget
becomes twice that limit instead of 15 seconds. This branch predated the fix; its 13,950 ms full retry fits the reported
failure mode. Reconciliation with main `255b75b43257fd1a61001ea76fad9a9bb6d988db` brings that fix into the branch.
Any recurrence after this merge is new evidence rather than a continuation of the pre-fix timeout.
Whole-suite E2E and hosted CI remain outside this execution boundary and have not run.

## Work-unit verification

The initial independent subject was private snapshot `da8bedd089bc14b8917eb7879f40c117ddf90f69`, following the main
merge at `68fd8dee6c172e9fae5a11a1726e5f60a3930dc7`. The repaired-source author report below pins snapshot
`85afb3e6ba7fac7a1804d42ced6cc26fa8622d65`, whose implementation is the pushed head
`fb60176f0c7aade524b8cdcc854711250bbc9ca0`. Later evidence-only edits preserve every criterion digest. This report
covers the author walk before Candidate attestation.

The repaired-source author walk resolves all 19 criteria, with hosted qualification at the exact pushed repair head. The
earlier measurement and rehearsal limitations remain part of the evidence rather than claims of perfect executor
adherence.

### Criteria report

```yaml
criteria-slice: Success Criteria
span:
  diff:
    kind: change-set
    baseRef: main
    diffBaseSha: 50245297742df93f945ba2f1f92cd6d928c93102
    headSha: 85afb3e6ba7fac7a1804d42ced6cc26fa8622d65
  reachability: 9190225ff560dd7a9f905a0366893080cf8ec6c9
  boundary-order-deviation: null
criteria:
  - locus: Success Criteria > 1
    criterion-digest: sha256:f6354dd5d93eb3cda272e549b9fa332e542784579063a3ce7aa029a9f24dc59e
    evidence: >-
      Baseline metadata and raw controlled/itemized evidence; eaf54487d4 packages tree equals base 279aa8ebf9 before
      shipped edits. Matched kit link-fill accommodation disclosed.
    state: "[x]"
  - locus: Success Criteria > 2
    criterion-digest: sha256:bdb244916f54f6fa3367069286f5b36f9ee44f888459c33da9b7ea43ec6b9c79
    evidence: >-
      Raw itemized summaries: resume 17.25%, Orient 20.14%, Start 20.96%; controlled context reports approximately
      18.15%, 21.78%, 22.44%. All below 28%.
    state: "[x]"
  - locus: Success Criteria > 3
    criterion-digest: sha256:e1d53691cdfc7571ed48df2957e071dcd5e5092e0d90ea15c9a149c8c42302fc
    evidence: >-
      Raw itemized 24708/51801=47.70%; controlled context net 33400/61000 approximately 54.75%. Matched
      first-response inclusion, rounding, and kit link fills disclosed.
    state: "[x]"
  - locus: Success Criteria > 4
    criterion-digest: sha256:6dc851b623e2c2a9d54c0624d40e04d036f7d687edd2a3d95064da305f6df813
    evidence: >-
      Native CLI refuses each reproduced malformed answer key with invalid-input and --answered; unit cases retain
      bare Plan, encoded values and final-equals splitting. The schema and passivity evidence still applies.
    state: "[x]"
  - locus: Success Criteria > 5
    criterion-digest: sha256:040dbaec8d060a14632713888e9b410de4d15e95faf1889acd05a3ac3c0a5c29
    evidence: >-
      The complete row fixture suite passes, including husk unused-next guidance with its stop gate retained. The
      bounded independent fix check supports closure of F2.
    state: "[x]"
  - locus: Success Criteria > 6
    criterion-digest: sha256:9de61fcd1952bcb7dea59d7e0c5320e2b22570119bac0d4738b66ded952ec5c0
    evidence: >-
      All nine affected entry/resume kinds retain both universal failure diagnostics and each domain-rule warning
      once; ordinary resume output is preserved. The bounded independent fix check supports closure of F1.
    state: "[x]"
  - locus: Success Criteria > 7
    criterion-digest: sha256:ee41cd0aab3d35ccb5be5bc5574ac6b1c8532224cc713ef81772bb94479325bf
    evidence: >-
      Cleanup/recovery source and fixture tests preserve blocked/manual/owner-held boundaries, offers, exact
      published argv and native operand proof.
    state: "[x]"
  - locus: Success Criteria > 8
    criterion-digest: sha256:e12bcfd62c7fa9e34a4cdbd908f4ec733ef0a40ed1ac865b792d0fdfad8f98c4
    evidence: >-
      prefix, notes, sync-state, sync-steps, progress and cardinality tests plus source trace cover terminal execs,
      combined offers, reference order and carried answers/done/methods.
    state: "[x]"
  - locus: Success Criteria > 9
    criterion-digest: sha256:b180802363b407ad93e2b51806930cc3c3130a53f468d8dc3155d5a92a516daa
    evidence: >-
      Packaged plain spine is 11527 bytes; step vocabulary and four orientation shapes drive it; recipe installs
      plain session-init.md.
    state: "[x]"
  - locus: Success Criteria > 10
    criterion-digest: sha256:69e2dff6daefbffcb2fd722589c4c16f2a2a1798977af8a0d592fbf7d06fceba
    evidence: >-
      Recipe/classifier/manifest and init integration tests install declared reading/readiness/discovery methods
      plus assess-parallel-fit and in-flight-scope-check; recovery retains both anchor stops.
    state: "[x]"
  - locus: Success Criteria > 11
    criterion-digest: sha256:566e8ccb3746374fe4b29a245e2fdd122e800de08e632aac787adff6a25cc6c5
    evidence: >-
      Removed files absent in source/instance/recipe; current shipped content has no obsolete references;
      inbox-state field descriptions preserve routable-count guidance.
    state: "[x]"
  - locus: Success Criteria > 12
    criterion-digest: sha256:bf979ec8baa923631b5c4602dacb9ed69ff85c5ae736189be7a4004570f8b12b
    evidence: >-
      Complete cheap-tier and two-copy diffs plus recipe inspection match specified surfaces and install
      dispositions; repository-filled template differences preserved.
    state: "[x]"
  - locus: Success Criteria > 13
    criterion-digest: sha256:803787c30081582cd0d8cafd7587c405bd12fa0c90375c5bcdf7c8d424791b75
    evidence: >-
      Complete propagation census, current-source search, contract tests and historical full integration evidence
      support reader retargeting; fresh gate results remain separately reported.
    state: "[x]"
  - locus: Success Criteria > 14
    criterion-digest: sha256:59e14fccc6dc1d80fca661d73191593df7115200a84f60570285abbf99f1b69a
    evidence: >-
      Matched kit resume and twelve remaining-arm transcripts reach recorded entry/orientation outcomes; retained
      progress/failure-stop deviations limit adherence claims.
    state: "[x]"
  - locus: Success Criteria > 15
    criterion-digest: sha256:78029ed86b1ea09eba6d955c148fe1ca452f99cb3e0e7b7e0204e2c8865b65ac
    evidence: >-
      argv tests, schema description and spine agree on insertion before delimiter and leading-dash equals binding;
      direct Commander execution preserves both literals.
    state: "[x]"
  - locus: Success Criteria > 16
    criterion-digest: sha256:5593b9f1ac7e795d091c38cf2074ed0f1542f562232da3a19ee68e48905a962c
    evidence: >-
      Forced local merge gate at fb60176f0c passes 19 checks, including six store shards for 320 reached suites.
      Hosted CI run 41535656407 succeeds at exactly that pushed head without diagnostic inputs: build, both Node
      unit matrices, lint/type checks, integration, E2E, full store, and Linux concurrency portability.
    state: "[x]"
  - locus: Success Criteria > 17
    criterion-digest: sha256:6e3400fca90dcb0c0f525a97a0a95374806d40ee0e68fea7e2323786a1b6f82f
    evidence: >-
      Implementation verification is complete and ready for Candidate preparation under verify-work-unit. Private
      review, convergence, publication, and integration authorization remain their own boundaries. No live
      deployment or merge safety is claimed.
    state: "[x]"
  - locus: Success Criteria > 18
    criterion-digest: sha256:c9903eb527a39b620db9f35c19308459164bf7aabd981d2f6736c01ae1c7aa43
    evidence: >-
      Delimited recovery actions and literal alias held/manual choices match recovery source, native operand matrix
      and A2 evidence.
    state: "[x]"
  - locus: Success Criteria > 19
    criterion-digest: sha256:940c05dd07cc9f43660f0fccd70c3edb4dd95ced200865b099d59d5d48e36238
    evidence: >-
      Backend capture fixtures and actual adoption planner preserve pre-flip titles, post-flip IDs and existing
      refusal/recovery behavior, matching A3.
    state: "[x]"
summary:
  met: 19
  superseded: 0
  unresolved: 0
```

### Attention and independent review

The resolver returned `consider-chunks` for 15,669 changed lines across 191 files, then `scope-selected` for the exact
snapshot target `sha256:ee06e681018e6af7704f71afe891d2d8927782243b34d3204b5440c3ff2a9f72`. Five bounded scopes
cover contract/adapters (49 files, 3,056 lines), context/synchronization (25, 2,171), routes (47, 3,614), shipped
methodology/install contracts (65, 4,168), and planning/evidence (5, 2,660). Each changed file occurs once; changed
cross-scope declarations are explicitly external to their consumers. The dedicated seam/aggregate call inspected
schema-to-spine execution, answer carrying, workflow arguments, install wiring, and measurement/source binding.

**Pass 1 of 2:** one major, two minor findings. Primary source checks and read-only executable reproductions support
all three. The design already requires their outcomes; the amendment entry gate returns the task arm, whose review
finding path writes no amendment record. Complete-set approval authorized these local corrections, focused verification,
commit, and push:

- **F1 — major:** preserve domain-rule warnings and configuration/domain-rule failure renders in the shared checkout
  orientation helper and its signal, Start, and transient consumers. Update the tests that currently pin silence.
- **F2 — minor:** declare the contextless husk's consumed signals explicitly, retaining its stop while reporting unused
  `--next`. The caller sweep found no additional incorrect default consumer.
- **F3 — minor:** refuse malformed individual answered keys while retaining bare Plan's generated `plan-stub:`, literal
  encoded operands, and splitting at the final equals sign. Completed-ID validation is already separate.

The approved corrections are implemented. Red run `d003fd47277848a18b8fa9f1585dbf44` produced 40 behavioral failures
across the five selected regression files; green run `568990bc0d114b8794e89cd6d5520af0` passes all 474 agenda cases.
Focused TypeScript lint passes. The valid-key controls preserve bare Plan, encoded selectors, and final-equals
splitting.

The approved fixes are committed as `52f60b8eb2`, `c9f6c3873b`, and `fb60176f0c` and pushed. The approved independent
fix check, round 1 since pass 1, reports no findings over `68fd8dee6c..fb60176f0c`; primary source checks support its
closure of F1–F3. Fix checking has converged. The complete pass found one major and two minors; this bounded check is
not a second complete pass, and no successor complete pass is authorized. Exact prompts and reports remain
content-addressed in the personal workspace's `adversarial-review/` directory:

- contract prompt: `1e580ee7df0949288bf2b69f52f07294c4b8603d7b265ff15746330df935cd67.md`
  Report: `f932b88c16c37cbea6140c319855010187eb2d658ccc370d8e54f585d9689b1e.md`
- context prompt: `900115cc9907e7447cbcac648437690b9ec890f1834765d5eec1b1d689c7901c.md`
  Report: `13f58817c9bb6159d2c33361146f141b020a4258ce609831afabed5511a7b860.md`
- routes prompt: `b630867eb76479fcc8f9edbc72e916a368973e6c5c175f526b6d847acf28739a.md`
  Report: `b2907c403914d243c6778d6bc6b70f0f04f9461c7d891a038fe9e0f46052df2d.md`
- methodology prompt: `b4bbe2e0162a31a6edd6967f272b396d00b1424bc8e0fe3cf4a2e33d1ba68b4d.md`
  Report: `0bacecae90588440699a3042cbe58b2365c45b8474cee0696b81ddbae7d21c26.md`
- evidence prompt: `8f0491341c43b8fa6b6bc59c3630cf9f339c9eb890d90db8c2718c7b586aa4a7.md`
  Report: `60ec932a692efb08755569b51258ead444f46b466b6e969509ee71fd568c7442.md`
- aggregate prompt: `dbf30657f776395ad1a654d0bf1f8cdbadf8b21a38bc67ebc6f43c86469d93dc.md`
  Report: `3b8f232120e3ff263e8db9f3109eef7b388cd2a28046147d4f63a8b27e44ec94.md`

The repaired-source resolver returned `scope-selected` for 15,954 lines across 192 files at target
`sha256:ca642e8f04d58bfaa8b5a38f3d74e1a2a7e577e046aee5f0931e8e01c51732b9`. The unchanged contract boundaries now
include the diagnostic regression file in context: contract/adapters (49 files, 3,070 lines), context/sync (26, 2,237),
routes (47, 3,624), methodology/install (65, 4,168), and planning/evidence (5, 2,855). The original complete pass and
seam evidence cover unchanged material; the independent fix check closes the bounded repair span.

- Fix-check prompt: `ffbc78529c3ee5f20e32d40b8dc0923431f7486aa6ad1d7cb4eeb4b22c50dbd9.md`
  Report: `8e99eaab132a8807e02986cfc6c4ee065c3766465bc4586b924845de45add195.md`

### Current checks

The post-merge `new-head` request initially encountered a sandbox write refusal before its routed checks executed.
The explicit retry passed both type checks, TypeScript lint, the full unit request, and ARC contract tests. The merge
gate passed its build and other local checks; a long line introduced during notes cleanup failed Markdown lint and
was corrected. Its routed checks initially failed source snapshot acquisition before execution. Their one explicit
retry with stable source passed all seven requests, including all six store shards covering 320 reached suites.
The repaired source passes a fresh forced merge gate: 19 requests pass, including all six store shards for 320 reached
suites; four CI-only requests defer to hosted CI. Repair increment checks and all commit/push hooks pass. Native CLI
probes refuse all four reported malformed answer forms. Hosted CI run `41535656407` passed at pushed head
`fb60176f0c7aade524b8cdcc854711250bbc9ca0` without diagnostic inputs. It qualifies build, both Node unit matrices,
lint/type checks, all integration and E2E shards, all six full-store shards, and Linux concurrency portability. The
optional Windows/macOS pair and Git-floor jobs were not requested. No deployment or merge authorization is claimed.

## A4 — Store Start evidence

Standard finding `R-1` exposed a backend boundary: `resolveAgendaStartTarget` kept diagnostic paths after reading
authoritative metadata, and `compileStartSignal` sent those paths through filesystem-only reads. The agreed design
uses existing scalar fragment arguments for the acquired records; it adds no generic read or resolver vocabulary.

`readAgendaStartRecords` reads the task-list singleton with the selected metadata's exact owner/UID. A missing task
record is explicit absence; another refusal or a returned conflict withholds Start readiness. `resolveAgendaStartTarget`
keeps diagnostic coordinates and these acquired records. `compileStartSignal` omits target file reads in store mode,
and `compileStartRecordArguments` supplies exact contents, references and versions to `assess-start-readiness`.
The method consumes that evidence while retaining dependency queries, baseline checks, judgment and launch interlocks.
Legacy Start still uses completed reads of its actual metadata and task-list files.

The amendment's depth is medium: a bounded record-to-method contract with an explicit absence/refusal policy. Its
scope covers the Start row and method arguments, method source/instance/pristine hash, backend and legacy regressions,
and the appended criterion. Reader independence and binding completeness retain all evidence and launch boundaries.
The approved independent fix check includes this written footprint and its surrounding contract.

## A5 — Repaired-kit acceptance

Standard finding `E1` identified an acceptance mismatch, separately from the measured reduction. The original
measurement criterion requires an install committed and pushed "as a new project gets it"; the recorded experiments
needed the kit's documented `fill-link-targets.sh` accommodation. Disclosure alone had not changed that requirement.

The accepted replacement criterion permits the recorded matched repair: ten copied package targets at baseline and
seven at result. It preserves packed installation, hooks-enabled commit/push, both instruments, baseline timing and
the percentage bounds. Its depth is low: an explicit fixture acceptance decision with no installer change. Original
criteria, Goals, task outcomes, inventories and raw evidence remain preserved.

This qualification governs the Baseline install, Result install and comparison, Plain-resume rehearsal, Remaining-arm
rehearsals, Task 5.4 outcome and all kit-based completion claims in the earlier verification record. They establish
the disclosed repaired installations and empirical adherence limits; unmodified fresh-install qualification remains
unestablished. No installer success is inferred from the relative token reductions.

## Standard review repairs

The complete standard pass at `480122a5a2f46b0dd7bc628d99468f5fae8b6575` covered all 194 changed paths through five
contract-closed scopes, a dedicated seam and a fresh aggregate. Its result is findings: `R-1` major, `context-F1`
minor and `E1` minor. Source verification retained all three, and disposition set
`sha256:8c273c4abd88f160ea9746f70bd1d8be73c8adfcb0474fd99ed60178ee4cb6c4` approves their fixes with full verification.
The independent repair check is separately authorized. No successor complete pass or integration authority is implied.

Canonical review evidence is retained under `~/dev/arc-evidence/session-init-agenda/standard-review/`, operation
`local-1e42c457623abd9f5d644bae80adcc8f42774f6567dcd85f812bb85b1b1c5b0d`. Its aggregate report is
`c36fbb50c8d7b726dc63000ba09c71e4248a67905d91d58599b64332b8325788.md`. The evidence leaf's exposure to prior-review
prose inside the assigned notes is disclosed; that prose supplied no proof, and the seam and aggregate independently
corroborated the material source/evidence joins.

`renderSuperseded` now retains the explanation in the precompiled orientation reached by a bare reset decline.
The reset remains offered only; accepting its action recompiles before that tail. Resume and Orient regressions cover
the direct continuation, alongside the previously tested answered-input path.

Fail-first run `f68402405f6f4633a074a8bdfef341c6` has ten behavioral failures and seven passing controls. Earlier red
attempts exposed an invalid test fixture's companion placement and are not behavioral proof. The corrected fixtures
use the store's real primary/companion creation rules. Run `5945c90e587a4557aad70c146c8f09ac` removes only legacy target
reads and produces one behavioral failure; restoring the exact implementation passes the full agenda scope:
482 tests in 39 files, run `0bf338bf05764731ba8f0baefc7f5219`.

After the same-concern complexity refactor and refusal-fixture type correction, the increment passes ten checks with
two reused results. Native Start, resume and passivity coverage passes four cases in three files, run
`536dd3f5168e437aad708ef688f361e9`. The forced merge gate passes all 19 local requests, including all six store shards
for 320 reached suites. The local gate excludes four CI-only requests; hosted evidence is separate.

The authorized headless remeasurement uses the unchanged instrument and `claude-opus-5-5`. Empty input is 6,564 tokens;
the net Part 1 results are resume 4,706, Orient 5,495 and Start 5,863 against baseline 27,283, or 17.25%, 20.14% and
21.49%. The raw inputs, usage and comparison are retained under
`~/dev/arc-evidence/session-init-agenda/standard-fix-1/`. The matched real-context Start report is 47.8k, less the
matched empty report's 40.8k: approximately 7.0k against the baseline's 30.3k, or 23.10%, below 28%. Raw transcripts
confirm exactly the three requested full-file Reads and one final `OK` after their results. The kit remains clean.

The final context pair uses the baseline's original harness flags and suppression instruction, retaining included
first response and rounded-report limits. Restricted Read-only controls are retained separately: conditional tool
loading changes their cost, so they do not define the final comparison. The new kit again used seven copied package
targets after 19 initial broken links, with hooks-enabled commit and local push passing under the A5 qualification.
