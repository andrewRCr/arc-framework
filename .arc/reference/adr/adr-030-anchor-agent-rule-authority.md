# ADR-030: Anchor Agent Rule Authority

## Status

Accepted (2026-07-28).

Generalizes [ADR-016][adr-016] (configurable autonomy interlocks), [ADR-020][adr-020] (principle-anchored
invariant floor), and [ADR-029][adr-029] (review authority division) under one authority model. It supersedes
none of them; all three stay in force unchanged.

## Context

ARC states rules across many surfaces — the rules files, methods, workflows, extensions, strategies. Whether a
given rule may be set aside by an agent in the moment was never stated, so it was re-decided per site. Six prior
enactments had each answered it locally for their own domain, and three live failures traced to the absence of a
general answer: a review invalidated by a typo, a merge capability read as withheld because the authorization
was, and a quality-gate rule applied to a gate that never ran.

Two further problems made the model worth anchoring rather than merely writing.

**ARC does not run on bare metal.** It claims agent-agnosticism and harness-agnosticism as a product goal
(`PROJECT-PRD`; [ADR-002][adr-002]), which means it runs inside harnesses that carry their own rules about how
an agent relates to its operator. At least one host harness states, as a first-class standing rule, that when a
user reaffirms a request after the agent raises a concern, the agent treats that as the decision and proceeds.
A methodology that says nothing about this either gets silently overridden or ends up asserting a precedence it
has no standing to assert. Neither is acceptable in a framework whose rules are meant to hold across harnesses
it does not control.

**"Invariant" was already taken, in a different sense.** [ADR-016][adr-016] uses it for **not
project-configurable** — "the task-interlock remains invariant and is not configurable" — and [ADR-020][adr-020]
builds an "invariant floor" on the same axis: structure every tier carries regardless of any toggle. The
authority model needs the word for **not agent-dischargeable**. Those are different axes, and one word carrying
both across the layer this ADR unifies is a collision waiting to be discovered by a reader rather than stated
to one.

## Decision

We will anchor a single agent-facing authority model, stated operationally in `DEV-RULES.ARC` § Rule Authority
and generalized here.

1. **Every rule ARC states is a default unless marked invariant**, and the classification reading for unmarked
   rules lives in the register, not in this ADR. Placement follows frequency of consultation: the reading is
   applied constantly and belongs in an always-loaded surface; the rationale for why the model has this shape is
   consulted rarely and belongs here. Nothing summons an ADR.

2. **Two orthogonal axes, named.** _Configurability_ is project-facing — whether the project may set a rule's
   shape ([ADR-016][adr-016], [ADR-020][adr-020]). _Dischargeability_ is agent-facing — whether the agent may
   set the rule aside in the moment. A configured rule is still a default or an invariant; configurability is
   never itself a discharge. The two axes happen to coincide on the task- and integration-interlocks, which are
   both not-configurable and not-dischargeable, and that coincidence is why the collision has never bitten.

3. **The model constrains the agent, not the operator.** An invariant withholds the agent's authority to
   **decide**, never the capability to act. Every invariant has a holder — resolved from the actor's role and
   the governed surface — and the holder making the reserved decision is the rule functioning, not an exception
   to it. An operator authorizing a merge _is_ the merge gate.

4. **Therefore no precedence claim against a host harness is needed or made.** A harness rule that operator
   reaffirmation settles a disagreement governs how the agent treats the _operator's_ decisions. This model
   governs what the agent may decide _on its own authority_. They address different questions and do not
   compete. What reaffirmation cannot do is transfer a reserved decision to the agent — not because ARC
   outranks the harness, but because there is nothing in reaffirmation that makes the agent the holder.

5. **Generalizing, not superseding.** [ADR-016][adr-016]'s interlock vocabulary and configurability decisions,
   [ADR-020][adr-020]'s invariant floor, and [ADR-029][adr-029]'s CLI / agent / human division all stand
   unchanged. This ADR names the axis they share; [ADR-029][adr-029] in particular is the review domain's
   instance of the general model, decided before the general model existed.

## Consequences

### Positive

- A rule's classification is derived from a stated reading rather than re-decided per site, so the same rule
  gets the same answer in a workflow, a method, and a strategy.
- Divergence from a default becomes disclosure rather than silence: discharging requires naming the fact that
  discharges it, and the named fact is the disclosure.
- The relationship to host-harness authority rules is stated, so neither surface has to be read as overriding
  the other.
- The terminology collision is documented at the layer where both senses meet, rather than surviving as an
  ambiguity two ADRs apart.

### Negative

- Two senses of "invariant" remain in the corpus. This ADR states them rather than renaming either; a rename
  would touch accepted decision records to remove an ambiguity that only appears when both are read together.
- The classification reading admits judgment. An agent that names a fact badly reaches a wrong classification,
  and the model catches that through disclosure rather than by preventing it.

### Risks

- **The undischargeable-ignorance shape.** A rule guarding an ignorance the agent can never discharge — the
  settling fact lives in another mind and has not been uttered — reads as ignorance-guarding yet behaves as an
  invariant. A reading that applies only the wrong-versus-biased split classifies it as a default, and errs
  permissively. Where a rule's own text does not settle it, the marker is the remedy rather than a judgment
  left to each reading.
- **Marker drift.** The marker is deliberately concentrated rather than applied corpus-wide, on the precedent
  that `[configurable]` lives in one file. If the footprint spreads, the derived reading weakens into an
  annotation habit and unmarked rules start reading as unclassified rather than as defaults.

---

[adr-002]: adr-002-session-model-and-agent-compatibility.md
[adr-016]: adr-016-configurable-autonomy-interlocks-for-session-operations.md
[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md
[adr-029]: adr-029-right-size-review-authority.md
