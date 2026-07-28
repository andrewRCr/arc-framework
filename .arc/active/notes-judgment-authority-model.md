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
is 348 raw / 267 nb, so the register is ~45% and ~45% of each file's substantive content rather than
"about a third," with a correspondingly larger raw footprint.

**Measured against base as of the 2026-07-26 reconcile, re-measured at the 2026-07-28 reconcile.** A sibling
errand edited § Method and extension loading (`0a7a7931b`), and the 2026-07-28 base merge then rewrote
§ Quality gate failure and grew § Code Quality Principles (below). Line ranges are no longer carried. Two
consequences beyond bookkeeping:

- That errand **independently applied this work unit's placement doctrine** to this file — its rationale reads
  "rationale and the fire-point marking guidance land in the authoring strategy instead of the always-loaded
  rules, which end up shorter than before." Constraint stays, rationale moves, same justification, arrived at
  without reference to this design. Fan-in evidence, and it pre-consumes a small part of the surface.
- **A register measured against exact line ranges decays whenever base moves.** Re-measuring is mechanical and
  cheap, but the spec should carry the ranges as a derived convenience rather than as the record — the section
  identity and disposition are what survive a base merge. Acted on below: the ranges are gone from the tables.

**Re-audited 2026-07-28 — the constraint-column pass.** Adversarial pass one found the original dispositions had
applied the audience and summoning tests without consistently applying `knowledge-evolution` P1 (constraints never
demote) or P3 (operation-anchored triggers), and that two destinations did not exist as labelled. The tables below
are the re-audit that closes it: every row now carries an explicit **constraint determination reached before its
destination**, which is the procedural lesson pass one drew. Line ranges are dropped from the record — they decay
on every base merge (above) and re-derive mechanically from the heading structure; `nb` and the section identity
are what survive.

**Test order per row**, applied in sequence, stopping at the first test that settles it:

1. **Constraint?** — must the reader have this present because they would not know to look for it? A prohibition, a
   mandatory stop, or a permission governing a path its destination does not fire on. `yes` ends the row: it stays.
2. **Destination** — which of the four mechanisms takes it.
3. **P2 strength** — does the trigger fire at the 85–95% band, or is it a passive `Consult when:` line?
4. **P3** — is the trigger anchored to the operation, or only to a workflow the content must also survive outside?
5. **Pointless as routed** — does the trigger fire about as often as the load would have?

**`C?`** — `yes` (constraint; stays always-loaded) · `no` · `mixed` (the constraint half stays, the remainder moves).

**Dispositions.** `keep` (unchanged) · `compress` (rephrase in place, stays always-loaded) · `demote → dest`
(leaves the always-loaded set) · `cut` (removed, nothing summons it) · `out of scope` (another work unit owns
the section).

**Tier** — what gates the row: `firm` (committable now) · `decided` (an author's-interest cut the maintainer has
now read and settled — see § The judgment tier, discharged) · `authoring` (a compress-in-place verdict; the
constraint stays always-loaded and only its prose densifies, so it carries no gate beyond ordinary review) ·
`trigger` (real, gated on re-authoring a passive index entry to P2 strength) · `P3` (gated on an operation-anchored
trigger) · `stays` (the constraint determination ended it) · `blocked` · `out of scope`.

### `DEV-RULES.ARC` — 570 raw / 418 nonblank lines

| Section                                    | nb | C?    | Disposition                                                                                                                                                                                              | Destination / mechanism                                                                                              | Tier              | Δnb |
| ------------------------------------------ | -- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- | --- |
| Preamble                                   | 11 | yes   | keep — carries the `[configurable]` reading rule                                                                                                                                                         | —                                                                                                                    | stays             | 0   |
| Contents                                   | 11 | no    | cut                                                                                                                                                                                                      | navigation for a human scanner; the file loads whole and `§` resolution never consults it                            | firm              | 11  |
| Review-Increment Invariant                 | 12 | yes   | keep ¶1 unqualified; restructure ¶2's five exempted operations as a list                                                                                                                                 | —                                                                                                                    | stays             | 0   |
| Scaled Process, Invariant Discipline       | 10 | mixed | keep the invariant-floor line; demote the `Class`-versus-Work-Character taxonomy                                                                                                                         | `strategy-work-organization` — passive index entry                                                                   | trigger           | 6   |
| Commit control                             | 85 | mixed | itemized below                                                                                                                                                                                           | —                                                                                                                    | —                 | 33  |
| Commit format                              | 6  | yes   | keep — don't-reconstruct-from-`git log` is a quiet-failing ignorance-guard                                                                                                                               | —                                                                                                                    | stays             | 1   |
| Atomicity                                  | 4  | yes   | keep                                                                                                                                                                                                     | —                                                                                                                    | stays             | 0   |
| Task interlock                             | 18 | mixed | rephrase leaf → floor plus an explicit boundary parameter; demote the team elaboration; the deferred-review signals stay                                                                                 | `strategy-team-coordination` (passive); `process-task-loop` fails P3 — deferred review is proposed off-task-list too | trigger           | 4   |
| Design before implementation               | 10 | mixed | keep the settle-up-front constraint; demote the rationale                                                                                                                                                | `strategy-work-planning` — passive index entry                                                                       | trigger           | 7   |
| Sub-agent scope                            | 14 | —     | out of scope                                                                                                                                                                                             | `execution-delegation-doctrine` owns the prohibition → conditions rewrite                                            | out of scope      | 0   |
| Review finding mutation guard              | 4  | yes   | keep verbatim — bias-guard                                                                                                                                                                               | —                                                                                                                    | stays             | 0   |
| Task granularity                           | 6  | no    | cut the two numeric bullets (>3 files, >50 lines); keep the two qualitative ones                                                                                                                         | register cut 2 — the proxies release, the signals stay; demotion fails P3 (ad-hoc decomposition)                     | decided           | 5   |
| Quality gate failure                       | 6  | yes   | re-derived against base: the two-branch rewrite landed upstream; add the never-ran distinction and state the invariant                                                                                   | draft § Rephrasings, narrowed — see § Base drift                                                                     | stays             | 0   |
| Test-first assessment                      | 4  | mixed | compress to the obligation plus the method pointer                                                                                                                                                       | method declaration (mechanism 1) — fires                                                                             | firm              | 2   |
| Discovered Work Routing — core invariant   | 6  | yes   | keep                                                                                                                                                                                                     | —                                                                                                                    | stays             | 1   |
| Leave it cleaner                           | 6  | yes   | rephrase — propose-placement contradicts the inline-fix permission two lines above it                                                                                                                    | register rephrasing 2; coupled to § Rule Authority landing                                                           | stays             | 2   |
| Route by urgency × isolation               | 23 | mixed | keep the table, the routing constraint, and the express-lane permission; demote drain behavior and the retention exception                                                                               | `drain-inbox` / `arc-housekeep` — fire at the drain operation, P3-clean                                              | firm              | 7   |
| Holding ≠ execution                        | 11 | mixed | keep the never-on-the-WU-branch constraint; demote the protection-mode shape and the record back-pointer                                                                                                 | `run-errand` — fires while running an errand; the constraint itself fails P3 and stays                               | firm              | 5   |
| Anti-rider                                 | 5  | yes   | keep                                                                                                                                                                                                     | —                                                                                                                    | stays             | 1   |
| Planning artifacts aren't capture surfaces | 6  | yes   | keep                                                                                                                                                                                                     | —                                                                                                                    | stays             | 2   |
| Session state control                      | 11 | mixed | keep the write-trigger constraint; demote the file model and portability                                                                                                                                 | `strategy-session-operations` — passive, and its amendment must not key on the agent's own context estimate          | trigger           | 6   |
| Handoff                                    | 3  | yes   | keep — an authority rule; the cut test forbids cutting one at any capability                                                                                                                             | —                                                                                                                    | stays             | 1   |
| Context quality                            | 25 | mixed | keep the opening line and the boundary procedure; cut the quality-signals bullet entirely (4); extract the note-the-handoff-opportunity line as a one-line keep; demote the four boundary categories (7) | `strategy-session-operations` — same amendment                                                                       | decided + trigger | 11  |
| Verify before assuming                     | 14 | mixed | cut the search-first and ask-clarifying steps; the "stop and ask" step and the never-assume list stay                                                                                                    | register cut 4 — the prohibition is the guard; step 1 is its procedural twin                                         | decided           | 3   |
| Recommend on advisory forks                | 3  | yes   | keep                                                                                                                                                                                                     | —                                                                                                                    | stays             | 0   |
| Consult strategy guidance                  | 8  | mixed | compress to one obligation line                                                                                                                                                                          | `STRATEGY-INDEX` is itself always-loaded and self-describing — fires trivially                                       | firm              | 6   |
| Method and extension loading               | 8  | yes   | keep the load-at-fire-point rule; the `.override` / `override-mode` demotion is **withdrawn**                                                                                                            | applying `.default` where an override governs fails silently, with no cue to look                                    | stays             | 0   |
| No meta-project references in code         | 14 | yes   | compress in place — the examples do real disambiguation work and nothing would summon them                                                                                                               | no mechanism; stays                                                                                                  | authoring         | 4   |
| Artifact relocatability                    | 4  | no    | compress — rationale preamble to the section below                                                                                                                                                       | —                                                                                                                    | authoring         | 2   |
| `.arc/` artifact references                | 10 | yes   | keep both rules; compress                                                                                                                                                                                | —                                                                                                                    | authoring         | 3   |
| Write for the reader, not the author       | 14 | yes   | keep the constraint **and both examples**; compress the communication-artifact expansion only                                                                                                            | retracted from a 7 nb compression — the examples disambiguate, as in § No meta-project references                    | authoring         | 3   |
| Commit and PR surface language             | 7  | yes   | compress                                                                                                                                                                                                 | —                                                                                                                    | authoring         | 3   |
| When to Load Additional Guidance           | 17 | no    | blocked — a pure pointer index `knowledge-evolution` P4 wants derived                                                                                                                                    | no summoning mechanism until `knowledge-architecture` ships a derived-access-path surface                            | blocked           | 17  |

**§ Commit control, itemized** — the file's largest block:

| Item                                          | nb | C?    | Disposition                                                                                         | Destination / mechanism                                                               | Tier      | Δnb |
| --------------------------------------------- | -- | ----- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------- | --- |
| Concept — interlocks gate, fire sites release | 4  | no    | demote                                                                                              | `strategy-interlock-release-wrappers` — exists, but carries no `STRATEGY-INDEX` entry | trigger   | 4   |
| Commit and push triggering                    | 7  | mixed | compress to the obligation; per-mode behavior is already pointered                                  | `process-task-loop` / `session-handoff` — the mode only bites inside them, P3-clean   | firm      | 3   |
| Implied-approval scope                        | 4  | yes   | keep — bias-guard against inferring approval                                                        | —                                                                                     | stays     | 0   |
| Prefix mapping                                | 4  | no    | **withdrawn** — needed at any structured approval gate, including the off-task-list ones            | `process-task-loop` § Completion protocol fails P3                                    | P3        | 0   |
| Release-wrapper invocation                    | 9  | mixed | keep off-workflow-uses-raw-`git`; demote the wrapper mechanics                                      | `strategy-interlock-release-wrappers` — index entry needed                            | trigger   | 6   |
| Workflow class-tag routing                    | 13 | mixed | demote the mechanics; keep destructive-flags-stay-literal and the class-authorization preconditions | same index entry                                                                      | trigger   | 7   |
| Merge to integration / main                   | 3  | yes   | keep whole — the not-authorization enumeration was retracted as a bias-guard                        | `integrate-work-unit` fails P3: the rule exists for the agent _not_ running it        | stays     | 0   |
| Never `--no-verify`                           | 1  | yes   | keep verbatim — invariant                                                                           | —                                                                                     | stays     | 0   |
| Amend scope                                   | 3  | yes   | compress                                                                                            | —                                                                                     | authoring | 1   |
| Rebase scope                                  | 4  | yes   | keep — the SHA-keyed-notes rationale is a non-obvious invariant                                     | —                                                                                     | stays     | 0   |
| Revert check, cascade-undo                    | 5  | yes   | keep — quiet-failing                                                                                | —                                                                                     | stays     | 0   |
| Task list accuracy                            | 2  | yes   | keep                                                                                                | —                                                                                     | stays     | 0   |
| ROADMAP regen                                 | 4  | no    | demote                                                                                              | pre-commit CHECK 17 already emits the exact re-render command (mechanism 3) — fires   | firm      | 4   |
| Meta-file timing and commit shape             | 9  | yes   | compress                                                                                            | —                                                                                     | authoring | 3   |
| Contributor commit release                    | 3  | no    | demote                                                                                              | `AGENT-BRIEF.CONTRIBUTOR` — role-conditional load, mechanism 4 in shape               | firm      | 3   |
| Complex-commits pointer                       | 2  | no    | cut — duplicated in § When to Load Additional Guidance                                              | —                                                                                     | firm      | 2   |

### `DEV-RULES.PROJECT` — 348 raw / 267 nonblank lines

| Section                           | nb | C?    | Disposition                                                                                                                                                          | Destination / mechanism                                | Tier      | Δnb |
| --------------------------------- | -- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------- | --- |
| Preamble                          | 7  | no    | keep                                                                                                                                                                 | —                                                      | stays     | 0   |
| Contents                          | 11 | no    | cut                                                                                                                                                                  | as above                                               | firm      | 11  |
| Quality Gates — preamble          | 4  | yes   | keep — zero tolerance                                                                                                                                                | —                                                      | stays     | 1   |
| Selecting what to run             | 26 | yes   | **keep unchanged — the exemplar**                                                                                                                                    | cite as the target shape; change nothing               | stays     | 0   |
| The six numbered gate entries     | 35 | mixed | demote the commands behind a one-line retarget of the `quality-gate-commands` passthrough; keep the four constraints `QUICK-REFERENCE` does not carry                | mechanism 1 fires once retargeted                      | firm      | 28  |
| Testing Requirements              | 10 | mixed | keep the coverage posture; demote the tier and method elaboration                                                                                                    | `test-first` / `testing-standards` declarations — fire | firm      | 6   |
| Code Quality Principles           | 19 | mixed | cut DRY / SOLID / KISS; **keep YAGNI**, reframed as scope discipline; the TypeScript standards and the pre-public-release posture stay; reseat or rename the heading | register cut 1 — see § Base drift                      | decided   | 7   |
| Markdown quality                  | 8  | mixed | keep line length and the underfill note; cut the always-run-lint duplication                                                                                         | —                                                      | firm      | 3   |
| Documentation style               | 12 | yes   | keep the collaborative voice and the reference-link convention; compress the examples                                                                                | —                                                      | authoring | 4   |
| Workflow prose economy            | 7  | mixed | demote, keeping a one-line obligation                                                                                                                                | `strategy-workflow-authoring` — passive index entry    | trigger   | 5   |
| Verbs over mechanics              | 5  | mixed | keep the verb-gap capture instruction; demote the rationale                                                                                                          | `strategy-workflow-authoring` — same entry             | trigger   | 3   |
| Commit Conventions (self-hosting) | 12 | yes   | keep the scope rule; compress the rationale                                                                                                                          | —                                                      | authoring | 4   |
| Package-Project Sync              | 24 | mixed | keep the two-copy direction constraint and the npm-spike hazard; demote the hook explanation and the skill-drift hazard                                              | `strategy-package-project-sync` — passive index entry  | trigger   | 10  |
| Audience Boundaries — preamble    | 3  | yes   | keep                                                                                                                                                                 | —                                                      | stays     | 1   |
| Surface taxonomy                  | 19 | yes   | **keep verbatim** — the path lists are the operative content, not prose around it; compressing them trades a quiet-failing rule's precision for 5 nb                 | retracted from a 5 nb compression                      | stays     | 0   |
| Leak patterns                     | 12 | yes   | keep — quiet-failing constraints                                                                                                                                     | —                                                      | stays     | 2   |
| Package-source mirror inheritance | 3  | yes   | keep                                                                                                                                                                 | —                                                      | stays     | 1   |
| Relationship to DEV-RULES.ARC     | 8  | no    | cut to a one-line "both apply" — pure cross-reference reconciliation                                                                                                 | —                                                      | firm      | 6   |
| Capture Routing                   | 3  | yes   | keep                                                                                                                                                                 | —                                                      | stays     | 1   |
| Surface agent-side friction       | 14 | yes   | keep the standing instruction; compress the two trigger-class definitions                                                                                            | —                                                      | authoring | 6   |
| Architecture Decision Records     | 24 | mixed | keep the internal-only leak rule and relocate it into § Audience Boundaries; demote the decision criteria and placement rationale                                    | `strategy-adr-methodology` — passive index entry       | trigger   | 16  |

### Totals

| File                                                 | firm   | decided | authoring | trigger | blocked | residue | Total Δnb |
| ---------------------------------------------------- | ------ | ------- | --------- | ------- | ------- | ------- | --------- |
| `DEV-RULES.ARC` (canonical — ships)                  | 43     | 12      | 19        | 47      | 17      | 8       | 146       |
| `DEV-RULES.PROJECT` (instance — ships as a template) | 54     | 7       | 14        | 34      | 0       | 6       | 115       |
| **Both**                                             | **97** | **19**  | **33**    | **81**  | **17**  | **14**  | **261**   |

Down from the pre-audit 318. The 57 nb difference is content the constraint column and the two authoring
retractions returned to the always-loaded set. The `P3` tier carries no Δ — its one row (Prefix mapping) was
withdrawn rather than deferred.

**`firm` + `decided` is what may be authored against today: 116 nb**, of which 55 is canonical `DEV-RULES.ARC`
and 61 is the instance file. The instance share across the whole register is 115 / 261 ≈ **44%**.

### What the constraint column changed

1. **Two further demotions withdrawn as constraints**, beyond pass one's five. § Method and extension loading's
   `.override` / `override-mode` semantics (3 nb): applying `.default` where an override governs fails silently,
   and the reader has no cue that an override exists to look for — P1's exact shape. § Commit control's Prefix
   mapping (4 nb): the mapping is needed at _any_ structured approval gate, and § Commit Discipline says outright
   that off-workflow and incidental commits use the same shape, so a destination inside `process-task-loop` misses
   the case. Four more rows were confirmed as constraints rather than merely surviving: the deferred-review
   signals, the express-lane permission, the never-on-the-WU-branch rule, and the whole merge-authority block.

2. **P3 disqualifies two of the five workflow destinations, not all five.** `drain-inbox` / `arc-housekeep` and
   `run-errand` survive, because what they take is genuinely local to the operation that loads them — retention
   behavior matters at the drain, protection-mode shape matters while running an errand. `process-task-loop` fails
   twice (deferred review, prefix mapping) and `integrate-work-unit` fails on merge authority, which is the draft's
   own worked case. The earlier "roughly a fifth of the committable tier" reading was too pessimistic.

3. **The trigger tier is the single largest at ~82 nb, and it is all one defect.** Every `strategy-*` destination
   in the register reaches its content through a passive `Consult when:` line — the 60–75% band in a trigger
   costume. Seven index entries need re-authoring to P2 strength before _any_ of that content may move:
   `strategy-work-organization`, `strategy-work-planning`, `strategy-session-operations`,
   `strategy-workflow-authoring`, `strategy-package-project-sync`, `strategy-adr-methodology`, and a new entry for
   `strategy-interlock-release-wrappers`. That is a bounded, enumerable task, and it is the deliverable's critical
   path rather than an incidental prerequisite.

4. **The authorable tier is 116 nb, and 53% of it sits in the instance file.** Of that, 55 nb is canonical
   `DEV-RULES.ARC` and 61 nb is `DEV-RULES.PROJECT`, which ships as a 175-line fill-in template no project
   inherits. The instance share across the whole register is 115 / 261 ≈ **44%**, confirming the draft's ~41%
   estimate. The canonical tier — what actually reaches every project on day one — is 55 nb.

5. **The author's-interest caveat splits into two risk classes, and only one of them is a gate.** The draft
   bundled "cuts 2–5 plus roughly ten compress-in-place verdicts" as one class. They are not: an outright **cut**
   removes a rule, while a **compress-in-place** verdict leaves the constraint always-loaded and densifies only
   its prose — you cannot lose a rule that way, only an explanation. The gate belongs on the cuts (19 nb, tier
   `decided`); the compressions (33 nb, tier `authoring`) are ordinary authoring under the no-detail-loss
   self-check and review at the capture gate. Splitting them is what let the gate actually close.

### The judgment tier, discharged

The maintainer's read the draft placed at spec discovery ran at draft stage instead, on 2026-07-28. All four cuts
were taken, three in narrowed form, and two compress verdicts were retracted:

- **§ Code Quality Principles** — cut DRY / SOLID / KISS; **keep YAGNI**, reframed as scope discipline. YAGNI is
  not capability guidance ("how to be good at coding") but a scope-authority rule — don't build what wasn't asked
  for — which agents do violate and which ARC states nowhere else. The heading needs a reseat or rename once the
  acronyms go, since what remains is a compat posture plus TypeScript standards.
- **§ Task granularity** — cut the two numeric bullets (>3 files, >50 lines); keep the two qualitative ones
  ("multiple interdependent changes", "complex debugging or investigation"). The proxies are what misfire; the
  qualitative signals are what carry the principle the draft said to keep.
- **§ Context quality quality-signals bullet** — cut **entirely**, not narrowed. The maintainer's read: the only
  agent-facing value in this concern is the occasional "we're at a clean boundary, hand off before X?" — and that
  behavior comes from a different bullet (below). What remains is degradation self-monitoring, which nobody needs
  help with on the human side, and always-loaded content has to earn its keep. Cutting it and observing whether it
  is ever missed is the cheaper experiment.
- **§ Verify before assuming** — cut the search-first and ask-clarifying steps as proposed. The bias-guard
  objection resolves under this work unit's own doctrine: the prohibition ("Never generate or assume…") is the
  guard and stays; step 1 is its procedural twin and moves. Constraint stays, procedure moves.
- **Retracted: § Surface taxonomy** (was a 5 nb compression) — the path lists _are_ the operative content, checked
  against on every write to either surface. Compressing them trades a quiet-failing rule's precision for 5 nb.
- **Retracted: § Write for the reader** (was 7 nb, now 3) — the compression worked by dropping the two
  reader-hostile examples, and the same "examples do real disambiguation work" reasoning already applied to
  § No meta-project references applies here.

**One row moved because of a source check, not a preference.** The handoff-boundary behavior the maintainer values
is produced by § Context quality → Natural session boundaries → **Structural boundaries**, whose last clause reads
"note the handoff opportunity if significant context has accumulated" — not by the quality-signals bullet at all.
That line is a single agent-facing behavioral instruction embedded in an otherwise human-facing taxonomy slated for
demotion. Revised: **extract it as a one-line keep and demote the four categories around it** (7 nb, not 8).

**Procedural lesson, and the second one this register has produced:** the audience test must be applied at bullet
granularity, not section granularity. Pass one's lesson was that the constraint determination precedes the
destination; this one is that a section is not the unit either determination operates on. Both are cases of a
disposition being made at too coarse a grain to be true.

### Base drift — two register rows moved during the pass

The 2026-07-28 base merge changed both files, exactly the decay the note above predicted:

- **`DEV-RULES.ARC` § Quality gate failure was rewritten upstream** — the four numbered steps became a two-branch
  rule: a deterministic same-concern failure is fixed and re-run immediately with the correction reported;
  everything else reports and asks. That is **an eighth independent enactment of this work unit's model**, and it
  lands the register's own middle case (a red gate whose cause is this increment, with the fix in scope, is a
  discharged default). Two thirds of the row's rephrasing remain: the **gate that never ran** is still absent, so
  a mistyped filter still routes to "otherwise → report and ask" — the recorded live instance, unfixed — and the
  narrowed invariant, _a red gate never becomes a green report and is never bypassed_, is still unstated.
- **`DEV-RULES.PROJECT` § Code Quality Principles grew from 13 to 19 nb**, in two unrelated commits, and the
  growth **strengthens** register cut 1 rather than challenging it. `eeb94e7ac` (the `review-protocol-alignment`
  spec finalization) added the pre-public-release compatibility posture — no back-compat aliases or migrations for
  unpublished project-owned contracts; `56b283e73`, a maintenance errand, added a shared-helper failure-policy
  bullet inside the TypeScript standards. Three things follow:
    - **Neither addition touched the cut's target.** Both landed elsewhere in the section — the posture after the
      acronyms, the helper bullet inside a list the register already dispositions as staying. The four acronyms
      have been inert across the project's life while the section around them churned twice in two days. The
      generic content is what nobody edits; the particular content is what earns the section its place.
    - **Both additions are the class the cut test protects.** "Never bake one consumer's safe default into a
      shared resolver" and "clear or regenerate development state instead" are preference and authority rules —
      unrecoverable from the codebase, particular to this project, quiet-failing. DRY / SOLID / KISS / YAGNI are
      the opposite: generic capability guidance that model progress has settled. The section is a clean worked
      example of the draft's § What model progress erodes, arrived at without reference to it.
    - **`56b283e73` is a maintainer's read landing on the register's side.** Its commit message opens "Always-
      loaded surfaces stay short," and it still judged two lines of specific guidance worth always-loaded
      placement in the same commit that compressed § Quality gate failure. Compression instinct plus a keep
      verdict on particular content is exactly the register's own split. Record it as independent evidence for
      the author's-interest gate at spec discovery, where the question is which cuts a non-author would make.
    - **One structural consequence the row must carry.** The acronyms are the section's opening content, so
      cutting them leaves § Code Quality Principles opening on a release-compat posture — a heading that no longer
      describes its contents (a compat posture plus TypeScript standards). The cut wants a reseat or a rename,
      not a bare deletion; folding the posture paragraph into § Package-Project Sync or a renamed heading is the
      likelier shape. Sized as part of the judgment tier, not on top of it.

### Corrections from adversarial pass one, folded into the tables above

Retained for the evidence they carry, not as live dispositions:

1. **Two destinations did not exist as labelled** (was: "the routing method — fires"). No method in
   `system/methods/` covers release or class-tag routing; `strategy-interlock-release-wrappers.md` exists but
   carries no `STRATEGY-INDEX` entry, so mechanism 2 does not fire for it either.
2. **The quality-gate listing was gated on the wrong mechanism** (was: "gated on mechanism 3", 35 nb).
   `quality-gate-commands` exists and is declared in `process-task-loop`'s frontmatter, firing at three sites, so
   mechanism 1 already works — but its `.default` is a **passthrough** to "`DEV-RULES.PROJECT` § Quality Gates",
   so emptying that section breaks the fire site. The four kept constraints are the index-versus-worktree
   false-green trap, re-stage-after-fix, `lint:md`'s fails-closed behavior, and "run both before declaring types
   green."
3. **Five demotions violated P1** and were withdrawn: the four quality-gate constraints above; § Context quality's
   boundary procedure, whose second step is a mandatory stop; § Discovered Work Routing's express-lane permission;
   § Verify before assuming's "stop and ask" step; and the class-authorization preconditions.
4. **P3 was never applied.** Now applied per row; see finding 2 above.
5. **Mechanism 3 is precedented but carries only one row.** Pre-commit CHECK 17 emits its own remedy verbatim
   ("Re-render with: `arc status --project --staged > …`"), and the husky chain's markdown and TypeScript gates
   emit none — verified at source. So the ROADMAP-regen row (4 nb) demotes today, but 4 nb does not justify
   gate-emission work, which has left the deliverable.
6. **A measurement correction.** § When to Load Additional Guidance is 24 raw lines / 17 nb, not the 43
   previously recorded — that figure swept in the file's 20-line trailing link block. It stays blocked.

### What the enumeration established, and neither pass disturbed

- **Both tables of contents are pure cut** — 22 nb combined, the cheapest item in the register. Zero risk: each
  file loads whole, and `§` reference resolution never consults them.
- **One section is off-limits.** § Sub-agent scope (14 nb) is the only part of either file this work unit must not
  touch; `execution-delegation-doctrine` owns its rewrite. That draws the boundary concretely — that work unit
  owns one section, this one owns the model and every other section — leaving only a vocabulary coupling to settle
  rather than a surface one.
- **The measurement has held up under both passes and the base merge**; what failed each time was the disposition
  logic. That is the argument for the constraint column being part of the artifact rather than a one-time audit.

---
