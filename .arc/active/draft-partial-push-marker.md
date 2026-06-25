# Draft: Partial-Push Marker

**Purpose:** Close the cross-machine partial-push invisibility gap. A **partial push** is the state where the
worktree push (`origin/<branch>`) succeeded but the user-notes push (`refs/notes/arc/user/{identity}`) failed.
The originating machine records this locally; sibling clones have no signal a push was incomplete — opening a
window for stale handoffs and (in narrow cases) recoverable data loss. This WU adds a **remote marker** so a
sibling can see "machine A attempted a notes push for HEAD X but didn't complete."

- **State:** Draft — split from `cross-machine-sync-coherence` at its 2026-06-25 decomposition (the correctness
  core: the remote-marker mechanism). Mechanism leans Option A (below); marker-staleness semantics and
  multi-machine reconciliation remain open (ordinary spec-time openness).

- **Created:** 2026-05-05 (as `cross-machine-sync-coherence`); split 2026-06-25.

- **Origin:** Surfaced during a remediation-pass audit of the user-notes sync surface. The remediation added
  local partial-push tracking via `recordPartialPushMarker`
  (`.arc/user/{identity}/.internal/.sync-state.json`) so the originating machine recognizes "we attempted a
  paired push and notes didn't fully propagate" on the next session. The marker is gitignored and
  machine-local; sibling clones cannot see it. The close-it design (a remote-marker mechanism) is this WU.

---

## Problem / Motivation

A partial push is structurally one-sided: `main` moved forward; notes did not — typically a network blip,
captive portal, sleep-mid-push, auth refresh, or transient remote issue.

On the originating machine, `recordPartialPushMarker` writes a local marker so subsequent operations recognize
the partial state and guide recovery (re-push notes next session, surface in `arc user status`). A separate
stale-local-note warning fires when the latest local note is attached to an ancestor of `HEAD`.

**Sibling clones have no visibility.** After `git pull`, a sibling sees `origin/<branch>` advanced,
`refs/notes/arc/user/{identity}` still at the older state, and **no signal** anything is missing. Its
session-init reads notes from the older state and proceeds as if the handoff was complete — silently.

### Realistic failure scenario (single user, multi-machine)

- **Mon evening, laptop:** `arc sync`; worktree push to `origin/main` succeeds; notes push fails (network);
  laptop writes the partial-push marker; lid closes.
- **Tue morning, desktop:** `git pull` fetches advanced `origin/main` + the notes ref still at the old state;
  `arc resume` reads session-notes from the old state → desktop continues from Sunday context, not Monday's.

The **stale handoff** is the user-visible failure — annoying, recoverable when noticed, not catastrophic.

### Narrower data-loss path (rare; requires explicit force)

If, after the partial push, machine B works and pushes notes successfully, then machine A resumes and `arc sync`
hits a non-fast-forward notes push, the recovery prompt offers merge / force / cancel. **Merge** preserves both;
**force** overwrites B's work. Data loss requires (a) partial push on A, (b) work on B before A resumes, (c) A
explicitly chooses force. The user's hands are on the wheel at the destructive step; the gap is that they lack
full information when making the call.

---

## Existing Safety Nets

What protects users today, by firing frequency:

1. **Stale-local-note warning on the originating machine** — when the latest local note attaches to an ancestor
   of `HEAD`, push/status surfaces warn. Self-heals on next session start on the same machine.
2. **Save verification (write-side postcondition)** — the originating machine's local notes are correct after
   save; only `origin` is stale.
3. **Recovery prompt defaults** — the non-fast-forward push recovery defaults to **merge** (preserves both);
   force is explicit opt-in, never `--yes`-accepted.
4. **Partial-push marker on the originating machine** — persists across same-machine sessions; cleared once
   `origin` matches the local notes ref.

The unprotected window: **between machine A's partial push and A's next session**, if B starts working in that
window. This WU closes it by making the marker visible cross-clone.

---

## Risk Gradient

| Scenario | Likelihood | Severity | Protected today? |
| --- | --- | --- | --- |
| Stale handoff on B (reads outdated session-notes from origin) | Low | Low — recoverable | No |
| B works on stale baseline (saves notes not reflecting A's intent) | Lower | Medium | Partial (merge default) |
| Force-push overwrites B's intermediate work | Very low | High — data loss | Partial (force is opt-in) |

Per-identity refs are independent; different developers' notes refs are decoupled by namespace. The mechanism
is per-identity.

---

## Alternatives

### Option A — sibling sync-state ref (probable lean)

Push a sibling notes ref `refs/notes/arc/sync-state/{identity}` paralleling the user notes ref, carrying
sync-state metadata (`lastAttemptedCommit`, `partialPushIntent`, `verifiedAt`). Pushed **before** the user
notes ref, so the marker reads "about to attempt user-notes push for HEAD X" — sibling B then detects (via the
origin notes ref still at the old state) that the intent wasn't fulfilled.

- **Pros:** git-native transport/storage; per-identity namespacing already established; ignorable by adopters
  who don't want it.
- **Cons:** the sibling ref is itself partial-push-prone (mitigated by the before-ordering); cross-machine
  conflict semantics; small per-save storage overhead.

### Option B — embed sync-state in the user notes payload

Rejected for the partial-push case: the missing-on-origin payload would also carry the missing-on-origin
sync-state, so it doesn't solve the visibility problem. Also couples sync-state evolution to the notes schema.

### Option C — server-side hook / out-of-band signal

Strongest signal (origin reports the partial state) but requires server cooperation, isn't portable across
hosts, and breaks the git-only substrate. At most a documented integration pattern for self-hosted setups.

### Probable lean

**Option A**, with the marker-before-notes ordering. A variation — a single combined ref carrying both metadata
and the notes — is atomic by construction at the cost of co-evolving the schema. PRD-time call.

---

## Unknowns and Assumptions (marker semantics)

- **Partial state of the marker itself** — the sibling ref can also fail to push. How does B distinguish "A
  intended to push, didn't" from "marker is stale because A is offline"? Likely a TTL or per-attempt sequence
  number.
- **Multi-machine reconciliation** — when A and B both push sync-state markers, what merge semantic?
  Last-writer-wins (simple, lossy) vs. per-machine sub-paths (`…/sync-state/{identity}/{machine-id}`, correct
  but needs machine-id provisioning).
- **Read-only consumers** — a clone that fetches but never pushes consumes the marker without writing it;
  confirm safe.
- **Migration** — existing repos have no sibling ref; first post-implementation push creates it; the
  consumer-side fallback (no ref → behave as today) is the default-safe behavior.
- **`pm.mode: external` interaction** — opt-out per the configurability principles.
- **Detection vs. surfacing** — once B can detect the partial state, the surface (session-init warning, output
  channel, blocker) is tiered by severity. (The B-side detection/surfacing surfaces are
  `stale-state-detect-and-pull`'s; this WU owns producing the marker.)

---

## Dependencies / Interactions

- **Worktree Foundation** (shipped): partial-push semantics apply per-worktree; the marker mechanism handles
  worktree-scoped HEAD (per-worktree HEAD in the sync-state, not just the main worktree's).
- **Interlock release wrappers** (shipped): `arc release push` consumes sync-state for audit-log composition; a
  remote marker extends that audit story with cross-machine provenance.
- **`stale-state-detect-and-pull`** (cohort sibling): consumes this marker's freshness signal on the B side
  (detection + remediation). No hard edge — parallel members; the marker is produced here, consumed there.
- **`external-coord-probe`** (relocated standalone): optionally consumes sync-state freshness as a ranking
  signal — soft, cross-WU.
- **Team mode:** per-identity refs are independent; if a broader scope ever absorbs sibling-sessions, the
  single-machine inter-process race is `state-ref-write-safety`'s (agile-parallelism), not this WU's.

## Anti-goals

- **Replace local partial-push tracking** — the local marker stays authoritative on the originating machine;
  the remote mechanism is additive.
- **Block force-push** — the advisory refusal of *automatic* force-push is the right policy; this surfaces
  information, users still own destructive choices.
- **Solve all cross-machine sync coherence** — partial-push is the proximal concern; B-side staleness detection
  is the sibling member's.
- **Add a server-side dependency** — client-side and storage-only by default.

## Coordination — ADR-022

ADR-022's notes-synced managed operational-state documents depend on this WU's transport hardening — the
partial-push gap gates the "notes-synced" storage classification for those members. Coordinate; do not assume
the transport solved. See `adr-022-managed-operational-state-documents.md` § Coordination.

## Forward-compat

The marker lifts into `arc-backend`'s version-checked-writes / optimistic-concurrency substrate
(`draft-arc-backend.md` § Concurrency & Version History) without reshape. It is the **cross-machine twin** of
`state-ref-write-safety`'s single-machine CAS — together the two halves of "don't clobber shared state."

---
