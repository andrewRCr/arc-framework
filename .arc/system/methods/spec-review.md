---
name: spec-review
description: Review new or revised specifications for reader independence, binding completeness, coherence, and grounding.
arc:
  methods:
    - source-grounding
related:
  - source-grounding
override-active: false
---

# Method: spec-review

> - **Workflow:** [create-spec.md][create-spec], [generate-tasks.md][generate-tasks],
>   [decompose-work-unit.md][decompose-work-unit], [amend-design.md][amend-design]
> - **When:** A new specification set or a bounded batch of substantive changes to a specification authored under
>   this reader standard is ready for its existing approval or release boundary.
>
> - **Contract:** Check reader independence and binding completeness for the selected scope, with coherence and
>   grounding scaled to the form and caller-selected depth. Fold corrections into the existing iteration flow;
>   surface anything needing a decision at its existing stop. Review the written contract without reopening
>   settled design or adding an interlock.

## spec-review.override

[No override configured]

## spec-review.default

Review the complete new specification set, or the changed footprint of a specification authored under this standard,
including removals and affected surrounding obligations and definitions. A local correction does not expand review
to unrelated content. Apply the standard prospectively; existing specifications need no retrofit.

**Common reader checks — required for either slice**, including grounding-only calls and coherence-only rereads:

- **Reader independence:** Desired behavior, scope, required concepts, and observable success conditions stand
  without planning history. Work-unit names, register rows, drafts, notes, and another work unit's specification
  cannot supply missing meaning. Replace dependence on them with the substance they supplied; exclusions state
  behavior rather than another change's ownership.
- **Binding completeness:** The form's enumerable design supports complete task coverage, and its criteria
  distinguish correct behavior. Retain every requirement, settled decision, interface, invariant, precondition,
  failure case, exclusion, acceptance condition, and decisive rationale. Notes may carry supplemental execution
  context, exploration history, and provenance, but never the sole definition of an obligation or decision.

**Reference boundaries:**

- Use accessible established project code and documentation, and internal specification references, for defined
  concepts and existing behavior. State the desired behavior and changes in the specification itself; define
  unfamiliar required concepts locally or reference their established definition.
- Keep symbols, schema fields, examples, requirement identifiers, and section references precise and usable.
  Judge what supplies meaning, not tokens. ARC terms and artifact names are valid subject matter when their
  required meaning is established or defined locally.
- Treat an accessible complementary PRD/RFC pair by distinct product and engineering authors as one specification
  set, preserving its division of content. An unavailable companion cannot supply context or binding design;
  another work unit's specification cannot substitute for it.
- Preserve title identity, `Origin`, and `Purpose` where present, and existing pre-activation `State` and
  `Related Work` tracking. The substantive thesis stands without tracking fields; they supply no missing design.
- Preserve amendment records, boundary carriers, and task locators. Each binding amendment states its behavior
  independently of process anchors and satisfies the common checks over its affected contract.
- Define an unshipped prerequisite as an expected contract with its availability condition, rather than asserting
  shipped behavior or borrowing its definition from a sibling plan.

The remaining coherence and grounding work follows the caller's depth selection and the resolved form. Preserve
existing alignment checks and design re-entry routing.

**Coherence — the spec hangs together.**

- The decisions, scope boundary, success criteria, and the form's enumerable substrate all agree — no internal
  contradiction (a success criterion testing something the scope excludes; a requirement no decision supports).
- No placeholder, orphaned, or half-written sections; every section the form requires is present and carries real
  content.
- The substrate the task list will be built from — numbered **Requirements** (PRD), the structured **Proposed
  Design** (RFC), the settled **Decisions** (`outline`), the one **signal** (`brief`) — is complete and
  unambiguous.

**Grounding — the spec's claims hold at source.**

Run [source-grounding][source-grounding] at `artifact` scope over the selected specification scope and its upstream
evidence chain. Upstream evidence grounds claims; it cannot supply otherwise missing binding design. The runner label
follows that method's rule; caller inputs stay unchanged. Its
behavior check and propagation sweep ground claims in what named code, tools, configuration, and shipped rules
actually do, with its severity interpretation.

```yaml
source-grounding:
  artifacts:  # specification set or changed footprint + upstream evidence chain
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
decision at the caller's existing stop rather than adding a gate. A finding that reopens _design_ — a masked decision,
an unsettled fundamental — is a derivation signal: route it back to the design (draft / spec), never paper over it
in the spec.

**Novel overlay** (`Class == Novel`, `detailed` only, advisory). Novel work warrants extra coherence and grounding
care — an invented model has no established pattern to lean on. Add an advisory nudge: was the invented model's
rationale captured, and was an **ADR-companion** considered (per create-spec's Novel overlay)? A recommendation at
the finalization stop, never a gate.

---

[create-spec]: ../workflows/arc/create-spec.md
[generate-tasks]: ../workflows/arc/generate-tasks.md
[decompose-work-unit]: ../workflows/arc/work-unit-lifecycle/decompose-work-unit.md
[amend-design]: ../workflows/arc/supplemental/amend-design.md
[source-grounding]: source-grounding.md
