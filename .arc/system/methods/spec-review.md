---
name: spec-review
description: Lightweight default self-review of a just-written spec — coherence + grounding, scaled to the form.
override-active: false
---

# Method: spec-review

> - **Workflow:** [1_create-spec.md][create-spec]
> - **When:** A spec has just been written, at create-spec's finalization review gate — before the spec is
>   approved and committed.
>
> - **Contract:** Given the just-written spec and its resolved form, run a two-slice self-review — **coherence**
>   and **grounding** — scaled to the form; fold fixes in inline and surface anything that needs a decision at the
>   finalization stop. Reviews the written artifact, not the design decisions (settled in discovery) — and adds no
>   new interlock; it feeds the existing one.

## spec-review.override

[No override configured]

## spec-review.default

A final pass over the spec you just wrote, before it is surfaced for approval. Two slices, each scaled to the
form. This is not a re-litigation of the design (discovery settled that) nor a repeat of the alignment checks
(those ran against PROJECT-PRD / TECHNICAL-OVERVIEW earlier) — it reviews whether the written artifact holds
together and refers to real things.

**Coherence — the spec hangs together.**

- The decisions, scope boundary, success criteria, and the form's enumerable substrate all agree — no internal
  contradiction (a success criterion testing something the scope excludes; a requirement no decision supports).
- No placeholder, orphaned, or half-written sections; every section the form requires is present and carries real
  content.
- The substrate the task list will be built from — numbered **Requirements** (PRD), the structured **Proposed
  Design** (RFC), the settled **Decisions** (`outline`), the one **signal** (`brief`) — is complete and
  unambiguous.

**Grounding — the spec's concrete references are real.**

- Named files, symbols, components, and dependencies exist (or are clearly marked as to-be-created).
- Cited principles / sections resolve to real anchors.
- Claims leaning on existing code or prior work are plausible against reality — a **light** verification, not the
  deep per-phase grounding audit at task generation (that one is scale-keyed and runs later against the work
  surface).

**Scale to the form — the bar is invariant (coherent + grounded); the distance scales.**

- **`brief` → quick.** One pass: is the single success signal concrete and falsifiable, and the scope boundary
  clear? Grounding is near-trivial. Collapses to one minimal check.
- **`outline` → moderate.** Each decision settled with its rationale; consequences / risks named; success criteria
  checkable; the handful of concrete references grounded.
- **`detailed` → full.** Every section coherent and complete; the substrate (Requirements / Proposed Design)
  exhaustive and unambiguous; the cross-cutting surface present; all concrete references grounded.

**Posture.** Lightweight and corrective: fix what you can inline as you go, and surface anything that needs a
decision at the finalization stop rather than adding a gate. A finding that reopens *design* — a masked decision,
an unsettled fundamental — is a derivation signal: route it back to the design (draft / spec), never paper over it
in the spec.

**Novel overlay** (`Class == Novel`, `detailed` only, advisory). Novel work warrants extra coherence and grounding
care — an invented model has no established pattern to lean on. Add an advisory nudge: was the invented model's
rationale captured, and was an **ADR-companion** considered (per create-spec's Novel overlay)? A recommendation at
the finalization stop, never a gate.

---

[create-spec]: ../workflows/arc/1_create-spec.md
