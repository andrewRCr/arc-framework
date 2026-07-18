# Draft: session-locus-model — durable execution loci and recoverable session frames

- **Origin:** FP wave-2 dogfooding exposed checkout-identity failures while running split-out Errands beside a
  live WU. The full finding is recorded in `notes-finalize-parallelism.md` § Dogfood finding (2026-07-14):
  execution-locus doctrine is sequential-era; session state is single-frame.
- **Purpose:** Make a checkout's role durable and record the bounded session/locus frame needed to leave, recover,
  and return without repurposing a WU worktree or relying on harness-summary state.
- **Success signal (proposed):** a warm Errand raised from a live WU session runs in the settled locus shape and,
  with a harness compaction landing mid-errand, both frames recover deterministically — the errand resumes and the
  suspended WU frame restores (governing workflow, loadset, task cursor) with no reliance on the harness summary.
  Secondary signals: a `--plan` grooming branch is never misclassified as residue; husk cleanup never removes an
  occupied directory.

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

### Consumed decision — FP 5.3 settles the transient-locus default

Wave 3 ran on the pre-locus model as this WU's evidence collector and reported; seam-audit decision 5.3
(2026-07-17, `notes-finalize-parallelism.md` § Wave-3 seam-audit decisions) settled the parallel-errand fork and
batch shape on that evidence, and this draft consumes it:

- Errand / grooming execution defaults to the **primary, serialized** — out-of-WU work occupies the primary only
  when it is free, one out-of-WU session at a time; `chore/` excursions return it to base at close; the primary
  is never parked on a branch.
- **Warm entries are occupancy-keyed, not temperature-keyed.** A warm errand raised from a WU worktree relocates
  to the free primary exactly like a cold entry; when the primary is occupied — or the operator prefers
  isolation — it spawns its own worktree instead of queueing or sharing the checkout.
- Worktree spawn otherwise remains the supported, non-default escape hatch for a genuinely concurrent out-of-WU
  need (the parallelize-now spawn-and-handoff variant).
- The **sequential lockstep drain** is codified; "sequential feels slow" is addressed by tightening per-errand
  overhead (the sweep-loop close below), not by parallelism.

This supersedes the draft's earlier ephemeral-worktree-by-default lean (recorded under Alternatives). The
doctrine core and the frame record are unchanged by the flip — 5.3 *strengthens* the record's motivation by
handing it the serialization invariant to carry (below).

### Durable execution loci (the doctrine)

A checkout's role is durable:

- **Primary checkout = launchpad and the serialized transient locus.** It holds the base (its resting state *is*
  base), spawns worktrees, and hosts out-of-WU transient work — Errands warm and cold, grooming, housekeep —
  under the serialization invariant above. It is never a WU workspace.
- **A WU worktree belongs to its WU from spawn through teardown.** No other work executes there; teardown is
  the only exit.
- **New work never repurposes an existing workspace.** Displacement is removed, not warned about: transient
  work runs on the free primary or in a freshly spawned ephemeral worktree — never by switching an existing
  checkout onto foreign work.

**Same-session continuity is a hard requirement on warm entry.** Execution locus and session continuity are
separable: the originating session operates in the transient locus — the free primary, or a spawned worktree —
through directed commands and absolute paths, closes (return-to-base or teardown), and resumes the WU; the agent
moves, the human's terminal and the WU worktree never do. Handoff (spawn, seed, fresh session) is the WU-launch
pattern and explicitly **not** the warm shape: seeding a fresh session costs roughly what doing the work costs
while losing the un-serialized discovery context that justified warm entry in the first place. No harness
relocation primitive is required — cross-directory operation suffices (Claude Code additionally has a native
worktree-relocation primitive; Codex CLI has none but operates cross-directory without moving). Where a harness
genuinely cannot operate outside its boot directory, warm entry degrades to in-place record-and-restore (see
Consumed shipped behavior).

**Entry routing (why warm exists).** A concern that can wait routes to the inbox — capture, not execution. A
concern that justifies interrupting the WU session is blocking or context-carrying, and the session that
already holds the discovery context executes it and returns: that is warm entry. Spawn-and-handoff survives
only as the rare parallelize-now variant — non-blocking work the operator wants started immediately in a
fresh session.

**Grooming is a locus, not an exception — and session-bounded like every transient locus.** A `--plan <stub>`
grooming session is locus-wise an Errand — same doctrine, same frame record, same close-pops-frame lifecycle —
differing only in payload: docs/planning artifacts only, shipped on the auto-merge lane. Grooming is
**groom-and-ship**: each pass opens a fresh `chore/groom-*` branch, grooms, and ships as a lean PR; the shipped
draft artifact in the stub is the continuity across passes, never parked branch state (a draft at any maturity
is legitimate stub content — the readiness states exist to mark work-in-progress, and doc-only PRs ride the
light CI lane). **One grooming pass in flight per stub:** ship and merge are not the same instant, so the
grooming open consults the errand-records ref — an open groom-kind record on the same stub (a
shipped-but-unmerged prior pass) redirects to resuming that pass or waiting for its merge, never a silent fresh
cut from a base missing the prior pass's draft. The record gates the open, so branch-name collisions are
impossible by construction and the same `chore/groom-<slug>` name serves every pass. There is no sanctioned
suspend: a design that outgrows single sittings graduates the stub to a
planning WU — the sanctioned multi-session design locus. This gives the transient tier one invariant —
**transient loci are session-bounded; only WU worktrees are durable loci** — and revises the shipped
groom-and-stop exit in the `draft-design` workflow to groom-and-ship (carried under this WU's doctrine
placement). Today the sanctioned `chore/groom-*` branch is invisible to the model and misclassified as residue
(evidence under the frame record's lifecycle below).

**Spawn fallback (the enumerated exception).** The ephemeral transient worktree survives as the exception, not
the default, on three named arms:

- **Primary occupied** — the occupancy-keyed redirect. At the fire site the check is mechanical (a locus-record
  read, below); on occupied, surface the occupancy and offer the spawn — redirect-with-offer, never a refusal
  and never silent queueing.
- **Isolation preference** — the operator wants the work off the primary regardless of occupancy.
- **Parallelize-now** — the spawn-and-handoff variant from Entry routing above.

Spawned transient worktrees inherit BI-1 provisioning unchanged; the lighter doc-only provisioning variant is
dropped as a question — spawn economics were load-bearing only under ephemeral-by-default. And ephemerality is
not a concurrency license: all worktrees share the common git dir — refs, notes refs, ROADMAP regeneration,
sync-state markers still contend. Ephemeral loci solve *checkout occupancy*; simultaneous transient work still
runs under the shared-mutable-surface discipline.

**The frame record is a human-orientation surface, not only agent-recovery state.** Under any warm entry —
relocate-to-primary or spawn — the session's terminal cwd (session home) is not where edits land (active
locus): the one truth gap the doctrine tolerates, replacing displacement's worse one (a WU space relabeling to
an errand branch mid-flight, its workspace entangled with foreign work). Checkout spaces keep stable, truthful
identities; transient occupancy appears and vanishes as its own short-lived record entries. Closing the
remaining gap is an acceptance bar for the warm-entry doctrine, not a hope: an **open/close narration
contract** (the agent states the active locus at entry and the return/teardown at close), the **read verb** as
the queryable "what is each session doing, where," and candidate renders for human tooling (statusline/prompt,
worktree-listing UIs) all consume the record. No warm-entry default ships without the orientation surface that
keeps the operator's mental model true.

Enforcement is mechanical where possible: the doctrine binds at the operation fire sites (`errand open`,
`arc start`, the `--plan` relocate, materialize), not only in prose — and the serialization invariant's
"is the primary free?" test is a locus-record read at those sites, never branch-shape inference (the inference
is exactly what misclassifies grooming today). The prose home is the concurrent-work / worktree-ops guidance;
placement follows the knowledge-layer check (constraints sit at the fire sites gating the operations they
protect).

### Machine-local session/locus frame record

A deterministic record of what each checkout on this machine is doing and what session frame governs it.

- **Storage class:** `user/{identity}/.internal/` — gitignored, machine-local, sibling to `.sync-state.json`.
  This is a fact about *this machine's* checkouts and live sessions, not PM state: it never lifts into the
  backing-store target and is deliberately outside the materialized substrate
  (`strategy-storage-evolution.md` self-check run at this grooming — composes; no new storage axis). It is a
  code-owned record exposed through a read verb, never a hand-edited document.
- **Fields (direction) — a durable role plus a session-scoped lease.** The **role** carries locus kind (opaque
  value), subject pointer (WU name / errand slug / groom stub), and optional parent frame (depth two by
  construction); it lives from locus establishment to close/teardown. The **lease** carries the liveness data —
  process anchor, heartbeat timestamp — attached (re-anchored) at each session entry into the checkout
  (session-init there, or a warm-entry attach) and released at session end; a dead lease means "no live
  session," never "role ended." The frame distinguishes **session home** (the checkout a session booted in and
  returns to) from **active locus** (the checkout it is operating in) — two loci, one session; the parent frame
  is what links them under warm entry. State-like values are **opaque strings** — `wu-lifecycle-state-model`
  owns the vocabulary and may re-vocabulary later without schema churn. **No governing-workflow field:** it
  derives at read time — from the locus kind for transient loci (kind → workflow mapping), from the subject's
  meta for WU loci (`Current Workflow`, the same join as stage below). A stored copy would go stale at every
  stage advance and duplicate a shared-store field into the machine-local record.
- **The record carries the serialization invariant.** The primary's own occupancy — free-at-base vs. which
  out-of-WU excursion holds it — is a record entry minted and popped at the same fire sites, making "the
  primary is free" a deterministic read for the occupancy-keyed routing above. Today that check is branch-shape
  inference, which is precisely what misclassifies a live grooming locus as residue.
- **Granularity and keying (settled): per-locus record files.** One record per checkout, in one machine-local
  directory (resolver-backed to the primary), keyed by checkout — records persist the caller/Git path spelling
  and same-locus questions resolve by canonicalizing at compare time, exactly the shipped path-identity decision
  (canonical keys answer same-locus questions; never synced, never recorded). Mint and
  pop are single-file create/delete with atomic-rename semantics — no shared-index lock discipline; the shape
  structurally minimizes the shared-mutable machine-local surface (the `strategy-user-notes-concurrency.md`
  mutator checklist still applies to what remains). Per-checkout keying matches the model: a checkout hosts at
  most one locus, so the warm-entry pair falls out naturally — the WU worktree's record is untouched while the
  primary's (or spawned worktree's) record is minted carrying the parent pointer. Crash-consistency of the pop
  reduces to the lease: a crash between work and pop leaves a record whose anchor is dead, which the liveness
  model detects. Read-time reconciliation against `git worktree list` handles the mismatch cases — the read
  surfaces *report* them; the reap and backfill actions run at the next state-touching fire site (session-init's
  reconcile, a mint), never from the read verb or probe. A record with no backing checkout is stale residue
  (reported at read, reaped at the next state-touching site). A recordless checkout branches by design-state:
  the free-at-rest primary is recordless *by design* (free = absent excursion record); an ARC-marker-bearing WU
  worktree **adopts** (backfill mint from its meta); a marker-bearing transient worktree backfills from the
  errand-records ref (branch → record join); a genuinely markerless checkout is unmanaged/legacy (prompt-tier).
  Backfill at session-init is also the rollout path for checkouts predating the model.
- **Loadset is derived, not stored.** The record stores the inputs (locus kind, subject); the loadset is
  computed at read time the same way session-init's `loadSet` manifest is computed. A stored
  loadset snapshot would go stale between suspend and resume, and a per-record loading field is exactly what
  `strategy-knowledge-evolution.md` Principle 4 rules out (access paths derive from structure).
- **Stage is derived, not stored — same principle.** The record never carries the WU's lifecycle stage:
  consumers needing it join the record's subject pointer with the subject's meta at read time
  (`Current Workflow` today; the `wu-lifecycle-state-model` vocabulary once it lands). A stored stage would go
  stale mid-locus, and it would force every `set-stage` ceremony to remember a second write. Live parallel
  practice confirmed the stage signal is load-bearing (quick-scan across five in-flight WUs; stage-vocabulary
  capture routed to `wu-lifecycle-state-model` 2026-07-18) — the locus record serves it by *join*, not by
  storage.
- **Lifecycle:** the role is minted when a locus is established (spawn, `errand open`, the grooming open,
  materialize) and popped at close/teardown; the lease attaches at each session entry and releases at session
  end. **Transient roles are session-bounded** — errand, grooming, and housekeep occupancy pops with the
  session that established it (ship/close), so a transient role with a dead lease is always crash-or-walk-away
  residue, and both converge to one recovery surface: resume-and-ship, or abandon. WU roles are durable (spawn
  through teardown), and a live role with no lease is their normal idle state between sessions. Consumed by
  recovery, session-init, the fire-site occupancy check, and the residue/cleanup surfaces; recovery consumes
  the record instead of reconstructing intent from branch presence and a harness summary.
- **Grooming-open records (motivating evidence):** the sanctioned `chore/groom-*` branch currently carries no
  record, so the in-flight-derivation residue advisory misclassifies a live grooming locus as cleanup-needed
  (`in-flight-derivation.ts:1303`) and re-fires on effectively every CLI invocation (5× in one session,
  2026-07-15), with `arc start` mislabeling the emission a "ROADMAP advisory". The durable fix is records on
  both authority domains: the grooming open mints the machine-local role + lease (occupancy) **and a
  groom-kind record in the errand-records ref** (in-flight identity, open through merge — the detectors already
  classify recorded errand branches correctly, so groom-kind records inherit that path; this resolves
  session-init's standing "grooming-open primitive owns the branch record" forward-pointer). Detectors read
  records, never branch shape. A near-term detector patch is a mechanization Errand around the model — see
  Boundaries.

### Identity records vs. locus records (authority-domain homing)

Errand identity already lives in the orphan state-ref `refs/arc/user/{identity}/errands` (identity-scoped,
machine-agnostic, records-only) — grooming in-flight identity joins that ref as a groom-kind record (above);
WU identity lives in metas. The locus record answers the orthogonal question —
*where does work physically execute on this machine, and what frame governs it* — and carries only a subject
pointer, never duplicated identity fields. Occupancy never syncs cross-machine; identity never encodes locus.

The general rule (the scope-model note from the storage-substrate grooming, integrated): **state homes in its
authority domain, and consumers query across domains rather than replicate.** Machine/worktree-local facts —
occupancy, frames, leases (the run-tracker precedent: a PID is meaningful only on the machine) — live in the
machine-local record; identity-scoped facts in the identity refs; WU lifecycle facts (stage, deps, state) in the
tracked meta substrate. No locus field is a shared-store record; no shared-store field is duplicated into the
locus record. The read verb is the join surface.

### Read-verb consumers

The read verb answers "what is each session/checkout on this machine doing, where" — joined at read time with
the authority domains above for stage and identity.

**Surface (settled): both exposures over one core reader.** A single library-level read — the per-locus records,
a `git worktree list` reconcile, and the authority-domain joins — exposed as (a) a **session-init probe slot**
(orientation, recovery, and the fire-site occupancy check consume the envelope) and (b) a **lean standalone
verb**: read-only, network-free, fast enough for a statusline to poll, `--json` for tools, a human-readable
roster by default. The verb's name is deferred to spec time, coordinated with `naming-conventions` and adjacent
to `status-hud`'s verb-family call — the settled boundary (minimal roster here, rendering there) is the
load-bearing part, not the name.

Consumers in view (shaping input, not all in-scope deliverables):

- **Recovery and session-init orientation** — the primary consumers; recovery reads the record instead of the
  harness summary.
- **The fire-site occupancy check** — the serialization invariant's mechanical substrate.
- **`status-hud`** — its context card upgrades from oracle/meta/cursor proxies to record queries when this
  lands (seam recorded on both sides). Verb-territory boundary: this WU ships the probe slot and a minimal
  read verb; rich rendering — card, watch panel, any roster view — stays `status-hud`'s.
- **Stage-keyed session titles** — the retitle extension (captured 2026-07-18, § Errand: fire-site-driven at
  session-init + set-stage) serves live sessions event-driven; the read verb serves cold/external consumers
  (worktree-listing UIs, statusline/prompt renders, session managers).
- **Run-anywhere hygiene view (candidate):** husk/orphan cleanup currently surfaces only in the primary
  worktree, invisible to operators living in linked worktrees — seam with `husk-lifecycle-drivers`, which owns
  where that surfacing renders. FP's 7.3 disposition preserved the linked-session gate boundary expecting this
  record to be what eventually lifts it (`notes-finalize-parallelism.md` § 7.3).
- **(Awareness, not obligation)** the concurrency-attention posture — the "scale concurrency to the attention
  you can give it" reads (concurrent-workload advisory, design-slot bookkeeping, the stage-aware design-load
  model tracked in `draft-stage-aware-design-load.md`) currently consume static meta fields; this WU's records
  are the eventual live substrate (what is actually open, where attention actually is). No design here; keep
  the consumer in view when shaping the records.

### Errand sweep-loop close (locus-pop connective tissue)

Integrated from the routed capture (2026-07-16), unblocked by 5.3's batch-shape decision — the codified
sequential drain names per-errand overhead, not parallelism, as the lever:

- **`run-errand` close gains a next-offer.** When flagged `USER-INBOX § Errand` captures remain at close, offer
  continuing the sweep with the next one; today the drain side has this connective tissue (`drain-inbox` § 6
  hands each execute-now atomic to `run-errand` and returns) but a sweep entered via `arc-session --errand`, or
  continued past the first errand, has no loop.
- **Doorway legibility.** Bare `--errand` resolving against multiple flagged captures soft-offers the drain —
  most cold entries from the primary want the sweep, which is `--housekeep`'s umbrella. Semantics preserved:
  housekeep stays the triage+sweep umbrella, `run-errand` stays single-concern, and no queue artifact returns
  (`ERRANDS.md` retired deliberately — the inbox is the durable queue; the session carries the agreed slate).
- **Ownership settled here.** The loop is sweep mechanics over whatever inbox feeds it (`USER-INBOX` today, the
  shared surface later) — locus-shape connective tissue (what a transient locus offers at pop), not inbox-model
  semantics. `shared-inbox-model` is cross-referenced, not the owner.

### Consumed shipped behavior — the interim close fix

The pre-wave-3 topology fix **shipped** (PR #241): v2 errand records persist the caller branch
(`returnBranch`); `errand close` restores the pre-open branch, detaching at a refreshed base when no safe
return branch exists. This design consumes its requirements without preserving its shape:

- **Preserved:** close restores what open displaced; close never assumes the base is switchable from a linked
  worktree.
- **Not preserved:** displacement itself. The settled locus shape removes displacement rather than
  record-and-restore it. During the transition, `returnBranch` remains the branch-level projection of the
  frame-restore concern; the frame record subsumes it once the warm path stops displacing.
- **Retained as the degrade path:** where a harness cannot operate outside its boot directory, warm entry
  falls back to in-place displacement with record-and-restore — the shipped behavior survives as the durable
  fallback for that case, not as a transitional shape awaiting deletion. On this arm no second machine-local
  record is minted (single-locus keying holds): the checkout keeps its durable WU role, and recovery composes
  that role with the errand record's `returnBranch` to derive the displaced frame. The arm is empty for both
  named harnesses today.

### Creation-time provenance (ownership markers)

Every ARC-created or ARC-materialized worktree writes ownership provenance at creation. Session-init's
materialize arm currently uses raw `git worktree add`, so materialized Errand worktrees are invisible to
cleanup surfaces and a self-teardown can leave a markerless husk. The spawn/materialize primitive owns the
marker write, and the locus model **subsumes the raw arm**: errand materialize becomes an ARC verb-path that
writes marker + role record at creation, and session-init's raw `git worktree add` arm retires. Marker and
locus record stay distinct: the marker is durable provenance the sweep trusts; the record is the live frame.

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

**Liveness model (settled):** four layered signals, each in a distinct role — never age alone:

- **Explicit pop** at close/teardown is the primary release path.
- **Process anchor** is the lease's dead/live oracle: at each lease attach, record the nearest *durable*
  ancestor process as a `(pid, start-time)` pair — the walk skips the transient per-command shell harnesses
  spawn, and the start-time pairing defeats PID reuse. Verification returns three honest answers: anchor
  conclusively gone → the lease is **dead** (no live session — a durable WU role's normal idle state; a
  transient role's crash-or-walk-away residue); anchor alive → **live** (suppress cleanup — conservative in the
  right direction: alive-but-moved-on only delays cleanup, never destroys); walk failed, fields missing,
  platform unverifiable, or legacy record → **unknown → prompt**, the floor.
- **Heartbeat** — state-touching CLI invocations refresh the active locus's lease timestamp (a directed
  cross-directory invocation refreshes the target checkout's record); the read verb and probe never write.
  Framing only ("last activity 3d ago" reads differently than "20 minutes ago"), never an auto-remove signal.
- **Harness session-end hooks** are opportunistic additional pop sites where a harness offers them — never
  assumed (the same observability-parity discipline the drain decision applied to subagents).

Crash-without-pop resolves cleanly under the composition: the crashed session's anchor is gone → dead lease —
on a transient role, that is residue and the recovery surface offers resume-and-ship or abandon; physical
auto-remove fires only when every existing husk predicate also passes. Per-platform ancestry-walk mechanics are
implementation detail below the divergence test.

## Alternatives

- **Frame state in the harness summary (status quo):** rejected — the least-trusted recovery channel; the
  wave-2 compaction loss is the direct evidence.
- **Extend the ref-backed errand records with locus/frame fields:** rejected — that ref is identity-scoped and
  machine-agnostic; locus is a per-machine fact, and syncing occupancy cross-machine is noise at best and
  misleading at worst. (The adopted groom-kind record is not this: it adds an *identity* record for in-flight
  grooming to the ref — the same records-only class as errand records — never locus or occupancy fields.)
- **A general session-frame stack:** rejected — depth is two by construction; one parent pointer suffices, and
  a stack invites the nesting the model forbids.
- **Displacement warn-and-confirm as the durable model (the interim fix's shape):** rejected — removes the
  failure class by removing displacement, not by narrating it.
- **Ephemeral Errand worktrees as the default warm shape (this draft's pre-wave-3 lean):** superseded by FP
  5.3's evidence-backed resolution. Every observed drain and errand cycle ran primary-sequential cleanly beside
  two live WU sessions; the worktree-per-errand tax buys nothing the serialization invariant doesn't already
  provide at observed scale. The two grounds on which this draft had rejected relocate-to-primary both
  dissolved: occupancy cost is governed by the invariant (cell 5.2.c — the occupancy rule is what keeps the
  shared-checkout compaction-seed clobber benign), and the session-home/active-locus truth gap exists under
  either shape and is closed by the same orientation surface this WU builds. Spawn survives as the
  occupancy-keyed fallback, not the default.

## Deferred to spec — implementation detail

The formerly-open evidence questions (contention/drain shape, launchpad-occupancy collision rate, ephemeral
provisioning economics) were consumed from wave 3, and the three mechanism designs (lease liveness, record
granularity/keying, read-verb surface) are settled in Design above (2026-07-18). What remains is below the
divergence test:

- The read verb's **name** — coordinated with `naming-conventions`, adjacent to `status-hud`'s verb-family call.
- **Per-platform process-anchor mechanics** — the ancestry walk and `(pid, start-time)` verification per OS;
  unverifiable platforms degrade to the prompt tier by construction.
- **Record schema particulars** — field grammar and file format for the per-locus records.

## Scope estimate

Large (week+, Heavy): CLI primitives (role + lease record schema, read verb), `errand open`/`close`, the
grooming open/ship path (groom-kind records + the groom-and-ship workflow revision), spawn/materialize
integration, session-init and recovery consumers, the `run-errand` close next-offer, doctrine placement.

## Boundaries carried from FP

- FP shipped 2026-07-17; wave-3 evidence is consumed above (§ Consumed decision — FP 5.3). The pre-wave-3
  topology-aware close fix shipped earlier (PR #241) and is consumed under Consumed shipped behavior — it was
  never this WU's execution.
- The base-sync verb and the stub mint-to-launch bundle are determinate mechanization Errands around the model
  (`stub-mint-to-launch` now sits in `backlog/planned/`). Wave 3 added direct evidence for the base-sync verb:
  the fetch-into-ref auto-pull is structurally refused at every linked-worktree init under the launchpad model
  (`notes-finalize-parallelism.md`, day-2 evidence 2026-07-16).
- A near-term residue-detector patch is likewise a mechanization Errand: teach the detector the
  `chore/groom-*` shape (label it in-flight grooming, resumable via `--plan`; drop the cleanup wording), dedup
  the emission (once per command, or the daily nudge-marker pattern), and fix the `arc start` provenance
  label. The durable fix is the grooming-open records above (occupancy + groom-kind identity).

## Coordination

- `wu-lifecycle-state-model` — owns state vocabulary; this record stores de-facto states as opaque values so it
  can re-vocabulary later without schema churn. Reciprocally, it consumes this WU's reporting record rather
  than rebuilding it (its own inbound buffer records that boundary). Stage-vocabulary capture routed to it
  2026-07-18 (quick-scan stage signal, derived tail states, roster-view placement); the derive-not-store stage
  decision above is the reciprocal half.
- `status-hud` (provisional) — record-consumer seam recorded on both sides; verb-territory boundary settled
  (minimal read verb + probe slot here, card/panel/roster rendering there). Stays provisional — its own gate
  (`arc-view` v1 evidence) is unchanged; promotion re-weighs at a later housekeep.
- `worktree-teardown-decoupling` (shipped) — emits the shipped-husk transition and the driver socket the lease
  composes with.
- `husk-lifecycle-drivers` — extends husk teardown to abandon and park-at-Planning; the lease predicate covers
  any stamped husk kind, not only shipped. It also owns where husk/orphan cleanup renders for worktree-resident
  operators; the locus-record read verb is a candidate carrier (seam recorded in its capture, re-affirmed by FP
  7.3's follow-up boundary).
- `shared-inbox-model` — cross-reference only: the sweep-loop close is owned here (locus-pop mechanics over any
  inbox backend); interruption-safe cross-store moves remain its concern.
- Session-retitle extension (§ Errand capture, 2026-07-18) — a fire-site consumer of the stage signal at
  session-init + set-stage; independent of this WU's execution but shaped by the same derive-at-read principle.
- Check-docs run at this grooming: `strategy-storage-evolution.md` (machine-local, non-backing-store record —
  composes) and `strategy-knowledge-evolution.md` (loadset and stage derived at read time, no stored loading
  fields — composes).

## Continuity

- **Readiness:** formalization-ready — two adversarial passes run (2026-07-18, `Heavy` cap). Pass one: one
  blocker (grooming suspend — dissolved by the session-bounded transient-loci invariant + groom-kind identity
  records), two majors (role/lease split; governing-workflow derive-not-store), three minors. Pass two: one
  major (ship→merge window — settled by the record-gated one-pass-per-stub rule), five coherence/taxonomy
  minors. All findings verified, folded, and closed; the settled core withstood both passes.
- **Next:** the draft-capture ceremony and the stage advance into create-spec.

---
