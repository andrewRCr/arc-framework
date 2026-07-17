# Draft: Local Mode

**Purpose:** Enable ARC in repositories where the developer doesn't control the tracked space — with `.arc/`
living untracked in the working tree, backed by a private per-project git store. Local mode is **tier-2 of the
git-backing-store substrate** (`strategy-storage-evolution.md` § The Storage Model): the same
canonical-store-materialized-locally shape the ARC backend (`draft-arc-backend.md`) hosts and shares at tier-3.
Local landing first is structurally important — the backend is mostly "Local, hosted."

- **State:** Draft — rough. Consolidated 2026-07-03 from `draft-arc-modes.md` (this WU's prior identity); the
  carried design predates the substrate reframe and is re-validated section by section below.
- **Created:** 2026-04-01 (as ARC Operating Modes; re-scoped to Local Mode 2026-07-03)
- **Last Updated:** 2026-07-03
- **Origin:** Developer experience gap at the constrained end of the adoption spectrum — work repos with strict
  tooling policies, OSS contributions where personal tooling doesn't belong, trial runs on repos the developer
  hasn't committed to adopting ARC in. The original WU also carried "ARC Lite"; ADR-020 dissolved Lite into the
  scaling axes (invariant floor + guided opt-down), so Lite stopped being a deliverable of this WU and its
  content was cut at the 2026-07-03 re-scope. Shift lifecycle was extracted earlier to worktree-foundation
  (shipped). Local remains the live deliverable.

**Co-design mandate.** Local and the backend are the same substrate at different multiplicities, not cousins to
reconcile. This draft's decisions were first made before that was recognized and may carry single-user
assumptions — the [Revalidation register](#revalidation-register) below tracks them. At PRD promotion, run
`strategy-storage-evolution.md` § Self-Check and scope the **shared storage-abstraction contract** into the PRD
(the backend PRD later validates and refines the same abstraction). **Permanence note (2026-07-17 grooming):**
Local's machinery is not a stepping stone the Shared tier subsumes — under the scope model
(`draft-arc-backend.md` § Scope Model), **user scope runs Local-style per-user private stores permanently at
every tier**; only project scope promotes to the shared store. Local's store mechanics are a lasting component of
the substrate, which raises the stakes on getting them right here.

---

## Notes retirement — an explicit deliverable of this WU

*(Integrated from the inbound buffer at the 2026-07-17 storage-substrate grooming.)* User-notes state becomes an
ordinary artifact class of the backing store, and the notes machinery retires explicitly: `refs/notes/arc/user/*`,
sync-state refs, and partial-push markers are deleted; a one-time import moves existing content; the `arc user`
family repoints at the store (same verbs, store transport — § Command family). The sync state machine,
version-checked writes, and failure taxonomy carry over — they are substrate-independent investments. Stop-loss
rule in force until migration: no new notes-specific machinery beyond keep-the-lights-on. Destination per the
scope model (`draft-arc-backend.md` § Scope Model): the **per-user private store** — user state never enters a
shared project store at any tier, which is strictly more private than notes riding the shared origin repo today.

---

## Problem / Motivation

ARC's in-repo tier assumes the developer can commit `.arc/` to the project's tracked tree. Four adoption
contexts break that assumption:

- **Policy-constrained repos** — work projects with strict tooling policies where personal methodology files
  cannot land in the tracked space.
- **OSS contribution** — personal tooling doesn't belong in someone else's repository.
- **Trial runs** — evaluating ARC on a repo the developer hasn't committed to adopting it in; Local plus
  minimal scaling depth is the lowest-commitment first-install story.
- **Privacy and multi-machine** (added by the substrate reframe) — planning artifacts are public when the repo
  is, and multi-machine work wants centralized canonical state. These are the backend draft's (b) and (c)
  drivers; Local delivers both for the single-user case.

**Design philosophy: does less only where it has to, just as reliably.** Local sacrifices only what
no-repo-footprint literally forces. Everything else — execution discipline, quality gates, lifecycle workflows,
hooks, session management — works the same way, by the same rules, with the same reliability. Where Local
appears to degrade something, interrogate the degradation: either find a mechanism that preserves reliability
or honestly name the cost (e.g., the editor quick-open gap below). No silent degradation.

## The reframe: store-canonical, projection-materialized

The single structural correction the substrate reframe forces on the carried design. The original Local model
and the target share the same parts but **invert authority**:

| | Original Local design (2026-04) | Substrate target (tier-2) |
| --- | --- | --- |
| Canonical state | working-tree `.arc/` | the backing repo (`~/.arc-state/{id}/`) |
| The store is | a best-effort backup snapshot | the canonical store |
| `.arc/` on disk is | the state itself | a rendered projection (Architecture B, ADR-022) |
| Sync shape | whole-tree `git add -A` snapshot at handoff | record-level writes, version-checked |
| Stale-read safety | n/a (single writer, single machine) | version-checked writes reject clobbers |

Consequences for the carried design, worked through the sections below:

- **Snapshot-at-handoff dies as the write model.** Batch whole-tree snapshots over a session-stale read are
  exactly the anti-pattern `draft-arc-backend.md` Gotcha 6 names once the store is shared. The *firing points*
  survive (handoff remains the canonical moment state must be durable); the *mechanism* becomes record writes
  through the materialization layer.
- **The non-bare-store rationale must be re-derived.** Non-bare was chosen because `git add -A` needs a working
  directory to scan. Under render/projection the sync is not a working-directory commit, so the store shape
  (bare vs non-bare) is decided by the materialization engine's needs, not by the snapshot mechanism.
- **"Nothing in ARC's core machinery needs to change" no longer holds.** True for the backup model; under
  store-canonical, every writer routes through the storage abstraction (the backend draft's blast-radius audit
  expects real migration work). Readers keep plain-file semantics — that is the point of materializing.
- **Restore/rebuild semantics need restating in projection terms.** "Rebuild the store from `.arc/`" rebuilds
  canonical from projection — still right as disaster recovery, but it is now a recovery escape hatch, not a
  symmetric peer of restore.

What survives unchanged: `.arc/` stays at its expected working-tree paths (agents, hooks, and workflows keep
plain-file semantics — the heart of Architecture B), the store location and keying, the failure taxonomy, the
privacy model, exclusion mechanics, re-clone recovery, and the UX guarantees.

## Carried design (validated 2026-04, re-read under the reframe)

The concrete mechanisms below are this draft's rescue payload — `strategy-storage-evolution.md` § Holistic
Design points at them ("project-ID resolution — mostly designed in Local"; "`arc init --local` idempotency +
re-clone detection is reused for backend provisioning") and no other document carries them. Items marked
**[revalidate]** appear in the register below.

### Exclusion mechanism

- **Primary: `.git/info/exclude`, automated via CLI.** Repo-local, untracked, zero footprint; the industry norm
  for per-user tooling. Lost on re-clone (see Re-clone UX — routine recovery, not degradation).
- **Opt-in: tracked `.gitignore` line** via `arc init --local --shared-gitignore`, for teams that explicitly
  welcome tool-specific entries. Survives re-clones naturally.
- **Rejected: global gitignore** — machine-wide blast radius breaks coexistence with tracked ARC installs on
  the same machine. Not offered.
- Init guides the choice by environmental constraint, not taste.
- **[revalidate]** The primary/secondary ordering encodes a single-user assumption; at the shared tier a
  tracked `.gitignore` line plausibly becomes the team default. Also integrate the backend draft's Gotcha 5:
  a pre-commit guard asserting `.arc/` stays ignored is load-bearing for the privacy guarantee, and
  `.git/info/exclude` is not honored by editor watch/reload (the backend's freshness findings) — the exclusion
  and editor-scaffolding decisions interlock.

### Project identity and re-clone UX

**Pinned-ID-file-first precedence** with a fallback chain:

1. **Pinned project ID file** (`.arc/system/.internal/project-id`) — if present, its contents ARE the project
   ID; the chain is skipped. File presence is the stickiness mechanism.
2. **Fallback chain** (only when the pin is absent), first match wins: `origin` remote-URL hash →
   first-commit hash → generated UUID (written to the pin file at creation, so it short-circuits thereafter —
   covers the zero-history trial-run case).

The pin/no-pin asymmetry is deliberate: the UUID case pins automatically; the first-commit case does **not**
write the pin, because its absence is what lets auto-detection fire when the repo later acquires a remote. On
every resolution, the resolver also checks whether a store exists at any key a *prior* repo state would have
resolved to; on a hit it offers a three-way prompt before proceeding — **[M]igrate** (copy content to the new
key; old becomes a named orphan), **[S]tay** (write the old key to the pin file — a one-time user-confirmed
stickiness conversion), **[L]ater** (use the old key this session, ask again next).

**`arc project-id migrate`** — the explicit verb for proactive migration: computes old and new keys; refuses if
a store already exists at the new key (concurrent cross-machine migration guard — adopt it via
`arc backing pull` instead); **copies, never moves** (an orphan warning is louder than silent loss); rewrites
or clears the pin; reports the orphan for manual cleanup; never touches the store's remote config.

**Re-clone detection** — three conditions: computed ID matches an existing store, AND `.arc/` absent/empty, AND
the exclude entry missing. Any command detects and halts with a pointer; **only idempotent `arc init --local`
restores** (keeps filesystem mutation out of read-only-feeling commands). Recovery sequence: re-write the
exclusion → rematerialize `.arc/` from the store → re-install hooks → report. Idempotency makes recovery a
re-run of the original command, not a separate verb — and the same flow is earmarked as the backend's
provisioning / new-machine path.

- **[revalidate]** Bootstrap circularity under the projection model: the pin lives *inside* the `.arc/` that
  materialization keys off the pin. Needs an ordering story (e.g., the pin is the one file that is genuinely
  local-first, or keying moves outside `.arc/`).
- **[revalidate]** Remote-URL and first-commit keys are per-clone-stable, not per-*project*-stable across
  users; tier-3 needs cross-user ID stability the chain never had to guarantee.

### Backing store

- **Required, not opt-in.** Losing local ARC state is catastrophic; opt-in backup means the developer who
  doesn't read carefully loses everything. Zero configuration, zero maintenance, auto-created at init.
- **Location:** `~/.arc-state/{project-id}/`, a standard git repo. **[revalidate]** Bare vs non-bare is
  re-decided by the materialization engine (see the reframe table); the original non-bare rationale was
  snapshot-mechanism-specific.
- **Firing points:** session handoff (canonical); `arc update` (a successful update — including three-way-merged
  Configurable files — persists before the command returns, closing the home-dir-loss window on the user's
  merge decisions); worktree/context transitions as they exist post-worktree-foundation. All firing points obey
  one constraint: **fast, seamless, invisible**.
- **Failure handling: handoff proceeds on sync failure.** The guarantee is *best-effort durability, visible
  when degraded* — never an atomic two-phase commit that blocks closing a session. Three failure classes:
    - **Class A — failed before the store accepted the write** (disk full, permissions, lock contention).
      Store stays clean; the next write rolls forward. Automatic recovery.
    - **Class B — store write landed, push to remote failed** (transient network, auth). Store is ahead of its
      remote; the next successful push catches up. Automatic recovery.
    - **Class C — non-fast-forward divergence** (another machine pushed). Writes to the shared remote refuse
      until resolved. **Not** automatic. **[revalidate]** Manual git-in-the-store resolution is the deliberate
      single-user stance (a dedicated verb would cover strictly fewer cases than `git` in the same directory);
      at tier-3 this is precisely what the backend's coordination layer must automate — harmonize the taxonomy
      (Local's transient / push-failed / divergent vs the backend's auth-expired / server-unavailable /
      conflict-at-backend).
- **Health surface:** `arc backing status` is the canonical degraded-state source — store existence and git
  validity, HEAD resolution, cheap integrity check (`git fsck --connectivity-only`-class), last-sync time,
  staleness, failure class if degraded, remote config, permission sanity check; summary verdict one of
  `healthy` / `degraded` / `missing` / `corrupt`.
- **Rebuild path:** `arc backing sync --rebuild` (exact shape implementation-phase) re-initializes a destroyed
  or corrupt store from current `.arc/` content, with a loud prior-history-lost warning. **Asymmetric recovery
  rule:** `.arc/` intact + store broken → rebuild from `.arc/`; store intact + `.arc/` broken → restore from
  the store; both broken → remote or data loss. (Under the reframe, rebuild-from-projection is disaster
  recovery, not a peer of restore.)
- **Cross-machine remote: opt-in.** Configure a git remote on the store (private repo); push per the sync
  policy; `arc init --local` on another machine detects via project ID and offers bootstrap. Zero extra steps
  for single-machine users.
- **[revalidate] Store contents under the tracked/materialized line.** The original design snapshotted all of
  `.arc/` ("backup is comprehensive; restoration is exact"). The substrate's line says machinery (`system/**`)
  is *tracked-with-the-code* — but in Local mode nothing ARC is in the code repo. Decide whether the store
  carries machinery (store-complete restoration) or only state + authored design, with machinery
  re-materialized from a pinned CLI/package version. Interacts with re-clone recovery and `arc update`.

### Privacy model

Follows idiomatic CLI-tool practice (2026-04-13 survey, § Research findings); three surfaces:

- **Filesystem permissions.** Store created mode 700 on Linux/macOS (OpenSSH / GnuPG / AWS-CLI precedent).
  `arc backing status` warns above 700 but runs — hard-refuse is reserved for key-material tools; warn-but-run
  is the proportionate posture for methodology content. Windows inherits user-only home-dir ACLs; ARC does not
  set ACLs explicitly.
- **Remote privacy is documentation-only.** A configured remote MUST be private; ARC does not verify
  programmatically — zero surveyed tools do (restic, borg, git-crypt, chezmoi, pass, yadm), and verification
  would need host-specific APIs with no self-hosted story. `arc backing push` prints a loud one-line reminder
  on first push to a new remote, then trusts the user.
- **No at-rest encryption.** ARC's content model matches Obsidian / Logseq / git — plaintext on disk,
  encryption delegated to the disk layer (FileVault, LUKS, BitLocker). Power users with elevated threat models
  wire `git-crypt` manually inside the store (it is a standard git repo); chezmoi's optional-encryption model
  is the reference if opt-in encryption ever earns follow-on work.

### Command family

The durability layer is a purpose-built family, **`arc backing *`** — `sync`, `restore` (divergence guard:
refuses when `.arc/` carries changes the store hasn't accepted, without `--force`), `push` / `pull` (pull is
ref-only; restore is the separate deliberate replay step), `status`, and the rebuild path. No transparent
redirect of `arc user *`: the notes family is a transport for the gitignored user subtree anchored on HEAD; the
backing store is whole-project durability keyed on project ID — different scopes, anchors, failure modes. In a
Local install the notes family errors with a pointer to `arc backing --help`; the unifier lives at the workflow
layer (handoff's persist step branches on the storage axis and invokes the mode-appropriate family). The
notes-push policy key keeps its semantics with per-mode consumers.

- The original design placed these under the `arcd` namespace from the ARCd-rebrand WU; that rebrand is
  provisional and presumed dead — **this draft assumes plain `arc`** throughout.
- **[revalidate]** Separate-family-vs-one-contract is under pressure from the co-design mandate: the storage
  abstraction ("the `arc user` family's shape extends to artifact storage" —
  `strategy-storage-evolution.md` § Holistic Design) argues for one storage-backend interface even if the CLI
  verbs stay distinct. Decide at the abstraction-contract design, not per-verb.

### Session-init pre-check

Init's read-side counterpart to handoff's persist step, gated on the storage axis:

1. **`.arc/` missing/empty → halt**: "Local-mode install detected but `.arc/` is missing. Run
   `arc init --local` to restore from the backing store." No document set exists to load.
2. **Query `arc backing status`** — non-fatal.
3. **Surface degraded state in orientation** (class, staleness, recommended recovery command).
4. Continue normal init unless step 1 halted.

The halt/warn split is deliberate: missing `.arc/` makes proceeding impossible; a degraded store compromises
durability but not the session. `arc backing status` is the single query point — no duplicate state markers.
(Mechanism note: the original spec delivered this via install-time `arc:if` template gating; the delivery
mechanism is re-decided by whatever workflow-composition machinery ships — see `composable-workflows`.)

### Zero-fingerprint commit footer

Local mode's commit-msg hook enforces a **descriptive freeform** context footer (`Context: <description>`)
instead of the tracked-mode task-reference format — the discipline (every commit explains its context) survives
with zero ARC fingerprint in history visible to teammates. Delivered by the established
downstream-key-at-install-time pattern: the Local install renders the footer-policy config keys to the freeform
pattern; hooks stay axis-agnostic at runtime, branching only on already-resolved config keys, never on the
storage axis itself. Not user-configurable within Local — it is the privacy guarantee, not a preference.
(Coordinate with the footer-grammar home in the `commit-format` / `commit-footer` methods so the freeform
pattern registers as a legitimate variant, not a divergence.)

### Config identity (storage axis)

The storage axis is recorded in the install manifest (it determines what exists in an install — role
meaningfulness, footer policy, backing infrastructure), not in runtime config; consumers read already-resolved
downstream keys. Carried mechanics, to rebase onto whatever config schema `scalable-core` ships:

- Manifest field + flattened key for the axis; legacy manifests migrate to the tracked/in-repo value (the
  universal pre-axis reality; the same schema-bump + legacy-migration pattern the original design specified).
- **Non-interactive default: in-repo.** Principled asymmetry: the storage axis has a true back-compat default,
  so `--yes` without a flag proceeds in-repo rather than erroring (every CI invocation would otherwise need a
  flag to preserve existing behavior). Interactive prompt follows the equal-peers doctrine — no pre-selection,
  work-shape discriminators ("I control the repo and `.arc/` belongs in it" vs "policy-constrained / OSS /
  trial"), transition path named to reduce commitment anxiety.
- Flags: `--local` / `--tracked` (or successor names), `--shared-gitignore` gated on local.
- No combinatorial recipe buckets; cross-axis needs resolve at content-composition time, single-key conditions
  only (the AND-grammar deferral holds until a real second case surfaces).
- **[revalidate]** The original two-value enum (`local | tracked`) fails the storage-evolution Self-Check: the
  substrate is three tiers (in-repo | Local | backend). Shape the axis so the hosted tier is an extension, not
  a migration (e.g., a tier value or a store-locator, not a boolean).

### Role, team, and contributor interactions

- **Role is a tracked-tier concept.** `maintainer` / `contributor` (ADR-014) differentiates artifact ownership
  where `.arc/` is visible in the repo. Local installs omit role entirely; session-init skips role resolution;
  role-branching workflows default to the non-contributor path. **[revalidate]** at tier-3, where contributors
  on a shared store re-enter.
- **Team toggle forced off in Local — [revalidate].** "Local is solo by definition" was the original stance;
  the substrate reframe makes team the *multi-writer configuration of the same store* (tier-3), so solo is a
  tier property, not a forbidden combination. Note the `team.mode → team.enabled` rename remains this WU's
  owned disposition per ADR-020 — resolve its landing (here, or re-route to scalable-core's config reform)
  during grooming.
- **Local vs contributor mode: alternatives selected by upstream context, never stacked.** Upstream not an ARC
  project → Local. Upstream is an ARC project → contributor mode (piggybacks upstream's gitignored
  `user/{identity}/`; no collision, no second store needed). Nested Local inside an ARC upstream is explicitly
  unsupported. Derivation: `analysis-modes-contributor-lifecycle-stress-test.md` § S6. **[revalidate]** The
  rule's premise (upstream `.arc/` is tracked and collides) weakens when the upstream itself runs a
  materialized tier — re-derive against materialized upstreams, and compose with the backend draft's Gotcha 4
  (contributor flows degrade gracefully when state is absent/private).

### Editor and tooling surface

Three surfaces behave differently under a gitignored `.arc/`:

- **Agent file machinery (Read/Grep/Glob) is unaffected** — explicit paths bypass editor indexing; core ARC
  operations work unchanged. Session-init scaffolding gives the agent full path discoverability (index docs,
  filename conventions), so natural-language references resolve without any editor picker. This
  agent-scaffolding argument is load-bearing for ergonomics at *every* materialized tier, not just Local.
- **Explorer views show untracked files** in every mainstream editor — `.arc/` stays visible in the sidebar.
- **The residual cost is quick-open / `@`-mention pickers** in gitignore-respecting editors (notably VS Code).
  The 2026-04-13 survey (Cursor, SpecStory, Aider, Continue, Zed, VS Code, JetBrains AI Assistant, Dendron,
  Obsidian) confirms an intrinsic category tradeoff — every gitignored-personal-tooling tool accepts it; VS
  Code issues [#103570][vscode-103570] and [#43505][vscode-43505] closed unresolved; Zed's
  `file_scan_inclusions` is the sole clean path-scoped mitigation.
- **[revalidate] Merge with the backend's freshness findings into one per-editor matrix.** The backend draft
  identified the *separate* stale-open-buffer problem (watchers prune gitignored paths; Zed's same setting
  restores live reload; Helix has no auto-reload; `.git/info/exclude` is honored by no editor's watcher) and
  decided ARC **scaffolds the per-editor settings at init** (`.zed/settings.json`, `.vscode/settings.json`).
  The two analyses assign different jobs to the same settings — harmonize picker-visibility + buffer-reload
  into one owned setup step.
- **Tooling asymmetry.** Project linters/tests that glob will see `.arc/` on dev machines but not on CI or
  fresh clones. This is the no-repo-footprint guarantee, not a defect: exclude untracked ARC paths in project
  tooling if symmetry matters; do not install Local in repos where CI depends on ARC operations.
  **[revalidate]** "CI sees zero ARC content by design" is single-user-shaped; a tier-3 team may legitimately
  want CI-visible state — gate by tier, don't hard-code.

### Init preconditions

`arc init` (any tier) requires a git repository (hooks live in `.git/hooks/`; Local also writes
`.git/info/exclude`). In a non-git directory, prompt-to-init: "This directory is not a git repository. ARC
requires git for hooks and related setup. Initialize git now? [Y/n]" — default yes; on yes run `git init` and
proceed (the UUID key fires in Local, zero history); on no, exit cleanly with remediation. Auto-init-without-
prompt rejected (mutates beyond stated intent); hard-refuse rejected (hostile on quick-start paths).

### Tier transitions

The original Local → tracked upgrade (remove exclusion, `git add .arc/`, switch footer policy, commit) is
**mechanically dead under the projection model**: working-tree files are projections, so `git add .arc/` would
track renders while canonical history stays in the store. What survives is the **requirement**: cheap,
content-continuous, no-rewrite transitions along the storage axis — in *both* directions (in-repo → Local is
the more important direction in the new world: an existing tracked project adopting privacy/multi-machine) —
plus a third transition surface the substrate adds (`storage.track_design_docs` moves design docs between
repos; backend Gotcha 2). No document currently designs tier transitions; this WU owns the tier-1↔2 pair and
feeds the abstraction the backend's provisioning reuses. Per-axis independence and no composite shortcuts
(each transition its own confirmed invocation) carry over as principles.

### Storage-tier fit communication

The framework does not detect storage-tier mismatch or nudge transitions — **no detect-and-advise** (the
framework never counts-and-advises on WIP, complexity, duration, or fit; upfront clarity plus easy transitions
instead; if real pressure emerges, design against evidence). Fit is communicated at coordinated touchpoints:
the init storage prompt (equal peers, work-shape discriminators, transition path named), agent briefings
(passive knowledge — answers "should I switch?" when asked, never volunteers it), docs overview and
troubleshooting pages ("my planning artifacts are public", "I work on two machines", "I can't add files to
this repo" → tier answer + transition path). Same substantive claims at every surface; copy is
implementation-phase. This redoes for the storage axis the job the dissolved mode-fit section did for
Lite/Full — nothing else owns it.

## Revalidation register

The single-user assumptions and reframe collisions the co-design must resolve — the `strategy-storage-evolution.md`
§ Holistic Design "validate they generalize" obligation, made concrete. Each also appears inline above.

1. **Authority inversion** — snapshot-at-handoff → version-checked record writes; restate sync, restore,
   rebuild, and the non-bare rationale in projection terms (Gotcha 6: never batch over a session-stale read).
2. **Store contents** — does the store carry `system/**` machinery, or state + design only with machinery
   re-materialized from a pinned package version?
3. **Storage-axis shape** — two-value enum fails composability with the four-point axis
   (in-repo | local | shared | coordinated, per the 2026-07-17 tier split); shape the axis so the shared and
   coordinated points are extensions, not migrations.
4. **Team toggle** — forced-solo is a tier property, not a forbidden combination; settle the
   `team.mode → team.enabled` rename's landing.
5. **Command family vs one storage-abstraction contract** — decide at the contract, not per-verb.
6. **Class-C divergence stance** — manual-git is right for tier-2. Under the tier split: the Shared tier
   auto-resolves routine record divergence (version-checked push-retry over entry-granular records); manual-git
   remains the prose/deep-divergence escape; automation beyond that is the Coordinated tier's job
   (`arc-coordination-service`). Harmonize the failure taxonomies across all three.
7. **Project-ID generalization** — pin-file bootstrap circularity under materialization; cross-user ID
   stability at tier-3.
8. **Exclusion ordering at the shared tier** + Gotcha 5 ignore-guard + editor-watcher interlock.
9. **Editor matrix** — merge picker-visibility (here) with buffer-reload/freshness (backend) into one
   init-scaffolded, per-editor story.
10. **Contributor-vs-Local selection rule** against materialized upstreams; compose with contributor
    graceful-degradation (Gotcha 4).
11. **CI visibility** — tier-gated, not hard-coded zero.
12. **Single-active-unit enforcement is gone, not carried:** the original invariant shipped mode-universal as
    the single-owner-WU model, and its enforcement mechanism (task-list `Status`-header scans) died with WOR's
    meta-file model; worktrees now answer multi-stream work. Nothing to port — noted so it isn't rediscovered
    from the old draft.

## Inherited obligations

- **Pre-PRD Local-axis content audit** (carried from the original WU's audit commitment): sweep the framework
  strategies and surfaces for storage-axis drift before PRD authoring — known items: the session-state
  portability treatment in `strategy-session-operations.md`, the context-footer row in
  `strategy-configurability-architecture.md`, QUICK-REFERENCE command-family branching, agent-briefing
  session-state descriptions. The dissolved Lite audit's method (classify by content, not concept) applies.
- **Contributor-lifecycle gap absorptions** — the solo-dev audit absorbed gaps G2, G3, G5, G7, G11, G13, G14
  (`analysis-modes-contributor-lifecycle-stress-test.md`) into the original WU's scope. Verify each either
  shipped with the intervening reforms (worktree-foundation, single-owner-WU, out-of-wu-entry) or re-homes
  (candidates: this WU's contributor interaction above; the `contributor-path` WU). Not yet done.
- **Storage-abstraction co-design** at PRD promotion, per the mandate in the header.

## Unknowns and Assumptions

- **Materialization engine dependency.** Architecture B renders records → markdown; that engine is
  `operational-state-docs`' (ADR-022) territory. Assumption: Local's PRD consumes it rather than building a
  parallel renderer. If ODS sequences later, Local either waits or ships a transitional file-copy
  materialization that preserves the store-canonical contract — decide at PRD.
- **Session-init pre-check delivery mechanism** — depends on the workflow-composition machinery
  (`composable-workflows`); the original install-time `arc:if` delivery is one option, not a commitment.
- **Config-schema landing zone** — the storage axis rebasés onto scalable-core's reformed schema
  (Planning-Module toggle + tracker pointer + `archive.preserve`); key names and prompt plumbing follow it.
- The adoption-context value prop (policy-constrained / OSS / trial) is assumed durable; the substrate adds
  privacy/multi-machine but does not replace those cases.

## Research findings (carried)

- **Editor `@`-mention precedent** (2026-04-13 survey: Cursor, SpecStory, Aider, Continue, Zed, VS Code,
  JetBrains AI Assistant, Dendron, Obsidian): gitignored personal tooling universally accepts the picker cost;
  no editor-layer universal fix; Zed `file_scan_inclusions` is the sole clean path-scoped option; VS Code
  [#103570][vscode-103570] / [#43505][vscode-43505] closed unresolved.
- **CLI state-directory practice** (2026-04-13 survey: OpenSSH, GnuPG, AWS CLI, kubectl, `gh`, Docker, npm,
  rclone, restic, borg, pass, git-crypt, chezmoi, Obsidian): `chmod 700` at creation is idiomatic (AWS CLI
  adopted post [#7369][aws-7369]); warn-but-run is proportionate below key-material sensitivity; remote-repo
  privacy is documentation-only ecosystem-wide (zero tools verify programmatically); at-rest encryption is
  category-dependent and ARC's category (notes/docs: Obsidian, Logseq, git) stores plaintext and delegates to
  disk encryption; [chezmoi's optional encryption][chezmoi-encryption] is the reference for opt-in follow-on;
  [`git-crypt`][git-crypt] covers the power-user case today.
- **`.git/info/exclude` on re-clone**: no native git mechanism preserves per-repo excludes across clones —
  re-clone is a routine recovery event by design, which is why the store doubles as the detection signal and
  init is idempotent.

## Scope Estimate

Large (week+). CLI surface (`arc backing *`, project-ID resolution, init/recovery flows), the materialization
integration, config-axis plumbing, hooks (footer policy, ignore-guard), session-lifecycle seams (pre-check,
persist step), editor scaffolding, and the content audit. **Depends on:** `operational-state-docs` (the
record/projection engine — see Unknowns), scalable-core's config-schema reform (landing zone), and
`composable-workflows` (delivery mechanism for axis-gated workflow content). **Co-designs with:**
`arc-backend` (the shared storage abstraction; this WU leads, the backend validates). The 2026-04 design
detail above is the PRD seed; the revalidation register is the PRD's first work item.

---

[vscode-103570]: https://github.com/microsoft/vscode/issues/103570
[vscode-43505]: https://github.com/microsoft/vscode/issues/43505
[aws-7369]: https://github.com/aws/aws-cli/issues/7369
[git-crypt]: https://github.com/AGWA/git-crypt
[chezmoi-encryption]: https://www.chezmoi.io/user-guide/encryption/
