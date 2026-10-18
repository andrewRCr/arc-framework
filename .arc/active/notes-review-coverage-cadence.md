# Notes: review-coverage-cadence

What eight complete standard passes over one large `sensitive` change set found, and where each later finding sat
relative to the fixes before it; the prior-art sources; the hosted-review probes; the review call-site inventory; the
chain confirmations; the changes to pre-commitment text; and the neighbors task generation and execution meet.

## Source

- **Change set:** `feat/seam-lifecycle` against `main` at diff base `51483edc4`; 326 files, 15,664 insertions and
  2,032 deletions at the first reviewed head. Routing facts: `code-bearing`, `sensitive`, `ordinary` determinacy,
  `self`-owned, `ordinary` surface; route `required` / `full-final`.
- **Passes:** eight standard passes, each `requestedCoverage: complete`, run by the delegated local evaluator as a
  chunked review over 11 contract-cohesive chunks plus an aggregate. Pass 8 ran past the configured ceiling under an
  Owner-approved extra pass.
- **Records:** the lane-progress record lists each pass's head and response; each pass's approved disposition set in
  the review gate's evidence store carries its findings with loci, severities, and dispositions. These are
  machine-local under the repository's `.git/arc/review-gate/`, so this file keeps what the spec draws on from them,
  gathered 2026-10-16.

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

### How it ended

After pass 8, the Owner directed in conversation a switch to incremental review whatever ARC asked, and the agent —
a Codex session — ran two further rounds incrementally, outside the gate: the `full-final` route offered no
incremental coverage. The final round returned only minor findings. These rounds are not in the records analyzed
above, and how the agent got past the gate's refusal was not recorded.

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

## Prior art sources

Gathered 2026-10-16 by three parallel external-research passes, unverified beyond what each marks. Confidence is
the researchers'; "secondary" means a summary or search result, not the source itself.

### Stopping rules and remaining defects

- **Capture-recapture in inspections.** Eick, Loader, Long, Votta, Vander Wiel, ICSE 1992 (introduced it; from
  memory). Briand, El Emam, Freimut, Laitenberger, "A Comprehensive Evaluation of Capture-Recapture Models for
  Estimating Software Defect Content", IEEE TSE 26(6), 2000 (abstract): below four inspectors no model was accurate
  enough, with substantial underestimation; Mh-JK preferred. Petersson, Thelin, Runeson, Wohlin, "Capture-recapture in
  software inspections after 10 years research", JSS 72(2), 2004 (abstract): proposes CR-based decision points; no
  at-scale use as a re-inspect decision found. Wohlin, Runeson, Brantestam, 1995 (abstract): CR assumptions are not
  fully met, biasing estimates low. Confidence high that few-inspector estimates run low.
- **Transfer.** Repeated runs of one model share blind spots (defects with near-zero detection probability on every
  run), fixes change the population between passes, and matching "the same defect" across passes is itself hard. On
  LLM passes CR gives a lower bound at best.
- **Discovery curves.** No validated application of reliability-growth models to inspection passes, and no tested
  "stop after k quiet passes" rule, was found. This change's classes by pass — 8, 3, 0, 3, then none — mix two
  processes: classes in original code that decay, and fix-induced defects that keep arising with each round.
- **More inspectors or sessions.** Porter, Toman, Siy, Votta, UMD CS-TR-3410 (read in part): N-fold inspection is far
  costlier than one team. Diminishing returns per added inspector or session, with the first sessions yielding most:
  moderate confidence, humans only.
- **Repeated LLM review.** Snyk VulnBench JS 1.0 (vendor blog, read): over five runs, 84.8% of reference-matched
  findings appeared in every run, while 49.7% of the others appeared in only one; small fixtures and a lenient,
  circular reference. SWR-Bench (arXiv 2509.01494, secondary): low run-to-run overlap. "Measuring Determinism in LLMs"
  (arXiv 2502.20747, secondary): output varies even at temperature 0. No rigorous study of ensemble or majority-vote
  code review, or of re-running review after fixes, was found. Low confidence that any of these numbers apply here.
- **What a gate may claim.** A clean complete pass is a heuristic gate, never an estimate: claim no remaining-defect
  figure, no convergence from k quiet passes, and no correctness from agreement across runs. Diversity of reviewer —
  source, model, or framing — moves CR's independence assumption closer to true (inference).
- **Data a later stopping rule would need:** a stable cross-pass finding identity, each finding's origin (fix-related,
  sibling, new class), whether its locus was read and passed before, its detection count across passes, and the lines
  changed between passes. Most of it is derivable later from what `seam-delivery-review` stores per pass — findings
  with loci, and each pass's target — with only the sibling-or-new-class split needing judgment.

### Re-review scope after rework

- **Fagan 1976** (IBM Systems Journal 15(3), 182–211), follow-up: as summarized (the PDF is a scanned image and was
  not read), where under 5% of the material was reworked the moderator may verify the rework alone or reconvene the
  team. "Re-inspect above 5%" appears only in secondary sources (lecture slides, glossaries) without a page. Not
  verified in Fagan 1986, Gilb and Graham 1993, or IEEE 1028; IEEE 1028's follow-up reportedly ends with the review
  leader verifying action items closed, with no quantified trigger. Wikipedia's Fagan summary: trivial fixes may be
  accepted unverified, complicated or critical ones get a team re-inspection.
- **Gerrit** label `copyCondition` and change kinds (`TRIVIAL_REBASE`, `NO_CODE_CHANGE`, `MERGE_FIRST_PARENT_UPDATE`):
  votes carry only across changes proven not semantic
  (<https://gerrit-review.googlesource.com/Documentation/config-labels.html>). **GitHub** branch protection: "Dismiss
  stale pull request approvals" on a diff change; "Require approval of the most recent reviewable push", which GitHub
  calls a compromise next to dismissal. High confidence. Sadowski et al. 2018 (Critique) not obtained.
- **Change impact analysis.** DO-178C §12.1.1 via FAA AC 00-69, and ISO 26262-8 clause 8 via secondary summaries:
  re-verification scoped by impact analysis, widening with assurance level. Medium-low confidence; primary text not
  read.
- **AI review tools.** CodeRabbit: `@coderabbitai review` is incremental, `@coderabbitai full review` re-reviews from
  scratch, `auto_incremental_review` defaults on, `auto_pause_after_reviewed_commits` defaults to 5
  (<https://docs.coderabbit.ai/reference/review-commands.md>). Codex: trailing text after `@codex review` steers focus;
  repeat-review scope is undocumented, and § Codex probe observes it. GitHub Copilot: re-review needs a re-request or
  "Review new pushes", and it "may repeat the same comments" even when resolved.
- **Transfer.** No source covers a reviewer without memory. Interdiff re-review is safe when someone — a moderator, a
  human reviewer, an impact analysis — supplies the unchanged remainder's context; a fresh LLM pass has none unless the
  fix check carries it.

### Re-review after base movement

Gathered 2026-10-16 at source grounding, when the incremental supplemental pass proved unrunnable (spec § 7.7). Three
external-research passes; nothing below was independently verified, and several quotes came from search summaries rather
than the page itself.

- **Gerrit** (<https://gerrit-review.googlesource.com/Documentation/config-labels.html>). `TRIVIAL_REBASE` needs the
  same commit message and diff as the previous patch set, and no conflict resolution. A resolution makes the patch set
  `REWORK`, which keeps only the votes a `copyCondition` copies. `MERGE_FIRST_PARENT_UPDATE` matches a merge commit
  that differs only in its first parent. The review UI marks "rebase edits" between patch sets with different parents
  (<https://gerrit-review.googlesource.com/Documentation/user-review-ui.html>; Gerrit 2.15). High confidence on the
  rules, medium on exact wording.
- **GitHub** (protected-branches docs; changelog 2023-06-06,
  <https://github.blog/changelog/2023-06-06-security-enhancements-to-required-approvals-on-pull-requests/>). An approval
  goes stale "when the merge base changes after a review is submitted", but such changes "will usually preserve
  approvals when no new changes are introduced". Conflict resolution is not documented separately. Medium confidence.
- **GitLab** (<https://docs.gitlab.com/user/project/merge_requests/approvals/settings/>). The approval reset compares
  `patch-id`s, for "better reset decisions when you perform commands like `git rebase` or `git merge <target>`". Its
  treatment of a resolution is not documented. High confidence on the quote.
- **Linux kernel.** Review tags carry to the next version unless the patch "has changed substantially", and a dropped
  tag is noted in the changelog (<https://www.kernel.org/doc/html/latest/process/submitting-patches.html>). Maintainers
  warn of conflicts and may push a branch showing the intended resolution
  (<https://docs.kernel.org/maintainer/rebasing-and-merging.html>). A merge that adds changes in neither parent ("evil")
  is acceptable only when explained (LKML 2011 and 2012 threads; medium confidence).
- **Git tooling.** `git range-diff` compares two versions of a series across a rebase, ignoring merges
  (<https://git-scm.com/docs/git-range-diff>). `--remerge-diff` diffs a two-parent merge against Git's automatic
  re-merge, so it shows only the resolution (<https://git-scm.com/docs/git-log>). `--cc` is a coarser filter. High
  confidence.
- **AI review tools.** CodeRabbit, Copilot, Codex, Greptile, and Qodo document re-review by trigger or by "commits
  since the last review". None documents special handling of merges or rebases. Medium confidence.
- **Conflict risk.**
    - About 1 merge in 6 conflicts (Brun et al., ESEC/FSE 2011 and TSE 2013). Clean merges still broke builds in 0.1–10%
      of merges across three projects.
    - In Brindescu et al. (EMSE 2020, 143 projects), code tied to a conflict was about 2 times as likely to be buggy,
      and code that needed manual resolution about 26 times as likely. This is an association, measured through bug-fix
      commits.
    - Semantic and build conflicts arise outside the conflicted lines, typically from a rename or removal on one side
      that the other side uses (Da Silva et al.). Detectors are weak: SAM caught 9 of 29 test conflicts.
    - LLM resolution benchmarks find under 60% correct (Merge-Bench, 2026; MergeBERT about 63–68%, 2022; ConGra uses a
      lenient similarity metric).
    - No study of LLMs reviewing a resolution was found.
    - Medium confidence throughout; the samples are mostly open-source Java.
- **Transfer.** Clean moves carry, as ARC's applicability check already decides
  (`base-movement-disjoint`, `base-movement-clean-merge`). A resolution is reviewed as new content with its
  cross-side dependencies, and build and test cover the semantic remainder. Nothing found shows that a complete
  re-review after a conflicted merge is the norm.

### How inputs shape reviewers and agents

- **Human priming.** Spadini, Calikli, Bacchelli, "Primers or Reminders? The Effects of Existing Review Comments on
  Code Review", ICSE 2020: 85 developers; a visible comment about an uncommon bug type raised detection of that type
  and did not lower detection of others. High confidence in the finding, moderate in its transfer.
- **LLM anchoring.** Lou 2024 (arXiv 2412.06593, preprint): anchoring in GPT-4 and GPT-4o, with chain-of-thought,
  reflection, and "ignore the hint" barely helping. Nguyen 2024 (Journal of Behavioral and Experimental Finance):
  anchoring across GPT-4, Claude 2, Gemini Pro, and GPT-3.5. Huang et al. 2025 (arXiv 2505.15392): 22–61% of questions
  anchored, least for reasoning models. arXiv 2603.18740 (preprint): framing a change as bug-free cut vulnerability
  detection by 16–93%. No study of showing a fresh LLM reviewer a prior reviewer's findings was found.
- **Instruction literalness.** OpenAI GPT-4.1 prompting guide: "trained to follow instructions more closely and more
  literally than its predecessors"; emphasis can over-apply rules; with conflicting instructions it tends to follow the
  later one. OpenAI GPT-5 prompting guide: "contradictory or vague instructions can be more damaging to GPT-5 than to
  other models". Anthropic Claude prompting best practices: give the reason behind an instruction, since Claude
  "is smart enough to generalize from the explanation"; dial back aggressive emphasis. No controlled evaluation of
  MUST/SHOULD wording, or of separating enforced bounds from advice, was found.

## Codex probe

Run 2026-10-16 on the throwaway draft pull request #1031, never merged. The branch seeded single-function defects,
each a plain contract violation that Codex rated P1, and every trigger was a `@codex review` comment. Its
`AGENTS.md` carried two canaries: one under ARC's `## Review guidelines` heading asked for an `[RG]` title prefix, and
one under a new `## Code Review Rules` heading, the heading Codex's GitHub docs now name, asked for `[CRR]`.

| Run | Head change before the run                        | Trigger text                       | Result                                          |
| --- | ------------------------------------------------- | ---------------------------------- | ----------------------------------------------- |
| R1  | seeds a path-containment and a keep-list defect   | plain                              | both, titled `[RG][CRR]`                        |
| R2  | none                                              | plain                              | "Didn't find any major issues"; both still open |
| R3  | adds a token-prefix defect                        | plain                              | the token defect only                           |
| R4  | none                                              | asks it to re-report every finding | "Didn't find any major issues"                  |
| R5  | adds defects in two files, A and B                | scoped to file A                   | file A's defect only                            |
| R6  | none                                              | plain                              | file B's defect only                            |
| R7  | an incomplete keep-list fix; that thread resolved | plain                              | "Didn't find any major issues"                  |
| R8  | an incomplete token fix; that thread left open    | plain                              | "Didn't find any major issues"                  |
| R9  | none                                              | asks it to verify both fixes       | "Didn't find any major issues"                  |

Both incomplete fixes left the defect in place on the line changed: the keep-list function still deleted the names it
was told to keep, and the token check still accepted any non-empty prefix of the secret.

- **Headings.** Codex reads both `AGENTS.md` headings from the pull request's head, so ARC's generated heading works
  and no defect exists there.
- **What a request reports.** Each request reviews the whole pull request — R6 found a defect in code R5 had already
  reviewed under a narrower request — but reports only defects Codex has not already posted on it. Five runs (R2, R4,
  R7, R8, R9) never re-reported an earlier finding: not on an unchanged head, not after an incomplete fix whether its
  thread was resolved or open, and not when asked by name to check the fix. "Didn't find any major issues" means
  nothing new, not no open defects.
- **Request text.** Text after `@codex review` narrows what is reported (R5) but cannot make Codex re-examine a
  finding it has already raised (R4, R9).
- **Machine-readable state.** Codex keeps an undocumented `codex-review-state:v1` marker in its summary comment,
  including `has_unresolved_findings`. It tracks thread state, which ARC itself sets when it resolves a thread at
  settlement (`settlement: "reply-and-resolve"`, `hosted/codex.ts`), so it cannot stand in for re-examination.
- **Limits.** One repository, one day, nine runs, contract-level defects only. Every finding was Codex's own; whether
  it also declines to raise a defect another reviewer posted on the pull request is untested, though ARC's local
  findings are not pull-request threads. CodeRabbit's behavior is in § CodeRabbit probe.

## CodeRabbit probe

Run the same day on the same pull request, whose head then carried the Codex runs' seeded defects and their two
incomplete fixes, and which CodeRabbit had not yet reviewed. This repository runs CodeRabbit on the `CHILL` profile
with every automatic review off (`.coderabbit.yaml`).

| Run | Head change before the run                                                 | Trigger                     | Result                                                                                                                                 |
| --- | -------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| CR1 | none since the Codex runs                                                  | `@coderabbitai full review` | six findings: all five seeded defects as major, the two Codex-era incomplete fixes among them, and a minor on the conflicting canaries |
| CR2 | incomplete fixes to two CodeRabbit findings, one thread resolved, one open | `@coderabbitai review`      | reviewed exactly those two files; "No actionable comments were generated in the recent review"                                         |
| CR3 | none                                                                       | `@coderabbitai full review` | reviewed all five files from the pull request's base; "No actionable comments were generated in the recent review"                     |

All six defects were still in the code at CR3: four untouched and two behind fixes that changed nothing.

- **Each provider remembers only its own findings.** CR1 reported, as new, two defects Codex had already posted, and
  CR3 — a full review — re-reported none of CodeRabbit's own six. A full review is not a fresh read of what it found
  before.
- **The summary knew; the findings did not say.** After CR2, CodeRabbit's summary comment still read "The probe still
  contains incorrect permission, token, path, escaping, and deletion behavior" and noted that `canPerform` ignores its
  `action` argument, but no finding was posted. ARC reads only the summary's recent-review line
  (`summaryReportsNoFindings`, `hosted/coderabbit.ts`), so it would record CR2 as a clean incremental pass and CR3 as a
  clean complete pass.
- **Headings.** CodeRabbit read `AGENTS.md` — one finding title carried both canary prefixes — but applied neither
  prefix to its other findings.
- **Limits.** One run of each kind, contract-level defects only. The repository's plan allowed five reviews an hour.

## Review call sites

A read-only inventory of `packages/arc-framework/arc/system/` on 2026-10-16, made to shape the review family (spec
§ 11). Line numbers drift; the implementation re-derives it on the then-current base as segment 4's before-inventory, as
a table: each step, where it is stated today, its home section after the rewiring, and the sites that reach it.
Spot-checked against source: the `deliver-stack` and `integrate-work-unit` frontline contradiction, the cloned
"frontline admission", the `prepare-work-unit` composer wording, `amend-design`'s offer form, and the `draft-design` and
`create-spec` postures.

- **Planning — one block, parameters.** `draft-design`, `create-spec`, and `generate-tasks` repeat the offer callout,
  orientation YAML, authored-partition note, fix-check sentence, pass-record paragraph, and post-settle re-read nearly
  verbatim. They differ in rubric, artifacts, and offer threshold — `draft-design` recommends at `Novel` only, the
  other two at `Heavy` and `Novel`. `amend-design` scales by depth, not `Class` (low: no pass; medium: neutral offer;
  high: recommended), and states its offer in prose with no callout, YAML, or pass cap. `generate-tasks` restarts at
  depth resolution when proportionality returns `revise`; the others stay in their loop.
- **Code — shared procedures, not one sequence.** Each site drives review through its own command and states: an
  Errand through `arc review resolve`, prepublication through `arc review pre-publication <wu>`, integration through
  the integration boundary's `nextAction`, and a stack member through `arc review status --target`. Each has its own
  early stop — an Errand's conversational Owner stop, prepublication's durable `lanes.standard.terminus`, integration's
  `arc review terminus accept` for delivery members, and none in `deliver-stack` — and its own fix verification: an
  Errand names only `arc check increment`, while prepublication and integration replay `verifiedFix` after forced
  gates. Shared and cloned across sites: the findings round, hosted await and its checks diagnostic (an Errand,
  integration, and `deliver-stack`), hosted settlement phases, the converged rule, the chunk gate, ceiling-override
  handling, the fix-commit template, and the stop line. `classify-review-risk` fires only at first entry (an Errand
  and prepublication); integration and `deliver-stack` inherit the reservation. An Errand forces whole-target scope;
  the others run chunking.
- **Verification — one call, scoped.** `validate-criteria(scope)` owns the walk and its companion offer, at
  delivery-member scope (`process-task-loop`) and work-unit scope (`verify-work-unit`), and both callers restate the
  companion callout. `deliver-stack`'s review-fix verification calls it per member with no companion and "do not add
  an interlock"; `amend-design`'s closure produces a delta with its companion unspecified. `self-review` runs only in
  `verify-work-unit`, as an author preflight whose findings go through triage without the producer-backed response.
- **Declarations.** `frontline-review` and `standard-review` name `adversarial-review`, `implementation-audit`, and
  `review-chunking` without declaring them; `design-audit` names `assess-design-proportionality`, and
  `review-response` names `review-triage`. Workflows declare methods their bodies never fire (`self-review` in
  `prepare-work-unit`; `adversarial-review` and `standard-review` in `integrate-work-unit`) and cite methods they do
  not declare (`source-grounding` in `create-spec`, `generate-tasks`, and `amend-design`). Methods' "Workflow:"
  callouts list stale callers.
- **Not settled from prose.** Whether the CLI performs the Errand path's fix-verification replay; how
  `prepare-work-unit` handles a `run-self-review` action; `amend-design`'s pass cap.

### Execution before-inventory

Baseline: `87b355ceb` (after Phases 1–6). Re-derived against `packages/arc-framework/arc/system/`; the source headings
below, rather than line offsets, identify each restatement. Proposed homes are targets for the after-inventory,
not claims that the move has landed. Planning shorthand: D = `draft-design`, S = `create-spec`, T = `generate-tasks`,
A = `amend-design`. Code shorthand: E = `run-errand`, P = `prepare-work-unit`, I = `integrate-work-unit`,
K = `deliver-stack`. All workflow names below resolve under `workflows/arc/` (T is the package template).

| Step                                                                    | Every current site / locus                                                                                                                                                                                                       | Proposed home section                                                         | Reaching sites                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| Draft final readiness and source grounding                              | D, Capture the draft, opening author check                                                                                                                                                                                       | `planning-review`, Author checks                                              | D                                            |
| Spec final proportionality and form-scaled spec check                   | S, Finalize, before the advisory offer                                                                                                                                                                                           | `planning-review`, Author checks                                              | S                                            |
| Amendment final footprint grounding and coherence                       | A, Depth and rigor; The assurance invariant; The capture commit                                                                                                                                                                  | `planning-review`, Author checks                                              | A                                            |
| Planning advisory offer and posture                                     | D, Capture the draft; S, Finalize; T, Finalize the task list; A, Depth and rigor                                                                                                                                                 | `planning-review`, Independent offer                                          | D/S/T/A                                      |
| Planning rubric and artifact selection                                  | D/S/T adversarial YAML; A, The assurance invariant, footprint rubric                                                                                                                                                             | `planning-review`, Review context                                             | D/S/T/A                                      |
| Briefings, cap, fold verification, fresh-loop history exception         | D/S/T adversarial YAML; A, The assurance invariant (cap absent)                                                                                                                                                                  | `planning-review`, Review context                                             | D/S/T/A                                      |
| Authored-partition option and whole-target fallback                     | D/S/T paragraph after YAML                                                                                                                                                                                                       | `planning-review`, Independent offer                                          | D/S/T/A when applicable                      |
| Complete dispositions and bounded continuation                          | D/S/T paragraph after fix-check sentence; A, The assurance invariant                                                                                                                                                             | `planning-review`, Findings and pass record                                   | D/S/T/A                                      |
| Fix-check offer after author grounding and before successor             | D/S/T fix-check paragraph; A, The assurance invariant                                                                                                                                                                            | `planning-review`, Findings and pass record                                   | D/S/T/A                                      |
| Pass record, prior-findings, and commit summary                         | D/S/T pass-record paragraph; A, The assurance invariant                                                                                                                                                                          | `planning-review`, Findings and pass record                                   | D/S/T/A                                      |
| Post-settle coherence reread immediately before commit                  | D, Capture the draft (after forward-path prose); S, Finalize; T, Canonicalize active delivery authoring; A, The assurance invariant                                                                                              | `planning-review`, Post-settle reread                                         | D/S/T/A                                      |
| Iterative draft readiness and proportionality                           | D, high iterative shaping; Assess design proportionality                                                                                                                                                                         | Existing authoring sections                                                   | D                                            |
| Spec discovery, batch-edit checks, and readiness                        | S, Conduct discovery; Write and save; T, bounded spec-propagation checks                                                                                                                                                         | Existing authoring sections                                                   | S/T                                          |
| Per-phase task audit and final suite coherence                          | T, Audit the phase; Final suite-coherence pass                                                                                                                                                                                   | Existing authoring sections                                                   | T                                            |
| Planning axis re-entry and high-level shaping                           | `resolve-planning-depth`, Mid-stage re-entry; D/S/T re-entry valves; `adversarial-review`, Exit gate                                                                                                                             | Existing axis and stage sections                                              | D/S/T                                        |
| Amendment depth, ceiling, accretion, and record writes                  | A, Depth and rigor; The accretion guard; The ceiling; The amendment record                                                                                                                                                       | Existing amendment sections                                                   | A                                            |
| Aggregate author code check and non-producer triage                     | `verify-work-unit`, Step 1; P declaration and run-self-review mention lack execution arm                                                                                                                                         | `code-review`, Author check                                                   | verify-work-unit/P                           |
| Source-verified proposal and report                                     | E, Ship full protection, local findings/respond and hosted findings/triage; P, Settle pre-publication review, findings; I, Review iteration, local findings and hosted triage; K, Settle exact member review authority, findings | `code-review`, Findings round                                                 | E/P/I/K                                      |
| Complete-set approval and selected response leaf                        | Same four findings blocks; underlying authority in `review-triage` and `review-response`                                                                                                                                         | `code-review`, Findings round, invoking findings methods                      | E/P/I/K                                      |
| Apply approved fixes and preserve verification scope                    | E local/hosted findings blocks; P findings; I local/hosted findings; K findings                                                                                                                                                  | `code-review`, Findings round                                                 | E/P/I/K                                      |
| Fix verification and forced local gates                                 | E increment request; P commit plus merge gates; I forced merge before verifiedFix; K review-fix request/continuation                                                                                                             | Site-owned verification, cited from Findings round                            | E/P/I/K                                      |
| Approved fix commit and disposition receipt                             | E local/hosted findings; P findings; I local/hosted findings; K findings                                                                                                                                                         | `code-review`, Findings round                                                 | E/P/I/K                                      |
| Committed verified-fix replay before push                               | P findings; I local findings; K continuation; E missing, I/E hosted push precedes continuation                                                                                                                                   | `code-review`, Findings round                                                 | E/P/I/K                                      |
| Fix push, supported settlement, and reroute                             | E hosted findings; P findings; I local/hosted findings; K findings and hosted settlement                                                                                                                                         | `code-review`, Findings round; Hosted await and settlement                    | E/P/I/K                                      |
| Hosted pending wait, diagnostic checks, ambiguous/retryable results     | E Ship full protection, hosted await; I Review iteration, await-hosted-review; K Settle exact member review authority, await-hosted-review                                                                                       | `code-review`, Hosted await and settlement                                    | E/I/K                                        |
| Channel capability, plan consumption, and no compensating comments      | E/I/K hosted settlement; `review-response`, Keep response etiquette                                                                                                                                                              | Existing `review-response` channel boundary, invoked by shared hosted section | E/I/K                                        |
| Convergence, delta check, full-final, and extra complete pass           | E Ship full protection; P Settle pre-publication review; I Review iteration                                                                                                                                                      | `code-review`, Convergence                                                    | E/P/I/K                                      |
| Coverage-required with response due versus coverage choice              | E resolve and local-prepare dispatch; P policy and local-prepare dispatch; I status and singleton local-prepare; K status                                                                                                        | `code-review`, Coverage selection                                             | E/P/I/K                                      |
| Clean-fix-check lane read and bounded successor recommendation          | E Ship full protection; P Settle pre-publication review; I Review iteration; K Settle exact member review authority                                                                                                              | `code-review`, Successor decision                                             | E/P/I/K                                      |
| Chosen-coverage range measurement and chunk gate                        | P Settle pre-publication review; I Review iteration; K Settle exact member review authority; E whole-target exemption                                                                                                            | `code-review`, Chunk gate                                                     | E/P/I/K                                      |
| Complete-pass ceiling, trend read, and conditional authorization        | E local/hosted override arms; P policy override; I/K status override and findings continuation                                                                                                                                   | `code-review`, Ceiling override                                               | E/P/I/K                                      |
| Owner stop, exact coordinates, and residual limit                       | E Owner-directed review stop; P owner-accepted pre-publication; I exact-target terminus; K successor limit                                                                                                                       | `code-review`, Stop line, with site continuation                              | E/P/I/K                                      |
| Errand reviewed-lane settlement entry                                   | `drain-inbox`, Route, planning-grooming and lane dispatch citations                                                                                                                                                              | Shared `code-review` section for review, E for Errand lifecycle               | drain-inbox/E                                |
| Criteria inputs, binding, three states, evidence, and immutable reports | `validate-criteria`, default through Amendment deltas                                                                                                                                                                            | Existing `validate-criteria` pure check                                       | verification-review; direct evidence callers |
| Work-unit primary walk and member/seam report composition               | `verify-work-unit`, Step 2, two validate-criteria calls                                                                                                                                                                          | `verification-review`, Author criteria walk                                   | verify-work-unit                             |
| Delivery-member primary criteria walk                                   | `process-task-loop`, Completion protocol item 3                                                                                                                                                                                  | `verification-review`, Author criteria walk                                   | process-task-loop                            |
| Verification companion posture, cap, and fresh context                  | `validate-criteria`, Adversarial companion; verify-work-unit Step 2; task loop item 3                                                                                                                                            | `verification-review`, Independent companion                                  | verify-work-unit/process-task-loop           |
| Companion findings, failed criterion, separate records                  | `validate-criteria`, Adversarial companion; caller repeats context                                                                                                                                                               | `verification-review`, Independent companion                                  | verify-work-unit/process-task-loop           |
| Exact correction evidence without a review verdict                      | K, Complete a review-fix verification continuation                                                                                                                                                                               | Direct `validate-criteria` check                                              | K                                            |
| Closing amendment criteria delta                                        | A, Closure, preserved member report delta                                                                                                                                                                                        | Direct `validate-criteria` check                                              | A                                            |
| Merge gate, criterion marking, unresolved stop, Candidate attestation   | `verify-work-unit`, Steps 1–3; task loop member-result and scale closeout                                                                                                                                                        | Existing lifecycle sections                                                   | verify-work-unit/process-task-loop           |
| Reviewer vehicle, isolation, convergence, rounds, and report contract   | `adversarial-review`; frontline/standard/self-review methods; `disposition-report`; `review-model`                                                                                                                               | Existing vehicle/finding/model methods, with renamed code checks              | All review-type methods                      |
| Direct check entrypoints and applicability judgment                     | `arc-design-audit`, `arc-task-audit`, `arc-amend-design`; `decompose-work-unit` spec-review; `assess-evidence-applicability` at moved-target stops                                                                               | Existing check or lifecycle entrypoints                                       | Their current callers                        |

The drift checklist is spec § 11.5. Confirmed at this baseline: K's frontline contradiction; I/K's spurious frontline
ceiling admission; P's response/composer wording and missing author-check arm; S's five author-check naming sites;
planning record's ambiguous operation term; unowned or missing declarations; E's absent verified-fix replay and E/I
hosted ordering; the companion posture restatement; D/T reread placement; and I's singleton additional-pass limit.
The after-inventory will bind these rows to actual home headings and fragment-bearing callsite links.

## Fix-range measure probe

Run 2026-10-16 on this work unit's branch: `changeset resolve`, given a correction scope's `predecessorHeadSha` as
`diffBaseSha`, measured a one-commit range at 52 lines and 5 files, as `git diff` counts it. The command takes the two
commits verbatim (`resolveMemberCoordinates`, `hosts/local/repository-target.ts`), so a fix check's measure needs no new
field (spec § 3.3).

## Chain confirmations

The confirmations a correction scope, a chain re-confirmation, or a carry passes through, by call site, as the
generate-tasks grounding audit read them. Each keeps its call site and today's grounds; its chain role takes the shared
chain proof (Task 1.1.b - `tasks-review-coverage-cadence.md`), and its carry role never does. Paths are relative to
`scripts/review-gate/`.

- **`confirmErrandFixResponseApplicability`** (`policy/local-review-coverage-selection.ts`) — local prepare's Errand
  leg before its pull request. Chain and current leg.
- **`confirmPrivateCandidateCorrectionBasis`** (`policy/local-review-coverage-selection.ts`) — local prepare's and
  pre-publication's private Candidate leg, a historical leg included. Chain and current leg.
- **`confirmNonDeliveryIncrementalApplicability`** (`policy/local-review-coverage-selection.ts`) — after a pull
  request: local prepare (`createLocalContributionConfirmation`, `runtime/local-prepare-composition.ts`), the
  `arc review resolve -` handler, and respond; before one, the handler's private Candidate leg and respond's Errand leg
  (`resolveRespondPolicyTarget`), where it returns `unavailable`. Chain; also the carry, through
  `confirmPriorProducerApplicability`.
- **`confirmNoPullRequestCandidatePriorProducer`** (`policy/pre-publication-composition.ts`) — respond's private
  Candidate chain. Chain; also the carry, through `confirmPriorProducerApplicability`.
- **`confirmPriorProducerApplicability`** (`policy/pre-publication-composition.ts`) — pre-publication's
  `applicableHistoricalAttempt` (`policy/pre-publication-request.ts`) and, once a change request is open,
  pre-publication's `confirmIncrementalApplicability`. Carry and chain in one function, so the chain proof enters
  through `confirmIncrementalApplicability`, never here.
- **`confirmIncrementalPredecessorApplicability`** (`policy/hosted-reservation-support.ts`) — the discharge's chain,
  hosted request admission's Candidate branch (`handlers/review.ts`), `status-singleton.ts`, and
  `status-composition.ts`'s delivery route. Chain. It reads the earlier attempt through `projectEarlierReviewApplicability`
  and reports `unavailable` for a local predecessor with no `deliveryAdmission`.
- **The discharge's `confirmCurrentApplicability` closure** (`createHostedReservationDischargeReader`,
  `policy/hosted-reservation-discharge.ts`) — the current leg, falling back to the earlier read
  (`incrementalApplicabilityFromEarlierRead`).
- **`confirmErrandCorrectionPredecessor`** (`status-errand.ts`) — Errand status's chain; the current-head closure
  beside it lives in `resolveErrandHostedCorrection`, which Task 1.8.a deletes.
- **`confirmDeliveryMemberIncrementalApplicability`** (`policy/local-review-coverage-selection.ts`) — a delivery
  member's leg. Chain; it keeps delivery's fix-response proof and never takes the range proof.
- **No confirmation today** — hosted request admission's Errand branch (`handlers/review.ts`), which falls back to the
  same-head check in `deriveVerifiedTerminalSignal`; `nextErrandPassObligation` (`status-errand.ts`); and
  pre-publication's current leg. The chain proof with no site grounds is their confirmation.

The consumers that carry an earlier attempt from its own head to the current head, which never take the chain proof's
range-proof result: pre-publication's `applicableHistoricalAttempt`; the discharge's `cleanApplicable` and
`settledApplicable`, which read the `retain-prior-attempt` mark `projectEarlierReviewApplicability`
(`policy/earlier-review-applicability.ts`) sets; hosted request admission's `applicabilityAction` (`handlers/review.ts`),
which reads the same mark; and Errand status's `readCarriedErrandReview`, which calls
`projectGitReviewContributionApplicability` directly.

## Planning review of this work unit

The work unit was `Heavy`, and `draft-design` recommends its adversarial offer only at `Novel`; the review ran on the
Owner's call, 2026-10-16, with fold verification on.

- **First pass.** It found 1 critical, 5 major, and 3 minor findings, all confirmed at source.
- **Re-entry at `high`.** The design sat at `high` in `draft-design`, where re-entering one level higher has nowhere to
  go. After the first pass's second fix-check round, a re-entry offer was recommended declined because the stage was
  already at `high` and the fixes were local corrections, and the Owner declined it. After the second pass's first
  fix-check round, all seven material findings came from that pass's two new-design folds, and four of their fixes were
  new design again: the exit gate's sustained non-convergence. The loop ended `re-entered` by returning the two loci to
  the stage's facilitated shaping step, which no method names as a re-entry response; a fresh loop then ran, and its
  fix-check rounds converged.

## Changes to pre-commitment text

Each changed text written before the work, on the Owner's decision during this work unit's generate-tasks. The fix tag's
change to Goal 9 and Success Criteria 15 is under § Coordination.

- **Code review's author check is renamed (2026-10-17).** `self-review` names who runs the pass, not what it covers, and
  ARC uses the phrase in plain prose for other passes. The Owner chose `code-review-author`, beside
  `code-review-frontline` and `code-review-standard` (spec § 12.2), so Success Criteria 14 now names `self-review.md`
  among the files that no longer remain. Its stored and published literals stay (§ 12.3).
- **A site calls its review type's method, not an operation (2026-10-17).** A forward-compatibility check against
  `strategy-procedure-evolution` Principle 7 found "operation" already naming a stored CLI operation in the code sites'
  own prose and in `adversarial-review` § Pass record. Goal 8 and Success Criteria 13 changed their wording from
  "operation" to "method", with the same meaning (spec § 11.1).

## Caveats

- **One change set.** Large, sensitive, and stochastic in its reviewer; a second data point would test the pattern.
- **Loci are the evaluator's.** A finding's cited lines can understate an interaction defect whose cause sits in a
  fix elsewhere; bucket A and B counts are therefore floors for "fix-related".
- **The C mechanism is unproven.** Whether a focused fix check would have caught C findings sooner than the complete
  pass that missed them is untested.
- **Prior art does not settle thresholds.** Inspection practice verifies rework by default and re-inspects
  complicated or critical rework; the "re-inspect above 5% rework" figure is folklore (§ Prior art sources), and no
  validated stopping rule for repeated LLM review was found.

## Coordination

The spec names no other work unit. These are the neighbors task generation and execution meet.

### `seam-delivery-review`

Coordinated with its create-spec and generate-tasks sessions on 2026-10-16 and 2026-10-17; its notes and task list
keep the matching record from its side.

- **Landing order.** This work unit lands first, and `seam-delivery-review` takes the base-merge conflicts.
- **Shared files.** `local-review-coverage-selection.ts`, `core/local-prepare.ts`,
  `runtime/local-prepare-composition.ts`, `runtime/respond-command.ts`, `runtime/respond-composition.ts`,
  `runtime/review-policy-remedy.ts`, `status-errand.ts`, `status.ts`, `status-composition.ts`,
  `status-delivery-scope.ts`, `review-coverage-selection.ts`, `hosted-reservation-discharge.ts`,
  `hosted-reservation-support.ts`, `hosted-reservation-admission.ts`, `earlier-review-applicability.ts`,
  `earlier-review-attempts.ts`, `pre-publication-composition.ts`, `review-policy-driver.ts`,
  `review-policy-evidence.ts`, `handlers/review.ts`, `lane-progress-conditional.ts`,
  `core/provisional-pass-assessment.ts`, `delivery-local-review-admission.ts`, and `hosted/`'s CodeRabbit, Codex, and
  correction-capability modules.
- **What it relies on.** Change none of these without telling it:
    - `logicalPass` numbers every finished attempt, fix checks and delta checks included, and its write check and
      import copy the values as they are. The ceiling compares the complete count, and `exhaustedPassCount` stays the
      producing attempt's `logicalPass`.
    - The complete count and the next pass's chosen coverage reach the driver as internal inputs beside `sources` and
      `maxPasses`, never on the command request its snapshot stores.
    - A hosted outcome never carries incremental coverage, and `HostedCoverageEvidenceSchema` stays parseable for the
      stored record that holds one.
    - The report's render-only inputs, the `**Fails:**` anchor among them, ride beside `proposal` and are never stored,
      except each fix's tag (below).
    - The delta check writes the record a fix check writes and cites no extra-pass decision, so none of its checks
      tells the two apart.
    - The fix-check chain accepts a later Candidate head with the fix head's subject digest, an allowance its deletion
      pass keeps, and relies on neither `commit-selection` nor a review fix's record-effect settlement, both of which
      retire at its flip.
    - The convergence rule needs nothing from it: its side drops both stored resolve-envelope copies
      (`CandidatePolicyReviewBoundarySchema.policy`, `CandidateFixBoundarySchema.policy`) and recomputes them through
      the same derivation.
- **A stored shape goes there.** If implementation finds it needs a new stored record or field, that shape is
  `seam-delivery-review`'s, since it owns the review gate's storage register row; it does not land here. The one
  agreed exception is below.
- **The fix tag (2026-10-17).** At this work unit's generate-tasks, keeping each finding's report label in canonical
  order while new-design fixes still lead within a grade led the Owner to keep each fix's tag as a stored advisory note
  rather than render-only (spec § 10.4), which changed Goal 9 and Success Criteria 15 from "nothing new is stored" to
  one stored addition. `seam-delivery-review`'s session judged the field to pass its storage rule, and the Owner
  accepted the arrangement there: this work unit adds the optional field to today's lineage node
  (`ApprovedDispositionLineageNodeSchema`) and lands first, and `seam-delivery-review` carries it in `review/evidence`
  § 6.2, its § 6.5 write check, its § 6.6 composed read, and its import (§ 11.2), amending before its Task 1.4 and
  re-checking against what lands here at its Task 3.7 pause. It relies on two things, and its next session is told if
  either changes:
    - the field is optional and approval never binds it, so it sits outside `dispositionSet` and its ID;
    - only the approved `arc review respond -` call writes it, at that response's first write, never afterwards.

### Already routed

Each went out as a `USER-INBOX § Work Unit` capture with `WU_Target` and `_Shapes:_`. Do not route them again from task
generation or execution.

- `review-orchestration-right-sizing` — its review-lane doctrine home points at `review-model` and the review-type
  methods rather than minting the pass model.
- `composable-workflows` — the review-type methods as worked instances of its procedure library and procedure/check
  split.
- One typed driver across code review's four site commands (`WU_Target: TBD`).
- `docs-content-sweep` — the code-review method renames in the docs site.
- A recorded base-merge review check that carries review without a stop, and a typed base reconcile between review fix
  rounds for overlapping drift (both `WU_Target: TBD`).
- `delivery-rebuild-continuity` — a typed mark of a held review correction on the continuation's stops, and whether a
  review fix may land before the Owner's choice at a bound applicability stop.
- `autonomy-levels` — bounding fix-check rounds when a level lets the agent approve review fixes.
- `review-source-authority` — whether its operator selection override takes the Owner past a delta check.
- `review-durability-hardening` — re-triaging its held new-head invalidation entry against the delta check.

### Execution caution

Delivery's authoring rebind refuses a review fix that lands outside the finding's cited file
(`authoring-rebind-finding-path-missing`, `handlers/delivery-execution.ts`). A sibling sweep produces exactly such
fixes, so a test that lands a sibling-sweep fix on a delivery member can hit it. The spec leaves that admission
unchanged, and `review-orchestration-right-sizing` holds the concern.

## A2 — Historical member fix-chain proof

`createRespondPolicyConfirmation` rejects a historical local member result when `resolveRespondPolicyTarget` cannot
match its old head to the live PR. That return precedes `confirmReviewCorrectionLeg`, although
`confirmDeliveryCorrectionLeg` already validates the exact approved member response, consumption, lineage, unchanged
base, and performed head. The repeated material-round scenario exposes the premature refusal in
`readRespondProvisionalPassFacts`; the same confirmation also serves `resolveRespondPolicy`.

The correction retains the live match as ordinary contribution grounds and lets the existing stored fix-response
proof decide a historical fix leg. No new proof or authority is introduced. The affected statement is § 5.3's
predictive chain adequacy, with the chain-proof contract in § 4 unchanged. Earlier phase scenarios remain valid;
Task 5.7 adds the repeated material look that exercises an older incremental leg and closes A2 on its rerun.
