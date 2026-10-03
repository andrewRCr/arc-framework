---
name: spec-review
description: Self-review of a just-written spec — coherence and behavior-grade grounding, scaled to the form.
arc:
  methods:
    - source-grounding
related:
  - source-grounding
override-active: false
---

# Method: spec-review

> - **Workflow:** [create-spec.md][create-spec], [amend-design.md][amend-design]
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
together and grounds its claims in source behavior.

**Coherence — the spec hangs together.**

- The decisions, scope boundary, success criteria, and the form's enumerable substrate all agree — no internal
  contradiction (a success criterion testing something the scope excludes; a requirement no decision supports).
- No placeholder, orphaned, or half-written sections; every section the form requires is present and carries real
  content.
- The substrate the task list will be built from — numbered **Requirements** (PRD), the structured **Proposed
  Design** (RFC), the settled **Decisions** (`outline`), the one **signal** (`brief`) — is complete and
  unambiguous.

**Grounding — the spec's claims hold at source.**

Run [source-grounding][source-grounding] at `artifact` scope over the spec and its upstream chain, or the affected
spec elements when amending it. The runner label follows that method's rule; caller inputs stay unchanged. Its
behavior check and propagation sweep ground claims in what named code, tools, configuration, and shipped rules
actually do, with its severity interpretation.

```yaml
source-grounding:
  artifacts:  # spec (or amendment footprint) + upstream chain
  scope: artifact
```

**Scale to the form — the bar is invariant (coherent + grounded); grounding distance scales with the number of
claims about shipped behavior.**

- **`brief` → quick.** One pass: is the single success signal concrete and falsifiable, and the scope boundary
  clear? Ground every claim about shipped behavior; few claims keep this to one minimal check.
- **`outline` → moderate.** Each decision settled with its rationale; consequences / risks named; success criteria
  checkable; every claim about shipped behavior grounded.
- **`detailed` → full.** Every section coherent and complete; the substrate (Requirements / Proposed Design)
  exhaustive and unambiguous; the cross-cutting surface present; every claim about shipped behavior grounded.

**Posture.** Corrective: fix what you can inline as you go, and surface anything that needs a
decision at the finalization stop rather than adding a gate. A finding that reopens _design_ — a masked decision,
an unsettled fundamental — is a derivation signal: route it back to the design (draft / spec), never paper over it
in the spec.

**Novel overlay** (`Class == Novel`, `detailed` only, advisory). Novel work warrants extra coherence and grounding
care — an invented model has no established pattern to lean on. Add an advisory nudge: was the invented model's
rationale captured, and was an **ADR-companion** considered (per create-spec's Novel overlay)? A recommendation at
the finalization stop, never a gate.

---

[create-spec]: ../workflows/arc/create-spec.md
[amend-design]: ../workflows/arc/supplemental/amend-design.md
[source-grounding]: source-grounding.md
