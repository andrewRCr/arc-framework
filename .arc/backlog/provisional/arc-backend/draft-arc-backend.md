# Draft: ARC Backend (north-star)

**Purpose:** Capture the long-term architectural target — ARC's canonical WU-artifact storage living **git-native
but outside the project's code repo, materialized locally** — as the north star against which interim work composes.
The backend is the *hosted, shared form* of a git backing store; it is not a novel storage system. This plan
establishes the shape, audience fit, and forward-compat discipline; detailed design defers to a future PRD.

- **State:** Captured (north-star reference; not active planning)
- **Created:** 2026-05-02
- **Updated:** 2026-06-10 — sharpened from "out-of-repo backend with concurrency primitives" to the
  **git-backing-store-materialized-locally** model: the backend is the hosted form of a separate git repo whose
  content is materialized into a gitignored `.arc/`. Folds in the git-history-pollution driver, the one-knob config,
  the concurrency-with-history answer (event-log), the materialization-freshness analysis, and the operational
  gotchas surfaced in an exploratory design pass. Resolved several prior open questions; see § Open Questions.
  Amended 2026-07-02 with shared-inbox compose notes (entry-granular record ops, tombstone events, per-entry
  sweep version-checks) from the shared-inbox-model grooming.
- **Origin:** Surfaced during cross-machine planning discussion 2026-05-02. Concern: current ARC architecture is
  heavily shaped around solo-dev arc-in-git; existing scaling stories (`pm.mode: external`, coord-probe, planned
  Local mode) cover narrow cases as workarounds rather than a coherent solution for the "canonical storage outside
  the code repo" gap. The 2026-06-10 pass added the realization that the gap is better framed as one git-backing-store
  substrate scaled from single-user (Local) to shared-hosted (Backend), not as a bespoke service.

---

## Problem / Motivation

ARC's canonical-store assumption today is "everything in `.arc/` lives in the project repo's tracked tree." This
serves solo dev with no constraints well, and acceptably serves small teams where merge mechanics on text files stay
human-scale. It fails or strains along **four distinct concerns** — and the fourth was absent from this plan's
original framing:

- **(a) Agent/human ergonomics** — the in-repo model's strength: agents grep/index/edit any artifact instantly, and
  humans keep planning artifacts beside the code in their editor of choice. Any target must *preserve* this, not
  trade it away. (This is why a SaaS/own-frontend pivot is a non-goal — see Non-Goals.)
- **(b) Solo dev, multi-machine** wanting centralized canonical state. Local mode's backing store works but requires
  per-developer setup; the same materialization semantics, hosted, is operationally simpler.
- **(c) Privacy — planning artifacts public when the repo is.** `.arc/` in the tracked tree means PRDs, plans, specs,
  status become public on a public/OSS repo. **This is invariant under in-repo storage, not configurable.** Critically:
  pulling artifacts out of *branch history* (git notes, an orphan state-branch) solves (d) below but **not** (c) —
  notes and state-branches live in the *same* repo, so they are public if the repo is. **(c) forces the canonical
  store into a *separate* repo** (private), which is exactly Local mode's backing store / the backend.
- **(d) Git-history & PR-view pollution** *(the driver that was missing)*. Planning churn — standalone `meta-*`
  handoff commits, `tasks-*` updates riding every commit, inbox-drain / housekeep `chore/` PRs, project-artifact
  edits — interleaves with code commits. The signal-to-noise problem is tolerable solo but **explodes with team
  size**: each developer draining an inbox per WU makes housekeep/maintenance PRs the *dominant* class in history,
  drowning actual feature work. There is no stable identifier to filter ARC-maintenance commits reliably today
  (`chore` also catches dep bumps). This was never named in the original plan; it is now a first-class motivation,
  and it has cheaper dedicated mitigations short of the full backend (see § Decoupling (d)).

Existing partial workarounds (`pm.mode: external`, coord-probe, Local mode backing store, planned `team.enabled`)
each address a slice. **The architectural gap is canonical storage outside the *code* repo — git-native, materialized
locally — with concurrency-safe sharing as a composable benefit.**

**Calibration note (2026-05):** External research into agentic-coding practice (2024-2026) confirms the modal answer
for inter-WU planning concurrency is out-of-band human coordination (Slack, standup), not codified sync. The backend's
*pure sync* benefit is therefore less load-bearing for team adoption than the original framing implied. Primary
value-props are **(c) privacy** and **(d) clean history**, with concurrency primitives a benefit for high-parallelism
deployments — not the load-bearing reason at typical team scales.

---

## Working Thesis: Git All the Way Down

**The canonical store is a git repo — just not the project's code repo.** Per-user/solo it is a private backing
repo (Local mode); shared/team it is that same repo, hosted, with a coordination layer (the Backend). Either way,
ARC *materializes* its content into a gitignored `.arc/` so agents and humans see ordinary local files. This is the
chezmoi/dotfile-manager shape (a source repo elsewhere, rendered into the working location) and it is maximally
**idiomatic** — a second git repo plus a sync command is the most ordinary thing in git. That idiomaticity is the
core win: it keeps every benefit ARC already has (agent-native files, editor-of-choice, real version control, the
whole inbox / housekeep / errand / worktree-isolation system) while solving (c) and (d), without becoming
Linear/Notion.

**B canonical, A integration.** External-tool integration (Linear / Jira / Notion) layers on top as bidirectional
sync adapters, never as substitutes for the canonical store. WU-artifact shape stays ARC's. The order matters:
**extending `pm.mode: external` to take ownership of WU artifacts before this lands would lock in
external-tool-as-canonical and force migration later.** Current planned external work (coord-probe read-only;
`pm.mode: external` stripping the PM pipeline) does not cross this line.

---

## The Storage Model

### The line: what's tracked vs. materialized

The boundary is **PM state-and-design vs. PM machinery**, drawn at the directory level so a single artifact group
never splits arbitrarily:

| Class                 | Members                                                                                    | Tier                       | Configurable?                                                                                             |
|-----------------------|--------------------------------------------------------------------------------------------|----------------------------|-----------------------------------------------------------------------------------------------------------|
| **Machinery**         | `system/**` (workflows, rules, methods, templates)                                         | **tracked**                | No — versions with checkout so behavior pins to the code (`git checkout <sha>` reproduces agent behavior) |
| **Operational state** | `meta-*`, `tasks-*`, inboxes, `STATUS`/`ROADMAP`, notes, `WORKING-MEMORY`, `SESSION-NOTES` | **materialized**           | No — pure churn, no review value                                                                          |
| **Authored design**   | `draft-*`, `spec-*`                                                                        | **materialized (default)** | **Yes — one knob**                                                                                        |

### The one knob

The only real variation is whether authored design docs get the full git-host treatment. Expose exactly **one
enum**, never per-artifact booleans (that is the matrix ADR-020 spent itself killing):

```
storage.track_design_docs: none | specs | all     # default: none
```

- `none` — privacy-max / clean-history. Nothing PM in the code repo.
- `specs` — track the ratified design (the thing worth reviewing); keep messy `draft-*` private. *Costliest arm:* a
  single WU's artifacts span two repos (see Gotcha 2) — may not earn its keep; consider `none | all` only.
- `all` — track all design docs (private-repo team, or transparency-by-design OSS that *wants* its roadmap public).

This one knob governs **three things at once — privacy (c), in-git PR review, and history-browsability** — because
they are one axis: "do design docs get the full git-host treatment." Default `none`, surfaced only in the
guided-init walkthrough (the ADR-020 informed-consent pattern); most adopters never think about it. Watertightness
rests on disciplines ARC *already* has: filename-only cross-artifact references (tier-agnostic resolution) and
reference-don't-embed (a tracked artifact must never embed materialized content — the privacy guarantee).

### Decoupling (d)

(d) is separable from the full backend and has cheaper mitigations, useful interim and for adopters who never need
(c):

- **Out-of-line git, still in git** — route churny state to git notes / an orphan state-ref so it leaves *branch
  history* while staying versioned. Solves (d), **not** (c). ARC already does this for user state
  (`refs/notes/arc/user/{id}`).
- **Stable maintenance trailer** — a reserved trailer (e.g. `Arc-Maintenance: true`) gives 100%-reliable filtering
  of planning churn from history/PR views. Cheap, do-anytime, orthogonal to everything else.

---

## Storage Tiers (one substrate at three scales)

The tiers are **not three designs** — they are the same git-backing-store substrate at increasing multiplicity:

| Tier        | Canonical store                                        | Materialized to    | Scale                               | State      |
|-------------|--------------------------------------------------------|--------------------|-------------------------------------|------------|
| **In-repo** | the code repo (tracked `.arc/`)                        | n/a                | solo / small team, no constraints   | Current    |
| **Local**   | a separate **private git repo** (`~/.arc-state/{id}/`) | gitignored `.arc/` | single-user, multi-machine; privacy | Planned    |
| **Backend** | that repo, **hosted + shared + coordinated**           | gitignored `.arc/` | multi-user / team                   | North star |

**Local *is* tier-2 of the materialized substrate; the Backend is its hosted form; team is the multi-writer
config.** Local mode landing first is structurally important — the backend is mostly "Local, hosted." This unifies
what were previously framed as separate Local-mode and backend-tier designs (consolidating the scattered subsumption
notes in ADR-020 and below).

### Materialization: how a repo's content lands in `.arc/`

Two real mechanisms — a genuine fork:

- **Architecture B — render/projection (lean toward this).** Canonical repo lives out-of-tree at `~/.arc-state/`;
  ARC renders its files into a gitignored, plain-files `.arc/` (no nested `.git`). You are unambiguously *in the code
  repo*; `.arc/` is just files; the state repo's `.git` is entirely outside your checkout. Matches ADR-022's
  record-canonical / markdown-is-a-projection decision and the battle-tested dotfile-manager shape. History browsing
  costs an `arc history <artifact>` wrapper (a `git log` over the backing repo).
- **Architecture A — nested repo / worktree.** `.arc/` *is itself* a checkout (or `git worktree`) of the state repo,
  gitignored by the code repo. Full git in place (free `git log -p`/blame on materialized files), but git's command
  context follows cwd (a `git commit` in `.arc/` targets the state repo — surprising), editors show two SCM roots,
  and nested repos confuse some tooling. Treats git files *as* the records, which fights ADR-022's projection model.

Lean **B** (idiomatic, clean editor story, ADR-022-aligned), accepting the `arc history` wrapper as the cost of
history-browsability.

### Freshness (read-staleness is contained, not eliminated)

Open-buffer staleness is real (research: every local-first tool bleeds here, and the only full fix is "own the
editor" — which ARC won't do without betraying ergonomics (a)). The resolution is **don't try to prevent stale
reads; make stale reads harmless:**

- **Version-checked writes (optimistic concurrency).** A stale read only causes harm via a *later write* (the
  lost-update bug). Every write carries the version token it read; if canonical moved, the write is rejected and
  reconciled, never silently clobbering. Git gives this natively (non-fast-forward rejection *is* conflict
  detection). With this, stale reads collapse to mere inconvenience.
- **Agent-side refresh is free.** ARC already syncs at session-init; a refresh step at ceremony fire-points is
  trivial. Deliberate-refresh on shared surfaces at access time is acceptable.
- **Per-editor freshness for materialized files** is a one-setting fix, not a blocker: editors prune *gitignored*
  paths from their watcher, so a materialized file goes stale in an open buffer until re-watched. Confirmed:
  Zed's `file_scan_inclusions` restores live buffer reload (not just search). Neovim/Emacs reload regardless;
  JetBrains via sync-on-activation; VS Code via watcher config; **Helix has no auto-reload (degraded)**. `.git/info/exclude`
  does **not** help — no editor honors it for watch/reload. ARC should **scaffold the per-editor setting at init**
  (`.zed/settings.json`, `.vscode/settings.json`), turning the tax into an owned setup step.

---

## Concurrency & Version History (the answer, not an open question)

Audit/history is **orthogonal** to concurrency — solving one does not give the other. The pragmatic shape for a
small self-hosted store (research-grounded), per state subtype:

- **Append-heavy shared records** (the shared inboxes / queues — ADR-020's "mutable shared state, unsolvable in-git")
  → **event-sourcing (append-only log).** Natural full audit trail; concurrency via optimistic append. This is the
  one genuinely-hard core that earns the backend. The log carries **removal / re-home events too** — the
  shared-inbox model's housekeep sweep is a second writer class beyond drain appends — so the shape is
  append-plus-tombstone, not pure append (2026-07-02, shared-inbox grooming).
- **Small structured records** (`meta-*` fields, priority/ordering) → **server-authoritative LWW + a history table.**
  Simple, sufficient; metadata conflicts are rare and often semantically resolvable.
- **Prose** (`draft-*`, `spec-*`) → **git merge/rebase** — the best text-merge tool there is, and ARC already drives
  it. (CRDTs/Automerge are overkill: good offline, weak audit, aimed at rich-text collab.)

This **closes the prior "concurrency mechanism" open question and the version-control hole** the original plan never
asked. "Untracked" never meant "unversioned": tier-2 keeps history in the backing repo (`arc history`); tier-3 keeps
it in the event log / version table.

### The genuinely hard problem

It is **not** the concurrency algorithm (solved above) — it is **multi-writer local-materialization freshness**: at
the shared tier your local view can be stale because *someone else* changed canonical, and no local-first tool fully
solves this without owning the editor. ARC's stance: version-checked writes prevent corruption; shared surfaces are
deliberate-refresh; your *own* edits are always fresh. Decide whether "fresh-on-your-writes, refresh-on-shared-reads"
is acceptable *before* committing to tier 3 — it is the load-bearing UX bet.

---

## Team Mode Subsumed

`team.enabled` today gates in-repo team coordination (identity-marker ownership, team-aware workflows). In a
backend-tier world, **multi-user teamwork is the multi-writer config of the materialized substrate** — in-repo team
mode on text files carries all the merge-mechanics problems the backend solves. In-repo team mode stays supported as
a bridge but is not the recommended path; the `team.enabled` axis collapses into "the backend is shared." This avoids
the matrix-explosion risk where every storage-tier × team-mode × pm-mode combo is a supported configuration.

---

## Self-Hosted Distributed (Deployment Shape)

Self-hosted does not mean local-network-only. The contemporary shape — single-binary or single-container service on
a VPS / home server / private cloud, behind TLS, reachable from anywhere — is well-established (Gitea, Plausible,
Sentry, Mattermost). Distributed teams access via internet; zero-trust orgs pair with a private VPN (Tailscale,
WireGuard). For a 5–10 person team: single Docker container, SQLite (or Postgres past ~50 users), static API token
auth (OIDC past ~20), reverse proxy for TLS, periodic DB+store snapshots. Hosted SaaS is **out of scope** — adopters
run their own backend.

---

## Operational Gotchas (designable, not blockers)

Surfaced in the 2026-06-10 pass; recorded so interim work and the eventual PRD confront them early.

1. **Cross-repo atomicity → eventual-consistency + heal, not 2-phase-commit.** A ceremony touching both code
   (tracked) and state (separate repo) is two commits in two repos. But we *want* code↔state decoupled, and partial
   failure is *drift, not corruption* (recoverable, version-checked writes block clobbers). The design is: each repo
   consistent on its own + a heal/reconcile step (ARC has the freshness/reconcile bones) + ordering only for the few
   order-sensitive ceremonies (don't archive state before code merges).
2. **The `specs` knob arm spans two repos per WU.** With specs tracked but meta/tasks materialized, a single WU's
   artifacts straddle repos, fragmenting the clean `git mv` relocatability. Argues for `none | all` only unless the
   middle clearly earns its cost.
3. **Worktree-foundation interaction.** Per-WU *code* worktrees + a state repo: under B, each worktree gets a synced
   `.arc/` cache from the one backing repo (manageable); under A, each needs its own state checkout (more complex).
   Live interaction (worktree foundation has shipped) — design explicitly.
4. **Contributor / provisioning.** New-machine setup = clone code + provision state — reuse Local mode's
   `init --local` / re-clone flow, not new. An external OSS contributor without state access gets no PM artifacts —
   **consistent with ARC's existing contributor model** (contributors already work within different boundaries) and
   **governed by the same storage config** (transparency-wanting projects track; privacy-wanting teams accept it).
   Rule: contributor flows must degrade gracefully when state is absent/private.
5. **`.gitignore` airtightness.** If `.arc/` is ever accidentally un-ignored, B leaks PM into the code repo and A
   creates a gitlink mess. A pre-commit guard asserting `.arc/` stays ignored becomes load-bearing for (c).
6. **Batch mutations over shared surfaces version-check per entry.** A long-running pass mutating many entries
   (the shared-inbox re-homing sweep) is the multi-writer materialization-freshness hard case in miniature —
   version-check at commit-of-decision per entry, never batch-at-end over a session-stale read
   (2026-07-02, shared-inbox grooming).

---

## Notes: zero-config entry point, not a permanent home

Git notes are the right call for **zero-config per-user state** (`SESSION-NOTES`, `WORKING-MEMORY`, `USER-INBOX`
today) — they version state that travels with the repo, no second repo to provision. But notes have intrinsic warts
for broader use (rebase-orphaning, weak durability/overwrite, clunky history browsing, contributor-surprise) and
**structurally cannot deliver (c)** (they live in the same repo). So notes are the **zero-config entry on the scaling
axis**, not pinned to `user/` forever: the separate-git-repo substrate can absorb per-user state too, trading
one-unified-mechanism against no-setup-required. Open sub-decision; don't pre-resolve.

---

## Forward-Compat Discipline

Discipline that keeps interim work composing toward this target lives in `strategy-storage-evolution.md` — the
interim **check-doc** (this plan is the north-star *target*; that doc is the discipline that points at it). Plans and
PRDs touching storage / multi-user / external integration / config axes self-check against it.

---

## Open Questions for Pre-PRD Detail Design

**Resolved by the 2026-06-10 pass** (moved out of open): concurrency mechanism (event-log / LWW+history / git-merge
by subtype); materialization model (render/projection, Architecture B); the version-control story ("untracked ≠
unversioned"); the read-staleness story (version-checked writes + per-editor freshness).

Still open:

- **Auth model.** Shared secret, OIDC, GitHub OAuth, self-issued JWTs. Bounded for self-hosted single-org; must feel
  idiomatic for dev-tooling deployment.
- **Distributed access transport.** HTTPS public vs private-VPN-only vs configurable; recommended deployment guidance.
- **Version pinning of `system/`.** Stays tracked (behavior pins to checkout) per § The line — but confirm no
  machinery genuinely wants backend storage.
- **Storage abstraction shape.** The contract between ARC and the backing store (file-system semantics over a git
  store is the likely shape given Architecture B). Affects what custom backends could exist.
- **Identity-and-project resolution.** How a backend install maps to project identity across machines; interaction
  with Local mode's project-ID resolution.
- **Interaction with Lite/minimal scaling.** Does the smallest configuration want backend storage, or stay
  in-repo / Local only?
- **Multi-writer materialization-freshness UX** (the hard one) — the precise refresh/heal contract for shared
  surfaces.

---

## Required Pre-PRD Research Pass

**Storage / freshness / concurrency buckets completed 2026-06-10** and folded into this plan: out-of-line-git state
(git notes is non-idiomatic and bespoke; a separate git repo is the idiomatic substrate); editor freshness of
materialized files (per-editor, fixable, Helix-gapped); concurrency-with-history (event-log / LWW / git-merge by
subtype; audit ⊥ concurrency); design-doc review out-of-tree (out-of-band is the accepted standard; building
PR-review is 6–10 weeks); local materialization pitfalls (conflict spam, open-buffer staleness — use app-aware sync,
never file-sync like Syncthing/Dropbox).

**Remaining for PRD-time:** self-hosted deployment/auth idioms in depth (Gitea/Plausible/Sentry class), library
landscape for the sync/materialization engine, and the multi-tenant/org-boundary model. **Anti-target:** anything a
team familiar with modern dev infrastructure would call "out of step." The bar is idiomatic alignment unless the
deviation is a genuine ARC value-prop.

---

## Upstream Dependencies

- **`prd-user-sync-ux.md`** — hardens the user-notes sync state machine the backend's sync layer extends. Not a hard
  dependency for PRD promotion, but the backend's sync composes more cleanly if it lands first.
- **Local mode (`draft-local-mode.md`)** — the backend *is* Local hosted; Local landing first is structurally
  important. Co-design the storage abstraction at Local's PRD time.
- **`operational-state-docs` (ADR-022)** — the record/projection engine the materialization layer renders through;
  storage-agnostic records lift into the backing store without reshaping.
- **Shift lifecycle (`plan-worktree-foundation.md` § Shift Lifecycle)** — metadata-in-place composes with backend
  materialization; landing first removes a design unknown.

---

## External Interchange — OKF Projection (forward-compat note)

Captured 2026-06-13 from an idiomatic-alignment exploration. Google's **Open Knowledge Format** (OKF, v0.1,
2026-06-12) and Karpathy's LLM-wiki describe the same markdown-frontmatter knowledge-base family ARC already
belongs to. OKF is a *format, not a platform*, designed around producer/consumer independence — which makes ARC a
natural optional **OKF producer** rather than something to reshape into OKF.

The clean insertion is **a projection target, not a native reshape**, and it composes directly with this plan's
model: ADR-022's record-canonical / markdown-is-a-projection + Architecture B (render/projection). If
materialization already renders records → markdown, an OKF bundle is just one more projection — emit the
`reference/` + project-knowledge layer (the part that *is* knowledge-base content), never the operational churn
(`meta-*`, `tasks-*`, inboxes). OKF conformance is a trivially low bar (every non-reserved `.md` carries
frontmatter with a non-empty `type`), and OKF's path-is-ID / type-is-frontmatter split means `type` derives
mechanically from ARC's filename prefix — so projection is cheap. **Projection-ready, not adopt-now:** the spec is
one day old; the value is keeping the option open, owned with `idiomatic-alignment`. See
`strategy-storage-evolution.md` § Relationship to Other Documents.

## Non-Goals

- **Hosted SaaS offering.** Self-hosted only.
- **Web UI / own document frontend as deliverable.** A future Path-C capability at most. The deliverable is
  markdown-on-disk-via-materialization plus CLI. Owning a frontend would betray ergonomics (a) (agent-native,
  editor-of-choice) — the whole reason to stay git-native rather than become Linear/Notion.
- **Forced migration of existing in-repo installs.** In-repo and Local stay supported; adopters choose the tier.
- **Per-tracker authoritative ownership of WU artifacts via `pm.mode: external`.** External tools stay integration
  surfaces, not canonical stores.

---

## Sequencing Intent

Long-running. Not next. Depends on substantial upstream work (user sync UX, Local mode, operational-state-docs,
shift lifecycle) and lands well after the 1.0 window. This plan exists primarily as the **forward-compat
reference** — interim work composes toward it without depending on it shipping soon.

### Blast-radius / migration audit (schedule sooner than later — not now)

Moving canonical storage out of the tracked tree is a **large foundational change** touching CLI internals (every
reader/writer that assumes tracked-`.arc/` paths), hooks, and most lifecycle workflows — substantial mechanical
migration work. It is doable, but the **blast-radius audit should be scheduled relatively soon** (well before
implementation) so interim WUs stop accreting tracked-`.arc/` assumptions that the migration must later undo. The
audit itself is its own scoped effort (a future WU): enumerate every `.arc/`-path / `git log .arc/...` /
tracked-state assumption across `lib/`, hooks, and `system/workflows/**`, and size the migration. **Not now** — but
the forward-compat discipline (below) is the interim guard until it runs.

---

## Backlog Compat Audit

Status of current backlog plans / PRDs against the target. Captured 2026-05-02; flag-at-PRD items get attention at
their own promotion time. (Not re-audited in the 2026-06-10 pass — the model sharpened, the per-item verdicts stand.)

| Item                                      | Status      | Notes                                                                                                                                            |
|-------------------------------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `draft-local-mode.md`                     | Co-design   | Local mode shares substantial structure with backend tier but was designed in vacuum. Scope storage-abstraction sketch at Local PRD time.        |
| `plan-coord-probe.md`                     | Compatible  | Read-only advisory probe. Model extends naturally to "query the backend for where I'm working." No rework.                                       |
| `plan-worktree-foundation.md`             | Flag at PRD | Currently designed around in-repo git worktrees. In backend tier, worktree-per-WU concept maps to per-WU materialized views. Assess at PRD time. |
| `plan-concurrent-work-conventions.md`     | Flag at PRD | Currently scoped to same-identity solo concurrency. Backend tier introduces multi-developer concurrency. Boundary needs review at PRD time.      |
| `plan-agile-wu-lifecycle.md`              | Compatible  | Three-tier WU model is storage-agnostic. Tiered ceremony applies regardless of where artifacts live.                                             |
| `plan-completion-status-consolidation.md` | Compatible  | Status-file-as-archive-record is a lifecycle change, not a storage change. Backend tier handles archived status files like any other artifact.   |
| `plan-roadmap-evolution.md`               | Compatible  | ROADMAP form-factor is independent of storage. In backend tier, ROADMAP is one of the artifacts the backend stores.                              |
| `plan-arc-plan-conductor.md`              | Compatible  | Planning workflow conductor is mostly storage-agnostic. Status-file creation point composes with materialization layer.                          |
| `plan-quality-gate-hooks.md`              | Compatible  | Hooks are local to each developer's clone; orthogonal to backend storage.                                                                        |
| `plan-review-method-family.md`            | Compatible  | Review methods are workflow-level; orthogonal to storage.                                                                                        |
| `plan-post-release-methodology.md`        | Compatible  | Living collection; items get B-compat assessment at promotion-to-PRD time.                                                                       |
| `plan-docs-content-sweep.md`              | Compatible  | Docs site content; orthogonal to backend storage.                                                                                                |
| `plan-wu5-public-release.md`              | Compatible  | Public release infrastructure; orthogonal.                                                                                                       |
| `plan-docs-site-refresh.md`               | Compatible  | Docs site infrastructure; orthogonal.                                                                                                            |
| `plan-arcd-rebrand.md`                    | Compatible  | Branding; orthogonal.                                                                                                                            |

**Flag-at-PRD items** are not blocked by this plan. Their authors should consult `strategy-storage-evolution.md` at
PRD time and confirm the design composes with the materialized-git-backing-store semantics. None require rework today.

**Scalable-core (`plan-scalable-core.md`, ADR-020).** ADR-020 sharpens scope rather than flagging it: the backend is
the canonical store for *mutable shared state* (inbox drains, priority/ordering), unsolvable in-git by git's nature
(→ event-log, above). Derived shared state (ROADMAP) is solvable in-git via serialization-point regeneration and is
not backend-dependent. Reinforces the calibration note — the backend's load-bearing value is canonical mutable
storage + privacy + clean history, not sync generally.

## Coordination — ADR-022

ADR-022's record layer is forward-compatible with the backend — structured records lift without reshaping, and its
record-canonical / markdown-is-a-projection decision is precisely Architecture B's materialization model. The mutated
managed docs (inboxes, `WORKING-MEMORY`, `USER-INBOX`) are backend-canonical eventually; ADR-022's interim notes-sync
assignment is the tier-2 bridge, not a terminal home. See `adr-022-managed-operational-state-documents.md`
§ Coordination.

**Entry-granularity requirement (2026-07-02, shared-inbox grooming):** shared-mutable members (the inboxes) must be
modeled as **sets of slug-keyed entries with entry-level operations** (append / remove / re-home), never a
whole-document state with file-level reconcile. File-granular version-checked writes would wholesale-reject a sweep
racing a drain; entry-granular operations map 1:1 onto the event log above, making the backend lift an
operation-mapping rather than a re-derivation. This is a requirement on the record layer's shape, not on where
records live.

**Direction layer compose note (2026-07-02, goal-aware-direction grooming):** `VECTOR.PROJECT` / `VECTOR.USER`
join the managed members. The project vector is **low-churn authored shared state** — small-structured-records
class (LWW + history suffices; it is not the append-heavy event-log case), entry-granular and slug-keyed,
serialized base-branch writes interim, version-checked writes at the shared tier; its authority model
(maintainer-gated write + per-target owner + review-as-ratification) maps onto backend server-side auth with no
model change. `VECTOR.USER` stays notes-backed per-user state (the zero-config entry tier). Composed personal-view
membership is derived at render time (resolve-don't-store), so the backend stores only authored targets/intents.
