# Draft: Partial-Push Marker

**Purpose:** Close the cross-machine partial-push invisibility gap, and make recovery from it painless for both
the user and the operating agent. A **partial push** is the state where the worktree push (`origin/<branch>`)
succeeded but the user-notes push (`refs/notes/arc/user/{identity}`) failed. The originating machine records this
locally; sibling clones have no signal a push was incomplete — opening a window for stale handoffs and (in narrow
cases) recoverable data loss. This WU owns the **full partial-push lifecycle**: a **remote marker** so a sibling
can see "machine A attempted a notes push for HEAD X but didn't complete," plus the **push-time recovery surface**
on the originating machine that resolves most cases before they ever persist.

- **State:** Draft — `formalization-ready`. Split from `cross-machine-sync-coherence` at its 2026-06-25
  decomposition (the correctness core: the remote-marker mechanism). Mechanism, recovery presentation, marker
  liveness, and multi-machine reconciliation are all settled; remaining open items are spec-time detail
  (migration, read-only consumers, `pm.mode: external`, the TTL value).

- **Created:** 2026-05-05 (as `cross-machine-sync-coherence`); split 2026-06-25.

- **Origin:** Surfaced during a remediation-pass audit of the user-notes sync surface. The remediation added
  local partial-push tracking via `recordPartialPushMarker`
  (`.arc/user/{identity}/.internal/.sync-state.json`) so the originating machine recognizes "we attempted a
  paired push and notes didn't fully propagate" on the next session. The marker is gitignored and
  machine-local; sibling clones cannot see it. The close-it design (a remote-marker mechanism) is this WU.

---

## Continuity

> *Readiness-state and decision record for cross-session resumption — see the draft-design workflow.*

- **Readiness:** `formalization-ready` — every settle-able decision is settled; a suitable input for create-spec.
- **Resolved:**
    - **Mechanism = detect, not prevent.** Option A (separate sibling sync-state ref, pushed before the notes
      ref). Prevention (atomic / notes-first-abort) set aside — it couples the code push to the notes push.
      Option B rejected; Option C (server-side) is documented-only, out of scope. (§ Mechanism.)
    - **Recovery is presented as "lag, not loss," across three registers** (Act / Aware / Caution), with an
      interactivity contract that never hangs an agent-run handoff. (§ Recovery presentation & lifecycle.)
    - **Scope widened** to the full partial-push lifecycle, absorbing the A-side push-time surface.
    - **Marker liveness (fork 2)** — comparison against the notes ref is the primary self-invalidation mechanism
      (no clock); a TTL backstop ages out *abandoned* intents. The per-attempt sequence number folded into fork 3
      and dissolved.
    - **Multi-machine reconciliation (fork 3)** — per-machine entries keyed by a machine-local random UUID (not
      last-writer-wins), union-merged by key. The new sync-state ref is a third state-ref → soft coordination
      with `state-ref-write-safety`'s CAS.
    - **`cli-substrate-adoption`** — soft compose-with, not a hard dependency.
- **Open (spec-time detail):** migration, read-only consumers, `pm.mode: external` opt-out, the TTL value.
- **Next:** create-spec (stage advanced at capture).

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
window. This WU closes it by making the marker visible cross-clone — and shrinks it further by resolving most
partial pushes at push-time on A (§ Recovery presentation & lifecycle).

---

## Risk Gradient

| Scenario                                                          | Likelihood | Severity          | Protected today?          |
|-------------------------------------------------------------------|------------|-------------------|---------------------------|
| Stale handoff on B (reads outdated session-notes from origin)     | Low        | Low — recoverable | No                        |
| B works on stale baseline (saves notes not reflecting A's intent) | Lower      | Medium            | Partial (merge default)   |
| Force-push overwrites B's intermediate work                       | Very low   | High — data loss  | Partial (force is opt-in) |

Per-identity refs are independent; different developers' notes refs are decoupled by namespace. The mechanism
is per-identity.

---

## Mechanism — detect, not prevent

**Settled: Option A** — a sibling sync-state ref, detection-based. The decision walked three postures:

- **Detect (Option A, chosen).** Let `main` land, accept the partial state, record a marker so a sibling can
  *notice* and recover. Client-side, git-native, best-effort.
- **Prevent (set aside).** Make `main` and notes move together so the partial state never exists — via an atomic
  multi-ref push (`git push --atomic`) or notes-first-with-abort. Rejected because **coupling is intrinsic to
  prevention**: you cannot eliminate the partial-push window without making the code push contingent on the notes
  push (atomic couples at the server; notes-first only prevents the bad state if it aborts `main` on notes
  failure, which re-couples at the client). Notes are *continuity, not correctness* — the code push is the
  high-value, time-critical action, and making it fragile to a transient notes hiccup is the wrong trade. The
  severity gradient agrees: the only High-severity outcome already requires explicit force.
- **Server-enforce (Option C — documented-only).** See § Alternatives considered.

### Option A — sibling sync-state ref

Push a sibling notes ref `refs/notes/arc/sync-state/{identity}` paralleling the user notes ref, carrying
sync-state metadata. Pushed **before** the user notes ref, so the marker reads "about to attempt user-notes push
for HEAD X" — sibling B then detects (via the origin notes ref still at the old state) that the intent wasn't
fulfilled.

- **Pros:** git-native transport/storage; per-identity namespacing already established; ignorable by projects
  that don't want it; degrades safe (no ref → behave as today); composes with the B-side consumer and lifts into
  the `arc-backend` substrate (§ Forward-compat).
- **Cons:** the sibling ref is itself partial-push-prone (mitigated by the before-ordering — if it fails too,
  B behaves as today, no regression); cross-machine conflict semantics (handled below); small per-save storage
  overhead.
- **Residual gap (accepted):** the before-ordering narrows the window to cases where the marker push fails
  *alongside* the notes push (e.g. total connection loss). Those are the Low/Medium-severity outcomes, already
  netted by the shipped local marker (caught on A's own next session) and the explicit-force gate on the only
  High case. A shrinks the window and makes it *visible*; it does not close it to zero, which the severity
  profile does not warrant.

### Marker structure & payload (multi-machine reconciliation)

The sync-state ref is identity-scoped — shared across all of one identity's machines — so its structure must let
**multiple machines' outstanding intents coexist.** Last-writer-wins is rejected: if the laptop has an
outstanding partial push for X and the desktop partial-pushes for Y, a single LWW blob lets the desktop overwrite
the laptop's marker — reopening the exact gap this WU closes, in the multi-machine case it targets.

**Per-machine entries, keyed by machine-id.** Each entry is `{machineId, lastAttemptedCommit, attemptTimestamp,
intent}`; a machine writes only its own key. The payload affords a calm, accurate B-side surface (§ Recovery
presentation) — *which* work (`lastAttemptedCommit` → the short-sha), *when* (`attemptTimestamp` → "from A's
session on `<when>`"), and *whose* (`machineId` → "machine A").

- **Machine-id is cheap** — a one-time, lazy-generated **random UUID** stored machine-locally (git config or the
  existing `.sync-state.json`), no user ceremony. Random, not the hostname, so machine names don't leak into a
  ref collaborators can fetch.
- **Reconciliation = union-merge by key.** Because each machine owns its own key, concurrent cross-machine pushes
  have no true conflict — they union, reusing the shipped `mergeErrandTrees`-style union + non-fast-forward-retry
  pattern (the entry-list-union model `WORKING-MEMORY`/`USER-INBOX` already use).
- **No tombstones in the common path.** A machine *overwrites its own key* on each attempt (no conflict);
  fulfilled entries go moot by comparison (below); the TTL backstop lazily prunes abandoned ones. Deletion only
  ever touches a machine's own key.

### Marker liveness & staleness

How a consumer distinguishes "A intended a push, didn't complete" (live → surface) from "stale / self-resolved"
(don't surface):

- **Primary: comparison against the notes ref (no clock).** The entry records the notes-ref state A was
  advancing to; B compares `origin`'s actual notes ref against it. Notes for X landed → intent fulfilled →
  the entry **self-invalidates by construction**, and the B-side surface falls silent. Notes ref still behind →
  live partial push → surface. This handles the common case (A's retry succeeds → B sees nothing) with no timer.
- **Backstop: a TTL for abandoned intent.** The one case comparison can't close: A attempts a push for X, it
  fails, and A never returns. Past N days, the TTL suppresses/downgrades the Aware surface so it doesn't nag
  forever (the stale-warning failure mode). `attemptTimestamp` is its input; the value is a config/spec-time
  detail.
- **The sequence number dissolves.** With per-machine ownership each machine writes its own entry serially, so
  `attemptTimestamp` + ownership already orders things — no cross-entry counter. The only residual ordering
  hazard is two processes on the *same* machine racing on that machine's own entry, which is
  `state-ref-write-safety`'s single-machine CAS scope, not a counter here.

### Alternatives considered

- **Option B — embed sync-state in the user notes payload.** Rejected for the partial-push case: the
  missing-on-origin payload would also carry the missing-on-origin sync-state, so it doesn't solve the visibility
  problem. Also couples sync-state evolution to the notes schema. (The "single combined ref" variation inherits
  the same flaw — if the one ref's push fails, the marker fails with it.)
- **Option C — server-side hook / out-of-band signal.** Strongest signal (origin reports the partial state,
  authoritative for all clients including ARC-unaware ones) but requires server cooperation, isn't portable
  across hosts (you cannot install pre-receive hooks on a stock GitHub/GitLab repo), and breaks the git-only,
  client-side substrate the sync design rests on. **Disposition:** documented-only — an optional opt-in pattern
  for self-hosted setups that control the server, explicitly **not** this WU's deliverable.

---

## Recovery presentation & lifecycle

The headline goal is painlessness. The partial-push state is recoverable and (on the originating machine)
self-healing, so the governing principle is **"lag, not loss": never present the situation as worse than it is.**
A's work is safe on A; it just hasn't arrived. The worst presentation failure is alarming someone into thinking
they've stumbled into data loss when nothing is lost.

**Self-healing model — be honest about the asymmetry:**

- **On A (originating): genuinely self-healing — and should offer agency.** The local marker clears once `origin`
  matches A's notes ref, so A's next session re-pushes and the state dissolves. But "correct eventually" is not
  the experience to ship: the failure is detected *at push-time*, so that is the moment to act.
- **On B (sibling): detect-and-wait, not self-healing.** A's notes never reached `origin`; B cannot pull what
  was never pushed. B's "recovery" is *awareness* — it declines to clobber and the real fix is A returning to
  complete the push. (The B-side rendering is `stale-state-detect-and-pull`'s; this WU produces the marker and
  specifies the intended register.)

**Three registers — one per (machine, moment):**

| Register    | Where                | Posture              | Action                                                   |
|-------------|----------------------|----------------------|----------------------------------------------------------|
| **Act**     | A, at push-time      | resolve now          | auto-retry w/ backoff → primed retry → informed deferral |
| **Aware**   | B, at session-init   | lag, not loss        | calm advisory one-liner; non-gating                      |
| **Caution** | B, at the force gate | context for the call | merge-preserves-both framing; human-owned                |

### Act — A, at push-time

The notes leg fails inside `arc sync` / `arc release push`; resolve it there, not next session.

- **Auto-retry first, with short backoff** — a couple of quick silent retries. Most blips resolve in seconds;
  prompting for those is noise.
- **If still failing, surface a retry — defaulted to retry.** Retry is the recommended option (advisory-fork
  discipline): it is the usually-correct *and fully safe* action — re-attempting the same push carries zero
  clobber risk, unlike the force gate on B. That safety is why the agent may take retry readily where it must
  never auto-take a force.
- **If retry succeeds → the state never persists.** Notes land, the marker self-invalidates, B sees nothing.
  The cross-machine apparatus is the fallback for when in-the-moment recovery fails or the user defers.
- **If retry fails / the user defers → informed deferral.** The marker persists (local + remote), but the user
  *chose* that knowingly — never blindsided on B.

**Interactivity contract (load-bearing — `arc sync` is most often agent-run during `arc-handoff`):**

- The CLI commands stay **non-interactive-safe primitives**: auto-retry, structured result, and **never a
  blocking TTY prompt an agent-run invocation can't answer** (the `arc user open` hang trap). Interactivity is
  owned by the agent/workflow layer, not the CLI, whenever the command is agent-run.
- **Attended (human at the terminal, or an agent in a live session):** the *agent* surfaces the retry decision
  conversationally; a direct human CLI run may prompt only when TTY-attached.
- **Unattended (background / scheduled):** auto-retry, then persist the marker and **report plainly in output** —
  no prompt to hang on, no silent swallow.
- **`arc-handoff` is the highest-stakes Act site** — the last moment before leaving machine A for B, so a partial
  push there is precisely the case this WU exists to catch. The handoff workflow gains a defined behavior for the
  notes-push-failed outcome (surface the primed retry; on deferral, record it in the handoff report).

### Aware — B, at session-init

A calm, informational one-liner framed as lag: *"Machine A pushed code at `<short-sha>` but its session notes
for that work haven't synced yet (safe on A; will arrive when A's next online). Your local notes may trail A's
latest."* **Advisory, never a blocker** — it slots into session-init's existing advisory tier alongside
base-drift and local-ahead-notes, not the gate tier. For the **operating agent**: proceed-with-context;
**do-not-auto-resolve** (never force-push to "fix" stale notes). The surface falls silent the moment the marker
self-invalidates.

### Caution — B, at the force gate

The one place the marker earns elevated weight: when B is at the wheel of a non-fast-forward notes push / force.
There it surfaces as *context for the call* — *"A had an incomplete push here; merge preserves both, force would
overwrite"* — not an alarm. The user already owns that gate, and merge is the default.

---

## Unknowns and Assumptions (spec-time detail)

The fundamentals are settled (§ Mechanism, § Recovery presentation); these remain as determinate spec-time
detail, each with a default-safe lean:

- **Read-only consumers** — a clone that fetches but never pushes consumes the marker without writing it;
  confirm safe.
- **Migration** — existing repos have no sibling ref; first post-implementation push creates it; the
  consumer-side fallback (no ref → behave as today) is the default-safe behavior.
- **`pm.mode: external` interaction** — opt-out per the configurability principles (the existing axis, no new
  one).
- **TTL value** — the abandoned-intent threshold (§ Marker liveness); a single config value, not a new axis.
- **Detection vs. surfacing** — the B-side detection/surfacing surfaces are `stale-state-detect-and-pull`'s;
  this WU owns producing the marker and the *register/affordance contract* (§ Recovery presentation) the sibling
  renders against.

---

## Dependencies / Interactions

- **Worktree Foundation** (shipped): partial-push semantics apply per-worktree; the marker mechanism handles
  worktree-scoped HEAD (per-worktree HEAD in the sync-state, not just the main worktree's).
- **Interlock release wrappers** (shipped): `arc release push` consumes sync-state for audit-log composition; a
  remote marker extends that audit story with cross-machine provenance. The Act-register push-time retry surface
  lives in/around `arc release push` / `arc sync`.
- **`stale-state-detect-and-pull`** (cohort sibling): consumes this marker's freshness signal on the B side and
  owns the B-side rendering, against the register/affordance contract here. No hard edge — parallel members; the
  marker is produced here, consumed there.
- **`state-ref-write-safety`** (agile-parallelism — finalize-parallelism sibling): the **single-machine twin**.
  This WU introduces a **third state-ref** (the sync-state ref); its single-machine inter-process write safety
  should ride that WU's CAS primitive rather than reinvent it. Soft coordination — captured to its inbound queue.
- **`cli-substrate-adoption`** (Ready, not shipped): owns the queued "uniform non-interactive handling for
  agent-invoked prompting commands" contract. The interactivity contract above should *compose with* it rather
  than reinvent it. **Soft coordination, not a hard dependency** — a hard edge would gate this WU (and thus
  `finalize-parallelism`) on an unshipped P2; build non-interactive-safe by this WU's own construction and align
  when the uniform contract lands.
- **`user-sync-module-split`** (architecture-remediation): this WU *grows* the user-sync module surface (the new
  sync-state ref, push-before-notes ordering, the retry leg, marker read/write). Its decomposition should account
  for that addition. Soft coordination — captured to its inbound queue.
- **`arc-handoff`** (workflow): the highest-stakes Act-register site; gains a defined notes-push-failed behavior
  (§ Recovery presentation). Coordination seam, not a code dependency.
- **`external-coord-probe`** (relocated standalone): optionally consumes sync-state freshness as a ranking
  signal — soft, cross-WU.
- **Team mode:** per-identity refs are independent; if a broader scope ever absorbs sibling-sessions, the
  single-machine inter-process race is `state-ref-write-safety`'s, not this WU's.

## Anti-goals

- **Replace local partial-push tracking** — the local marker stays authoritative on the originating machine;
  the remote mechanism and the push-time surface are additive.
- **Block force-push** — the advisory refusal of *automatic* force-push is the right policy; this surfaces
  information, users still own destructive choices.
- **Couple the code push to the notes push** — prevention is set aside precisely to keep the code push
  unconditional (§ Mechanism); the code reaching `origin` is never made contingent on notes syncing.
- **Solve all cross-machine sync coherence** — partial-push is the proximal concern; B-side staleness detection
  is the sibling member's.
- **Add a server-side dependency** — client-side and storage-only by default (Option C stays documented-only).

## Coordination — ADR-022

ADR-022's notes-synced managed operational-state documents depend on this WU's transport hardening — the
partial-push gap gates the "notes-synced" storage classification for those members. Coordinate; do not assume
the transport solved. See `adr-022-managed-operational-state-documents.md` § Coordination. **Reference drift:**
ADR-022 § Risks + § Coordination (and `draft-arc-backend.md`) still name the retired `cross-machine-sync-coherence`
for this dependency; they should re-point to `partial-push-marker` — captured for cleanup.

## Forward-compat

The marker is a **storage-agnostic record**, not a tracked-tree artifact: the sync-state ref is its git-native
tier-2 transport, and the record lifts into `arc-backend`'s **version-checked-writes / optimistic-concurrency
substrate** (`draft-arc-backend.md` § Concurrency & Version History) without reshape — the CAS / union-merge /
non-fast-forward-retry shape *is* that substrate's optimistic concurrency in git-native form. Specific mappings,
per `strategy-storage-evolution` (Principles 2, 3, 5):

- **Per-machine keying → per-writer concurrency metadata** at the backend (not the "LWW small-records" bucket —
  this is concurrency-tracking, the version-checked-write machinery itself).
- **Machine-id → a client / session identifier** in the backend's concurrency layer.
- **The three-register recovery model prefigures the backend's load-bearing multi-writer-freshness bet** —
  own-edits-always-fresh (A's Act register) and deliberate-refresh-on-shared-reads (B's Aware register) are the
  git-native form of "fresh-on-your-writes, refresh-on-shared-reads."

It is the **cross-machine twin** of `state-ref-write-safety`'s single-machine CAS — together the two halves of
"don't clobber shared state."

---
