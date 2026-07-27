# Strategy: PM Composition Evolution (project-internal)

> **This is the external-PM forward-compatibility CHECK-DOC.** Before building anything that adds or changes tracker
> integration, PM authority, external identity binding, lifecycle synchronization, portfolio fields, or planning
> module boundaries, run the [Self-Check](#self-check-run-this-before-building) below. Do not deepen duplicate
> authority or provider-specific workflow mechanics while the target model is still being researched.
>
> **Status:** Provisional reference—useful interim direction, not a completed compatibility claim or description of
> current ARC behavior. `external-pm-composition` owns the research, audit, and sharpening that will mature this
> checkdoc.

**Purpose:** Keep interim ARC work composable with both standalone and external-PM use while ARC determines the
durable authority, identity, projection, and adapter boundaries. The target is a complementary whole: ARC supplies
agent-native planning and execution value without asking a team to maintain a second project-management authority.

**Scope:** External issue and project trackers; Planning Module orthogonality; PM-field authority; WU-to-external-item
identity; lifecycle translation; projections and sync; integration failure behavior; ceremony and maintenance cost.
Source-host, CI-platform, and general collaboration-tool compatibility are separate concerns.

**Why project-internal:** This records direction for ARC's own evolution. Adopter-facing guidance must describe only
implemented and supported behavior.

---

## Self-Check: run this before building

Consult this doc when authoring or iterating any plan, spec, workflow, record, config surface, or CLI behavior that:

- Adds or changes a PM-like fact: status, priority, ownership, dependency, milestone, commitment, roadmap placement,
  completion, or external identity.
- Reads from or writes to Jira, Linear, GitHub Issues/Projects, GitLab, Azure Boards, or another tracker.
- Changes `Origin`, project-level tracker configuration, adapter selection, or provider mapping.
- Adds lifecycle-triggered import, export, notification, projection, synchronization, or reconciliation.
- Changes whether backlog, ROADMAP, inbox, or completed-state surfaces are core, optional, derived, or authoritative.
- Introduces provider-specific workflow prose, configuration axes, caches, credentials, or failure states.

Answer these questions explicitly:

1. **Authority:** What exact fact is involved, and which system alone is authoritative for it?
2. **Need:** Is the fact required by ARC's agent-native execution model, only by its standalone PM implementation, or
   merely for presentation?
3. **Duplication:** Does the design create a second mutable copy? If so, is it a declared projection with a freshness
   and reconciliation contract?
4. **Standalone:** What supplies the capability when no external system is configured?
5. **Composition:** What happens when the project already has an authoritative tracker and workflow?
6. **Identity:** Is an external item mapped to an ARC WU rather than used as ARC WU identity?
7. **Procedure:** Does the CLI compute provider dispatch, mapping, retries, and verdicts while workflow prose invokes
   provider-neutral operations?
8. **Failure:** Are offline, auth, permission, rate-limit, stale-state, deletion, and conflict behavior explicit and
   proportionate?
9. **Ceremony:** Which existing team action becomes unnecessary, and does the integration remove more work than it
   adds?
10. **Evidence:** Is the claim about current ARC, accepted/planned ARC, or a proposed target?

If any answer is unknown, preserve the seam and route the decision to `external-pm-composition`; do not silently fix
the target shape in the consuming WU.

## Interim Target

ARC should be equally coherent in two postures:

- **Standalone:** ARC's own project layer supplies the necessary portfolio and pipeline capabilities.
- **Composed:** an existing external PM system may retain authority for the portfolio facts it already owns, while
  ARC supplies complementary agent-native planning and execution.

The work-unit lifecycle and the in-git project-management implementation are not presumed to be the same boundary.
Work units, design, task decomposition, session continuity, verification, review, and integration procedure may remain
core even when backlog placement, prioritization, assignment, or global status live elsewhere.

The target is not “ARC plus a synchronized copy of Jira.” It is one operating model with a declared authority for each
mutable fact.

## Provisional Principles

### 1. One mutable fact, one authority

Every PM-adjacent fact names one authoritative system. Other representations are read-only views, caches, or
projections with explicit freshness and recovery behavior. A hyperlink does not establish authority, and matching
field names do not establish synchronization.

### 2. Preserve the agent-native execution core

External issue trackers do not automatically replace ARC's design, executable specifications, task decomposition,
session context, verification evidence, review increments, or procedural lifecycle. Remove or externalize one only
when evidence shows the external system satisfies the same agent and human needs without added ceremony or loss.

### 3. Keep standalone and composed use first-class

External composition cannot be required for a complete ARC experience. Conversely, standalone capability does not
justify forcing an internal portfolio authority on a project that already has one. Prefer a minimal internal
implementation behind a shared semantic boundary over two competing models.

### 4. Keep tracker choice orthogonal to planning depth and pipeline footprint

A project may want ARC's in-git backlog plus external issue linkage, or no ARC backlog plus an external portfolio
authority. Do not encode tracker choice as a mutually exclusive proxy for planning depth, work-unit rigor, archive
retention, team size, or storage tier.

### 5. Map external identity; do not derive ARC identity from it

ARC WU identity remains provider-, repository-, and branch-independent. External provider/workspace/item identity is a
binding whose cardinality, rebinding, migration, and deletion semantics must be explicit. `Origin` is currently an
association surface, not a sufficient binding or sync contract.

### 6. Prefer typed verbs and verdicts over adapter prose

Provider selection, capability checks, API calls, mapping, retries, timeouts, and failure classification belong in
typed CLI or adapter contracts. Workflows invoke stable operations and render precomposed outcomes. Projects should not
have to encode correctness-critical synchronization as free-form extension instructions.

### 7. Start below bidirectional synchronization

Use the least elaborate compatibility level that satisfies real workflows. Linking, seeding, observing, or emitting
ceremony events may solve a need without mirrored mutable state. Bidirectional synchronization must justify its full
identity, conflict, ordering, deletion, recovery, auth, migration, and maintenance costs.

### 8. Degrade without corrupting authority

An unavailable provider may reduce freshness or block an externally-authoritative mutation, but must not cause ARC to
silently claim authority, overwrite stale state, or invent success. Read-side advisory features fail softly; writes
fail explicitly and preserve retry/reconciliation evidence proportionate to their consequence.

### 9. Avoid a lowest-common-denominator provider model

Define the stable semantics ARC needs and negotiate provider capabilities against them. Do not either leak one
provider's vocabulary into ARC's core or flatten every provider to the weakest shared feature. Unsupported mappings
must be explicit.

### 10. Integration must earn its ceremony and maintenance

Compatibility is not successful merely because an adapter can exchange fields. The composed workflow should remove
routine entry, improve agent context, or strengthen traceability enough to outweigh setup, credentials, reconciliation,
provider churn, and operator attention.

## Compatibility Ladder

Use distinct levels when describing support:

1. **Linked:** `Origin` associates a WU with an external item.
2. **Seeded:** external context initializes ARC work without manual re-entry.
3. **Observed:** ARC reads relevant external coordination or status.
4. **Notified:** ARC lifecycle ceremonies emit selected external updates.
5. **Federated:** declared external facts are authoritative through typed mappings and reconciliation.
6. **Synchronized:** controlled bidirectional mutation is supported.

Do not call Level 1 or a free-form extension “integrated” without naming the actual level. The target level remains
open pending the audit; synchronization is not the default assumption.

## Interim Boundaries

Until `external-pm-composition` settles the target:

- Treat `Origin` as provenance/linkage only.
- Keep external coordination probes read-side and advisory.
- Do not add a generic bidirectional sync engine.
- Do not make provider data the sole durable home of ARC's agent-native WU artifacts.
- Do not add a new provider or storage mode merely to express tracker choice.
- Preserve provider-neutral lifecycle fire points, but do not promise that existing free-form extensions form a
  complete integration contract.
- State field-level authority explicitly in any interim design that crosses the ARC/tracker boundary.

## Required Evaluation

The owning WU must:

- Map ARC's current facts and operations to their authorities, consumers, and stale-state consequences.
- Separate current behavior, accepted/planned direction, and recommended target.
- Study GitHub Issues plus Projects, Jira, and Linear as primary archetypes; validate the model against at least one
  additional development tracker.
- Trace start, update, handoff, integration, archive, reopen, failure, and standalone scenarios.
- Measure manual touches, duplicate writes, authority ambiguity, translation loss, ceremony, and maintenance cost.
- Classify overlapping ARC capabilities as agent-native core, standalone backend, projection, unnecessary
  duplication, or unresolved.
- Produce downstream WU cuts only after the authority and provider boundaries are stable.

## Known Tensions

- Accepted architecture permits external trackers to be status-of-record, while storage evolution currently says ARC
  remains canonical and external tools do not own WU artifacts. The target must distinguish portfolio-fact authority
  from ARC-artifact authority or revise one of those positions.
- Current `pm.mode: external` names where PM lives but has little typed behavior. Proposed scalable-core direction
  removes that enum value and makes tracker integration orthogonal; it is not yet accepted.
- `Origin` is an unstructured semantic value. It cannot by itself express provider identity, workspace, item key,
  cardinality, version, rebinding, or conflict behavior.
- Current external setup relies on free-form capture rules, extensions, and method overrides. These are useful escape
  hatches but do not establish a tested provider contract.
- The planned external coordination probe solves a narrow read-side discovery question. It is evidence for an adapter
  seam, not the general PM-composition architecture.

## Relationship to the Evolution Checkdocs

- [Storage evolution](strategy-storage-evolution.md) constrains canonical storage, version-checked writes, WU identity,
  and service-optional operation. This checkdoc must sharpen its whole-WU external-authority boundary.
- [Procedure evolution](strategy-procedure-evolution.md) requires deterministic provider behavior and emitted remedies
  to live in typed CLI surfaces rather than workflow prose.
- [Knowledge evolution](strategy-knowledge-evolution.md) requires authored-once, audience-aware projections and
  operation-triggered guidance rather than a provider-specific loading tier.

This checkdoc owns the semantic boundary—what composes and who owns which fact. The sibling checkdocs own where state
lives, how procedure executes, and how knowledge is projected and loaded.
