# Notes: grounded-planning-review

Reference material behind the spec: the evidence record its Introduction summarizes, the fix-borne baseline the
expected effect is measured against, this work unit's own create-spec stage as the first data point, and the prior art.

## Contents

- [Evidence record](#evidence-record)
- [Fix-borne baseline](#fix-borne-baseline)
- [This work unit's create-spec stage](#this-work-units-create-spec-stage)
- [Prior art](#prior-art)

## Evidence record

One work unit dominates the evidence, uncontrolled, but its record is complete and the pattern recurs across stages.

- **`storage-contract` (`Novel`, code-dense) — seventeen planning passes:** six on the draft, five on the spec, six on
  the task list. Its `ADVERSARIAL-PASSES.md` records them all, with the fix checks after task-list passes 4, 5, and 6.
    - Fix-introduced majors appear at every stage, not only in the code-dense task list. Draft pass 4: all four majors
      correct or widen pass 3's folds. Draft pass 5: four of five majors land on pass 4's folds or the save path under
      them. Spec passes 3 to 5: the majors sit in mechanism the Owner decided between passes. Task-list pass
      2: four of eight majors are errors in pass 1's fixes. Task-list pass 4: three of four majors in pass 3's fixes.
      Task-list pass 5: the first major sits where pass 4's merge re-grounding met a case it did not examine.
    - The draft settled on a reframe that replaced an enumeration with a rule and removed mechanism (draft pass 6),
      after five passes whose majors were not weakening — not on pass count. Pass 6's three majors were detail gaps
      outside the class that ran through passes 2 to 5, and the Owner stopped the loop there.
    - **A natural A/B.** Before task-list pass 3, one fresh read-only agent traced the 27 source claims pass 2's fixes
      rested on, probing wherever a claim was about behavior: 21 held, 5 in part, 1 failed, yielding eight further
      fixes (two major). Pass 3's two majors were then both genuine interface decisions the plan had left open. Pass
      3's own fixes went in without a trace, and pass 4 found three of its four majors in them.
    - **A narrow fix check, after task-list pass 4.** One fresh subagent attacked only pass 4's ten folded fixes on
      closure, behavioral grounding (probe-backed), propagation and coherence, and new failure, before pass 5. It found
      three majors and seven minors; all held against source.
        - Two majors were behavioral grounding: a fix rested on "today's selection takes an active copy over every
          other", true only after the composition's reader has accepted the meta; another sourced "this checkout's
          copy" from a walk a probe showed disagreed with today's composed current-tree copy.
        - The third was propagation and completeness: exclusion lists stated as complete omitted about seven items,
          and one contradicted another task.
        - The minors split between grounding (an identity claim missing a second reader, an unstated remote name,
          laziness covering three stores but not the sync arm) and propagation (refusal-table and remedy gaps,
          undefined throw ordering, an unaddressed create path).
        - Probe-backed grounding of each fix's claims would have caught two of the three majors before the fold; the
          completeness failure needed an adversarial read of the fixes. Cost was one subagent, against a full
          whole-target pass rediscovering the same.
        - Confound: base merged mid-loop and unified the two lifecycle walks, dissolving one major and surfacing a new
          edge. Re-basing a plan on moving code is a drift source separate from the fixes.
    - **Fix-check rounds, after task-list pass 5.** Each round attacked the previous round's repairs and the rules
      they rest on. Four rounds over twelve fixes found 4, 2, 4, and 1 majors. Round one's majors sat mostly in the
      two mechanisms the pass had added; the later rounds' were mostly design-level, two resting on a false claim
      about today's code.
    - **Fix-check rounds, after task-list pass 6.** Three rounds; design-level findings fell from nine in the pass to
      four, two, and one, and the Owner finalized after the third.
    - Fix-borne slips of both kinds from task-list pass 2: a wrapped function that is not the one `arc sync` runs, a
      classifier returning `error` where the fix assumed `unreachable`, a subclass caught by its parent's class, a
      "spawns no Git" promise the read path could not keep (behavioral); placement required on every work item with
      no word on an Errand's, and rename and move exclusions written at a granularity the fixture contract could not
      express (propagation).
- **`delivery-plan-record` create-spec** — one measured pass produced twelve mechanical findings (source, reference,
  vocabulary, return-shape) and two design findings.
- **`wu-rename` create-spec** — three passes against a `Heavy` cap of two; pass 2 found a repair-introduced blocker,
  and pass 3 an original blocker both earlier passes missed.
- **Inherited premises** — `delivery-plan-record` planning: empirical claims carried in from earlier artifacts read as
  settled and survived to an adversarial pass. The always-loaded verify-before-assuming rule depends on the author
  noticing an assumption, which an inherited premise defeats.

## Fix-borne baseline

Counted 2026-10-02 from `storage-contract`'s `ADVERSARIAL-PASSES.md` over its planning passes, while that work unit
was active; a work unit leaving active state closes its workspace and the record with it.

**Counting rule.** A verified major is fix-borne when it lands in text written after an earlier review — a pass's
fix, a fix-check repair, or another change the Owner approved between reviews — or in a gap that text left in what it
changed. These are the pass record's non-original origins. First passes are excluded; rejected findings do not count.
_Stated_ means the record's own text attributes the major; _by locus_ means the finding's locus was traced to such
text, and includes the stated ones.

| Stage     | Pass | Majors | Stated | By locus | Basis                                                                  |
| --------- | ---- | ------ | ------ | -------- | ---------------------------------------------------------------------- |
| Draft     | 2    | 5      | 0      | 2        | traced to pass 1's folds                                               |
| Draft     | 3    | 6      | 0      | 5        | traced to pass 2's folds                                               |
| Draft     | 4    | 4      | 4      | 4        | three correct pass 3's folds, one widens its scope addition            |
| Draft     | 5    | 5      | 4      | 4        | pass 4's folds or the save path under them                             |
| Draft     | 6    | 3      | 0      | 3        | the pass was scoped to the reframe pass 5's response approved          |
| Spec      | 2    | 7      | 0      | 5        | decisions approved with pass 1's set                                   |
| Spec      | 3    | 2      | 2      | 2        | mechanism the Owner decided after pass 2's folds                       |
| Spec      | 4    | 1      | 0      | 1        | the same post-pass-2 layer                                             |
| Spec      | 5    | 2      | 2      | 2        | decisions folded with the Owner's approval after pass 4's re-read      |
| Task list | 2    | 8      | 4      | 6        | pass 1's fixes                                                         |
| Task list | 3    | 2      | 0      | 0        | interface decisions the plan left open; followed a grounding trace     |
| Task list | 4    | 4      | 3      | 3        | pass 3's fixes                                                         |
| Task list | 5    | 3      | 1      | 2        | pass 4's merge re-grounding; fixture lists pass 4's fix check extended |
| Task list | 6    | 6      | 0      | 4        | links, listing version, placement, held-here filter; two original      |

Task-list pass 6's four trace to spec pass 2's link fix, task-list pass 1's listing-version fix, pass 3's placement
decision, and pass 2's held-here filter repairs; its record-identity and conflict-record majors are original.

- **All fourteen successor passes:** 43 of 58 by locus (74%); 20 of 58 stated (34%).
- **By position:** pass 2 — 13 of 20; pass 3 — 7 of 10; passes 4 to 6 — 23 of 28.
- **The five-pass slice** (draft passes 4 and 5, task-list passes 2, 4, and 5): 16 of 24 stated, 19 of 24 by locus.
- **Without the fourth origin** (Owner-approved changes between reviews), spec passes 3 to 5's five majors drop out
  and the all-pass figure is 38 of 58.

Read the new work unit's share the same way, from its pass record's origin field, before it leaves active state, and
compare it both in total and at matching pass positions.

## This work unit's create-spec stage

The first stage run with the design's checks by hand, recorded in full in its own `ADVERSARIAL-PASSES.md`.

- **An independent grounding run before pass 1,** after behavior-grade author grounding: about 125 claims enumerated,
  three majors and thirteen minors, all verified; about 340k tokens, 117 tool calls, 22 minutes. One major had
  survived two draft passes and three fix-check rounds.
- **Pass 1 of 2:** four majors and six minors, all verified; about 292k tokens, 94 tool calls, 19 minutes. The
  author's grounding of its own folds then caught three slips written while the folds landed.
- **Fix-check rounds:** one major and seven minors (about 199k tokens), one major and four minors (about 220k), then
  three minors (about 121k). Each round's major sat in the previous round's repairs: the inline-fold posture's
  authority, then the baseline's origin values. The loop stopped at convergence.

## Prior art

Gathered 2026-10-01 by three parallel research passes without a verification pass; the two items marked _verified_
were checked against source, and summarizer-extracted figures are approximate.

- **Inspection follow-up.** Fagan inspection (IBM Systems Journal 15(3), 1976; IEEE TSE 12(7), 1986), Gilb & Graham
  (_Software Inspection_, 1993), and NASA-STD-8739.9 all close rework with a follow-up: the moderator, with the author,
  verifies every major defect was corrected and checks for new defects introduced by the correction. Follow-up is not
  another inspection. Full re-inspection is reserved for rework that leaves the product "so different from the
  inspected version that no assessment of the resulting quality can be safely made" (NASA SWEHB 7.10, _verified_). The
  often-quoted "re-inspect when over 5% was reworked" appears only in secondary sources.
- **Fixes that inject defects.** Capers Jones reports about 7% of repairs injecting a new defect on average, over 20%
  in complex, poorly structured code (secondary quotes). Yin et al., "How do fixes become bugs?" (ESEC/FSE 2011): 14.8%
  to 24.4% of sampled post-release OS fixes were incorrect, 39% for concurrency; causes included narrow focus on the
  specific bug and unfamiliarity with the code — the propagation and behavioral-grounding kinds.
- **Priming by prior comments.** Spadini, Çalikli, Bacchelli, "Primers or Reminders?" (ICSE 2020, abstract
  _verified_): with 85 developers, a visible prior comment raised detection of another bug of its type when that type
  is not normally considered, and did not affect detection of other types — "positive reminders", not negative
  primers. Single-round human code review.
- **Re-review tooling.** Gerrit (patch sets as commits under `refs/changes/`), Google's Critique (snapshots), and
  GitHub (commit SHAs) keep each reviewed version as an immutable, reachable snapshot and diff any two on demand. None
  prescribes delta-only re-review; the delta is a navigation aid. GitHub loses the anchor when a force-push drops the
  reviewed commit.
- **LLM self-verification.** Huang et al. (ICLR 2024): intrinsic self-correction without external feedback does not
  improve and often degrades reasoning. Kamoi et al. (TACL 2024) and Stechly, Valmeekam, Kambhampati (2024) concur;
  sound external verification helps. CRITIC (ICLR 2024): tool feedback beats tool-free self-critique, and models judge
  their own answers' truth barely above chance. Self-preference bias: LLM evaluators score their own outputs higher
  (Panickssery et al., 2024). Chain-of-Verification (Findings of ACL 2024): answering verification questions without
  the draft in context ("factored") repeats fewer of its errors, modestly; an explicit cross-check of the draft's claims
  against those answers gains most on longform text. For code behavior, execution signal beats reading (Self-Debug,
  ICLR 2024; LEVER, ICML 2023; CRUXEval).
- **Attribution.** AIS (Computational Linguistics, 2023) and ALCE (EMNLP 2023): per-claim attribution makes support
  measurable, not claims accurate — even the best models' citations fully support their claims only about half the
  time on ELI5. "The citation exists, the support fails" is the named-symbol failure.
