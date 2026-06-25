# Spec (`detailed` · `RFC`): partial-push-marker

- **Origin:** [internal]

- **Purpose:** Close the cross-machine partial-push invisibility gap and make recovery painless. A **partial
  push** — worktree push to `origin/<branch>` succeeded, user-notes push to `refs/notes/arc/user/{identity}`
  failed — is recorded locally on the originating machine but invisible to sibling clones, opening a window for
  stale handoffs and (under explicit force) recoverable data loss. This WU owns the full partial-push lifecycle:
  a **remote marker** that makes the incomplete push visible cross-clone, plus the **push-time recovery surface**
  on the originating machine that resolves most cases before they ever persist.

---

## Introduction / Context

A partial push is structurally one-sided: `main` moved forward; notes did not — typically a network blip,
captive portal, sleep-mid-push, auth refresh, or transient remote issue. The worktree push is the high-value,
time-critical action; the notes push carries *continuity, not correctness*.

On the originating machine ("A"), `recordPartialPushMarker` writes a local marker
(`.arc/user/{identity}/.internal/.sync-state.json`) so subsequent operations recognize the partial state and
guide recovery on A's next session. That marker is gitignored and machine-local — **sibling clones cannot see
it.** After `git pull`, a sibling ("B") sees `origin/<branch>` advanced, `refs/notes/arc/user/{identity}` still
at the older state, and **no signal** anything is missing. Its session-init reads notes from the older state and
proceeds as if the handoff completed — silently.

Two failure outcomes follow from that invisibility:

- **Stale handoff (the common case).** B reads outdated session-notes from origin and continues from the wrong
  context. Annoying, recoverable when noticed, not catastrophic.
- **Force-overwrite (rare, requires explicit force).** If B works and pushes notes after A's partial push, then
  A resumes and `arc sync` hits a non-fast-forward notes push, the recovery prompt offers merge / force / cancel.
  Merge preserves both; **force** overwrites B's work. Data loss requires a partial push on A, work on B before A
  resumes, *and* A explicitly choosing force — the user's hands are on the wheel at the destructive step, but
  they lack full information when making the call.

The unprotected window is **between A's partial push and A's next session**, if B starts working in it. The
shipped safety nets (stale-local-note warning on A, save-side postcondition, merge-default recovery, the local
marker) all fire on A or behind an explicit force — none gives B visibility. This WU closes the window by making
the marker visible cross-clone, and shrinks it further by resolving most partial pushes at push-time on A.

## Goals

- **Cross-clone visibility.** A sibling clone can detect that the originating machine attempted a notes push for
  a given HEAD but did not complete it — without server cooperation, using git-native transport only.
- **Multi-machine correctness.** Multiple machines under one identity may each hold an outstanding partial-push
  intent simultaneously without clobbering each other's marker.
- **Self-resolving in the common case.** A marker for a push that later succeeds falls silent automatically, with
  no timer — the consumer surface goes quiet the moment the notes actually land at origin.
- **Push-time recovery on A.** Most partial pushes resolve at the moment of failure (auto-retry, then an offered
  retry) so the cross-machine apparatus is the fallback, not the front line.
- **"Lag, not loss" presentation.** The situation is never presented as worse than it is. A's work is safe on A;
  it just hasn't arrived. The marker specifies the registers and affordances the consumer renders against.
- **Agent-run-safe.** `arc sync` / `arc release push` are most often agent-run during handoff; no recovery path
  may hang on a blocking TTY prompt an agent-run invocation cannot answer.
- **Degrade safe.** Absent the ref, or against a clone that only fetches, behavior is exactly as today.

## Non-Goals

- **Prevent the partial state.** Coupling the code push to the notes push (atomic multi-ref push, or
  notes-first-with-abort) is set aside — the code reaching `origin` is never made contingent on notes syncing
  (§ Alternatives & Rationale).
- **Render the B-side surface.** Producing the marker and specifying the register/affordance contract is this
  WU; the actual B-side detection and rendering (session-init Aware one-liner, force-gate Caution context) is
  `stale-state-detect-and-pull`'s.
- **Block force-push.** The advisory refusal of *automatic* force-push is the right policy; this surfaces
  information so the human owns the destructive choice with full context — it does not gate it.
- **Replace local partial-push tracking.** The local marker stays authoritative on A; the remote marker and the
  push-time surface are additive.
- **Add a server-side dependency.** Client-side and git-native by default; the server-enforced option stays
  documented-only.
- **Solve all cross-machine sync coherence.** B-side arrival staleness (base-ref drift, `plan/`-orphans,
  notes/disk drift) is the cohort sibling's concern.

## Proposed Design

Detection, not prevention: let `main` land, accept the partial state, record a marker a sibling can notice and
recover from. The design has nine components — the enumerable substrate the task list is built from.

### 1. The sync-state ref

A sibling ARC ref `refs/arc/user/{identity}/sync-state`, the cross-machine companion to the user-notes ref and
namespaced by identity exactly as it is. It is **not** a git-notes ref: storage is the errand **tree-commit**
model — a tree of per-machine entry blobs keyed by `machineId` (§ 3, § 5), co-located with the errand ref under
`refs/arc/user/{identity}/` because it reuses that mechanism, not the commit-keyed git-notes machinery. The name
sits under `refs/arc/`, not `refs/notes/`, so the namespace tells the truth about the mechanism — `git notes`
never operates on it. It carries sync-state metadata only; it is independent of the user-notes payload and of any
other identity's refs (per-identity refs are decoupled by namespace).

### 2. Machine-id

A machine-local, **lazily-generated random UUID** identifying the writing machine — generated once on first
need, no user ceremony. Stored in the existing `.sync-state.json` (already the local-marker home, keeping
sync-state colocated). **Random, not the hostname** — machine names must not leak into a ref collaborators can
fetch.

### 3. Marker payload — per-machine entries

The ref is identity-scoped (shared across all of one identity's machines), so its structure must let multiple
machines' outstanding intents coexist. Each entry is keyed by `machineId` and carries:

- `machineId` — the writer's random UUID (§ 2).
- `lastAttemptedCommit` — the HEAD the notes push was advancing for (→ the short-sha in the consumer surface).
- `attemptTimestamp` — when the attempt was made (→ "from A's session on `<when>`"; also the TTL input, § 6).
- `intent` — the notes-ref target state A was advancing to (the basis for self-invalidation, § 6).

A machine writes **only its own key**.

### 4. Push ordering — marker before notes

The sync-state ref is pushed **before** the user-notes ref, so a successfully-pushed marker reads "about to
attempt a user-notes push for HEAD X." A sibling then detects (origin's notes ref still at the old state) that
the intent was not fulfilled. If the marker push itself fails alongside the notes push (e.g. total connection
loss), B behaves exactly as today — no regression, the residual window the severity profile already tolerates.

### 5. Reconciliation — union-merge by key

Because each machine owns its own key, concurrent cross-machine pushes have no true conflict — they union. Reuse
the shipped errand tree-commit per-key union + non-fast-forward-retry pattern (`mergeErrandTrees` /
`reconcileErrandPush`), where the keyed tree is `machineId`-keyed exactly as the errand tree is slug-keyed — the
same conflict-free-by-ownership model `WORKING-MEMORY` / `USER-INBOX` entry-union uses conceptually, but at the
ref-tree level rather than within a single payload. A machine overwrites its own key on each attempt (no conflict);
deletion only ever touches a machine's own key. **Last-writer-wins is rejected** — a single LWW blob lets one
machine's marker overwrite another's, reopening the exact multi-machine gap this WU closes (§ Alternatives).

Same-machine inter-process races on a machine's own key are `state-ref-write-safety`'s single-machine CAS scope,
not this WU's; build the write path CAS-ready and compose when that WU lands (soft coordination, captured).

### 6. Liveness & self-invalidation

How a consumer distinguishes a live intent (surface) from a resolved or stale one (stay silent):

- **Primary — comparison against the notes ref (no clock).** This WU provides a **liveness predicate** as part
  of the marker contract: given a marker entry and origin's actual notes-ref state, it returns *fulfilled* (notes
  for `intent` landed → self-invalidated by construction) or *live* (notes ref still behind → unresolved). The
  sibling invokes the predicate when it renders; the predicate itself is producer-side, so the marker's
  self-invalidation semantics live with the marker, not the consumer. This handles the common case (A retries
  successfully, the predicate reports fulfilled, B sees nothing) with no timer.
- **Backstop — TTL for abandoned intent.** The one case comparison can't close: A attempts a push for X, it
  fails, and A never returns. Past **14 days** (`attemptTimestamp` is the input), the TTL ages out / downgrades
  the entry so it doesn't nag forever. 14 days is comfortably longer than any normal retry-next-session cycle
  (which self-invalidates first via comparison) and short enough that a truly-abandoned machine's marker clears
  before it becomes noise. A single config value, not a new configuration axis.

The per-attempt sequence number considered in drafting **dissolves**: with per-machine ownership each machine
writes its own entry serially, so `attemptTimestamp` + ownership already orders things — no cross-entry counter.

### 7. Act register — push-time recovery on A

The notes leg fails inside `arc sync` / `arc release push`; resolve it there, not next session.

- **Auto-retry first, with short backoff** — a couple of quick silent retries. Most blips resolve in seconds;
  prompting for those is noise.
- **If still failing, surface a retry, defaulted to retry.** Retry is the recommended option (advisory-fork
  discipline): re-attempting the same push carries *zero clobber risk* — that safety is why the agent may take
  retry readily, unlike the force gate on B which it must never auto-take.
- **If retry succeeds → the state never persists.** Notes land, the marker self-invalidates, B sees nothing.
- **If retry fails / the user defers → informed deferral.** The marker persists (local + remote), but knowingly.

**Presentation fidelity (folds in the stderr-leak defect).** A successful recovery must not present as a
failure. On the upstream-init recovery path specifically — where a first `git push` fails with
`error: Set upstream first` and the recovery re-pushes with `-u` successfully — the pre-recovery git failure
must **not** leak to stderr. The structured result (JSON envelope / command return) is the single source of
truth for success; a reader or agent must never see a stray error line on a successful sync. This is the WU's
"lag, not loss" charter applied to its own output: never present worse than reality.

### 8. Register/affordance contract — for the B-side consumer

This WU produces the marker and specifies the three-register model the sibling renders against; the payload (§ 3)
is designed to afford each register:

| Register    | Where                | Posture              | Affordance the payload provides                                |
| ----------- | -------------------- | -------------------- | -------------------------------------------------------------- |
| **Act**     | A, at push-time      | resolve now          | owned here (§ 7) — auto-retry → primed retry → informed defer  |
| **Aware**   | B, at session-init   | lag, not loss        | short-sha (`lastAttemptedCommit`) / when (`attemptTimestamp`)  |
| **Caution** | B, at the force gate | context for the call | "A had an incomplete push here; merge preserves both"          |

The **Aware** surface is advisory, never a gate — it slots into session-init's existing advisory tier alongside
base-drift and local-ahead-notes. The operating agent proceeds-with-context and **does not auto-resolve** (never
force-pushes to "fix" stale notes). The surface falls silent the moment the marker self-invalidates (§ 6).

### 9. `arc-handoff` integration

`arc-handoff` is the highest-stakes Act site — the last moment before leaving A for B, precisely the case this WU
exists to catch. The handoff workflow gains a defined behavior for the notes-push-failed outcome: surface the
primed retry; on deferral, record it in the handoff report so the next session inherits the context.

### Interactivity contract (load-bearing)

`arc sync` is most often agent-run during handoff, so the CLI commands stay **non-interactive-safe primitives**:
auto-retry, structured result, and **never a blocking TTY prompt an agent-run invocation can't answer**.
Interactivity is owned by the agent/workflow layer, not the CLI, whenever the command is agent-run.

- **Attended** (human at the terminal, or an agent in a live session): the *agent* surfaces the retry decision
  conversationally; a direct human CLI run may prompt only when TTY-attached.
- **Unattended** (background / scheduled): auto-retry, then persist the marker and **report plainly in output** —
  no prompt to hang on, no silent swallow.

This composes with `cli-substrate-adoption`'s queued uniform non-interactive contract rather than reinventing it
— soft coordination, not a hard dependency (a hard edge would gate this WU on an unshipped P2).

## Alternatives & Rationale

- **Detect (chosen) vs. Prevent (set aside).** Prevention — making `main` and notes move together so the partial
  state never exists, via `git push --atomic` or notes-first-with-abort — is rejected because **coupling is
  intrinsic to it**: you cannot eliminate the window without making the code push contingent on the notes push
  (atomic couples at the server; notes-first only prevents the bad state if it aborts `main` on notes failure,
  re-coupling at the client). Notes are continuity, not correctness; the code push is the high-value action, and
  making it fragile to a transient notes hiccup is the wrong trade. The severity gradient agrees — the only
  High-severity outcome already requires explicit force.

- **Per-machine keying (chosen) vs. last-writer-wins.** LWW lets the desktop's marker overwrite the laptop's
  outstanding intent — reopening the exact multi-machine gap this WU targets. Per-machine keys make concurrent
  cross-machine writes conflict-free (each owns its key) and union-mergeable.

- **Comparison-based liveness (chosen) vs. a sequence number.** A per-attempt counter was considered for
  ordering, then dissolved: per-machine ownership + `attemptTimestamp` already orders a machine's serial
  attempts, and the notes-ref comparison closes the common case with no clock. The counter added state without
  closing a case comparison didn't.

- **Option B — embed sync-state in the user-notes payload — rejected.** The missing-on-origin payload would also
  carry the missing-on-origin sync-state, so it doesn't solve the visibility problem; it also couples sync-state
  evolution to the notes schema. The "single combined ref" variation inherits the same flaw (one failed push
  loses the marker with it).

- **Option C — server-side hook / out-of-band signal — documented-only.** Strongest signal (origin reports the
  partial state authoritatively for all clients, including ARC-unaware ones), but requires server cooperation,
  isn't portable across hosts (no pre-receive hooks on stock GitHub/GitLab), and breaks the git-only, client-side
  substrate the sync design rests on. An optional opt-in pattern for self-hosted setups that control the server —
  explicitly **not** this WU's deliverable.

## Cross-cutting Considerations

- **Security / privacy.** The machine-id is a random UUID, never the hostname — no machine names leak into a ref
  collaborators can fetch. Per-identity namespacing keeps different developers' refs decoupled.
- **Performance.** Small per-save storage overhead (one extra ref, a few-field entry per machine). The
  auto-retry backoff adds bounded latency only on the failure path; the success path is unchanged.
- **Testing.** Unit: payload union-merge by machine-id, liveness comparison against the notes ref, TTL aging.
  Integration: marker-before-notes push ordering, the auto-retry leg, the upstream-init success-path output (no
  leaked stderr). E2E: a multi-machine partial-push scenario against temporary git repos — A partial-pushes, B
  detects via the marker, A's retry self-invalidates it.
- **Migration.** Existing repos have no sibling ref; the first post-implementation push creates it. The
  consumer-side fallback (no ref → behave as today) is the default-safe path — no migration step required.
- **Rollout / configurability.** Opt-out is **structural**, not a new config gate: the marker publishes only
  inside the paired worktree+notes push, which runs only when a user-notes push is actually firing. Anyone who
  has turned off remote notes sync (`session.remote_sync: disabled`, or a `user.notes_push` / push-interlock
  setting that doesn't push) never reaches the publish point — so "opted out → behaves as today" falls out of
  the existing notes-push gate with no marker-specific toggle. (An earlier draft rode `pm.mode: external`;
  that value is retired by ADR-020 — it decomposes into `module-off + tracker-configured` — so pinning the
  opt-out to it would leave a dead gate once `scalable-core` ships. The notes-push gate is the durable axis.)
  Read-only clones (fetch but never push) consume the marker without writing it: the publish fires only after a
  successful worktree push, which a fetch-only clone never achieves, and the push itself is best-effort —
  confirmed safe.
- **User-facing impact.** The three registers (§ 8) frame the situation as lag, not loss. Agent-run handoff
  stays safe via the interactivity contract.

## Success Criteria

Validated at work-unit completion:

1. After a partial push on A, the sync-state ref carries an entry for `lastAttemptedCommit` whose payload affords
   short-sha (`lastAttemptedCommit`) / when (`attemptTimestamp`) / whose (`machineId`), and the liveness
   predicate, given origin's notes-ref state, reports the intent **live** (unfulfilled).
2. Once A's notes land at origin, the liveness predicate reports the entry **fulfilled** (self-invalidated) with
   no timer — the producer-side basis for the consumer surface falling silent.
3. An abandoned intent ages out after the 14-day TTL.
4. Two machines under one identity hold outstanding intents simultaneously and union-merge — neither clobbers the
   other.
5. A notes-push failure inside `arc sync` / `arc release push` triggers auto-retry; on persistent failure the
   retry surface is offered, never as a blocking TTY prompt in an agent-run invocation; on retry success the
   marker never persists.
6. A successful upstream-init sync presents as success — **no** stray `error: Set upstream first` (or any
   pre-recovery git failure) leaks to stderr on the success path.
7. `arc-handoff` has a defined notes-push-failed behavior (primed retry; deferral recorded in the handoff
   report).
8. Degrades safe: the producer adds the marker push without disturbing existing behavior when the ref is absent
   or remote notes sync is off (push behaves as today), and never publishes the ref from a fetch-only clone. The
   opt-out is structural — the marker rides the existing notes-push gate (`session.remote_sync` / `user.notes_push`
   / push-interlock), not a marker-specific config value (see § Rollout for why `pm.mode: external` was dropped).

## Open Questions

Implementation detail, resolved during the work — no settle-able design left open:

- **Auto-retry backoff schedule** — exact retry count and delays for the silent pre-surface retries (§ 7);
  tuning, not design.
- **`state-ref-write-safety` CAS handshake** — the precise compare-and-swap coordination for same-machine
  inter-process writes to a machine's own key (§ 5). Build CAS-ready and align when that WU lands; the coupling
  is captured to its inbound queue. Soft cross-WU coordination, not a blocker.
