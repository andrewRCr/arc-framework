# ADR-035: Keep Operational State in Repository Refs Behind a Storage Contract

## Status

Accepted (2026-09-28). Proposed on 2026-09-24 with this condition: "This record moves to Accepted once the spikes
confirm the default backend on the hosts it must hold on, a workable projection in common editors, and the concurrency
model at its design envelope, or it is first amended to route a failing host to another backend, change the
projection's ignore strategy, or change a surface's concurrency mechanism." Its provisional parts were same-repository
refs as the default backend, with their ref layout and fetch-refspec installation (item 2); the projection's ignore
strategy (item 6); and the concurrency mechanism for each shared surface (item 7). The spikes in the [storage
substrate analysis][storage-analysis] § 11 reported:

- **Default backend.** It held on GitHub.com, GitLab.com and self-managed GitLab CE, Azure DevOps, Gitea, and Forgejo.
  GitHub Enterprise Server, on the must-hold floor, and Bitbucket were not tested, so the condition is not met for
  GitHub Enterprise Server. Its test is deferred, and this record is accepted on GitHub.com's evidence instead:
  self-managed GitLab CE, which runs the same code as GitLab.com, held just as GitLab.com did. A rejection on GitHub
  Enterprise Server reopens this decision. One ref per surface held under twenty-writer bursts, and ARC's refspec
  fetched the refs, which plain clones omit, into a remote-tracking namespace on every tested host.
- **Projection.** Workable with the ignore strategy in item 6, under a pass bar loosened on 2026-09-24 to allow one
  editor setting per machine.
- **Concurrency.** No write was lost at the design envelope once two mechanisms changed through the amend-first
  route. A conflicting edit still meets a typed refusal, but the refusal moves from the write to the next verb that
  depends on the entry, because refusing the write would strand the losing edit in a gitignored copy that is not
  durable. Inboxes and working memory merge entry by entry against a recorded base, with union limited to insertions,
  because a plain union silently undoes deletes.

Items 3, 4, and 8 were also made more specific before acceptance. Item 3 names the delivery and review records kept
under `.arc/system/.internal/` and every personal file user sync carries, and it leaves ARC's own core machinery to a
separate decision. Item 4 leaves to the contract design whether an integration-time record rides the export knob, and
item 8 how today's push setting for personal state carries over.

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

The recorded direction as of 2026-09-24 — [storage evolution][storage-evolution] and the target it names,
`draft-arc-backend.md` — had already settled that operational state is materialized rather than tracked, that Git
stays canonical without a required service, that records are storage-agnostic, and that notes retire. It left the
store's shape open, assumed a separate private repository as the canonical store, kept the in-repo layout as a tier
that "works indefinitely", and sequenced record migrations ahead of any storage work. Its settled points carry forward
here, and the strategy is rewritten to match.

Two earlier decisions give way. [ADR-012][adr-012] Part 3 carries the user directory between machines as a Git-notes
snapshot; item 8 retires it. [ADR-025][adr-025] makes pushed work-unit branches append-only until integration as its
one hard invariant; item 9 replaces that with a configurable history policy once notes retire.

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
    - **Same-repository refs** (default): state lives under `refs/arc/*` on the code repository's remote, in refs
      split by work unit, identity, and shared surface; the exact surface list and split are left to the contract
      design. Plain clones omit the refs, so ARC installs a fetch refspec into a remote-tracking namespace. Writes
      push per machine in batches at coarse firing points, such as handoff, lifecycle transitions, and an explicit
      sync, never per write. Where the store and a code branch share a repository and remote, a lifecycle step that
      already pushes the branch carries its state refs in the same `--atomic` push; otherwise task close orders the two
      writes with a typed repair. Where the local copy lives — the code repository's own refs, or a separate Git
      directory inside `.git` against the same remote — is left to the contract design;
    - **Backing repository**: the same implementation against another repository, writing custom refs or ordinary
      branches — the privacy option and the route to PR-reviewed planning;
    - **Local-only**: state stays on one machine;
    - **Service**: deferred until demand exists.

   The default must hold on GitHub and GitLab, hosted and self-managed. Bitbucket and Azure DevOps should hold; where
   one does not, it falls back to the backing-repository backend at a documented cost. Gitea and Forgejo are best
   effort. The spikes confirmed every one of these hosts except GitHub Enterprise Server and Bitbucket, which were not
   tested.
3. **Clean split.** Work-unit artifacts, backlog and cohort records, the completed archive, the user directory's
   synced contents — inboxes, working memory, session notes, and every other personal file user sync carries today —
   and every record ARC writes about a work unit's lifecycle, delivery, or review move to the store, wherever they sit
   today. That includes the Candidate records with their attestations, the integration-boundary records with their
   delivery reservations and review outcomes, and the transition records kept under `.arc/system/.internal/`.
   Machinery, strategies, ADRs, research, analysis, and the project PRD stay tracked. This decision draws no line
   through ARC's own core machinery: whether it keeps being copied into each repository or resolves from the installed
   package is a separate decision, and nothing here may depend on it being tracked. No tracked operational-state tier
   remains. ROADMAP and status surfaces are derived, never stored.
4. **One knob stays.** `storage.track_design_docs` exports authored design into the code repository as a one-way copy
   for teams that review specs alongside code. Whether an integration-time record rides the same knob is left to the
   contract design.
5. **Files first.** The first implementation stores each artifact group as files behind the contract, with a file-copy
   projection. Structured records follow behind the same contract; until then, collections merge entry by entry over
   their files (item 7).
6. **Projection as working copy.** The store is authoritative. A projection at the familiar paths — `.arc/active/`,
   `.arc/backlog/`, `.arc/completed/`, and `.arc/user/<identity>/` — is what people and agents browse and edit; edits
   persist at firing points, such as increment close, handoff, session-init, and lifecycle verbs, merged against the
   store version each projected file was written from. Any artifact opens by name and is searchable from the editor a
   person already uses; `arc view` and status surfaces supplement that and never replace it. The shared surfaces are
   ignored through `.git/info/exclude`, and `.arc/user/*/` through `.gitignore`, so packaging tools that read only
   `.gitignore` never ship private notes. A tracked `.ignore` re-includes all of them for ripgrep-based search —
   VS Code, `rg`, `fd`, and terminal pickers — and Zed takes one user-level setting per machine, which `arc init`
   prints. Session locus derives from the checkout's marker and the store, not from which metas a checkout holds.
7. **Concurrency.** Concurrent sessions are the normal case: many per identity and several identities per repository.
   Disjoint edits merge without manual action, and no write is lost silently. A conflicting edit lands as a typed
   conflict record that keeps both sides; the next verb that depends on that entry refuses with a typed remedy until a
   resolution names the conflict, and status surfaces it. Whether a drain racing an edit to the same entry needs a
   record at all, since the edited entry stays in the file, is left to the contract design. Deciding verbs re-read the
   store rather than a projection that may be stale, every write is checked against the base it was made from, a refresh
   never overwrites an unsynced edit, and the writer refreshes the other worktrees on its machine. Exact claims (record
   numbers, slugs, work-unit claims) are compare-and-swap writes, and each checkout refuses a state head that does not
   descend from the last one it saw. Per surface: single-writer refs for work-unit state; entry merge for inboxes and
   working memory; a fractional-index rank field on each stub for backlog order; and three-way merge for shared prose.
   The default is designed for solo developers through small and mid-size teams — a design envelope of about ten people
   running about six sessions each. Larger scale belongs to the deferred service backend, and the contract must not
   preclude it.
8. **Notes retire** through a one-time import into the store; the old notes ref is kept as an archive tag. Whether
   personal state pushes on every sync or on request, as `user.notes_push` chooses today, is left to the contract
   design.
9. **History policy.** Once notes retire, `history.policy` becomes configurable, `rewrite-with-lease` by default and
   `append-only` by choice. The append-only invariant in `DEV-RULES.ARC` and the concurrent-work strategy is amended
   accordingly.
10. **Planning branches** remain as zero-commit local anchors for locus topology until in-flight derivation reads
    the store; branchless planning is then a separate change.

This takes effect at a single cutover per repository. This repository migrates through a quiesce → import → flip window,
rehearsed first on a scratch repository. The record-migration work units previously sequenced first are not
prerequisites; they fold into, shrink under, or follow this change as the analysis § 8 records. The decisions the
analysis leaves open (§ 6.9 and § 7) belong to the contract design, and none of their recorded options changes the
decisions above.

## Consequences

### Positive

- Planning churn leaves code history and pull-request views; lifecycle exclusion, placement gating, and the related
  classifiers can be deleted.
- Integration no longer depends on where a work unit's files sit on the branch, which removes the singleton wedge's
  storage-created causes.
- Every worktree sees the same store immediately, because the store lives in the common Git directory; in-flight
  derivation becomes a listing instead of a scan of every branch.
- User state stops depending on commit reachability, so orphaned and missing notes stop being possible.
- Work-unit branches can follow mainstream rewrite practice, which lets delivery delegate restacking to provider tools
  and attest the result.
- A solo developer or small team gets the change with no configuration; privacy and PR-reviewed planning remain one
  configuration choice away.

### Negative

- Planning changes on the default backend leave pull-request review, branch protection, and forge browsing. Custom
  refs are invisible in forge UI and omitted by plain clones. Forks copy none on GitHub, GitLab, Gitea, or Forgejo,
  while an Azure DevOps fork of every branch copies a snapshot nothing keeps in step. No tested host's branch
  protection reaches the refs by default, and GitHub rulesets refuse the pattern.
- The default backend does not provide privacy on public repositories.
- Most search tools skip a gitignored projection by default. Findability takes a tracked `.ignore` for ripgrep-based
  search and one user-level Zed setting per machine. Claude Code's shell `grep` still misses `.arc/user/<identity>/`;
  Emacs's `project.el`, which skips every file Git ignores, and Codex's `@` picker, which lists no untracked files,
  see none of the projection; JetBrains IDEs were not tested. Zed saves over a refreshed file without warning, so write
  safety rests on the projection's base check, not the editor.
- Anything that reads state through Git loses it: `git log` or `git show` on state paths, a pull-request diff, or a
  CI job that checks out only code sees none of it. Workflows, extensions, method overrides, and scripts read state by
  its projected path or through an `arc` command; ARC's own checks over work-unit artifacts run where state is
  written; and code that reads state out of Git history, such as `candidate-response-confirmation.ts`, moves before
  cutover.
- A Windows checkout needs its own handling: renames over open files retry, file identity is read at full precision,
  line endings normalize on read, and Git calls batch, since each process start costs about 30 ms.
- Cross-machine resume under `rewrite-with-lease` becomes "upstream moved; reset to it" rather than a failing
  fast-forward.
- The migration touches a large coupled surface and must be rehearsed before this repository cuts over.

### Risks

- GitHub Enterprise Server was not tested; a rejection there reopens this decision. Bitbucket was not tested either;
  if it rejects pushes to `refs/arc/*`, it defaults to the backing-repository backend.
- Anyone with write access can rewrite or delete state. The ancestry check makes a rewind visible rather than
  preventing it; opt-in host protection is left to the contract design.
- Mirroring and copying tools can lose or split state: Gitea and Forgejo push mirrors delete `refs/arc/*` on the
  target, a GitLab mirror leaves its two ends with independent state, and backup or migration tools that copy only
  branches and tags drop it. A repository keeps one designated state host.
- Freshness across machines stays open: a machine sees another's writes only after it fetches, and a no-change fetch
  costs most of a second, so fetches run at coarse points or in the background.
- Push volume at team scale is untested. Per-machine batching bounds it against GitHub's guidance of six pushes a
  minute per repository, which code pushes share; a team near the envelope can move state to a backing repository,
  which spends its own push budget.
- Host policy can refuse state commits: Azure DevOps's commit-author policy accepts them only when they are authored
  as the user.
- Unsynced work can be lost outside ARC. ARC's teardown persists first and refuses while a projected file is
  unadopted or held by a conflict, but `git clean -x` or a plain `git worktree remove` deletes gitignored files
  without a prompt, and a file created in a projected folder is unknown to the store until it is adopted. Locking
  each worktree ARC spawns would make a plain removal refuse without a double force, a guard the contract design
  weighs; `git clean -x` has none, so the time between an edit and its next firing point bounds the loss.
- On Windows, a same-size save inside one NTFS timestamp tick is invisible to the stat re-check that keeps a refresh
  off an unsynced edit, and re-reading the content instead loses edits. The candidate, a re-check under an exclusive
  handle, is untested.
- History size depends on layout. Stored paths must be unique across refs, ARC must run Git maintenance itself, and
  rotation to a new ref name bounds what a clone fetches. A host's own repacking, which ARC does not control, can
  undo the delta savings.

## Amending This Document

<!-- Reserved for post-implementation learnings per the three-tier amendment model
     (strategy-adr-methodology.md). Append dated annotations as `**Amendment (YYYY-MM-DD):** …`. -->

**Amendment (2026-09-29):** GitHub Enterprise Server held. A 3.22.1 trial instance repeated the host spike and matched
GitHub.com on every check ([storage substrate analysis][storage-analysis] § 11.3), so the test deferred in § Status is
met and the first risk's reopening clause does not fire. On that host an ordinary member with write access can
rewrite or delete any state ref, as the second risk states, and one with read access can only fetch. Bitbucket remains
untested.

---

[storage-analysis]: ../supplemental/analysis/analysis-storage-substrate-direction.md
[storage-evolution]: ../strategies/project/strategy-storage-evolution.md
[adr-012]: adr-012-adopt-unified-user-directory-model.md
[adr-025]: adr-025-concurrent-work-by-convention.md
