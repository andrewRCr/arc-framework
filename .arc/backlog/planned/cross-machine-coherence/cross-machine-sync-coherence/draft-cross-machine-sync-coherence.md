# Draft: Cross-Machine Sync-State Coherence

**Purpose:** Capture the design surface for closing the cross-machine partial-push invisibility gap in
the user-notes sync surface. Local partial-push markers protect the originating machine; sibling clones
have no signal that a push was incomplete, opening a window for stale handoffs and (in narrow cases)
recoverable data loss. Iterate before PRD promotion when implementation comes into reach.

- **State:** Draft — pre-PRD capture during a sync-surface audit on 2026-05-05. Iteration expected
  before PRD promotion.

- **Created:** 2026-05-05

- **Origin:** Surfaced during a remediation-pass audit of the user-notes sync surface. The remediation
  added local partial-push tracking via `recordPartialPushMarker`
  (`.arc/user/{identity}/.internal/.sync-state.json`) so the originating machine recognizes "we
  attempted a paired push and notes didn't fully propagate" on the next session. The marker is
  gitignored and machine-local; sibling clones cannot see it. Audit confirmed the close-it design
  (a remote-marker mechanism) is substantial enough to deserve its own plan rather than scope creep
  into the active remediation WU.

---

## Problem / Motivation

A **partial push** is the state where the worktree push (`origin/<branch>`) succeeded but the user-notes
push (`refs/notes/arc/user/{identity}`) failed — typically due to a network blip, captive portal,
sleep-mid-push, auth refresh, or a transient remote-side issue. The push is structurally partial: main
moved forward; notes did not.

On the originating machine, `recordPartialPushMarker` writes a local marker so subsequent operations
recognize the partial state and guide recovery (re-push notes on next session, surface the state in
`arc user status`). A separate stale-local-note warning fires when the latest local note is attached to
an ancestor of `HEAD` — protecting against a same-machine handoff if the user opens the same machine for
a new session before recovering.

Sibling clones — different machines belonging to the same identity, or other developers' machines in
team mode — have no visibility into this state. After `git pull`, a sibling sees:

- `origin/<branch>` advanced (as the originating machine intended)
- `refs/notes/arc/user/{identity}` still at the older state (the partial push didn't land)
- No signal that anything is missing

The sibling's session-init reads notes from the older state and proceeds as if the handoff was
complete. This is silent — no warning, no flag, no detail line.

### Realistic failure scenario (single user, multi-machine)

**Monday evening, laptop:**

1. User finishes work, runs `arc sync` (paired-push cell).
2. Worktree push to `origin/main` succeeds.
3. Notes push fails (network blip).
4. Laptop writes the partial-push marker; user closes the lid.

**Tuesday morning, desktop:**

1. `git pull` — fetches `origin/main` (advanced) and the notes ref (still at old state).
2. `arc resume` reads session-notes from the old state.
3. Desktop continues from Sunday context, not Monday-evening.

The **stale handoff** is the user-visible failure — annoying, recoverable when the user notices the
mismatch ("wait, this doesn't match where I left off"), but not catastrophic.

### Narrower data-loss path (rare; requires explicit force)

A second scenario compounds the partial push with a force-push recovery:

**Tuesday all day, desktop:** user works, saves, pushes notes successfully. `origin`'s notes ref now
points at desktop's Tuesday state.

**Tuesday evening, laptop:** user opens laptop, runs `arc sync`.

- The laptop's local notes ref is still at Monday-evening intent (ahead of the laptop's view of origin
  from Monday).
- Notes push gets rejected (non-fast-forward; `origin` advanced via desktop's Tuesday push).
- Recovery prompt offers merge / force / cancel.
- **Merge** preserves both. **Force** overwrites Tuesday desktop's work.

The advisory mechanism (refusing automatic force-push) gates this behind explicit user choice —
`--force` is opt-in, never `--yes`-accepted. Data loss requires (a) partial push on machine A, (b) work
on machine B before A resumes, (c) user explicitly chooses force at the recovery prompt.

The user's hands are on the wheel at the destructive step. The mechanism is designed to protect them;
the gap is that they don't have full information when making the call.

---

## Existing Safety Nets

What protects users today, in order of how often each fires:

1. **Stale-local-note warning on originating machine.** When the latest local note is attached to an
   ancestor of `HEAD`, push and status surfaces fire a warning. If the user opens the same machine for
   a new session before doing anything destructive, the surface tells them: "your last save didn't fully
   propagate, run `arc sync`." Self-heals on next session start.

2. **Save verification (write-side postcondition).** The originating machine's local notes are correct
   after save — the verification step ensures the in-memory manifest matches the readback. Only `origin`
   is stale; `local` is right.

3. **Recovery prompt defaults.** The non-fast-forward push recovery prompt defaults to **merge**
   (preserves both branches' notes). Force-push requires explicit user opt-in — never automatic, never
   `--yes`-accepted.

4. **Partial-push marker on the originating machine.** Persists across sessions on the same machine;
   surfaces during status reads and is cleared once `origin` matches local notes ref.

The unprotected window: **between machine A's partial push and machine A's next session**, if machine B
starts working in that window. The longer the window, the higher the chance B sees stale handoff
context.

---

## Risk Gradient

For a typical solo user with multi-machine rotation:

| Scenario | Likelihood | Severity | Currently protected? |
| -------- | ---------- | -------- | -------------------- |
| Stale handoff on B (B reads outdated session-notes from origin) | Low — requires partial push + B opens before A resumes | Low — annoying, recoverable | No |
| B works on stale baseline (saves session-notes that don't reflect A's intent) | Lower — requires the above + B saves and pushes before A resumes | Medium — A's prior work effectively lost from origin until merged on next conflict | Partial (recovery prompt's merge default protects on next push) |
| Force-push overwrites B's intermediate work | Very low — requires the above + A explicitly chooses force at recovery prompt | High — data loss | Partial (force-push is opt-in only) |

For team mode with multiple developers' notes:

- Per-identity notes refs are independent — partial push on identity X does not affect identity Y's
  notes.
- Shared-ref handoff between developers (if the same identity is shared, e.g., paired programming) has
  the same risk profile as solo multi-machine.

The mechanism is per-identity. Different developers' notes refs are decoupled by ref namespace.

---

## Scope of the Concern

Two related concerns share design surface; whether this plan addresses one or both is a PRD-time
decision.

**Narrow scope: cross-machine partial-push visibility only.**
Add a remote signal so machine B can see "machine A attempted to push notes for HEAD X but didn't
complete." Closes the stale-handoff and force-push-data-loss paths. Doesn't address other cross-machine
sync-state coherence questions.

**Broader scope: cross-context sync-state coherence.**
The local sync-state file (`.arc/user/{identity}/.internal/.sync-state.json`) carries more than
partial-push markers — it tracks `sourceCommit`, `verifiedAt`, save-state direction inference, and other
coherence metadata. The same invisibility gap applies across all of these. A future
sibling-sessions concern (sibling sessions on the same machine racing on the notes ref, where the local
sync-state file becomes stale relative to the actual notes ref) shares the design surface.

The narrow scope is sufficient for the immediate concern. The broad scope is the more durable design.

**Pre-PRD recommendation:** choose at PRD time, lean toward the broader scope if the design cost is
comparable. A remote sync-state mechanism that handles partial-push + sibling-sessions + load-symmetry
verification is more general than a partial-push-specific marker.

**Inbound from Worktree Foundation (2026-05-24): the orphan-warning T3 tier routes here.** WF's
orphan-warning surfacing ships T1 (content-equivalence rename detection) + T2 (subdir-grouped retirement
messaging), but defers **T3 — sync-state-aware drift detection** to this WU. T3 extends
`.internal/.sync-state.json` with the prior file-list so a warning can distinguish "intentional retirement
at source" from "real local drift, possibly unsaved work" — the same file and the same coherence question
as the broader scope above. WF establishes the `.sync-state.json` schema seam (so this WU's remote-marker
and T3 layer on without a rewrite); this WU owns the drift-detection layer. Fold T3 into the broader-scope
decision at PRD time.

**Inbound from Worktree Foundation (2026-05-25): the `branch-gone` `arc sync` notes-push softening routes
here.** WF's new `branch-gone` worktree state (split from `remote-unavailable`) inherits the conservative
sync treatment — both push legs blocked, refused with code 14 — to avoid regressing into auto-recreating a
deleted upstream. The worktree-push block is unconditionally correct (pushing a gone branch resurrects it);
the notes-push block is over-conservative for the common merged-then-deleted case, where the commits stay
reachable from `origin/main` so the notes wouldn't dangle. Refinement to evaluate: gate the notes push on
`HEAD`-reachable-from-`origin/main`, blocking only the rare unmerged force-delete — a "what's safe to push"
coherence judgment on this WU's surface. WF ships the conservative block; fold the reachability-gated
softening into the scope decision at PRD time.

---

## Alternatives

Three paths, not yet evaluated.

### Option A — sibling notes ref carrying sync-state metadata

Push a sibling notes ref alongside the user notes ref:
`refs/notes/arc/sync-state/{identity}` paralleling `refs/notes/arc/user/{identity}`.

The sibling ref's notes carry sync-state metadata (analogous to `.sync-state.json`):
`lastAttemptedCommit`, `partialPushIntent`, `verifiedAt`, etc. Pushed atomically with — or just
before — the user notes ref so partial-push intent is observable cross-clone.

**Pros:**

- Uses git's existing transport/storage. No new infrastructure.
- Per-identity ref namespacing already established for user notes.
- Adopters with `pm.mode: external` can ignore the ref without harm.

**Cons:**

- The sibling ref is itself subject to partial-push hazards — pushing two refs, one might fail.
  Recursive concern (see "Probable lean" below for one mitigation).
- Conflict semantics across machines: how does machine B reconcile its sync-state when its own writes
  diverge from origin's? Last-writer-wins is simplest but sacrifices correctness; per-machine sub-paths
  are more correct but introduce machine-id provisioning.
- Storage overhead per save (small but non-zero).

### Option B — embed sync-state in the user notes payload

Extend the user notes JSON manifest to carry a `syncState` field. The state travels with the notes
themselves; no separate ref.

**Pros:**

- Atomicity is native — there is no separate ref to push.
- One ref to fetch on B; one place to read state.

**Cons:**

- The "partial push" failure mode is exactly "the user notes ref didn't advance" — embedding sync-state
  in the user notes means the missing-on-origin payload also carries the missing-on-origin sync-state.
  Doesn't solve the visibility problem.
- Couples sync-state evolution to notes payload schema. Schema migrations are heavier.

This direction is probably wrong for the partial-push case but listed for completeness.

### Option C — server-side hook / out-of-band signal

A server-side post-receive hook (or equivalent forge integration) detects partial-push patterns
(worktree advanced, expected notes ref didn't advance) and writes a signal accessible to clients via a
separate API.

**Pros:**

- Strongest signal — origin itself reports the partial state.
- No client-side ref pollution.

**Cons:**

- Requires server-side cooperation. Not portable across hosting providers.
- The framework's design substrate is git-only; this introduces an out-of-band dependency.
- Adopter setup burden (must configure hook on origin or via forge integration).

Probably out of scope for the framework default. Could be a documented integration pattern for
self-hosted setups.

### Probable lean

Option A (sibling ref) is the most framework-shaped: git-native, per-identity, decoupled from notes
payload schema. The recursive partial-push hazard for the sibling ref is real but bounded — push the
sibling ref **before** the user notes ref, so the marker says "I'm about to attempt user notes push for
HEAD X" rather than "I successfully pushed user notes for HEAD X." Sibling B then knows A intended to
push and can detect (via origin notes ref still at old state) that the intent wasn't fulfilled.

Variation on Option A: a single combined ref carrying both the metadata and the user notes themselves,
with metadata in a manifest envelope. Atomic by construction at the cost of co-evolving the schema.
PRD-time call.

---

## Unknowns and Assumptions

- **Partial state of the marker itself.** The sibling ref can also fail to push. How does machine B
  distinguish "marker says A intended to push, didn't" from "marker is stale because A's machine is
  offline and the marker hasn't been updated"? Likely needs a TTL or per-attempt sequence number.

- **Multi-machine same-identity reconciliation.** When machine A pushes a sync-state marker and
  machine B simultaneously pushes its own, what's the merge semantic? Last-writer-wins is simplest but
  sacrifices correctness. Per-machine sub-paths
  (`refs/notes/arc/sync-state/{identity}/{machine-id}`) are more correct but introduce machine-id
  provisioning. Existing identity-resolution machinery may or may not cover this.

- **Read-only consumers.** What happens for a clone that fetches but never pushes (read-only
  collaborator pulling someone else's notes)? They consume sync-state but don't write it. Probably fine
  but worth confirming.

- **Migration.** Existing repos have no sibling ref. First push from a post-implementation client
  creates it; what about repos with mixed-version clients? The `arc update` path should handle this,
  but the consumer-side fallback (no sibling ref present → assume no partial-push state, behave as
  today) needs to be the default safe behavior.

- **Interaction with `pm.mode: external`.** Adopters using external trackers may not want any in-git
  sync-state proliferation. The mechanism should be opt-out per the framework's configurability
  principles.

- **Sibling-sessions concern.** If this plan adopts the broader scope, the sibling-ref design needs to
  handle same-machine inter-process races on the notes ref. Two sibling sessions both attempting to
  save and push could leave the marker in a weird state.

- **Detection vs. surfacing.** Once B can detect the partial state, what's the right surface? A
  session-init warning? A first-class sync-state output channel? A blocker on `arc resume` until
  acknowledged? Probably tiered by severity (warn for stale-handoff, block for known-pending-push).

---

## Dependencies / Interactions

**Worktree Foundation (`plan-worktree-foundation.md`):** When worktrees ship, partial-push semantics
apply per-worktree. The marker mechanism needs to handle worktree-scoped state correctly (likely:
per-worktree HEAD in the sync-state, not just the main worktree's HEAD).

**Interlock Release Wrappers (`plan-interlock-release-wrappers.md`):** The `arc release push` wrapper
consumes sync-state for audit-log composition. A remote marker mechanism would extend the audit-log
story across machines — "interlock state at decision time" gains cross-machine provenance.

**Coordination Probe (`plan-coord-probe.md`):** Cross-machine sync-state visibility and cross-machine
work-coordination signals are adjacent. The probe's "where am I working" answer benefits from
sync-state freshness data (B knows A's last save was attempted at HEAD X, even if it didn't fully
land).

**Team mode:** Currently per-identity refs are independent. If the broader scope absorbs
sibling-sessions, the team-mode story needs to handle multiple identities in parallel without
cross-contamination.

---

## Anti-goals

What this plan should *not* try to do:

- **Replace local partial-push tracking.** The local marker stays — it's the originating machine's
  authoritative state. The remote mechanism is additive: a way for siblings to see what the local
  marker says.
- **Block force-push.** The advisory refusal of automatic force-push is the right policy. The fix here
  surfaces information; users still own the destructive choices.
- **Solve all cross-machine sync coherence.** Partial-push is the proximal concern. A general-purpose
  distributed sync protocol is out of scope for the framework's git-native substrate.
- **Add a server-side dependency.** The framework works with any git host; the mechanism must be
  client-side and storage-only by default. Server-side hooks may be documented as an optional
  integration pattern.

---

## Scope Estimate

**Size:** Medium (days–week), sensitive to scope choice and dependency sequencing.

**Drivers of size:**

- **Narrow scope** (partial-push visibility only): a sibling ref + push ordering + B-side detection
  surface. Implementation on the order of days; design surface modest.
- **Broader scope** (cross-context sync-state coherence including sibling-sessions): adds a generic
  sync-state coordination mechanism with conflict semantics and per-machine reconciliation. Closer to
  a week.

**Dependencies that may shift sequencing:**

- `plan-worktree-foundation.md` — worktree-scoped HEAD changes the sync-state shape. Landing this plan
  before worktrees ship means a follow-on adjustment when worktrees arrive; landing after means
  designing for worktrees from the start.
- `plan-interlock-release-wrappers.md` — the audit-log composition consumes sync-state; cross-machine
  provenance fits naturally into the wrapper story.

**Acceptance criteria for PRD promotion:**

- A specific option is chosen (likely Option A with the "marker before notes" ordering).
- Scope is settled (narrow vs. broad).
- The unknowns on partial-state-of-the-marker, multi-machine reconciliation, and migration have
  proposed answers — not necessarily final, but concrete enough to derive requirements.
- Dependencies on `plan-worktree-foundation.md` and `plan-interlock-release-wrappers.md` are evaluated
  for sequencing.

The plan is **not** ready for PRD promotion as written — it captures the concern and the design space,
not a chosen shape.

## Coordination — ADR-022

ADR-022's notes-synced managed operational-state documents depend on this WU's transport hardening; the
partial-push gap gates the "notes-synced" storage classification for those members. Coordinate; do not assume
the transport solved. See `adr-022-managed-operational-state-documents.md` § Coordination.
