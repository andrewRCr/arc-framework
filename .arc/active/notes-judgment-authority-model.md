# Notes: judgment-authority-model

> _Internal working record for this work unit. The design lives in `draft-judgment-authority-model.md`; this
> file holds the evidence too large to carry there._

---

## Line-level compression enumeration (2026-07-26)

Closes the draft's open scoping unknown: the measured ~315-line compression surface, itemized section by
section so the register stays a bounded list rather than a percentage anyone can widen.

**Method.** Section-level mechanical measurement first (per-heading raw and nonblank line counts, computed from
the heading structure rather than estimated), then a per-section disposition under the four tests the draft
settled: the audience test, the summoning test, the loud-versus-quiet cut test, and constraints-only placement.

**Units.** `nb` is nonblank lines within the section — what a disposition actually moves. The earlier ~315 figure
counted raw lines and the two are **not** comparable: `DEV-RULES.ARC` is 570 raw / 418 nb and `DEV-RULES.PROJECT`
is 341 raw / 261 nb, so the 318 nb register is ~45% and ~50% of each file's substantive content rather than
"about a third," with a correspondingly larger raw footprint.

**Measured against base as of the 2026-07-26 reconcile.** A sibling errand edited § Method and extension loading
(`0a7a7931b`), so every line range past 446 shifted by one and that row's own content changed; the table below is
current for the post-merge file. Two consequences beyond bookkeeping:

- That errand **independently applied this work unit's placement doctrine** to this file — its rationale reads
  "rationale and the fire-point marking guidance land in the authoring strategy instead of the always-loaded
  rules, which end up shorter than before." Constraint stays, rationale moves, same justification, arrived at
  without reference to this design. Fan-in evidence, and it pre-consumes a small part of the surface.
- **A register measured against exact line ranges decays whenever base moves.** Re-measuring is mechanical and
  cheap, but the spec should carry the ranges as a derived convenience rather than as the record — the section
  identity and disposition are what survive a base merge.

**Superseded by adversarial pass one.** The disposition table below was built by applying the audience and
summoning tests, and a fresh-context pass then found that it did not consistently apply `knowledge-evolution` P1
(constraints never demote) or P3 (operation-anchored triggers), and that two destinations do not exist as
labelled. The corrected dispositions are recorded per row below; the **table as a whole is not yet trustworthy**
and the draft carries a required re-audit (`draft-judgment-authority-model.md` § Open questions). Treat every
`Δnb` as an upper bound.

**Dispositions.** `keep` (unchanged) · `compress` (rephrase in place, stays always-loaded) · `demote → dest`
(leaves the always-loaded set) · `cut` (removed, nothing summons it) · `out of scope` (another work unit owns
the section).

**Mechanism state** qualifies every demotion: `fires` (a summoning mechanism already works today) · `gated`
(the demotion is real but needs a mechanism or trigger amendment first) · `blocked` (no mechanism available
within this work unit's reach).

### `DEV-RULES.ARC` — 570 raw / 418 nonblank lines

| Section                                    | Lines   | nb | Disposition                                                                                                                           | Destination / mechanism                                                                                                                 | Δnb |
| ------------------------------------------ | ------- | -- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Preamble                                   | 1-14    | 11 | keep                                                                                                                                  | —                                                                                                                                       | 0   |
| Contents                                   | 16-29   | 11 | cut                                                                                                                                   | navigation for a human scanner; the file loads whole and `§` resolution never consults it                                               | 11  |
| Review-Increment Invariant                 | 30-45   | 12 | keep ¶1 unqualified; compress ¶2                                                                                                      | five exempted operations packed into one sentence → list                                                                                | 0   |
| Scaled Process, Invariant Discipline       | 46-60   | 10 | compress; demote the Class-versus-Work-Character taxonomy                                                                             | `strategy-work-organization` — fires ("deciding work unit types")                                                                       | 6   |
| Commit control                             | 63-166  | 85 | itemized below                                                                                                                        | —                                                                                                                                       | 43  |
| Commit format                              | 167-175 | 6  | keep — the don't-reconstruct-from-`git log` warning is the constraint                                                                 | —                                                                                                                                       | 1   |
| Atomicity                                  | 176-182 | 4  | keep                                                                                                                                  | —                                                                                                                                       | 0   |
| Task interlock                             | 185-207 | 18 | rephrase leaf → floor plus an explicit boundary parameter; demote the deferred-review signals and the team elaboration                | `process-task-loop` (fires, already pointered) · `strategy-team-coordination` (fires)                                                   | 8   |
| Design before implementation               | 208-220 | 10 | keep the settle-up-front constraint; demote the rationale                                                                             | `strategy-work-planning` — fires ("authoring specs, resolving planning depth")                                                          | 7   |
| Sub-agent scope                            | 221-238 | 14 | out of scope                                                                                                                          | `execution-delegation-doctrine` owns the prohibition → conditions rewrite                                                               | 0   |
| Review finding mutation guard              | 239-244 | 4  | keep verbatim — bias-guard                                                                                                            | —                                                                                                                                       | 0   |
| Task granularity                           | 245-253 | 6  | cut the numeric thresholds, keep the principle                                                                                        | register cut 2                                                                                                                          | 5   |
| Quality gate failure                       | 254-262 | 6  | **rephrase** — separate a gate that never ran from one that failed; narrow the invariant to "a red gate never becomes a green report" | draft § The bounded register, Rephrasings — supersedes the earlier cut-3 reading                                                        | ~0  |
| Test-first assessment                      | 263-269 | 4  | compress to the obligation plus the method pointer                                                                                    | method declaration — fires                                                                                                              | 2   |
| Discovered Work Routing — core invariant   | 270-278 | 6  | keep                                                                                                                                  | —                                                                                                                                       | 1   |
| Leave it cleaner                           | 279-288 | 6  | rephrase — propose-placement contradicts the inline-fix permission two lines above                                                    | register rephrasing 2                                                                                                                   | 2   |
| Route by urgency × isolation               | 289-317 | 23 | keep the table and the routing constraint; demote drain behavior, express lanes, and the retention exception                          | `drain-inbox` / `arc-inbox` / `arc-housekeep` — fires                                                                                   | 12  |
| Holding ≠ execution                        | 318-331 | 11 | keep the never-on-the-WU-branch constraint; demote the protection-mode shape and the record back-pointer                              | `run-errand` — fires                                                                                                                    | 7   |
| Anti-rider                                 | 332-338 | 5  | keep                                                                                                                                  | —                                                                                                                                       | 1   |
| Planning artifacts aren't capture surfaces | 339-347 | 6  | keep                                                                                                                                  | —                                                                                                                                       | 2   |
| Session state control                      | 350-365 | 11 | keep the write-trigger constraint; demote the file model and portability                                                              | `strategy-session-operations` — **gated** on trigger amendment                                                                          | 6   |
| Handoff                                    | 366-370 | 3  | keep                                                                                                                                  | —                                                                                                                                       | 1   |
| Context quality                            | 371-407 | 25 | keep one line; cut the quality-signals bullet (4); demote the boundary taxonomy and three-step procedure (18)                         | `strategy-session-operations` — **gated** on trigger amendment                                                                          | 22  |
| Verify before assuming                     | 410-429 | 14 | cut the numbered steps; keep the never-assume list intact                                                                             | register cut 4                                                                                                                          | 5   |
| Recommend on advisory forks                | 430-434 | 3  | keep                                                                                                                                  | —                                                                                                                                       | 0   |
| Consult strategy guidance                  | 435-446 | 8  | compress to one obligation line                                                                                                       | `STRATEGY-INDEX` is itself always-loaded and self-describing — fires                                                                    | 6   |
| Method and extension loading               | 447-458 | 8  | keep the load-at-fire-point rule; demote the `.override` / `override-mode` semantics                                                  | `strategy-configurability-architecture` — **gated**: its trigger fires for authoring config, not for consuming an override at load time | 3   |
| No meta-project references in code         | 461-477 | 14 | compress in place — the examples do real disambiguation work and nothing would summon them                                            | no mechanism; stays                                                                                                                     | 4   |
| Artifact relocatability                    | 478-483 | 4  | compress — rationale preamble to the section below                                                                                    | —                                                                                                                                       | 2   |
| `.arc/` artifact references                | 484-497 | 10 | keep both rules; compress                                                                                                             | —                                                                                                                                       | 3   |
| Write for the reader, not the author       | 498-516 | 14 | keep the constraint; compress the examples and the communication-artifact expansion                                                   | —                                                                                                                                       | 7   |
| Commit and PR surface language             | 517-526 | 7  | compress                                                                                                                              | —                                                                                                                                       | 3   |
| When to Load Additional Guidance           | 527-550 | 17 | **blocked** — a pure pointer index `knowledge-evolution` P4 wants derived                                                             | no summoning mechanism until `knowledge-architecture` ships a derived-access-path surface                                               | 17  |

**§ Commit control, itemized** — the file's largest block and its largest committable saving:

| Item                                          | Lines   | nb | Disposition                                                          | Destination / mechanism                                                   | Δnb |
| --------------------------------------------- | ------- | -- | -------------------------------------------------------------------- | ------------------------------------------------------------------------- | --- |
| Concept — interlocks gate, fire sites release | 65-68   | 4  | demote                                                               | the routing method — fires (workflows declare the tag)                    | 4   |
| Commit and push triggering                    | 71-78   | 7  | compress to the obligation; per-mode behavior is already pointered   | `process-task-loop` / `session-handoff` — fires                           | 3   |
| Implied-approval scope                        | 80-83   | 4  | keep — bias-guard against inferring approval                         | —                                                                         | 0   |
| Prefix mapping                                | 84-88   | 4  | demote                                                               | `process-task-loop` § Completion protocol — fires                         | 4   |
| Release-wrapper invocation                    | 90-99   | 9  | keep off-workflow-uses-raw-`git`; demote the wrapper mechanics       | the routing method — fires                                                | 6   |
| Workflow class-tag routing                    | 101-115 | 13 | demote; keep destructive-flags-stay-literal                          | a method — fires (register: already classified `Land`)                    | 11  |
| Merge to integration / main                   | 117-119 | 3  | keep the obligation universal; cut the not-authorization enumeration | derivable under the discriminator — a bias-guard yields to no inference   | 2   |
| Never `--no-verify`                           | 121     | 1  | keep verbatim — invariant                                            | —                                                                         | 0   |
| Amend scope                                   | 123-125 | 3  | compress                                                             | —                                                                         | 1   |
| Rebase scope                                  | 127-130 | 4  | keep — the SHA-keyed-notes rationale is a non-obvious invariant      | —                                                                         | 0   |
| Revert check, cascade-undo                    | 132-137 | 5  | keep — quiet-failing                                                 | —                                                                         | 0   |
| Task list accuracy                            | 139-140 | 2  | keep                                                                 | —                                                                         | 0   |
| ROADMAP regen                                 | 142-145 | 4  | demote                                                               | pre-commit CHECK 17 already emits the exact re-render command — **fires** | 4   |
| Meta-file timing and commit shape             | 147-158 | 9  | compress                                                             | —                                                                         | 3   |
| Contributor commit release                    | 160-162 | 3  | demote                                                               | `AGENT-BRIEF.CONTRIBUTOR` — fires (role-conditional load)                 | 3   |
| Complex-commits pointer                       | 164-165 | 2  | cut — duplicated in § When to Load Additional Guidance               | —                                                                         | 2   |

### `DEV-RULES.PROJECT` — 341 raw / 261 nonblank lines

| Section                           | Lines   | nb | Disposition                                                                                                                                                | Destination / mechanism                                                                                                     | Δnb |
| --------------------------------- | ------- | -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --- |
| Preamble                          | 1-9     | 7  | keep                                                                                                                                                       | —                                                                                                                           | 0   |
| Contents                          | 11-24   | 11 | cut                                                                                                                                                        | as above                                                                                                                    | 11  |
| Quality Gates — preamble          | 25-31   | 4  | keep — zero tolerance                                                                                                                                      | —                                                                                                                           | 1   |
| Selecting what to run             | 32-62   | 26 | **keep unchanged — the exemplar**                                                                                                                          | cite as the target shape; change nothing                                                                                    | 0   |
| The six numbered gate entries     | 64-106  | 35 | demote                                                                                                                                                     | `QUICK-REFERENCE` § Quality Gate Commands, where they are already duplicated — **gated** on mechanism 3                     | 35  |
| Testing Requirements              | 107-120 | 10 | keep the coverage posture; demote the tier and method elaboration                                                                                          | `test-first` / `testing-standards` declarations — fires                                                                     | 6   |
| Code Quality Principles           | 121-138 | 13 | cut the four acronyms; the TypeScript standards stay                                                                                                       | register cut 1                                                                                                              | 7   |
| Markdown quality                  | 141-150 | 8  | keep line length and the underfill note; cut the always-run-lint duplication                                                                               | —                                                                                                                           | 3   |
| Documentation style               | 151-165 | 12 | keep the collaborative voice and reference-link convention; compress the examples                                                                          | —                                                                                                                           | 4   |
| Workflow prose economy            | 166-174 | 7  | demote, keeping a one-line obligation                                                                                                                      | `strategy-workflow-authoring` — fires ("authoring a workflow file")                                                         | 5   |
| Verbs over mechanics              | 175-181 | 5  | keep the verb-gap capture instruction; demote the rationale                                                                                                | `strategy-workflow-authoring` — fires                                                                                       | 3   |
| Commit Conventions (self-hosting) | 182-197 | 12 | keep the scope rule; compress the rationale                                                                                                                | —                                                                                                                           | 4   |
| Package-Project Sync              | 198-226 | 24 | keep the two-copy direction constraint; demote the hook explanation and the skill-drift and npm-spike hazards                                              | `strategy-package-project-sync` — fires ("resolving sync warnings"); the npm-spike hazard has no trigger and is keep-or-cut | 14  |
| Audience Boundaries — preamble    | 227-231 | 3  | keep                                                                                                                                                       | —                                                                                                                           | 1   |
| Surface taxonomy                  | 232-257 | 19 | keep — fires on every write to either surface; compress the path lists                                                                                     | —                                                                                                                           | 5   |
| Leak patterns                     | 258-272 | 12 | keep — quiet-failing constraints                                                                                                                           | —                                                                                                                           | 2   |
| Package-source mirror inheritance | 273-277 | 3  | keep                                                                                                                                                       | —                                                                                                                           | 1   |
| Relationship to DEV-RULES.ARC     | 278-288 | 8  | cut to a one-line "both apply" — pure cross-reference reconciliation                                                                                       | —                                                                                                                           | 6   |
| Capture Routing                   | 289-293 | 3  | keep                                                                                                                                                       | —                                                                                                                           | 1   |
| Surface agent-side friction       | 294-311 | 14 | keep the standing instruction; compress the two trigger-class definitions                                                                                  | —                                                                                                                           | 6   |
| Architecture Decision Records     | 314-342 | 24 | keep the internal-only leak rule and relocate it into § Audience Boundaries, where its concern lives; demote the decision criteria and placement rationale | `strategy-adr-methodology` — fires ("writing an ADR, deciding whether a decision warrants one")                             | 16  |

### Totals

| File                | Committable now | Mechanism-gated | Blocked | Total nb |
| ------------------- | --------------- | --------------- | ------- | -------- |
| `DEV-RULES.ARC`     | ~147            | ~31             | ~17     | 187      |
| `DEV-RULES.PROJECT` | ~96             | ~35             | 0       | ~131     |
| **Both**            | **~243**        | **~66**         | **~17** | **318**  |

These totals are **upper bounds pending the P1 re-audit** — the corrections below move lines out of the
committable tier and back into the always-loaded set, and the re-audit may move more.

### Corrections from adversarial pass one

1. **Two destinations do not exist as labelled** (was: "the routing method — fires"). No method in
   `system/methods/` covers release or class-tag routing; `strategy-interlock-release-wrappers.md` exists but
   carries no `STRATEGY-INDEX` entry, so mechanism 2 does not fire for it either. Corrected disposition for the
   § Commit control rows Concept (4 nb), Release-wrapper invocation (6 nb), and Workflow class-tag routing
   (11 nb): demote to that strategy, **gated on adding its index entry**. The class-authorization preconditions
   at `DEV-RULES.ARC` 108-111 are preconditions, not prose — they stay always-loaded.
2. **The quality-gate listing was gated on the wrong mechanism** (was: "gated on mechanism 3", 35 nb).
   `quality-gate-commands` exists and is declared in `process-task-loop`'s frontmatter, firing at three sites, so
   mechanism 1 already works — but its `.default` is a **passthrough** to "`DEV-RULES.PROJECT` § Quality Gates",
   so emptying that section breaks the fire site. Corrected: demote the _commands_ behind a one-line retarget of
   the passthrough, and **keep four constraints** that `QUICK-REFERENCE` does not carry — the
   index-versus-worktree false-green trap, re-stage-after-fix, `lint:md`'s fails-closed behavior, and "run both
   before declaring types green."
3. **Five demotions violate P1** (constraints never demote) and are withdrawn: the four quality-gate constraints
   above; § Context quality's boundary procedure, whose second step is a mandatory stop; § Discovered Work
   Routing's express-lane permission, whose destinations fire only when the agent already uses the inbox;
   § Verify before assuming's "stop and ask" step; and the class-authorization preconditions. **Procedural
   lesson:** the constraint-or-not determination must precede destination selection, since the summoning test
   cannot license what P1 forbids.
4. **P3 was never applied** (anchor triggers to operations, not workflows). Five destinations in the table are
   workflows — `process-task-loop`, `session-handoff`, `run-errand`, `drain-inbox`, `integrate-work-unit`,
   roughly a fifth of the committable tier. Each needs an operation-anchored trigger or the content stays.
5. **Mechanism 3 is precedented but now carries only one row.** Pre-commit CHECK 17 emits its own remedy verbatim
   ("Re-render with: `arc status --project --staged > …`"), and the husky chain's markdown and TypeScript gates
   emit none — verified at source. So the ROADMAP-regen row (4 nb) demotes today, but 4 nb does not justify
   gate-emission work, which has left the deliverable.
6. **A measurement correction.** § When to Load Additional Guidance is 24 raw lines / 17 nb, not the 43
   previously recorded — that figure swept in the file's 20-line trailing link block. It stays blocked.
7. **Trigger amendments needed, beyond the two already named.** `strategy-session-operations` and
   `strategy-configurability-architecture` remain, plus the `strategy-interlock-release-wrappers` index entry from
   correction 1, plus whatever P3 requires. Six destinations do fire as written —
   `strategy-work-planning`, `strategy-workflow-authoring`, `strategy-work-organization`,
   `strategy-adr-methodology`, `strategy-package-project-sync`, `strategy-team-coordination` — and
   `strategy-session-operations`' amendment must not be a "mid-session under context pressure" condition, which
   asks the agent to estimate its own degradation.

### What the enumeration established, and pass one did not disturb

- **Both tables of contents are pure cut** — 22 nb combined, the cheapest item in the register and previously
  unnamed. Zero risk: each file loads whole, and `§` reference resolution never consults them.
- **One section is off-limits.** § Sub-agent scope (14 nb) is the only part of either file this work unit must not
  touch; `execution-delegation-doctrine` owns its rewrite. That draws the boundary concretely — that work unit
  owns one section, this one owns the model and every other section — leaving only a vocabulary coupling to settle
  rather than a surface one.
- **The author's-interest caveat reaches roughly ten compress-in-place verdicts** beyond register cuts 2-5, each a
  judgment about prose the reader no longer needs, made by the same interested party the backstop clause names as
  structurally suspect. The draft now places the maintainer's read as a gate at spec discovery rather than leaving
  it an unowned caveat.
- **Every section line range reconciles** against the actual heading offsets in both files. The `Δnb` columns sum
  to 187 (ARC) and 131 (PROJECT) — 318 together. An earlier ~191 / ~322 pair predated the § Quality gate failure
  row's reclassification from a 4-nb cut to a ~0 rephrasing and was not re-derived; pass two caught it. The
  measurement has held up under both passes; what failed was the disposition logic.

---
