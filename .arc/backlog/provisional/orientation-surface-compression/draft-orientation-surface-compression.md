# Draft: orientation-surface-compression

- **Origin:** [internal] — surfaced while running `judgment-authority-model`'s compression register, which
  deliberately bounded itself to the two rules files. The remaining always-loaded surfaces were never subjected to
  the same tests.
- **Purpose:** Apply the compression method to the always-loaded surfaces the rules files' register excluded —
  `AGENT-BRIEF.ARC`, `AGENT-BRIEF.PROJECT`, `STRATEGY-INDEX`, and `QUICK-REFERENCE`'s loaded section — after
  extending it to cover **enabling** content, which those surfaces are mostly made of and the current method
  cannot classify.

- **State:** fresh — the concern is identified and its one design unknown is named; nothing else derived.
- **Class:** `[TBD]`. The derivation read turns on whether the enabling-content extension is a composition from the
  existing three-way split or a genuinely new classification.

---

## Inbound Buffer — Pending Integration

> _Routed-in concerns pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration._

### `[ ]` **Decide whether review authority belongs in the always-loaded brief**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: orientation-surface-compression`), housekeep drain
  (2026-07-30); captured during `judgment-authority-model` Task 4.5.a.i.
- _Concern:_ `AGENT-BRIEF.ARC`'s review-authority constraint is the corpus's one marked invariant whose placement
  was outside the upstream rules register. It binds at many possible agent-side review sites, so the
  reachability clause may require it to stay always-loaded rather than move to any single gate.
- _Fold-in:_ judge it with the demotion precondition and Principle 1's "always-loaded or at the gate site" test.
  Preserve the legitimate outcome that it stays; do not assume compression requires movement.

### `[ ]` **Carry reason-4 evidence into the enabling-content derivation**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: orientation-surface-compression`), housekeep drain
  (2026-07-30); captured during `judgment-authority-model` Task 4.5.b.
- _Concern:_ accepted reason 4 supplies independent evidence for enabling content: definitional content is
  disproportionately common in extensions and its wrong placement silently changes the meaning of rules that
  depend on it. It is an upper bound, not a synonym, because an unused schema statement is definitional without
  being load-bearing. The workflow region remains unmeasured on this axis.
- _Fold-in:_ consume `notes-judgment-authority-model.md`'s enabling-content derivation and per-region table.
  Settle the dependency test that separates load-bearing definitions from merely explanatory ones, and decide
  whether a workflow-region reason pass is needed to validate the observed distribution.

---

## Problem

`judgment-authority-model` produced a repeatable method for compressing an always-loaded surface — constraint
determination, destination, trigger strength, P3, pointlessness, applied in that order and at bullet granularity —
and deliberately pointed it at two files only, so its register would stay bounded and enumerable rather than
widening into an open audit mandate. The method is reusable; that register is not.

The remaining always-loaded surfaces total roughly 204 nonblank lines against the rules files' 685, so the
marginal return is real but modest. What makes them worth a separate work unit is not size but that **the method
does not yet classify their content class.**

## The design unknown — enabling content

The rules files are constraints, so `constraint? no` reliably means demotable. The briefs are orientation, and
almost none of them is a prohibition. A naive application of the method marks nearly the whole of
`AGENT-BRIEF.ARC` demotable, which is badly wrong: its vocabulary block is the largest single part of the file and
the least demotable content in the always-loaded set, because `work unit`, `Class`, `interlock`, and
`review increment` are what make the rules that stay readable at all.

So a third category is required beside constraint and explanatory: **enabling** content, carrying no obligation
itself but a precondition for interpreting content that does. Its failure mode is why it needs naming — demoting
an enabling definition silently degrades every rule that uses the term, with no gate and no symptom. Settling what
enabling content is, and how it is told from explanatory content that merely reads as helpful, is this work unit's
derivation.

## Scope

Prose-only, same shape as its upstream: the four surfaces above, no code. Two sequencing constraints carry over:

- **`STRATEGY-INDEX` grows before it shrinks.** `judgment-authority-model` re-authors seven entries from passive
  `Consult when:` lines to explicit-trigger strength, which makes them longer. It cannot be compressed until that
  lands.
- **`QUICK-REFERENCE` is loaded by section, not whole.** Measure its always-loaded footprint at the loaded section
  rather than at the file, or the surface will be overstated several-fold.

## Composition / Coordination

- **`judgment-authority-model` supplies the method** and the enabling-content problem statement. No `Depends On`
  edge on the design, but the `STRATEGY-INDEX` sequencing above is a real ordering constraint against its
  trigger-tier work.
- **`loadset-composition` works the adjacent axis** — which _documents_ are T1 at all, plus the decision rule for
  T1 membership. This work unit is intra-document within surfaces both agree are T1, the same relationship
  `judgment-authority-model` already recorded. Worth re-checking at planning whether this belongs inside the
  `agent-context-optimization` cohort rather than standing alone.
- **`rules-restructure`** holds the fifth destination mechanism (lifecycle-state keying) passed to it by the
  upstream; if it lands, it becomes available here too.

---
