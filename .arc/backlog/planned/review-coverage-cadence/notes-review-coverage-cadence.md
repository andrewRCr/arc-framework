# Notes: review-coverage-cadence — seam-lifecycle review evidence

Field evidence behind `draft-review-coverage-cadence.md`: what eight complete standard passes over one large
`sensitive` change set actually found, and where each later finding sat relative to the fixes before it. Gathered
2026-10-16 from the review gate's local operation records for `seam-lifecycle`.

## Source

- **Change set:** `feat/seam-lifecycle` against `main` at diff base `51483edc4`; 326 files, 15,664 insertions and
  2,032 deletions at the first reviewed head. Routing facts: `code-bearing`, `sensitive`, `ordinary` determinacy,
  `self`-owned, `ordinary` surface; route `required` / `full-final`.
- **Passes:** eight standard passes, each `requestedCoverage: complete`, run by the delegated local evaluator as a
  chunked review over 11 contract-cohesive chunks plus an aggregate. Pass 8 ran past the configured ceiling under an
  Owner-approved extra pass.
- **Records:** the lane-progress record lists each pass's head and response; each pass's approved disposition set in
  the review gate's evidence store carries its findings with loci, severities, and dispositions. These are
  machine-local under the repository's `.git/arc/review-gate/`, so this file keeps what the draft needs from them.

| Pass | Reviewed head | Findings | Fixed | Rejected | Fix round after it (changed lines, files) |
| ---- | ------------- | -------- | ----- | -------- | ----------------------------------------- |
| 1    | `4ce89a564`   | 18       | 18    | 0        | 954, 51                                   |
| 2    | `7de994825`   | 19       | 18    | 1        | 1,147, 54                                 |
| 3    | `f685c6619`   | 13       | 12    | 1        | 521, 32                                   |
| 4    | `af1c67351`   | 6        | 5     | 1        | 306, 17                                   |
| 5    | `1a9afe348`   | 8        | 7     | 1        | 454, 23                                   |
| 6    | `08730a47b`   | 7        | 6     | 1        | 460, 21                                   |
| 7    | `bbe21e59f`   | 5        | 4     | 1        | 338, 12                                   |
| 8    | `38ff04b23`   | 6        | 5     | 1        | 261, 7                                    |

Each complete pass re-read about 17.7k changed lines; each fix round changed 2–6% of that.

## Method

For every fixed finding in passes 2–8:

1. Parse its locus — the file and line ranges the evaluator cited — at the head that pass reviewed.
2. Blame those lines to the commit that last wrote them, and map the commit to the original candidate (at or before
   pass 1's head) or to fix round _k_ (between pass _k_'s and pass _k+1_'s heads).
3. Diff the previous pass's head against this pass's head, and test the locus against that latest fix delta: inside a
   hunk, or within 25 lines of one in the same file.
4. Assign one bucket, first match wins:
    - **A** — inside the latest fix delta, by blame or hunk overlap.
    - **B** — within 25 lines of the latest fix delta in the same file.
    - **C** — in code an earlier fix round wrote, so at least one complete pass had already read it.
    - **D** — original code, in a defect class an earlier finding already exposed: a sibling.
    - **E** — original code, a new defect class.

Buckets A and B are mechanical. The D/E split rests on hand-assigned defect classes, read from finding titles and
issues across all eight passes, pass 1 included; check the class column below before leaning on the sibling count.

## Results

| Pass              | A | B | C | D  | E  | Fixed |
| ----------------- | - | - | - | -- | -- | ----- |
| 2                 | 6 | 0 | 0 | 4  | 8  | 18    |
| 3                 | 0 | 4 | 2 | 3  | 3  | 12    |
| 4                 | 0 | 0 | 1 | 4  | 0  | 5     |
| 5                 | 0 | 0 | 0 | 4  | 3  | 7     |
| 6                 | 2 | 1 | 1 | 2  | 0  | 6     |
| 7                 | 0 | 1 | 1 | 2  | 0  | 4     |
| 8                 | 1 | 1 | 1 | 2  | 0  | 5     |
| All               | 9 | 7 | 6 | 21 | 14 | 57    |
| Major or critical | 7 | 3 | 5 | 8  | 9  | 32    |

- **New defect classes dry up.** E is 8 in pass 2, 3 in pass 3, 3 in pass 5, and none after.
- **Both criticals sat at a fix.** p7-05 is in the function round 6 had just changed (B); p8-01 is an incomplete fix
  of p7-05 (A).
- **Siblings are the largest bucket:** 21 overall and 14 of the 27 fixed in passes 4–8. "Failed cleanup loses its
  recovery route" surfaced one or two call sites per pass across passes 5–7; "a Git query runs in the ambient
  repository" surfaced in pass 1, pass 2, and pass 8.
- **Fix code outlived complete passes.** The six C findings sat in fix-round code that one to five complete passes
  had read and passed; p7-02 is round-1 code found at pass 7. Diluted attention on 2–6% of a 17.7k-line read is a
  plausible cause, not a proven one.
- **One rejected finding recurred in every later pass** — mixed archive ordering in the store test helpers, rejected
  in each of passes 2–8 (table below). A complete pass without disposition memory re-litigates adjudicated findings.

### What each policy would have kept

Counterfactual and rough: the real history would have branched once any finding was found earlier.

- **Incremental as ARC's prompt reads today** — review the latest fix range and re-examine earlier findings at their
  loci — keeps A and B: 16 of 57, both criticals among them. It loses C, D, and E: 41, of which 22 major or critical.
- **Incremental plus a sibling sweep** keeps A, B, and D: 37. It loses C and E: 20, of which 14 major or critical,
  11 of the E findings from passes 2–3.
- **Complete through pass 3, then incremental plus a sibling sweep** keeps 20 of the 27 fixed in passes 4–8. The
  other 7 (5 major or critical: three C, two E) fall to a complete pass at the settled head.

## Every fixed finding, passes 2–8

| Pass | Finding | Severity | Bucket | Defect class                     | Title                                                               |
| ---- | ------- | -------- | ------ | -------------------------------- | ------------------------------------------------------------------- |
| 2    | p2-01   | minor    | A      | —                                | Pause notes accept disguised reserved headings                      |
| 2    | p2-03   | major    | A      | former-names/paired-refs         | Reconcile loses former names after retirement                       |
| 2    | p2-04   | major    | A      | git-option-abbrev                | Git previews can close tasks without creating a commit              |
| 2    | p2-05   | major    | E      | ref-ambiguity                    | Equivalent branch links can discard capture exclusions              |
| 2    | p2-06   | minor    | E      | —                                | Task close omits ordinary captured commits from its output          |
| 2    | p2-07   | major    | D      | stale-admission (check-then-act) | Materialize admits a work unit whose eligibility changed            |
| 2    | p2-08   | major    | E      | promotion-recovery               | Recovered promotion can leave its inbox origin unsettled            |
| 2    | p2-09   | major    | E      | replacement-refs                 | Replacement refs can produce unsafe branch-deletion advice          |
| 2    | p2-10   | major    | E      | —                                | Archived work with a retained Candidate cannot be renamed           |
| 2    | p2-11   | minor    | E      | lost-recovery-on-failed-cleanup  | Failed rename rollback loses upstream configuration                 |
| 2    | p2-12   | minor    | D      | former-names/paired-refs         | Finalize derives a task filename from a former name                 |
| 2    | p2-13   | major    | D      | wrong-repo                       | Planning park checks worktree registration in the wrong repository  |
| 2    | p2-14   | major    | A      | stale-admission (check-then-act) | Overlapping archives separate the final member from cohort closeout |
| 2    | p2-15   | major    | D      | stale-admission (check-then-act) | Reopen can act on a task cursor that changed after admission        |
| 2    | p2-16   | minor    | E      | missing-remedy                   | Publication loses the resume remedy for a late pause                |
| 2    | p2-17   | major    | E      | —                                | Production lifecycle binding omits project identity                 |
| 2    | p2-18   | major    | A      | former-names/paired-refs         | Owner reconcile misses renamed paired-spec references               |
| 2    | p2-19   | major    | A      | stale-admission (check-then-act) | Start can overwrite a concurrently changed Class                    |
| 3    | p3-01   | major    | C      | git-option-abbrev                | Amend abbreviations bypass wrapper guards                           |
| 3    | p3-02   | major    | D      | replacement-refs                 | Planning catch-up can strand detached commits                       |
| 3    | p3-03   | major    | D      | stale-admission (check-then-act) | Ref cleanup trusts an unbound retiring head                         |
| 3    | p3-04   | major    | B      | stale-admission (check-then-act) | Publication adopts a different primary generation                   |
| 3    | p3-05   | major    | C      | —                                | An empty subcohort blocks member archive                            |
| 3    | p3-06   | major    | E      | —                                | Renewed publication repeats its own retry                           |
| 3    | p3-07   | major    | E      | logical-work-branch              | Handover can overlook unpublished work                              |
| 3    | p3-08   | minor    | D      | missing-remedy                   | Seeded start omits the in-place retry                               |
| 3    | p3-10   | minor    | B      | missing-remedy                   | Close prechecks discard the unreadable line                         |
| 3    | p3-11   | minor    | B      | missing-remedy                   | Message retry drops requested task closure                          |
| 3    | p3-12   | minor    | B      | logical-work-branch              | Rename changes a retained Errand branch                             |
| 3    | p3-13   | minor    | E      | malformed-input-throws           | Incomplete membership can pass validation                           |
| 4    | p4-01   | major    | D      | logical-work-branch              | Change-request effects can target the retained Errand branch        |
| 4    | p4-02   | major    | C      | stale-admission (check-then-act) | Archive can succeed before closing an eligible parent               |
| 4    | p4-03   | minor    | D      | former-names/paired-refs         | Former-slug reconciliation keeps stale coordinates                  |
| 4    | p4-04   | minor    | D      | missing-remedy                   | In-place materialization loses the holder remedy                    |
| 4    | p4-05   | minor    | D      | missing-remedy                   | Retained remote report omits the owner command                      |
| 5    | p5-01   | major    | E      | graduation-inputs                | Normal store stubs cannot graduate                                  |
| 5    | p5-02   | major    | E      | graduation-inputs                | Spawned graduation uses the in-place occupancy guard                |
| 5    | p5-03   | major    | D      | former-names/paired-refs         | Rename can redirect another owner’s spec reference                  |
| 5    | p5-04   | minor    | D      | lost-recovery-on-failed-cleanup  | Failed rollback loses its recovery action                           |
| 5    | p5-05   | minor    | D      | ref-ambiguity                    | Explicit capture accepts a tag object                               |
| 5    | p5-06   | minor    | D      | malformed-input-throws           | Malformed cohort data aborts healthy status queries                 |
| 5    | p5-08   | minor    | E      | —                                | Generic completed-cohort writes throw                               |
| 6    | p6-02   | minor    | C      | ref-ambiguity                    | A same-named tag falsely blocks task close                          |
| 6    | p6-03   | major    | D      | promotion-recovery               | Promotion retry can adopt an unrelated target branch                |
| 6    | p6-04   | major    | A      | former-names/paired-refs         | Generic rename bypasses paired-reference ownership checks           |
| 6    | p6-05   | minor    | B      | lost-recovery-on-failed-cleanup  | Failed preparation can lose checkout rollback recovery              |
| 6    | p6-06   | minor    | D      | malformed-input-throws           | Malformed archive target throws before its refusal boundary         |
| 6    | p6-07   | minor    | A      | lost-recovery-on-failed-cleanup  | Graduation loses failed spawn-cleanup guidance                      |
| 7    | p7-01   | minor    | D      | lost-recovery-on-failed-cleanup  | Create-new omits failed-cleanup recovery                            |
| 7    | p7-02   | major    | C      | rollback-destroys-foreign-state  | Failed activation deletes a competing branch                        |
| 7    | p7-04   | minor    | D      | lost-recovery-on-failed-cleanup  | Materialization omits failed-cleanup recovery                       |
| 7    | p7-05   | critical | B      | rollback-destroys-foreign-state  | Spawn rollback deletes a changed owner’s checkout                   |
| 8    | p8-01   | critical | A      | rollback-destroys-foreign-state  | Spawn rollback can delete work added under an unchanged claim       |
| 8    | p8-02   | major    | B      | —                                | Remote-only materialize --here can select another remote tip        |
| 8    | p8-03   | major    | C      | former-names/paired-refs         | Renaming a dependent loses its recorded decomposition disposition   |
| 8    | p8-04   | minor    | D      | malformed-input-throws           | Four verbs throw on recoverable malformed metadata                  |
| 8    | p8-06   | minor    | D      | wrong-repo                       | Abandonment can inspect locks in the wrong repository               |

## Rejected findings

| Pass | Finding | Title                                                        |
| ---- | ------- | ------------------------------------------------------------ |
| 2    | p2-02   | Unpublished cohort and work-unit numbers may change order    |
| 3    | p3-09   | Mixed cohort/work-unit archive ordering                      |
| 4    | p4-06   | Mixed cohort/work-unit archive ordering                      |
| 5    | p5-07   | Mixed work-unit/cohort ordering is not required              |
| 6    | p6-01   | Mixed work-unit/cohort ordering is not required              |
| 7    | p7-03   | Mixed archive ordering is not promised                       |
| 8    | p8-05   | Mixed unpublished archive ordering is not a stated guarantee |

## Caveats

- **One change set.** Large, sensitive, and stochastic in its reviewer; a second data point would test the pattern.
- **Loci are the evaluator's.** A finding's cited lines can understate an interaction defect whose cause sits in a
  fix elsewhere; bucket A and B counts are therefore floors for "fix-related".
- **The C mechanism is unproven.** Whether a focused fix check would have caught C findings sooner than the complete
  pass that missed them is untested.
- **Prior art does not settle thresholds.** Inspection practice verifies rework by default and re-inspects on large
  rework or high estimated residual; the often-cited "re-inspect above 5% rework" figure could not be traced to a
  primary source, and no validated stopping rule for repeated LLM review was found.
