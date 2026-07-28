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
