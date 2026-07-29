# Notes: judgment-authority-model

> _Internal working record for this work unit. The design lives in `spec-judgment-authority-model.md`; this
> file holds the evidence and rationale too large to carry there._

---

## Line-level compression enumeration (2026-07-26)

Closes the draft's open scoping unknown: the measured ~315-line compression surface, itemized section by
section so the register stays a bounded list rather than a percentage anyone can widen.

**Method.** Section-level mechanical measurement first (per-heading raw and nonblank line counts, computed from
the heading structure rather than estimated), then a per-section disposition under the four tests the draft
settled: the audience test, the summoning test, the loud-versus-quiet cut test, and constraints-only placement.

**Units.** `nb` is nonblank lines within the section — what a disposition actually moves. The earlier ~315 figure
counted raw lines and the two are **not** comparable: `DEV-RULES.ARC` is 570 raw / 418 nb and `DEV-RULES.PROJECT`
is 348 raw / 267 nb. After three rounds of corrections the register is 144/418 ≈ 34% and 102/267 ≈ 38% —
about a third of each file after all, though of substantive rather than raw lines.

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

**Counting convention — state it or it gets re-derived differently.** Each section is counted from its heading
**through its trailing `---` separator**, applied consistently across every row (§ Review-Increment Invariant 12
rather than 11, § Context quality 25 rather than 24, both tables of contents 22 combined rather than 20). What the
convention must **exclude** is the file's own trailing link block — the error this register made three times before
D7.6 pinned it. A per-heading count that stops at the next heading picks up the link block on the last section of
the file; stop at the next heading _or_ the final `---`, whichever comes first.

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

| Section                                    | nb | C?    | Disposition                                                                                                                                                                                                   | Destination / mechanism                                                                                              | Tier              | Δnb  |
| ------------------------------------------ | -- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- | ---- |
| Preamble                                   | 11 | yes   | keep — carries the `[configurable]` reading rule                                                                                                                                                              | —                                                                                                                    | stays             | 0    |
| Contents                                   | 11 | no    | cut                                                                                                                                                                                                           | navigation for a human scanner; the file loads whole and `§` resolution never consults it                            | firm              | 11   |
| Review-Increment Invariant                 | 12 | yes   | keep ¶1 unqualified; restructure ¶2's four exempted operations as a list                                                                                                                                      | —                                                                                                                    | stays             | 0    |
| Scaled Process, Invariant Discipline       | 10 | mixed | keep the invariant-floor line; demote the `Class`-versus-Work-Character taxonomy                                                                                                                              | `strategy-work-organization` — passive index entry                                                                   | trigger           | 6    |
| Commit control                             | 85 | mixed | itemized below                                                                                                                                                                                                | —                                                                                                                    | —                 | 33   |
| Commit format                              | 6  | yes   | keep — don't-reconstruct-from-`git log` is a quiet-failing ignorance-guard                                                                                                                                    | —                                                                                                                    | stays             | 1    |
| Atomicity                                  | 4  | yes   | keep                                                                                                                                                                                                          | —                                                                                                                    | stays             | 0    |
| Task interlock                             | 18 | mixed | rephrase leaf → floor plus an explicit boundary parameter; demote the team elaboration; the deferred-review signals stay                                                                                      | `strategy-team-coordination` (passive); `process-task-loop` fails P3 — deferred review is proposed off-task-list too | trigger           | 4    |
| Design before implementation               | 10 | mixed | keep the settle-up-front constraint; demote the rationale                                                                                                                                                     | `strategy-work-planning` — passive index entry                                                                       | trigger           | 7    |
| Sub-agent scope                            | 14 | —     | out of scope                                                                                                                                                                                                  | `execution-delegation-doctrine` owns the prohibition → conditions rewrite                                            | out of scope      | 0    |
| Review finding mutation guard              | 4  | yes   | keep verbatim — bias-guard                                                                                                                                                                                    | —                                                                                                                    | stays             | 0    |
| Task granularity                           | 6  | no    | cut the two numeric bullets (>3 files, >50 lines); keep the two qualitative ones                                                                                                                              | register cut 2 — the proxies release, the signals stay; demotion fails P3 (ad-hoc decomposition)                     | decided           | 2    |
| Quality gate failure                       | 6  | yes   | re-derived against base: the two-branch rewrite landed upstream; add the never-ran distinction and state the invariant                                                                                        | draft § Rephrasings, narrowed — see § Base drift                                                                     | stays             | 0    |
| Test-first assessment                      | 4  | mixed | compress to the obligation plus the method pointer                                                                                                                                                            | method declaration (mechanism 1) — fires                                                                             | firm              | 2    |
| Discovered Work Routing — core invariant   | 6  | yes   | keep                                                                                                                                                                                                          | —                                                                                                                    | stays             | 1    |
| Leave it cleaner                           | 6  | yes   | rephrase — propose-placement contradicts the inline-fix permission two lines above it                                                                                                                         | register rephrasing 2; coupled to § Rule Authority landing                                                           | stays             | 2    |
| Route by urgency × isolation               | 23 | mixed | keep the table, the routing constraint, and the express-lane permission; demote drain behavior and the retention exception                                                                                    | `drain-inbox` / `arc-housekeep` — fire at the drain operation, P3-clean                                              | firm              | 7    |
| Holding ≠ execution                        | 11 | mixed | keep the never-on-the-WU-branch constraint; demote the protection-mode shape and the record back-pointer                                                                                                      | `run-errand` — fires while running an errand; the constraint itself fails P3 and stays                               | firm              | 5    |
| Anti-rider                                 | 5  | yes   | keep                                                                                                                                                                                                          | —                                                                                                                    | stays             | 1    |
| Planning artifacts aren't capture surfaces | 6  | yes   | keep                                                                                                                                                                                                          | —                                                                                                                    | stays             | 2    |
| Session state control                      | 11 | mixed | keep the write-trigger constraint; demote the file model and portability                                                                                                                                      | `strategy-session-operations` — passive, and its amendment must not key on the agent's own context estimate          | trigger           | 6    |
| Handoff                                    | 3  | yes   | keep — an authority rule; the cut test forbids cutting one at any capability                                                                                                                                  | —                                                                                                                    | stays             | 1    |
| Context quality                            | 25 | mixed | keep the opening line and the boundary procedure; cut the quality-signals bullet entirely; extract the note-the-handoff-opportunity line as a one-line keep; demote the two remaining boundary categories (7) | `strategy-session-operations` — same amendment                                                                       | decided + trigger | 11\* |
| Verify before assuming                     | 14 | mixed | cut the search-first and ask-clarifying steps; the "stop and ask" step and the never-assume list stay                                                                                                         | register cut 4 — the prohibition is the guard; step 1 is its procedural twin                                         | decided           | 3    |
| Recommend on advisory forks                | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                                                                    | stays             | 0    |
| Consult strategy guidance                  | 8  | mixed | compress to one obligation line                                                                                                                                                                               | `STRATEGY-INDEX` is itself always-loaded and self-describing — fires trivially                                       | firm              | 6    |
| Method and extension loading               | 8  | yes   | keep the load-at-fire-point rule; the `.override` / `override-mode` demotion is **withdrawn**                                                                                                                 | applying `.default` where an override governs fails silently, with no cue to look                                    | stays             | 0    |
| No meta-project references in code         | 14 | yes   | compress in place — the examples do real disambiguation work and nothing would summon them                                                                                                                    | no mechanism; stays                                                                                                  | authoring         | 4    |
| Artifact relocatability                    | 4  | no    | compress — rationale preamble to the section below                                                                                                                                                            | —                                                                                                                    | authoring         | 2    |
| `.arc/` artifact references                | 10 | yes   | keep both rules; compress                                                                                                                                                                                     | —                                                                                                                    | authoring         | 3    |
| Write for the reader, not the author       | 14 | yes   | keep the constraint **and both examples**; compress the communication-artifact expansion only                                                                                                                 | retracted from a 7 nb compression — the examples disambiguate, as in § No meta-project references                    | authoring         | 3    |
| Commit and PR surface language             | 7  | yes   | compress                                                                                                                                                                                                      | —                                                                                                                    | authoring         | 3    |
| When to Load Additional Guidance           | 15 | no    | blocked — a pure pointer index `knowledge-evolution` P4 wants derived                                                                                                                                         | no summoning mechanism until `knowledge-architecture` ships a derived-access-path surface                            | blocked           | 15   |

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

### § Rule Authority — the addition, held to the same procedure

The register audits what leaves the always-loaded set; this table audits what enters it. Same five tests, same
bullet granularity, run over the authored text before it landed. Authored at 46 nb, settled at **31**.

| Block                              | nb  | C?  | Disposition                                                                                     | Settled at                                             | Δnb |
| ---------------------------------- | --- | --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --- |
| Default-unless-marked presumption  | 2   | yes | keep — the governing rule; scope enumeration reaches methods, workflows, extensions, strategies | T1                                                     | 0   |
| `[configurable]` orthogonality     | 4→2 | yes | keep the compose clause; cut the restatement                                                    | T1 — misreading it releases a rule permissively        | 2   |
| Reading lead-in                    | 2   | yes | keep — the procedure's entry                                                                    | T1                                                     | 0   |
| Branch table                       | 5→4 | yes | merge branches 2 and 4 — same input class, same verdict, same action; cut both glosses          | T1                                                     | 1   |
| Backstop, both limbs               | 4→3 | yes | keep both limbs; cut "competence never transfers an authorization" as rationale                 | T1 — D1.3 requires limb two overturn the primary test  | 1   |
| Integrity-of-a-check + enumeration | 3   | yes | keep the enumeration and the prohibition; cut "structural, not topical"                         | T1 — the enumeration already does that work            | 0   |
| Self-attestation                   | 5→4 | yes | keep both example triplets; compress the framing sentence only                                  | T1 + **D5.1 quiet-failing** — never-cut class          | 1   |
| Invariant / holder / capability    | 6→4 | yes | **amended, not compressed** — see below; two blocks merged into one                             | T1                                                     | 2   |
| Discharging a default              | 4→3 | yes | keep the protocol; cut the escape-hatch framing and "disclosure, not obstruction"               | T1 — "and proceed" already carries the non-obstruction | 1   |
| Whose call — resolution rule       | 5→3 | yes | keep the role × surface read; cut the solo-collapse concession and distributed-roles gloss      | T1 — cross-owner case; see below                       | 2   |
| Whose call — holder ¶              | 5→0 | yes | relocated into the invariant block                                                              | —                                                      | 5   |

**Nothing demoted, and that is the finding.** Every block carrying a rule returned `constraint → stays`. The 15 nb
removed was justification for rules that stayed, plus one clause stating the same rule twice — content with no
demotion destination, because nothing summons a rationale. What earns keeping went to the anchoring ADR.

**The reaffirmation clause was amended.** As authored it said an invariant is not discharged "by a host harness's
rule that operator reaffirmation is decisive" — asserting that the operator's instruction is overridden, which is
not this model and overstates the harness rule it names. Corrected: an invariant withholds the authority to
**decide**, never the capability to act; the holder making the reserved decision is the rule working, not a waiver.
What reaffirmation cannot do is move that decision to the agent.

**Amended after an independent read (2026-07-28).** A fresh-context adversarial pass over the landed section
returned nineteen findings; verification against source confirmed eleven, downgraded one, and rejected four. Seven
changes landed, taking the section from 31 nb to **36**. Three were defects this pass introduced and the earlier
one missed:

- `Marked or not, the reading below classifies it` contradicted the section's own next heading, the file header,
  and `adr-030` — three surfaces scope the reading to unmarked rules and the always-loaded one did not. Under the
  broad reading a marked rule is re-classifiable, and the design concedes the satisfaction test wrongly releases
  `--no-verify`. Cut.
- § Whose call was **compressed below the point where it constrains anything**. It states who _may_ discharge and
  never told the agent what to do when that is not them — and this register kept the block specifically on the
  cross-owner case it then failed to reach. One clause restored: _where the resolved holder is not you, propose
  rather than discharge._
- `An agent is never the judge of whether the check on its own output applies` over-fired on two of the three
  recorded live failures, and contradicted § Quality gate failure's deterministic-same-concern branch — a rule
  already in the file granting exactly the discharge the backstop forbade. Scoped to applicability; reading what a
  check reported, including that it produced no result, is now explicitly not that judgment. D5.1 permits this
  ("correcting a rule's scope is not weakening it") and forbids the cut the reviewer offered as an alternative.

The largest change was a **domain extension, not a correction**: every operative clause was rule-indexed, so an act
no rule covers fell outside the section entirely. Success Criterion 1's reserved falsifier is exactly that shape —
verified, since no propose-versus-self-add rule ships anywhere in the package tree. The section's own
self-attestation block was the tell: act-shaped, and hand-written under a claim of derivation the text could not
support. `Both limbs reach acts, not only rules` closes it, and makes the falsifier run.

`dischargeable` was defined in the brief and used nowhere; the term it was defined _in terms of_ — `ignorance-guard`
— was defined nowhere in the always-loaded set at all. The reading's first bullet now uses the word, and the brief
entry no longer depends on an undefined one.

**Why § Whose call did not demote.** The register predicted `demote → strategy-team-coordination`, and the holder
half relocating removed the argument that had protected it. It stays on T1 anyway: `Owner` is per-WU, so a
maintainer-role agent can work a WU owned by someone else, and an agent about to discharge a default over a surface
it does not own would not know to go looking. `AGENT-BRIEF.CONTRIBUTOR` covers only the contributor arm — a real
destination, as § Contributor commit release shows, but not this one.

### `DEV-RULES.PROJECT` — 348 raw / 267 nonblank lines

| Section                           | nb | C?    | Disposition                                                                                                                                                                                                   | Destination / mechanism                                                       | Tier      | Δnb |
| --------------------------------- | -- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------- | --- |
| Preamble                          | 6  | no    | keep                                                                                                                                                                                                          | —                                                                             | stays     | 0   |
| Contents                          | 11 | no    | cut                                                                                                                                                                                                           | as above                                                                      | firm      | 11  |
| Quality Gates — preamble          | 4  | yes   | keep — zero tolerance                                                                                                                                                                                         | —                                                                             | stays     | 1   |
| Selecting what to run             | 24 | yes   | **keep unchanged — the exemplar**                                                                                                                                                                             | cite as the target shape; change nothing                                      | stays     | 0   |
| The six numbered gate entries     | 37 | mixed | demote the commands behind a one-line retarget of the `quality-gate-commands` passthrough; keep the four constraints `QUICK-REFERENCE` does not carry                                                         | mechanism 1 fires once retargeted                                             | firm      | 30  |
| Testing Requirements              | 10 | mixed | keep the coverage posture; demote the tier and method elaboration                                                                                                                                             | `test-first` / `testing-standards` declarations — fire                        | firm      | 6   |
| Code Quality Principles           | 19 | mixed | cut DRY / SOLID / KISS; **keep YAGNI**, reframed as scope discipline; the TypeScript standards and the pre-public-release posture stay; reseat or rename the heading                                          | register cut 1 — see § Base drift                                             | decided   | 3   |
| Markdown quality                  | 8  | mixed | keep line length and the underfill note; cut the always-run-lint duplication                                                                                                                                  | —                                                                             | firm      | 2   |
| Documentation style               | 12 | yes   | keep the collaborative voice and the reference-link convention; compress the examples                                                                                                                         | —                                                                             | authoring | 4   |
| Workflow prose economy            | 7  | mixed | demote, keeping a one-line obligation                                                                                                                                                                         | `strategy-workflow-authoring` — passive index entry                           | trigger   | 5   |
| Verbs over mechanics              | 5  | mixed | keep the verb-gap capture instruction; demote the rationale                                                                                                                                                   | `strategy-workflow-authoring` — same entry                                    | trigger   | 3   |
| Commit Conventions (self-hosting) | 12 | yes   | keep the scope rule; compress the rationale                                                                                                                                                                   | —                                                                             | authoring | 4   |
| Package-Project Sync              | 24 | mixed | keep the two-copy direction constraint and the npm-spike hazard; demote the hook explanation and the skill-drift hazard                                                                                       | `strategy-package-project-sync` — passive index entry                         | trigger   | 10  |
| Audience Boundaries — preamble    | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Surface taxonomy                  | 19 | yes   | **keep verbatim** — the path lists are the operative content, not prose around it; compressing them trades a quiet-failing rule's precision for 5 nb                                                          | retracted from a 5 nb compression                                             | stays     | 0   |
| Leak patterns                     | 12 | yes   | keep — quiet-failing constraints                                                                                                                                                                              | —                                                                             | stays     | 2   |
| Package-source mirror inheritance | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Relationship to DEV-RULES.ARC     | 8  | no    | cut to a one-line "both apply" — pure cross-reference reconciliation                                                                                                                                          | —                                                                             | firm      | 5   |
| Capture Routing                   | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Surface agent-side friction       | 14 | yes   | keep the standing instruction; compress the two trigger-class definitions                                                                                                                                     | —                                                                             | authoring | 6   |
| Architecture Decision Records     | 12 | mixed | compress the 3 nb pointer in place; relocate the 8 nb internal-only leak rule into § Audience Boundaries (within-file, not a demotion) — the criteria this row once proposed demoting are not in the instance | none — nothing demotes; `strategy-adr-methodology` is no longer a destination | authoring | 3   |

### Totals

| File                                                 | firm   | decided | authoring | trigger | blocked | residue | Total Δnb |
| ---------------------------------------------------- | ------ | ------- | --------- | ------- | ------- | ------- | --------- |
| `DEV-RULES.ARC` (canonical — ships)                  | 44     | 9       | 19        | 47      | 15      | 8       | 142       |
| `DEV-RULES.PROJECT` (instance — template mirrors it) | 54     | 3       | 17        | 18      | 0       | 6       | 98        |
| **Both**                                             | **98** | **12**  | **36**    | **65**  | **15**  | **14**  | **240**   |

Canonical `firm` and the totals carry Task 3.1's re-measurement (§ Contents 11 → 12); see § Execution
re-measurement against base. Canonical `decided` carries Task 3.3's correction — § Task granularity's Δ5 was
arithmetically impossible against its own disposition (the section is 6 nb, and keeping the heading plus the two
qualitative bullets leaves 4), so the row is Δ2. Instance `firm` carries Task 5.1's — the six numbered gate entries
are 37 nb rather than 35, so Δ28 → 30 at the row's own residual; see § Instance re-measurement against base.

Down from the pre-audit 318, then 261, then 246 after the two adversarial passes' corrections below, then 247 at
Task 3.1's re-measurement, 244 at Task 3.3's, 246 at Task 5.1's, and 240 once Task 5.3 measured what its six rows
actually removed. The `P3` tier carries no Δ — its one row (Prefix mapping) was withdrawn rather than deferred. The
`trigger` tier is what D6 gates, and it is now 65 nb across **seven** index entries.

**`firm` + `decided` is what may be authored against today: 110 nb**, of which 53 is canonical `DEV-RULES.ARC`
and 57 is the instance file. Every correction before Task 3.1 landed in the `trigger`, `authoring`, and `blocked`
tiers; execution is the first to touch `firm` and `decided` — Task 3.1 added 1 to the former, Task 3.3 removed 3
from the latter, Task 5.1 added 2 to the former, and Task 5.3 removed 2 from `firm` and 4 from `decided` against
measured outcomes. The instance share across the whole register is 98 / 240 ≈ **41%**.

### Execution re-measurement against base (Task 3.1)

Re-derived mechanically per heading, with the trailing link block excluded by construction — scanning stops at the
final `---` whose remainder is nothing but link definitions. Baseline is `7fd6e34e1^`, the commit before
§ Rule Authority entered the file.

**The row-level enumeration holds.** Thirty-two of the thirty-three canonical rows reproduce their recorded `nb`
exactly against a mechanical count. The enumeration was measured by hand and survives an independent derivation;
its dispositions execute as written.

**One row drifted, and it is the register's own doing.** § Contents is **12 nb, not 11** — § Rule Authority added
a table-of-contents line. It is a `firm`-tier cut, so `ARC` firm goes 43 → 44 and the canonical register total
144 → **145**. No disposition changes.

**The denominator carried the trailing-link-block error, a fourth instance.** The register records
`DEV-RULES.ARC` as 418 nonblank, which is the **full-file** count — 398 of content plus a 20-line trailing link
block. D7.5 and D7.6 caught this error per-row and drew the lesson explicitly ("a mechanical per-heading count
must exclude the trailing link block by construction"), but the file total was never re-derived under the rule.
Corrected: the canonical register is **145 nb of 398**, and `DEV-RULES.PROJECT` is **102 nb of 255**, not of 267.
The register's share of each file is therefore larger than recorded — 36% canonical rather than 34% — which
strengthens the compression case rather than weakening it.

**§ Rule Authority costs more than the ledger carries.** In-file it measures **37 nb** against a recorded 31. Five
of the difference is real growth: `007a6180b` closed the gaps an independent read found, and the act-scoped
backstop clause is the largest of them. The remaining ~1 nb is a measurement-boundary difference — the recorded 31
measured the authored text, this count includes the section's trailing `---` separator. Either way the D1 debit is
understated by 5–6 nb and the ledger owes the correction.

**The index leg overran its model.** `STRATEGY-INDEX` (instance) went 62 → **77 nb** across Phase 2, against D6's
modeled `+7 to +14`. Two causes, both structural rather than accidental: the new
`strategy-interlock-release-wrappers` entry has no line to replace, and a residual-scoped condition is
unavoidably longer than a bare directive because it names both the residual question **and** the surface holding
the common case. The scoping is what makes the entry worth its slot, so the overrun is the right trade — but it is
a real debit against Criterion 3's net measurement and is recorded as such, not absorbed. Measured against the
planning-era baseline of 61 the delta is +16; the maintenance errand that collapsed restating descriptions was
itself net +1, so almost the whole movement is this work unit's.

**Ledger position — measure the set, do not sum the deltas.** Criterion 3 measures the tier-1 full-read set, so
the ledger is that set measured end to end, never a running total of per-row Δs. Summing deltas understated the
debit twice during execution: it tracked `DEV-RULES.ARC` from its post-§ Rule Authority peak rather than from
base, so paying back the section's own cost read as credit, and it omitted `AGENT-BRIEF.ARC` entirely, where D4's
vocabulary definitions had already landed.

Measured against `7fd6e34e1^` (content-only, trailing link blocks excluded):

| Tier-1 surface        | base    | now     | Δ       |
| --------------------- | ------- | ------- | ------- |
| `DEV-RULES.ARC`       | 398     | 394     | −4      |
| `DEV-RULES.PROJECT`   | 255     | 255     | 0       |
| `STRATEGY-INDEX`      | 61      | 77      | +16     |
| `AGENT-BRIEF.ARC`     | 84      | 95      | +11     |
| `AGENT-BRIEF.PROJECT` | 29      | 29      | 0       |
| **Total**             | **827** | **850** | **+23** |

**The set is +23 nb through Task 3.4** — the constitutional half has spent and the compression has not yet been
collected. Against it: the `authoring` tier (19), the D6-gated `trigger` tier (47), and Phase 5's instance
register (102). The canonical file has already returned below its own baseline while carrying a 37 nb addition,
which is the leg that was in doubt. Re-measure this table at each phase close rather than carrying a running
figure forward.

### Instance re-measurement against base (Task 5.1)

Re-derived mechanically per heading under Task 3.1's convention — scanning stops at the next heading or at the final
`---` whose remainder is only link definitions, so the trailing link block is excluded by construction. Baseline is
`origin/main`. The two base commits this branch has not merged (`bb6803b62`, `52693a754`) touch neither copy of
`DEV-RULES.PROJECT` nor any other tier-1 surface, so `origin/main` and the merge-base agree on every file measured
here and the pending merge cannot move a figure below.

**Eighteen of the twenty-one instance rows reproduce their recorded `nb` exactly**, and the file's content total
re-derives at **255** — Task 3.1's corrected denominator, now confirmed by an independent count. Three rows moved,
none of them because base moved.

**§ Preamble is 6 nb, not 7.** It measures 6 at the planning baseline, at `origin/main`, and now, so this is a
hand-count error rather than drift. A `keep` / Δ0 row, so no disposition changes.

**§ Quality Gates' internal split was drawn two lines late.** The heading span is 61 nb and has been stable at every
ref measured; the register divided it 26 / 35 where the mechanical boundary — the first numbered entry — divides it
**24 / 37**. Content did not move; the boundary did. That leaves the one row whose Δ changes: the six numbered gate
entries are 37 nb, and the recorded Δ28 implied a 7 nb residual (the retarget line plus the four constraints
`QUICK-REFERENCE` does not carry), so at that residual the row is **Δ30**. The residual itself was never measured —
Task 5.3.b settles it against `QUICK-REFERENCE` § Quality Gate Commands and fixes the Δ against what actually stays.

**Two `##` headings carry no register row** — § Documentation Standards and § Architecture Documentation, 1 nb each,
both pure containers over `###` rows the register does enumerate. With the § Preamble correction this closes the
file's arithmetic exactly: 254 recorded − 1 + 2 = 255. The register's coverage is complete; nothing is unclassified.

Register consequences: instance `firm` 54 → **56**, instance total 102 → **104**, both files 244 → **246**, and
`firm` + `decided` 114 → **116**, of which the instance carries 63. Against Task 3.1's corrected denominator the
instance register is **104 nb of 255 ≈ 41%** of the file; the tables' `267` headings remain the planning-era record,
per the record-the-correction rather than rewrite-the-header call Task 3.1 made for the canonical `418`.

### The template's mirrored subset, measured (Task 5.1)

Correction #2 below established that several rows reach the template and named five sites. This is the full
enumeration behind that claim, with each site measured. The shipped template is
`packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md` — 118 content nb across twelve sections.
`template-dev-rules.md` is not a second copy of it: that scaffold is for domain files and excludes both reserved
filenames by name.

**Twelve of the twenty-one rows have no template heading at all** — everything from § Workflow prose economy through
§ Surface agent-side friction, plus § Selecting what to run, the row the register holds up as the exemplar. Of the
nine sharing a heading, the mirror rule turns on whether the template carries the **row's target**, not the heading:

| Register row                  | Template `nb` | Carries the row's target?                                       | Mirrored edit surface        |
| ----------------------------- | ------------- | --------------------------------------------------------------- | ---------------------------- |
| Preamble                      | 14            | n/a — the row is `keep`                                         | none                         |
| Contents                      | 9             | yes — same block, same argument                                 | 9 nb, cut whole              |
| Quality Gates — preamble      | 5             | partly — the zero-tolerance line is verbatim; see below         | none — the row is `keep`     |
| The six numbered gate entries | 20            | yes — four placeholder gates plus two authoring comments        | 13 nb, leaving 7             |
| Testing Requirements          | 10            | no — placeholders only; no tier or method elaboration to demote | none                         |
| Code Quality Principles       | 11            | yes — DRY / SOLID / KISS / YAGNI verbatim                       | 6 nb                         |
| Markdown quality              | 8             | partly — the always-run-lint bullet is verbatim; see below      | 1 nb, plus a divergence      |
| Documentation style           | 12            | yes — **byte-identical to the instance**                        | 12 nb, Δ4 applies as written |
| Capture Routing               | 10            | n/a — the row is `keep`                                         | none                         |
| Architecture Decision Records | 17            | partly — the pointer, reworded; the leak rule is instance-only  | the pointer                  |

**Five rows carry real template edit surface** — § Contents, the gate entries, § Code Quality Principles,
§ Markdown quality, and § Documentation style — 41 nb of the template's 118 touched. None of it is register lines:
the register measures the instance, and the template edit rides the same increment.

**§ Documentation style is byte-identical across the copies**, which makes it the one row whose disposition needs no
re-derivation for the template — the Δ4 compression applies to the same twelve lines twice.

**The mirror is not a one-way subset.** The template carries § File Organization (5 nb) and the ADR write-when /
don't-write-for criteria (10 nb) that the instance does not — content no register row classifies, so the mirror rule
reaches none of it. Whether this phase touches template-only content is a call for the phase's close, not something
a row settles.

**Two shared sections hold longer text in the template than in the instance, and they are different cases.**
§ Markdown quality's line-length rule is the same framework-general rule in both copies, and the template holds the
pre-compression five-line form against the instance's three — so mirroring that row means first propagating a
compression that never synced, not applying this work unit's. § Quality Gates' tiered paragraph diverges for a
legitimate reason instead: the instance's version names its own strategy pointer and `QUICK-REFERENCE`, which is
project-specific content the Configurable contract puts in the instance by design, and `046272788` correctly edited
the instance and `QUICK-REFERENCE` while leaving the template alone. Sharing a heading settles neither question.

### Ledger position at Phase 5's open (Task 5.1)

Re-measured end to end against `origin/main` rather than carried forward. The base column moved too:
`STRATEGY-INDEX` is 62 at the current base, not the 61 the Task 3.4 table used, so the index leg is +15 rather than
+16 — the maintenance errand's own +1 belongs to base, not to this work unit.

| Tier-1 surface        | base    | now     | Δ       |
| --------------------- | ------- | ------- | ------- |
| `DEV-RULES.ARC`       | 398     | 349     | −49     |
| `DEV-RULES.PROJECT`   | 255     | 255     | 0       |
| `STRATEGY-INDEX`      | 62      | 77      | +15     |
| `AGENT-BRIEF.ARC`     | 84      | 95      | +11     |
| `AGENT-BRIEF.PROJECT` | 29      | 29      | 0       |
| **Total**             | **828** | **805** | **−23** |

**The set is −23 nb, a 46 nb swing from the +23 recorded through Task 3.4.** The canonical file returned 45 nb
beyond where that measurement caught it, while carrying a § Rule Authority that has itself grown to 41 nb. Criterion
3's net is already negative before Phase 5's instance register (104) touches anything, which retires the doubt the
Task 3.1 table was recording — the constitutional half's cost is paid, and the instance register is now surplus
rather than the leg the criterion depends on.

### The quality-gate retarget's fire sites (Task 5.2)

The method's `.default` now names `QUICK-REFERENCE` § Quality Gate Commands. The destination heading exists in both
copies — populated in the instance, a placeholder with the tier subsections in `QUICK-REFERENCE.template.md` — so the
pointer resolves on either side, lateral in the shipped copy exactly as the task predicted. `[dev-rules-project]`
lost its only consumer in the method and was pruned in both copies; `[quick-ref]` replaces it.

**The declaring surface is two files, one per copy** — `process-task-loop` and its `.template` counterpart, each
marking the method at the same three points and resolving `[arc-methods-qg]` to its own tree's method. Both verified
by hand, since nothing validates fire-point marking. The `post-task-quality` / `post-unit-quality` extensions name
Tier 1 and Tier 2 but declare no method and resolve no pointer, so they were out of scope by construction rather
than by omission.

**The package-source link is dangling in the package tree by convention, not by mistake.** `[quick-ref]` names the
post-install `reference/QUICK-REFERENCE.md`, and the package tree carries only `QUICK-REFERENCE.template.md`.
`02_define-project.template.md` and `clean-work-unit.md` already reference the same target the same way, so the form
is the established idiom for a template-paired destination and the link is correct where it is read.

**One deviation from the task's plan.** The template comment the task expected to survive unchanged —
"Commands here should match `QUICK-REFERENCE` § Quality Gate Commands" — is not left true by the retarget so much as
left vacuous: with the listing gone it names content that no longer exists, and still reads as an instruction to
record commands in that section. Reworded to send the author to `QUICK-REFERENCE` instead of matching against it,
which keeps the task's intent that this is the one comment that stays. Template § Quality Gates lands at 7 nb from
20, matching Task 5.1's measured surface exactly.

**Two gate-running workflows had no path to the commands, and the demotion made it load-bearing.**
`verify-work-unit` § Step 1 runs the full suite against the Quality Gates Strategy — the tier model — and
`integrate-work-unit` runs gates at six points; neither declared the method. The commands were reachable only because
they sat in an always-loaded file the agent already held, which is implicit awareness rather than a trigger. Task
5.3.b empties exactly that listing, so after it the whole integration lane reaches tier definitions and no commands.

Measured against `analysis-load-set-scoping` § The demotion precondition, that is **unsafe**, not merely pointless:
clause (a) needs a correctly-scoped trigger in a document loaded at the position, clause (b) fails because these
workflows run the gates, and unsafe is the never-demote verdict. Declaring the method at each is therefore the
precondition that legitimizes 5.3.b rather than an improvement alongside it — it also moves the read from the
60–75% implicit-awareness band into the 85–95% explicit-trigger band the same document measures.

**The declaration is forward-compatible with the settled gate-model reshape, which was checked before wiring.**
`draft-quality-gate-hooks.md` § Alternatives retired Tier 1/2/3 (settled 2026-07-25) for **gate** (deadline) ×
**kind** (feedback versus enforcement), and its sweep list already names both workflows. Three things make the
declaration compose with it rather than add to its churn: the method survives as the single dispatch home — the
current lean extends `quality-gate-commands` with per-command stage metadata rather than splitting it; the `kind`
axis is literally "workflow fire sites versus hook/CI gates," so a gate-running workflow declaring the commands
method is the feedback half of the target vocabulary; and the fire-point markers were authored **tier-numeral-free**,
following the precedent that `DEV-RULES.PROJECT` § Selecting what to run was "deliberately written vocabulary-neutral
so they would not churn through this rename." Both files carry exactly the tier-numeral count they carried at base —
2 and 5 — so the rename sweep sees the surface it already sized.

The residual risk is named rather than dismissed: that WU's consolidation criterion could retire workflow gate
invocations in favor of hook dispatch, stranding a declaration. Its own ordering constraint gates that on the
selection rule landing first and singles out these two sites as runs a pre-commit hook cannot dedupe, so the risk
points away from them. Waiting for that WU was rejected on schedule — it sits in the pre-1.0 polish window behind two
other work units, and the unsafe window opens at 5.3.b.

**One coordination obligation routed rather than absorbed.** That draft asks for the feedback/enforcement wording to
be coordinated with this work unit's ignorance-guard / bias-guard cut so the two do not mint separate vocabularies
for one cut. Captured to `USER-INBOX § Work Unit` against `quality-gate-hooks`; it is that WU's authoring call, not
an impl task here.

### The firm and decided tiers, executed (Task 5.3)

`DEV-RULES.PROJECT` goes **255 → 198 nb**, and the shipped template 105 → 91. Six rows landed; every disposition
executed as written and none was abandoned, but three Δs came in under their projection, so the tier totals are
measured rather than carried. Sum delivered **57 nb against a projected 63**.

| Row                             | `nb` → residual | Δ projected | Δ measured | Why it moved                              |
| ------------------------------- | --------------- | ----------- | ---------- | ----------------------------------------- |
| § Contents                      | 11 → 0          | 11          | 11         | —                                         |
| The six numbered gate entries   | 37 → 7          | 30          | 30         | matches, once the residual sits right     |
| § Testing Requirements          | 10 → 4          | 6           | 6          | —                                         |
| § Markdown quality              | 8 → 6           | 3           | 2          | only two lines restate the gate           |
| § Relationship to DEV-RULES.ARC | 8 → 3           | 6           | 5          | the section's structural `---` is in span |
| § Code Quality Principles       | 19 → 16         | 7           | 3          | Δ7 unreachable from its own disposition   |

**The § Code Quality Principles projection was arithmetically unreachable**, the same defect Task 3.3 found in
§ Task granularity. Its disposition removes the lead-in and three acronym bullets — 4 nb — and the YAGNI reframe
costs 2 back, so Δ3 is the outcome and Δ4 the ceiling even with a one-line reframe. Nothing was dropped to reach the
projection, which is the correct call: the row's content verdict was sound and only its arithmetic was wrong.

**§ Markdown quality's "always-run-lint duplication" is two lines, not three.** Both the zero-tolerance restatement
and the run-the-linter line restate § Quality Gates; the template-first and READMEs bullets are conventions stated
nowhere else and stayed. Δ2.

**The gate-entry residual settles at 7 nb** — the figure Task 5.1 deferred here, and it lands on the projection only
because the residual was **placed** correctly. The four kept constraints compress to three bullets, the
index-versus-worktree trap merging with re-stage-after-fix since one is the consequence of the other. The first
attempt left that block where the numbered entries had sat, which put gate behaviors inside § Selecting what to run —
a subsection about which checks a change reaches, not about how a check misleads — and carried its own duplicate
pointer to the destination. Reseating it under § Quality Gates beside the zero-tolerance rule cost a line and gained
one: the existing preamble pointer absorbed the reference, and **§ Selecting what to run came back byte-identical to
base**, which its `keep unchanged — the exemplar` disposition requires and the first placement had quietly violated.

**§ Relationship to DEV-RULES.ARC cannot reach 2 nb.** It closes a `##` block, so its span includes the structural
`---`, leaving heading + `---` + one line as the floor. The one-line form was authored to that floor: Δ5.

**The heading rename is `## Engineering Standards`, and it was authored rather than inherited.** No prior artifact
settled a name; the spec fixed only the requirement (describe what remains — the compatibility posture plus the
TypeScript standards — rather than reseating the posture into § Package-Project Sync). The retired § Contents entry
had glossed the section as "engineering standards", which is evidence the maintainer already read it that way.
Per the row, the rename is **instance-only**: the template's section holds the reframed rule, a composition line, and
language-agnostic placeholders, which an instance-derived heading would misdescribe.

**The sweep found nothing to sweep.** No live inbound `§ Code Quality Principles` citation exists outside this work
unit's own planning artifacts — the only other references were the two § Contents entries this task cut anyway — and
nothing in the corpus anchors into `DEV-RULES.PROJECT.md#`. § Testing Requirements orphaned exactly the three link
definitions the phase preamble predicted, all three pruned; both copies now carry zero orphans.

**The demotion destination was checked for install reachability before anything was written into it.**
`testing-standards` is absent from **both** `manifest.json` and `init-recipe.json`, so no project receives it — the
hazard that deletes content rather than relocating it. It does not bite here: the demoted lines describe _this
repository's_ test layout, so the destination only has to exist in this instance, and it does. What the row moved is
instance content into an instance file, not framework content into a file that never ships. The absence is the
pre-existing recipe defect already recorded as correction 11b, not something this row deepened.

### The authoring tier, compressed in place (Task 5.4)

`DEV-RULES.PROJECT` goes **198 → 184 nb**, and the shipped template 91 → 87. No constraint left the file: every row
here is a rewrite in place, and the one relocation stayed inside it. Four rows landed against a projected 17;
**delivered 14**.

| Row                             | `nb` → residual | Δ projected | Δ measured | Why it moved                              |
| ------------------------------- | --------------- | ----------- | ---------- | ----------------------------------------- |
| § Documentation style           | 12 → 8          | 4           | 4          | — (template identical, Δ4 applies twice)  |
| § Commit Conventions            | 12 → 9          | 4           | 3          | the scope examples are the rule's content |
| § Surface agent-side friction   | 14 → 10         | 6           | 4          | Δ6 implies a 1 nb two-class definition    |
| § Architecture Decision Records | 12 → 3 + 6      | 3           | 3          | reached only because the move compressed  |

**The two shortfalls are the same shape as Task 5.3's, and both are projection arithmetic rather than a withheld
cut.** § Commit Conventions' rationale compresses freely, but what remains is a locus rule whose worked examples
_are_ its content — the seven scope examples demonstrate "narrowest descriptive locus" in a way no restatement
does, and cutting them to reach Δ4 would trade the rule's operability for a line. § Surface agent-side friction's
Δ6 requires the two trigger-class definitions to collapse from 7 nb to 1; both classes carry a floor (systemic or
likely-recurring; observable cost, never aesthetic preference, never before engaging recorded rationale), and
stating both floors takes three lines. The classes did compress 7 → 3, which is the disposition executed.

**§ Architecture Decision Records hit its projection only because the relocation compressed too.** Δ3 against a
3 nb pointer and an 8 nb rule that moves rather than leaves is unreachable if the move is verbatim — 12 → 2 + 8 is
Δ2 at best, and the pointer floors at 2. The rule's first two lines were the slack: "ADRs are internal-only" and
"they live in `.arc/reference/adr/`" are already carried by § Surface taxonomy's path list and by the retained
pointer, so the relocated form states the referencing constraint alone and lands at 6.

**Where the moved rule belongs was decided by the destination's scope, not by proximity.** It became a new
`### Referencing across the boundary` between § Leak patterns and § Package-source mirror inheritance. § Surface
taxonomy is `keep verbatim` and § Leak patterns enumerates prose patterns to avoid in adopter-facing content — a
referencing constraint is not a prose pattern, so appending it there would have widened that heading's scope the
way Task 5.3's first placement widened § Selecting what to run. Both neighbours were re-verified byte-identical to
base afterward, along with § Selecting what to run itself. The generalization the new heading forces is faithful:
ADRs were always one internal-only surface among several, and `strategies/project/` was already named in the rule.

**The sweep found nothing to sweep, again.** No live inbound `§ Architecture Decision Records` citation exists
outside this work unit's own planning artifacts, and no link-reference definition lost its last consumer — all
eight in the instance file still resolve to at least one use.

### Corrections from the create-spec adversarial pass (2026-07-28)

Three findings against the register, all confirmed at source. Two share a root cause the register should hold
onto: **dispositions drifted between the instance file and the package template**, which are not the same
document.

1. **§ Architecture Decision Records was measured at 24 nb and is 12.** The extra 12 is the file's trailing `---`
   plus 11 link definitions — the identical trailing-link-block error this record already caught and corrected for
   § When to Load Additional Guidance (24 raw / 17 nb, not 43). Catching it once did not generalize it. Worse than
   the number: the row proposed demoting "the decision criteria," which the **instance does not contain** — it
   carries only a pointer ("See ADR Methodology Strategy — decision criteria, three-tier stability model,
   amendment vs. supersession"). The criteria live in the package template at lines 152–165. So the row needs its
   disposition re-derived, not merely its count corrected. Cascade: `PROJECT` trigger 34 → ~21, register 261 →
   ~248, the trigger tier 81 → ~68.

2. **The template is not a blank fill-in, and several rows reach it.** Verified in
   `packages/arc-framework/arc/system/rules/DEV-RULES.PROJECT.md`: DRY / SOLID / KISS / YAGNI (82–85),
   "Always run markdown linting after updating documentation files" (99), a § Contents block (21),
   § Documentation style (106–119), and the ADR write / don't-write criteria (152–165). The draft's
   instance-only framing generalized a narrower true fact (its § Quality Gates carries none of this repo's
   numbered entries) into a claim about the whole half. Where the template carries a row's target, the row's
   disposition applies there too and the increment stages both.

3. **The trigger tier's index-entry list was one short.** § Task interlock's team elaboration (4 nb) routes to
   `strategy-team-coordination`, which carries a passive `Consult when:` line and was missing from the seven. The
   set is eight, and it is closed by construction: it is exactly the `strategy-*` destinations the `trigger` rows
   name.

### Corrections from the create-spec adversarial pass two (2026-07-28)

Six more, all confirmed at source. Three are false claims about repository **mechanisms** rather than about
content — a class pass one did not probe at all.

4. **§ Architecture Decision Records re-derived, and it changes D6's set.** The row is `authoring`, not
   `trigger`: compress the 3 nb pointer in place and relocate the 8 nb leak rule within the file. Nothing
   demotes, so `strategy-adr-methodology` — which this row was the **only** register row to name — stops being a
   destination and leaves the index-rewrite set. Net: 3 nb moves `trigger` → `authoring` (register total
   unchanged), and D6 gates 65 nb across seven entries. The lesson is that a "closed by construction" set cannot
   rest on a row flagged as unsettled; re-deriving the row was cheaper than shipping the closure claim.

5. **§ When to Load Additional Guidance is 15 nb, not 17** (lines 527–549; 550 is the `---`). Third instance of
   the trailing-link-block error, after § Architecture Decision Records and the original § When to Load
   correction. Catching it twice did not generalize it either. **A per-heading count must exclude the trailing
   link block by construction.** `ARC` 146 → 144, register 248 → 246; `blocked` disposition unchanged.

6. **`lint:arc:section-refs` does not do what its name suggests.** It refuses the `§` glyph inside `src/` and
   `__tests__/` TypeScript — the no-meta-project-references-in-code rule — and never resolves a Markdown `§`
   citation against a heading. Nothing in the repository validates an inbound `§` citation, and the pre-commit
   link check skips anchor-only links. Since the register moves, renames, and empties cited headings across ~45
   live citation sites in both copies, the sweep is a **hand** obligation per task. Recorded as a verb gap.

7. **The package-counterpart hook does not fire for the Configurable half.** `check-package-sync.sh` warns on a
   missing counterpart only for `Framework`; its `Configurable` arm implements the blind-`cp` error alone. Per
   `.arc/system/.internal/manifest.json`: `DEV-RULES.PROJECT` and `STRATEGY-INDEX` are **Configurable**, while
   `DEV-RULES.ARC` and all seven `strategies/arc/*` destinations are **Framework**. So exactly the two surfaces
   where template drift was newly recognized have no mechanical backstop.

8. **The shipped `STRATEGY-INDEX` copy was never in D6's scope.** Its `## ARC Framework Strategies` block is
   identical across copies and carries six of the seven passive entries. Rewriting the instance alone would ship
   projects a shortened rules file whose demoted content lands in Framework strategies reachable only through the
   60–75% line — P10 violated for every project, the same instance-versus-shipped asymmetry pass one found in D8.
   The package copy's maintenance footer ("add a 'Consult when:' sub-item") also instructs future authors to
   restore the form D6 removes, and must change with it.

9. **D7.2 asserted a demotion its own row rejects.** "The procedure moves to `integrate-work-unit`" was inherited
   from the draft, written before the constraint-column pass disqualified that destination under P3. The row is
   `keep whole`, Δ0; the reseat is a within-file relocation.

### Correction from task generation (2026-07-28)

10. **D1's corpus enumeration omitted extensions.** § Rule Authority's authored text named "a method, a workflow,
    a strategy" and D9.1 inherited that as the sweep's scope, but `.arc/system/extensions/` holds **13**
    rule-carrying documents (excluding the directory `README.md`) that match none of those nouns. Since D1 states
    a presumption over _every_ unmarked rule while D9 checks its blast radius against a corpus defined by that same
    enumeration, the omission would have left the sweep structurally unable to reach a region the presumption
    governs — the exact failure Success Criterion 2's "a sweep narrower than the presumption" clause names. Fixed
    in place across all four loci (D1's section text, Goal 1, D9.1, and Criterion 2's governed-surface arm); D9.2
    gains extensions as its last sweep rank.

    **The density signal is the interesting half.** Extensions carry **zero** `never` / `must not` lines against
    the methods' 63 and the workflows' 169 (re-measured at this stage; the spec's recorded 138 / 68 figures are
    from an earlier base and were left as-is under the re-derive-at-execution rule). That makes them the lowest
    expected yield in the sweep — and the reason to sweep them anyway, since a rule-free surface and an unread one
    leave identical evidence.

### Corrections from the generate-tasks adversarial pass (2026-07-28)

11. **Three `strategies/arc/*` demotion destinations never install.** `packages/arc-framework/init-recipe.json`
    is the sole authority on the installed set — `resolveFileList` builds it from `include_files` plus the
    condition blocks (`init.ts:144`, `update.ts:344`), with no bulk copy of the package tree. Its eight
    unconditional `strategies/arc/*` entries omit `strategy-interlock-release-wrappers`,
    `strategy-workflow-authoring`, and `strategy-concurrent-work`; `strategy-team-coordination` is gated on
    `team.mode == true`. Byte-identity across the two copies — which earlier passes checked — establishes only
    that a file is mirrored, never that it installs.

    The shipped `STRATEGY-INDEX` already lists two never-installing files, so the index/recipe inconsistency
    predates this register. What the register would add is content loss: § Commit control's 17 nb leaving
    `DEV-RULES.ARC`, which reaches every project, for a file none of them receive. Recorded as an oversight in the
    recipe rather than a deliberate exclusion, and corrected in D6 — which also brings the three files under
    manifest classification, retiring the "no check at all" hazard the register had been routing around.

11b. **The install-reachability defect is not confined to strategies.** A second pass found `drain-inbox` —
    § Route by urgency's demotion destination — absent from the recipe on the same oversight, along with eight
    other workflows and three methods. `run-errand`, the row's co-destination, is present. The shipped
    `arc-housekeep` skill reaches projects through a separate generation path and points at `drain-inbox.md`, so
    it already dead-ends for every project independently of this register. D6's correction covers the four
    destinations this register demotes into; the rest is the hand-maintained recipe itself, which is the actual
    defect and is captured rather than swept here.

    Two mechanism corrections rode with it. The recipe and `manifest.json` are **separate** artifacts — the
    manifest is what the counterpart check and the byte-identity test read, so a recipe entry alone moves neither,
    and the entries are hand-added alongside per this repository's own precedent. And
    `system/methods/quality-gate-commands.md` is **Configurable**, not Framework: the byte-identity backstop D8.1's
    retarget appeared to inherit does not exist for it.

12. **§ Context quality lists three boundary categories, not four.** `Natural session boundaries` carries
    `Mode transitions`, `Structural boundaries`, and `Quality signals`. With the quality-signals bullet cut and
    the handoff-opportunity clause lifted out, two categories demote and the lead-in is left introducing nothing —
    the same orphaned-heading shape as § Code Quality Principles. The `11` in the row above is starred because
    its `4` component was derived against the miscount; the re-measure at execution settles it rather than a
    partial recount here.

13. **Four `DEV-RULES.ARC` sections the register rewrites are under test assertion.**
    `review-gate-workflows.test.ts` asserts byte-identity of the two copies plus three regexes over
    § Review-Increment Invariant ¶2; `pr-open-extensions.test.ts` asserts three phrases from § Review finding
    mutation guard plus a whole-file `not.toMatch(/GitHub|CodeRabbit|review-gate/iu)` that binds every line the
    new § Rule Authority adds. The hazard is not the red test but its repair: relaxing an unexplained prose
    assertion retires the invariant it was written to protect.

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

3. **The trigger tier is the single largest, and it is all one defect.** Every `strategy-*` destination in the
   register reaches its content through a passive `Consult when:` line — the 60–75% band in a trigger costume.
   Seven index entries need re-authoring to P2 strength before _any_ of that content may move:
   `strategy-work-organization`, `strategy-work-planning`, `strategy-session-operations`,
   `strategy-workflow-authoring`, `strategy-package-project-sync`, `strategy-team-coordination`, and a new entry
   for `strategy-interlock-release-wrappers`. That is a bounded, enumerable task, and it is the deliverable's
   critical path rather than an incidental prerequisite.
   _(This pass recorded ~82 nb across a different seven — it included `strategy-adr-methodology` and omitted
   `strategy-team-coordination`. Both memberships and the figure are superseded; see § Corrections items 3 and 4.
   Current: 65 nb across the seven above.)_

4. **The authorable tier is 116 nb, and 53% of it sits in the instance file.** Of that, 55 nb is canonical
   `DEV-RULES.ARC` and 61 nb is `DEV-RULES.PROJECT`. The canonical tier — what actually reaches every project on
   day one — is 55 nb. _(This pass read the instance file as a fill-in template no project inherits, and put the
   instance share at 115 / 261 ≈ 44%; both are superseded — see § Corrections, items 1 and 2. The template mirrors
   several register rows, and the share is now 102 / 246 ≈ 41%.)_

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

## Design rationale

Reasoning the spec depends on but does not restate. Task generation and execution reach for this when a
disposition needs its _why_.

### What model progress erodes

Model progress erodes **capability rules** and does nothing to **preference or authority rules**. This is the
reasoning underneath the spec's cut test, and the reason that test reads guard type as a proxy rather than as the
criterion.

- A _capability_ rule tells the agent how to be good at something — how to decompose, how to search before
  assuming, how many files is too many. Each is a bet against the model, and each release settles it further
  against the author.
- A _preference or authority_ rule says what the developer wants and who decides. "Merge requires explicit human
  authorization" is derivable from nothing in the codebase; it is a choice about where the human stands. No amount
  of capability touches it.

Published guidance points the same way. Anthropic's 2026 context-engineering note removes prescription, worked
examples ("giving examples actually constrains them"), and duplication, while explicitly preserving "particular
opinions, knowledge, or best practices that are particular to you, your team, or product" — this corpus's entire
content class.

**One asymmetry that guidance does not address, and it matters before anyone cites it as license to cut.** A
system prompt ships to every user and every task and cannot know the context, so it must be small. These rules are
per-project, authored by the person they bind, and revisable in a commit. "A universal prompt should be minimal"
does not generalize to "a project's rules should be minimal" — the system prompt is small because it is ignorant;
these exist because they are not.

### Gate versus granularity

The review-increment invariant bundles two claims that the register separates:

- **A gate exists** — every review increment closes with a structured approval gate before commit.
  Scope-invariant, true at leaf, phase, or WU width. Stays universal and unqualified.
- **The increment is one leaf** — a granularity setting, no longer the observed default. Becomes a named
  **floor**: the fallback when nothing wider is authorized, and the right setting for a tricky change or one the
  developer wants to stay close to.

§ Review-Increment Invariant is already scope-agnostic and needs no change. Frequency of use at the finest setting
is not evidence about the gate's necessity — under deferred review the gate fires at a wider boundary, which is
why `unit-scoped-review` must invent a break-out matrix and deviation ledger to keep it honest there. The
rephrasing is forward-compatible with that work unit's parametrization by construction, and does not do its work.

### Destination mechanism 3 — bounded by what ARC controls

An emitted remedy — the failing gate, hook, or CLI output naming its own fix — can only fire where **ARC owns the
output stream**. The live instance arrived during this work unit's own base reconcile: a `ROADMAP` merge conflict
is auto-remedied by the pre-commit githook, but `git merge` reports the conflict several steps earlier and says
nothing, so the operator stands at a conflict with no signal that doing nothing is correct. The worse failure is
available too — hand-resolving a regenerable projection produces a worse result than the regeneration. Where the
failing operation belongs to another tool, the remedy has to arrive from a surface ARC does own (`arc status`, the
session probe), which is a different mechanism. This bound is why gate-emission work left the deliverable.

### The two P6s

- **`knowledge-evolution` P6 — extract on fan-in, not aesthetics.** This is what authorizes the extraction at all:
  the fan-in is demonstrated, repeatedly, not anticipated. Eight independent enactments, three of them arriving
  unprompted during this work unit's own grooming.
- **`procedure-evolution` P6 — emitted text is precomposed CLI-side.** The `ROADMAP` precedent (pre-commit
  CHECK 17) is a shell `echo` in a hook, which is the pattern P6 argues against; a new emission belongs in the
  CLI's precomposed-text layer rather than a second hook-side template. Bounded, and it reinforces leaving
  gate-emission out of this deliverable.

### Why decisions landed where they did

The condensed resolution record, for the question task generation asks most often.

- **The problem is a propagation gap, not an invention** — six prior enactments identified, so the model is
  composed rather than invented. This is what holds `Class` at `Heavy` rather than `Novel`.
- **Face (c)'s idiom-divergence framing was withdrawn** in favor of an internal ADR-versus-rules inconsistency:
  `adr-029` already grants the authority the rules surface withholds. Raising it as a departure from industry
  idiom wasted a pass and would waste another.
- **The discriminator settled as satisfaction-test-primary plus a two-limb backstop**, after probing three
  candidate tests against the corpus. Satisfaction is primary because it forces the disclosure as a byproduct and
  fails safe on silence; the backstop exists because the satisfaction and standing tests both wrongly release
  `--no-verify`.
- **The ignorance arm gained a dischargeability qualifier** when a third shape surfaced: a rule guarding an
  ignorance the agent can never discharge behaves as an invariant. The satisfaction test's fall-through already
  reached that verdict, which is further evidence for satisfaction-primary.
- **Per-rule authority vocabulary was dropped** after a ~10-candidate probe returned no counterexample, on two
  findings: `policy` collapses into `invariant`, and the case that would justify `maintainer` resolves without a
  declaration. A third argument (that `procedure-evolution` P2 forbade the markup) was **withdrawn as an
  overread** — P2 prohibits control flow in agent-evaluated markup, not classification markers.
- **Cross-harness precedence moved out of the ADR into § Rule Authority's backstop.** Placing it in the ADR was
  placement by frequency, which `knowledge-evolution` P1 replaces with miss-cost.
- **`unit-scoped-review` is downstream, not an upstream constraint** — it has no settled model to constrain
  anything with, and its content is visibly a consumer. No `Depends On` edge in either direction.
- **The compression half was composed against prior art it had re-derived** — `analysis-load-set-scoping`'s
  two-clause demotion precondition and unsafe-versus-pointless split, and `loadset-composition`'s adherence bands
  and demote-only-to-an-explicit-trigger rule. Pass two's central correction.
- **Two procedural lessons the register produced**, both cases of a disposition made at too coarse a grain: the
  constraint determination must precede the destination, and the audience test must run at bullet granularity
  rather than per section.

---

## Corpus-wide classification sweep — the method region (Task 4.1)

Every method document read for imperatives the default-unless-marked reading reclassifies. **115 imperatives across
25 documents: 52 take a marker, 63 stand as accepted reclassifications.** Six documents carry no marker candidate at
all (`assess-cohort-fit`, `commit-footer`, `commit-format`, `session-state`, `spec-review`, `test-first`).

### The corpus, re-derived

25 documents, excluding the directory `README.md` index. The shipped and installed sets are the same 25 files here —
no method ships without an instance counterpart — but the two copies stand in two relationships, both re-derived by
comparing them rather than by filename:

- **22 byte-identical mirrors.** Classify from either copy; a marker syncs.
- **3 divergent pairs** — `adversarial-review` (table-pipe padding only), `frontline-review` (`active: false`
  shipped, `true` here), `testing-standards` (an `extend` override populated in the instance). None of the three
  diverges in text a marker would land in, so classifying from one copy settled both **this time**; the set moves, so
  re-derive it rather than carrying this membership into Task 4.2.

**Three of the 25 ship but install nowhere.** `assess-parallel-fit`, `branch-format`, and `testing-standards` are
absent from `init-recipe.json`, which is the sole authority on what a project receives. They are still in the corpus —
the source of truth states their rules, and the recipe drift is the defect — but **5 of the 8 region-local markers
below land in files no project currently has**, so the sweep's coverage claim and the presumption's live blast radius
are not the same set.

### Basis codes

Marker families — why the default reading fails:

| Code | Family                                                                               |
| ---- | ------------------------------------------------------------------------------------ |
| A    | Coverage and the clean result — a partial pass may not report as a complete one      |
| B    | Evaluator boundary — the reviewing context stays free of author belief               |
| C    | An agent-side pass is not evidence; nothing attests its own result                   |
| D    | Judgment stays with the primary; a finding is advisory until verified against source |
| E    | Approval or an explicit authorization precedes mutation                              |
| F    | Do not manufacture findings — a clean artifact is reported clean                     |
| G    | The offer is not skippable; the person decides                                       |
| H    | Discipline does not scale with `Class`                                               |
| I    | Never make a decision that commits someone else                                      |
| J    | A machine-read identifier is not the agent's to rename                               |
| K    | A record of realized work never softens                                              |
| L    | No item with a known home rests in a capture surface                                 |
| M    | A test that cannot fail is not a check                                               |

Accepting reasons — why the reclassification is safe:

| Code | Reason                                                                   |
| ---- | ------------------------------------------------------------------------ |
| 1    | The rule names its own discharging fact                                  |
| 2    | A mechanical check already catches the violation                         |
| 3    | Craft or technique — a wrong call costs quality, not evidence            |
| 4    | Definitional, schema, or eligibility statement rather than an obligation |
| 5    | A permission or a restraint on the tool, not a duty on the agent         |
| 6    | The discharge is already codified elsewhere in the corpus                |

### Per-document sweep

| Document                        | M  | A | Marker candidates (`[invariant]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Accepted reclassifications (the default stands)                                                                                                                                                                |
| ------------------------------- | -- | - | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adversarial-review`            | 10 | 5 | must-not-invent findings (F); primary holds judgment (D); reviewer never edits, disposes, or attests its own result (C, E); a verdict cannot read clean with a live `blocker` (A); every later pass is a full rubric re-run (A); no implementer self-verification and no `[x]` markings as evidence (B, C); neutral orientation, `prior-findings` omitted on pass one (B); the fire-point offer is never skippable (G); cap reached with live findings surfaces at the interlock (G); the convergence threshold does not vary by `Class` (H) | the identity contract is self-declared advisory (5); `pass-cap` is not serialized (3); merge by concatenation (3); partition-ability is not bisectability evidence (3); partitioning must not orphan seams (1) |
| `assess-cohort-fit`             | 0  | 5 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | never encode order in a slug (1); decompose only to WU-warrant (1); the cut is firm at the maturity gate (1); `cohortless` only when every source has a home (1); the method decides, never restructures (4)   |
| `assess-design-proportionality` | 1  | 3 | return `proportionate` only for the least elaborate credible design (A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | project or team status is not evidence (4); no non-decision-bearing note tier (5); the adequacy rail rejects lossy simplification (1)                                                                          |
| `assess-draft-readiness`        | 1  | 1 | ready only when all three criteria clear, at a bar identical at every depth (A)                                                                                                                                                                                                                                                                                                                                                                                                                                                              | read for the inbound buffer, do not drain it (4)                                                                                                                                                               |
| `assess-parallel-fit`           | 1  | 4 | foreign-owned overlap coordinates — you cannot unilaterally reorder work you do not own (I)                                                                                                                                                                                                                                                                                                                                                                                                                                                  | advisory, never gating (5); never Purpose-only, never a heavyweight all-candidate pass (3); describe the board, do not judge the operator (3); the design-load read never moves the posture (4)                |
| `branch-format`                 | 1  | 3 | the `plan/` prefix is not overridable — it is machine-read by `State: Planning` and session-init (J)                                                                                                                                                                                                                                                                                                                                                                                                                                         | kebab-case and charset (2); ARC warns but never refuses a foreign branch (5); a populated override is authoritative (6)                                                                                        |
| `classify-work-unit`            | 1  | 3 | `Class` never drops below a realized design-authoring floor (K)                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | never a blanket `Heavy` stamp (1); `[TBD]` legal only in `backlog/provisional/` (2); volume and preference do not drive `Class` (4)                                                                            |
| `commit-footer`                 | 0  | 3 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | every commit carries the footer (2); grep-searchable format (4); the last `Context:` trailer governs (4)                                                                                                       |
| `commit-format`                 | 0  | 4 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | never write `Phase X.Y` (2); reserve `(arc)` (1); file-backed message submission (1); verify the heredoc delimiter (1)                                                                                         |
| `design-audit`                  | 2  | 2 | read-only — the audit never edits the artifact (E); severity is the reviewer's claim, disposition stays the primary's (D)                                                                                                                                                                                                                                                                                                                                                                                                                    | route a break back into the design loop (1); map into the enum, never extend it (4)                                                                                                                            |
| `frontline-review`              | 5  | 0 | cannot satisfy an obligation, produce satisfying evidence, or authorize mutation (C); exclude author conclusions and self-verification claims (B); clean only after complete coverage (A); return the report without editing, approving, closing, or attesting (C, E); chunked mode runs only through a curated-scope carrier, and no partial report completes the pass (A)                                                                                                                                                                  | —                                                                                                                                                                                                              |
| `implementation-audit`          | 1  | 1 | return clean only after every dimension across the full change (A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | replacing the rubric requires a complete-lens override (4)                                                                                                                                                     |
| `issue-triage`                  | 1  | 2 | never defer to completion notes or session notes (L)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | minor fixes without asking (5); major asks for direction (1)                                                                                                                                                   |
| `quality-gate-commands`         | 1  | 1 | the gate command set does not scale with `Class` (H)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | project commands must exit zero on pass (4)                                                                                                                                                                    |
| `resolve-planning-depth`        | 2  | 3 | down-switching never falls below the realized demand floor (K); the re-entry valve is offered at an interlock, never an automatic detector (G)                                                                                                                                                                                                                                                                                                                                                                                               | a produced artifact is never torn down (1); capture, ratchet, re-enter — never patch-and-limp (1); the `Class` write defers to the ceremony commit (6)                                                         |
| `review-chunking`               | 3  | 2 | require union coverage — an uncovered region is not implicitly reviewed (A); do not treat size alone as proof the pass is bounded (C); partial chunk reports carry no standalone authority (C)                                                                                                                                                                                                                                                                                                                                               | the malformed-boundary definition (4); tripwires select attention only (5)                                                                                                                                     |
| `review-response`               | 4  | 3 | `awaiting-approval` does not mutate the target (E); `ready-to-fix` requires the exact unconsumed authorization (E); approval plus an agent-authored explanation manufactures no host capability (C); past-tense finding actions are settlement evidence, not approval state (C)                                                                                                                                                                                                                                                              | follow the planner state, do not combine transitions (3); never create a roll-up comment (5); at most one fix increment per cycle (4)                                                                          |
| `review-triage`                 | 4  | 1 | verify every finding with the primary's own judgment, never on reviewer authority (D); approve the complete disposition set before any fix, with no early individual fix (E); never begin a fix from prose assent (E); record-only never overrides a carrier-native blocking state (C)                                                                                                                                                                                                                                                       | `nit` is valid only with `minor` (4)                                                                                                                                                                           |
| `self-review`                   | 3  | 1 | not independent evidence and cannot satisfy a review requirement (C); do not reinterpret the preflight as independent evidence (C); process findings through `review-triage` — approval before fixes (D, E)                                                                                                                                                                                                                                                                                                                                  | run Tier 3 on modified files (6)                                                                                                                                                                               |
| `session-state`                 | 0  | 1 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | state must be recoverable by a new session (1)                                                                                                                                                                 |
| `spec-review`                   | 0  | 3 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | never paper over a design-reopening finding (1); the Novel overlay recommends, never gates (5); the bar is invariant, the distance scales (4)                                                                  |
| `standard-review`               | 6  | 2 | review the complete exact change set, not a sample or the latest fix (A); a non-author evaluator, with author conclusions and self-verification excluded (B); a specialization cannot omit a baseline dimension (A); unavailable, partial, ambiguous, or failed review is never clean (A); satisfying evidence only after an authorized attestor revalidates (E); missing, stale, or unverifiable carrier content is non-satisfying (C)                                                                                                      | hosted and whole-target-only carriers are ineligible for chunked mode (4); the typed baseline is rubric authority (4)                                                                                          |
| `task-audit`                    | 2  | 2 | read-only — do not implement fixes; the caller decides (E); if the audit is clean, say so — do not manufacture concerns (F)                                                                                                                                                                                                                                                                                                                                                                                                                  | give carry-as-context findings a durable home (1); map into the enum, never extend it (4)                                                                                                                      |
| `test-first`                    | 0  | 2 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | the requires-test-first list (1); if unsure, default to test-first (5)                                                                                                                                         |
| `testing-standards`             | 3  | 6 | see it fail first — a test that has never failed may assert nothing (M); do not assert on spy or call args as the outcome (M); keep mocked boundaries and fixtures faithful (M)                                                                                                                                                                                                                                                                                                                                                              | mock at boundaries, never internals (1); keep tests isolated (3); one behavior at a time (6); cover error and boundary paths (3); meaningful assertions over coverage targets (3); design for testability (3)  |

### Where each family's constitutional statement already sits

The 52 sites are not 52 independent rules. They collapse onto thirteen families, and **44 of the 52 restate a rule
the always-loaded set already carries** — the method text is the local instance, not the authority. Marking all 52
would put the vocabulary everywhere the restatement went, which is the opposite of D3's concentration precedent. The
economical footprint is the parent plus the sites with no parent:

| Family     | Constitutional statement                                                       | Marked today? |
| ---------- | ------------------------------------------------------------------------------ | ------------- |
| A, B, C    | `AGENT-BRIEF.ARC` § Review authority                                           | no            |
| D          | `DEV-RULES.ARC` § Sub-agent scope (Judgment) + § Review finding mutation guard | no            |
| E          | `DEV-RULES.ARC` § Review finding mutation guard; § Merge authority for merge   | partly        |
| F, G       | `DEV-RULES.ARC` § Task interlock                                               | yes           |
| H          | `DEV-RULES.ARC` § Scaled Process, Invariant Discipline                         | no            |
| I          | § Rule Authority's own backstop limb two — no separate rule states it          | n/a           |
| J, K, L, M | no constitutional parent — see the region-local set below                      | n/a           |

**The eight region-local markers** — sites whose rule exists nowhere else, so the marker has to land in the method:

1. `branch-format` — the `plan/` prefix (J).
2. `classify-work-unit` — the realized-design ratchet (K).
3. `resolve-planning-depth` — the down-switch floor (K); may ride 2's marker through the cross-reference it already
   carries.
4. `assess-parallel-fit` — foreign-owned overlap (I).
5. `assess-draft-readiness` — the three-criterion bar (A), the only planning-stage gate in the set.
6. `testing-standards` — see it fail first (M).
7. `testing-standards` — do not assert on spy or call args as the outcome (M).
8. `testing-standards` — keep mocked boundaries and fixtures faithful (M).

### Findings

**1. D3's "roughly five markers" is invalidated for the method region alone, but the remedy is not 52 markers.**
D9.4 anticipated this: the footprint follows the sweep. What the sweep actually shows is that the discriminator's
reach is wide and the corpus's **restatement density** is high — the same six rules are re-stated across the review
methods because each method must be readable standalone. Recommended footprint for Task 4.5.a: **three unmarked
parents** (§ Review authority, § Sub-agent scope's judgment leg, § Scaled Process, Invariant Discipline) plus the
**eight region-local sites** — eleven, not 52. The full 52 stay recorded here so the claim is auditable.

**2. `invariant` is already in the method corpus in a third sense, unmarked, at five sites.** D2's ADR reconciles two
senses — `adr-016`'s _not project-configurable_ and D1's _not agent-dischargeable_. The methods carry a third:
**does not vary with `Class`**.

- `quality-gate-commands` — "**`Class`-invariant.** The gate command set does not scale with a work unit's `Class`"
- `classify-work-unit` — "what stays invariant at every value is execution _discipline_"
- `spec-review` — "the bar is invariant (coherent + grounded); the distance scales"
- `adversarial-review` — the same idea without the word: "the convergence threshold does not vary by `Class`"
- `branch-format` — "The `plan/` prefix is invariant", which is `adr-016`'s sense, and is **the one site where a
  `[invariant]` marker would land in the same paragraph as the word used to mean something else**

`DEV-RULES.ARC` § Scaled Process, Invariant Discipline names the third sense in its own heading. D2's content
boundary as specced covers two senses; it needs the third, or `branch-format`'s line needs rewording to
"not overridable" before a marker goes near it.

**3. Three unmarked parents are the sweep's real Phase 3 / Phase 5 output.** § Review finding mutation guard,
§ Sub-agent scope's judgment leg, and § Scaled Process, Invariant Discipline each govern a family the method region
restates repeatedly, and each currently reads as a default. § Discovered Work Routing is a fourth and the sharpest:
it calls its own rule "**The core invariant**" in bold prose and carries no marker, so the reader gets the word
without the classification. `issue-triage`'s never-defer line (L) is that rule's method-side instance.

**4. The model is already practised inside the method corpus — three further enactments.** All three predate D1 and
none references it:

- `process-task-loop` § Batching judgment discharges `testing-standards`' "one behavior at a time": batch when the
  behaviors are coupled, and "note the rationale briefly in your completion report to the user — not in task list
  completion notes. This makes the decision visible during review." That is D1's discharge protocol verbatim —
  name the fact, surface it where the developer is already reading, never a log.
- `task-audit`'s durable-home rule authors its own discharging fact: "**Sole exception:** an audit scoped to a single
  task the auditing agent is about to implement directly."
- `DEV-RULES.PROJECT` § Selecting what to run discharges `self-review`'s Tier-3 instruction over an unchanged tree —
  and pairs the discharge with a mandatory disclosure: "a skip that goes unrecorded reads as coverage nobody
  actually has."

**5. The check-integrity limb reaches further than its illustration.** D1 illustrates it with "quality gates,
verification, review, and the commit and merge gates that admit work." `assess-draft-readiness`'s three-criterion bar
is none of those — it is a **planning-stage** gate — yet it classifies invariant on the same limb, and the method has
already pre-empted the obvious discharge ("The bar is identical at every planning depth"). The illustration is
non-exhaustive by its own terms, so this is reach rather than a defect; recorded because Task 4.2's strategies will
meet more of it.

**6. A discriminator the sweep produced that D1 does not state:** _a rule backed by a mechanical check is safely a
default; a rule that backs a check is an invariant._ `commit-format`'s "Never write `Phase X.Y`" names the hook that
blocks it in the same sentence and reclassifies harmlessly (reason 2); `standard-review`'s clean rule is what a check
would have to trust and cannot be reclassified. Not acted on — D1 is settled — but it is the cleanest single line the
region produced, and it belongs in the record before Task 4.2 re-derives it.

**7. The base merge moved one row, and it moved the accepting reason rather than the verdict.** The sweep first ran
100 commits behind base. Merging brought one change into the method region: `assess-cohort-fit`'s `cohortless` rule
was rewritten from "select it only when every conserved source has a destination-owned home" — a condition with a
nameable discharging fact — to a cardinality constraint on the cut-map, "every decomposition with more than one new
member must select `standalone`, `in-cohort`, or `at-cap`, **regardless of content ownership**." The closing clause
deletes the discharge on purpose. The verdict is unchanged (`default` either way) but the reason moves from 1 to 4,
and the row is now recorded against the merged text. Nothing else in the method region moved, and the strategy
region — Task 4.2's corpus — was untouched across all 100 commits.

One workflow changed shape, and it is a **relocation, not a removal**: `decompose-work-unit.md` went 434 → 39 lines
because its procedure moved into the CLI behind `arc decompose --preflight`, whose implementation landed in the same
merge. Nothing was withdrawn — the body crossed the agent/CLI seam, which is the movement
`strategy-procedure-evolution` exists to watch. It is also **mid-transformation**: `decompose-transform-integrity` is
landing as a hand-cut seven-slice stack, only slices 01–03 are in, and the workflow slice is among those still
outstanding. Task 4.3 must record that file as in-flight and re-check it rather than classify its interim text, and
should expect the same shape wherever else that stack is still landing.

**8. One rule reaches past its own stated concern.** `assess-cohort-fit`'s "**Never encode order in the slug**"
justifies itself by opacity ("`model-foundation` is opaque"), but bans ordinals on a slug that is _already_
self-describing, where the stated concern does not arise. The model classifies it `default` correctly; what it
surfaced is that the rule is broader than its rationale. No action here — recorded as the kind of result Goal 6
exists to produce.

---

## Corpus-wide classification sweep — the strategy region (Task 4.2)

Every strategy document read for imperatives the default-unless-marked reading reclassifies. **176 imperatives across
21 documents: 51 take a marker, 125 stand as accepted reclassifications.** Five documents carry no marker candidate at
all (`strategy-file-classification`, `STRATEGY-INDEX`, `strategy-package-project-sync`, `strategy-procedure-evolution`,
`strategy-testing-methodology`).

The headline is the **ratio**, not the volume. The strategy region carries half again as many imperatives as the method
region (176 vs 115) but reclassifies **71% of them** against the methods' 55%. Strategies are predominantly
explanatory and definitional — they say what is true and why — while methods are contractual. The discriminator's
reach is therefore _narrower_ here, not wider, which is the opposite of what Task 4.1's finding 1 would have predicted
from raw density.

### The corpus, re-derived

21 documents: 13 `strategies/arc/`, 7 `strategies/project/`, plus `STRATEGY-INDEX`. The three directory `README.md`
indices (`strategies/`, `project/`, `project/style/`) are excluded on Task 4.1's precedent; they were read, and carry
only eligibility and naming statements (no marker candidate, and no imperative that would survive the exclusion).

Copy relationships, re-derived by comparing rather than by filename:

- **13 byte-identical mirrors** — every `strategies/arc/` document. Classify from either copy; a marker syncs.
- **1 divergent pair — `STRATEGY-INDEX`**, and it diverges **in text a marker would land in**. The shipped copy carries
  an illustrative project-strategy block and a `**Maintenance:**` paragraph (an authoring rule for firing conditions);
  the instance copy replaces both with this project's real entries and has no Maintenance paragraph. One copy does not
  settle the other here — unlike Task 4.1, where all three divergent method pairs differed only outside marker-bearing
  text.
- **7 instance-only documents** — all of `strategies/project/`. The package ships `project/` as an **empty surface**
  (`README.md` + `style/README.md` only), so these seven state their rules to nobody but this repo.

**Recipe drift: none in this region.** All 13 `strategies/arc/` documents resolve through `init-recipe.json` — 11 in
the base set, plus `strategy-planning-module` under `pm.mode == arc-in-git` and `strategy-team-coordination` under
`team.mode == true`. This is the **opposite** of the method region, where 3 of 25 ship without installing, and it
contradicts the standing `WORKING-MEMORY` note that three `strategies/arc` files are absent from the recipe — that
reading no longer holds against the merged base. The live blast radius of a strategy marker is therefore the full
shipped set, minus the two conditional arms.

### Basis codes

Task 4.1's codes carry forward. `A`, `B`, `C`, `E`, `G`, `H`, `I`, `J`, `K` all fire again; `D`, `F`, `L`, and `M` do
not fire anywhere in this region. Three families are new:

| Code | Family (new in this region)                                                                  |
| ---- | -------------------------------------------------------------------------------------------- |
| N    | Shared history and shared state are not unilaterally rewritten                               |
| O    | A judgment value is its owner's to supply; the agent estimates only where a rule licenses it |
| P    | Guidance that gates an operation must be reachable where that operation fires                |

Accepting reasons are unchanged from Task 4.1 (1–6).

### Per-document sweep

| Document                                | M | A | Marker candidates (`[invariant]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Accepted reclassifications (the default stands)                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------- | - | - | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strategy-adr-methodology`              | 3 | 4 | an accepted decision is final — Context, Decision, and original Consequences are never rewritten (K); never delete a deprecated or superseded ADR (K); an amendment may not change the Decision, re-frame Context, or contradict original consequences (K)                                                                                                                                                                                                                                                                                                                                                                                                                  | a correction must not change meaning, and doubt escalates to Tier 2 (1); numbers are never reused (4); the when-to-write and don't-write-for criteria (4); neutral factual Context tone (3)                                                                                                                                                                                                           |
| `strategy-concurrent-work`              | 5 | 7 | a pushed branch is append-only — never rebase, amend, or rewrite pushed commits (N); cross-machine resume is always `pull --ff-only` (N); never force-push a shared branch to "win" (N); integration is the single sanctioned rewrite point (N); foreign-owned work is coordinated, not appropriated (I)                                                                                                                                                                                                                                                                                                                                                                    | `git worktree remove`, never `rm -rf` (1); don't relocate a tool-managed worktree (1); confirm the worktree before acting (6); don't archive or remove while `Integrating` (1); pull before writing, serialize entry edits through one locus (1); no safety column on ROADMAP (4); merge from one designated worktree (3)                                                                             |
| `strategy-configurability-architecture` | 4 | 6 | an extension's fire-point frequency must match the coverage its name promises (A); an adapter resolves and validates carrier content and rejects missing, stale, conflicting, or unverifiable projections (C); the projection is not rubric authority — the digest proves only what was delivered (C); projection content excludes findings, dispositions, evidence admission, and controller state (B)                                                                                                                                                                                                                                                                     | principles are not configurable through any mechanism (4); method contracts are advisory (4); only registry methods declare `active`, malformed falls back to package default (4); criteria for adding a config setting (4); custom extension points sit outside the envelope (5); `override-mode` composition (4)                                                                                    |
| `strategy-file-classification`          | 0 | 5 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | don't customize Framework files directly (1); the `[Title Case Phrase]` dialect is retired (3); keep the three placeholder syntaxes distinct (3); prefix and ALL-CAPS naming (4); one-shot template uniqueness and the `.template.md` suffix (4)                                                                                                                                                      |
| `strategy-interlock-release-wrappers`   | 2 | 4 | never claim a shell-wrapped heredoc matches the commit prefix rule — verify with `codex execpolicy check` (C); use heredoc transport only after the resident matcher verifies redirection, else direct prepared-file argv (C)                                                                                                                                                                                                                                                                                                                                                                                                                                               | destructive shapes route through raw `git` (5); off-workflow invocations sit outside the trust shift (4); opt-in is per-developer per-machine (4); `arc sync` handles its own push (4)                                                                                                                                                                                                                |
| `strategy-planning-module`              | 1 | 5 | `active/` stays flat — no cohort dirs; membership tracks on the meta (J)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | the shared inbox is written only at the between-WUs drain (3); absorbed entries are deleted, not marked (1); codified cohorts only (3); cohort members are state-uniform (4); multi-step work never lands in the shared atomic inbox (4)                                                                                                                                                              |
| `strategy-quality-gates`                | 3 | 5 | never skip or partially run Tier 3 (A); always run Tier 1 before marking a task complete (A); run at least Tier 1 before committing off-loop work (A)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | if Tier 3 fails, fix before proceeding (6); targeted commands, not full-project scans (3); fix issues while context is fresh (3); don't run the full suite at Tier 2 (4); tier-escalation guidance (5)                                                                                                                                                                                                |
| `strategy-session-operations`           | 8 | 6 | agent-side review is best-effort — only a required host-side check structurally enforces merge safety (C); every review increment receives explicit human approval (G); merge approval is never inferred from task approval, review completion, passing checks, or "proceed" (E); quality-gate failures hold regardless of mode (A); the approval signal is anchored to a structured prompt, never parsed from arbitrary prose (E); per-task commit release inside a deferred range requires explicit opt-in (E); a retained inbox capture is never the default and never agent-suggested (G); project-level meta files stay maintainer-owned under contributor release (I) | present a cascade-undo plan before destructive rollback (6); worktree-push precedes notes-push (2); when uncertain, prefer T1 (5); probe slot resolvers are non-destructive (4); don't roll back correct local work on a transit failure (1); vague eviction triggers defeat the discipline (3)                                                                                                       |
| `strategy-task-list-formatting`         | 4 | 6 | criterion text is immutable — never rewritten to match the implementation (K); every criterion is `[x]` or `[~]` with its annotation before archive (A); a `[~]` criterion requires its Superseded note (K); `_Goal:_` is preserved verbatim at completion (K)                                                                                                                                                                                                                                                                                                                                                                                                              | criteria are checked at verification, not implementation or archival (4); operationalize rather than duplicate the PRD's criteria (3); an instruction targeting a shipped file uses the shipped register (1); the verification phase and Success Criteria section are required (4); `Phase X.Y` is a misnomer (2); the formatting and blank-line conventions (2)                                      |
| `strategy-team-coordination`            | 1 | 5 | ownership transfers as sequential reassignment of `**Owner:**`, never concurrent shared ownership; foreign-owned work is coordinated (I)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | documents must stand alone for an async reader (3); credit pairing with `Co-authored-by:` (4); `user.notes_push` is not auto-updated when `team.mode` toggles after init (1); a WU has a single owner (4); no extension point is needed for assignment (4)                                                                                                                                            |
| `strategy-work-organization`            | 8 | 9 | `Class` never drops below a realized design-authoring floor (K); a stub's commitment, priority, and `Class` are judgment the tool will not invent (O); discipline is `Class`-invariant (H); a parseable spec exists before task-list generation (A); under full protection no change reaches the base without a branch and review (E); a PR touching any reviewed-lane path is reviewed-lane as a whole (A); the classifier may move a result to reviewed, never the reverse (E); a cross-cutting Errand on an in-flight foreign artifact is coordinated or sequenced (I)                                                                                                   | never a blanket `heavy` stamp (1); the cohort doc carries coordination only (1); membership is derived, never a roster (4); the nesting cap and its no-rescue clause (4); write-once fan-out provenance (1); `main` is the resting state, not a lock (1); a cut is never left un-occupied (2); ROADMAP hand-edits drift from source (2); priority anti-inflation is documentation discipline only (5) |
| `strategy-work-planning`                | 1 | 6 | the floor never drops — down-switching is bounded by the demand floor and a heavier artifact already produced is never torn down (K)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | capture, ratchet, re-enter rather than patch-and-limp (1); design precedes implementation (6); one spec per WU, layering the sole exception (4); layering is opt-in and non-default (5); Success Criteria are falsifiable at every form (4); the five anti-patterns (3)                                                                                                                               |
| `strategy-workflow-authoring`           | 2 | 8 | an agent-interpreted marker is an agent-layer guarantee — direct CLI and raw-git paths cannot be structurally intercepted (C); the extension marker still fires on `arc sync` push steps and is placed before the invocation (A)                                                                                                                                                                                                                                                                                                                                                                                                                                            | mark every fire-point whose consumer is the executing session (1); declare by what the workflow may fire (5); destructive flags stay literal (2); declare methods and extensions in frontmatter (2); no duplicated `**Audience:**` callouts (4); prose economy (3); verbs over mechanics (1); don't entangle gate with fire (3)                                                                       |
| `STRATEGY-INDEX`                        | 0 | 3 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | the ALWAYS-load firing conditions (6); update the index when adding a strategy (3, shipped copy only); author each entry as a directive firing condition (3, shipped copy only)                                                                                                                                                                                                                       |
| `strategy-knowledge-evolution`          | 1 | 6 | a hard constraint is always-loaded or placed at the gate site firing its operation — never mid-document on-demand, never index-only, never demoted (P)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | author trigger surfaces as directive firing conditions (3); anchor triggers to operations, not workflows (1); no per-artifact tier or loading flags (4); extract on fan-in (3); prefer emitted remedies to reference docs (3); don't grow the always-loaded set casually (3)                                                                                                                          |
| `strategy-package-project-sync`         | 0 | 6 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | never `cp` a Configurable file between copies (1 + 2 — see § The counterexample); Framework edits flow package → `.arc/` (2); edit the template, not the rendered copy (1); default to package source when uncertain (1); verify with `diff` that only overrides remain (1); dev-only checks live in the husky layer (4)                                                                              |
| `strategy-pm-composition-evolution`     | 3 | 7 | an unavailable provider must not let ARC silently claim authority, overwrite stale state, or invent success (C); an unknown Self-Check answer preserves the seam and routes the decision — never a silent fix in the consuming WU (I); don't call Level 1 or a free-form extension "integrated" without naming the level (C)                                                                                                                                                                                                                                                                                                                                                | every PM-adjacent fact names one authority (4); map external identity, never derive ARC identity (4); start below bidirectional sync (3); tracker choice stays orthogonal to planning depth (4); typed verbs over adapter prose (3); unsupported mappings must be explicit (1); integration must earn its ceremony (3)                                                                                |
| `strategy-procedure-evolution`          | 0 | 7 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | prose never evaluates state (3); markup never grows control flow (3); verbs over mechanics (1); schemas are generated (4); evals gate the prose layer (3); emitted text is precomposed CLI-side (3); a load-bearing term is defined once (1)                                                                                                                                                          |
| `strategy-storage-evolution`            | 1 | 8 | any write to shared or materialized state carries the version it read — no mutation path blind-overwrites (N)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | treat `.arc/` storage as an abstraction (3); records are storage-agnostic (4); external integration stays read-side (4); WU identity stays decoupled from branch identity (4); workflow logic stays mode-agnostic (3); one storage knob (4); avoid axis explosion (3); the store is complete without a service (4)                                                                                    |
| `strategy-testing-methodology`          | 0 | 6 | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | mock at boundaries, never internals (6); keep mocked boundaries faithful (6); test behavior through public interfaces (3); vertical slices (6); meaningful assertions over coverage (3); design for testability (3)                                                                                                                                                                                   |
| `strategy-user-notes-concurrency`       | 4 | 6 | never fetch directly into a live notes ref or sync-state ref (N); reads must not mutate durable state (N); `--force` is the operator's escape hatch — no automatic, paired, retry, or reconcile path selects it (E); routine retries never reinterpret an unchanged unsafe topology as safe (C)                                                                                                                                                                                                                                                                                                                                                                             | lock-serialize an unguarded read-modify-write (4); use CAS when the mutator can name the state it replaces (4); go lock-free only when a stale plan is safe (1); temp refs carry caller-unique tokens (1); a shared temp ref needs a serialized section (1); compact only when machines are synced (1)                                                                                                |

### The counterexample, resolved

Task 4.2's `_Note:_` asked whether `strategy-package-project-sync`'s "never `cp`" is a genuine conflict — a rule whose
discharging fact and enforcement condition might not overlap. **It is not a conflict.** They are the same condition
read from two directions.

The candidate discharging fact is "this file carries no project overrides." The pre-commit check
(`scripts/check-package-sync.sh`) fires when a Configurable file is staged byte-identical to the package copy **and**
the two differed at HEAD. Reading the source rather than the strategy's self-description settles it: the check
compares **HEAD-to-HEAD** for the overrides condition, and its own comment says why — comparing the instance's HEAD
against the package _working tree_ "conflates 'overrides existed' with 'package was edited in this commit,' producing
false positives when the framework author legitimately edits both copies of a file that had no project-specific
override at HEAD." The check declines to fire in exactly the case where the discharge is true. It is a codified
discharge-checker, not an independent condition.

So the rule is a **default** on both reasons at once: reason 1 (its own text names the discharging fact — "Configurable
files diverge by design: the package source carries template defaults; the `.arc/` instance carries this project's
overrides") and reason 2 (a mechanical check catches the violation). The absolute phrasing is emphasis on what the
document itself calls "the highest-frequency failure mode," not a withheld authority.

Three residuals, recorded because they are the interesting part:

- **The check detects, it does not prevent.** The strategy says so — "the blast already touched the working tree by
  then." That does not change the classification, but it does mean the discharge has to be established _before_ the
  copy, not relied on after it.
- **Reason 2 is partial by the document's own admission.** A `cp` followed by a partial hand-edit leaves the file
  non-identical and slips the byte-equality signature; the strategy's answer is "discipline > tooling here." Reason 1
  is load-bearing on its own — the agent can establish the fact with one `diff` of the two copies at HEAD.
- **A third legitimate non-firing case exists that the strategy doesn't document:** the check exempts a staged blob
  byte-identical to `MERGE_HEAD`, because a merge stages content that was resolved rather than authored.

This is a clean confirming instance of Task 4.1's finding 6, derived independently and from the opposite direction:
_a rule backed by a mechanical check is safely a default; a rule that backs a check is an invariant._ "Never `cp`" is
backed by one. Nothing in the strategy region falsified the model.

### Where each family's constitutional statement sits — and the correction to Task 4.1

Task 4.1 recorded families `J`, `K`, `L`, `M` as having "no constitutional parent," and family `I` as stated nowhere
but § Rule Authority's own backstop. **The strategy region carries parents for `I`, `K`, and `H`**, and that
invalidates three of Task 4.1's eight region-local markers:

| Family  | Constitutional statement                                                                                       | Marked today? |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| A, B, C | `AGENT-BRIEF.ARC` § Review authority (restated at `strategy-session-operations` § Review enforcement boundary) | no            |
| E       | `DEV-RULES.ARC` § Merge authority; § Review finding mutation guard                                             | partly        |
| G       | `DEV-RULES.ARC` § Task interlock                                                                               | yes           |
| H       | `DEV-RULES.ARC` § Scaled Process, Invariant Discipline; `strategy-work-organization` § Escape-hatch guardrails | no            |
| I       | `strategy-concurrent-work` § Foreign-owned work and the all-owner gate                                         | no            |
| K       | `strategy-work-organization` § Class Model (Estimating and the ratchet)                                        | no            |
| N       | `DEV-RULES.ARC` § Commit Discipline — Rebase scope; `strategy-concurrent-work` § Append-only                   | no            |
| J, O, P | no constitutional parent — see the region-local set below                                                      | n/a           |

**Corrections to Task 4.1's region-local set.** Three of its eight are not region-local:

- #2 `classify-work-unit` (the realized-design ratchet) and #3 `resolve-planning-depth` (the down-switch floor) both
  restate `strategy-work-organization` § Class Model verbatim — "once a stage has _authored_ design at some depth,
  `Class` never drops below that floor."
- #4 `assess-parallel-fit` (foreign-owned overlap) restates `strategy-concurrent-work` § Foreign-owned work verbatim —
  "reorder and re-home your own work freely; foreign-owned work you coordinate, not appropriate."

Five of Task 4.1's eight survive as genuinely region-local: `branch-format`'s `plan/` prefix (J),
`assess-draft-readiness`'s three-criterion bar (A), and the three `testing-standards` sites (M).

**The strategy region's own region-local markers** — sites whose rule exists nowhere else:

1. `strategy-adr-methodology` § Amending Accepted ADRs — accepted-decision immutability (K). Covers all three ADR
   sites; ADRs have no constitutional rule anywhere in the corpus.
2. `strategy-quality-gates` § Tier 3 — never skip or partially run (A). `DEV-RULES.ARC` § Quality gate failure marks
   only the _red-gate_ limb; the _completeness_ limb has no marked parent. Extending the marked parent is the better
   remedy than a new marker here.
3. `strategy-work-organization` § Stub required fields — judgment values are not fabricated (O).
4. `strategy-work-organization` § Auto-Merge Lane — a PR touching a reviewed-lane path is reviewed-lane whole, and
   escalation is one-directional (A, E).
5. `strategy-session-operations` § USER-INBOX Retain flag — never the default, never agent-suggested (G).
6. `strategy-task-list-formatting` § Success Criteria — criterion text is immutable (K). **Pending Task 4.3:**
   `process-task-loop` carries the sibling "Goal is preserved verbatim" rule, so the marker may belong in the workflow
   region instead. Do not place this one before Task 4.3 reads that file.
7. `strategy-interlock-release-wrappers` § Per-Harness Reference Implementations — never claim an unverified matcher
   shape (C).
8. `strategy-knowledge-evolution` Principle 1 — constraints are placed where their operation fires (P).
   _Project-internal; does not ship._
9. `strategy-user-notes-concurrency` — the four shared-state rules (N, N, E, C), collapsible to one marker at the
   discipline preamble. _Project-internal; does not ship._

**One new unmarked constitutional parent for Phase 3:** `DEV-RULES.ARC` § Commit Discipline — _Rebase scope_ ("Never
rebase or otherwise rewrite a _pushed_ branch"). Family N has no marked home, even though the adjacent _Amend scope_
clause is marked `[invariant]`. That joins Task 4.1's three (§ Review authority, § Sub-agent scope's judgment leg,
§ Scaled Process) and § Discovered Work Routing, which finding 3 already called the sharpest.

**Revised Task 4.5.a footprint.** Task 4.1 proposed eleven. After this region: **four unmarked parents + five
surviving method-region-local + nine strategy-region-local = eighteen**, with item 6 above pending Task 4.3. Two of the
nine sit in documents that do not ship.

### Findings

**1. The word `invariant` is the corpus's general-purpose intensifier, and the strategy region adds a fourth sense.**
Task 4.1's finding 2 recorded a third sense in the methods (_does not vary with `Class`_). The strategies carry that
one and one more — _a structural fact that holds by construction_ — at more sites than either of `adr-030`'s two:

- **(i) not project-configurable** (`adr-016`'s sense) — `strategy-session-operations` § Linear Interlock Stack, whose
  Configurability column reads `Invariant` for `task-interlock` and `integration-interlock`.
- **(ii) not agent-dischargeable** (D1's sense) — `strategy-concurrent-work` § Append-only: "This is the one **hard
  invariant** in this strategy; everything else here is advisory."
- **(iii) does not vary with `Class`** — `strategy-work-organization` § Escape-hatch guardrails ("Discipline is
  `Class`-invariant"), § Spec-Flow Invariants, § Validation contract ("invariant across every form").
- **(iv) holds by construction** — `strategy-session-operations` § Path-class invariant, § Push-ordering invariant,
  "co-location … is invariant"; `strategy-work-organization` § Per-Worktree Isolation ("a structural invariant"), the
  cohort-consistency invariant, § Errand's cut→occupy invariant.

D2's content boundary as specced covers two senses. The methods needed a third; the strategies need a fourth, and
sense (iv) is the most frequent use of the word in the whole corpus. Whatever D2 settles has to survive a reader who
has just met `**Path-class invariant.**` two documents earlier.

**2. The model is not merely practised in the corpus — it is _stated_, in D1's own vocabulary, once.**
`strategy-concurrent-work` opens by classifying its entire contents ("These are **judgment-driven conventions, not
enforced rules**") and then names the single exception as a "hard invariant … everything else here is advisory." That
is D1's default/invariant partition, applied to a whole document, predating D1 and referencing nothing. It is the
strongest existing-practice evidence the sweep has produced — stronger than Task 4.1's finding 4, because it is the
partition itself rather than an enactment of the discharge protocol. It also means the corpus already has a native
term for D1's concept, used in that sense at exactly one site out of ten.

**3. The reclassification rate inverts Task 4.1's expectation, and the reason is a content-kind difference.** 71% of
strategy imperatives reclassify against 55% of method imperatives, despite a higher raw count. Methods are contracts
an agent executes; strategies mostly _describe_ — taxonomies, enums, render algorithms, tier definitions, worked
examples — and a definitional statement has nothing for the discriminator to bite on (accepting reason 4 is by far the
most common in this region). This is direct support for Task 4.5.b's enabling-content category: a large fraction of
the strategy corpus is neither constraint nor explanation but the _definitions the constraints are written in_.

**4. `STRATEGY-INDEX` is the region's one marker-bearing divergent pair, and the divergence is invisible from either
copy alone.** The shipped copy's `**Maintenance:**` paragraph — the authoring rule for firing conditions — has no
instance counterpart, and the instance's real project entries have no shipped counterpart. Task 4.1 could classify
from one copy because none of its three divergent pairs differed in marker-bearing text; that convenience does not
hold here, and Task 4.3 should expect it again (five workflows are template-paired by construction).

**5. The most-feared silent-failure rule in the corpus classifies as a default — because it supplies its own
discriminator.** `strategy-workflow-authoring`'s "mark every fire-point whose consumer is the executing session"
governs a failure mode with no checker (`WORKING-MEMORY` carries a standing entry about it, and the strategy admits
"reachability is the author's responsibility until a fire-point validator exists"). It still reads `default`, because
the rule names the exact fact that discharges it — a CLI verb carrying the content on the workflow's behalf — and that
fact is the author's to establish. Severity of consequence is not the test; whose fact it is, is. Recorded because it
is the cleanest case in either region where the two come apart.

**6. Four families that fired in the methods fire nowhere here.** `D` (judgment stays with the primary), `F` (don't
manufacture findings), `L` (no item with a known home rests in a capture surface), and `M` (test integrity) have no
strategy-region instance. Each is an _execution-time_ obligation on a running agent; strategies are consulted before
execution, not during it. The absence is a property of the region's role, not a coverage gap — but it does mean the
`L` and `M` markers Task 4.1 proposed have no strategy-side reinforcement to lean on.

**7. The base merge left this region untouched, as Task 4.1 predicted.** Finding 7 of the method sweep recorded that
the strategy region was unmoved across all 100 commits of the merge. Re-derived here against the merged base: no
strategy document's marker-bearing text differs from what the pre-merge tree carried. The one moving part is the
recipe reading in § The corpus, re-derived, which improved rather than drifted.

---

## Corpus-wide classification sweep — the workflow region (Task 4.3)

Every workflow document read for imperatives the default-unless-marked reading reclassifies. **855 imperatives across
36 documents: 220 take a marker, 635 stand as accepted reclassifications.** Six documents carry no marker candidate at
all (`probe-envelope`, `prepare-commits`, `add-agent`, `promote-work-unit`, `02_define-project`,
`03_configure-external-integration`).

The region is the largest by every measure — 36 documents, 8,830 lines, 855 imperatives against the strategies' 176
and the methods' 115 — and it reclassifies **74%**, statistically indistinguishable from the strategies' 71% and far
above the methods' 55%. **The reclassification rate is not what varies across regions; the density of gate sites is.**
Workflows are mostly craft, dispatch tables, and rendering templates (accepting reasons 3, 4, and 5 dominate exactly
as they did in the strategies), punctuated by concentrated invariant clusters wherever a workflow touches a merge, an
approval, a published record, or the operator's own permission machinery.

### The corpus, re-derived

36 documents, excluding the `workflows/project/README.md` directory index on Task 4.1's precedent. **Both premises
Task 4.3 inherited needed correction**, and comparing copies rather than trusting filenames is what corrected them:

- **31 byte-identical pairs.** Classify from either copy; a marker syncs.
- **2 divergent pairs**, both template-paired: `initial-setup/02_define-project` and
  `session-lifecycle/session-init`. Both diverge **only** in `<!-- arc:if -->` conditional-render markup and the
  non-`arc-in-git` arms the instance does not render, so the shipped copy is a strict **superset**. Task 4.2's
  `STRATEGY-INDEX` problem — where each copy carried marker-bearing text the other lacked — does **not** recur.
  Classifying from the shipped copy settles both.
- **1 shipped-only** — `initial-setup/03_configure-external-integration.md`. Still exactly one, as the task entry
  predicted, but a different kind of one: it is **conditional-install** under `pm.mode == external`, not orphaned.

**The `.template.md` suffix predicts nothing.** Five documents carry it; three of those five (`generate-tasks`,
`process-task-loop`, `session-handoff`) are byte-identical to their rendered instance, while the two that diverge do
so only in conditional markup. Task 4.1's rule — re-derive the relationship by comparing, never by filename — held,
and the expected "five template-paired files need their own edit" complication did not materialize as a
classification problem. It remains an **edit-application** problem: a marker still has to be written into both copies.

**Recipe drift: 8 of 36 — the worst-drifted region by a wide margin.** `setup-release-wrapper`, `deactivate-`,
`decompose-`, `park-`, `promote-`, `reopen-`, `resume-work-unit`, and `in-flight-scope-check` ship but appear nowhere
in `init-recipe.json`, so no project installs them. Methods drifted 3 of 25; strategies 0 of 13. Seven of the eight
are the work-unit lifecycle's own transition workflows — meaning a project that installs ARC receives `activate`,
`archive`, `integrate`, and `init` but not `park`, `resume`, `promote`, `reopen`, or `deactivate`.

### Basis codes

Tasks 4.1–4.2's codes carry forward. `A`, `C`, `E`, `G`, `H`, `I`, `J`, `K`, `L`, `M`, `N`, `O`, `P` all fire; `B`,
`D`, and `F` fire rarely (three sites each). One family is new, and one existing family needs rewording:

| Code | Family (new in this region)                                                  |
| ---- | ---------------------------------------------------------------------------- |
| Q    | Content that will govern future agent behavior is read before it is wired in |

`Q`'s sole instance is `integrate-external-content` L23 ("For external files, read the content first"). Nothing
discharges it except compliance: wiring unread text into a method, extension, or strategy installs instructions the
agent will later obey without any party having seen them. No existing family reaches it — `C` concerns attesting
one's own result; `Q` concerns admitting someone else's.

**Family `O` is worded too narrowly.** Two independent readers reached for a _new_ family to cover "follow the
driver's typed `state` / `nextAction`, never reconstruct it from workflow prose" (`integrate-work-unit` L104,
`run-errand` L137, `session-recover` L30, `session-handoff` L613). `O` currently reads "a **judgment** value is its
owner's to supply" — these are machine-owned _state_ values. Two independent reaches for a new family is evidence the
boundary is wrong. Task 4.5 should broaden `O` to "a value is its owner's to supply — whether that owner is a person
or a typed producer — and the agent substitutes neither an estimate nor a paraphrase," rather than mint a family.

Accepting reasons are unchanged from Task 4.1 (1–6).

### The interlock-block collapse

Two blocks recur near-verbatim across the region and are counted **once**, not per document:

- The `commit-interlock` / `push-interlock` / `integration-interlock` / `workflow-interlock` CAUTION blocks appear in
  11 documents. They are _fire sites_ for rules stated in `DEV-RULES.ARC` (§ Task interlock and § Merge authority,
  both marked; § Review-Increment Invariant, unmarked). Every per-document instance is accepting reason 6.
- The `#pre-push-review` extension block appears verbatim in 6 documents — one `P` rule.

Without this collapse the region's marker count roughly doubles. It was the single largest source of over-counting,
and two independent readers flagged it unprompted.

### Per-document sweep

| Document                          | M  | A  | Marker character (families)                                                  |
| --------------------------------- | -- | -- | ---------------------------------------------------------------------------- |
| `integrate-work-unit`             | 25 | 21 | A, C, E, M, N, I, B, O — the densest document in the entire corpus           |
| `session-init`                    | 20 | 71 | A, C, E, G, O, J, N, D, F, I                                                 |
| `generate-tasks`                  | 16 | 35 | A, C, E, G, H, I, J, L, M                                                    |
| `drain-inbox`                     | 13 | 29 | A, E, G, I, L, N, O                                                          |
| `create-spec`                     | 13 | 28 | A, C, E, G, H, L, M                                                          |
| `setup-release-wrapper`           | 12 | 24 | C, E, G, I, K, M, N, O                                                       |
| `session-handoff`                 | 11 | 50 | A, C, G, I, L, M, N, O, P                                                    |
| `session-recover`                 | 10 | 13 | A, C, D, F, O, P                                                             |
| `setup-arc-clearance`             | 10 | 4  | A, C, E, I, J, M, N — highest marker density per line                        |
| `run-errand`                      | 9  | 42 | A, C, E, F, G, H, I, N                                                       |
| `setup-merge-gate`                | 9  | 10 | A, C, E, I, J, M, N, O                                                       |
| `draft-design`                    | 9  | 24 | A, C, E, G, H, I, K, L, O                                                    |
| `init-work-unit`                  | 8  | 27 | C, D, G, H, I, L, O                                                          |
| `01_verify-and-configure`         | 8  | 20 | C, E, G, N, O                                                                |
| `verify-work-unit`                | 7  | 7  | A, B, C, G, K, L, M                                                          |
| `verify-arc-integrity`            | 5  | 5  | A, C, E, F, G, O                                                             |
| `integrate-external-content`      | 5  | 10 | A, C, E, G, M, P, **Q**                                                      |
| `process-task-loop`               | 4  | 14 | A, E, G, K                                                                   |
| `decompose-work-unit` _(interim)_ | 4  | 5  | A, C, E, I, M, O                                                             |
| `activate-work-unit`              | 3  | 13 | I, K, O                                                                      |
| `deactivate-work-unit`            | 3  | 16 | E, G, I, N                                                                   |
| `resume-work-unit`                | 3  | 16 | C, E, G, N                                                                   |
| `archive-work-unit`               | 2  | 9  | A, C, K                                                                      |
| `clean-work-unit`                 | 2  | 15 | C, K                                                                         |
| `park-work-unit`                  | 2  | 14 | C, G, O                                                                      |
| `reopen-work-unit`                | 2  | 9  | C, I                                                                         |
| `in-flight-scope-check`           | 2  | 6  | A, G                                                                         |
| `maintain-project-docs`           | 1  | 13 | C, M                                                                         |
| `session-loop`                    | 1  | 6  | C                                                                            |
| `session-init.contributor`        | 1  | 11 | A                                                                            |
| `probe-envelope`                  | 0  | 12 | — restates session-init's rules; see finding 6                               |
| `prepare-commits`                 | 0  | 14 | — see finding 5                                                              |
| `add-agent`                       | 0  | 6  | —                                                                            |
| `promote-work-unit`               | 0  | 11 | — nothing is realized at this rung, so the ratchet is `classify-work-unit`'s |
| `02_define-project`               | 0  | 15 | — user-directed prompts and template pointers                                |
| `03_configure-external`           | 0  | 10 | — same                                                                       |

### Where the region's markers sit — and the correction to family `K`

Most of the 220 collapse onto families with parents established in Tasks 4.1–4.2. What is new:

**One new unmarked constitutional parent: `DEV-RULES.ARC` § Review-Increment Invariant.** A section whose _heading_
asserts invariance, carrying no marker, while its narrower task-scoped instance (§ Task interlock) **is** marked. It
is the parent of the region's most-restated rule — approval precedes commit — and is directly cited by
`integrate-work-unit` L241, `run-errand` L74, and `process-task-loop` L286. This is the same pathology as
§ Discovered Work Routing's "The core invariant" (Task 4.1 finding 3) and § Scaled Process, Invariant Discipline, and
it joins them plus § Commit Discipline — Rebase scope (Task 4.2). **Five unmarked parents, and every one of them
names its own invariance in prose.**

**Family `K` is two families, and the second has no parent anywhere.** Tasks 4.1 and 4.2 both recorded `K` as one
family parented at `strategy-work-organization` § Class Model. It is two:

- **`K1` — the realized-demand ratchet.** `Class` never drops below a realized design-authoring floor. Parent:
  `strategy-work-organization` § Class Model. Instances: `classify-work-unit`, `resolve-planning-depth`,
  `activate-work-unit` L88, `init-work-unit` L203, `draft-design` L63, `create-spec` L53.
- **`K2` — pre-commitment text is not rewritten to match the outcome.** **No parent in any region.** Seven instances
  across all three swept regions: `verify-work-unit` L40 (criterion text), `process-task-loop` L72 (`_Goal:_`),
  `clean-work-unit` L54 ("task lines are historical records — NEVER modify"), `draft-design` L162 (consolidation
  "must not silently drop substance"), `archive-work-unit` L128 (post-`Shipped` Release Notes are errata only),
  `strategy-adr-methodology` (accepted Decision / Context / original Consequences), `strategy-task-list-formatting`
  L369. It is the largest unparented family the sweep has produced, and the recommended remedy is a constitutional
  statement rather than seven markers.

**The region-local set** — sites whose rule exists nowhere else in the corpus:

1. `integrate-external-content` L23 — external content read before it is wired in (`Q`).
2. `create-spec` L151 + L168 — **"Not 'checked, passes' — 'checked against the _Configurability_ principle —
   passes'"** (`C`). The disclosure _form_ of the discharge protocol, stated nowhere else.
3. `create-spec` L251 — "This approval means the spec is correct; it does **not** authorize the irreversible finalize
   actions" (`E`). A scope-of-authorization rule with no parent.
4. `draft-design` L131 — "the agent does not produce a finished design for sign-off" (`I`).
5. `session-recover` L16 — run the audit "**even if your remaining context feels sufficient**" (`C`).
6. `maintain-project-docs` L92 — "Have AI read both sections and confirm no ambiguity" (`M`).
7. `setup-merge-gate` L136 — verify a mode-only change classifies `reviewed` and is **not** armed (`M`).
8. `setup-release-wrapper` L162 — "The invocation must NOT be a nested CLI subprocess" (`M`).
9. `setup-release-wrapper` L363 + L198 — "Agents do not write the marker file directly" (`C`/`K`).
10. `setup-arc-clearance` L52 + L73 — the working tree is the agent's own output, and a person's statement that they
    configured it is not the check (`C`).
11. `run-errand` L246 — "Never infer the exemption from absent or malformed WU state" (`A`).
12. `verify-work-unit` L40 + `process-task-loop` L72 — the `K2` gate sites (see § The criterion question below).

**Revised Task 4.5.a footprint.** Task 4.2 proposed eighteen with one item pending. After this region: **six unmarked
parents + five surviving method-region-local + eight strategy-region-local + twelve workflow-region-local =
thirty-one**, plus a recommended constitutional statement for `K2`. Eight of the twelve workflow-region-local sites
sit in documents that install nowhere.

### The criterion question — Task 4.2's pending item #6, resolved

Task 4.2 held its marker #6 (`strategy-task-list-formatting` § Success Criteria — "criterion text is immutable")
pending Task 4.3's read of `process-task-loop`, on the theory that the sibling "`_Goal:_` is preserved verbatim" rule
might move the marker into the workflow region.

**The corpus carries three instances of the rule, not two, and the answer is neither option.** The strategy states it
mid-paragraph in an _authoring-time_ formatting section; `verify-work-unit` L40 states it as its own bolded paragraph
in Step 2, immediately before the marking act; `process-task-loop` L72 states the `_Goal:_` sibling at the `[x]` step.

**The marker lands at the two workflow gate sites.** The corpus's own placement doctrine decides it —
`strategy-knowledge-evolution` Principle 1 (`P`, Task 4.2's region-local marker #8): a hard constraint is
always-loaded or placed at the gate site firing its operation, never mid-document on-demand. The operation this rule
gates is the marking act. `STRATEGY-INDEX` fires `strategy-task-list-formatting` "when creating or restructuring task
lists" — a verifying session never loads it, so a marker there is unreachable at the moment it binds. The strategy
keeps the statement as authoring context; it is the restatement, and the workflow sites are the parents. Both sites
are then instances of `K2` above, which is why the recommended remedy is a constitutional statement covering all
seven rather than a marker at each.

### Findings

**1. The reclassification rate is stable across regions; gate density is what varies.** Methods 55%, strategies 71%,
workflows 74%. Task 4.1's finding 1 predicted the discriminator's reach would widen with density and Task 4.2 found
the opposite; this region settles it. Procedural volume does not raise the invariant rate — workflows are
overwhelmingly craft, dispatch tables, and rendering templates (reasons 3/4/5 dominate, as in the strategies). What
the workflow region contributes is not a higher _proportion_ of invariants but four times the raw _count_, because it
is where the corpus's gate sites physically live. The practical consequence for Task 4.5: the marker footprint tracks
gate sites, not document count or line count.

**2. Every unmarked constitutional parent names its own invariance in prose.** § Review-Increment Invariant (new
here), § Scaled Process, Invariant Discipline, § Discovered Work Routing's "The core invariant", § Commit Discipline —
Rebase scope, and `AGENT-BRIEF.ARC` § Review authority. Four of the five put the word _invariant_ in a heading or in
bold and then carry no marker, while narrower instances beside them (§ Task interlock, § Merge authority, the amend
clause) are marked. A reader learning the notation from the marked sites would conclude these five are defaults. This
is now the sweep's most-repeated structural result and it is a Phase 3 / Phase 5 obligation, not a Task 4.5.a one.

**3. The corpus states the sweep's own discriminator about itself, twice, from opposite directions.**
`archive-work-unit` L128 marks post-`Shipped` Release Notes edits errata-only and adds "**No mechanical enforcement;
convention only**" — a rule that knows it backs nothing and is backed by nothing. `session-handoff` L297 requires the
handoff anchor be taken from the probe's `head.value.hash`, and SESSION-NOTES is gitignored, so no check can ever
catch a wrong one. Task 4.1's finding 6 (_a rule backed by a mechanical check is safely a default; a rule that backs a
check is an invariant_) has now been confirmed independently in all three regions, and this region adds the
degenerate case the earlier two did not produce: rules that are neither backed by nor backing a check, where the
classification rests entirely on whose fact discharges it.

**4. Family `M` lives outside testing, and its clearest instances are in setup workflows.** Task 4.1 found `M` only
in `testing-standards`; Task 4.2 found it nowhere. This region has six instances, and three are pure: `setup-merge-gate`
L136 requires verifying that a mode-only change classifies `reviewed` and is **not** armed — _the negative test that
proves the gate can fail_; `setup-release-wrapper` L162 forbids running the verification as a nested CLI subprocess,
because a nested invocation cannot observe the permission boundary the test exists to exercise;
`maintain-project-docs` L92 instructs "Have AI read both sections and confirm no ambiguity" — a verification whose
witness is the agent being tested. The last is a defect in the document, not merely a marker site.

**5. `prepare-commits` commits with no class tag, and the reason is an unresolved classification.** It contains zero
occurrences of `interlock`, `approval`, `approve`, `await`, or `permission`, and neither does the `arc-commit` skill
that owns it; it stages and commits at § 6. This is **not** a family-`P` violation — § Review-Increment Invariant is
always-loaded, and Principle 1 is satisfied by "always-loaded **or** at the gate site." What is true is that this is
the only committing workflow in the region whose commit step carries no class tag, so per § Workflow class-tag
routing it silently defaults to raw `git` and never reaches the release wrapper. Whether that is correct turns on a
question the document does not answer: is the complex-commit path **workflow-emitted** (like its eleven siblings) or
**off-workflow** (§ Release-wrapper invocation: "anything not emitted by a workflow — use raw `git`")? It is literally
a workflow, invoked by a skill, committing work that spans sessions — yet its untagged step behaves as off-workflow.
The finding is the unresolved classification at the one site where the two readings diverge mechanically.

**6. A separately-loadable reference carries invariant text with no marker and no parent in view.**
`session-init/probe-envelope.md` is loaded on demand, by session-init's own instruction, and contains six
invariant-force sentences ("renders `recommendedPromptText` verbatim", "never auto-removed", "never `-D`", "never
auto-run"). Each restates a rule owned by `session-init`, so the concentration precedent puts the marker there, not
here — but an agent that loads only the reference meets the obligation with neither the marker nor its parent in
view. This is the first instance the sweep has found where the concentration precedent and family `P` pull in
opposite directions, and Task 4.5 has to choose.

**7. Three live defects surfaced, none of them this work unit's to fix.** Recorded for routing, not action:

- `park-work-unit` L78 links to `decompose-work-unit.md#the-park-exit-block`; that heading does not exist. The CLI
  transformation removed the section and left the cross-reference. `lint:arc:section-refs` did not catch it.
- `01_verify-and-configure` gives two different Codex event sets for the same install: Path 1 (L191) says
  `PostToolUse`; Path 2 (L311) says `PostCompact(manual|auto)`. The shipped recipe
  (`harness-hooks/codex-cli/hooks.json`) contains `PostToolUse`, so the guided-manual arm instructs a wrong install.
- `draft-design` L162 files "must not silently drop substance" under a heading reading "Three leans, never hard
  gates" — the limb and its heading disagree about their own force, which is precisely the ambiguity D1 exists to
  remove.

**8. `decompose-work-unit` was classified as interim and must be re-run.** Task 4.1 finding 7 flagged it as
mid-transformation; that is still true — only slices 01–03 of `decompose-transform-integrity` have landed. Its four
markers are recorded against a 39-line preflight stub whose park-exit choreography is the section finding 7 reports
as missing. Re-run this document's inventory once the remaining slices land; nothing else in the region is
mid-transformation.

---

## Corpus-wide classification sweep — the extension region (Task 4.4)

Every extension document read for imperatives the default-unless-marked reading reclassifies. **39 imperatives across
13 documents: 16 take a marker, 23 stand as accepted reclassifications.** One document carries no marker candidate at
all (`post-context-load`). The region's expected yield was the lowest of the four and its raw counts are — but its
_rate_ is not, and the two families it produces are both unparented.

### The corpus, re-derived

13 documents, excluding the directory `README.md` index on Task 4.1's precedent — a decision this region turns out to
contradict, recorded as finding 2 below. 311 lines total, the smallest region by an order of magnitude. The two
copies stand in two relationships:

- **11 byte-identical mirrors.** Classify from either copy; a marker syncs.
- **2 divergent pairs** — `post-pr-open` and `pre-merge`. In both, the instance's `.actions` carries a numbered
  "Future project actions" placeholder where the shipped copy carries `[No extension configured]`, and that
  placeholder restates the halt-on-fail contract inside an action that never fires (`active: false`). The shipped set
  is the corpus, so those two lines are **not** counted; the contract blocks above them are identical in both copies
  and are where every imperative in both documents sits.

**No recipe drift — the first region with none.** All 13 plus the `README.md` are listed in `init-recipe.json`, so
every marker this region proposes reaches every project. Methods had 3 non-installing documents and workflows 8; the
extension region has zero, which makes its blast radius and its coverage claim the same set for the first time.

**Every extension in the region is inert.** All 13 carry `active: false`, and 11 carry a literal
`[No extension configured]`. The region's imperatives are therefore contracts binding _content that does not exist
yet_ — see finding 1.

### Basis codes

Tasks 4.1–4.3's codes carry forward. `E`, `G`, and `O` fire; `A` fires once, folded into a compound. `B`, `C`, `D`,
`F`, `H`, `I`, `J`, `K`, `L`, `M`, `N`, `P`, `Q` do not fire anywhere in this region. Two families are new, and both
are characteristic of the region rather than incidental to it:

| Code | Family (new in this region)                                                                      |
| ---- | ------------------------------------------------------------------------------------------------ |
| R    | A configured extension supplements the core procedure; it never replaces it                      |
| S    | An action sequence halts at its first failure; later actions do not run on an unmet precondition |

Accepting reasons are unchanged from Task 4.1 (1–6).

### Per-document sweep

| Document                       | M | A | Marker candidates (`[invariant]`)                                                                                           | Accepted reclassifications (the default stands)                                                                                            |
| ------------------------------ | - | - | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `post-context-load`            | 0 | 1 | —                                                                                                                           | use for team documents, external tool state, environment checks (4)                                                                        |
| `post-pr-open`                 | 2 | 3 | does not infer branch or work-unit state (O); execute in authored order and halt before later actions on failure (S)        | callers supply opaque coordinates, host adapters validate (4); idempotent across create and re-entry (5); platform-neutral cardinality (4) |
| `post-task-completion`         | 1 | 1 | the core `[x]` marking and description update are non-negotiable — the extension adds to them, never replaces them (R)      | use for tracker updates, notifications, ceremony steps (4)                                                                                 |
| `post-task-quality`            | 2 | 1 | runs in addition to Tier 1, not instead of it (R); the agent does not mark the task complete if any check fails (gate)      | must return a clear pass/fail signal (4)                                                                                                   |
| `post-unit-quality`            | 1 | 1 | supplements Tier 2 rather than replacing it (R)                                                                             | must return a clear pass/fail signal (4)                                                                                                   |
| `post-work-unit-activate`      | 1 | 1 | the built-in absorption write and ROADMAP regen are the only PM artifact updates (R)                                        | when `active: false` the workflow proceeds naturally (4)                                                                                   |
| `post-work-unit-archive`       | 1 | 1 | the built-in ROADMAP regen is the only PM artifact update (R)                                                               | when `active: false` the workflow proceeds naturally (4)                                                                                   |
| `pre-activation`               | 1 | 2 | halt-on-fail stops the workflow and awaits user direction, with bypass only on user signal (S, G)                           | fires once per activation (4); use for plan-quality and alignment verification (4)                                                         |
| `pre-commit-review`            | 1 | 2 | sequential execution with halt-on-fail (S)                                                                                  | the extension-vs-hook layer boundary (4); keep mechanical per-file checks in git hooks (3)                                                 |
| `pre-merge`                    | 2 | 2 | sequential execution with halt-on-fail (S); no commit or push between the settled checkpoint and merge authorization (E, A) | actions read-only, idempotent, or retry-safe (5); fire after settlement and after any head update (4)                                      |
| `pre-pr-open`                  | 2 | 3 | does not infer branch or work-unit state (O); execute in authored order and halt before later actions on failure (S)        | callers supply opaque coordinates (4); retry-safe because creation can fail after they run (5); platform-neutral cardinality (4)           |
| `pre-push-review`              | 1 | 3 | sequential execution with halt-on-fail (S)                                                                                  | `.actions` should stay lightweight at push frequency (3); reserved-for-future, empty by default (4); use for last-mile push checks (4)     |
| `pre-spec-finalization-review` | 1 | 2 | sequential execution with halt-on-fail (S)                                                                                  | the self-review alone governs until a team activates this (4); the named cadences are precedents, ARC enforces none (5)                    |

### The collapse

The 16 candidates are five rules, not sixteen:

| Rule                                | Instances | Parent                                                                       |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `S` — halt at first failure         | 7         | **none anywhere in the corpus**                                              |
| `R` — supplement, never replace     | 5         | `extensions/README.md` L10 — inside the excluded index                       |
| `O` — does not infer supplied state | 2         | no constitutional parent; a marker sits in the strategy region (Task 4.2 #3) |
| the gate rule                       | 1         | `DEV-RULES.ARC` § Quality gate failure — **marked**                          |
| exact-head before merge (`E`, `A`)  | 1         | `DEV-RULES.ARC` § Review-Increment Invariant — unmarked, already in the five |

`S` is the sharper of the two new families. Its only statements outside `extensions/` are **workflow fire-point
restatements** — `init-work-unit` L330, `run-errand` L126 / L182 / L268 — which Task 4.3 did not flag, so the family
is the second the sweep has found with instances in more than one region and a parent in none. Unlike `K2`, the
restatements are not merely textual: each fire point is the site where an agent decides whether to continue past a
failed action, which is the moment the rule binds.

### Where the region's markers sit

Both new families are region-local, and both resolve to the same place — the `README.md` this sweep excluded:

1. `README.md` L10, "Extensions add behavior to workflows; they do not replace existing steps" — the existing parent
   for `R`, needing only the marker. Covers all five instances.
2. `README.md` — no `S` statement exists to mark. The loading-model paragraph is where one belongs, since it already
   describes how `.actions` execute. Authoring it is a write, not a retrofit.

**Revised Task 4.5.a footprint.** Task 4.3 proposed thirty-one. After this region: **thirty-three** — the same
thirty-one plus an `R` marker and an authored-then-marked `S` statement, both in `extensions/README.md`. No document
in the region takes a marker of its own; every instance restates one of the five rules above. Both additions install
everywhere, unlike eight of Task 4.3's twelve.

### Findings

**1. The region's rules bind content that does not exist.** All 13 extensions are `active: false` with empty
`.actions`, so every imperative here governs actions an adopter has not yet authored. The classification is unchanged
by that — a contract that will bind future content is exactly the case `Q` was minted for in Task 4.3, one step
earlier in the same pipeline — but it makes the region the only one where the marked text and the governed text are
written by different parties at different times. The practical consequence for Task 4.5.a: a marker here is read at
_authoring_ time by someone extending ARC, not at execution time by an agent, which is the first audience shift the
sweep has encountered and is worth stating wherever the notation is documented.

**2. Task 4.1's `README.md` exclusion is a defect, and this region is where it bites.** The precedent was set against
three directory indices that were pure link lists. `extensions/README.md` is not: it carries the loading model, the
`active: true` gate semantics, and the region's only constitutional statement — "Extensions add behavior to
workflows; they do not replace existing steps." Excluding it meant the sweep classified five restatements of a rule
whose parent it had declined to read. The exclusion did not change any verdict, and the other three indices remain
correctly excluded; what it changed is where the marker lands. Re-check the strategy and method `README.md` files for
the same shape before Task 4.5.a treats the precedent as settled.

**3. The reclassification rate does not stabilize.** Methods 55%, strategies 71%, workflows 74%, extensions 59%.
Task 4.3's finding 1 read the 71/74 pair as evidence of a stable rate with gate density as the only variable; four
points do not support that. What actually tracks the rate is the proportion of **craft** content (reason 3), which is
the reason that dominates in strategies and workflows and is nearly absent here — this region produced two instances
of reason 3 in 23 accepted reclassifications. Contract text is definitional or binding with little in between, so
its rate sits with the methods. Task 4.5.b's enabling category is the right home for this: definitional-but-load-
bearing text is precisely what neither `constraint` nor `explanatory` captures, and it is 15 of this region's 23
accepted rows.

**4. The two divergent pairs restate a contract inside an inert action.** `post-pr-open` and `pre-merge` carry, in the
instance only, a numbered action whose body repeats the halt-on-fail rule stated four lines above it in the same
file. It is unreachable (`active: false`), it is not in the shipped copy, and if an adopter ever populated `.actions`
they would be appending after a placeholder that already claims to be action 1. Not this work unit's to fix and not a
marker site — recorded because it is the only place in the region where the two copies disagree, and the disagreement
is one copy carrying text that cannot execute.

---

## The enabling content category (Task 4.5.b)

The compression method sorts an always-loaded surface's content two ways: **constraint** (an obligation the reader
must carry) and **explanatory** (everything else, demotable to an on-demand destination). That split is sound on
the two rules files it was built against, because they are constraints — `constraint? no` reliably means demotable
there. It fails on an orientation surface. Applied naively to `AGENT-BRIEF.ARC`, almost nothing is a prohibition,
so almost the whole file classifies demotable — including the vocabulary block, which is the file's largest single
part and the **least** demotable content in the always-loaded set, because `work unit`, `Class`, `interlock`, and
`review increment` are what make the rules that stay readable at all.

So a third category sits beside them: **enabling** content, carrying no obligation itself but a precondition for
interpreting content that does.

### The corpus evidence — accepting reason 4

The category was named from one file's vocabulary block. The sweep supplies independent evidence, and it arrives
under a different name: **accepting reason 4** — "definitional, schema, or eligibility statement rather than an
obligation." Reason 4 is a reclassification code, so every row carrying it is content the sweep judged safe to
leave unmarked _because it states no duty_. That is the enabling category's own definition arriving from the
opposite direction.

Its distribution is not uniform, which is what makes it a finding rather than a restatement:

| Region     | Reason 4 | Accepted rows | Share      |
| ---------- | -------- | ------------- | ---------- |
| Methods    | 17       | 63            | 27%        |
| Strategies | 40       | ~122          | 33%        |
| Workflows  | —        | 635           | unmeasured |
| Extensions | 17       | 23            | 74%        |

The workflow row is empty because that region's per-document table records marker families only, with no
accepting-reason breakdown — a gap in the record, not a zero.

**Correction to Task 4.4 finding 3.** That finding cited "15 of this region's 23 accepted rows." Recounted against
its own table, the figure is **17 of 23**. The direction of the finding is unchanged and in fact strengthened; the
count was wrong. This is the fourth time a figure carried in this record has needed re-derivation, and the same
remedy applies — count from the region table, not from the prose that summarized it.

### What the distribution shows

Extension contracts are almost pure definition: they say what an extension may do, when it fires, and what shape
its output takes. They are also the region with the least craft content — reason 3 fires twice in 23 rows against
31 of ~122 in strategies. So the two reasons move **against** each other, and that is the discriminator the
category needs. Craft content is genuinely demotable: a wrong call there costs quality, and the cost surfaces in
the work. Definitional content is not: a wrong call costs the **meaning** of every rule that uses the term, and
nothing surfaces at all.

That asymmetry is the whole argument for naming the category. A demoted constraint fails loudly — at the operation
it guarded, on the first session that reaches it. A demoted enabling definition fails silently and everywhere: the
rules that depend on the term stay in place, stay readable, and quietly mean less. There is no gate to trip and no
symptom to notice.

`AGENT-BRIEF.ARC` already carries a live instance. Its `Review increment` entry restates rule content from
`DEV-RULES.ARC` § Review-Increment Invariant and § Task interlock, and the restatement has gone lossy — the
deferred-review clause names `on-task-approval` where `process-task-loop` covers `on-task-approval` _and_
`on-workflow` and names the opt-in syntax. The degradation happened without moving the content anywhere.

### What this derivation does not settle

**Reason 4 is an upper bound on enabling content, not a synonym for it.** A schema statement about a config field
an agent reads once is definitional without being load-bearing for any other rule. The category needs a test that
separates a definition other content _depends on_ from one that merely _is_ a definition, and the sweep did not
have to draw that line — a reclassification is safe either way, so nothing forced the distinction. Applying the
compression method to an orientation surface is what forces it, and that audit belongs to
`orientation-surface-compression`.

Two constraints carry into that derivation. The first is the boundary above: enabling versus explanatory-that-
merely-reads-as-helpful is the unsettled question, and reason 4's rows are the candidate pool to draw it against,
not the answer. The second is that `analysis-load-set-scoping`'s demotion precondition already covers this
territory from the negative side — its **irrelevance** sub-case carries a recorded unresolved defect, and
orientation content is exactly the class that defect cannot classify. Enabling content names the positive property
whose absence that test was trying to detect. Settling one without reading the other repeats the failure mode
`WORKING-MEMORY` records for this whole area.

---

## The two unparented families' statements (Task 4.6.a)

Two families the sweep found with instances in more than one region and a parent in none. Both take a
constitutional statement rather than a marker per instance, and both had to clear Success Criterion 1 first.

### The Criterion 1 check

Criterion 1 does not ask whether a statement is useful; it asks whether a reader could reach the same
classification from § Rule Authority **without** it. Reachable → the statement is ergonomic and permitted.
Unreachable → the discriminator failed to derive what it claims to, and that is a finding rather than a licence to
write the rule anyway.

**`K2` is reachable, on the check-integrity backstop.** Pre-commitment text is the target the agent's own work is
judged against, so rewriting it to match the outcome makes a check pass by moving its target — the limb that
already settles self-attestation, approached from the other side. The statement is placed as a third instance of
that limb rather than as a new rule, and says so in its own first clause.

The reachability is not uniform across the seven instances, which is the argument for a parent rather than against
one. The two gate sites (`verify-work-unit`'s criterion text, `process-task-loop`'s `_Goal:_`) reach the backstop
directly. `clean-work-unit`'s historical-record rule and `archive-work-unit`'s errata-only rule reach it through
self-attestation — altering the account of realized work attests it. `strategy-adr-methodology`'s accepted
decision reaches it through the **other** limb, the one reserving decisions that commit someone. `draft-design`'s
"must not silently drop substance" was counted here as the thinnest instance and **is not one at all** — see
§ `draft-design` L162's force disagreement, which resolves it as a default on reason 1. Five instances, three
routes. A reader re-deriving per site gets
the right answer each time and pays for it every time; naming the shape once is what the parent buys.

**`S` is reachable at its gate instances and thin at the rest.** Five of the seven — `pre-activation`,
`pre-commit-review`, `pre-merge`, `pre-push-review`, `pre-spec-finalization-review` — are gates, so an agent
deciding a failure does not matter is judging whether a check applies to its own work, which the backstop forbids
outright. `pre-pr-open` and `post-pr-open` are different: their halt rule protects an ordering assumption rather
than a check, so the derivation there runs through correctness rather than authority. Recorded rather than papered
over — the statement's force is strongest exactly where the sweep's own evidence is.

### Where each landed, and the audience question

**`K2` → `DEV-RULES.ARC` § Rule Authority**, immediately after the self-attestation paragraph, because it is the
same limb and reads as its third instance. Always-loaded, which is a real debit against Criterion 3 and is
recorded below rather than absorbed.

**`S` → `extensions/README.md`'s loading-model paragraph.** Task 4.5.a.ii routed it here after finding no statement
existed to mark; this is the write. Its instances split across two audiences — the extension contracts bind an
author populating `.actions`, while the four workflow fire points (`init-work-unit` L330, `run-errand` L126 / L182
/ L268) bind an executing session deciding whether to continue past a failure. **One statement covers both**, and
the reason is placement rather than economy: each fire point already states `halt-on-fail` inline and names its
discharge ("fix-and-retry or explicit-invoke bypasses"), so `strategy-knowledge-evolution` Principle 1 is
satisfied at every site an executing session actually reads. The statement supplies the parent those restatements
lacked; it does not have to reach the session, because the session already meets the rule locally.

The fire points' named bypass is worth stating precisely, and the statement does: resuming past a halt is the
developer's call. That is not a discharge the agent may take — it is the holder making a reserved decision, which
§ Rule Authority already frames as the rule working rather than a waiver.

### Consistency with the concentration precedent

Both placements put the marker at the family's parent and leave the restatements unmarked, which is the precedent
every other marker in this work unit follows. It also settles, by consistency rather than by argument, the choice
Task 4.3's finding 6 left open — `session-init/probe-envelope.md`'s six invariant-force sentences restate rules
`session-init` owns, and they stayed unmarked when Task 4.5.a.ii applied the region-local set. Concentration won
there implicitly; it wins here explicitly. **What remains genuinely open is whether that is right for a
separately-loadable reference**, where an agent can load the restatement without ever seeing the parent. That is
the one case where Principle 1 and the concentration precedent do not merely appear to conflict — they reach
different answers — and no task in this phase holds it.

### Criterion 3 debit

`DEV-RULES.ARC` grows by **4 nb** for the `K2` statement. Per the ledger discipline, this is not netted against
anything here — Criterion 3 measures the tier-1 full-read set end to end at verification, and this is one more
entry on the spending side of that measurement, alongside § Rule Authority's own 37 nb and the index leg's +16.
The `S` statement costs the ledger nothing: `extensions/README.md` is not tier-1.

---

## The separately-loadable reference (Task 4.6.d)

Task 4.3's finding 6 recorded the one place where the concentration precedent and
`strategy-knowledge-evolution` Principle 1 reach genuinely different answers, and left the choice to Task 4.5,
which closed without making it. `session-init/probe-envelope.md` is the whole class — the only corpus document a
workflow loads by its own instruction rather than through frontmatter. Its six invariant-force sentences each
restate a rule `session-init` owns. Concentration leaves it bare; Principle 1 says the constraint belongs where its
operation fires, and the operation fires for a reader who may hold only this file.

### Decided: concentration ratified, with the reference pointing at its parent

The reference stays unmarked, and its opening now says that **classification** lives with the owning workflow, not
only procedure. The seed was already there — "procedural handling remains in the owning workflow" — so the change
extends one sentence rather than adding a rule.

What this buys: the reader holding one file learns that an obligation they meet here is a restatement whose force
is settled elsewhere, which is the actual harm finding 6 identified. What it avoids: a "mark the copy someone might
read alone" test. Nearly every restatement in the corpus is readable alone if you try, so that test readmits the
52-marker footprint Task 4.1 rejected — and it would spread the notation exactly where D3's concentration
precedent says it must not go.

### The forward-compat check changed the implementation

Checked against `composable-workflows` D3, the session-agenda compiler, because it is the work unit that
restructures both artifacts. Two results, and the first inverted an assumption this decision had been resting on.

**The two artifacts move in opposite directions.** The intuition was that `session-init.md` is the durable parent
and the reference its fragile satellite. It is the reverse. D1's schema-out-of-band rule — "no workflow documents
an envelope slot's shape inline; it cites the slot name" — makes `probe-envelope.md` the durable home for slot
semantics, and `instruction-optimization` plans further expansion of it. `session-init.md` compiles down to a
~120–150-line spine. So a pointer naming a step or section number would name a locus the compile dissolves; the
pointer names **authority boundaries**, which is a section the spine estimate explicitly retains.

**Mechanization is a reclassification trigger, and it reaches at least four of the six.** Under the step
vocabulary an `offer` structurally cannot auto-execute and a `render` carries CLI-precomposed text, so "never
auto-run", "never auto-removed", "never `-D`", and "renders … verbatim" stop being instructions an agent obeys and
become what the step does. This work unit's own most-repeated finding — a rule backed by a mechanical check is
safely a default, a rule that backs a check is an invariant, confirmed independently in all three swept regions —
then reclassifies them. **Marking them today would be wrong later, not merely misplaced.**

That is the more interesting half of the check, because it reaches the same conclusion as the concentration
argument from an unrelated direction: the pointer survives mechanization, a marker does not. The trigger itself
generalizes past these six — any rule moving from prose to mechanism has the same latent drift — and is captured
to `composable-workflows` rather than resolved here, since deciding whether it is a one-time pass or a standing
obligation is that work unit's call.

---

## `draft-design` L162's force disagreement (Task 4.6.b)

"A coherence rewrite must not silently drop substance" sat as the third of three bullets under a heading reading
"Three leans, never hard gates." The limb reads absolute; the heading says nothing here is. The sweep recorded it
as a live defect and as a `K2` instance.

### The heading was right, and the marker candidate was wrong

The three bullets are not the same kind — the first two govern **whether and when** to consolidate, the third
governs **what a consolidation may cost** — and the obvious fix was to split the third out and mark it
`[invariant]`. That fix is wrong, and the reason is in the rule's own text.

It says "preserves each settled decision and **surviving** detail," and the section's premise is that a long draft
"accretes superseded sketch beside current design." So removing superseded material is what a consolidation is
_for_. The discharging fact — this layer was superseded by that one — is recorded by the loop itself ("amend the
draft as each open decision settles"), which makes it a fact the agent **reads** rather than invents. Under
§ Rule Authority that is dischargeable, so the rule is a **default**, and the heading's "never hard gates"
classifies it correctly.

The load-bearing word is _silently_. The failure is substance disappearing unremarked, not substance being
removed. So the defect was never the heading and never the force — it was that the discharge went unstated, which
left "must not" reading as absolute and put it in apparent conflict with its own heading. The fix states the
discharge: drop superseded sketch deliberately and name what went. The title moves from "No detail loss" — which
over-claims, and is half of what made the limb read absolute — to "No silent detail loss."

**This is an accepted reclassification on reason 1** (the rule names its own discharging fact), reached only after
the fact was stated. Before the fix the rule did not name it, which is why the sweep read it as a marker
candidate: at the time, correctly.

### Correction to Task 4.6.a's Criterion 1 record

§ The two unparented families' statements lists this site as `K2`'s thinnest instance, reaching backstop limb two
because "what it protects is the developer's contributed substance." That is superseded. Disclosure is precisely
what keeps it out of limb two — a named drop leaves the decision with the developer, so nothing is being decided
on their behalf. `K2`'s reachability rests on six instances, not seven, and the family's parent does not cover
this site: the parent forbids rewriting a target **to match what was built**, while this rule guards accidental
loss during a rewrite. Different failure, adjacent shape.

The correction does not weaken Task 4.6.a's conclusion — three routes across six instances is still the argument
for a parent — but the record should not carry a seventh instance the family does not own.

---

## The two configuration surfaces (Task 4.6.c)

`methods/README.md` said "Contracts are advisory: your override should satisfy the same invariant as the default."
`extensions/README.md` says core behavior "is **non-negotiable** — this extension adds to it, not replaces it."
Read together, two sibling configuration surfaces appeared to answer one question — may a project's configuration
replace core behavior? — in opposite directions.

### They do not conflict; the apparent conflict was manufactured by a lossy restatement

The two mechanisms answer **different** questions.

- A **method** is a pluggable _how_ inside a fixed _what_. The contract states what must be accomplished, the
  default states how ARC does it, and a project may substitute its own how. What is replaceable is the
  implementation; the contract is not.
- An **extension** is an _addition_ at a declared fire point. It implements no contract, so it has nothing to
  substitute — the workflow's own steps are not its to remove.

Substitution-within-a-contract and addition-at-a-point do not overlap, so neither posture governs the other and
there was never a question of picking one.

**What produced the appearance of conflict is a lossy compression, and the authoritative source was already
right.** `strategy-configurability-architecture` § Mechanism makes two separate claims: the contract is "the
invariant that both the default and any override **must** satisfy," and — as a distinct sentence about
enforcement, not force — "Contracts are advisory, not mechanically enforced." The README collapsed both into one
clause and lost the distinction twice over: `must` became `should`, and `advisory` attached itself to the
_contract_ instead of to the _enforcement_. In ARC's vocabulary "advisory" means non-binding, so the compressed
sentence reads as "the contract does not bind you" — the exact opposite of the strategy it restates, and precisely
the unenforced-equals-optional confusion this work unit exists to remove.

### The fix, and a third site

Both lossy sites now separate force from enforcement:

- `methods/README.md` — an override replaces _how_, never _what_; the contract is the invariant both satisfy;
  nothing mechanically enforces that, "which leaves it unchecked rather than optional."
- `integrate-external-content` L70 carried the same phrase with the same `should`, and is the same concern rather
  than a rider, so it took the same correction in the same pass.

`extensions/README.md` is unchanged and needed no edit — its statement is accurate, bounded to its own mechanism,
and now carries the family `R` parent Task 4.6.a wrote. `adr-005` states the distinction correctly already and is
an accepted decision record besides.

**No marker on either fix.** Both statements sit on the _configurability_ axis — what a project may set — and
§ Rule Authority is explicit that this is a different axis from dischargeability and that configurability is never
itself a discharge. A `[invariant]` marker on a project-facing obligation would blur exactly the two axes the
register spent its budget separating. Recorded as a deliberate call rather than an omission.

### The pattern this is the second instance of

An always-loaded or high-traffic surface restating a rule from its authoritative source, and the restatement
going lossy without moving. The first is `AGENT-BRIEF.ARC`'s `Review increment` entry, whose deferred-review
clause names `on-task-approval` where `process-task-loop` covers `on-task-approval` _and_ `on-workflow`. Both
degraded in place, silently, with no gate and no symptom — which is the enabling-content failure mode from Task
4.5.b arriving in a second guise. Two instances is not yet a pattern worth a mechanism, but the shape is now
recorded twice, and `orientation-surface-compression` inherits the first one.
