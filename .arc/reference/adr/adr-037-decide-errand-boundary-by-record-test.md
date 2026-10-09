# ADR-037: Decide the Errand Boundary by the Record It Needs

## Status

Accepted (2026-10-09).

The decision's source is `spec-inbound-routing-method.md`. This refines ADR-021 and ADR-027 without superseding
either: the work classes, two-floor structure, Errand mechanism, and record-owned identity stand.

## Context

ADR-027 put the derivation floor at the act of deriving. A concern that carried any design fork could therefore
escalate from an Errand to a Work Unit, even when its intent, diff, and a short decision line kept a sufficient
record. ADR-021's create rule and threshold criterion 3 separately made tracking future work a wrapper trigger.
Those readings feed domain-only routing: cheap capture writes leave another owner a design backlog to integrate.

We rejected a session-length estimate because the agent cannot reliably predict duration; leaning to a Work Unit
when unclear because a running Errand has a cheap promotion exit; retaining the create rule beside the record test
because it would still stub Errand-shaped future work; and splitting the boundary into its own work unit because
inbound routing applies that very floor and needs one reading.

## Decision

We decide the wrapper by four record questions, stated canonically in `classify-work-unit` boundary test 1:

1. Are steps unknowable without mapping the code first, or does the Owner say one sitting will not hold the work?
   This reads the scale axis. Waiting does not count; no agent duration estimate is asked.
2. Does the change deliberately exclude something a reader would expect, which must stay excluded?
3. Would correcting a wrong choice take more than another Errand, such as migrating persisted data or unwinding a
   contract other work builds on?
4. Does a later reader need alternatives and rationale beyond a couple of lines of
   `Decided: X over Y — because Z` in the PR body and commit?

Questions 2–4 read the derivation axis. Any yes makes a Work Unit; otherwise it is an Errand, design discussion
included. The Owner decides with the agent's four answers at the existing placement stop; the test adds no stop.

An unclear concern happening now runs as an Errand and promotes the moment an answer flips: question 1 names
`scale`, questions 2–4 name `derivation`, and derivation wins a tie. When work is not happening now, no default is
assigned: both candidates reach the Owner's existing stop. Under partial protection the exit stops base edits and
starts a work unit at the stage that floor names; in-place full-protection promotion keeps its checkout.

Deciding and guarding stay separate. The questions do not test whether a wrong choice fails quietly. The decision
line, the reviewed lane for infrastructure, and the promote trigger guard an Errand that needed more design.

ADR-021's create rule and tracking criterion 3 retire, and ADR-027's derivation test gives way to this record test.
A roadmap slot is when, not what; an owner follows the wrapper; a dependency is waiting. Making a stub is a transient
`arc stub` act for a concern the questions call a Work Unit. The Heavy derivation trigger is unchanged.

## Consequences

### Positive

- One canonical floor distinguishes needed records from discussion and from tracking mechanics.
- Known-step sweeps and short design choices remain Errands, while exclusions and costly choices get a design.
- Routing applies the same floor before choosing a home.

### Negative

- The Owner must resolve unclear deferred cases rather than accepting an automatic wrapper default.
- In-place promotion can occupy the primary checkout; partial protection requires restarting as a Work Unit.

### Risks

- Quiet under-design still requires review of decision lines and prompt promotion when an answer flips.

## Amending This Document

---
