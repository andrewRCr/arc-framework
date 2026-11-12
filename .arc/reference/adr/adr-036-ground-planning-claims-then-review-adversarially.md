# ADR-036: Ground Planning Claims, Then Review Adversarially

## Status

Accepted (2026-10-02).

Records two layers of one decision. The first is the model `adversarial-review` shipped with
(`spec-adversarial-review.md`), which no ADR recorded. The second is its extension in
`spec-grounded-planning-review.md`. It applies the authority model of [ADR-030][adr-030] and supersedes nothing.

## Context

A same-session self-review cannot give fresh eyes: the author's sense of what it meant leaks into the read.
`spec-review` and `task-audit` were lightweight by design and disclaimed validating the design. Two prototype
adversarial passes on a `Heavy` work unit found what they missed: a cost cliff, a consistency crack, a false claim
about a function's contract, and a cross-phase break that per-phase audits miss by construction. The second
manufactured no findings. `adversarial-review` shipped as the method that runs a stage's rubric from fresh context.

Use then showed passes spending on what the author could have found alone. The longest record, `storage-contract`'s
seventeen planning passes, puts 43 of its 58 successor-pass majors in text written after an earlier review — a fix,
a fix-check repair, or another change approved between reviews — or in a gap that text left. At each stage's pass 2
alone the figure is 13 of 20. Two kinds of defect recur:

- **Behavioral grounding.** A named symbol exists but does something other than the claim says. The stage checks
  were existence-grade, and `draft-design` grounded nothing before its pass.
- **Propagation.** A new rule's reach was never swept, or a list was stated complete when it was not.

Nothing checked a fold before the next pass relied on it. The mutation guard verifies each finding before it is
fixed, not the fix. A fresh agent tracing the 27 source claims one round of fixes rested on found one false and five
partly true. A narrow check over ten folds found three majors.

Outside ARC, inspection practice closes rework with a follow-up that verifies each correction and checks for defects
the correction introduced. Published work finds that prompted LLM self-correction without external feedback has not
been shown to improve output outside tasks suited to it, and that LLM evaluators favor their own generations.

`grounded-planning-review`'s own spec stage ran the design by hand. An independent grounding run before the first pass
found three majors and thirteen minors for about 340k tokens; the pass then found four majors. Fix-check rounds after
the pass found one major, one, and none, each in the previous round's repairs.

## Decision

We will review planning artifacts adversarially, after the author has grounded them.

**The core model.**

1. **Fresh context per pass.** Each pass runs the stage's rubric in a subagent given the artifacts, their upstream
   chain, and orientation, and no author reasoning. Where the harness has no subagent, a manual fresh-session pass or
   a skip with a note stands in; a primary-context self-pass is never presented as independent.
2. **An adversarial stance.** The evaluator attacks the design and the artifact rather than confirming them.
3. **Judgment stays with the primary and the Owner.** The primary verifies every finding against source, and the
   Owner approves the complete disposition set before any fix lands.
4. **Loop to convergence.** A pass converges unless its approved dispositions fix a material finding. A
   `Class`-scaled pass cap is the backstop.
5. **An advisory, `Class`-scaled launch.** Every planning boundary offers a pass; `Heavy` and `Novel` recommend it.

**The extension.**

6. **The author grounds first, at every stage.** `source-grounding` checks each claim about shipped behavior by
   tracing or probing, not by existence, and sweeps each new rule's reach. Each stage runs it as its own check before
   any subagent sees the artifact, `draft-design` at its readiness boundary included.
7. **Independent grounding goes inside each pass,** through the pass's rubric, with no separate call before it.
8. **Folds are checked before anyone relies on them.** The author grounds its own folds, then a fresh reviewer checks
   the change since the last review on four axes: closure, behavioral grounding, propagation, and new failure. Rounds
   run on the Owner's approval, outside the pass cap and the next pass's convergence signal.
9. **The cap bounds autonomy, not advice.** At `cap-exhausted` with material signal remaining, a recommendation —
   another pass or a stop — is the default, and the exit gate gains a re-inspection test as a recommendation input.
10. **Every report says who ran it.** A report is `independent` only when its agent never loaded the author's
   reasoning or the work unit's session notes, and `author` otherwise.
11. **Claims name their actor,** and the pass record carries each finding's origin, so the share of fix-borne
    majors can be measured.

**Rejected alternatives, core model.**

- **A team-ceremony extension.** The capability is core and agent-run, so it is a method any boundary calls.
- **A dedicated reviewer agent profile per harness.** A portable prompt keeps the method harness-agnostic.
- **A binary exit gate,** where any finding forces another pass. It spends a full pass on minor residue.
- **`Class`-gated wiring.** Every boundary stays invokable; only the recommendation scales with `Class`.
- **Redundant fan-out** over a whole `Novel` artifact. It overlaps findings and needs merge rules; a
  scope-partitioned lever, off by default, covers breadth instead.

**Rejected alternatives, extension.**

- **An independent grounding run before the first pass.** Once the author's check is behavior-grade, the run sits
  between two checks doing the same job. Its hand run found real defects, but nothing showed the pass would have
  missed them.
- **An independent grounding run at every stage, every time.** It spends a fresh agent on paths no pass will spend on.
- **An author-only fix check.** The author examining its own fixes is not independent.
- **The fix reviewer inside the next pass,** or the fix check counted against the cap. Fix-borne findings would enter
  that pass's convergence signal and draw its attention.
- **A tripwire that decides when to check folds.** No candidate trigger is reliable; the Owner's decline replaces it.
- **One fix-check round per pass.** The rounds kept finding majors in the previous round's repairs.
- **The reasons in this ADR alone.** Shipped content cannot cite an ADR, so a section added to
  `strategy-work-planning.md` states them for projects, and this record keeps the decision and what it turned down.

## Consequences

### Positive

- A pass spends on design judgment, since the slips source already answers are caught before it.
- A fold gets an independent check before the next pass or the commit relies on it.
- An author-run check cannot be read as independent evidence.
- The pass record makes the effect measurable rather than asserted.

### Negative

- Each fix-check round costs about one subagent, roughly 120k to 220k tokens, and adds a disposition turn.
- The author's check adds work at every stage, `Light` included, though it stays in-context.
- The kept reviewed versions are machine-local. A loop that moves to another machine checks its folds from the
  account alone.

### Risks

- **One work unit's evidence.** The baseline comes from one uncontrolled `Novel` work unit. The next `Heavy` or
  `Novel` work unit's fix-borne share, read before it leaves active state, is the test.
- **Grounding slips may still dominate first passes.** If the record shows they do, the pre-pass run returns through a
  decision that supersedes this one.

## Amending This Document

---

[adr-030]: adr-030-anchor-agent-rule-authority.md
