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
| Preamble                          | 7  | no    | keep                                                                                                                                                                                                          | —                                                                             | stays     | 0   |
| Contents                          | 11 | no    | cut                                                                                                                                                                                                           | as above                                                                      | firm      | 11  |
| Quality Gates — preamble          | 4  | yes   | keep — zero tolerance                                                                                                                                                                                         | —                                                                             | stays     | 1   |
| Selecting what to run             | 26 | yes   | **keep unchanged — the exemplar**                                                                                                                                                                             | cite as the target shape; change nothing                                      | stays     | 0   |
| The six numbered gate entries     | 35 | mixed | demote the commands behind a one-line retarget of the `quality-gate-commands` passthrough; keep the four constraints `QUICK-REFERENCE` does not carry                                                         | mechanism 1 fires once retargeted                                             | firm      | 28  |
| Testing Requirements              | 10 | mixed | keep the coverage posture; demote the tier and method elaboration                                                                                                                                             | `test-first` / `testing-standards` declarations — fire                        | firm      | 6   |
| Code Quality Principles           | 19 | mixed | cut DRY / SOLID / KISS; **keep YAGNI**, reframed as scope discipline; the TypeScript standards and the pre-public-release posture stay; reseat or rename the heading                                          | register cut 1 — see § Base drift                                             | decided   | 7   |
| Markdown quality                  | 8  | mixed | keep line length and the underfill note; cut the always-run-lint duplication                                                                                                                                  | —                                                                             | firm      | 3   |
| Documentation style               | 12 | yes   | keep the collaborative voice and the reference-link convention; compress the examples                                                                                                                         | —                                                                             | authoring | 4   |
| Workflow prose economy            | 7  | mixed | demote, keeping a one-line obligation                                                                                                                                                                         | `strategy-workflow-authoring` — passive index entry                           | trigger   | 5   |
| Verbs over mechanics              | 5  | mixed | keep the verb-gap capture instruction; demote the rationale                                                                                                                                                   | `strategy-workflow-authoring` — same entry                                    | trigger   | 3   |
| Commit Conventions (self-hosting) | 12 | yes   | keep the scope rule; compress the rationale                                                                                                                                                                   | —                                                                             | authoring | 4   |
| Package-Project Sync              | 24 | mixed | keep the two-copy direction constraint and the npm-spike hazard; demote the hook explanation and the skill-drift hazard                                                                                       | `strategy-package-project-sync` — passive index entry                         | trigger   | 10  |
| Audience Boundaries — preamble    | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Surface taxonomy                  | 19 | yes   | **keep verbatim** — the path lists are the operative content, not prose around it; compressing them trades a quiet-failing rule's precision for 5 nb                                                          | retracted from a 5 nb compression                                             | stays     | 0   |
| Leak patterns                     | 12 | yes   | keep — quiet-failing constraints                                                                                                                                                                              | —                                                                             | stays     | 2   |
| Package-source mirror inheritance | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Relationship to DEV-RULES.ARC     | 8  | no    | cut to a one-line "both apply" — pure cross-reference reconciliation                                                                                                                                          | —                                                                             | firm      | 6   |
| Capture Routing                   | 3  | yes   | keep                                                                                                                                                                                                          | —                                                                             | stays     | 1   |
| Surface agent-side friction       | 14 | yes   | keep the standing instruction; compress the two trigger-class definitions                                                                                                                                     | —                                                                             | authoring | 6   |
| Architecture Decision Records     | 12 | mixed | compress the 3 nb pointer in place; relocate the 8 nb internal-only leak rule into § Audience Boundaries (within-file, not a demotion) — the criteria this row once proposed demoting are not in the instance | none — nothing demotes; `strategy-adr-methodology` is no longer a destination | authoring | 3   |

### Totals

| File                                                 | firm   | decided | authoring | trigger | blocked | residue | Total Δnb |
| ---------------------------------------------------- | ------ | ------- | --------- | ------- | ------- | ------- | --------- |
| `DEV-RULES.ARC` (canonical — ships)                  | 44     | 9       | 19        | 47      | 15      | 8       | 142       |
| `DEV-RULES.PROJECT` (instance — template mirrors it) | 54     | 7       | 17        | 18      | 0       | 6       | 102       |
| **Both**                                             | **98** | **16**  | **36**    | **65**  | **15**  | **14**  | **244**   |

Canonical `firm` and the totals carry Task 3.1's re-measurement (§ Contents 11 → 12); see § Execution
re-measurement against base. Canonical `decided` carries Task 3.3's correction — § Task granularity's Δ5 was
arithmetically impossible against its own disposition (the section is 6 nb, and keeping the heading plus the two
qualitative bullets leaves 4), so the row is Δ2.

Down from the pre-audit 318, then 261, then 246 after the two adversarial passes' corrections below, then 247 at
Task 3.1's re-measurement, then 244 at Task 3.3's. The `P3` tier carries no Δ — its one row (Prefix mapping) was
withdrawn rather than deferred. The `trigger` tier is what D6 gates, and it is now 65 nb across **seven** index
entries.

**`firm` + `decided` is what may be authored against today: 114 nb**, of which 53 is canonical `DEV-RULES.ARC`
and 61 is the instance file. Every correction before Task 3.1 landed in the `trigger`, `authoring`, and `blocked`
tiers; execution is the first to touch `firm` and `decided`, adding 1 to the former and removing 3 from the
latter. The instance share across the whole register is 102 / 244 ≈ **42%**.

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

| Code | Family                                                                                  |
|------|-----------------------------------------------------------------------------------------|
| A    | Coverage and the clean result — a partial pass may not report as a complete one         |
| B    | Evaluator boundary — the reviewing context stays free of author belief                  |
| C    | An agent-side pass is not evidence; nothing attests its own result                      |
| D    | Judgment stays with the primary; a finding is advisory until verified against source    |
| E    | Approval or an explicit authorization precedes mutation                                 |
| F    | Do not manufacture findings — a clean artifact is reported clean                        |
| G    | The offer is not skippable; the person decides                                          |
| H    | Discipline does not scale with `Class`                                                  |
| I    | Never make a decision that commits someone else                                         |
| J    | A machine-read identifier is not the agent's to rename                                  |
| K    | A record of realized work never softens                                                 |
| L    | No item with a known home rests in a capture surface                                    |
| M    | A test that cannot fail is not a check                                                  |

Accepting reasons — why the reclassification is safe:

| Code | Reason                                                                                  |
|------|-----------------------------------------------------------------------------------------|
| 1    | The rule names its own discharging fact                                                 |
| 2    | A mechanical check already catches the violation                                        |
| 3    | Craft or technique — a wrong call costs quality, not evidence                           |
| 4    | Definitional, schema, or eligibility statement rather than an obligation                |
| 5    | A permission or a restraint on the tool, not a duty on the agent                        |
| 6    | The discharge is already codified elsewhere in the corpus                               |

### Per-document sweep

| Document                        | M  | A | Marker candidates (`[invariant]`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Accepted reclassifications (the default stands)                                                                                                                                                                |
|---------------------------------|----|---|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
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
|------------|--------------------------------------------------------------------------------|---------------|
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

**7. One rule reaches past its own stated concern.** `assess-cohort-fit`'s "**Never encode order in the slug**"
justifies itself by opacity ("`model-foundation` is opaque"), but bans ordinals on a slug that is _already_
self-describing, where the stated concern does not arise. The model classifies it `default` correctly; what it
surfaced is that the rule is broader than its rationale. No action here — recorded as the kind of result Goal 6
exists to produce.

---
