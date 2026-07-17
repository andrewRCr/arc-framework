# Draft: session-locus-model — durable execution loci and recoverable session frames

- **Origin:** FP wave-2 dogfooding exposed checkout-identity failures while running split-out Errands beside a
  live WU. The full finding is recorded in `notes-finalize-parallelism.md` § Dogfood finding (2026-07-14):
  execution-locus doctrine is sequential-era; session state is single-frame.
- **Purpose:** Make a checkout's role durable and record the bounded session/locus frame needed to leave, recover,
  and return without repurposing a WU worktree or relying on harness-summary state.

---

## Inbound Buffer — Pending Integration

> *Routed-in concerns pending holistic integration into the body at this WU's next planning iteration*
> *(`drain-inbox § 5`); each carries its origin. Integrate — or consciously reject — at iteration.*

### `[ ]` **Close the errand sweep loop: run-errand next-offer + `--errand` vs `--housekeep` doorway legibility**

- *Routed from:* `USER-INBOX § Work Unit` (`WU_Target: TBD`), housekeep drain (2026-07-16); captured during FP
  wave-3 terminal-state UX review, alongside the terminal-WU handoff capture (routed to `handoff-optimization`).
- *Concern:* triage-then-sweep connective tissue exists only on the drain side: `drain-inbox` § 6 hands each
  execute-now atomic to `run-errand` and returns for the next, but `run-errand`'s Complete section just closes —
  no "further flagged captures exist — continue?" offer and no terminal marker — so a sweep entered via
  `arc-session --errand` (or continued past the first errand) has no loop. Doorway legibility compounds it:
  `--errand` reads as the cold errand door, yet most cold entries from the primary want the sweep, which is
  `--housekeep`'s drain. Semantics to preserve: housekeep stays the triage+sweep umbrella, run-errand stays
  single-concern, and no queue artifact returns (`ERRANDS.md` retired deliberately — the inbox is the durable
  queue; the session carries the agreed slate).
- *Approach:* a next-offer hook at `run-errand` close (when flagged `§ Errand` captures remain), and a soft-offer
  of the drain when bare `--errand` resolves against multiple flagged captures. **Integrate only after FP Task 5.3
  records the parallel-errand fork + batch-errand shape decision** (`tasks-finalize-parallelism.md`) — the
  recorded sequential-first leaning shapes the loop. Alternative owner if grooming finds the loop belongs with
  inbox semantics instead of transient-loci shape: `shared-inbox-model`.

---

## Problem / Motivation

The wave-2 split-out cycle (the `start-class-flag` Errand and the teardown-stub Errand, both run warm from FP's
worktree) produced hard failures that were all **checkout-identity failures, none model failures**: warm
`errand open` displaced the WU's worktree onto the errand branch, then hard-blocked on the WU's own uncommitted
notes; `errand close` died on `git switch main` because the base is held by the primary worktree; updating the
local base meant reaching into the primary with `git -C`; and a harness compaction landing mid-errand recovered
**errand context only** — the suspended WU frame (governing workflow, loadset, task cursor) survived only in the
harness summary, the channel recovery doctrine trusts least. The abstractions (WU/Errand, seam routing,
interlocks) answered every call correctly; the friction lived entirely in the rules for *where work physically
executes*.

Two coupled defects:

1. **The execution-locus doctrine is sequential-era.** "Get off the WU branch" was generalized from a
   one-checkout world. Under linked worktrees, occupying a WU worktree in place is a category error — the
   worktree *is* the WU's workspace. The old "errands stay out of worktrees" premise rested on spawn/teardown
   cost, which BI-1 provisioning (shipped) and `worktree-teardown-decoupling` (shipped) have dismantled.
2. **Session state is single-frame.** A warm Errand pushes a WU→Errand frame with no recorded link, so neither
   recovery nor the return path can restore the suspended frame deterministically. Depth is bounded at two by
   construction — no warm WU-entry path exists and Errands never nest — so the fix is one recorded parent
   pointer plus a machine-local locus record, not a general stack.

## Design

### Durable execution loci (the doctrine)

A checkout's role is durable:

- **Primary checkout = launchpad.** It holds the base, spawns worktrees, and hosts only the transient work
  that is launchpad-native by exception (the enumerated in-place arms of the ephemeral-default lean below,
  housekeep chief among them). It is never a WU workspace.
- **A WU worktree belongs to its WU from spawn through teardown.** No other work executes there; teardown is
  the only exit.
- **New work never repurposes an existing workspace.** Warm Errands run in **ephemeral Errand worktrees** —
  displacement is removed, not warned about. (Final contention and drain shape pend wave-3 evidence; see
  Unknowns.)

**Same-session continuity is a hard requirement on warm entry.** Execution locus and session continuity are
separable: the originating session spawns the ephemeral worktree, operates there through directed commands and
absolute paths, closes (teardown), and resumes the WU — the agent moves; the human's terminal and the WU
worktree never do. Handoff (spawn, seed, fresh session) is the WU-launch pattern and explicitly **not** the
warm-Errand shape: seeding a fresh session costs roughly what doing the work costs while losing the
un-serialized discovery context that justified warm entry in the first place. No harness relocation primitive
is required — cross-directory operation suffices (Claude Code additionally has a native worktree-relocation
primitive; Codex CLI has none but operates cross-directory without moving). Where a harness genuinely cannot
operate outside its boot directory, warm entry degrades to in-place record-and-restore (see Consumed shipped
behavior).

**Entry routing (why warm exists).** A concern that can wait routes to the inbox — capture, not execution. A
concern that justifies interrupting the WU session is blocking or context-carrying, and the session that
already holds the discovery context executes it and returns: that is warm entry. Spawn-and-handoff survives
only as the rare parallelize-now variant — non-blocking work the operator wants started immediately in a
fresh session.

**Grooming is a locus, not an exception.** A `--plan <stub>` grooming session is locus-wise an Errand — same
doctrine, same frame record, same close-pops-frame lifecycle — differing only in payload: docs/planning
artifacts only, shipped on the auto-merge lane. Today the sanctioned `chore/groom-*` branch is invisible to
the model and misclassified as residue (evidence under the frame record's lifecycle below).

**Ephemeral is the default transient locus (lean, full protection).** Transient work — Errands warm and cold,
grooming — defaults to an ephemeral worktree; the launchpad stays clean at base. In-place on the primary
survives only as enumerated arms, named and justified rather than vibes (mirroring the `--here` → spawn
default flip for WUs):

- **Partial protection — structural, not a preference.** Under partial protection an Errand is a direct base
  commit, and base is checked out in the primary; git refuses a second checkout, so an ephemeral worktree
  *cannot* hold that work. In-place on the primary is the shape there, full stop.
- **Below the provisioning floor — economic.** Where spawn + provisioning dwarfs the work itself (a one-file
  fix behind a minute of dependency provisioning), in-place on a clean launchpad wins. The floor's threshold
  is empirical — see Unknowns.
- **Housekeep — launchpad-native, always the primary.** It drains identity-scoped gitignored state (a fresh
  worktree contains no `USER-INBOX.md`; the resolver-backed-to-primary pattern WORKING-MEMORY uses would be a
  new dependency for no gain) and it is the launchpad's own maintenance.
- **Harness degrade path** — as recorded under Consumed shipped behavior.

**Ephemerality is not a concurrency license.** All worktrees share the common git dir — refs, notes refs,
ROADMAP regeneration, sync-state markers still contend. Ephemeral loci solve *checkout occupancy*;
simultaneous transient work still runs under the shared-mutable-surface discipline.

**The frame record is a human-orientation surface, not only agent-recovery state.** Under warm entry the
session's terminal cwd (session home) is not where edits land (active locus) — the one truth gap ephemeral
loci introduce, replacing displacement's worse one (a WU space relabeling to an errand branch mid-flight,
its workspace entangled with foreign work). Checkout spaces keep stable, truthful identities; transient loci
appear and vanish as their own short-lived entries. Closing the remaining gap is an acceptance bar for the
ephemeral default, not a hope: an **open/close narration contract** (the agent states the spawned path at
entry and the teardown at close), the **read verb** as the queryable "what is each session doing, where," and
candidate renders for human tooling (statusline/prompt, worktree-listing UIs) all consume the record. No
ephemeral-by-default ships without the orientation surface that keeps the operator's mental model true.

Enforcement is mechanical where possible: the doctrine binds at the operation fire sites (`errand open`,
`arc start`, the `--plan` relocate, materialize), not only in prose. The prose home is the concurrent-work /
worktree-ops guidance; placement follows the knowledge-layer check (constraints sit at the fire sites gating
the operations they protect).

### Machine-local session/locus frame record

A deterministic record of what each checkout on this machine is doing and what session frame governs it.

- **Storage class:** `user/{identity}/.internal/` — gitignored, machine-local, sibling to `.sync-state.json`.
  This is a fact about *this machine's* checkouts and live sessions, not PM state: it never lifts into the
  backing-store target and is deliberately outside the materialized substrate
  (`strategy-storage-evolution.md` self-check run at this grooming — composes; no new storage axis). It is a
  code-owned record exposed through a read verb, never a hand-edited document.
- **Fields (direction):** locus kind (opaque value), subject pointer (WU name / errand slug / groom stub),
  governing workflow, optional parent frame (depth two by construction). The frame distinguishes **session
  home** (the checkout a session booted in and returns to) from **active locus** (the checkout it is operating
  in) — two loci, one session; the parent frame is what links them under warm entry. State-like values are
  **opaque strings** — `wu-lifecycle-state-model` owns the vocabulary and may re-vocabulary later without
  schema churn.
- **Loadset is derived, not stored.** The record stores the inputs (locus kind, governing workflow, subject);
  the loadset is computed at read time the same way session-init's `loadSet` manifest is computed. A stored
  loadset snapshot would go stale between suspend and resume, and a per-record loading field is exactly what
  `strategy-knowledge-evolution.md` Principle 4 rules out (access paths derive from structure).
- **Lifecycle:** minted when a locus is established (spawn, `errand open`, the `--plan` relocate,
  materialize); popped at close/teardown; consumed by recovery, session-init, and the residue/cleanup
  surfaces. Errand close pops the frame; recovery consumes the record instead of reconstructing intent from
  branch presence and a harness summary.
- **Grooming-open record (motivating evidence):** the sanctioned `chore/groom-*` branch currently carries no
  record, so the in-flight-derivation residue advisory misclassifies a live, resumable grooming locus as
  cleanup-needed (`in-flight-derivation.ts:1303`) and re-fires on effectively every CLI invocation (5× in one
  session, 2026-07-15), with `arc start` mislabeling the emission a "ROADMAP advisory". The durable fix is
  exactly this record: the `--plan` relocate mints a grooming-kind locus record and the detectors read it
  instead of inferring from branch shape. A near-term detector patch is a mechanization Errand around the
  model — see Boundaries.

### Identity records vs. locus records

Errand identity already lives in the orphan state-ref `refs/arc/user/{identity}/errands` (identity-scoped,
machine-agnostic, records-only); WU identity lives in metas. The locus record answers the orthogonal question —
*where does work physically execute on this machine, and what frame governs it* — and carries only a subject
pointer, never duplicated identity fields. Occupancy never syncs cross-machine; identity never encodes locus.

### Consumed shipped behavior — the interim close fix

The pre-wave-3 topology fix **shipped** (PR #241): v2 errand records persist the caller branch
(`returnBranch`); `errand close` restores the pre-open branch, detaching at a refreshed base when no safe
return branch exists. This design consumes its requirements without preserving its shape:

- **Preserved:** close restores what open displaced; close never assumes the base is switchable from a linked
  worktree.
- **Not preserved:** displacement itself. Ephemeral Errand worktrees remove the displacement rather than
  record-and-restore it. During the transition, `returnBranch` remains the branch-level projection of the
  frame-restore concern; the frame record subsumes it once the warm path stops displacing.
- **Retained as the degrade path:** where a harness cannot operate outside its boot directory, warm entry
  falls back to in-place displacement with record-and-restore — the shipped behavior survives as the durable
  fallback for that case, not as a transitional shape awaiting deletion.

### Creation-time provenance (ownership markers)

Every ARC-created or ARC-materialized worktree writes ownership provenance at creation. Session-init's
materialize arm currently uses raw `git worktree add`, so materialized Errand worktrees are invisible to
cleanup surfaces and a self-teardown can leave a markerless husk. The spawn/materialize primitive owns the
marker write; if the locus model does not subsume the raw materialize arm, an Errand-materialize verb (or an
explicit marker write at that boundary) closes the gap. Marker and locus record stay distinct: the marker is
durable provenance the sweep trusts; the record is the live frame.

### Occupancy-aware husk cleanup (live-locus lease)

Existing predicates (trusted provenance, clean tree, exact terminal `HEAD`, shipped subject, successful ref
reaps) can prove a stamped husk's *contents* disposable but not that no live agent session *occupies* the
directory. Extend the locus record with a definitive **live-locus lease**:

- Suppress cleanup while a lease is live.
- Auto-remove only when the lease is conclusively released or dead **and** every existing cleanup predicate
  passes.
- Prompt when occupancy is unknown or the husk comes from a legacy client.
- Dirty, moved-`HEAD`, retained-ref, untrusted-marker, and cross-identity cases stay manual. Age alone is
  never liveness proof.
- Classification and output stay deterministic; bounded parallel reads only where useful; no unbounded
  concurrency in physical removal.

## Alternatives

- **Frame state in the harness summary (status quo):** rejected — the least-trusted recovery channel; the
  wave-2 compaction loss is the direct evidence.
- **Extend the ref-backed errand records with locus/frame fields:** rejected — that ref is identity-scoped and
  machine-agnostic; locus is a per-machine fact, and syncing occupancy cross-machine is noise at best and
  misleading at worst.
- **A general session-frame stack:** rejected — depth is two by construction; one parent pointer suffices, and
  a stack invites the nesting the model forbids.
- **Displacement warn-and-confirm as the durable model (the interim fix's shape):** rejected — removes the
  failure class by removing displacement, not by narrating it.
- **Warm errand relocating to the launchpad instead of an ephemeral worktree:** visible in an existing UI
  space, but re-introduces launchpad occupancy and keeps the session-home/active-locus gap anyway — dominated
  once the orientation surface exists.

## Unknowns / Open — pending wave-3 evidence

Wave 3 deliberately runs on the *current* model as this WU's evidence collector; these stay open until it
reports:

- **Contention and drain shape** for Errands running beside live WUs — the live-errand wave plus the
  errand-drain session supply the observed shape ephemeral Errand worktrees must serve.
- **Ephemeral Errand-worktree economics:** WU-worktree provisioning cost is dismantled (BI-1), but does the
  Errand-sized variant want lighter provisioning (no deps, doc-only gates)? Note even doc-only work needs
  `node_modules` for `lint:md` here. This sets the **provisioning floor** the ephemeral-default lean carves
  out — below it, in-place on a clean launchpad wins; the threshold is wave-3 empirics.
- **Launchpad-occupancy collision rate:** the ephemeral-default lean rests on occupancy being a real cost,
  not a theoretical one — in-place is not *broken* (switch-back to base always succeeds in the primary; what
  occupancy costs is the *launchpad directory* as a stable base context, while `main`-the-ref stays free
  either way). First datapoint (2026-07-15, this WU's own grooming): three WU worktrees live, the primary
  mid-grooming with a dirty tree — a housekeep or cold-errand need at that moment has no locus at all until
  the grooming state commits; the current model serializes all transient work through the launchpad with a
  commit-or-stash toll at each interleave. Wave-3's errand-drain session is the evidence source for how often
  this bites in practice.
- **Lease liveness mechanics:** what conclusively proves a dead locus — explicit pop only, PID, heartbeat,
  harness session-end hook? Crash-without-pop is the hard case; "unknown → prompt" is the floor.
- **Record granularity and keying:** per-worktree records vs. a single index; crash-consistency of the pop;
  cleanup when a worktree is removed outside ARC.
- **Read-verb surface:** standalone verb vs. a session-init probe slot vs. both (probe consumption is likely
  regardless — orientation and the lease both read it). A run-anywhere hygiene view is a candidate consumer:
  husk/orphan cleanup currently surfaces only in the primary worktree, invisible to operators living in linked
  worktrees — seam with `husk-lifecycle-drivers`, which owns where that surfacing renders.

## Scope estimate

Large (week+, Heavy): CLI primitives (record schema, read verb, lease), `errand open`/`close` and
spawn/materialize integration, session-init and recovery consumers, doctrine placement. Executes inside the FP
GA gate, ahead of the `--here` → spawned-worktree default flip.

## Boundaries carried from FP

- The pre-wave-3 topology-aware close fix shipped (PR #241) and is consumed above — it was never this WU's
  execution.
- The base-sync verb and the stub mint-to-launch bundle are determinate mechanization Errands around the model
  (`stub-mint-to-launch` now sits in `backlog/planned/`).
- A near-term residue-detector patch is likewise a mechanization Errand: teach the detector the
  `chore/groom-*` shape (label it in-flight grooming, resumable via `--plan`; drop the cleanup wording), dedup
  the emission (once per command, or the daily nudge-marker pattern), and fix the `arc start` provenance
  label. The durable fix is the grooming-open locus record above.
- FP retains verification: wave 3 re-observes the current Errand surface, and the GA bar is running an Errand
  beside two live WUs without narrating git topology.

## Coordination

- `wu-lifecycle-state-model` — owns state vocabulary; this record stores de-facto states as opaque values so it
  can re-vocabulary later without schema churn. Reciprocally, it consumes this WU's reporting record rather
  than rebuilding it (its own inbound buffer records that boundary).
- `worktree-teardown-decoupling` (shipped) — emits the shipped-husk transition and the driver socket the lease
  composes with.
- `husk-lifecycle-drivers` — extends husk teardown to abandon and park-at-Planning; the lease predicate covers
  any stamped husk kind, not only shipped. It also owns where husk/orphan cleanup renders for worktree-resident
  operators; the locus-record read verb is a candidate carrier (seam recorded in its capture).
- Check-docs run at this grooming: `strategy-storage-evolution.md` (machine-local, non-backing-store record —
  composes) and `strategy-knowledge-evolution.md` (loadset derived at read time, no stored loading fields —
  composes).

---
