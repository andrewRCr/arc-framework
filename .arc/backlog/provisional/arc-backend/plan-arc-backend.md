# Plan: ARC Backend (north-star)

**Purpose:** Capture the long-term architectural target — ARC's own self-hosted backend for canonical
WU-artifact storage outside the project repo — as the north star against which interim work composes.
This plan establishes the shape, audience fit, and forward-compat discipline; detailed design defers
to a future PRD with substantial pre-work research.

- **State:** Captured (north-star reference; not active planning)
- **Created:** 2026-05-02
- **Origin:** Surfaced during cross-machine planning discussion 2026-05-02. Concern: current ARC
  architecture is heavily shaped around solo-dev arc-in-git; existing scaling stories
  (`pm.mode: external`, coord-probe, planned Local mode) cover narrow cases as workarounds rather
  than a coherent solution for the "out-of-repo canonical storage with concurrency primitives" gap.
  Conversation surfaced that the gap matters not just for industry-scale teams but for several
  adopter shapes a solo-focused architecture doesn't serve.

---

## Problem / Motivation

ARC's canonical-store assumption today is "everything in `.arc/` lives in the project repo's tracked
tree." This assumption serves solo dev with no constraints well, and acceptably serves small teams
where merge mechanics on text files stay human-scale. It fails or strains in several adopter shapes:

- **Solo dev with public / OSS repo** wanting private PM artifacts. `.arc/` in the tracked tree
  means PRDs, plans, and status files become public. Local mode (gitignored `.arc/`) addresses this
  partially but couples to per-developer backing-store mechanics that don't fit when the artifacts
  are intended to outlive a single machine.
- **Solo dev with multi-machine workflow** wanting centralized canonical state. Local mode's remote
  backing store works but requires per-developer setup of a private git remote; a shared backend
  with the same materialization semantics is operationally simpler.
- **Small team** that could just barely manage in-repo concurrency but would prefer real
  primitives. Today the choice is "tolerate text-file merge mechanics" or "give up ARC."
- **Larger team** where text-file concurrency is a non-starter and `.arc/` in the tracked tree is a
  cultural / governance non-starter.
- **Teams with strict tooling policies** prohibiting tool-specific directories in tracked
  repositories. Local mode addresses this for solo developers; teams need a shared equivalent.

**Calibration note (2026-05):** External research into agentic-coding practice (2024-2026) confirms
that the modal answer for inter-WU planning concurrency is out-of-band human coordination (Slack,
standup, discussion), not codified sync mechanisms. Text-file concurrency at the planning-artifact
level is mitigated by team discipline at most scales; no codified inter-WU planning-freshness
pattern has emerged in the field (Spec-Kit, BMAD, Cursor, Claude Code adopter conventions). The
backend tier's *pure sync* benefit is therefore less load-bearing for team adoption than this plan's
initial framing implied. Primary value-prop remains **canonical storage outside the project repo** —
serving adopters with governance / tooling-policy needs, private PM on public repos, or
multi-machine workflow simplification. Concurrency primitives are a benefit and a differentiator
for high-parallelism deployments, but not the load-bearing reason for the architecture at typical
team scales.

Each shape has been accumulating partial workarounds (`pm.mode: external`, coord-probe, Local mode
backing store, planned `team.enabled` mode). None of them solve the actual concern coherently.
**The architectural gap is canonical storage outside the project repo, with concurrency-safe
sharing semantics as a composable benefit.** ARC needs to fill it deliberately rather than continue
accumulating workaround surface.

---

## Working Thesis: B Canonical, A Integration

The canonical store is ARC's own backend. External-tool integration (Linear / Jira / Notion) layers
on top as bidirectional sync adapters, not as substitutes for the canonical store. This pattern
mirrors how Linear / Jira themselves handle their own integrations — own canonical store, plus
integration surface for everything else.

The canonical-store responsibility staying with ARC means:

- WU-artifact shape (status files, task lists, plan docs, PRDs) is ARC's, not the external tool's.
  No impedance-mismatch translation as load-bearing.
- External-tool adapters are sync layers, not authoritative writers. They can be added per-tool,
  on demand, without disturbing the core architecture.
- Adopters who want pure ARC (no external tool integration) get a complete experience without
  bolted-on integration overhead.

The order matters. **Extending `pm.mode: external` to take ownership of WU artifacts before this
backend lands would lock in external-tool-as-canonical and force migration later.** Current planned
external work (coord-probe as read-only advisory, `pm.mode: external` stripping PM pipeline) does
not cross this line and remains compatible.

---

## Three Storage Tiers

ARC supports three storage tiers, each serving a distinct adopter shape. These compose with — not
replace — each other.

| Tier        | Storage location                                | Audience fit                                       |
|-------------|-------------------------------------------------|----------------------------------------------------|
| **In-repo** | `.arc/` tracked in project repo                 | Solo / small team with no constraints              |
| **Local**   | `.arc/` gitignored + `~/.arc-state/{id}/` store | Solo dev who can't put `.arc/` in repo             |
| **Backend** | ARC backend service + materialized local view   | Out-of-repo canonical storage; multi-user optional |

The backend tier is not strictly "the team tier." Its defining characteristic is **canonical
storage outside the project repo with optional multi-user awareness.** Single-user adopters benefit
from it (private PM on public repos, simpler multi-machine workflows). Multi-user adopters benefit
from it via concurrency primitives. Audience fit is broader than "teams only."

---

## Local Mode Composition

ARC's planned Local mode (`plan-arc-modes.md` § Mode 2) shares substantial structural concerns
with the backend tier — materialization to gitignored `.arc/`, sync state machine, project-ID
resolution, re-clone recovery, failure-class handling. The backend tier is conceptually "the
multi-user case of the same problem space."

**Caveat: Local mode was designed before the backend tier was a recognized target.** Its design
decisions (per-developer git repo as backing store, `arcd backing` command shape, sync firing
points, failure-class taxonomy) reflect single-user assumptions and may or may not generalize
cleanly. Treating the backend tier as "Local mode multi-user" risks calcifying Local-specific
choices into a shared abstraction that fits neither cleanly.

**Composition discipline:** When Local mode promotes to PRD, scope a storage-abstraction sketch
as part of that work — the minimum shared interface that Local implements and the backend tier
extends. Holistic design at the abstraction boundary; Local-specific impl details remain Local's
PRD scope. Avoids two failure modes: (a) shipping Local with abstractions that don't generalize,
forcing the backend tier to retrofit; (b) delaying Local pending backend-tier PRD, which
contradicts the sequencing intent.

Touchpoints warranting joint attention are captured in
[`strategy-storage-evolution.md`][strategy-storage-evolution] § Holistic Design Touchpoints —
the forward-compat reference for both plans.

---

## Team Mode Subsumed

Today's `team.enabled` config gates conventions for in-repo team coordination (identity-marker
ownership, team-aware workflows). In a backend-tier world, **multi-user teamwork moves to the
backend.** In-repo team mode on text files doesn't earn its keep against backend concurrency
primitives — it carries all the merge-mechanics problems the backend solves.

**Forward-compat decision:** in-repo team mode stays supported during the bridge period but is not
the recommended path in a backend-tier world. Small teams who could tolerate in-repo concurrency
graduate to backend tier when it lands. The `team.enabled` axis collapses; `team` becomes implicit
in backend-tier installs.

This avoids the "matrix explosion" risk where every storage tier × team-mode × PM-mode combination
becomes a supported configuration. Team coordination is properly a property of the backend tier.

---

## Self-Hosted Distributed (Deployment Shape)

Self-hosted does not mean local-network-only. The contemporary shape — single-binary or
single-container service deployed on a VPS / home server / private cloud, behind TLS, reachable
from anywhere — is well-established (Gitea, Plausible, Sentry, Mattermost). Distributed teams
access via internet; orgs preferring zero-trust pair with a private VPN (Tailscale, WireGuard).

Hosted SaaS is **out of scope** as the deployment model. Adopters run their own backend.

---

## Forward-Compat Discipline

Discipline that keeps interim work composing toward this target lives in
[`strategy-storage-evolution.md`][strategy-storage-evolution]. Plans and PRDs touching storage /
multi-user / external integration self-check against that doc.

---

## Open Questions for Pre-PRD Detail Design

These are decisions deferred to PRD-time research and detail design.

- **Concurrency mechanism.** CRDT-based merge (Yjs / Automerge), server-authoritative
  last-write-wins with collision detection, vector clocks, full per-record locking. Tradeoffs span
  user-perceived latency, conflict surface area, agent UX, implementation complexity.
- **Materialization model.** Continuous sync daemon vs pull-on-demand vs hybrid. Daemon offers
  freshness; pull-on-demand offers simplicity. Hybrid (pull-on-session-init, push-on-handoff,
  selective polling for long sessions) may be the right shape but needs design.
- **Auth model.** Shared secret, OIDC, GitHub OAuth, self-issued JWTs. Bounded for self-hosted
  single-org context; needs to feel idiomatic for dev-tooling deployment.
- **Distributed access transport.** HTTPS over public internet vs private-VPN-only vs configurable.
  Recommended deployment shape and operational guidance.
- **Version pinning.** Today the `system/` (workflows, methods, briefs) lives in the repo and
  versions with the code — checkout pins agent behavior. In a backend world, `system/` could stay
  in-repo (preserving the property) or move to the backend (consistent storage). Tradeoff between
  reproducibility-via-checkout and coherent-canonical-storage. Worth deliberate consideration.
- **Storage abstraction shape.** API contract between ARC and the backend. REST? RPC? File-system
  semantics? Materialization-layer responsibility split. Affects what custom backends could exist
  beyond the bundled implementation.
- **Identity-and-project resolution at the backend.** How a backend installation maps to project
  identity across machines, and how that interacts with Local mode's project-ID resolution.
- **Interaction with Lite mode.** Lite-mode adopters who want backend storage — does the tier
  combination earn its keep, or does Lite stay in-repo / Local only?

---

## Required Pre-PRD Research Pass

Substantive external research before PRD promotion. The research is itself meaningful scope —
not a perfunctory step. Goal is idiomatic alignment with established industry norms; deliberate
reinvention only where ARC has a genuine novel contribution to make.

**Areas to cover:**

- **Sync-with-conflict patterns:** CRDTs (Yjs, Automerge), git-style merge, server-authoritative
  LWW, operational transformation. Read on real-world deployment characteristics, not just
  algorithmic surveys. Materialized-file sync specifically (Obsidian Sync, Logseq Sync, Resilio,
  Syncthing, Nextcloud) as adjacent design references.
- **Self-hosted dev-tool deployment shapes:** Gitea, Plausible, Sentry, Mattermost, Linear's
  enterprise offering. Single-binary vs container vs compose-stack. Auth idioms. Operational
  burden patterns. What teams actually run vs what marketing suggests.
- **Markdown-as-canonical-with-sync:** Obsidian, Logseq, Dendron, Foam. How they handle
  multi-device, multi-user, conflict surfaces. Where they break down at scale.
- **Self-hosted licensing / multi-tenant:** Linear-style enterprise, Sentry, Plausible. How
  self-hosted-but-team-aware tools handle org / team / user boundaries.
- **Embedded / lightweight storage backends:** SQLite, DuckDB, embedded git, custom file-based
  formats. What's idiomatic for "small backend service for a small team."
- **Library landscape:** Existing Node / Rust / Go libraries for sync engines, conflict
  resolution, file watchers, materialization. Reduce hand-rolled surface where mature primitives
  exist.
- **Adjacent precedent for "tool state outside the repo":** Cursor rules, SpecStory, Aider,
  Continue, JetBrains AI Assistant. Already surveyed in `plan-arc-modes.md` for editor
  discoverability; revisit for storage architecture patterns.

**Anti-target:** anything that would make a team familiar with modern dev infrastructure shake
their head as "out of step." The bar is idiomatic alignment unless the deviation is a genuine
ARC value-prop element.

---

## Upstream Dependencies

- **`prd-user-sync-ux.md`** — hardens the user-notes sync state machine and notes-discovery
  semantics that the backend tier's sync layer extends and parallels. Not a hard dependency for
  PRD promotion of this work, but the backend's sync semantics will compose more cleanly if user
  sync UX has landed first.
- **Local mode (`plan-arc-modes.md` § Mode 2)** — the backend tier extends Local's backing-store
  architecture multi-user. Local mode landing first is structurally important; the backend tier
  is mostly "Local with a different backing store flavor."
- **Shift lifecycle (`plan-worktree-foundation.md` § Shift Lifecycle, scheduled extraction)** —
  shift's metadata-in-place pattern composes with backend materialization. Shift landing first
  removes a design unknown.

---

## Non-Goals

- **Hosted SaaS offering.** Self-hosted only.
- **Web UI as deliverable.** A future capability, not in scope for the backend tier itself. The
  initial deliverable is markdown-on-disk-via-materialization plus CLI; web UI would be a Path C
  follow-on (`plan-arc-modes.md` open territory; not committed).
- **Forced migration of existing in-repo installs.** In-repo and Local stay supported. Adopters
  choose the tier that fits.
- **Per-tracker authoritative ownership of WU artifacts via `pm.mode: external`.** External tools
  remain integration surfaces, not canonical stores.

---

## Sequencing Intent

Long-running. Not next. The backend tier depends on substantial upstream work (user sync UX,
Local mode, shift lifecycle) and on the research pass above. Expected to land well after the
1.0 release window; specific sequencing decided when upstream dependencies reach completion.

This plan exists primarily as the **forward-compat reference** — interim work composes toward
this target without depending on it shipping soon.

---

## Backlog Compat Audit

Status of every current backlog plan / PRD against the backend-tier target. Captured 2026-05-02
during this plan's authoring. Items flagged for B-compat review get explicit attention at their
own PRD-promotion time.

| Item                                      | Status      | Notes                                                                                                                                            |
|-------------------------------------------|-------------|--------------------------------------------------------------------------------------------------------------------------------------------------|
| `plan-arc-modes.md`                       | Co-design   | Local mode shares substantial structure with backend tier but was designed in vacuum. Scope storage-abstraction sketch at Local PRD time.        |
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

**Flag-at-PRD items** are not blocked by this plan. Their authors should consult
`strategy-storage-evolution.md` at PRD time and confirm the design composes with backend-tier
semantics. None require rework today.

**Scalable-core (`plan-scalable-core.md`, ADR-020).** ADR-020 sharpens this plan's scope rather than
flagging it: the backend is the canonical store for *mutable shared state* (inbox drains,
priority/ordering), which is unsolvable in-git by git's nature. Derived shared state (ROADMAP) is solvable
in-git via serialization-point regeneration and is not backend-dependent. This reinforces the concurrency
calibration note above — the backend's load-bearing value is canonical mutable storage, not sync generally.

---

[strategy-storage-evolution]: ../../../reference/strategies/project/strategy-storage-evolution.md
