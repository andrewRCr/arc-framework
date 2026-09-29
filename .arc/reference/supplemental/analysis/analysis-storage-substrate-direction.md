# Analysis: Storage Substrate Direction — Operational State in Repository Refs

**Purpose:** Map the cost ARC pays for keeping its operational and planning state as tracked files on code branches
and in Git notes, assess whether moving that state off-branch now is viable and how, and record the direction,
constraints, open decisions, and program shape that came out of scoping it — so the work that follows starts from a
settled picture instead of re-deriving it.

**State:** Point-in-time analysis taken 2026-09-24, updated 2026-09-28 with the research and spike results (§ 11) and
what they settle (§ 6.5, § 6.9, § 6.10, § 7). The investigation was read-only, and the spikes ran in scratch
repositories and on the hosts named in § 11; nothing in this repository changed for either. Counts and line references
are as of `origin/main` at `0ec3ca9e5` and drift with the code. The direction it records is decided in
[ADR-035][adr-035]; that record, not this document, carries the decision.

**Created:** 2026-09-24

**Origin:** Follow-on to [the stacked-delivery build-versus-compose analysis][delivery-analysis], whose § 10 option 3
("storage first") the Owner asked to scope: in-repo markdown planning artifacts and Git notes have been a recurring
source of friction, the storage direction's design was unsettled (a private backing repository per code repository,
untested in practice), and any answer had to serve a solo developer, a five-person startup, and a large enterprise
without ARC becoming a hosted service.

**Method:** Five read-only passes, then synthesis:

- a code-coupling inventory of lifecycle-state and Git-notes consumers in `packages/arc-framework/src/`;
- a review of the recorded storage doctrine (strategy, backlog drafts, research) and of every work unit the Owner's
  steering map lists as a storage prerequisite;
- a trace of the current landing path, singleton integration included, against recent merge history;
- a trace of session-locus derivation and planning-branch coupling;
- an external survey of design-review idioms, custom-ref support on forges, and search-tool behavior for ignored
  files.

Load-bearing internal citations were spot-checked against source; items that rest on a single inventory pass or on an
unconfirmed external source are marked in § 13. Research on the hard problems and the spikes followed the direction's
proposal (§ 11).

---

## Executive Summary

1. **The cost is large and measurable.** Since 2026-07-01, 3,097 of 5,284 non-merge commits on `main` (59%) touch
   only lifecycle directories. About 86 source files (~47.6K lines, roughly a fifth of production code) read or write
   tracked lifecycle state, and Git-notes user state adds 46 more files (~13.8K lines). Delivery's projection layer,
   lifecycle exclusion, and a family of pre-commit and CI classifiers exist because of the same coupling.

2. **It is now blocking landings, not just adding churn.** Since 2026-09-19 about 45 pull requests merged, every one an
   Errand. The one work-unit landing in that window needed eleven post-composition commits over about twenty hours,
   an archive → un-archive → re-archive loop, and two corrective Errands. The singleton wedge is placement-gated: the
   integration checkpoint requires `completed/` while the stale-boundary recovery route requires an active meta.
   Errands land because they already keep their identity in `refs/arc/*` with nothing on the branch.

3. **Most of the target store already exists.** User-sync is a ref-backed file-snapshot store (manifest → blob →
   ref, compare-and-swap, fetch-and-merge, locks, compaction); its defect is keying snapshots to code commits. Four
   `refs/arc/*` families are live today, and a generic orphan-ref tree helper exists. The store is a generalization,
   not a new system.

4. **Direction:** one storage contract with pluggable backends on the Terraform model — a small curated set, a local
   default, an explicit migrate verb. The default backend keeps state in the **same repository under custom refs**
   (`refs/arc/*`); a **backing-repository** backend runs the same code against another repository (privacy, and
   branch-based PR review for teams that want it); a **local-only** backend stays on one machine; a service stays
   deferred. The recorded tier model maps onto backends.

5. **Clean split, files first.** Operational and planning state leaves tracked files entirely, with no in-repo tier
   kept "indefinitely". Machinery and constitutional documents stay tracked. The first cut moves files as files into
   the store behind the contract (the local-mode draft already sanctions a "transitional file-copy materialization");
   structured records arrive later behind the same contract. The store is the authority and a gitignored projection
   at the familiar `.arc/` paths is the working copy people browse and edit. Editors find it through a tracked
   `.ignore` that re-includes it for the ripgrep family and one user-level Zed setting per machine (§ 6.5).

6. **Git notes retire** into a single imported snapshot. Once they do, the append-only rule for pushed work-unit
   branches loses its recorded justification and becomes a configurable history policy, defaulting to
   lease-guarded rewrite — the idiom every mainstream stacking tool assumes.

7. **None of the listed prerequisites must land first.** "Stage 0" appears only in the arc-backend draft, and its
   reasoning supports the storage seam rather than a records engine. Of eight prerequisite work units, one dissolves,
   two fold into the program, two shrink, and three are independent but must not run alongside the seam.

8. **Landing path first.** Before any Heavy work, test whether `archive.cadence: manual` removes the singleton wedge
   (the gate then wants `integrating` plus `active`), and land the verified in-flight work units through it. Do not
   build `singleton-integration-continuity` as a work unit on the current substrate: its storage-created half is what
   this program deletes.

9. **The counter-case is real but bounded.** Same-repo refs are invisible in forge UI, get no branch protection, are
   not copied to forks on most hosts, and do not give privacy; planning edits leave PR review. Each has a backend or
   export answer. The spikes confirmed the default (§ 11): GitHub.com, GitLab hosted and self-managed, Azure DevOps,
   Gitea, and Forgejo push, fetch, and delete `refs/arc/*` with no write lost. GitHub Enterprise Server and Bitbucket
   were not tested.

10. **Concurrency is a requirement, not a risk.** Concurrent sessions are the normal case. Most state is single-writer
    by construction — each work unit belongs to one exclusive checkout — and the shared surfaces merge entry by entry,
    take a rank field, or merge three-way, with ARC's Errand refs and user sync already running the core mechanisms.
    The spikes lost no write across local bursts, twenty worktrees, twenty clones on five hosts, and a Windows
    checkout. Decisions stay off stale copies because deciding verbs re-read the store, write-back is checked against
    the base each edit was made on, and the writer refreshes every worktree's copy on its machine (§ 6.5, § 6.9).

11. **State history stays cheap if the layout is right.** Reads take only a ref's tip, so a history 20,000 commits deep
    never slows them. A synthetic year at ten people packs to 350 MB–1.2 GB at Git's default delta window when every
    stored path is unique across refs, and to 90–290 MB at a wide one; identical paths defeat Git's delta search and
    cost two to three times as much. Rotation — a fresh ref holding the current state, the old chain left in place
    outside the default fetch — bounds what a clone fetches (§ 6.10, § 11.6).

---

## 1. Question and Scope

**The question:** can ARC stop keeping operational and planning state on code branches and in Git notes now, rather
than after the backlog items previously sequenced ahead of it — and if so, onto what substrate, in what order, and how
do existing work units cross over?

**Constraints the Owner set:**

- no hosted service ARC must run (self-hosting acceptable later);
- usable by a solo developer, a small startup team, and a large enterprise, with an option covering each main team
  need;
- abstracted and composable rather than one hard-wired store;
- no backward-compatibility obligation (pre-public-release rule in `DEV-RULES.PROJECT`), but existing open work units
  must move laterally;
- stacked delivery's per-member review value stays in scope (see the delivery analysis § 1);
- concurrent sessions are the normal case: one person here routinely runs three to six at once, and a team multiplies
  that;
- 1.0 ships core-complete and fully functional for solo developers through small and mid-size teams; very large teams
  are not core, but no design may close the door on them;
- the default backend must hold on GitHub and GitLab, the most common hosts.

**Out of scope here:** the records engine's schemas, the service tier, and delivery's re-scope, except where they
constrain sequencing.

---

## 2. The Problem, Measured

### 2.1 Churn in code history

| Measure (since 2026-07-01, `origin/main`, non-merge commits) | Value |
| ------------------------------------------------------------ | ----- |
| Total commits                                                | 5,284 |
| Touching only `.arc/{active,backlog,completed}/`             | 3,097 |
| Share                                                        | 59%   |

### 2.2 Code coupled to tracked lifecycle state

| Surface                                    | Size                                                                          | Notes                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lifecycle-coupled source files             | ~86 files, ~47.6K lines                                                       | Concentrated in six large modules (~17.2K lines)                                                                                                                        |
| History readers (read state from branches) | ~33 files                                                                     | e.g. `in-flight-derivation.ts` (~1.8K lines), `completed-index.ts`, `remote-ref-reader.ts`                                                                              |
| Lifecycle writes                           | centralized in `executeTransition`                                            | ~13 call sites; ~4 direct committers                                                                                                                                    |
| Classification and exclusion               | delivery, evidence, CI, hooks, lint, ownership                                | `change-facts.ts`, lifecycle-contribution, path treatment, `classify-change.sh`, CODEOWNERS, markdownlint scopes, the ROADMAP merge driver, pre-commit lifecycle checks |
| Recorded blast radius (2026-07-18 audit)   | 243 files for active placement, 210 for meta prefixes, 55 reader/parser files | `report-coupling-blast-radius-audit.md`                                                                                                                                 |
| Documentation                              | 25 files narrate Git mechanics; 51 files (~398 lines) name lifecycle paths    | each mirrored in two copies                                                                                                                                             |

### 2.3 Git-notes user state

- `refs/notes/arc/user/<identity>` holds a full JSON snapshot of the user directory attached to `HEAD` at save; load
  resolves by reachability and causal maximality; push is proof-gated.
- 46 owning files (~13.8K lines) plus about 20 consumers.
- Health: 37 of 791 annotated commits orphaned and 3 note objects missing at inventory time; stale scratch refs remain
  (`refs/notes/tmp-remote-andrew` over 10,802 commits, plus `-fresh` and `test`).
- Keying user state to code commits is also the recorded reason pushed work-unit branches are append-only
  (`DEV-RULES.ARC` § Commit Discipline: rewriting "orphans the SHA-keyed git notes").

### 2.4 The landing wedge

| Window                  | Merged pull requests                           | Work-unit landings |
| ----------------------- | ---------------------------------------------- | ------------------ |
| 2026-09-19 → 2026-09-23 | about 45, all `chore/` Errands (#661–#705)     | none               |
| 2026-09-19              | #656 `delivery-post-landing-conflict-recovery` | one                |

\#656's tail after composition: archive, boundary refresh, un-archive ("return the work unit to Integrating"),
re-archive, a day's wait for two corrective Errands (#657 accepted-terminus carry, #660 swept-work-unit status), then
terminus restore, base merge, applicability binding, and terminus carry before the checkpoint read `ready`. The
preceding singleton landing (#629) merged under explicit Owner authorization because no typed route to `ready`
existed.

**Mechanism.** `readLifecycleSummary` (`scripts/integration/checkpoint-composition.ts`) requires, under
`archive.cadence: with-integration` (the live setting), state `shipped` at location `completed`. A shipped singleton
whose publication boundary went stale gets `resume-pre-publication`, whose re-attest route needs an active meta;
un-archiving to satisfy it fails `lifecycle-incomplete`. Each record write is also a commit that moves the branch head
and forces push, checks, and a fresh checkpoint.

**Two facts that narrow the diagnosis:**

- The Candidate `subjectDigest` hashes only reviewable entries. Work-unit artifacts, the Candidate record, and
  publication-boundary files are evidence-neutral, so the archive move does not change the reviewed subject. The
  coupling is placement-gating, head movement from record commits, and per-branch copies of the meta — not the digest.
- Errands avoid all of it. `scripts/integration/errand-merge.ts` imports nothing from Candidate, lifecycle, archive,
  or publication; Errand identity lives in `refs/arc/user/<identity>/errands` with a per-slug tree merge. Errands are
  the target storage model in miniature.

---

## 3. What Already Exists

| Building block                       | Where                                                   | Relevance                                                                 |
| ------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Ref-backed file-snapshot store       | `lib/user-sync/`                                        | Manifest → blob → ref, CAS, fetch-and-merge, locks, compaction; re-key it |
| Generic orphan-ref tree plumbing     | `lib/git/ref-tree.ts`                                   | Reusable for any `refs/arc/*` family                                      |
| Errand identity refs                 | `refs/arc/user/<id>/errands`, `lib/errand/ref-tree.ts`  | Per-slug tree with union merge; shared across worktrees; lands reliably   |
| Sync-state refs                      | `refs/arc/user/<id>/sync-state`                         | Compare-and-swap retry in production                                      |
| Delivery candidate and recovery refs | `refs/arc/delivery-candidates/*`, `refs/arc/recovery/*` | ARC already owns namespaces outside heads and tags                        |
| Common-dir state                     | `git-common-state.ts`, `user-sync/repo-shared-paths.ts` | Sibling worktrees already agree on one identity-global baseline           |

Refs outside `refs/worktree/` live in the common Git directory, so every worktree of a repository sees the same
`refs/arc/*` immediately. Today in-flight derivation scans every branch for metas because tracked files are
per-branch; a ref store collapses that into a listing.

---

## 4. Recorded Doctrine and What It Assumed

### 4.1 What stays settled

From [storage evolution][storage-evolution] and the arc-backend and local-mode drafts. Settled here means carried
forward, not fixed: the strategy is long-standing and malleable, and research or the spikes (§ 11) may revise any of
it.

- Git is canonical; no service is required (Principle 10).
- The tracked-versus-materialized line: machinery tracked; operational state materialized and not configurable;
  authored design governed by one knob, `storage.track_design_docs: none | specs | all`.
- Architecture B: render into a gitignored `.arc/` at familiar paths, no nested `.git`.
- Notes retire through a one-time import.
- Version-checked writes; per-data-type concurrency (event log for append-heavy data, last-writer-wins with history
  for small records, Git merge as the backstop for prose).
- Records are storage-agnostic and markdown is a projection (Principle 2, ADR-022).
- Work-unit identity is decoupled from branch identity (Principle 5: "Anti-pattern: inferring WU state from branch").

### 4.2 What this analysis revises

| Recorded position                                                      | Where                                                    | Revision                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The canonical store is "a git repo (just not the project's code repo)" | storage evolution § Three tiers; `draft-arc-backend.md`  | Same-repo custom refs become the default backend; a separate repository becomes one backend          |
| Same-repo refs rejected: "solves history noise, not privacy"           | `research-storage-landscape-2026-07.md` (line 41)        | Correct on privacy; privacy moves to the backing-repository backend rather than defining the default |
| "Tiers are opt-in; in-repo works indefinitely"                         | `draft-arc-backend.md` (line 463); `draft-local-mode.md` | Retracted: a clean split, with no tracked operational-state tier                                     |
| Stage 0 record migrations precede the storage seam                     | `draft-arc-backend.md` (lines 381–382, 469–470)          | Not a technical prerequisite (§ 8); files move first, records follow behind the contract             |
| Materialization renders records → markdown via the ADR-022 engine      | `draft-local-mode.md`; ADR-022                           | File-copy projection first, as the local-mode draft already allows (lines 460–463)                   |
| Pushed work-unit branches are append-only `[invariant]`                | `DEV-RULES.ARC`; [concurrent work][concurrent-work]      | Becomes `history.policy`, default `rewrite-with-lease` (§ 6.7)                                       |

The earlier research reached the same-repo option and set it aside on privacy alone
(`research-storage-landscape-2026-07.md`, line 41), and it records that peer systems chose custom ref namespaces over
notes (`draft-arc-backend.md`, lines 422–424). What was missing was separating the default from the privacy case.

---

## 5. External Landscape

### 5.1 Precedents for state in Git refs

| System                        | Namespace or shape                              | Lesson                                                                                                                                                          |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gerrit NoteDb                 | `refs/changes/*/meta` and `refs/meta/*`         | Review metadata as refs in the code repository, at very large scale; batches sequence numbers from a shared ref and retries lock failures with jittered backoff |
| git-bug                       | custom refs per entity                          | Offline-first issue tracking in the same repository; compare-and-swap ref updates since 2026-09-16                                                              |
| Radicle collaborative objects | refs in the project repository                  | Collaborative records as Git objects, peer-replicated                                                                                                           |
| beads                         | Dolt data under `refs/dolt/data`                | Agent task state co-located with code; chose custom refs over notes                                                                                             |
| grite                         | `refs/grite/wal`, `refs/grite/locks`            | Write-ahead log plus advisory leases in refs                                                                                                                    |
| Jujutsu                       | `refs/jj/*` (local)                             | Custom refs for tool state; does not yet push or fetch them to GitHub                                                                                           |
| ARC Errands                   | `refs/arc/user/<id>/errands`                    | The same model, already landing work here                                                                                                                       |
| Terraform backends            | pluggable state backends, local default         | Small curated set, `-migrate-state`, native locking; removed backends it could not maintain                                                                     |
| Oxide RFDs                    | a branch per document in a dedicated repository | Uses branches so PR review and protection apply; renders a site across branches                                                                                 |

### 5.2 Forge support for custom refs

| Question                                       | Finding                                                                                                                                                                                                                                                                                                                       | Confidence                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Push, fetch, delete, and lease on `refs/arc/*` | GitHub.com, GitLab (gitlab.com and self-managed CE), Azure DevOps, Gitea, and Forgejo accept them, and each host's API lists or reads the refs                                                                                                                                                                                | Confirmed (§ 11.3)                           |
| Bitbucket accepts a novel namespace            | Rejects pushes to its reserved namespaces; novel namespaces not tested                                                                                                                                                                                                                                                        | Unverified                                   |
| Custom-ref-only commits browsable in forge UI  | Not browsable in any branch list; GitLab's and Azure DevOps's APIs read a state file at a ref                                                                                                                                                                                                                                 | Confirmed not, in UI                         |
| Custom refs copied on fork                     | GitHub, GitLab, Gitea, and Forgejo forks copy none; an Azure DevOps fork of every branch copies them                                                                                                                                                                                                                          | Confirmed (§ 11.3)                           |
| Branch protection or push rules on custom refs | None reaches `refs/arc/*` on GitHub, GitLab, Gitea, or Forgejo; GitHub rulesets refuse the pattern outright. Azure DevOps's branch policy takes a `refs/arc/` prefix but only blocks updates; a self-managed pre-receive hook can hold the refs fast-forward-only                                                             | Confirmed (§ 11.3)                           |
| Mirrors                                        | Gitea and Forgejo pull mirrors copy the refs and push mirrors delete them on the target; GitLab mirrors carry them in neither direction; Azure DevOps has no mirrors                                                                                                                                                          | Confirmed (§ 11.3)                           |
| `git push --atomic`                            | A stale state ref held the code branch back on every tested host, Azure DevOps included                                                                                                                                                                                                                                       | Confirmed (§ 11.3)                           |
| Push rate                                      | GitHub recommends at most 6 pushes a minute per repository, shared with code pushes, and 5,000 branches, naming no limit for other refs; it enforces 2 GB per push. GitLab.com limits Git over SSH to 600 operations a minute per user and project. Short bursts at 280 to 540 pushes a minute were not throttled on any host | Confirmed guidance; enforcement not observed |

### 5.3 Search tools and ignored files

| Tool                                             | Skips `.gitignore`d files by default | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ripgrep, `fd`                                    | Yes                                  | `.ignore` and `.rgignore` re-include with `!pattern`, above both Git sources — even under a directory Git excludes. `.arc/` is a dot directory, so without `--hidden` they skip all of it, tracked files included                                                                                                                                            |
| VS Code search and quick-open                    | Yes (`search.useIgnoreFiles`)        | A tracked `.ignore` negation re-includes the projection for both (confirmed); Explorer lists ignored files                                                                                                                                                                                                                                                   |
| Neovim pickers, Helix                            | Yes                                  | Shell out to `rg --files` or `fd`, or use the same `ignore` crate, so they follow ripgrep                                                                                                                                                                                                                                                                    |
| Claude Code shell `grep`                         | Yes                                  | Embedded ugrep reading `.gitignore` only — not `.ignore`, not `.git/info/exclude`; given an absolute path, it returns ignored files                                                                                                                                                                                                                          |
| Claude Code Read, shell `find`                   | No                                   | Open and list ignored files by path                                                                                                                                                                                                                                                                                                                          |
| Codex CLI                                        | Yes                                  | Shell searches are `rg`, so they follow ripgrep; the `@` picker lists no untracked files, so it misses the projection under any ignore strategy                                                                                                                                                                                                              |
| JetBrains IDEs                                   | No                                   | Long-standing open issue                                                                                                                                                                                                                                                                                                                                     |
| Zed                                              | Quick-open and search yes; tree no   | Follows Git's ignore sources only: `.ignore` and `.git/info/exclude` change nothing. `file_scan_inclusions` (default `.env*`) re-includes for quick-open and search, confirmed with Zed started fresh, and works from user-level settings in every checkout, over the WSL remote too; `file_finder.include_ignored` and `search.include_ignored` do not help |
| Git-based tools (`git grep`, Emacs `project.el`) | Yes                                  | Cannot see a gitignored projection under any variant; `consult-ripgrep` or an ARC path handoff reaches it                                                                                                                                                                                                                                                    |
| `npm pack`                                       | Yes                                  | Reads `.gitignore` alone: a pattern moved to `.git/info/exclude` gets packed, and a `.npmignore` makes npm stop reading `.gitignore` entirely                                                                                                                                                                                                                |

### 5.4 Design-review idioms

- **Large enterprises and most startups** review design documents out of band in document tools (Google Docs,
  Confluence, Notion) with comment threads.
- **Open-source ecosystems** keep dedicated RFC repositories reviewed by pull request (Rust RFCs, Kubernetes KEPs,
  Python PEPs, React and Ember RFCs).
- **In-code-repository PR review** of design documents is common mainly for ADRs, not full specs.
- ARC already treats most planning edits as needing no human review: the auto-merge lane
  ([work organization][work-org] § Auto-Merge Lane) merges `draft-*`, `tasks-*`, `meta-*`, `notes-*`, and `cohort-*`
  grooming; only `spec-*`, `prd-*`, and constitutional surfaces are reviewed-lane, and a work unit's spec is approved
  in session at Gate 1.

---

## 6. The Direction

### 6.1 One contract, pluggable backends

The Terraform backend model fits ARC's constraints: the operator picks a backend in configuration, a local default
needs no setup, a migrate verb moves state between backends, and the curated set stays small enough to maintain. The
contract owns read, compare-and-swap write, list, history, and sync of state families; nothing above it knows which
backend is active. The target namespace is a backend parameter, so a backend can write `refs/arc/*` in the code
repository or ordinary branches in another repository.

### 6.2 Backends and the team needs they cover

| Backend                        | Store                                 | Covers                                                                                                                | Does not cover                                                           |
| ------------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Same-repository refs (default) | `refs/arc/*` in the code repository   | Solo and small teams; zero configuration; one remote; clean code history                                              | Privacy on public repositories; forge browsing; host-enforced protection |
| Backing repository             | another repository (refs or branches) | Privacy; PR-reviewed planning (Oxide-style branches); forge browsing; enterprise governance on the backing repository | Single-remote simplicity                                                 |
| Local-only                     | this machine                          | Evaluation, air-gapped or throwaway use                                                                               | Multi-machine, teams                                                     |
| Service (deferred)             | a self-hosted coordination service    | Per-record authorization, high write parallelism                                                                      | Nothing required today                                                   |

A large enterprise with RFC-style review picks the backing repository with branches; a startup and a solo developer
take the default; a team that wants specs reviewed alongside code sets `track_design_docs` to export them. The
recorded tiers map onto this: in-repo retires, Local becomes local-only or a personal backing repository, Shared
becomes a backing repository on a shared remote, Coordinated stays the service.

### 6.3 The clean split

| Moves to the store                                                                                   | Stays tracked                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Work-unit artifacts in `active/`, `backlog/`, `completed/` (meta, draft, spec, tasks, notes, cohort) | Machinery under `system/` (workflows, rules, methods, templates, configuration) |
| ROADMAP and status surfaces (derived, not stored)                                                    | Strategies, ADRs, research, analysis, `PROJECT-PRD`, briefs                     |
| Inboxes, working memory, session notes (from notes)                                                  | Specs exported by `track_design_docs`, as a one-way copy                        |
| Candidate and transition records under `system/.internal/`                                           | Code                                                                            |

Moving `completed/` is the cleaner choice: the archive index and retired-directory readers collapse into a lifecycle
field and 425 files leave code history. Leaving it would keep the tree readers alive.

### 6.4 Files first

The first cut stores files as files — each work unit's artifact group as a tree — behind the contract, with a
file-copy projection. Structured records, the render/reconcile engine, and entry-granular concurrency arrive later
behind the same contract. This inverts the recorded "interface first, storage second" order only in part: the seam
(every reader and writer through the contract, in-repo layout as its first implementation) still comes first; what
moves later is the records engine. The trade is earlier relief against a second migration of file shapes into
records, which Principle 2 already anticipates.

### 6.5 The projection is a working copy

The store is the authority; the gitignored files at `.arc/active/`, `.arc/backlog/…`, and `.arc/completed/…` are the
working copy people and agents browse and edit, as a checkout is to the object database. Edits persist at firing
points (increment close, handoff, session-init, lifecycle verbs) with version-checked writes; a stale edit merges or
refuses rather than overwriting. Only machine records sit under `.internal/`. This is one authority and one view, not
duplication.

Direct file access is the requirement. A person opens any artifact by name and searches inside it from whatever
editor they already use, without per-editor compromise; `arc view` and a status HUD supplement that and never replace
it. The gitignored projection is in tension with this, because editors treat ignored files as not the project's own.
The editor spike (§ 11.2) settled how the projection meets it, split by privacy class:

- `.git/info/exclude` carries the shared surfaces — `.arc/active/`, `.arc/backlog/`, and `.arc/completed/`. It lives
  in the common Git directory, so every worktree has it, and ARC writes it once per clone when it first materializes
  the projection, the moment it installs the fetch refspec.
- `.gitignore` keeps `.arc/user/*/`, so packaging tools that read only `.gitignore` never ship private notes: once
  the inbox left `.gitignore`, `npm pack` packed it.
- A tracked root `.ignore` re-includes all four for the ripgrep family — VS Code search and quick-open, `rg` and
  `fd`, Neovim and Helix pickers. `arc init` adds it, and a repository that ignores `.ignore` stops doing so; this one
  does, for Marksman.
- Zed takes one user-level `file_scan_inclusions` setting per machine, which `arc init` prints rather than writes. It
  names only ARC paths, so it is inert in other projects, and it must keep Zed's default `.env*`. The pass bar allows
  a one-time setting per machine, the same class of step as installing the CLI.

What it gives up: Claude Code's shell `grep` misses `.arc/user/<id>/`, as it does today, so agent guidance names
`rg --hidden`, and the load set reads those files by path. Git-based tools such as Emacs's `project.el` see none of
the projection under any variant, and neither does Codex's `@` picker, which lists no untracked files; Codex's shell
searches reach it through `rg`.

**Refresh and write-back** (the concurrency spike, § 11.4). Each projected file carries a base stamp, an invisible
`<!-- arc-base: <blob id> -->` naming the store version it was written from — on the first line, or right after YAML
frontmatter, since list edits leave the first line alone. Write-back merges against exactly that base, so a stale
editor buffer saved over a refresh keeps both changes, and a hand delete sticks. If someone deletes the stamp, a content
heuristic takes over, at the cost of occasional false conflicts. The guard is needed: VS Code prompts on a conflicting
save, but Zed neither reloads an externally rewritten file nor prompts before saving over it.

After a write, the writer refreshes every other worktree's copy on its machine: stage the new bytes, re-check the file
by stat, rename, and put back any save found in the replaced file. A refresh never overwrites an unsynced edit. That
brings local staleness down to the write's own duration, under 0.2 s for twenty worktrees. Pull refresh at ARC
commands left an agent reading stale shared state 5–8% of the time and a person's copy up to half an hour behind.
The lean, agreed with the Owner, is to project shared surfaces into every worktree rather than once per machine: the
reason for today's single copy was divergent per-worktree stores, which the ref store removes, and an editor open on a
worktree cannot find files kept in the primary. One copy per machine stays the fallback. Other machines refresh at
their firing points.

### 6.6 Notes retirement

Import the current notes snapshot once, move user state (inboxes, working memory, per-work-unit session notes) into
the store keyed by identity rather than commit, keep the old notes ref as an archive tag, and delete the notes-specific
sync, proof, and reachability code. The pre-public-release rule allows collapsing notes history to one snapshot.

### 6.7 History policy

With notes gone, the append-only rule's recorded reason is gone. The concurrent-work strategy's remaining reason —
someone else may hold the branch — is about who pushes to a branch, not team size: PR branches have one author in
common practice, and the mainstream stacking tools (Graphite, git-spice, `gh stack`, `git rebase --update-refs`)
rebase and force-push with lease on team stacks. Merge-based and append-only tools exist too — ghstack keeps
append-only branches and git-town syncs by merge by default — which is why `append-only` stays a supported policy.
ARC work-unit branches already have a single owner, with transfer as a ceremony.

- `history.policy: rewrite-with-lease | append-only`, configurable, default `rewrite-with-lease` everywhere.
- `append-only` is opt-in for teams whose reviewers prefer fixup-then-squash during review, or for branches several
  people push to.
- Cross-machine resume changes from `pull --ff-only` failing loudly to "upstream moved; reset to it" on the owner's
  other machine.
- The policy is also the switch that lets delivery delegate restacking to provider tools and observe the result
  (delivery analysis § 9).

### 6.8 Planning branches

Dropping planning branches outright is not viable yet:

- a meta with a non-null `Branch` makes a detached checkout read `topology-mismatch`
  (`lib/locus/derived-lifecycle-evidence.ts`, `role-corroboration.ts`);
- a detached primary cannot read as free, and cold start refuses a detached checkout;
- in-flight derivation lists metas at branch refs, so a branchless work unit is invisible to `arc active in-flight`;
- until notes retire, two detached worktrees at one base commit overwrite each other's user note;
- activation only renames `plan/<slug>` to its typed prefix; it never creates a branch.

After cutover, `plan/<slug>` becomes a zero-commit, local-only anchor: it gives the locus its topology, carries
nothing, needs no push or PR, and can be reset to base at will. Fully branchless planning is a later cleanup once
in-flight derivation reads the store: planning metas carry no branch and activation gains a create step (cold start
already has an in-place `git switch -c`). The `plan/` prefix's `[invariant]` marker rests on a session-init fallback
that only fires when `State` is empty, so it is weaker than it reads.

### 6.9 Concurrency

Concurrent sessions are the normal case. One person here routinely runs three to six at once — an Errand session in
the primary checkout and work units across planning, execution, and integration — and a team multiplies that. The
store must merge disjoint edits without manual action, refuse conflicting edits with a typed remedy, and never lose a
write silently.

Most state is single-writer by construction. The research and the concurrency spike (§ 11.1, § 11.4) settled a
mechanism for every surface:

| Surface                                                   | Concurrent writers                    | Mechanism                                                                                                                                                           | Standing                                                                                                                                                                                                   |
| --------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Work-unit artifacts (meta, draft, spec, tasks, Candidate) | One session: the work unit's checkout | One ref per work unit, its stored paths slug-named                                                                                                                  | No contention by construction                                                                                                                                                                              |
| Errand identities                                         | Every session of one identity         | Tree keyed per slug, union on conflict, compare-and-swap retry                                                                                                      | Running (`lib/git/ref-tree.ts`, `lib/user-sync/cas-retry.ts`)                                                                                                                                              |
| Inbox and working memory                                  | Every session of one identity         | Single files merged entry by entry, keyed on each entry's bold title; line merge inside an entry, with insertions unioned; a clash conflicts that entry alone       | Spike: nothing lost in 6,400 burst operations on the real inbox. Replaces user sync's recency resolution (`lib/user-sync/merge.ts`), which drops the older edit silently, and its `## Removed:` tombstones |
| Backlog stubs                                             | Whoever mints or grooms               | One record per stub; a new stub is a new key                                                                                                                        | Contends only on edits to the same stub: one to three a week observed                                                                                                                                      |
| Backlog order                                             | Grooming                              | A rank field on each stub by fractional indexing (`rocicorp/fractional-indexing`), sorted by `(rank, stub id)`; the compare-and-swap loser re-keys after the winner | Spike: keys reach 4 characters after 10,000 inserts; a pathological gap re-keys locally, never globally. LexoRank's global rebalance is avoided                                                            |
| Project inbox                                             | Every identity                        | Entry merge, as for the personal inbox                                                                                                                              | The model that fixes today's hotspot, which is switched off                                                                                                                                                |
| Cohort documents                                          | Members, at planning boundaries       | Three-way line merge; a true conflict is typed                                                                                                                      | The recorded fallback: Git merge as the backstop for prose (§ 4.1)                                                                                                                                         |
| ROADMAP and status                                        | None                                  | Derived, never stored                                                                                                                                               | —                                                                                                                                                                                                          |
| Claims (record numbers, slugs, work-unit claims)          | Anyone                                | A verb's compare-and-swap on the store; across machines, against the remote. Hot counters reserve a block per process, as Gerrit's sequences do                     | Pattern exists (Errand claim IDs)                                                                                                                                                                          |

On one machine, refs live in the common Git directory, so every worktree sees a write at once. Today each branch
carries its own copy of shared files and they collide only at integration; the ROADMAP merge driver and the disabled
project inbox are workarounds for that.

**Mechanisms every surface shares:**

- **One ref per surface.** A write reads the ref, builds the new tree, and updates with compare-and-swap; on failure it
  re-reads and re-applies the change to the new head, never resubmitting the old tree. Under twenty-writer bursts
  this sustained 55–70 writes a second against a busiest real rate of about eleven an hour, and a machine-local write
  lock removed the retry tail. One ref per entry removes contention only between different entries and multiplies
  the refs a push carries.
- **Write, then gate.** A same-entry clash lands as a typed conflict record in the surface's tree, keeping both sides
  as data; the next verb that depends on that entry refuses, status lists it, and a resolution names it. Recency never
  decides, and conflict markers are never the record.
- **Ancestry check.** Each checkout remembers the head it last saw and refuses one that does not descend from it,
  which catches a rewind made outside ARC.
- **Projection guards** (§ 6.5): base stamps, writer-pushed refresh, and a teardown that refuses — or first exports
  into the conflict record — a projected file held back by an open conflict.
- **Remote writes.** Pushes batch per machine at firing points, never per write: pushing every write cost two to
  three pushes a write under burst, against GitHub's guidance of six a minute per repository. A lifecycle step that
  already pushes a code branch carries its state refs in the same `--atomic` push. The push loop fetches into a
  remote-tracking namespace, merges entry by entry, and retries with jittered backoff sized to the host's push time —
  seconds, not milliseconds — on `fetch first`, `non-fast-forward`, `incorrect old value provided`, GitHub's
  `cannot lock ref`, and Azure DevOps's `TF401028`. Any other refusal, such as `pre-receive hook declined` or Azure's
  `VS403702` and `TF402455`, ends the loop and shows the server's message.
- **Host policy.** State commits are authored as the user, so a host's author policy accepts them. A repository keeps
  one designated state host, never a mirror path: Gitea and Forgejo push mirrors delete the refs on the target, and
  GitLab mirrors leave the two ends with independent state.

**Still open for design:**

1. **Cross-machine freshness.** Local staleness is closed; another machine sees a write only after it fetches. A
   no-change fetch costs 0.7–0.9 s on GitHub, so fetching at every command has to run in the background.
2. **How a conflict shows in a single-file list** — a marker beside the entry, or only in `arc status` — and whether a
   drain racing a note needs a record at all, since the edited entry stays in the file.
3. **Sharding of the shared surfaces** — backlog order, cohorts, the project inbox, transition records (§ 7 row 1).
4. **Unsynced work outside ARC's teardown.** ARC's teardown persists first, but `git clean -x` and a plain
   `git worktree remove` delete gitignored files without a prompt. A lock on each worktree ARC spawns
   (`git worktree lock`) makes a plain removal refuse, and a single `-f` too, until the lock is lifted or `-f` is given
   twice; checked with Git 2.55. `git clean -x` has no hook, so frequent firing points bound what it can lose.

**Envelope.** The default is designed for solo developers through small and mid-size teams, with a working design
point of about ten people running about six sessions each. The workload model (§ 11.4) puts one person's sessions
together at about seven state writes an hour averaged over busy hours, a few dozen in the busiest, with same-entry
collisions on backlog entries one to three times a week. Larger scale — hundreds of writers, per-record
authorization — belongs to the deferred service backend, and nothing in the contract may preclude it. The
backing-repository backend changes where state lives, not its concurrency mechanics; at team scale it also spends a
separate repository's push budget.

### 6.10 Requirements the spikes set

The design carries these as requirements, not options.

- **Windows** (§ 11.5). Windows refuses to rename over a file any process holds open, so the projection closes its
  own descriptor before renaming and retries with a re-check while a holder refuses, instead of putting back a save
  found in the replaced file. Every replace-by-rename retries on `EPERM`, `EBUSY`, and `EACCES` with bounded backoff,
  as the CLI's `atomicWriteFile` now does, and a delete-pending lock directory counts as held. The re-check must see
  a same-size save: NTFS modification times advance in ticks of 0.36–2 ms, so a stat misses one, and a full re-read
  widens the race enough to lose edits. The candidate, untested, checks under a no-sharing handle and renames on
  close. Stats are read as bigint, since file IDs exceed 2^53; CRLF is normalized to LF on read; Git calls are
  batched (`cat-file --batch`, `update-ref --stdin`) or kept in one long-lived process, since each costs about 30 ms
  against 1.3 ms on Linux. Store and projection tests run in the Windows portability lane.
- **History** (§ 11.6). Every stored path is unique across refs — slug-named, as work-unit artifacts already are, and
  per person for personal files. ARC runs `git maintenance run --auto` at a firing point, because plumbing writes
  never start gc. History is bounded by rotation to a new ref name, leaving the old chain in place and out of the
  default fetch; tamper evidence and a fast-forward-only hook both rule out rewriting in place. A completed work
  unit's ref leaves the fetched namespace at archive. The cutover imports current state, not history. Open: a wider
  delta window where ARC repacks its own store.
- **Files the store does not know yet.** A file created inside a projected folder — a companion in a work unit's
  folder, a stub dropped into `backlog/` — is adopted into its owner: that work unit's tree, or a new stub. A file with
  no owner is flagged in `arc status`, and teardown refuses while one is unadopted. Otherwise it is gitignored, unknown
  to the store, and lost with the worktree. The spikes covered edits and deletes of projected files, not creation.
- **Readers outside ARC.** Workflows, extensions, method overrides, and scripts read state by its projected path or
  through an `arc` command, never through Git: `git log` or `git show` on those paths, a pull-request diff, or a CI
  job that checks out only code sees none of it. ARC's own lint and contract checks over work-unit artifacts lose the
  pull-request diff, so they run where state is written or read it through the store. Code that reads state out of
  Git history today — `candidate-response-confirmation.ts` reads a Candidate record with `git show <head>:<path>` —
  moves before cutover.
- **Forward compatibility with resolving framework core from the pinned package**, a later change that stops copying
  ARC's own workflows, rules, and templates into each repository. The projection takes more than one source — the
  store now, the package later — and supports read-only copies. The ignore strategy works from a path list that
  `.arc/system/` paths can join. Readers load core by its `.arc/` path, never by whether it is tracked. The tracked
  line is drawn at project-owned machinery, not at all of `system/`. Browsability holds throughout: `.arc/` shows ARC
  core, project files, and state together, as whole human-readable documents.

---

## 7. Constraints and Open Decisions

| #   | Decision                                       | Constraint or lean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Ref layout and sharding                        | One ref per surface, settled by the spikes: it held under twenty-writer bursts, keeps one commit per write and small pushes, and ref count barely changes fetch cost. Per-work-unit refs do not contend. Open: the exact surface list and how the shared surfaces shard (backlog order, cohorts, project inbox, transition records). ROADMAP is derived, never stored. Model in § 6.9                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Multi-writer freshness                         | Settled on one machine (§ 6.5, § 6.9): deciding verbs re-read the store, write-back is checked against the base each edit was made on, and the writer refreshes every worktree. Open: cross-machine freshness, fetched in the background                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 3   | Task close alongside its code commit           | `git push --atomic` of the code branch and state refs held the branch back with a stale state ref on every tested host; ordered writes with a typed repair where a host lacks it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Projection scope versus locus correctness      | With no marker naming a work unit, the locus reader selects every identity-owned meta in the checkout and two or more read `conflicting`. Render all work units everywhere and the primary never reads free. Lean: derive locus from marker plus store, and allow a primary marker for `--here`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 5   | Search visibility of the projection            | Settled (§ 6.5): `.git/info/exclude` for the shared surfaces, `.gitignore` for `.arc/user/*/`, and a tracked `.ignore` re-including all four for the ripgrep family. Zed reads neither `.ignore` nor the exclusion, and Claude Code's shell `grep` reads `.gitignore` only. This repository's `.gitignore` stops ignoring `.ignore`. `draft-local-mode.md`'s claim that agent Grep is unaffected is wrong for content search                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Editor settings                                | Settled for Zed: one user-level `file_scan_inclusions` setting per machine, printed by `arc init`, reaches every checkout and remote; `include_ignored` does not help. Open: whether to scaffold editor settings at all, since this repository ignores `.vscode/` and `.zed/` and gitignored settings do not reach spawned worktrees                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7   | Vocabulary                                     | `materialize` is already a CLI verb (pick up a remote-only work unit); the projection needs a different word                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8   | Candidate subject versus record                | Moving the record does not move the subject; the arc-backend buffer item on subjects "over the Git index" is resolved by the evidence-neutral treatment already in code                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Privacy tier                                   | Same-repo refs give clean history, not privacy; the tier tables need a same-repo row and privacy stays with the backing repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10  | Fetch and clone behavior                       | Confirmed on every tested host: plain clones omit `refs/arc/*`. ARC installs a refspec into a remote-tracking namespace on first run, never straight into `refs/arc/*`, where a forced fetch would overwrite unpushed local writes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 11  | Retention and compaction                       | Per-family policy. History is bounded by rotation to a new ref name, and a completed work unit's ref leaves the fetched namespace at archive (§ 6.10). Open: how often to rotate, and a wider delta window where ARC repacks its own store                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 12  | Governance hooks                               | Keep a review-routing seam (backend target namespace, `track_design_docs` export, PM links) without building any now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13  | Identity and project resolution                | Same-repo refs make project pairing trivial; identity keys user families                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 14  | Integration-time durable record                | What lands in code history at integration (the `meta-file-tracking-model` residue) joins the `track_design_docs` policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 15  | Where ARC's local store lives                  | In the code repository's ref list, or in a separate Git directory inside `.git` against the same remote, as submodules keep theirs under `.git/modules/`. The second keeps `git log --all` and graph views clean and can set its own packing, at the cost of `--atomic` code-plus-state pushes and of widening the mirror-push risk to every code clone                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 16  | Protecting state from anyone with write access | No tested host's own controls protect `refs/arc/*` while letting ARC write: GitHub rulesets refuse the pattern; GitLab, Gitea, and Forgejo protection lets state pushes through; Azure DevOps's prefix policy blocks ARC's own updates, and its ref permissions are untested. Options: an opt-in protected-state mode that keeps shared state on a branch prefix — a GitHub ruleset on `refs/heads/arc-state/**` accepted ARC's fast-forwards and refused rewrites and deletes with `GH013`; self-managed hooks, as a fast-forward-only pre-receive hook on GitLab CE did; signed state commits checked against an allowed-signers file on a protected branch; the backing repository's permissions. Lean: the default stays `refs/arc/*` with the ancestry check as tamper evidence, and protected state is opt-in |
| 17  | Contributors from forks                        | Forks copy no `refs/arc/*`, Azure DevOps's full fork aside, and nothing in a pull request carries refs. Lean: a fork contributor needs no upstream state — they run ARC on the local-only backend and read public upstream state by fetching it; a team member who works from a fork points ARC's state remote at the upstream                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 18  | Query cache                                    | A local SQLite index of record fields, keyed by ref tips and checked on read so it cannot serve stale state, and never the authority; worth targeting early if viable. Raw reads need none — every work unit's meta in one 17 ms batch — so its case is queries across fields and live views. Node's built-in `node:sqlite` may avoid a native dependency                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 19  | Core versus deferred                           | Each program item is classified explicitly: 1.0 ships the complete core for solo developers through mid-size teams, and larger scale follows through the service backend without being precluded                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

---

## 8. Prerequisites Reconsidered

"Stage 0" appears only in `draft-arc-backend.md` (lines 381–382: "record migrations … lands in-repo, standalone value
now; _is_ the substrate's data layer"). Its supporting argument (lines 284–286) is "migrate the interface first, the
storage second", which supports the seam rather than records. `draft-local-mode.md` (lines 460–463) already allows
"a transitional file-copy materialization that preserves the store-canonical contract". Entry-granular records matter
for multi-writer sharing, which the default backend does not need on day one.

| Work unit                          | Verdict                            | Reason                                                                                                                                                                    |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `operational-state-docs`           | Fold into the program              | Schemas and the round-trip harness survive; the render/reconcile path and notes-synced wiring would be rebuilt; its conformance-gate slice can run in parallel            |
| `wu-lifecycle-state-model`         | Split                              | Front half (scheduling versus readiness, retiring `init`) is independent but edits lifecycle handlers — after the seam. Back half (placement as a record) is this program |
| `roadmap-tooling`                  | Shrinks                            | Conflict and regeneration items dissolve once ROADMAP is a derived projection; render standard and CLI stay                                                               |
| `cli-substrate-complete-migration` | Independent; never beside the seam | Repository-wide import sweep; its raw-Git-to-executor item is groundwork for the ref backend                                                                              |
| `shared-inbox-model`               | Waits on storage                   | The hotspot dissolves off-branch; the inbox model itself is independent                                                                                                   |
| `meta-file-tracking-model`         | Dissolved                          | Option β is built on notes; the integration-time record question joins `track_design_docs`                                                                                |
| `config-storage-architecture`      | Co-design                          | Its per-machine `.local/` tier is the local-only overlay the backend design lacks; its notes-sync piece is throwaway                                                      |
| `naming-conventions`               | After the seam                     | The contract supplies the indirection that makes renames cheap; renaming first doubles the cascade                                                                        |

---

## 9. Landing Path and Corrective Work

### 9.1 A bridge to test first

Setting `archive.cadence: manual` changes the checkpoint's required position to `integrating` at `active`, so the
recovery route always has its meta and the archive loop cannot form; archival becomes a separate post-merge change,
the order the ref store will use anyway. It is a configuration change that removes steps. It has checkpoint unit
coverage but no self-hosted landing yet, so it is a hypothesis: flip it through an Errand, land one small verified
work unit through it, and fall back to the existing case-by-case Owner workaround if it fails. The archive change's
review lane (it moves `spec-*` into `completed/`) needs checking.

**Outcome (2026-09-24 to 2026-09-26): the bridge held.** The flip landed through an Errand (PR #707). Then
`local-ci-capacity-qualification` merged with its meta Integrating under `active/` (PR #708), and its archive landed in
a separate Errand PR (#709); the other three verified work units followed the same order, the last archived in
PR #715. Each landing costs two pull requests and a review decision on the second: the archive lands in the reviewed
lane because `completed/` is not a planning path. Gaps that exist only under the bridge — the checkpoint's
`lifecycle-incomplete` remedy text, the archive workflow's missing vehicle and teardown order — stay unfixed, because
the program deletes the archive move.

### 9.2 Dispositions

| Work                               | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `singleton-integration-continuity` | Do not build as a Heavy work unit. Storage-created half (placement gating, leftover `plan/` branches misreporting swept work units, archive-before-merge, the notes-ordering evidence loss) is deleted by this program; its own direction ("resolve state from the record and let placement be a projection") is this design. Storage-independent half (host-admission remedy discrimination, settlement rendering) becomes Errands |
| `delivery-correction-convergence`  | Pause. Its singleton item is covered by the bridge; most delivery items are head movement from committed record bytes                                                                                                                                                                                                                                                                                                               |
| `delivery-rebuild-continuity`      | Hold in place at Planning, with no lifecycle action; draft and spec stay the unapproved design record; re-scope D4 and D6 afterward (D1–D3, D8, D9 expected to survive)                                                                                                                                                                                                                                                             |
| `candidate-reroot-recovery-frame`  | Storage-independent (prepublication resumability); unaffected                                                                                                                                                                                                                                                                                                                                                                       |
| Verified in-flight work units      | Land through the bridge before cutover: `plan-amendment` after its open verification, `decompose-conservation-coverage`, `local-ci-capacity-qualification`, then `review-signal-convergence` single-branch with chunked review                                                                                                                                                                                                      |
| Program work units                 | Single-branch delivery with chunked review until the program completes                                                                                                                                                                                                                                                                                                                                                              |

---

## 10. Program Shape

### 10.1 Phases

| Phase | Content                                                                                                                                     | Vehicle                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 0     | Bridge test and landing of verified work units                                                                                              | Errand, then ordinary integrations   |
| 1     | Research, then spikes (§ 11)                                                                                                                | Scratch repository; nothing lands    |
| 2     | Decision: ADR accepted, storage-evolution rewrite, backlog re-cut into one cohort                                                           | Errand and grooming                  |
| 3     | Contract and seam: every reader and writer through the contract, in-repo layout as first implementation                                     | Work units, partitioned by subsystem |
| 4     | Ref backend, projection, migrate/import, fetch-refspec install, user-sync re-key; dogfood on a scratch repository                           | Work units                           |
| 5     | Cutover: quiesce, import, flip, retire notes                                                                                                | One serialized window                |
| 6     | Deletion passes and documentation                                                                                                           | Work units and Errands, by subsystem |
| 7     | Follow-ons: history policy on, branchless planning, backing-repository backend, records engine, delivery re-scope toward observe-and-attest | Separate work units                  |

### 10.2 Parallelism

The arc-backend draft already frames the cutover as "a serialization point, not an argument against parallelizing
everything on either side".

- **Phases 0, 1, and 2 run together.** Optionally, `cli-substrate-complete-migration` runs here too: it is the only
  window where its repository-wide sweep does not collide with the seam.
- **Within phases 3–4:** subsystem partitions of the seam (lifecycle and in-flight, delivery, review and evidence,
  locus and session-init, status and roadmap), the ref backend and projection (new code), and the user-sync re-key run
  in parallel once the contract settles.
- **Never alongside the seam:** `cli-substrate-complete-migration`, `naming-conventions`, and anything that edits the
  lifecycle write path.
- **After cutover:** deletion passes, documentation, `naming-conventions`, the lifecycle-model front half, and the
  follow-ons all parallelize.

### 10.3 Cutover and lateral migration

| Inventory at scoping time                                                                  | Handling                                                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Planning-only work units (five worktrees, two far behind base)                             | Import artifacts from each branch head; retire the planning branch                                                                        |
| Implementation work units (four)                                                           | Land before cutover where possible; otherwise park at a task boundary, import, and remove tracked state in one commit before merging base |
| Backlog: 143 metas, 139 drafts, 12 cohort documents                                        | Bulk import                                                                                                                               |
| `completed/`: 119 directories, 425 files                                                   | Bulk import into archive trees                                                                                                            |
| Notes: 791 annotated code commits, 677 notes-ref commits                                   | Collapse to one snapshot; keep the old ref as an archive tag                                                                              |
| Candidate and transition records (27)                                                      | Import                                                                                                                                    |
| Residue: orphan chore branches, detached delivery-gate worktrees, stale `refs/notes/tmp-*` | Clean up                                                                                                                                  |

This repository's cutover is a quiesce → import → flip window, rehearsed first on a scratch or external repository.

### 10.4 Size, by structure

- **Deleted:** notes-specific sync; branch-tree readers (~8K lines); lifecycle classification and exclusion;
  lifecycle hook checks; the CI planning classifier; later, delivery's projection layer.
- **Rewritten:** the lifecycle executor's write path; in-flight derivation as a ref listing; `arc start` placement;
  the archive index; ROADMAP rendering; notes-related session-init probes.
- **New:** the contract, the ref backend (generalized from user-sync and the Errand refs), the projection with
  persistence at firing points, migrate and import, fetch-refspec installation.
- **Documentation:** the 25 mechanics files and 51 lifecycle-path files, in both copies.

Several Heavy work units run as a cohort, with a large share of deletion. Local-mode's own "Large (week+)" estimate is
light against the coupled surface; user-sync is the nearest in-house comparison for what a ref-backed store costs.

---

## 11. Spikes

Research on the § 6.9 problems ran first, on 2026-09-24; the spikes followed on 2026-09-24 and 2026-09-25, in scratch
repositories outside ARC and on the hosts named below. Scripts and raw results stayed outside this repository; this
section records what they found, each against the bar set for it before it ran.

| Spike                                           | Result                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Editor ergonomics of a gitignored projection    | Passed with the ignore strategy in § 6.5 and one user-level Zed setting per machine (§ 11.2)                                                     |
| Push, fetch, and delete `refs/arc/*` per host   | Held on GitHub.com, GitLab hosted and self-managed, Azure DevOps, Gitea, and Forgejo; GitHub Enterprise Server and Bitbucket not tested (§ 11.3) |
| Fork behavior for custom refs                   | Forks copy none, except an Azure DevOps fork of every branch (§ 11.3)                                                                            |
| `git push --atomic` of a branch plus state refs | A stale state ref held the code branch back on every tested host (§ 11.3)                                                                        |
| Clone and fetch-refspec installation            | A default clone fetches none; ARC's refspec fetches into a remote-tracking namespace (§ 11.3)                                                    |
| `.ignore` negation                              | Re-includes for ripgrep, `fd`, and VS Code; not for Zed, Claude Code's shell `grep`, or Git-based tools (§ 11.2)                                 |
| Concurrency at the design envelope              | Every pass criterion met; no write lost, local or remote (§ 11.4)                                                                                |
| Windows-native checkout (added)                 | No write lost once the Windows requirements in § 6.10 held (§ 11.5)                                                                              |
| History growth over a year (added)              | Reads and writes flat at 20,197 commits deep; size set by the stored layout (§ 11.6)                                                             |

### 11.1 Research on the hard problems

Seven single-pass research sweeps and one research run with adversarial verification; load-bearing claims were
checked against the primary sources listed under Sources, and unchecked leads are not relied on below.

| § 6.9 problem        | What the evidence says                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stale projections    | Every precedent guards writes by checking them against a recorded base; none relies on keeping the copy fresh for correctness. All refresh at firing points, and a refresh must never overwrite an unsaved local edit (the failure in Jujutsu #7229)                                                                  |
| Same-entry conflicts | Keep both sides as data and never choose by recency, as Jujutsu, CouchDB, and Automerge do. Let the write land and record the conflict, refuse the next verb that depends on that entry, and surface the conflict where people and sessions already look. Conflict markers in a file are never the record             |
| Push contention      | GitHub's recommended ceiling of six pushes a minute per repository, shared with code pushes, binds before ref locking does. Push per machine in batches at coarse firing points, carry state refs in code pushes with `--atomic`, shard refs by surface rather than per record, and batch hot counters as Gerrit does |
| Backlog order        | Fractional indexing (`rocicorp/fractional-indexing`) sorted by `(rank, stub id)`, with no global rebalance and no random jitter. Two writers moving one stub is a same-entry conflict                                                                                                                                 |

Two further constraints: the Git-notes import (§ 6.6) must not resolve differing entries with `ours` or `theirs`, and a
verb confirms its own write from the local store, never from a fresh fetch, since a host's replicas may lag.

### 11.2 Editor ergonomics

**Pass bar**, set before the spike: in each first-tier editor a person can find, open, search, and edit a spec and the
inbox with no configuration, or with one-time configuration `arc init` can apply safely — without fighting a
repository's own ignore rules, and with nothing to redo per machine or per worktree. On 2026-09-24 the Owner allowed one
editor setting per machine, the same class of step as installing the CLI. Every surface a person reaches artifacts
through was given its role once, so direct editor access carries the bar alone; `arc view` and the status HUD do not
count toward it.

**Variants**, on a scratch clone mirroring `.arc/active/`, `.arc/backlog/…`, `.arc/completed/…`, and
`.arc/user/<identity>/`: A, plain `.gitignore`; B, A plus a tracked `.ignore` negation; C, `.git/info/exclude` instead
of `.gitignore`; D, Zed's own settings over A; E, C plus the `.ignore` negation. Each variant had a linked worktree
with its own copy. Zed and VS Code ran over their WSL remotes, Zed quit completely between variants. The chosen
strategy (§ 6.5) is E split by privacy class, which keeps the user directory in `.gitignore`. It was not run as a
variant of its own: its results follow E for the shared surfaces and B for the user directory. Codex's `@` picker
lists no untracked files at all, so it misses the projection under every variant; Codex's shell searches use `rg`.

| Tool                           | A   | B   | C   | E   | Notes                                                                                                                                                                              |
| ------------------------------ | --- | --- | --- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Zed quick-open and search      | no  | no  | no  | no  | Git's ignore sources only. Scoped `file_scan_inclusions` passes every check, from project settings or, in every checkout, from user-level settings (D); `include_ignored` does not |
| VS Code quick-open and search  | —   | yes | no  | yes | A not run. Explorer shows the files in every variant tried                                                                                                                         |
| `rg --hidden`, `fd -H`         | no  | yes | no  | yes | Without `--hidden` they skip all of `.arc/`                                                                                                                                        |
| Claude Code shell `grep`       | no  | no  | yes | yes | Reads `.gitignore` only                                                                                                                                                            |
| Claude Code Read, shell `find` | yes | yes | yes | yes | No ignore handling                                                                                                                                                                 |
| `git grep`, Emacs `project.el` | no  | no  | no  | no  | Cannot see ignored files                                                                                                                                                           |
| `git status` clean             | yes | yes | yes | yes | In every linked worktree too                                                                                                                                                       |

**Refresh under an open editor.** VS Code reloads an external rewrite into an open, unmodified buffer, and meets a save
of an unsaved edit over one with its newer-on-disk prompt. Zed did neither: the rewrite appeared only after the
workspace reloaded, and an unsaved edit saved silently over it. zed #63174 reports the same symptom on native Linux
for write-then-rename, and zed #41614 reports missed external changes over WSL remotes. ARC cannot count on the
editor to catch a refresh, so the stale-save guard and base stamps carry it (§ 6.5). Both editors save in place,
keeping the file's inode.

**Packaging.** Under E, `npm pack` of a scratch package with no `files` field packed
`.arc/user/<identity>/USER-INBOX.md`, because npm reads `.gitignore` alone. That is why the chosen strategy keeps the
user directory in `.gitignore`.

### 11.3 Hosts

**Bar**, set before the spike: the default must hold on GitHub and GitLab, hosted and self-managed, or the direction
reopens. Bitbucket and Azure DevOps should hold, and fall back to the backing-repository backend at a documented cost
where they do not. Gitea and Forgejo are best effort. AWS CodeCommit and Google Cloud Source Repositories are not
targeted. Against that bar, every tested host held; GitHub Enterprise Server, on the must-hold floor, and Bitbucket
were not tested.

Private scratch repositories: GitHub on 2026-09-24; Gitea 1.27.3 and Forgejo 16.0.5 on local servers the same day;
gitlab.com, self-managed GitLab CE 19.4.1, and Azure DevOps on 2026-09-25. Self-managed GitLab repeated the basics
only, since it runs the same code as gitlab.com.

| Check                                                      | GitHub                              | GitLab                                           | Azure DevOps                                                                                    | Gitea and Forgejo                                              |
| ---------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Push, fetch, delete, lease                                 | yes                                 | yes                                              | yes                                                                                             | yes                                                            |
| A default clone fetches `refs/arc/*`                       | no                                  | no                                               | no                                                                                              | no                                                             |
| `--atomic` holds a code branch back with a stale state ref | yes                                 | yes                                              | yes                                                                                             | yes                                                            |
| A losing push reads                                        | `cannot lock ref`, or `fetch first` | `incorrect old value provided`, or `fetch first` | `TF401028`, or `fetch first`                                                                    | `incorrect old value provided`, or `fetch first`               |
| Branch protection or push rules reach the refs             | no; rulesets refuse the pattern     | no; a self-managed pre-receive hook can          | a prefix policy blocks every update; the author-email policy refuses state commits (`VS403702`) | no; a server hook can                                          |
| Forks copy the refs                                        | no                                  | no                                               | a fork of every branch does                                                                     | no                                                             |
| Mirrors                                                    | not tested                          | carry them in neither direction                  | none offered                                                                                    | pull mirrors copy them; push mirrors delete them on the target |
| Writes lost under concurrent clones                        | 0                                   | 0                                                | 0                                                                                               | 0                                                              |
| Push time, median                                          | 1.2–2.7 s                           | 1.2–1.6 s                                        | 0.5–1.7 s                                                                                       | under 0.8 s, on loopback                                       |
| One push of 1,000 refs                                     | 3.4 s                               | 23.5 s                                           | 11.1 s                                                                                          | not run                                                        |
| No-change ARC fetch at 1,000 refs                          | 0.70 s                              | 0.83 s                                           | 0.39 s                                                                                          | not run                                                        |

- **Distinct refs did not contend** in the one run that tried: twenty clones pushing twenty refs at once to GitHub saw
  no rejection; each push just took longer. GitHub does not document its replica locking, so this is a sample.
- **No throttling.** Short bursts reached about 280 pushes a minute on GitHub, 540 on GitLab, and 460 on Azure DevOps.
  GitHub's six a minute is guidance that was not enforced at this scale and duration; it stays the design target.
- **One ref under simultaneous pushes is a thundering herd.** Each round has one winner, so twenty simultaneous batched
  pushes to one ref took 150–210 pushes to converge on every host: 25–60 s on the hosted services. At observed rates
  pushes rarely coincide, so the backoff is sized to the host's push time rather than to local contention.
- **Ref count barely matters to fetch.** At 10,000 refs a no-change fetch from GitHub cost 0.94 s against 0.74 s at
  100, and protocol v2 filters by prefix, so code-only fetches pay nothing for state refs. A clone's first ARC fetch
  grows more, from 0.94 s to 2.36 s. One push carrying many refs is slow — 10,000 took 50 s on GitHub — so a
  machine's batched push carries a few surface refs, not many entry refs.
- **A refusal that is not a lost race ends the push loop.** `pre-receive hook declined` reads the same whether a
  project rule or a custom hook refused, and Azure DevOps's `VS403702` and `TF402455` are final too.
- **A branch prefix can be protected on GitHub.** A ruleset on `refs/heads/arc-state/**` accepted fast-forwards and
  refused rewrites and deletes with `GH013`, which ends the push loop; a new branch under the prefix could still be
  created (§ 7 row 16).
- **A fast-forward-only pre-receive hook on self-managed GitLab** refused rewrites and deletes under `refs/arc/` and
  left ARC's own writes, leased races included, working. It also forbids ARC ever rewriting state itself.
- **Forks accept pushes of their own `refs/arc/*`** on GitHub and GitLab, so a contributor can keep state in a fork,
  but state crossing from a fork to the upstream needs its own path (§ 7 row 17).

### 11.4 Concurrency

**Pass criteria**, set before the spike: zero lost writes, bounded retries, typed conflicts, and a measured staleness
window. All four were met: no acknowledged write was lost in any run, no write reached the retry ceiling, the conflict
round trip below passes, and the window is measured under firing-point density below.

**Workload model.** From this repository's history across its two parallel periods (2026-07-13 to 2026-08-09 and
2026-09-07 to 2026-09-13): up to seven sessions committing at once, and two or more for half to two-thirds of busy
time — a floor, since sessions that commit nothing do not show. Writes per busy hour across all sessions are low: task
lists about 2.4, metas under 1.3, backlog stubs and cohort documents under 0.4. The busiest ref ARC already runs, the
Errand registry, peaks at 10–11 writes an hour, with bursts under a minute apart (61 in one September week).
Same-entry collisions on backlog entries run one to three a week. `ROADMAP.md`, the hottest shared file today — 97
branches wrote it 251 times in four weeks — stops being contended once it is derived.

**Store under burst.** Six and twenty writer processes in one checkout, ten writes each, on one ref per surface and on
one ref per entry, under three retry policies: no write lost in 30 runs, and every failed attempt was an old-value
mismatch, never Git's lock. One ref per surface sustained 55–70 writes a second under twenty-writer bursts, against a
busiest real rate of about 11 an hour. Exponential backoff cut the retry tail by two-thirds; a machine-local lock
removed it.

**Projection cases**, 25, all passing. An unsaved edit survives another session's write, and a refresh never
overwrites an unsynced edit. An editor saving a stale buffer over one or two refreshes keeps both, with a stamp or with
the content heuristic, and a stale save rewriting the refreshed lines is a typed conflict. The conflict round trip
holds: the gate refuses, status lists it, and a resolution names it. A plain commit on the ref outside ARC keeps the
gate; a rewind is caught only by the ancestry check. A plain `git merge-file --union` silently undoes a delete, so
union applies only to hunks that touch no existing line.

**Many worktrees and many clones.** Twenty worktrees making eight edits each to one shared entry, and twenty clones
pushing to one bare origin: nothing lost. Conflicts arose only where edits clashed: the same field rewritten or, under
a line merge, inbox captures at the same spot. A line-merge conflict holds back the whole file, and in the real-inbox
bursts 43 of 60 worktrees stopped syncing it; that is why lists merge by entry.

**Entry merge.** On the real inbox and working memory, 500 random pairs of concurrent edits per row: the line merge was
silently wrong in 0.2–2.2% of pairs — a note appended to a drained entry landed on its neighbour — and the entry merge
in none, in either order. Twenty-worktree bursts of captures, notes, check-offs, and drains lost nothing with a stat
re-check (6,400 operations) and 4 of 3,200 with a content re-read. Almost every remaining conflict is a drain racing a
note on the same entry.

**Firing-point density**, from 321 real sessions' transcripts. Pull refresh at ARC commands left an agent reading
stale shared state 5–8% of the time, and in 6–15% of cases the reader went quiet before its next firing point, staying
stale until its next session. A pre-tool-call hook, which both harnesses used here offer, closes the agent's view.
Writer push closes both the agent's and the person's view on one machine, reaching every worktree in 52 ms for 5,
89 ms for 10, and 164 ms for 20. Other machines still refresh at fetch.

**Rank keys.** Concurrent inserts between the same neighbours collide, because the key function is deterministic. One
ref per surface resolves it at write time — the compare-and-swap loser re-keys after the winner — and a merge between
clones does the same. Keys stayed at 4 characters after 10,000 inserts at either end.

### 11.5 Windows-native checkout

Windows 11 on NTFS, Windows Node 22 and Git for Windows 2.49 at `core.autocrlf=true`, Defender real-time protection
on.

- **A rename over a file any process holds open fails with `EPERM`,** whatever the holder's sharing mode, and succeeds
  once it closes. The projection's descriptor held across the rename, the Linux backstop for a racing save, therefore
  cannot exist; on Windows the same lock closes that race instead.
- **Every replace-by-rename needs a bounded retry.** Before it, refused renames of the projection's state file crashed
  4 of 20 workers in the first burst; with it, a burst needed 91–106 retries and none failed. A lock directory being
  removed reads `EPERM` from `mkdir`, not `EEXIST`, 2–6 times a burst.
- **NTFS modification times advanced in steps of 0.36–2 ms,** so 56 of 100 back-to-back in-place writes left the time
  unchanged, and a same-size save inside one step is invisible to a stat re-check.
- **A CRLF save turned clean edits into conflicts** and put `\r` into the store, until the projection normalized line
  endings on read.
- **Background scanning did not interfere** in 2,000 write-then-replace rounds.
- **Process starts are the cost.** `git rev-parse` took 30 ms against 1.3 ms on Linux, so a full burst took 378–401 s
  against about 12 s.

Twenty-worktree bursts with pushed refresh, stat re-check, and entry merge lost nothing once the requirements in § 6.10
held.

### 11.6 History growth

Synthetic years of state for ten people at the workload model's per-person rates, one ref per surface, with text drawn
from `.arc/completed/`: typical at 2,000 busy hours each (155,772 writes on 276 refs) and heavy at 5,000 (390,102
writes on 633 refs), about four and ten times this repository's workload. The deepest ref reaches 8,040 and 20,197
commits.

| Year    | Stored file names     | Pack, every delta recomputed at Git's default window | Window 250                                  |
| ------- | --------------------- | ---------------------------------------------------- | ------------------------------------------- |
| Typical | The same in every ref | 990 MB                                               | 381 MB, measured after 3,500 further writes |
| Typical | Slug-named            | 350 MB                                               | 90.5 MB                                     |
| Heavy   | The same in every ref | 2,606 MB                                             | not run                                     |
| Heavy   | Slug-named            | 1,218 MB                                             | 286 MB                                      |

- **Depth stays out of the read and write paths.** A tip read took 1–2 ms and a compare-and-swap write 17–18 ms at both
  depths; one batched read of every work unit's meta took 17 ms for 601.
- **Pack size is set by how Git finds deltas.** Git compares each object with a window of neighbours sorted by a hash
  of the path's final bytes. When every ref stores the same path, versions of one file rarely share a window, and only
  15–18% of blobs found a delta; name-hash v2 and path-walk cannot help identical paths. Unique paths cut the pack 2.1
  to 2.8 times.
- **A file held near one size needs a wider window.** The inbox is drained around one size, which scrambles its
  versions' order; in the slug-named typical year the personal inboxes took 175 MB of the 277 MB path-walk pack.
- **Pushed one commit at a time, a plain Git server keeps small deltas.** One person's inbox year replayed as single
  pushes packed to 5.5–5.7 MB through the receiving side's automatic gc, against 26.6 MB with every delta recomputed at
  the default window. The synthetic years are the worst case: a full recompute, as `repack -f`, an import, or a host's
  maintenance may do. ARC controls its layout and its own clones' packing, not a host's.
- **Plumbing writes never start gc.** 3,500 writes left about 11,000 loose objects (145–152 MB), so ARC runs
  `git maintenance run --auto` itself.
- **Rotation bounds a fetch.** Every ref restarted as one commit holding its tip fetched 7.9 MB in the typical year and
  18.7 MB in the heavy one. Under a fast-forward-only hook, rotation needs a new ref name.
- **Hosts.** GitHub enforces 2 GB per push and recommends at most 10 GB on disk. Only an import or a mirror push carries
  a whole history at once, and the cutover imports current state. Work-unit refs accumulate, 244–601 a year here, so a
  completed work unit's ref leaves the fetched namespace at archive. For scale, this repository's whole pack is 105 MB
  today, including about 13,300 commits reachable only from its Git notes and `refs/arc/*`.

### 11.7 Still open

- Bitbucket, GitHub Enterprise Server, and Azure DevOps ref-level permissions for ordinary members.
- A pushed year's first fetch over the network from GitHub, and whether GitHub's maintenance keeps the deltas pushes
  arrive with.
- One push was refused after the receiving side had packed twice, in one of two history replays, and its message was
  not captured; whether the push loop's retry set covers that refusal is open.
- A JetBrains IDE.

---

## 12. Risks and the Counter-Case

- **Governance.** Planning changes leave PR review, branch protection, and forge UI. For solo and small teams this is
  the point; for RFC-style teams the backing-repository backend with branches restores all three. Constitutional
  documents stay tracked and reviewed.
- **Invisibility.** Custom refs do not appear in forge UI and are omitted by plain clones. Local browsing through the
  projection covers most use; export and the backing repository cover the rest.
- **No host-enforced protection by default.** GitHub rulesets refuse the `refs/arc/*` pattern, and branch protection
  reaches the refs on no tested host (§ 11.3). Anyone with write access can rewrite or delete state, so the ancestry
  check against rewinds is the guard. Host enforcement exists as an option — state on a ruleset-protected branch
  prefix, or a self-managed fast-forward-only hook — and which one ARC offers stays open (§ 7 row 16).
- **Self-hosting cutover.** ARC migrates the store it runs on. Rehearse on a scratch repository and quiesce this one.
- **Concurrency.** Concurrent sessions are the normal case (§ 6.9). The spikes lost no write under local bursts,
  twenty worktrees, twenty clones on five hosts, or a Windows checkout (§ 11.4, § 11.5). What remains is design:
  freshness across machines, how a conflicted entry shows in a list file, and push volume from a team near the
  envelope, which per-machine batching bounds but no spike ran at team scale.
- **Mirrors and copying tools.** A Gitea or Forgejo push mirror deletes `refs/arc/*` on its target at every sync, and
  a GitLab mirror carries none, so the two ends hold independent state (§ 11.3). Backup and migration tools that copy
  branches and tags would drop state the same way; none was tested.
- **Tools that walk every ref.** `git log --all` and history viewers already walk about 13,300 commits reachable only
  from this repository's Git notes and `refs/arc/*`, against 10,355 from its branches, tags, and remotes. The store
  keeps that class of history unless it lives in a separate Git directory (§ 7 row 15); how graphical Git clients
  present it was not tested.
- **Fetch latency.** A no-change ARC fetch cost 0.7–0.9 s on GitHub and GitLab (§ 11.3). Fetching at every firing
  point would add most of a second to each ARC command, so cross-machine refresh fetches at coarse points or in the
  background (§ 6.9).
- **Bootstrapping.** The program's own work units are planned on the old substrate and cross at cutover like any
  other.

---

## 13. Caveats and Unverified Items

- **Verified in this pass:** the 59% commit share; the merge history since 2026-09-19; the live `refs/arc/*` families;
  `archive.cadence` and the checkpoint gate it switches; the locus reader's meta selection; the Stage 0 and file-copy
  quotes; the auto-merge lane; `.gitignore`'s treatment of `.ignore`; that user-sync load never deletes local files;
  GitHub push and fetch of `refs/arc/*` on this repository's `origin`; user sync's recency resolution of same-entry
  edits.
- **§ 11 comes from the spike and research records,** which stay outside the repository with their scripts; its
  figures are transcribed from them, not re-run for this update. Checked directly for this update: the
  `git show <head>:<path>` read in `candidate-response-confirmation.ts`, this repository's pack size and commit counts
  by ref family, and that each external source added below resolves.
- **Measured once, on one setup:** the spikes ran on one Linux machine under WSL2, one Windows 11 machine, and one
  scratch repository per host. Distinct-ref contention on GitHub rests on a single run, and the Zed and VS Code checks
  ran over WSL remotes, not natively or over SSH.
- **From one inventory pass, not re-verified:** line and file counts in § 2.2 and § 2.3, notes health figures, the
  #656 tail count, and the prerequisite verdicts' churn estimates.
- **Not tested:** Bitbucket, GitHub Enterprise Server, and Azure DevOps ref-level permissions for ordinary members
  (§ 11.7). AWS CodeCommit and Google Cloud Source Repositories were reported closed to new customers in 2024; that
  was not confirmed.
- **`archive.cadence: manual`** now has four self-hosted landings behind it (§ 9.1).

---

## Sources

**Movable work-unit artifacts** (cited by filename): `draft-arc-backend.md`, `draft-local-mode.md`,
`draft-operational-state-docs.md`, `draft-wu-lifecycle-state-model.md`,
`draft-roadmap-tooling.md`, `draft-cli-substrate-complete-migration.md`, `draft-shared-inbox-model.md`,
`draft-meta-file-tracking-model.md`, `draft-config-storage-architecture.md`, `draft-naming-conventions.md`,
`draft-singleton-integration-continuity.md`, `draft-delivery-correction-convergence.md`,
`draft-candidate-reroot-recovery-frame.md`, `spec-delivery-rebuild-continuity.md`,
`report-coupling-blast-radius-audit.md`.

**Stable internal documents:** [ADR-012][adr-012], [ADR-022][adr-022], [ADR-027][adr-027], [ADR-033][adr-033],
[ADR-035][adr-035], [DEV-RULES.ARC][dev-rules-arc], [DEV-RULES.PROJECT][dev-rules-project],
[Storage evolution][storage-evolution], [Concurrent work][concurrent-work], [Work organization][work-org],
[Stacked delivery build versus compose][delivery-analysis], [Storage landscape research, 2026-07][storage-landscape].

**Code:** `packages/arc-framework/src/lib/user-sync/`, `src/lib/git/ref-tree.ts`, `src/lib/errand/`,
`src/lib/locus/`, `src/lib/git/in-flight-derivation.ts`, `src/scripts/integration/checkpoint-composition.ts`,
`src/scripts/integration/checkpoint.ts`, `src/scripts/integration/errand-merge.ts`, `src/commands/start.ts`,
`src/commands/user/save-load.ts`, `.arc/system/arc-config.yml`.

**External:**

- [Pragmatic Engineer — companies using RFCs or design docs][pe-rfcs]
- [rust-lang/rfcs — the RFC process][rust-rfcs]; [Kubernetes KEPs][keps]; [PEP 1][pep-1]
- [Oxide — RFD 1][oxide-rfd] and [rfd-site][oxide-rfd-site]
- [ripgrep guide — ignore files][rg-guide]
- [Claude Code tools reference][cc-tools]
- [JetBrains IJPL-133519 — ignored files in search results][jb-ignore]
- [GitLab issue 24234 — commits reachable only from custom refs][gl-custom-refs]
- [GitHub Docs — creating rulesets][gh-rulesets]; [GitHub Docs — repository limits][gh-limits]
- [GitLab Docs — rate limits on Git SSH operations][gl-ssh-limits]
- [Gerrit — configuration (`notedb.*.sequenceBatchSize`, `retry.*`)][gerrit-config]
- [`git-push(1)`][git-push]
- [Jujutsu — Git compatibility][jj-compat]; [jj #7229][jj-7229]
- [git-bug PR #1610 — compare-and-swap entity writes][git-bug-1610]
- [Automerge — conflicts][automerge-conflicts]; [CouchDB — replication conflicts][couchdb-conflicts]
- [`rocicorp/fractional-indexing`][fractional-indexing]
- [zed #63174 — stale buffer after atomic replacement][zed-63174]
- [zed #41614 — WSL remote project misses external changes][zed-41614]

---

[adr-012]: ../../adr/adr-012-adopt-unified-user-directory-model.md
[adr-022]: ../../adr/adr-022-managed-operational-state-documents.md
[adr-027]: ../../adr/adr-027-refine-errand-model.md
[adr-033]: ../../adr/adr-033-retire-locus-records-derive-roles.md
[adr-035]: ../../adr/adr-035-keep-operational-state-in-repository-refs.md
[dev-rules-arc]: ../../../system/rules/DEV-RULES.ARC.md
[dev-rules-project]: ../../../system/rules/DEV-RULES.PROJECT.md
[storage-evolution]: ../../strategies/project/strategy-storage-evolution.md
[concurrent-work]: ../../strategies/arc/strategy-concurrent-work.md
[work-org]: ../../strategies/arc/strategy-work-organization.md
[delivery-analysis]: analysis-stacked-delivery-build-vs-compose.md
[storage-landscape]: ../research/research-storage-landscape-2026-07.md
[pe-rfcs]: https://blog.pragmaticengineer.com/rfcs-and-design-docs/
[rust-rfcs]: https://github.com/rust-lang/rfcs/blob/master/text/0002-rfc-process.md
[keps]: https://github.com/kubernetes/enhancements/blob/master/keps/README.md
[pep-1]: https://peps.python.org/pep-0001/
[oxide-rfd]: https://oxide.computer/blog/rfd-1-requests-for-discussion
[oxide-rfd-site]: https://github.com/oxidecomputer/rfd-site
[rg-guide]: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
[cc-tools]: https://code.claude.com/docs/en/tools-reference
[jb-ignore]: https://youtrack.jetbrains.com/issue/IJPL-133519/Files-ignored-by-.gitignore-appear-in-search-results
[gl-custom-refs]: https://gitlab.com/gitlab-org/gitlab/-/issues/24234
[gh-rulesets]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository
[jj-compat]: https://jj-vcs.github.io/jj/latest/git-compatibility/
[gh-limits]: https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits
[gl-ssh-limits]: https://docs.gitlab.com/administration/settings/rate_limits_on_git_ssh_operations/
[gerrit-config]: https://gerrit-review.googlesource.com/Documentation/config-gerrit.html
[git-push]: https://git-scm.com/docs/git-push
[jj-7229]: https://github.com/jj-vcs/jj/issues/7229
[git-bug-1610]: https://github.com/git-bug/git-bug/pull/1610
[automerge-conflicts]: https://automerge.org/docs/reference/documents/conflicts/
[couchdb-conflicts]: https://docs.couchdb.org/en/stable/replication/conflicts.html
[fractional-indexing]: https://github.com/rocicorp/fractional-indexing
[zed-63174]: https://github.com/zed-industries/zed/issues/63174
[zed-41614]: https://github.com/zed-industries/zed/issues/41614
