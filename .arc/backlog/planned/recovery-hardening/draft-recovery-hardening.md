# Draft: recovery-hardening

- **Origin:** [internal]
- **Purpose:** Post-compaction recovery is sound _machinery_ wrapped in _advisory-only_
  enforcement, and at least one target agent (Claude) routinely rationalizes past it. This WU
  promotes enforcement from an advisory injection to a real forcing function, tightens which
  sessions the hooks fire for, and closes the liveness gap the drift-audit work opened — turning
  a feature one agent can silently ignore into one it structurally cannot.

---

## Inbound Buffer — Pending Integration

> _Routed-in concern pending holistic integration into the body at this WU's next planning iteration_
> _(`drain-inbox § 5`)._

### `[ ]` **Reframe recovery hardening after durable locus retirement**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: recovery-hardening`), housekeep drain (2026-08-10).
- _Concern:_ the draft assumes a durable live locus can arbitrate seed/marker disagreement. That substrate is gone;
  narrow recovery to safely clearing markers and seeds when their checkout moved or was torn down, grounded in the
  freshly derived checkout frame with no replacement record, lease, liveness gate, or trust bypass.

### `[ ]` **Harden the seed-to-recovery-marker handoff against silent loss**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-14); captured after automatic Codex
  compaction during `notes-export-replay-ordering` planning.
- _Concern:_ the compaction seed updated immediately before compaction, but the first post-compaction tool
  boundary received no pending recovery envelope and no marker or claim survived. A controlled PreCompact run
  proved the configured marker writer works; the unresolved window is seed emission → marker persistence or an
  immediate cleanup-only `SessionStart(clear)` sweep.
- _Approach:_ make seed success, marker write, claim, and cleanup durably distinguishable; reproduce automatic
  event ordering; prevent a compaction from sweeping its own pending marker; and make seed success without a
  recoverable marker fail visibly or self-heal at the next recovery channel.
- _Disposition:_ keep in this load-bearing recovery WU. The investigation and durable evidence cross the Errand
  floor even though the current FP session would benefit from the result.

### `[ ]` **Close the Codex no-tool post-compaction recovery gap**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-13); reproduced during
  `reviewed-lane-review-gate` task-generation audit.
- _Concern:_ `PreCompact` wrote the seed and marker, but a tool-free compacted response ran before recovery; only
  the next `UserPromptSubmit` claimed the marker. Require instruction delivery or a self-sufficient block before
  any substantive post-compaction response, within Codex's actual hook primitives, while preserving exactly-once
  claim and fail-closed audit behavior.

### `[ ]` **Reckon with the worktree-local compaction seed (FP 2.6.e)**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: recovery-hardening`), housekeep drain (2026-07-07); captured
  during `finalize-parallelism` Task 2.6.e (worktree-local seed re-bind), 2026-07-05.
- _Concern:_ FP Task 2.6.e re-bound the compaction-recovery seed **worktree-local** (per-session):
  `resolveCompactionSeedPath` now roots at the active checkout
  (`cwd/.arc/user/{id}/.internal/compaction-seed.json`), no longer accepts an identity-global root, and resolves
  symmetrically on emit (`status --write-compaction-seed`) and audit (`recover`). This WU's draft was written before
  this and shares the same files (`handlers/recover.ts` + the seed producers).
- _Implications (prerequisite, not conflict):_
    - The hard forcing-gate is only safe under concurrency _because_ the seed is now per-worktree. Pre-2.6.e, a
      shared identity-global seed let a sibling worktree's compaction clobber this one's, so `recover audit` could
      gate on another worktree's state. Worktree-locality makes the verdict reflect the current worktree's own seed.
    - `arm-on-seed-signal` (the leaning provenance approach) is unaffected — it reads the seed-write's per-invocation
      signal, emitted in the current worktree regardless of path.
    - The open `SessionStart(compact)` seed-consult alternative: if it resolves the seed _by path_ at inject time, it
      must use the worktree-local (`cwd`) path via `resolveCompactionSeedPath`, not a primary/identity-global one.
    - git-call bounding (PR #192 follow-up) still lands in `handlers/recover.ts`; the 2.6.e edit there is small (one
      dropped arg). Base-merge FP first; the substantive change to expect is the seed path relocation +
      `resolveCompactionSeedPath` signature.

### `[ ]` **Distinguish committed task-cursor advancement for fresh verifiers**

- _Routed from:_ `USER-INBOX § Work Unit` (`WU_Target: recovery-hardening`), housekeep drain
  (2026-07-10); reproduced by the `notes-export-state-coherence` verification pass.
- _Concern:_ a fresh verifier can inherit a seed anchored to the prior implementation task; recovery correctly
  explains the worktree delta as committed progress but still emits an unconditional `task-cursor-mismatch`
  stop after the task list has advanced monotonically.
- _Fold-in:_ settle whether committed-progress explanation covers monotonic cursor advance or the verification
  fire point must emit a fresh verifier-local seed. Preserve fail-closed behavior for uncommitted, reordered, or
  otherwise unexplained drift and add a spawned-verifier regression. Coordinate the handoff contract with
  `execution-delegation-doctrine`.
- _FP boundary:_ Phase 9 should refresh/preflight the worktree-local seed before its adversarial verifier; a
  repeated false stop becomes an FP Phase 7 blocker rather than a deferred surprise.

### `[ ]` **Calibrate recovery-audit stop sensitivity — it gates the forcing function, not just ergonomics**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ field report (2026-07-23, heavy Codex auto-compact use): roughly **one compaction in ten** stops
  on a condition the agent itself identifies as expected and benign — it says so, then dutifully stops. `#192`
  addressed one instance (`dirty-path-drift` suppressed when fully explained by committed progress); the residual
  rate says the job is unfinished. The likely concentration is `task-cursor-mismatch`, which this WU's buffer item
  4 already covers for monotonic advance and which `session-recover.md` § 2 hard-codes as "an unconditional stop."

- _Approach:_ the structural gap is that `RecoveryAuditStopKind` is a flat 14-kind enum
  (`git-status-failed`, `head-lineage-mismatch`, `head-unresolved`, `identity-missing`, `load-set-{unresolved,drift}`,
  `seed-{invalid,missing,unreadable}`, `dirty-path-drift`, `task-cursor-{missing,unresolved,malformed,mismatch}`,
  `planning-workflow-uncertain`) where any non-empty list means `stop`. No severity, no expected tier, no
  proceed-with-awareness — so there is nowhere to put "real, expected, non-blocking," which is exactly what the
  agent articulates before stopping. Cheap first step: record **which reason fires** on the next several stops,
  turning "roughly 1 in 10" into a targetable distribution before designing the tier.

- _Why it is this WU's, and why it sequences early:_ today a false stop is an overridable nuisance. Under this
  WU's forcing function — a PreToolUse hook blocking until a `recovery-complete` token exists — the same rate
  becomes a **one-in-ten hard block on a benign resume**. The draft already anticipates this ("what makes a hard
  gate _tolerable_ — without it the gate would fire on benign post-handoff drift"); the field data says the
  tolerance precondition is not yet met. Calibration is a gate on the spine shipping, not an adjacent nicety.

- _Captured during:_ `recovery-load-scoping` grooming (2026-07-23), while settling the load-set drift comparator
  from source. That WU adds no new drift axis and stays out of calibration.

### `[ ]` **Make compaction recovery survive authorized locus changes and worktree teardown**

- _Routed from:_ `USER-INBOX § Work Unit`, housekeep drain (2026-07-26).

- _Observation:_ A post-compaction recovery boundary arrived after the originating work unit had merged and its
  worktree had become a teardown husk. Three authorities disagreed: the pending marker path named the old
  `review-gate-right-sizing` husk, the recovery seed expected an still earlier
  `fix/document-coupling-audit-command` branch and dirty path, and the live session was the
  `chore/activate-arc-clearance` Errand in the primary worktree. The audit correctly stopped on branch and dirty
  path drift, but after an explicit decision to trust the live locus, the mandated clear command still derived
  its hook root from the current checkout and rejected the old marker path as invalid. Clearing succeeded only
  by invoking the helper from the marker-owning husk.

- _Approach:_ Define recovery authority when a session legitimately moves loci or its originating worktree is
  torn down. Provide a sanctioned rebind or acknowledgement path after an explicit live-locus decision, and make
  marker clearing validate repository/worktree identity without requiring execution from an obsolete husk.
  Exercise the three-way seed/marker/live-locus mismatch across merge, teardown, and Errand continuation while
  preserving fail-closed behavior for unexplained drift.

- _Files:_ compaction seed and Codex recovery-marker ownership, `session-recover.md`, marker-clear validation, and
  transition-focused recovery tests.

- _Captured during:_ post-merge `arc-cleared` activation after `review-gate-right-sizing` teardown (2026-07-25).

## Problem / Motivation

ARC's compaction-recovery mechanism emits a seed before compaction and, after it, tells the agent
to run the deterministic `recover audit` before continuing. Recent PRs hardened the _delivery_ and
the _audit_ (exactly-once injection #190, Codex scope fix #191, expected-vs-alarming drift #192).
What remains unhardened is **enforcement**: the injection asserts "recovery is required," but nothing
structurally stops an agent from continuing project work without it.

The failure is not hypothetical and it is **agent-asymmetric**:

- **Claude** repeatedly rationalizes past the mandate — observed **twice in the session that authored
  #192**, ironically. The disposition that makes Claude a good agent (bias toward helpful forward
  motion, don't over-ceremonialize) is exactly what discounts an advisory gate when a concrete task
  plus a rich post-compaction summary create a _feeling_ of sufficiency. The injection already names
  that rationalization ("mandatory even if context feels sufficient; loss is silent, you can't assess
  it from inside") and was still discounted — so **more/better prose is demonstrably not the lever**.
- **Codex** errs the other way — it would rather stall than proceed non-compliant (its disposition is
  why #190's PostCompact hard-stop could be softened to a PostToolUse relay). So the non-compliance is
  **Claude-specific**, even though a resolution should ideally be universal.

The load-bearing insight: recovery is currently encoded as a _belief to hold_, not a _blocking action
to take_, and nothing about proceeding is harder than complying. The fix must make the environment
refuse to proceed — the substrate for which the audit/seed machinery already produces (a verdict
artifact to gate on). **The machinery is the asset; the advisory-only enforcement is the bug.**

Three concerns cluster here (all captured under `WU_Target: recovery-hardening`):

1. **Forcing function** (core, was USER-INBOX #63) — a real gate so a pending recovery can't be
   silently skipped.
2. **Expected-vs-alarming drift** (was #100) — **DONE, merged in PR #192.** Carried here as
   completed history/context, not open work: `recover audit` now suppresses a `dirty-path-drift` stop
   when it is fully explained by committed progress since the seed, keeping the verdict binary. It is
   what makes a hard gate _tolerable_ — without it the gate would fire on benign post-handoff drift.
3. **Hook provenance-scoping** (was #118) — the hooks fire on _every_ compaction in a repo that has
   them installed, including harness sessions that never ran `arc-session`, producing a "recover ARC
   context" injection (and a possibly-empty seed) for a session with no ARC state.

Plus a follow-up surfaced by CodeRabbit on #192 (see Scope): bound every recovery-path git call.

## Design

### 1. Forcing function — a PreToolUse recovery gate (core)

**Chokepoint.** The naive guard (gate the commit) targets the wrong moment: the failure is _doing any
work_ without recovery, not committing — a read-only investigation session never hits a commit. The
right chokepoint is the **first tool call of substantive work**, enforced by a **PreToolUse hook that
blocks** until a `recovery-complete` token exists for the session.

**Mechanism.** Reuse the errand-1 session-keyed pending-marker machinery: `SessionStart(compact)` (or
the existing PreCompact arming) writes a session-scoped `recovery-pending` sentinel; a PreToolUse hook
blocks while it exists and no `recovery-complete` token does; the token is written only when
`recover audit` reaches a ready (or explicitly-acknowledged-stop) verdict. Age-based reaping so a
non-handed-off session doesn't orphan the sentinel.

**Delivery vs enforcement — the harness asymmetry (this is the subtle part):**

| Harness    | Instruction delivery                                        | Consequence for the gate                                                                                                                                                     |
| ---------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude** | `SessionStart` additionalContext — **before any tool call** | A PreToolUse gate is **pure enforcement**, zero delivery conflict — the agent already has the instructions in hand.                                                          |
| **Codex**  | `PostToolUse` relay — mid-turn, **after** a tool runs       | A pre-tool block on the _first_ call **preempts** the relay → the agent is bounced _without ever being told what to do_. The block message must then be **self-sufficient**. |

### 2. Hook provenance-scoping

Prefer gating injection-arming on the **seed-write's own signal**: the PreCompact
`arc status --session-init --write-compaction-seed` already knows whether real ARC session state
existed; if it finds none, don't arm recovery (no marker, no injection). Reuses existing knowledge and
sidesteps a separate presence-marker's orphan/reaping problem. Claude's immediate
`SessionStart(compact)` path (no seed consult at inject time today) needs either a lightweight
session-presence probe or the same seed-signal check before injecting.

## Alternatives

- **Enforcement chokepoint — release-wrapper gate (REJECTED):** the original #63 approach was to have
  `arc release commit`/`push` detect an un-audited pending recovery. Rejected: wrong moment (post-work,
  and never reached by read-only sessions). Kept only as a possible _secondary_ backstop.
- **Enforcement chokepoint — PreToolUse gate (CHOSEN):** blocks at the first work tool-call; fires at
  the actual failure moment; sits on artifacts the feature already produces.
- **Gate breadth — strict (all tools but an allowlist) vs mutating-only (LEANING: mutating-first):**
  strict catches even read-only rationalizing (the sibling loadset-skip failure mode) but is fiddlier
  and higher deadlock-risk (recovery itself needs reads); mutating-only (block Edit/Write/side-effecting
  Bash, let reads flow since reads _are_ how you recover) is the 80/20 — most of the value, a fraction
  of the deadlock surface, strict can layer on later. Mutating-only would have caught failure #2 this
  session (the edits+commit) but not #1 (investigation reads).
- **Universality — Claude-first vs universal-now (LEANING: Claude-first):** Claude is the
  non-complying agent _and_ the one where the gate composes cleanliest (SessionStart delivery). Codex
  already complies via the soft relay. So "Claude-gate + Codex-keeps-relay" may be the whole answer —
  pending the research item below. If we do extend to Codex, the block message must reuse the relay
  payload so it is self-sufficient.

## Unknowns and Assumptions

- **[RESEARCH] Does Codex expose a _blocking_ PreToolUse hook at all?** Its known hook set is
  PreCompact / PostToolUse / UserPromptSubmit / SessionStart. If there is no pre-tool veto, the
  universal story needs a different Codex primitive — and "Claude-gate + Codex-keeps-relay" becomes the
  answer by default (acceptable, since Codex already complies). **Gates the universality leg.**
- **[ASSUMPTION] Claude Code's PreToolUse hook can deny a mutating tool call and surface a message.**
  Believed true; confirm against the harness contract before committing to the mechanism.
- **[CEILING — honest, non-negotiable to state]** A mechanical gate forces the audit to _run_; it
  cannot force the recovered context to be _absorbed_. A determined rationalizer runs the command, gets
  `ready`, and still doesn't internalize the loadset. Enforcement guarantees the artifact exists, not
  that cognition happened — so pair the gate with the behavioral half (reframe the injection from
  "recovery is required" to "your next tool call must be `npx arc recover audit --json`; paste the
  verdict" — turning a private judgment into a conspicuous omission).
- **[OPEN] Token/sentinel mechanics.** Claude has only the transient injection today; it needs a
  session-scoped state flag distinct from any display banner (enforcement state is not a UX marker).
  Reuse vs extend the errand-1 marker; keying (`session_id`); reaping cadence.
- **[OPEN — scope shape] One WU or a cohort?** The forcing function, provenance-scoping, and
  git-bounding are somewhat orthogonal. Held as one unit for now (assess-cohort-fit clears trivially
  while design forms); revisit once the gate design stabilizes — the gate is clearly the spine, the
  other two may be thin enough to ride along or split off.

## Scope Estimate

**Large (week+),** cross-harness. Rough internal shape:

- Forcing-function gate (Claude-first): sentinel lifecycle + PreToolUse mutating-gate + audit-run
  token + allowlist so recovery can't deadlock. **Spine.**
- Behavioral reframe of the injection payload (the necessary-but-insufficient half).
- Provenance-scoping: arm-on-seed-signal for both the PreCompact and Claude SessionStart paths.
- **git-call bounding (CodeRabbit follow-up, PR #192):** bound _every_ recovery-path git call under an
  abort-timeout, fail-closed to a stop — the `committed-progress` resolver **and** the sibling
  `git status` probe in `handlers/recover.ts` (both landed unbounded). Use the existing `boundedFetch`
  AbortController pattern.

**Sequencing note:** unstarted by intent — `finalize-parallelism` is in flight and has WIP in
`handlers/recover.ts` + the seed producers. A candidate for a later FP burn-in wave; base-merge FP
before touching the shared recovery files.

## Continuity

- **Readiness:** `maturing` — scope and direction are settled from the authoring session's design
  discussion; the leaning decisions (PreToolUse over release-wrapper, mutating-first, Claude-first) are
  made; open items are detail-design + one research gate, not fundamentals.
- **Resolved:** chokepoint (PreToolUse), breadth lean (mutating-first), universality lean
  (Claude-first), provenance approach (arm-on-seed-signal), drift-distinction (DONE #192).
- **Open:** Codex PreToolUse availability (research); token/sentinel mechanics; cohort-vs-monolith
  shape; whether the behavioral reframe is same-WU or a sibling of the loadset session-init work.
- **Next:** confirm Class; resolve the Codex research gate; then create-spec when it crosses to
  formalization-ready.
