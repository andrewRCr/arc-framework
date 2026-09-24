# Analysis: Storage Substrate Direction — Operational State in Repository Refs

**Purpose:** Map the cost ARC pays for keeping its operational and planning state as tracked files on code branches
and in Git notes, assess whether moving that state off-branch now is viable and how, and record the direction,
constraints, open decisions, and program shape that came out of scoping it — so the work that follows starts from a
settled picture instead of re-deriving it.

**State:** Point-in-time analysis taken 2026-09-24. Read-only investigation; no code, planning artifact, or record
was changed. Counts and line references are as of `origin/main` at `0ec3ca9e5` and drift with the code. The direction
it records is proposed in [ADR-035][adr-035]; that record, not this document, carries the decision.

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
unconfirmed external source are marked in § 13.

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
   at the familiar `.arc/` paths is the working copy people browse and edit.

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
   likely not copied to forks, and do not give privacy; planning edits leave PR review. Each has a backend or export
   answer. Seven spikes decide whether the default holds (§ 11), with GitHub and GitLab as the floor it must hold on;
   GitHub already accepts `refs/arc/*` pushes from this repository.

10. **Concurrency is a requirement, not a risk.** Concurrent sessions are the normal case. Most state is single-writer
    by construction — each work unit belongs to one exclusive checkout — and the shared surfaces take entry-granular
    union, a rank field, or three-way merge, with ARC's Errand refs and user sync already running the core
    mechanisms. Keeping decisions off a stale projection is the hard part. Research and a concurrency spike at a
    stated design envelope gate acceptance (§ 6.9, § 11).

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

| System                        | Namespace or shape                              | Lesson                                                                                      |
| ----------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gerrit NoteDb                 | `refs/changes/*/meta` and `refs/meta/*`         | Review metadata as refs in the code repository, at very large scale                         |
| git-bug                       | custom refs per entity                          | Offline-first issue tracking in the same repository                                         |
| Radicle collaborative objects | refs in the project repository                  | Collaborative records as Git objects, peer-replicated                                       |
| beads                         | Dolt data under `refs/dolt/data`                | Agent task state co-located with code; chose custom refs over notes                         |
| grite                         | `refs/grite/wal`, `refs/grite/locks`            | Write-ahead log plus advisory leases in refs                                                |
| Jujutsu                       | `refs/jj/*` (local)                             | Custom refs for tool state; does not yet push or fetch them to GitHub                       |
| ARC Errands                   | `refs/arc/user/<id>/errands`                    | The same model, already landing work here                                                   |
| Terraform backends            | pluggable state backends, local default         | Small curated set, `-migrate-state`, native locking; removed backends it could not maintain |
| Oxide RFDs                    | a branch per document in a dedicated repository | Uses branches so PR review and protection apply; renders a site across branches             |

### 5.2 Forge support for custom refs

| Question                                      | Finding                                                                             | Confidence    |
| --------------------------------------------- | ----------------------------------------------------------------------------------- | ------------- |
| GitHub accepts pushes to `refs/arc/*`         | This repository's `origin` holds `refs/arc/user/<id>/errands` and `sync-state`      | Confirmed     |
| GitLab accepts custom refs                    | GitLab's own stack uses custom refs (`refs/merge-requests/*`, `refs/keep-around/*`) | Likely        |
| Bitbucket accepts a novel namespace           | Rejects pushes to its reserved namespaces; novel namespaces unverified              | Unverified    |
| Custom-ref-only commits browsable in forge UI | Not browsable on GitLab (open issue); presumed the same on GitHub                   | Likely not    |
| Custom refs copied on fork                    | No evidence they are copied                                                         | Likely not    |
| Rulesets or branch protection on custom refs  | GitHub rulesets target branches and tags only                                       | Confirmed not |
| `git push --atomic`                           | GitHub and GitLab support it; Azure DevOps does not; Bitbucket unverified           | Mixed         |

### 5.3 Search tools and ignored files

| Tool             | Skips `.gitignore`d files by default | Notes                                                                                                                                                                                                                                                           |
| ---------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ripgrep          | Yes                                  | `.ignore` and `.rgignore` can re-include with `!pattern`, above `.gitignore`                                                                                                                                                                                    |
| VS Code search   | Yes (`search.useIgnoreFiles`)        | Reported to honor `.ignore`; Explorer still lists ignored files                                                                                                                                                                                                 |
| Claude Code Grep | Yes                                  | ripgrep-based                                                                                                                                                                                                                                                   |
| Claude Code Glob | No                                   | Finds ignored files unless configured otherwise                                                                                                                                                                                                                 |
| JetBrains IDEs   | No                                   | Long-standing open issue                                                                                                                                                                                                                                        |
| Zed              | Quick-open and search yes; tree no   | `file_finder.include_ignored: "smart"` and `search.include_ignored: false` by default; `file_scan_inclusions` (default `.env*`) re-includes for quick-open and search (confirmed); `.ignore` undocumented; `.zed/settings.json` is read by local and remote Zed |

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
it. The gitignored projection is in tension with this, because editors treat ignored files as not the project's own —
§ 11's first spike settles how the projection meets it.

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

Most state is single-writer by construction, and the core mechanisms already run here:

| Surface                                                   | Concurrent writers                    | Mechanism                                                                   | Standing                                                             |
| --------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Work-unit artifacts (meta, draft, spec, tasks, Candidate) | One session: the work unit's checkout | One ref or subtree per work unit                                            | No contention by construction                                        |
| Errand identities                                         | Every session of one identity         | Tree keyed per slug, union on conflict, compare-and-swap retry              | Running (`lib/git/ref-tree.ts`, `lib/user-sync/cas-retry.ts`)        |
| Inbox and working memory                                  | Every session of one identity         | Entry-granular union                                                        | Running (`lib/user-sync/merge.ts`), with the same-entry defect below |
| Backlog stubs                                             | Whoever mints or grooms               | One record per stub; a new stub is a new key                                | Contends only on edits to the same stub                              |
| Backlog order                                             | Grooming                              | A rank field on each stub, order derived                                    | Standard design (LexoRank-style fractional ranks); not built         |
| Project inbox                                             | Every identity                        | Entry-granular union                                                        | The model that fixes today's hotspot, which is switched off          |
| Cohort documents                                          | Members, at planning boundaries       | Three-way merge; refuse on a true conflict                                  | The recorded fallback: Git merge as the backstop for prose (§ 4.1)   |
| ROADMAP and status                                        | None                                  | Derived, never stored                                                       | —                                                                    |
| Claims (record numbers, slugs, work-unit claims)          | Anyone                                | A verb's compare-and-swap on the store; across machines, against the remote | Pattern exists (Errand claim IDs)                                    |

On one machine, refs live in the common Git directory, so every worktree sees a write at once. Today each branch
carries its own copy of shared files and they collide only at integration; the ROADMAP merge driver and the disabled
project inbox are workarounds for that.

**Open, riskiest first:**

1. **Stale projections.** `draft-arc-backend.md` names local-materialization freshness "the genuinely hard problem"
   and bets on version-checked writes plus deliberate refresh. The store is current on one machine at once, but each
   worktree's projected copy of a shared file can lag other sessions' writes. Candidates: decisions read the store
   through verbs, never the projection; projections refresh at firing points; shared surfaces project once per
   machine rather than once per worktree.
2. **Same-entry conflicts.** User sync resolves two different edits to one entry by recency
   (`lib/user-sync/merge.ts`), dropping the older edit silently. The store must surface a typed conflict instead.
3. **Team-scale push contention.** Many machines pushing one shared ref retry against each other. Per-entity refs and
   batching pushes at firing points reduce it; the spike measures it.
4. **Backlog order.** The rank field needs its concrete design.

**Envelope.** The default is designed for solo developers through small and mid-size teams, with a working design
point of about ten people running about six sessions each, to be confirmed from the workload model (§ 11). Larger
scale — hundreds of writers, per-record authorization — belongs to the deferred service backend, and nothing in the
contract may preclude it. The backing-repository backend changes where state lives, not its concurrency mechanics.

---

## 7. Constraints and Open Decisions

| #   | Decision                                  | Constraint or lean                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Ref layout and sharding                   | Per-work-unit refs do not contend; shared surfaces (backlog order, cohorts, project inbox, transition records) do. Candidates: ADR-027's tree of blobs with union merge, or one ref per entity. ROADMAP is derived, never stored. Per-surface model in § 6.9                                                                                                                               |
| 2   | Multi-writer freshness                    | The hardest part of the concurrency model (§ 6.9): version-checked writes prevent corruption, but several sessions of one identity share its surfaces, so the refresh design must keep decisions off stale projections                                                                                                                                                                     |
| 3   | Task close alongside its code commit      | `git push --atomic` of the code branch and state refs where the host supports it; otherwise ordered writes with a typed repair                                                                                                                                                                                                                                                             |
| 4   | Projection scope versus locus correctness | With no marker naming a work unit, the locus reader selects every identity-owned meta in the checkout and two or more read `conflicting`. Render all work units everywhere and the primary never reads free. Lean: derive locus from marker plus store, and allow a primary marker for `--here`                                                                                            |
| 5   | Search visibility of the projection       | A tracked repository-root `.ignore` negation covers the ripgrep family (VS Code, Claude Code Grep, terminal pickers) but not Zed, whose quick-open and search follow their own settings (§ 5.3). This repository's `.gitignore` currently ignores `.ignore` (Marksman exclusion) and would change. `draft-local-mode.md`'s claim that agent Grep is unaffected is wrong for content search |
| 6   | Editor settings                           | Zed needs `file_scan_inclusions` or `include_ignored` in `.zed/settings.json`. `.vscode/` and `.zed/` are gitignored here, which conflicts with the recorded plan to scaffold editor settings at init — and gitignored editor settings do not exist in spawned worktrees, so one-time configuration means tracked settings or worktree spawn writing them                                  |
| 7   | Vocabulary                                | `materialize` is already a CLI verb (pick up a remote-only work unit); the projection needs a different word                                                                                                                                                                                                                                                                               |
| 8   | Candidate subject versus record           | Moving the record does not move the subject; the arc-backend buffer item on subjects "over the Git index" is resolved by the evidence-neutral treatment already in code                                                                                                                                                                                                                    |
| 9   | Privacy tier                              | Same-repo refs give clean history, not privacy; the tier tables need a same-repo row and privacy stays with the backing repository                                                                                                                                                                                                                                                         |
| 10  | Fetch and clone behavior                  | Plain clones omit `refs/arc/*`; ARC installs a fetch refspec on first run; confirm per host                                                                                                                                                                                                                                                                                                |
| 11  | Retention and compaction                  | Per-family policy; completed work units compact into archive trees                                                                                                                                                                                                                                                                                                                         |
| 12  | Governance hooks                          | Keep a review-routing seam (backend target namespace, `track_design_docs` export, PM links) without building any now                                                                                                                                                                                                                                                                       |
| 13  | Identity and project resolution           | Same-repo refs make project pairing trivial; identity keys user families                                                                                                                                                                                                                                                                                                                   |
| 14  | Integration-time durable record           | What lands in code history at integration (the `meta-file-tracking-model` residue) joins the `track_design_docs` policy                                                                                                                                                                                                                                                                    |

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

| Spike                                                                  | If it fails                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Editor ergonomics of a gitignored projection (below)                   | Revisit the projection's ignore strategy before the projection is built                                                               |
| Push, fetch, and delete `refs/arc/*` per host (below)                  | On GitHub or GitLab, the direction reopens; elsewhere that host defaults to the backing-repository backend with ordinary branch names |
| Fork behavior for custom refs                                          | If copied, planning leaks into forks; document or namespace per-fork                                                                  |
| `git push --atomic` of a branch plus state refs                        | Task close uses ordered writes with a typed repair                                                                                    |
| Clone and fetch-refspec installation                                   | First-run bootstrap design changes                                                                                                    |
| `.ignore` negation across ripgrep, VS Code, Claude Code Grep (not Zed) | Choose per-tool configuration or accept uneven search visibility                                                                      |
| Concurrency at the design envelope (below)                             | Reshape the failing surface's mechanism or sharding before the seam is built (§ 6.9, § 7 rows 1–2)                                    |

**Editor ergonomics** is the spike most able to push the design into a corner, and it needs no storage code, so it
runs first. `arc view` and a status HUD do not replace opening a spec, the backlog, or the inbox in whatever editor a
person already uses.

- **Inventory first:** list every surface a person can reach artifacts through, shipped and planned — direct editor
  access, `arc view` (glow or bat into a pager), `arc status`, the planned `status-hud` card and watch panel, and a
  path-or-editor handoff from `arc view` (held in `USER-INBOX § Errand`) — and assign each its role once, so the
  projection and the surfaces around it are judged as one set rather than work unit by work unit.
- **Setup:** a scratch clone with a gitignored directory mirroring `.arc/active/`, `.arc/backlog/…`,
  `.arc/completed/…`, and `.arc/user/<identity>/` (inbox, working memory).
- **Editors:** Zed first, then VS Code, a JetBrains IDE, and a terminal workflow (`rg`, `fd`, `fzf`, Neovim); agent
  tools (Claude Code Read, Grep, and Glob; Codex CLI).
- **Checks, per editor:** the file tree shows the files; quick-open finds `spec-<slug>` by name; project search hits
  inside them; edit and save work; an external rewrite reloads cleanly into an open buffer and a conflicting edit is
  surfaced rather than lost; relative links and Markdown preview between artifacts work; `git status` stays clean.
- **Variants:** plain `.gitignore`; `.gitignore` plus a tracked `.ignore` negation; per-editor include settings
  `arc init` could write — for Zed, `file_scan_inclusions` scoped to the projection (inclusion alone makes files
  findable, confirmed below) rather than the blunter `file_finder.include_ignored: "all"` and
  `search.include_ignored: true`; the local-mode draft also cites two VS Code issues; a non-ignored projection kept
  out of `git status` by other means, if one exists safely. For each settings variant, check that it reaches spawned
  worktrees and survives remote development over SSH.
- **Pass bar:** in each first-tier editor a person can find, open, search, and edit a spec and the inbox with no
  configuration, or with one-time configuration `arc init` can apply safely — without fighting a repository's own
  ignore rules (this repository ignores `.vscode/` and `.zed/`), and with nothing to redo per machine or per
  worktree. `arc view` and the HUD do not count toward the bar.
- **Output:** a per-editor matrix recorded here; it decides the projection's ignore strategy (§ 7, rows 5 and 6).
- **First data point (Zed, 2026-09-24):** today's gitignored `USER-INBOX.md` shows in Zed's file tree but not in
  quick-open or project search, which matches Zed's defaults (§ 5.3). Keeping it pinned open is the workaround, and
  a pinned tab does not follow a person to another machine over SSH. Plain `.gitignore` already fails the pass bar
  in Zed; the storage change would extend that failure from the inbox to every planning artifact. Adding
  `**/.arc/user/**` to `file_scan_inclusions` in the primary checkout's `.zed/settings.json` made the inbox reachable
  by quick-open and search; not yet checked over SSH, and spawned worktrees lack the file because `.zed/` is
  gitignored here.

**Hosts.** The default must hold on GitHub and GitLab, hosted and self-managed; a failure there reopens the direction
rather than routing around it. Bitbucket (Cloud and Data Center) and Azure DevOps should hold, and fall back to the
backing-repository backend at a documented cost where they do not. Gitea and Forgejo are best effort. AWS CodeCommit
and Google Cloud Source Repositories are not targeted: both were reported closed to new customers in 2024, which the
spike confirms. GitHub push and fetch are already confirmed by this repository's `origin` (§ 5.2); delete is not.
Self-managed servers can reject custom refs through administrator hooks even where the product allows them, so the
spike records the product default and the refusal shape.

**Concurrency** is the spike that decides whether the direction is viable at all, so it gets its own research first.

- **Research first:** established idioms for the § 6.9 open problems — local-first sync and conflict surfacing
  (CRDTs; operation logs per entity, as in git-bug and Radicle), rank ordering (LexoRank, fractional indexing),
  stale views across several checkouts (Jujutsu's concurrent operations; Syncthing and Dropbox conflict files), and
  compare-and-swap retry on refs at scale (Gerrit NoteDb). Record what to adopt, adapt, or avoid here.
- **Workload model:** writes per surface per day from this repository's history, scaled to the § 6.9 envelope.
- **Local:** 6 and 20 concurrent writers on one ref versus per-entity refs. Pass: zero lost writes and bounded
  retries.
- **Remote:** several clones pushing concurrently to GitHub and GitLab. Measure rejection rate, convergence, and
  latency.
- **Projection:** two worktrees edit the same shared file and persist. Every case ends in a merge or a typed
  conflict, never a loss; measure how long a projection stays stale.
- **Output:** a per-surface verdict recorded here; it confirms or reshapes § 6.9 and the ADR's concurrency item.

---

## 12. Risks and the Counter-Case

- **Governance.** Planning changes leave PR review, branch protection, and forge UI. For solo and small teams this is
  the point; for RFC-style teams the backing-repository backend with branches restores all three. Constitutional
  documents stay tracked and reviewed.
- **Invisibility.** Custom refs do not appear in forge UI and are omitted by plain clones. Local browsing through the
  projection covers most use; export and the backing repository cover the rest.
- **No host-enforced protection.** Rulesets cannot target custom refs; ARC's own compare-and-swap and verbs are the
  guard. Teams needing host enforcement use a backing repository.
- **Self-hosting cutover.** ARC migrates the store it runs on. Rehearse on a scratch repository and quiesce this one.
- **Concurrency.** Concurrent sessions are the normal case (§ 6.9). Most state is single-writer, and the shared
  surfaces have mechanisms with in-house precedent, but stale projections and team-scale push contention stay
  unproven until the concurrency spike reports.
- **Bootstrapping.** The program's own work units are planned on the old substrate and cross at cutover like any
  other.

---

## 13. Caveats and Unverified Items

- **Verified in this pass:** the 59% commit share; the merge history since 2026-09-19; the live `refs/arc/*` families;
  `archive.cadence` and the checkpoint gate it switches; the locus reader's meta selection; the Stage 0 and file-copy
  quotes; the auto-merge lane; `.gitignore`'s treatment of `.ignore`; that user-sync load never deletes local files;
  GitHub push and fetch of `refs/arc/*` on this repository's `origin`; user sync's recency resolution of same-entry
  edits.
- **From one inventory pass, not re-verified:** line and file counts in § 2.2 and § 2.3, notes health figures, the
  #656 tail count, and the prerequisite verdicts' churn estimates.
- **External items marked likely or unverified in § 5** need primary-source confirmation or the § 11 spikes.
- **`archive.cadence: manual`** has unit coverage but no self-hosted landing.

---

## Sources

**Movable work-unit artifacts** (cited by filename): `draft-arc-backend.md`, `research-storage-landscape-2026-07.md`,
`draft-local-mode.md`, `draft-operational-state-docs.md`, `draft-wu-lifecycle-state-model.md`,
`draft-roadmap-tooling.md`, `draft-cli-substrate-complete-migration.md`, `draft-shared-inbox-model.md`,
`draft-meta-file-tracking-model.md`, `draft-config-storage-architecture.md`, `draft-naming-conventions.md`,
`draft-singleton-integration-continuity.md`, `draft-delivery-correction-convergence.md`,
`draft-candidate-reroot-recovery-frame.md`, `spec-delivery-rebuild-continuity.md`,
`report-coupling-blast-radius-audit.md`.

**Stable internal documents:** [ADR-012][adr-012], [ADR-022][adr-022], [ADR-027][adr-027], [ADR-033][adr-033],
[ADR-035][adr-035], [DEV-RULES.ARC][dev-rules-arc], [DEV-RULES.PROJECT][dev-rules-project],
[Storage evolution][storage-evolution], [Concurrent work][concurrent-work], [Work organization][work-org],
[Stacked delivery build versus compose][delivery-analysis].

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
- [GitHub Docs — creating rulesets][gh-rulesets]
- [Jujutsu — Git compatibility][jj-compat]

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
