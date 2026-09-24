# ADR-035: Keep Operational State in Repository Refs Behind a Storage Contract

## Status

Proposed (2026-09-24). Three parts of the decision are provisional until the spikes in the [storage substrate
analysis][storage-analysis] § 11 report: same-repository refs as the default backend, with their ref layout and
fetch-refspec installation (item 2); the projection's ignore strategy (item 6); and the concurrency mechanism for each
shared surface (item 7). The rest is settled and does not wait on the spikes. This record moves to Accepted once the
spikes confirm the default backend on the hosts it must hold on, a workable projection in common editors, and the
concurrency model at its design envelope, or it is first amended to route a failing host to another backend, change
the projection's ignore strategy, or change a surface's concurrency mechanism.

## Context

ARC keeps a work unit's operational and planning state — meta, draft, spec, task list, notes, cohort records, the
backlog, the completed archive, Candidate and transition records — as tracked files on code branches, and keeps
per-user state (inboxes, working memory, session notes) as a Git-notes snapshot attached to code commits. The cost
is measured in the [storage substrate analysis][storage-analysis] § 2:

- 59% of non-merge commits on `main` since 2026-07-01 touch only lifecycle directories;
- roughly a fifth of production code reads or writes tracked lifecycle state, and notes support adds ~13.8K lines;
- delivery's projection layer, lifecycle exclusion, and several hook, CI, and lint classifiers exist only because
  state rides code history;
- the singleton integration tail is placement-gated and now blocks work-unit landings, while Errands — whose identity
  already lives in `refs/arc/*` — land routinely;
- keying user state to commits is the recorded reason pushed work-unit branches may not be rewritten.

The recorded direction ([storage evolution][storage-evolution]) already settled that operational state is
materialized rather than tracked, that Git stays canonical without a required service, that records are
storage-agnostic, and that notes retire. It left the store's shape open, assumed a separate private repository as the
canonical store, kept the in-repo layout as a tier that "works indefinitely", and sequenced record migrations ahead
of any storage work. Its settled points carry forward here, and research or the spikes may still revise them.

Options considered:

- **Keep tracked in-repo state.** No migration, but every cost above persists and grows with concurrency.
- **A private backing repository as the canonical store.** Delivers privacy, but requires pairing two repositories,
  resolving project identity, and coordinating writes across them; untested in practice here, and not every team
  wants a second repository.
- **A hosted coordination service.** Excluded by the service-optional principle; stays a deferred backend.
- **Generalized Git notes.** Keeps the defect: state keyed to code commits.
- **Same-repository custom refs as the default behind a pluggable storage contract, with a backing repository as
  one backend (chosen).** Removes state from code history with no second repository and no configuration, reuses
  the ref-backed store ARC already runs for user sync and Errands, and keeps privacy and branch-based review
  available through the backing-repository backend. Prior research set same-repo refs aside only because they do not
  deliver privacy; separating the default from the privacy case resolves that.

## Decision

We will move all operational and planning state out of tracked files and Git notes into a store reached through one
storage contract with pluggable backends.

1. **Contract.** One interface owns read, version-checked write, list, history, and sync of state families. Nothing
   above it knows which backend is active. The target namespace is a backend parameter.
2. **Backends.** A small curated set, chosen in configuration, with a migrate verb between them:
    - **Same-repository refs** (default; provisional until the host, clone, and concurrency spikes report): `refs/arc/*`
      in the code repository, sharded per work unit and per identity, fetched through an ARC-installed refspec;
    - **Backing repository**: the same implementation against another repository, writing custom refs or ordinary
      branches — the privacy option and the route to PR-reviewed planning;
    - **Local-only**: state stays on one machine;
    - **Service**: deferred until demand exists.

   The default must hold on GitHub and GitLab, hosted and self-managed. Bitbucket and Azure DevOps should hold; where
   one does not, it falls back to the backing-repository backend at a documented cost. Gitea and Forgejo are best
   effort.
3. **Clean split.** Work-unit artifacts, backlog and cohort records, the completed archive, inboxes, working memory,
   session notes, and Candidate and transition records move to the store. Machinery, strategies, ADRs, research,
   analysis, and the project PRD stay tracked. No tracked operational-state tier remains. ROADMAP and status surfaces
   are derived, never stored.
4. **One knob stays.** `storage.track_design_docs` exports authored design into the code repository as a one-way copy
   for teams that review specs alongside code.
5. **Files first.** The first implementation stores each artifact group as files behind the contract, with a file-copy
   projection. Structured records follow behind the same contract; until then, collections merge entry by entry over
   their files (item 7).
6. **Projection as working copy.** The store is authoritative. A projection at the familiar paths — `.arc/active/`,
   `.arc/backlog/`, `.arc/completed/`, and `.arc/user/<identity>/` — is what people and agents browse and edit; edits
   persist at firing points through version-checked writes. Any artifact opens by name and is searchable from the
   editor a person already uses; `arc view` and status surfaces supplement that and never replace it. The
   projection's ignore strategy (gitignored, plus whatever re-inclusion editors need) is provisional until the
   editor-ergonomics spike reports. Session locus derives from the checkout's marker and the store, not from which
   metas a checkout holds.
7. **Concurrency.** Concurrent sessions are the normal case: many per identity and several identities per repository.
   Disjoint edits merge without manual action, conflicting edits refuse with a typed remedy, and no write is lost
   silently. Decisions read the store through verbs rather than a projection that may be stale, and exact claims
   (record numbers, slugs, work-unit claims) are compare-and-swap writes. The mechanism for each surface is
   provisional until the concurrency spike reports: single-writer refs for work-unit state, entry-granular union for
   inboxes and working memory, a rank field on each stub for backlog order, and three-way merge for shared prose. The
   default is designed for solo developers through small and mid-size teams; larger scale belongs to the deferred
   service backend, and the contract must not preclude it.
8. **Notes retire** through a one-time import into the store; the old notes ref is kept as an archive tag.
9. **History policy.** Once notes retire, `history.policy` becomes configurable, `rewrite-with-lease` by default and
   `append-only` by choice. The append-only invariant in `DEV-RULES.ARC` and the concurrent-work strategy is amended
   accordingly.
10. **Planning branches** remain as zero-commit local anchors for locus topology until in-flight derivation reads
    the store; branchless planning is then a separate change.

This takes effect at a single cutover per repository. This repository migrates through a quiesce → import → flip
window, rehearsed first on a scratch repository. The record-migration work units previously sequenced first are not
prerequisites; they fold into, shrink under, or follow this change as the analysis § 8 records.

## Consequences

### Positive

- Planning churn leaves code history and pull-request views; lifecycle exclusion, placement gating, and the related
  classifiers can be deleted.
- Integration no longer depends on where a work unit's files sit on the branch, which removes the singleton wedge's
  storage-created causes.
- Every worktree sees the same store immediately, because refs live in the common Git directory; in-flight
  derivation becomes a listing instead of a scan of every branch.
- User state stops depending on commit reachability, so orphaned and missing notes stop being possible.
- Work-unit branches can follow mainstream rewrite practice, which lets delivery delegate restacking to provider tools
  and attest the result.
- A solo developer or small team gets the change with no configuration; privacy and PR-reviewed planning remain one
  configuration choice away.

### Negative

- Planning changes on the default backend leave pull-request review, branch protection, and forge browsing. Custom
  refs are invisible in forge UI, omitted by plain clones, likely not copied to forks, and not protectable by host
  rulesets.
- The default backend does not provide privacy on public repositories.
- A gitignored projection is skipped by default by ripgrep, VS Code search, Claude Code's Grep, and Zed's quick-open
  and project search — the gitignored inbox already shows this in Zed. Keeping it findable takes a tracked `.ignore`
  for the ripgrep family plus editor settings for Zed, and those settings must reach every worktree.
- Cross-machine resume under `rewrite-with-lease` becomes "upstream moved; reset to it" rather than a failing
  fast-forward.
- The migration touches a large coupled surface and must be rehearsed before this repository cuts over.

### Risks

- A host outside the GitHub and GitLab floor may reject pushes to `refs/arc/*`; that host then defaults to the
  backing-repository backend. A rejection on GitHub or GitLab reopens this decision.
- A projected copy of a shared surface can lag other sessions' writes. Keeping decisions off stale copies is the
  hardest part of the concurrency design; the concurrency spike measures the window and tests the refresh design.
- Atomic push of a code branch plus state refs is not available on every host; task close then needs ordered writes
  with a typed repair.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

---

[storage-analysis]: ../supplemental/analysis/analysis-storage-substrate-direction.md
[storage-evolution]: ../strategies/project/strategy-storage-evolution.md
