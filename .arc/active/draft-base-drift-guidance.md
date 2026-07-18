# Draft: base-drift-guidance

- **Origin:** FP session-init reported 17 raw commits of base drift after one sibling integration, while suggesting
  a rebase that concurrent-work doctrine forbids for pushed branches. The unsafe operation wording was pulled back
  separately in PR #264; this work owns the remaining granularity, overlap-classification, and register problems.
- **Purpose:** Make base-drift guidance describe integration-level movement, distinguish substantive contention from
  regenerable projection churn, and recommend safe append-only reconciliation from one shared analysis surface.

---

## Problem / Motivation

Under routine parallelism, one merged sibling contributes its whole branch history to every other branch's raw
behind count. The current prompt therefore turns normal progress into an alarming large number and gives a
regenerable project-readiness projection the same weight as substantive code overlap. Repeated false urgency trains
operators to ignore the surface that should flag genuine contention.

The underlying probe also collapses an overlap-analysis failure to an empty list. That makes "analysis unavailable"
indistinguishable from "no overlap," contradicting the draft's honest-degradation requirement. Meanwhile, the
integration workflow independently repeats raw git mechanics, so the early advisory and the authoritative pre-merge
gate can drift semantically.

## Settled Direction

### One analyzer, two policy points

Extend the existing base-distance analyzer and expose it as `arc base drift --json`. Session-init consumes the
shared library result in **advisory mode**, where `session.remote_sync: disabled` may produce a non-actionable
`skipped` result. The integration-time behind-base gate invokes the command in **authoritative mode**, which does
not consult `session.remote_sync`: it always attempts the bounded base fetch and distance read.

Authoritative JSON carries a gate verdict:

- `clean` — distance is healthy and raw `behind` is zero;
- `reconcile` — distance is healthy and raw `behind` is non-zero; and
- `unavailable` — the remote, fetch, branch identity, or distance cannot be established.

The command exits successfully for `clean` and `reconcile` (both are valid readings) and non-zero for `unavailable`,
while still emitting the typed JSON result. The integration workflow stops on `unavailable`, reconciles and repeats
on `reconcile`, and reaches merge approval only on `clean`. A config-disabled `skipped` state is impossible in
authoritative mode.

The analyzer owns deterministic git reads, evidence classification, path classification, gate verdicts, and
precomposed register text; workflow prose only applies the advisory-versus-gate policy.

Keep the raw `ahead` / `behind` distance as the correctness fact. Add two independently degradable analyses:

- **Integration evidence:** a scan of first-parent commits in `HEAD..origin/<base>` that recognizes integration
  events only where topology or an injected evidence resolver proves one, and reports all remaining commits as
  unclassified base movement rather than integrations.
- **Overlap:** branch-side and base-side changed-path intersection since merge-base, partitioned into substantive
  and regenerable paths.

Overlap carries an explicit `available` / `unavailable` result. Integration evidence carries one of `complete`,
`partial`, or `unavailable`. An unavailable enhancement never erases the healthy raw distance, and an unavailable
overlap read never renders as "no overlap." Partial integration coverage lets a recognized event coexist honestly
with base commits that cannot be grouped.

### Integration identity without network coupling

First-parent commits are scan inputs, not integration units. Classify each entry as follows:

1. A commit with multiple parents is one topology-proven integration event regardless of its subject. On GitHub,
   enrich its PR number only when the subject exactly matches
   `Merge pull request #<positive integer> from <non-empty head>`; other merge subjects remain unnamed.
2. An injected integration-evidence resolver may enrich a topology-proven event with a WU slug and PR URL. Archive
   evidence alone never creates an event: a standalone manual archive has the same first-parent delta after the
   integration has already landed.
3. For a single-parent GitHub commit, the current in-repo resolver may prove one squash integration only when two
   same-commit facts agree: the delta introduces one archived `meta-*` with PR URL number `N`, and the commit subject
   ends exactly with a space followed by `(#N)`. Neither a terminal `(#N)` nor an archived meta proves an event alone.
4. Every other single-parent commit remains unclassified base movement. Do not infer an event from a terminal
   `(#123)` subject alone, branch existence, commit count, timestamp adjacency, or the repository's current merge
   setting.

Deduplicate evidence when topology and the resolver identify the same event. Report recognized event count and
unclassified commit count separately; never add them together as "integrations." Consequences across supported
configurations are explicit:

- merge strategy — topology gives exact event boundaries under either archive cadence;
- squash + with-integration archival — matching same-commit archive and PR-subject evidence proves the single event;
- rebase + with-integration archival — archive evidence does not establish the replayed series boundary, so the
  commits remain unclassified without another resolver; and
- squash/manual or rebase/manual without another resolver — no event boundary is guessed; render unclassified base
  movement and the raw distance.

A future host adapter may prove squash/rebase PR ranges, but network enrichment is optional and out of scope. The
rendered vocabulary follows the evidence: resolver-proven WUs are sibling integrations, topology-only events are
integrations, and everything else is unclassified base movement.

### Storage-neutral evidence port

The git analyzer depends on an `IntegrationEvidenceResolver`-shaped port, not directly on `.arc/completed/` or a
tracked meta layout. Its result distinguishes **identity enrichment for an already-proven event** from **event
proof**; only the latter may create a single-parent integration. The current in-repo adapter reads archived metas
because that is the live tier's available evidence and issues event proof only from the matching same-commit
archive/PR pair above.

A future storage implementation can resolve the same semantic request from managed WU records keyed by integration
commit or PR identity; the exact future record linkage belongs to the storage/record owners and is not invented
here. When no resolver is available, integration topology and honest degradation remain sufficient.

This port makes today’s archive read replaceable without claiming that archived metas remain in code history. It
also keeps storage lookup above the low-level git module, avoiding a git-to-status/storage dependency inversion.

### Reconciliation classification, not a permanent filename taxonomy

Introduce a small code-owned reconciliation classifier whose semantic output is `substantive` or `regenerable`.
Today its only regenerable binding is the canonical `ROADMAP_PATH`; reuse the existing constant rather than spelling
the path again. Do not widen the ownership-oriented `PathSurface` classifier, add a general artifact registry, add a
configuration axis, or encode an unshipped replacement filename.

This is an intentionally temporary binding at the storage abstraction boundary. In the target storage model,
project status is a managed operational-state record rendered as a materialized projection. Once that transition
lands, the projection should no longer appear in the code-repository diff, so base-drift overlap classification
stops seeing it naturally. If an in-repo tier still projects it into the code tree, the storage/projection resolver
can replace today's exact-path binding behind the same reconciliation result. The analyzer depends on recovery
behavior, not on `ROADMAP.md` as a permanent identity.

Changed-path collection is conservative across renames: compare each side with rename collapsing disabled, so a
rename contributes both its source and destination paths to that side's set. A base-side rename therefore overlaps
a branch edit to the old path, and divergent renames from the same source also overlap. The rendered sample may use
the intersecting path; it need not reconstruct rename presentation. A failed diff still reports overlap analysis as
unavailable.

### Calm, attention, and degraded registers

Contention and evidence quality are orthogonal; compose them with this precedence:

1. **Attention leads** whenever available overlap analysis finds substantive paths, regardless of integration
   coverage. Name a bounded sample and recommend merging the base before continuing edits on those paths.
2. **Degraded leads** when overlap is unavailable, or when no substantive overlap is known but integration coverage
   is partial/unavailable. Say which detail could not be established and fall back to the raw behind count without
   claiming safety.
3. **Calm leads** only when overlap is available with no substantive paths and integration coverage is complete.
   Name recognized sibling integrations and any regenerable overlap; state that regeneration handles the projection
   and that merging is convenient now but required before integration.

Whenever attention leads and integration coverage is partial/unavailable, append the degradation qualifier after
the contention warning; never suppress either fact. All three remain advisory at session-init, and none turns
routine sibling progress into a separate yes/no interruption. The integration gate remains authoritative.

Representative calm output:

> Base `main`: 1 sibling integration ahead — `burn-in-probe-b` (PR #235). No substantive overlap; `ROADMAP.md` is
> a regenerable projection. Merge when convenient; required before integration.

## Alternatives

- **Treat every first-parent commit as an integration — rejected.** Rebase integration replays every WU commit onto
  the base first-parent chain, while manual archival can add a separate later commit. The mapping recreates the raw
  count defect under supported configuration.
- **Keep raw counts and adjust tone only — rejected.** It leaves ceremony-heavy sibling branches looking like many
  independent base changes and does not solve flag fatigue.
- **Enrich session-init only — rejected.** The authoritative integration gate would retain a second, weaker analysis
  path and continue narrating mechanics instead of invoking a shared verb.
- **Require a host API — rejected.** Network availability must not control the safety fact. A future host adapter may
  improve linear-history grouping through the evidence port, but raw distance and honest degradation stand alone.
- **Treat any archive delta as integration proof — rejected.** Manual cadence creates the same delta in a later
  standalone archive commit. A single-parent event requires matching same-commit archive and PR evidence.
- **Make tracked archived metas the analyzer’s identity contract — rejected.** They are current-tier evidence, not a
  permanent code-repository layout; a storage-neutral resolver owns the binding.
- **Create a generic derived-file taxonomy — rejected.** Only one regenerable code-tree projection exists today;
  a registry would pre-design the managed-record/storage substrate and risk preserving a path concept that should
  disappear after materialization.
- **Hardcode the current readiness-view filename inside the composer — rejected.** It duplicates an existing
  canonical constant and couples user-facing policy to a transitional projection name.

## Success Signal

In a branch whose base advanced through one ceremony-heavy sibling WU using merge integration:

- the advisory reports one sibling integration rather than the sibling's raw commit count;
- the sibling slug and PR are shown only when local archived-record evidence supports them;
- supported linear-history/cadence combinations that lack an event boundary report partial or unavailable coverage
  rather than counting replayed or archival commits as integrations;
- a later manual archive commit is never reported as the earlier WU integration;
- projection-only overlap renders calmly as regenerable, while substantive overlap receives attention;
- a rename on one side and an edit to its old path on the other are treated as substantive overlap rather than a
  false calm result;
- substantive overlap remains the lead warning when integration identity is also degraded, with both facts shown;
- failed enrichment is labeled unavailable rather than rendered as no overlap;
- both session-init and the final integration gate consume the same analyzer, with the latter re-reading live state
  independently of `session.remote_sync`, emitting `unavailable` on a failed read, and refusing to merge until its
  verdict is `clean`; and
- no shipped behavior, record, or configuration assumes the current readiness-view filename is permanent.

## Unknowns and Assumptions

- **Assumption:** under current squash + with-integration cadence, the archive projection's PR URL and the platform's
  squash-subject PR number agree. A mismatch, manual archive, rebase series, or future materialized record degrades
  through the resolver contract; it does not break the distance result or become a guessed integration.
- **Assumption:** the current project-readiness projection remains the sole regenerable path visible in code-repo
  base overlap until its owning WUs replace it with a managed record/materialized projection. New projection kinds
  should extend the storage/projection resolver, not accumulate literals in base-drift composition.
- **Open implementation detail:** exact internal type and module names. The gate verdicts, event evidence rules,
  accepted merge-subject grammar, evidence precedence, failure semantics, and storage boundary above are fixed.
- **Deferred storage detail:** the future managed WU record’s integration-link field. This WU defines the resolver
  port and current adapter only; storage owners settle the canonical linkage without changing analyzer semantics.

## Scope Estimate

**Medium (days-week), `Class: Heavy`.** The design is composed from existing git, completed-record, status-probe,
and base-command patterns; it requires no invented model, so `Novel` does not apply. The work remains one coherent
WU rather than a cohort.

Expected surface: the base-distance result and git reads, integration-event/evidence resolution, the `arc base`
command family, session-init recommendation composition and envelope types, the integration workflow's behind-base
gate, package/project workflow sync, and focused merge/squash/rebase × archive-cadence, combined-register, and rename
coverage. Storage migration, managed-record implementation, readiness-view renaming, host API integration, and a
general projection registry are explicitly out of scope.

## Coordination

FP retains later-session burn-in verification. `roadmap-tooling` / `operational-state-docs` own the managed-record
projection and rename; this WU supplies only the replaceable current binding and must not forward-reference their
unshipped names in adopter-facing output. The design composes with the procedure target by keeping deterministic
analysis and rendered text CLI-side, and with the storage target by treating code-tree paths as an adapter input
rather than canonical operational-state identity.

---
