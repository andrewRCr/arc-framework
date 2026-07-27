# Draft: External PM Composition

- **Origin:** [internal] — evaluation prompted by uncertainty about whether ARC's current and planned
  project-management surfaces can complement established issue trackers without duplicated authority or ceremony.
- **Purpose:** Determine how ARC can remain complete when used alone while composing cleanly with external
  project-management systems, and use that evidence to distinguish ARC's agent-native value from unnecessary
  reinvention.

---

## Planning Continuity

- **Readiness:** rough
- **Resolved:** The evaluation separates current, accepted/planned, and recommended ARC; tests composition through
  concrete workflows rather than feature checklists; includes an NIH audit; and produces a durable interim checkdoc
  plus downstream backlog implications. The WU evaluates and designs—it does not implement provider adapters.
- **Open:** Field-level authority, target compatibility level, provider capability boundaries, external identity
  mapping, lifecycle translation, failure/reconciliation behavior, and the disposition of overlapping ARC PM
  surfaces. The relationship between external portfolio authority and ARC-canonical WU artifacts is the central
  unresolved design question.
- **Next:** Build the ARC fact-and-operation authority map, then validate it through representative external-tool
  workflows before selecting the target composition model.

## Problem / Motivation

ARC was originally designed so its in-git project-management pipeline could be omitted when a team already used an
external tracker. The methodology later moved toward a scalable-core model in which work units, agent-executable
planning artifacts, review increments, and lifecycle discipline remain coherent across work sizes. That direction
does not itself answer whether the in-git portfolio pipeline is an interchangeable implementation or an inseparable
part of the core.

Today ARC can associate a work unit with an external issue through `Origin`, and its accepted architecture states
that Jira, Linear, or GitHub Issues may be the status-of-record. The implemented integration is much thinner:
`Origin` is an unstructured semantic string, external setup asks projects to author free-form routing and extension
instructions, and no typed provider binding, authority map, identity mapping, or reconciliation contract exists.
Meanwhile ARC stores fields and locations that overlap ordinary tracker concerns—priority, ownership, dependencies,
commitment, lifecycle status, roadmap placement, and completion.

The risk runs in both directions:

- **Composition failure:** a team must maintain ARC and its existing tracker as competing systems of record, adding
  double entry, synchronization ambiguity, and ceremony that costs more than ARC contributes.
- **Standalone regression:** making external tools primary could hollow out ARC's standalone experience or make it
  depend on a hosted service.
- **NIH burden:** ARC may own portfolio mechanisms that add maintenance cost without supplying distinct agent-native
  value.
- **Value erasure:** superficial overlap with issue trackers may cause ARC to discard design, execution, session, and
  review structures that solve a different problem and should remain its responsibility.

The evaluation must therefore ask not merely whether an API adapter is possible, but whether ARC and an external
tracker can form one coherent operating model with one authority for each mutable fact.

## Success Contract

A successful target makes the following statements true:

1. A project can use ARC without an external PM system and retain a complete, first-class workflow.
2. A project already using an external PM system can retain it without routine double entry.
3. Every mutable fact has one declared authority; mirrored or projected values are identified as such.
4. ARC preserves the agent-native planning, execution, continuity, verification, review, and integration value that
   external PM systems do not replace.
5. Existing team ceremonies and tracker workflows need only the changes justified by ARC's added value.
6. Provider absence, stale data, permission failure, offline operation, and conflicting updates have explicit,
   recoverable behavior.
7. ARC does not acquire a provider-specific maintenance surface or generic synchronization engine without evidence
   that a less elaborate composition model is inadequate.
8. Current compatibility, accepted/planned compatibility, and recommended target compatibility remain distinct in
   every finding.

## Evaluation Design

### 1. ARC fact-and-operation authority map

Inventory every PM-adjacent fact and operation, including:

- External item identity, title, intent, priority, ownership, dependencies, milestones, cohort, and commitment.
- WU identity, Class, Origin, design, task plan, current task, session context, blockers, review state, PR evidence,
  lifecycle phase, completion, archive, and roadmap projection.
- Create, seed, activate, update, hand off, integrate, archive, reopen, rebind, reconcile, and recover operations.

For each, record current authority and storage, readers and writers, stale-state consequence, standalone need,
external-authority suitability, projection needs, and the provider-neutral operation that would consume it.

### 2. Representative external-system study

Research representative archetypes rather than every product:

- **Primary:** GitHub Issues plus Projects, Jira Software, and Linear.
- **Secondary validation:** GitLab Issues/Epics and Azure Boards.
- **Optional probes:** Shortcut, YouTrack, Asana, Notion, or Trello only when they expose a materially different
  workflow or authority model.

Use current official documentation for capabilities and interfaces, supplemented by clearly-labeled practitioner
evidence for normal workflow and ceremony costs. Assess identity and hierarchy, statuses, custom fields,
dependencies, issue/branch/PR relations, APIs, webhooks, authentication, permissions, automation, failure modes,
and maintenance expectations.

### 3. Composition scenarios

Walk the same stories through ARC alone and each representative system:

1. Start an ARC WU from an existing external issue.
2. Change assignment, priority, dependencies, or status externally while work is active.
3. Produce and revise ARC design and task artifacts.
4. Continue work across sessions, machines, or developers.
5. Activate, integrate, archive, close, reopen, move, rename, rebind, or delete linked work.
6. Operate with missing credentials, network failure, rate limits, insufficient permissions, or stale data.
7. Run an Errand with no external issue, then promote it when it crosses the WU floor.
8. Use ARC with no external PM system.

For each trace, count manual touches and duplicated writes, identify authority ambiguity and translation loss, and
record ceremony, provider, failure-recovery, and maintenance costs.

### 4. Compatibility ladder

Evaluate distinct promises rather than treating integration as binary:

1. **Linked** — `Origin` associates a WU with an external item.
2. **Seeded** — external context can initialize ARC work without re-entry.
3. **Observed** — orientation can read relevant external coordination and status.
4. **Notified** — ARC ceremonies can emit selected external updates.
5. **Federated** — declared external facts are authoritative, with typed mappings and reconciliation.
6. **Synchronized** — controlled bidirectional mutation is supported.

The study selects the least elaborate level that meets the success contract. Full bidirectional synchronization is
not a presumed goal.

### 5. NIH audit

Classify each overlapping ARC capability as one of:

- **Agent-native core:** ARC should own it.
- **Standalone backend:** ARC needs a minimal internal implementation behind a replaceable boundary.
- **Projection:** the surface is useful but should not claim independent authority.
- **Unnecessary duplication:** retire or redesign it.
- **Unresolved:** evidence or a bounded prototype is required.

A feature resembling a tracker feature is not by itself an NIH finding. Material duplicate authority, duplicate
maintenance, or avoidable lifecycle machinery is.

## Leading Direction, Not Yet a Decision

The strongest working model is domain-level federation:

- An external system may own portfolio facts such as issue identity, assignment, priority, selected dependency
  edges, milestones, and high-level workflow status.
- ARC owns agent-executable design, specifications, task decomposition, session continuity, verification evidence,
  review increments, and its procedural lifecycle.
- ARC's in-git project layer supplies the standalone implementation of portfolio capabilities rather than forcing
  itself to remain a second authority when a tracker already owns them.
- Provider interaction is expressed as typed, provider-neutral CLI verdicts and lifecycle verbs. Workflow prose does
  not implement API dispatch, mapping, retries, or conflict logic.
- External items map to ARC WU identity; they do not define it. The design must test one-to-one, one-to-many,
  rebinding, provider migration, and heterogeneous-Origin cases before fixing cardinality.

This direction is deliberately weaker than a design decision. The authority audit and external research may show
that a lower compatibility level is sufficient or that some apparently external facts must remain ARC-canonical.

## Existing Constraints and Tensions

- Accepted external-compatibility intent permits an external tracker to be the status-of-record, but its historical
  method-override mechanism predates ARC's typed record and lifecycle substrate.
- The accepted three-mode model still defines `pm.mode: external`; the proposed scalable-core direction instead
  makes tracker integration orthogonal to the Planning Module.
- The storage-evolution north star keeps ARC's git-backed store canonical and forbids external ownership of WU
  artifacts. The study must clarify whether that means whole-record authority or ARC-only artifact classes; otherwise
  it conflicts with external ownership of portfolio facts.
- The external coordination probe is read-side and advisory. It may become one input surface, but it is not a general
  PM adapter and should not be widened before this evaluation settles the abstraction boundary.
- The knowledge and procedure north stars require authored-once projections, operation-triggered knowledge, typed
  provider verdicts, precomposed failure remedies, and provider mechanics outside workflow prose.

## Alternatives

### Keep association-only integration

Retain `Origin` plus project-authored extension prose. Lowest implementation cost, but likely fails the no-double-entry
and explicit-failure portions of the success contract for teams expecting meaningful composition.

### Make the external tracker canonical for the whole WU

Model ARC artifacts as external issue content or attachments. Reduces local duplication but threatens standalone use,
git-backed durability, agent-readable context, provider portability, and ARC's distinct execution semantics.

### Federate authority by domain

Keep ARC WU identity and agent-native artifacts while allowing an external system to own defined portfolio facts.
Most promising, but requires a precise field/operation authority model and explicit reconciliation at the boundary.

### Build generic bidirectional synchronization

Mirror both systems and reconcile changes in either direction. Maximizes theoretical flexibility but introduces
identity, ordering, deletion, auth, rate-limit, conflict, and migration obligations. Consider only if scenario
evidence proves federation or one-way operations inadequate.

## Scope

### In scope

- Current and planned ARC compatibility audit.
- Representative external-tool and industry-workflow research.
- Authority, identity, lifecycle, projection, failure, and ceremony analysis.
- NIH disposition of overlapping ARC PM surfaces.
- Target composition principles and compatibility promise.
- Checkdoc refinement and downstream backlog/dependency recommendations.
- Bounded read-only or sandboxed prototypes only where documentation cannot settle a material question.

### Out of scope

- Production provider adapters or credential storage.
- Migrating existing ARC projects.
- Implementing scalable core, storage evolution, external coord probe, or any remediation WU.
- Claiming universal compatibility across every PM product.
- Treating source-host compatibility, CI platforms, or general collaboration suites as the same problem.

## Work-Unit Boundary

This remains one WU while it produces one evidence base, authority model, and target architecture. Independently
deliverable remediation mechanisms—provider adapters, identity binding, lifecycle projection, config reform,
or artifact changes—become downstream WUs once the audit makes their cuts real.

## Dependencies and Coordination

- `scalable-core` owns the current config and Planning Module reform. Its proposed direction gives this audit
  constraints to test—tracker orthogonality, per-WU `Origin` plus one project-level pointer, and no project-adapter
  multi-tracker fan-out—while leaving refined tracker shape and decision ownership open.
- `external-coord-probe` owns a narrow read-side coordination signal and must consume, not pre-empt, the resulting
  composition boundary.
- The storage, procedure, and knowledge evolution checkdocs constrain canonical storage, typed execution, and
  projection/awareness respectively.
- Current accepted external-tool and PM-mode ADRs are evidence, not unquestioned target truth; proposed ADRs remain
  proposals.

## Scope Estimate

Large (multi-session research and architecture work). Implementation is deliberately excluded; its result is a
decision-ready target and a set of independently scoped remediation WUs.
