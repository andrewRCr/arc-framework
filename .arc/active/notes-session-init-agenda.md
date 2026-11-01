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
- **Instruments.** Itemized runs use `claude -p --output-format json`; confirm the input-token usage field at first
  use. The rehearsal kit is `cinexplorer-migration/kit/`.
- **Assumptions.** Arm usage skews toward a plain resume; no session-arm telemetry exists. The fresh envelope's ~12 KB
  is a brief's figure, not re-measured on a fresh install, and the agenda output's size is unmeasured until built.
- **Build estimate:** about a week; the forecast change set of 7–8k lines suggests that is tight.

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
