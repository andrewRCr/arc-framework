# ADR-040: Accept ADRs When Their Work Merges

## Status

Accepted (2026-11-05)

Records the accept-at-merge lifecycle, ADR dispositions at planning close, merge checks, and reader independence.

## Context

Architecture Decision Records (ADRs) are the durable explanation of this project's architectural choices. A reader
should be able to find a decision by concern and understand its alternatives and consequences without reconstructing
how development was organized. Four defects prevented that:

- Planning prompted ADRs only for invention-heavy work, leaving other significant decisions without a record.
- Acceptance could precede implementation, while acceptance also locked the body. Corrections discovered during the
  same implementation therefore became amendments to an unnecessarily early historical record.
- Nothing detected a forgotten acceptance. Several records remained Proposed after their named realizations shipped.
- ADR bodies could rely on planning names and execution history to supply meaning unavailable to a later reader.

More frequent ADR creation also increases the chance that concurrent changes choose the same next number. A citation
by number must identify one record, and a collision needs a concrete correction rather than an unexplained failure.

### Alternatives considered

- **Accept on a later lifecycle event.** A structured promotion trigger would couple ADR acceptance to development
  identity and lifecycle state, including their availability in CI. It would also leave records editable for long
  periods after the decision. The delivering change already supplies a concrete acceptance boundary.
- **Accept at agreement or implementation kickoff.** Both lock the record before implementation can correct its
  premises. Setting Accepted during verification but locking at that flip has the same problem for review findings.
  The accepting merge is the boundary after those corrections.
- **Write the ADR during planning.** This would require ADR files to travel through planning-only publication paths.
  The decision and its disposition can remain binding in planning records until implementation delivers the file.
- **Write one ADR per qualifying decision or tune the qualification threshold.** The former fragments related
  rationale into near-duplicate records. Coverage by one qualifying ADR keeps related decisions together without
  changing the existing any-of criteria for when a decision warrants a record.
- **Apply a token ban to ADR bodies.** Artifact names and ARC terminology can themselves be the architectural subject.
  Reader independence tests what supplies meaning while retaining domain vocabulary that is defined locally.
- **Add another planning review item or a separate ADR-assessment method.** A readiness criterion makes disposition
  part of being ready, at every planning depth, without another method for a single consumer.
- **Accept every old Proposed record or refuse every edit to one.** An old record may still need amendment, and an
  intervening formatting or reference correction need not settle its decision. Existing Proposed records remain
  editable until a change explicitly accepts them.
- **Let the number check resolve its own base.** Files-mode checks already receive exact content coordinates. A
  once-per-request invocation can inspect all names without a second base-resolution mechanism.
- **Infer the first-landed record from each path's earliest commit.** A rename would look like a later addition. For
  collisions already on the base branch, state the first-parent rule and leave the historical choice to the reader.
- **Recommend a range-limited number retry.** A range with no ADR edits could leave an inherited collision
  unselected. Making the base resolvable and rerunning the named check preserves whole-set selection.
- **Put acceptance in an integration workflow step.** A merge check covers every change, including small changes
  that do not use the full development workflow. The failure can carry the remedy directly.
- **Ship a new CLI verb.** These checks are this repository's declarations. A reusable command would prepay for
  adoption elsewhere without a present requirement.

## Decision

We will accept an ADR in the change that delivers its work and lock its record when that change merges. We will
require an ADR disposition for settled decisions at planning close, enforce status and number rules at the merge
gate, and require ADR bodies to stand without planning history.

### Writing, acceptance, and locking

The draft, then the specification, carries each decision, its rationale, and its ADR disposition as binding design.
The ADR file is written with implementation, in the change that completes the work; a delivery with several members
carries it in the terminal member. An earlier recommendation to write an ADR is a disposition first.

A new record starts at the bare first Status line `Proposed`. Before the delivering change merges, its completed
record reads `Accepted (YYYY-MM-DD)`, dated the day of that flip. The whole record remains freely editable through
verification and review, including after the flip. The amendment tiers bind only when the accepting change merges:
corrections preserve meaning, amendments append dated information, and a changed decision requires supersession.

A Proposed ADR already on the base branch stays editable until the change that accepts it. An intervening change
may edit it or rename it without changing its number, without accepting it. A renumber has no same-number base
version and is a new record for the status check. Later realization of an Accepted decision is noted in the ADR;
learnings arrive as dated amendments. Genuinely separable phases may have separate records.

### Dispositions at planning close

Every decision settled by a draft, or by a determinacy confirmation when there is no draft, has one disposition:

- A new ADR delivered by the work.
- An amendment to a named ADR.
- Coverage by a named ADR delivered or amended by the work, or by a Proposed or Accepted ADR already on the base
  branch that records the decision unchanged.
- `none`, naming the applicable tactical, code-obvious, or temporary category, or stating that none of the existing
  five ADR-worthiness criteria applies.

Missing dispositions and coverage by an ineligible record are readiness gaps needing detail. Superseded, Deprecated,
nonexistent, and unrelated unmerged records do not provide eligible coverage. The bar is the same for every work
weight and planning depth. Related decisions may share one record.

Specifications carry dispositions in their design substrate, beside the decision or in a list there, and list new
or amended ADRs among their deliverables. A disposition delivering a new or amended ADR requires at least an outline
specification. A brief carries only `none` or coverage by an ADR already on the base branch, delivers no ADR change,
and need not record those dispositions.

### Merge checks

`lint:adr:status` judges changed ADR arguments against their base versions, using the supplied Git tree and base,
including a local snapshot of uncommitted files. It examines new paths and records whose path or object identity
changed. The first level-2 Status heading defines the section, through the next level-1 or level-2 heading;
headings in fenced code do not count. The first nonblank line states the status. A leading Proposed word, ignoring
case, leading emphasis, and trailing punctuation, reads Proposed.

The check refuses a new record reading Proposed or lacking Status, a return from a non-Proposed base Status to
Proposed, and removal of an existing Status section. Its remedy accepts a new record with today's local date, or
quotes the base record's complete Status section for restoration. A base-Proposed record stays editable, and a base
record lacking Status constrains nothing. Without a base, the check refuses and names resolvable-base and explicit
merge-base recovery routes instead of judging records without their history.

The same path supplies a base version first. Otherwise a rename pairs exactly one removed base path with exactly
one added tree path carrying the same numeric identity. A same-number base path still present in the tree supplies
no base version to another record; competing additions cannot claim one removed record.

`lint:adr:numbers` runs once over every ADR name at the supplied tree. It compares the digit run after `adr-` as an
integer; names without one do not participate. A collision names every path and, with a base, renumbers the paths
this change adds, leaving one when all are new. Targets are consecutive numbers above the maximum at either tree,
padded to at least three digits. A collision already on the base branch requires a separate change keeping the
record that landed first in its first-parent history. Without a base, the check still reports collisions, states
the selection rule, and asks for a resolvable base. Renumbering and correction of records citing that number are
permitted corrections under the first amendment tier.

Both checks fail on Git read errors and report all violations. Their remedies are check output, not a separate
lifecycle backstop. This repository runs them at its merge gate and in CI; the methodology states the rule without
requiring every project to adopt these scripts.

### Reader independence

Context, Decision, and Consequences establish their meaning without planning history. Status carries tracking.
Domain vocabulary and artifact names remain valid subject matter when their required meaning is established or
defined locally; tracking fields supply no missing decision. Process narration cannot do the explaining.

A new ADR meets this rule across its body. An edit to an existing record meets it over the changed footprint,
including removals and affected surrounding obligations and definitions. This does not require a retrospective
rewrite of unchanged historical bodies.

## Consequences

### Positive

- Settled decisions receive an explicit record disposition even when implementation is routine or the plan is brief.
- Implementation and review can correct the record before it becomes immutable, while the accepting merge supplies
  a definite historical boundary.
- Forgotten acceptance and duplicate numbers produce actionable merge failures instead of silent record drift.
- Readers can understand decisions without access to their planning history.
- [ADR-023][adr-023], [ADR-024][adr-024], [ADR-025][adr-025], and [ADR-033][adr-033] become Accepted records of the
  shipped classification, cohort, concurrency, and checkout-role decisions. Their Status sections retain the
  historical promotion text and record the realized behavior.

### Negative

- Authors must disposition each settled decision and maintain the ADR before merge; related decisions share coverage
  to keep this near one record per coherent change.
- A change adding a Proposed ADR remains unready to merge until its acceptance is recorded, even while the body is
  still under review.
- [ADR-020][adr-020] stays Proposed. Its tier vocabulary was replaced by the Class model and its extension-based
  loading preference was retired by [ADR-038][adr-038]; remaining configuration guidance needs amendment before
  acceptance. The base-Proposed rule preserves that work rather than forcing premature acceptance.

### Risks

- Concurrent changes can each pass before either lands. A base-branch run catches a collision after such a race;
  a separate correction must keep the first-landed record and renumber the others. The check reserves no number.
- Disposition quality and reader independence require judgment. Static checks enforce status and numeric identity,
  while review must assess whether the decision record actually explains its subject.

---

[adr-020]: adr-020-adopt-principle-anchored-scalable-core.md
[adr-023]: adr-023-class-model-scaled-ceremony.md
[adr-024]: adr-024-cohort-decomposition-model.md
[adr-025]: adr-025-concurrent-work-by-convention.md
[adr-033]: adr-033-retire-locus-records-derive-roles.md
[adr-038]: adr-038-retire-inactive-extension-points.md
