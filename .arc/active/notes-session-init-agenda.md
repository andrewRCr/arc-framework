# Notes: Session-Init Agenda

## Contents

- Today's workflow, step by step
- Surface census
- Sizing and measurement
- The always-loaded cut audit
- Who the expected contracts are
- Neighbouring work
- Inbound items
- Strategy fit
- Coordination pointers
- Plain-resume rehearsal
- Test pins
- Shipping a file
- Carried context

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
result-side measurement must use the same rule. The harness reports rounded token estimates, so the net values below
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

Where each pin runs decides when it must move. `framework-sync`, `review-gate-workflows`, and `pr-lifecycle` run at the
commit gate (`ARC_CONTRACT_SUITES`), so their pins move in the same commit as the text they pin, and the two copies of
every Framework file stay equal on every commit. The integration-tier pins run in CI and move in the task that changes
their text. `lint:arc:section-refs` refuses `§` anywhere in `src` and `__tests__`, so a replacement test or a
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
`assess-parallel-fit.md` and `in-flight-scope-check.md`, the two removals — touches one set of records in the same
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

The pending `buildAgendaArgv` preserves a leading-dash seed after `--`; its private `appendValue` already binds
leading-dash option values with `=`. The detecting `parseNonRepeatedOptions` regression reconstructs the registered
non-repeatable option grammar from `cli.ts` and passes the carried argv plus the elicited concern to Commander.
Appending that option after the delimiter fails with too many positional arguments. Focused run
`34a236680f494c2d9a1579b87548f700` completed with 15 passing cases and this one failure. Commander's
`Command.parseOptions` consumes every remaining argument as literal operands once it sees `--`, corroborating the
observed failure. Inserting the signal before that delimiter preserves both operands and option interpretation.

The bounded propagation covers § 3.2, § 4.5, § 9.1, appended criterion 15, corrective parent 1.R, open Task 1.3.c,
future Task 3.2.a, and the completed schema's description via its additive amendment pointer. Shape, cardinalities,
question keys, recorded decisions, and the baseline measurements are unaffected. No delivery plan is bound.

Author review covers reader independence, binding completeness, coherence, and source grounding over this footprint;
the revision tasks target the existing schema and pending shared builder and close on the detecting regression.
Independent amendment review is omitted at the determinate correction depth. The approved scope changes no field or
command shape and requires no new planning segment.

Closure: reconstruction run `6f82cb4928534ea1ae66c098eecc53cf` retained 15 passing cases and three delimiter failures.
After `appendAgendaOption` inserted before `--`, run `9d9e68fc918245bc9eda7083a927bef5` passed all 78 agenda unit
cases, including those three, and focused TypeScript lint passed. The served `elicit.recompile` description carries
the same insertion and leading-dash binding rule. Criterion 15's spine obligation remains with Task 3.2.a.

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
criteria 5, 7, and 14, Task 4.1, and the upcoming 4.7 fixture/rehearsal verifier: existing general criteria remain
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
completed Task 4.2.a, revision 4.R2, Task 4.2.d's workflow handoff, and the upcoming 4.7 fixture/rehearsal verifier.
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
