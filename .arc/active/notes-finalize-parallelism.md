# Notes: Finalize Parallelism

Execution-reference context alongside `spec-finalize-parallelism.md` — sequencing/coordination and sizing that
the spec's design body doesn't carry.

## Contents

- [Sequencing & coordination](#sequencing--coordination)
- [Wave-1 induction evidence](#wave-1-induction-evidence)
- [Shared-mutable-surface matrix](#shared-mutable-surface-matrix)
- [Seam trace-throughs](#seam-trace-throughs)
- [Adversarial pass](#adversarial-pass)
- [GA checklist starting state](#ga-checklist-starting-state)
- [Scope & sizing](#scope--sizing)

## Sequencing & coordination

No goal-aware-direction mechanism exists yet, so the pre-FP sequence and the still-live cross-WU coordination
edges are recorded here rather than in a tracked sequencing surface. The pre-FP dependency drain has landed
(the behind-base reconcile gate and the sweep base-ref index shipped as pre-FP errands; the `arc status <slug>`
drain-time check landed in the rules + strategy). The edges that remain live during FP's own run:

- **Deterministic ROADMAP handling before wave 1.** Concurrent ROADMAP regens from different base states are a
  wave-1 surface; the deterministic renderer slice from `roadmap-tooling` must land before wave 1, and it also
  unblocks BI-4's CLI-complete `arc start` (deterministic ceremony-commit content). The full Heavy WU is not the
  gate; the slice slots *beside* FP Phases 1–2, not ahead of FP's start. `tasks-finalize-parallelism.md` tracks
  the gate explicitly in Phase 2.R.
    - **2.R.1.a scope verdict:** pull a dedicated renderer-command slice rather than starting the whole Heavy
      `roadmap-tooling` WU. The existing FP branch already has `composeProjectReadinessView` plus lifecycle/start
      ceremony ROADMAP write paths; the missing gate-facing piece is a public, testable render/check command or
      equivalent slice that wave sessions can invoke. Include only deterministic `ROADMAP.md` refresh for lifecycle
      / start ceremony and manual-trigger use. Exclude `STATUS.USER`, `STATUS.PROJECT` rename, link reanchoring,
      shared render-standard extraction, and buffer cleanup.
    - **`operational-state-docs` boundary:** treat the slice as an interim markdown composer over meta files.
      Do not build the generic render/reconcile projection engine, structural-contract migration, or managed-record
      substrate here; those stay with `operational-state-docs` / its decomposed members and later absorb this
      renderer boundary.
- **`interlock-release-refinement` consumes FP's burn-in evidence (post-waves).** Its parallelism-relevant slice
  (integration-time interlock-stacking collapse) either slice-extracts per its own draft, or — preferred —
  consumes this WU's evidence of which stops actually hurt under concurrency and which weren't decision-bearing
  after a trust grant. Inverted out of the hard pre-FP path; approval friction during the sacrificial waves is
  tolerable by design and never corrupts.
- **`sync-primitive-discipline` adjacency.** BI-3 ships the contained lock re-anchor; the principled
  ref-CAS-with-retry rewrite of the notes save routes here. Pull it adjacent to FP or name it a seam-audit input.
- **`graduation-cleanup` coordination.** BI-4's spawn-mode transition rework shares surface with
  graduation-cleanup's flip-time history-hygiene ceremony — coordinate or sequence at its pickup.
- **Coordination-seam captures** (the batch-errand/drain-shape seams, the same-entry-merge build home, the
  `/arc-shift` disposition) are routed at planning close via gitignored `USER-INBOX` captures, not by editing
  sibling WUs' tracked buffers from this branch.
- **Mid-flight build-items forward-port (Phase 2.I) is a base write — sequence it.** The build items reach `main`
  as a code-only forward-port before the waves (so wave worktrees run the observer's CLI), which writes
  `origin/main`. Coordinate with any concurrent base writer (sibling WU integration, errand / housekeep PRs) as a
  normal base merge; FP then merges `main` back. Defaults stay unflipped — the mechanism lands, the `--here`→spawn
  default does not (Task 8.3).
- **`review-gate-enforcement-qualification` / `-promotion` as later-wave candidates (2026-07-14).** The review-gate
  mechanism shipped across earlier WUs but the last two enforcement WUs never ran, leaving partial state that
  `integrate-work-unit` currently assumes complete — a loop worth closing sooner than the general backlog would
  reach it, though it never gates FP. Wave fit: `-qualification` is a wave-3 code-slot candidate;
  `-promotion` a wave-4 candidate (cross-machine-resume adjacency). Caution: both are `Heavy`, so slating either
  saturates that wave's design load — apply the `assess-parallel-fit` design-load read at the wave's slate cut.
  *Update (2026-07-14, locus finding):* `session-locus-model` (pulled forward within the GA gate — see the
  2026-07-14 locus finding) takes the near-term Heavy design slot; the review-gate pair re-queues for wave 4 or
  post-GA.

### Burn-in seam-routing rule (2026-07-09)

Standing decision tree for defects and seams the burn-in waves surface — settled at the 3.1 close, after the
slug-state finding forced the call twice in one session. WORKING-MEMORY carries the live pointer for FP sessions.

1. **Observation, induction, and verification work is FP's — never routes out.** Matrix cells, detector
   inductions, and evidence records stay in FP even when their subject's *fix* leaves: a split-out fix ships the
   change, FP proves it under concurrency (the verifying re-run returns to a wave after the fix merges in).
2. **Actionable fixes route by consumed-vs-observed:**
    - **Consumed** — remaining waves (or wave sessions' own tooling) rely on the surface's answers, or its
      behavior can corrupt wave operations (not merely misreport to an observer who knows better) → **split
      out**: USER-INBOX capture (WU_Target an existing owner or a new stub), fix lands on `main` ahead of the
      wave that consumes it, FP merges it in. Precedents: `project-state-integrity`; the slug-state fix.
    - **Observed only** — latent; waves complete truthfully without it → absorb into **Phase 7** when atomic
      enough and it must not outlive FP's own integration (precedent: 7.1); otherwise route to the owning WU via
      USER-INBOX with no FP gate (precedent: the `wu-lifecycle-state-model` launch-ergonomics captures).
3. **Record the gate where it bites.** A split-out fix that gates a wave or cell is recorded at that cell / wave
   preamble, so re-entry conditions are legible at resume; it reaches meta `Blockers` / `Depends On` only when it
   gates FP's critical path as a whole. Advisory-only noise the observer can discount is a recorded caveat,
   never a gate.

### Dogfood finding (2026-07-05): worktree launch model

Surfaced dogfooding FP from the primary. Three coupled findings: the first two reshape **BI-4** and add a
launch-model doctrine question to the GA scope; the third (below) reinforces the spawn-anchored model with
recovery-integrity evidence and reshapes **BI-6** (Task 2.6.e).

**Relocate desync (retires BI-4(c) as SOP).** `EnterWorktree` — Claude Code's BI-4(c) "true relocate" — hops the
*agent process* cwd into the linked worktree, but the developer's terminal and tooling do not follow: Warp + Herdr
(and any GUI multiplexer, e.g. Superconductor) still present the primary. Structural, not a tool bug — a child
process changing its own cwd has no channel to reconfigure the parent terminal / multiplexer / GUI; OSC-7 / title
escapes would not move a shell cwd or a pane, and GUI apps get nothing. ARC cannot fix it (above its layer), and the
desync between the human's tooling model and the agent's is a dealbreaker for making relocate the SOP. So: demote
layer (c) to an escape hatch at most (a developer who does not care about terminal sync), never the recommended path
— the objection is harness-independent in spirit even though only Claude Code offers the relocate. Promote the
**spawn-anchored** shape (a fresh session started *in* the worktree) from Codex-specific fallback to the
**universal** model, resting on (a) CLI-complete `arc start` from the bare shell + (b) the mini-handoff into the
seeded `SESSION-NOTES` so the fresh session boots rich. Design inversion: **ARC establishes the worktree; the
developer arranges their own tooling; the agent starts fresh in the worktree** — ARC does not drive the terminal /
GUI (out of its control, wildly per-developer). "Seamlessly continue the same session" is off the table as a goal;
"cleanly hand off to a fresh in-worktree session" replaces it.

**Launch-flow / `--start` purpose (GA-scope question, not solve-now).** Keep two entry intents distinct: (1)
*don't-know-what-to-start* → discovery, agent-mediated (`arc-session` discovery arm), keep; (2) *know-what-to-start*
→ a clean CLI op (bare `arc start <slug>`, the (a) substrate), so the developer arranges tooling between launch and
agent-start. But a real **middle ground** the two poles miss: even knowing the target, an `arc-session`-style agent
already carrying the core ARC loadset earns value *before* launch — vet/verify impl-readiness, a second opinion,
sanity-checking the pick. An agent-mediated launch must earn its keep beyond "you did not type the CLI yourself," or
it has no purpose. Open question: the `arc-session --start <slug>` skill signal (which opened the session that
surfaced this) either (i) should not exist — bare CLI is the same effect, and routing it through the full discovery
session-init path is wasteful — or (ii) should be repurposed (likely a different verb): *same effect as the bare CLI
launch, but an ARC-loaded agent vets/verifies before the launch fires*. Still handle the pure just-launch-it case,
but never require an agent that adds nothing. Closing loop: the `--start` shortcut that opened this session is itself
the "launch and seamlessly continue in one session" ambition that walked into the relocate trap — the ambition is
the anti-pattern.

**Bonus BI-6 evidence.** The reflex to capture this so it is not lost routes to `USER-INBOX`, but from this linked
worktree that writes FP's *divergent local* inbox copy (the 2026-07-04 divergence), not the canonical primary — so
the finding lands in these tracked notes instead. The capture reflex hitting the wrong inbox is one more instance of
the BI-6 identity-global-surface gap.

**Compaction-recovery integrity (reinforces spawn-anchored; adds Task 2.6.e).** This session's post-compaction
recovery read a seed describing `main`, not FP — proof the launch model has teeth beyond terminal UX. Two distinct
mechanisms, verified in code: (1) *Capture* — the PreCompact / SessionStart hooks resolve their root from
`CLAUDE_PROJECT_DIR` (unset here) → `git rev-parse --show-toplevel` at the *harness* launch cwd, which is the primary
under relocate; the agent's per-command `cd` is invisible to them, so the emit captured `main`. Spawn-anchored launch
(harness rooted *in* the worktree) fixes this — recovery-integrity evidence for the (a)/(b) model, verified by a
wave. (2) *Storage* — 2.6.a routed the seed through the identity-global resolver (→ primary), but the seed is
per-session state; under concurrent worktrees every session clobbers the one shared seed (last-writer-wins) and
recovers another worktree's state. This bites the *blessed* concurrent path, not the relocate one, so spawn-anchored
does **not** fix it — hence **Task 2.6.e** re-binds the seed worktree-local. No harm this session: the harness's own
compaction summary + tracked state carried the real context; the ARC seed was inert.

### Dogfood finding (2026-07-05): Wave-1 workload — real Light doc WUs don't exist in the needed shape

Surfaced selecting the wave-1 slate. The *Workload selection basis* assumed real Light doc backlog stubs could
serve as wave-1 workload ("cheap ≠ valueless: real backlog items wanted anyway"). Dogfooding the pick falsified
that for wave 1, across three consecutive candidates vetted via the `--start` preflight recon:

- `inbound-routing-method` — drifted Light→Heavy; Inbound Buffer coupled to unstarted `shared-inbox-model`
  (can't groom in isolation).
- `adr-accept-timing` — carries code/lifecycle legs (an enforcement hook + an `integrate-work-unit` flip step),
  so not doc-only, and its buffer forces a design call on groom.
- `cli-readme` — genuinely Light and doc-only, but single-session / Errand-shaped: no handoff→resume, so the
  cross-session notes save/load/converge surface (core of 3.2.a / BI-3) never fires.

**Structural finding:** the wave's real need is *lifecycle + concurrency exercise*, not content substance — and
"real, Light, doc-only, **multi-session**, coherent WU" is near-empty by construction (real Light doc work is
Errand-shaped; real substantial doc work is Heavy or legged). `Class` is a rest-state snapshot that grooming can
invalidate — sharp evidence for `wu-lifecycle-state-model`'s "activation-ready is not a clean state" gap, and a
sharper selection axis than `Class: Light`: **determinate scope** (grooming produces a known artifact, not a
design resolution) and **multi-session span**.

**Resolution:** wave 1 uses two purpose-built synthetic fixtures (`burn-in-probe-a` + `burn-in-probe-b`) that
run the real lifecycle over synthetic content — a proper test fixture for the first, lowest-stakes wave. Each
fixture produces its own evidence log as its deliverable (folds into these notes at wave close); the observer
drives cell/detector induction. Real-work realism is carried by waves 2–4 (code supply is plentiful). The
preflight recon catching all three drifts is itself positive launch-model evidence (Task 3.1.c).

### Dogfood finding (2026-07-06): in-flight state-reporting integrity — foreign-write false positives

Surfaced during FP's own handoff commit and, in reverse, at `burn-in-probe-b`'s activation: the pre-commit
foreign-write advisory (`check-foreign-writes` → `detectForeignArtifactOverlap`) reported cross-WU meta overlaps
that don't exist — `chore/burn-in-probe-b also touches meta-finalize-parallelism.md`, and symmetrically at probe-b
activation ("`finalize-parallelism` also touches this WU's meta path"). Verified false: probe-b tracks only its own
`{meta,spec,tasks}-burn-in-probe-b.md`, cut cleanly from `main`; the committed-diff and uncommitted-status probes
the detector runs both return empty against current state, so the overlap primitive's static logic is sound and the
misfire does not reproduce deterministically.

**Localization:** the fault is in the in-flight **roster derivation** (`runActiveInFlight`) feeding the primitive
stale/wrong refs during concurrent worktree churn (the misfire clustered around `arc start --here` reshuffling
worktree/branch state), not the overlap diff itself. `classifyPathSurface` correctly excludes `ROADMAP.md`
(`"other"`), so ROADMAP is not the direct trigger — but FP and probe-b both diff-touch the single shared
`ROADMAP.md` every WU regens + commits, a distinct shared-mutable contention hazard (matrix cell 3.2.c).

**Why it matters (GA blocker):** advisory-or-not, a parallelism GA gate cannot certify a state layer that reports
false facts about what is in flight. Trust in the concurrency systems FP validates depends on the in-flight roster
and ROADMAP being a truthful single source of truth.

**Resolution (routed, not resolved here):** the actionable scope — harden the roster/oracle derivation and give the
ROADMAP/STATUS render a concurrency-guarded single-source-of-truth model — is routed to `roadmap-tooling`
(USER-INBOX `WU_Target: roadmap-tooling`) and formalized as a hard dependency of FP (meta `Depends On`). Sequence:
`notes-fetch-refspec-hardening` → `roadmap-tooling` (groomed with this concern) → resume FP waves against the
resolved state layer. FP holds the GA gate closed until it lands.

**Update (2026-07-09) — RESOLVED.** The state-integrity slice was extracted from `roadmap-tooling` and shipped as
its own WU, `project-state-integrity` (roster-derivation hardening + `ROADMAP` as a verified *derived* projection
with a pre-commit regen assert), merged to `main`. FP's hard `Depends On` is cleared — the render/rename remainder
still owned by `roadmap-tooling` was never the FP-critical slice. First field validation of the fix is the
2026-07-09 finding below (cell 3.2.c). FP's GA gate no longer blocks on this.

### Dogfood finding (2026-07-09): opportunistic wave-1 evidence — cross-worktree notes + ROADMAP regen under load

Not deliberate induction (that stays Tasks 3.2.a / 3.2.c) — live evidence harvested from the maintenance session
that merged `main` into FP and both probe worktrees, rebuilt each, and re-enabled notes across all three. Three
worktrees (`feat/finalize-parallelism`, `chore/burn-in-probe-a`, `chore/burn-in-probe-b`) exercised the shared
surfaces concurrently on the fixed build.

**Notes cross-worktree writer/export (cell 3.2.a — BI-3 in practice):** each worktree ran `arc user save` →
`arc user sync` against the shared identity-scoped ref (`refs/notes/arc/user/andrew`), anchoring its note at its
own HEAD (FP `293eb1bb`, probe-a `aa682027`, probe-b `edc952d9`). Observed: (1) every notes push was gated by a
pre-check that **refuses to export while the worktree's branch has unpushed commits** ("push the worktree first")
— no sibling note exported before its branch landed, exactly the BI-3 invariant; (2) all four identity surfaces
stayed **byte-identical** across every save→sync (verified against a snapshot) — no dropped save, no resurrected
tombstone, clean convergence to `Up to date` in all three worktrees.

**ROADMAP concurrent regen (cell 3.2.c):** each worktree regenerated `.arc/backlog/ROADMAP.md` via
`arc status --project --local` from a **different base state**, and each `git merge main` conflicted **loudly** on
ROADMAP (content conflict, `both modified`) rather than silently accepting a stale render — the predicted loud
classification. The deterministic renderer shipped by `project-state-integrity` produced identical, stable output
across all three worktrees, and the pre-commit regen assert (`assert-roadmap-regenerated`) passed on each merge
commit. First field validation that the state-integrity slice closes cell 3.2.c's silent-stale-render hazard.

**Foreign-write advisory vs. behind-base divergence (new — feeds cell 3.2.e):** the pre-commit foreign-write
advisory fired throughout the cascade, listing ~20 backlog drafts as "also touched" by each probe — but those are
files `main` changed in the 105 commits the probes lagged, not files the probes authored. The committed-overlap
primitive is *coded* three-dot (`base...candidate`, merge-base — probe-a's own changes since fork = 3 files), yet
the surfaced list matched the two-dot divergence (`main..probe` = 192 files). Whichever internal path produced the
two-dot-shaped list, the advisory can false-positive on a badly-behind-base branch; it went clean once the probes
were current + the stale `origin/plan/burn-in-probe-a` shadow ref was deleted. This is **distinct from** the
2026-07-06 phantom *meta*-overlap (roster derivation), which `project-state-integrity` fixed — separately
re-verified here: the detector is clean against `meta-finalize-parallelism.md`. Captured as task 3.2.e for
deliberate induction; if it reproduces, it is a `detectForeignArtifactOverlap` defect routed as a discovered seam.

**Update (2026-07-09, Task 3.1 completion commit `4c05c455`) — reproduced in the *forward* direction.** The
advisory fired on FP's own-artifact commit, claiming both probes "also touch" `notes-finalize-parallelism.md` +
`tasks-finalize-parallelism.md`. Verified false by three-dot: neither probe authored any FP file since merge-base
(`HEAD...chore/burn-in-probe-{a,b}` = their own artifacts + `ROADMAP.md` + their stub removal only); the flagged
files are FP-side edits the probes have never seen (FP ahead of the probes' merge-base — divergence read as
authored overlap, mirror image of the behind-base case). Deterministic at commit time on one machine, no stale
shadow refs in play this time. Strengthens 3.2.e from "induce and see if it reproduces" to a live defect with two
observed directions; still routed as a discovered seam (candidate to fold into the slug-state fix WU below —
same state-layer family, `detectForeignArtifactOverlap` / its diff-base selection).

**Caveat:** opportunistic, not the full induced interleaving — the deliberate A-save/B-save/A-paired-push ordering
(3.2.a) and concurrent same-instant regen (3.2.c) still run under 3.2 induction. But the invariants held under real
concurrent load, and nothing observed contradicts the predicted classifications.

### Dogfood finding (2026-07-09): slug-state surfaces are checkout-local — blind to in-flight siblings

Surfaced at FP's observer resume: both probes sat integration-ready (meta `State: Active` in their own worktrees'
`active/`, task lists complete through verification, local = remote on both branches), yet `arc status
burn-in-probe-a` / `-b` run from FP's worktree reported `planned · Planning · occupied: false`. In the same
checkout, `arc status --project` rendered both probes `Active` / In Flight. One CLI, two answers about the same
work units.

**Mechanism.** The slug query (`arc status <slug>` → `buildLifecycleIndex` → `resolveSlugQuery`;
`lib/work-unit/lifecycle-index.ts` / `lifecycle-query.ts`) is a pure walk of the *current checkout's* four
lifecycle directories — deliberately no git or network on the path. Under single-branch-per-WU, a sibling WU's
activation (`backlog/planned/ → active/` move + `State` flip) exists only on its own branch until merge, so every
other checkout still carries the pre-graduation stub, and the local index faithfully — but falsely — reports
`planned`. `occupied` is not a `git worktree list` check: it derives from the same state enum (`isOccupied`,
`lifecycle-resolver.ts`), so it inherits the stale answer even though the local-sibling case is answerable
locally and correctly via `worktree-roster.ts`. The predicate's doc contract ("live on a branch / worktree — the
worktree-occupancy guard's boolean") promises more than the read performs.

**Why `project-state-integrity` didn't cover it.** That WU chartered "a `main`-checkout render shows in-flight
WUs as in flight (superseding their stale backlog stubs)" and delivered it for the *view path*: the readiness
projection merges tree records with oracle candidates (`deriveInFlight` → `mergeProjectReadinessRecords`,
`lib/status/project-view.ts`) — verified live above (cell 3.2.c validation), and the probes render correctly
there. But its spec kept `buildLifecycleIndex` / `resolveSlugQuery` as the "shared slug→identity substrate" (an
*input* to the oracle), and the slug-query *surface* appears in neither its Goals nor its Non-Goals — the gap
fell through the seam rather than being consciously deferred. The oracle sees the truth; the slug query never
consults the oracle.

**Blast radius** (consumers of the checkout-local resolver, from source):

1. **Agent doctrine points at the blind surface.** DEV-RULES.ARC § Verify before assuming names
   `arc status <slug>` as *the* lifecycle resolver ("never infer"), and session-init's `--start` focused-recon
   arm resolves Tier-1 dependency edges through it. Any agent operating outside a WU's own worktree inherits the
   false facts — this session's own orientation did (reported both probes `Planning · planned`, unoccupied).
2. **`arc start` dispatch — the sharp edge.** `resolveStartDispatch` (`commands/start.ts`) routes `planned` →
   **graduate**. From `main`, `arc start burn-in-probe-a` would graduate the stale stub and mint a second branch
   for a WU already live in a sibling worktree; the refuse arms (`planning` / `active` / `integrating`) cannot
   fire because the local index cannot see the sibling. The foot-gun guards (`lifecycle-guards.ts`) check only
   the *current checkout's* `active/`; no guard asks "is this slug live on a sibling branch / worktree". A
   silent double-launch recreates exactly the one-to-many branch⇄WU condition the `project-state-integrity`
   spec named as the root disease.
3. **Dep-edge reads.** `discharge-dep-edges` (satisfied at `landed ∨ integrating`) and `ready-mine`
   (deps-shipped filter) read stale for edges onto in-flight siblings — an `integrating` dep reads `planned`.
   Conservative-wrong (under-reports readiness, never over-reports), lower severity, same root.
4. **`occupied` reporting.** No code consumer beyond the query surface today, but agents read it; a
   false-negative occupancy invites exactly the double-launch in (2).

**Why it matters (GA blocker):** the sanctioned slug-state read is truthful only in the WU's own worktree —
wrong precisely in the concurrent case parallelism GA certifies. And unlike a latent seam, these surfaces are
*consumed by the waves themselves*: every wave session resolves lifecycle states, gates dependencies, and
launches WUs through them.

**Fix shape (for the owning fix, not settled here):** give the query/dispatch surfaces the same oracle overlay
the project view got — or minimally a `worktree-roster` overlay covering the local-sibling case — while keeping
`buildLifecycleIndex` itself pure (its locality is a deliberate arc-backend commitment). The two consumers
likely want different degradation postures: a status query can warn-and-degrade offline; a launch dispatch
should fail safe (refuse or confirm when the oracle is unreachable, never silently graduate).

**Resolution routing — split-out recommended over Phase 7.** Decision heuristic: route by whether the remaining
waves *consume* the broken surface (fix lands off `main` before the wave that needs it, FP merges it in — the
`project-state-integrity` precedent) vs. merely *observe* it (Phase 7, ships at FP integration — the 7.1
latent-defect pattern). These surfaces are consumed (blast radius 1–2 above), wave 2 launches real WUs through
`arc start` while the probes and FP are in flight, and a Phase 7 fix would reach `main` only at FP's own
integration — after all waves. Lean: extract as a dedicated fix WU off `main` before wave 2.

### Dogfood finding (2026-07-13): worktree self-teardown terminates the session — a substrate/lifecycle seam

**Open design question, not a defect.** Surfaced at probe-b's real integration tail (PR #235, the first attended
integrate-and-teardown observed from inside a spawned linked worktree). The ship itself was flawless — merged,
archived to `completed/2026-q3/13_burn-in-probe-b/`, branch + worktree reaped, nothing lost. The finding is about
*how* the terminal ceremony behaves, and it wants a product decision before GA. **Coordinate downstream with
`wu-lifecycle-state-model`** (it owns the lifecycle-state surface this touches).

**What happened.** `integrate-work-unit.md` Step 14 runs `arc teardown <wu>` post-merge. When that teardown removes
the linked worktree the session occupies (a *self-teardown*), the session's cwd is deleted out from under it and
the session terminates — which the workflow explicitly documents ("the session terminates here: start a fresh
session in another worktree"). The agent read this correctly and warned up front. The rough surface is harness-side:
the Codex harness process stayed in the removed cwd, so its `PostToolUse` / `Stop` hooks and skills-reload all
failed with `No such file or directory (os error 2)` — a cascade of cryptic errors rather than a clean "shipped;
this session is done" signal.

**Why the CLI's own guard doesn't cover it.** `reconcile-worktree.ts` self-teardown handling calls
`process.chdir(primary)` *before* `git worktree remove` — but that hops only the **arc CLI subprocess's** cwd so its
own remaining git ops succeed. It cannot move the **parent harness process**, which is the one left stranded. This is
the same structural class as the 2026-07-05 relocate-desync finding: a child process cannot reconfigure its parent's
cwd/terminal. A full fix of the *harness* symptom is above ARC's layer.

**probe-A comparison (recollection was that A didn't hit this).** Unconfirmed and the evidence leans the other way:
both probes ran identical lifecycle-commit sequences, teardown is physical (branch delete + worktree remove + prune)
so it leaves **no commit** in either history, and **both probes' evidence logs stop before any teardown record** —
consistent with both sessions self-terminating at teardown. The alarming ENOENT cascade is harness-runtime, never
captured in ARC artifacts, so if A genuinely felt different the likely cause is the harness driving the final reap
(Claude's per-worktree `.claude/` vs Codex's primary-resolved `.codex/` hooks fail differently when the cwd
vanishes) or A's reap running from a different locus. A bounded rollout-log check next session could settle it;
explicitly **not** worth a rabbit-hole.

**Why this is a genuine seam, not messaging.** The lifecycle model (handoff, land-on-base, decide-what's-next) was
built for the *branch* substrate, where "leave the work" is a free ref switch. Worktrees add a *physical* substrate:
you cannot stand in the directory you are deleting. So worktree-WU completion **cannot** be made symmetric with
in-place / errand completion *from within the worktree* — the asymmetry is irreducible at that locus. Two angles
converge on the same resolution:

- **Symmetry.** In-place WU / errand completion reaps the branch (a ref), lands you on `main`, session alive, ready
  for handoff / housekeep / errand. Recovering that for a worktree WU requires the final reap to be performed by a
  **primary** session, not the worktree session.
- **Lifecycle integrity.** Self-teardown bypasses `session-handoff` entirely (no `Commit at Handoff` baseline, no
  WORKING-MEMORY review, no notes push, no clean next-action moment). **Do not anchor the justification on
  notes-sync** — git notes are the interim bridge to `arc-backend` (`strategy-storage-evolution`, `draft-arc-backend`,
  `draft-local-mode`, `RELEASE-GATES`). The durable justification is **physical and arc-backend-invariant**: a
  worktree stays a directory-you-can't-delete-from-within regardless of where WU state lives.

**Refined design direction (settled far enough to hand off; details are the next session's).** Decouple the
ARC-ceremony work from the physical worktree removal, so the terminal state is *"shipped, pending physical
teardown"* and the bare directory is a disposable husk:

- The worktree is **already fully disposable** in the current design. The one worktree-coupled teardown step —
  `reconcileLinkedIdentityGlobalUserSurfaces` — is a **legacy safety net** (its docstring: for worktrees "created
  before identity-global user surfaces were bound to the primary checkout"). Post-BI-6, WORKING-MEMORY / USER-INBOX
  are primary-bound and SESSION-NOTES is per-WU (retired by `arc user close`), so a current spawned worktree carries
  **no exclusive state**. Every other teardown step (branch delete, remote-head delete, prune) is a ref op that does
  not need the worktree.
- **Bless manual deletion as a first-class, idempotent path.** ARC must not gate an operation the developer can
  already perform (Herdr's delete-worktree button, `git worktree remove`, `rm -rf` + `git worktree prune`). Reframe
  `arc teardown`'s physical step as *convenience automation over a manual operation*, with the primary's
  stale-worktree sweep (exercised in Task 3.3) as the "if you didn't, I'll get it eventually" backstop. A tool that
  makes you wait for its blessing to delete a directory would read as gratuitous friction.
- **Ordering wrinkle to resolve.** git refuses to delete a branch checked out in a worktree (why teardown is
  worktree-first today). Two decoupling variants: **refs-early husk** — switch the worktree off its branch, reap
  branch/remote/prune at ship, leave a detached directory so a manual delete leaves *nothing* dangling (closest to
  the ideal); vs **physical-deferred** — keep branch+worktree+prune together in the deferred reap, so a manual `rm`
  removes the dir but leaves refs for the next sweep. Pick at design time.
- **Legibility gap (→ `wu-lifecycle-state-model`).** A session-init *inside* the shipped worktree today finds the
  archived meta and falls to the orphan path. It should recognize *"shipped — pending teardown; reap me or just
  delete me."* That WU owns whether this is a real state value or an annotation.

**Two tracks, and the gate between them.** (a) *Cheap interim:* an errand off `main` that surfaces the CLI's
already-computed `locusHopped` bit as a clean self-teardown notice ("this removed the worktree this session
occupied — its cwd is gone; start a fresh session in the primary"), so wave 2 could dogfood improved messaging. (b)
*Structural:* the decouple-and-bless-manual design above. **Decide interim-only vs. structural vs. both** before
spending either — hold the messaging errand until that call, so it isn't superseded by the structural fix.
Seam-routing character: observed-only (the ship succeeded; nothing downstream in FP consumes it broken), so absent
the structural decision it is a Phase 7 / owning-WU candidate, not a wave-2 blocker. Also feed the harness-cwd
casualty into the incident playbook (Task 8.2) as a known operational limitation.

**Resolution (2026-07-14): structural, pulled forward — the decoupling ships as wave-2 code workload.** The
interim-vs-structural fork dissolves: the decoupling is substrate mechanics with no state-model dependency, so it
stands up as its own code WU (provisional slug `worktree-teardown-decoupling`, stub cut at the 4.1.a slate) rather
than waiting on `wu-lifecycle-state-model`. WLSM keeps only the formalization question — whether "shipped, pending
teardown" becomes a real state value or an annotation — routed as a slim USER-INBOX capture; it consumes the
mechanics, it does not build them. Working direction for grooming: **refs-early husk** — detaching the worktree's
HEAD frees the branch (dissolving the ordering wrinkle above), every reap proceeds as a ref op, and the session
survives on a disposable detached husk with a clean "shipped" terminal message. Scope sketch: locus-aware
`arc teardown` (full physical reap from the primary as today; husk mode from inside, keyed on the already-computed
`locusHopped` bit), stale-worktree-sweep husk detection (detached HEAD + ARC ownership marker — a husk has no
branch to key on), a session-init husk advisory derived from existing signals (no new state value, no meta-schema
touch), the `integrate-work-unit` Step 14 edit, and the clean terminal messaging — which subsumes the interim
messaging errand entirely. Physical-deferred was considered and set aside (leaves a live branch with a deleted
upstream; its interim states read as branch-gone / orphan-sweep anomalies rather than "shipped"); grooming
ratifies the variant. The optional probe-A rollout-log check is skipped — the physical asymmetry holds regardless
of what probe A felt like, so the decision doesn't hinge on it.

### Dogfood finding (2026-07-14): base-drift surface misleads under routine sibling integration

**Surfaced at FP's own session-init** the session after probe-b shipped: "Base `main` has advanced 17 commit(s)
ahead of this branch … rebase may conflict. Reconcile?" — alarming enough to interrupt orientation and ask what
had landed on `main`. First-parent truth: **one** integration (PR #235, `burn-in-probe-b`). The raw ancestry count
includes the merged sibling's entire branch history (planning ceremonies, handoff commits, its own base merges),
and under working parallelism that is the steady state — every sibling ship inflates every other in-flight
checkout's behind-count by 10–20 ceremony commits. The number is technically true and semantically wrong.

Four defects in the composed prompt (`baseDistance.recommendedPromptText`):

1. **Granularity.** Counts raw commits; should count first-parent integrations and name them (slug + PR — the
   completed-roster / oracle machinery already maps merge subjects to WUs).
2. **Off-doctrine verb.** "rebase may conflict" recommends the operation the concurrent-work doctrine forbids on
   pushed branches (append-only until integration; a rebase orphans the SHA-keyed notes). For a fresh wave session
   taking the advisory at face value this is a live corruption vector, not just noise.
3. **No overlap classification.** `ROADMAP.md` is a derived artifact (regenerate-wins); a conflict there is a
   non-event resolved by regen, yet it renders with the same weight as genuine content overlap — training
   flag-blindness exactly where a real code-path overlap deserves attention.
4. **No calm/attention tiering.** Routine "siblings shipped behind you" (calm: merge in when convenient; required
   before integration) renders identically to "base moved on paths you are actively editing" (attention).

Reasonable shape, roughly: `Base main: 1 sibling integration ahead — burn-in-probe-b (PR #235). Overlap:
ROADMAP.md (derived — regenerates on merge). Merge in when convenient; required before integration.`

**Routing (seam rule): split out — consumed.** Every remaining wave session-init reads this surface, fresh wave
agents rely on its advice, and defect 2 can corrupt a wave operation (a followed rebase suggestion rewrites a
pushed branch). USER-INBOX capture routed; the shipped `merge-safety-mechanism` built the behind-base primitive
but the prompt composition lives in the CLI status/session-init layer, so the fix lands as a new stub or errand —
sizing is errand-to-Light with one design question (how the composer knows a path is derived — hardcode ROADMAP vs
a small file-classification hook). Candidate for wave 3's live-errand slot if it stays errand-sized. FP keeps the
verification: the fixed surface gets read again at later wave inits.

### Dogfood finding (2026-07-14): execution-locus doctrine is sequential-era; session state is single-frame

Surfaced across the wave-2 split-out cycle (the `start-class-flag` errand and the teardown-stub errand, both run
warm from FP's worktree). Every hard failure in the cycle was a **checkout-identity failure, none a model
failure**: warm `errand open` displaced this WU's worktree onto the errand branch, then hard-blocked on FP's own
uncommitted notes (an unrelated concern forcing a commit decision on the WU's in-flight state); `errand close`
died on `git switch main` because the base is held by the primary worktree; updating local base required reaching
into the primary with `git -C`. The abstractions (WU/errand, seam routing, interlocks) answered every ambiguous
call deterministically — the friction lived entirely in the rules for *where work physically executes*.
Compounding: a harness compaction landed mid-errand and recovery correctly rehydrated **errand** context only —
the suspended WU frame (governing workflow, loadset, task cursor) survived only in the harness summary, the
channel recovery doctrine trusts least.

Diagnosis, two coupled defects:

1. **The execution-locus doctrine generalized "get off the WU branch" from a one-checkout world.** Under linked
   worktrees, occupying a WU worktree in place is a category error — the worktree *is* the WU's workspace, and
   the isolation invariant deserves a locus rule of its own: a checkout's role is durable (primary = launchpad,
   `main` or errand/housekeep-shaped; WU worktree = its WU, spawn to teardown); new work never repurposes an
   existing workspace. The old "errands stay out of worktrees" premise rested on spawn/teardown cost — BI-1
   provisioning (shipped) and `worktree-teardown-decoupling` (wave 2) dismantle it.
2. **Session state is single-frame.** A warm errand pushes a WU→errand frame with no recorded link, so neither
   recovery nor the return path can restore the suspended frame deterministically. Depth is bounded at two by
   construction (no warm WU entry exists; errands never nest), so the fix is one recorded parent pointer plus a
   machine-local locus record — not a general stack.

**Routing (seam rule): split out — consumed, with the design pulled into the GA gate.** `session-locus-model`
(new stub, capture routed) owns both halves as one design: the locus doctrine and a deterministic machine-local
session/locus record + read verb, with `errand close` and session-recover as consumers. **Wave 3 is re-cast as
its evidence collector** — the live-errand wave runs on the *current* model deliberately, so contention and
drain-shape evidence inform the spec rather than being invalidated by an early redesign; the WU executes within
the GA gate ahead of the `--here`→spawn default flip (Task 8.3). Three mechanization seams split out around it:
the `errand close` topology fix (consumed by wave 3's live errand — lands ahead of it), a base-sync verb, and
mint-to-launch bundling for slate stubs (both errand-sized, captures routed). FP keeps all verification: wave 3
re-observes the errand surface, and the GA bar for this seam is an operator running an errand beside two live
WUs without narrating git topology.

### Wave-2 finding (2026-07-14): `arc start` dispatch split-brain — checkout-local resolution, base-anchored cut

Surfaced at `worktree-teardown-decoupling`'s spawn; reported by its in-worktree session at entry, verified from
FP. Three symptoms, two roots. Symptoms: the backlog stub was never consumed (orphaned
`backlog/planned/worktree-teardown-decoupling/` rides the plan branch); the minted active meta carries scaffold
defaults (`[TBD]`/`P3`) instead of the stub's `Light`/`P1`; the ceremony-committed ROADMAP carries a baked-in
transient advisory ("Branch `plan/…` has no errand record or active work-unit meta").

Root 1 — **dispatch split-brain with a silent-create fallback.** `start` resolves the slug against the *invoking
checkout's tree* but cuts the plan branch from *base tip*. FP's branch last merged `main` before PR #237 landed
the stub, so resolution missed, and the miss silently dispatched to the create arm (fresh default-weighted WU —
the "Spawned" banner) rather than refusing or asking. The branch cut then inherited the stub from `main`
unconsumed. Control: `commit-message-submission`'s launch minutes earlier took the graduate arm correctly
("Graduated" banner, `--class` written, stub relocated) — its stub predated FP's last base merge, so the
invoking tree had it. Same checkout-local blindness class the slug-state fix closed for status/dispatch
surfaces; `start` retains it, and compounds it by treating a miss as creation intent.

Root 2 — **the readiness-view composer writes advisories into the document it renders**, and the ceremony's
regen runs mid-transition (plan branch exists, active meta not yet written), so the transient warning landed in
the tracked artifact. Retroactively explains the "spurious" errand-record warning observed during the
`start-class-flag` errand — same composer family reading mid-transition state.

**Routing (seam rule): split out — consumed.** Wave-3 launches consume `start`, and a silent wrong-weight
create corrupts wave operations (not merely misreports). Two errand-sized fixes captured to USER-INBOX: (1)
base-anchored slug resolution + explicit creation (a miss refuses or requires an explicit create input — the
`--class` explicit-input contract precedent; field inheritance is subsumed once the graduate arm consumes the
real stub, as CMS proved); (2) keep composer advisories out of rendered document bodies + fix ceremony regen
ordering. Both land before wave 3. Local reconcile is the WTD session's, folded into its grooming ceremony
(Class restored at the `arc finalize` fire-point; priority restore + orphaned stub-dir removal + ROADMAP regen
ride the ceremony commit) — no standalone hand-edit channel. 4.3 pencil-in: WTD's botched graduation makes it
the natural re-graduation vehicle *after* fix (1) lands — verifying BI-4's ceremony locus and the dispatch fix
in one move. Operational corollary for `session-locus-model`: launched from the launchpad (synced primary),
this class never fires — resolution and cut read the same tree.

## Wave-1 induction evidence

Deliberate 3.2 matrix-cell inductions (distinct from the opportunistic 2026-07-09 harvest above). Raw command
outputs and note-set snapshots for each run live in the observer session's scratch captures; the durable facts
are recorded here.

### Cell 3.2.a — notes-ref cross-worktree writer/export race (2026-07-09) — CONFIRMED HOLDING

Induced the full A-save / B-save / A-paired-push interleave across the two probe worktrees on one machine,
with B's note deliberately anchored at an unpushed commit (`506a8a8a`, an evidence-log commit held local):

- **Serialization held under truly concurrent saves.** Both `arc user save` invocations ran simultaneously
  (backgrounded, single machine, shared `refs/notes/arc/user/andrew`); no lock error, no clobber — the ref log
  shows the two saves as clean sequential commits, A's existing note at `08a4b10d` updated in place, B's new
  note added. 315 baseline notes → 316, zero dropped.
- **No sibling note exported before its branch landed.** A's paired push (`arc sync`: worktree + notes legs both
  `success`) exported the full note set **except exactly** B's unpushed-anchored note — verified by set
  difference of origin's fetched notes tree vs local (`506a8a8a` the sole local-only entry; A's updated note
  present at origin). The gate is a silent-but-correct **filtered export** (branch-bounded), not a loud refusal —
  a refinement of probe-a's earlier "refuses while the worktree's own branch has unpushed commits" observation:
  the *sibling's* unpushed-anchored note is filtered from a healthy push rather than blocking it.
- **The filtered note followed its branch automatically.** B's own paired push landed branch + note together;
  final state fully converged (local ≡ origin note-sets; 317 total incl. both probes' final saves; all 315
  baseline notes intact).

Classification confirmed as predicted: serialization loud-safe (lock), export gating silent-safe (filter +
deferred export). No recovery path needed. Advisory-noise side note: the induction's anchor commit drew the
foreign-write divergence false positive again (third instance, forward direction, siblings flagged on probe-b's
*own* evidence log) — evidence continues to accrue to 3.2.e / `slug-state-oracle-alignment`.

**Session-entry follow-up — expected projection residue misclassified as a conflict.** A later real handoff from
`slug-state-oracle-alignment` exercised the same branch-bounded path against GitHub after the scratch-clone
induction had left four notes on deliberately unpushed synthetic commits in the shared local canonical ref. The
export correctly preserved origin and overlaid only branch-reachable notes; the local ref correctly retained all
four omitted notes. The resulting tips (`0fdd01af` local / `232b131f` remote) were graph-diverged but
content-compatible: every remote `(annotated commit, blob)` pair was byte-identical locally, and local was a
strict content superset. The FP handoff note, slug-state handoff note, and all four on-disk user surfaces matched.

The session-init ref detector compares ancestry only, so it mapped this expected projection residue to `conflict`
and offered `arc user pull` to "replace local notes." That action cannot resolve the state — `runUserPull`
deliberately refuses diverged refs — and actual replacement would discard the four intentionally retained notes.
No data was lost; the pull was skipped. This is a consumed GA seam rather than a failure of 3.2.a's writer/export
invariants: route the fix through split-out WU `notes-export-state-coherence` after the already-active slug-state
fix ships, gate wave 2 on both, merge the fix back into FP, and re-run this exact entry induction. The durable
capture is in USER-INBOX; FP owns this observation and its eventual verification.

### Cell 3.2.b — sync-state marker shared-key ordering (2026-07-09) — CONFIRMED + one seam

Method: two scratch clones (own git dirs → genuinely distinct machineIds `7647ac4c` / `2f8bb305`) with the
**local** repo as their origin, so every publish exercised the real keyed-union path into the real
`refs/arc/user/andrew/sync-state` and the real session-init surface — no GitHub side effects, no shared-config
mutation. Failed notes legs induced by a temporary pre-receive hook on the local repo rejecting only the
user-notes ref (only scratch-clone pushes ever traverse it). Quirk worth keeping: for local-transport receives,
the relative `core.hooksPath` resolves against the **git dir**, not the worktree — the hook fires from
`.git/.husky/_/`, not `.husky/_/`.

- **Misordered multi-intent publishes retained everything.** Intents created C1-then-C2, published C2-then-C1;
  the second (CAS-retried) union write kept the first entry, both live intents coexisted under distinct keys,
  and all ~20 pre-existing entries survived every write. No earlier live marker was hidden at any point.
- **BI-3's shared machine id verified in passing:** every real-worktree entry (17 historical + this session's)
  carries the one repo-shared machineId; the clones' distinct ids confirm the id is genuinely per-git-dir.
- **Marker precedes the notes leg and rides only the paired cell.** Markers were present after the notes legs
  were rejected (publish-first confirmed live); a `notes-only` sync (clone without `pushInterlock:
  on-workflow`) published no marker at all. Two defense-in-depth observations en route: an upstream-less branch
  blocks the notes leg *before* marker publish (`notes-blocked-by-worktree:branch-gone`), and a diverged notes
  push auto-recovers via merge silently under `--json` (`recovered:merge`).
- **Cross-worktree detector read confirmed.** FP's session-init `partialPushMarker` surfaced exactly the live
  intents (correct machineId / head / timestamp per line) while every fulfilled historical entry stayed silent.
- **No shared-key collapse exists post-BI-3 — retries mint fresh intent keys.** A retry re-plans a fresh export
  commit → new key; superseded intents linger as entries rather than being overwritten. Residue confirmed
  TTL-bounded (14d) and presentation-only.
- **Seam (routed → Phase 7, task 7.2):** self-invalidation keys on exact export-commit reachability, but a
  failed-then-recovered push lands a *different* export commit than the recorded intent — so recovered pushes
  leave **false "notes lag" Aware lines for up to 14 days** (observed: 3 stale-live markers after all content
  landed). Silent-safe over-report — nothing hidden, never gates — but it trains operators to discount the
  Aware line (alarm-fatigue class). Per the seam-routing rule: latent + atomic + shouldn't outlive FP → Phase 7
  absorption. The 3 induction markers are left live deliberately — real bait for 3.3's detector pass and a
  regression check for the 7.2 fix.

Cell verdict: predicted classification **confirmed** — loud/aware with every live intent represented; the
silent key-collapse failure mode did not reproduce (BI-3's intent-keying holds); residue is TTL-bounded and
presentation-only, now with the over-report seam sharpened into 7.2.

### Cell 3.2.c — ROADMAP concurrent regeneration (2026-07-09) — CONFIRMED HOLDING

Induced the remaining same-instant half across FP and both probe worktrees from three clean, distinct branch
states (`94068a6f`, `08a4b10d`, `506a8a8a`; 81 / 14 / 12 commits ahead of `origin/main`). All three
`npx arc status --project --local` renders started in one concurrent batch, completed in 0.39–0.40 seconds, and
returned success. After normalizing only the intentional `Last rendered against <HEAD>` stamp, all three outputs
had the same Git blob hash (`3055f9e0`) — deterministic projection under simultaneous local-ref reads.

The command is the renderer half of the documented shell redirection, so the concurrent invocations left all
three worktrees clean. Each committed ROADMAP was independently stale against the fresh projection (old render
stamp + retired shadow-ref warning + missing live slug-state WU), supplying three different-base stale inputs.
The previously harvested `main` merge cascade already proved the collision half loud (`both modified` in every
worktree), with a post-merge regeneration accepted by the hook. For the silent-stale half, an intentionally stale
ROADMAP delta was staged in FP and the shipped `assert-roadmap-regenerated` entry point rejected it with exit 1
and the expected re-render instruction; the staged probe was then removed and every worktree re-verified clean.

Cell verdict: the renderer is deterministic across concurrent worktrees, textual contention fails loud at merge,
and a stale derived render cannot be committed silently when ROADMAP is staged. The predicted pre-fix
`loud with silent stale-render residue` classification is closed by the regenerate assertion; no new seam.

### Cell 3.2.d — base-branch reconcile gate (2026-07-09) — CONFIRMED HOLDING

Probe-a completed the real integration path through archive composition, the deterministic sweep, green CI, and
PR #215's merge (`2cfbee3e`). That merge advanced `origin/main` while probe-b remained untouched at `506a8a8a`,
creating the intended behind-base condition without synthetic ref manipulation.

From probe-b, the exact Step 13 gate sequence (`git fetch origin main` followed by
`git rev-list --left-right --count HEAD...origin/main`) returned `12 18`: 12 branch-only commits and 18
base-only commits. The non-zero behind count therefore took the workflow's mandatory-stop arm before any
reconcile or merge. Probe-b remained clean and unreconciled, preserving the same real behind-base state for the
fixed foreign-write-advisory verification in 3.2.e.

Cell verdict: the integration gate detects a genuine remote-base advance and fails loud before merge. Its surface
is the non-zero distance plus the workflow stop, not a standalone CLI error; no silent stale-premise merge was
possible once the gate ran.

### Cell 3.2.e — foreign-write advisory under behind-base divergence (2026-07-13) — FIX CONFIRMED + one seam

Condition: with both blocker fixes on `main`, FP merged `origin/main` (292 commits) append-only while probe-b
stayed preserved at `506a8a8a` — 292 behind base, whole two-dot divergence 483 files, authored three-dot set just
6 paths (its own WU artifacts + ROADMAP). The merge staged 32 foreign WU-artifact candidates, every one inside
probe-b's two-dot divergence and none authored by it — the exact phantom-overlap bait.

The shipped committed-probe fix holds. Standalone runs of the advisory over those 32 candidates report zero
overlap in all three states (pre-merge checkout, mid-merge with the resolution staged, post-merge), and the
positive control — a path probe-b genuinely authored (`backlog/planned/burn-in-probe-b/meta-burn-in-probe-b.md`)
— returns the correct single-path advisory naming `chore/burn-in-probe-b` and its worktree. Three-dot
discrimination confirmed in both directions under the real behind-base condition.

New seam (hook-env leakage, uncommitted probe): at the real merge commit the pre-commit advisory nevertheless
listed all 32 candidates as probe-b overlap. Bisected deterministically: git exports `GIT_DIR` /
`GIT_INDEX_FILE` into hook processes, and the advisory's uncommitted probe (`git status --porcelain` with
`cwd` = the sibling's worktree) inherits them — pinning git to the committing worktree's repo and staged index,
so it diffs FP's mid-merge index against probe-b's working files and reads every staged path absent there as the
sibling's "uncommitted change." Exporting the two vars reproduces the phantom standalone; without them the same
state is clean. Hook-context-only, so it survives every standalone verification; not limited to merges — any
hook-fired advisory with a sibling worktree checked out can phantom-match its staged set. Fix shape: scrub
`GIT_DIR` / `GIT_INDEX_FILE` / `GIT_WORK_TREE` in the git exec layer whenever `cwd` overrides to a foreign
worktree. Routing per the seam-routing rule: wave 2+ commits consume this surface (the advisory fires on every
sibling-worktree commit), so split-out to `main` recommended over Phase 7 absorption.

Cell verdict: the 2026-07-09 defect is fixed and verified; the residual phantom is a distinct hook-environment
seam in the uncommitted probe, deterministic and understood, routed for split-out.

**Seam resolved (2026-07-13, same day):** the split-out shipped as PR #234 (`fix(git): scrub repository-local
env for cwd probes`, `io-context.ts`) and merged into FP. Field re-verification against the merged fix: the
deterministic hook-env repro (`GIT_DIR`/`GIT_INDEX_FILE` exported, the same 32-candidate set) now reports zero
phantom overlap, and the positive control still detects the authored path under the same hostile env — the
scrub removes the leak without deadening the probe. Split-out round-trip (capture → parallel errand →
reviewed-lane ship → FP merge-in → re-verify) completed within the wave, exercising the seam-routing rule's
consumed path end-to-end.

### Detector-tests 3.3 — wave-1 session-init detectors fire on induced conditions (2026-07-13) — ALL CONFIRMED

Each of the three detectors wave 1 can exercise was driven by a real or induced condition and observed firing
through the session-init probe envelope; correct negatives were captured alongside each.

- **Base drift** (`baseDistance`): from probe-b's preserved behind-base worktree the probe returned
  `diverged`, 12 ahead / 292 behind, `recommendedAction: surface`, with the composed prompt naming the
  overlapping path (`.arc/backlog/ROADMAP.md`). Negative: the current primary and the freshly-merged FP both
  resolve `clean`/`skip`. The surface also fired live at this session's own init (FP pre-merge, 292 behind,
  two overlapping paths named).
- **Notes lag** (`partialPushMarker`): the three synthetic markers (planted 2026-07-09, intents unreachable by
  design) rendered from all three worktree contexts — identity-scoped as specified, machine IDs `2f8bb305…` /
  `7647ac4c…`.
- **Stale worktree** (`sweep`): induced by recreating probe-a's worktree at its original path on a recreated
  `chore/burn-in-probe-a` branch (tip = PR #215's second parent) with a hand-written ARC ownership marker. From
  the primary, the sweep surfaced it with the full green-path decision `removable` (ARC-marked + clean +
  merged). Negatives: the slot is absent outside the primary, and `errandState.inFlight` did **not** misclaim
  the `chore/` branch as an in-flight errand — the shipped-WU classification wins. Induction fully torn down
  (worktree removed, branch deleted).

Verdict: no silent no-ops — every wave-1 detector fires loud on its condition with composed, actionable surface
text, and the adjacent negatives confirm the gating (primary-only sweep, identity-scoped markers, clean-skip
base distance).

## Wave-2 induction evidence

Wave 2 ran as two real code WUs (slate re-cut 2026-07-14): `commit-message-submission` (still in flight) and
`worktree-teardown-decoupling` (shipped, PR #246). Unlike wave 1's deliberate matrix-cell inductions, wave 2's
conditions arose from the real workload; collection was partly retrospective — FP resumed after WTD's full
lifecycle had completed and its worktree was torn down.

- **Dependency provisioning + off-primary gates (BI-1 node-deps leg) — CONFIRMED.** First-hand: the live CMS
  worktree ran the full gate set green (markdown/TS/shell lint, both typecheck configs, build, full suite),
  `node_modules/.bin/arc` resolving locally — no foreign-registry edge. Retrospective: WTD's archived record
  attests per-task gates through Tier 3 plus portability and integration/E2E CI across its whole off-primary
  lifecycle. The flip-decisive `node_modules` gap is closed in practice (Task 4.2 - `tasks-finalize-parallelism.md`).
- **BI-4 ceremony locus — CONFIRMED, retrospectively; re-graduation vehicle superseded.** All WTD ceremony
  commits (init `6966113dc`, activation `130b9b600`, ROADMAP refresh `770d6b2dc`) rode the plan/fix branch,
  none on main's first-parent line; pairs with 4.1's init-locus evidence for both wave-2 spawns. The penciled
  re-graduation never ran (WTD's split-brain reconcile folded into grooming/activation and it shipped);
  dispatch-fix live verification and the `Depends On` discharge vehicle re-anchor at the wave-3 slate cut.
- **BI-5 graduate-transition crash-class — PARTIAL.** Fail-loud-before-mutation observed live: the `[TBD]`-Class
  guard blocked CMS's agent-driven launch cleanly (no partial state; after `start --class` shipped via PR #236
  the relaunch ran end-to-end first try, with no residue to clean). The old-shape-meta rejection lane was not
  induced — no old-shape meta existed in the wave; it rests on 2.5.a's staged-validation and test coverage. WTD's
  launch bypassed graduate validation entirely via the create-arm miss — the split-brain finding below — so its
  refusal-contract successor (PR #242's fail-closed resolution) carries the remaining live check into wave 3.
- **Dispatch split-brain (wave-2 finding, 2026-07-14) — DETECTED + fixed as split-outs.** The wave's marquee
  catch: `start` resolved slugs checkout-locally while cutting from base, silently creating a default-weighted
  meta (§ Wave-2 finding). Both split-out fixes shipped (PR #242 base-anchored resolution + refusal hardening;
  PR #243 composer advisories out of rendered bodies). The composer fix was consumed live at FP's 2026-07-15
  base merge: the pre-commit hook demanded a staged re-render and the regenerated ROADMAP came out clean — no
  baked advisory.
- **Detector re-probe (playbook discipline).** At FP's wave-close session-init, base drift fired correctly
  (62 behind, both overlapping paths named), the three synthetic partial-push markers still rendered
  identity-scoped, and the ROADMAP regen gate refused a stale render at the merge commit before accepting the
  regenerated one. No silent no-ops observed in wave 2.

### Synthetic-state retirement (2026-07-15, Task 4.5) — COMPLETE

Executed after wave-2 evidence closed; both refs were local ≡ origin before surgery, and every change was
append-only (no force-push). Backup refs `refs/arc-backup/notes-pre-retirement` (`1f1d8f1a7`) and
`refs/arc-backup/sync-state-pre-retirement` (`22024b68a`) remain local as the undo anchors.

- **Notes ref `refs/notes/arc/user/andrew`:** removed the 4 entries anchored at unreachable burn-in commits
  `8314d4d7` / `9d44106a` (C1 intents) and `a06e26dc` / `f96fc372` (C2 intents); 362 ordinary entries retained,
  zero unreachable anchors after removal. New tip `c79d609db`, published via the routine proof-gated
  `arc user push` — which first refused on the branch-before-notes invariant (67 unpushed branch commits) and
  succeeded after the branch push: the export gate observed working as designed, and routine publication
  succeeding is itself the confirmation that no unreachable-anchored note blocks it.
- **Sync-state ref `refs/arc/user/andrew/sync-state`:** dropped the 7 synthetic marker entries (intents
  `10780b41`, `456bc5d0`, `9e501bc6`, `aaf7bc2d`, `ccc1e6f2`, `dd3231da`, `fd1cb334`; machineIds `2f8bb305…` /
  `7647ac4c…`; all 2026-07-09) via a tree commit parented on the old tip and a CAS ref move; 57 real-machine
  entries retained. New tip `69f91327a`, fast-forward pushed.
- **Errands ref:** already empty — nothing to retire.
- **Verification:** post-push session-init probe renders zero partial-push markers and notes `clean`/`same`;
  the canonical local notes ref carries only ordinary reachable-anchor content. Deliberate non-action: no
  history rewrite/compaction (coordinated cross-machine boundary FP doesn't need; 142 history commits ≪ the
  2000 advisory threshold) — burn-in-era DAG commits are inert with content clean.
- **Wave-4 caveat:** a second real machine holding a stale local sync-state ref could union retired markers
  back at cross-machine resume; the 14-day TTL (~2026-07-23) expires their surface before wave 4 realistically
  runs, and re-cleaning is cheap if one resurrects.

## Wave-3 launch evidence

### Launch (2026-07-15, Task 5.1 partial — drain leg pending)

CMS merged (PR #251, 13:00Z); both WU legs launched same-day from the synced primary. Cut base verified by hand:
`main` ≡ `origin/main` ≡ the parked grooming checkout at `567a3c237` at cut time — clean dispatch, both `plan/`
branches cut from the synced tree (the PR #242 live check's positive leg), no split-brain. HLD's landed
`worktree-teardown-decoupling` edge resolved via `arc status` and graduation proceeded ungated — the `Depends On`
discharge observation (4.3 re-anchor) confirmed. BI-1 provisioning held for both spawns: `node_modules` + harness
layer present, seeded mini-handoffs landed; zero by-hand steps. `-y` covered the non-TTY confirm.

### Launch-session friction findings (2026-07-15)

Eight findings routed per the seam-routing rule — three errand captures (ROADMAP conflict auto-regen; base-drift
prompt text suggesting rebase on a pushed branch; `arc start` naming its cut base), five WU captures
(`husk-lifecycle-drivers`: husk surfacing for linked-worktree sessions; `session-locus-model`: groom-branch
advisory false positive + dedup; `cli-substrate-adoption`: stale-dist auto-rebuild; `composable-workflows`:
session-init growth datapoint + interim schema-extraction candidate; `interlock-release-refinement`: routine
base-reconcile tail wrapper coverage). The systemic seam — hygiene/completion surfaces gated to loci a
worktree-resident operator never occupies — landed as Task 7.3. Notable single instance: the CMS husk was
invisible to every session until hand-discovered, and FP's own merge-gate event (CMS merging) was probe-invisible
on the resume arm, resolved only by a manual `gh` query; teardown ran clean from the primary once known
(2026-07-15). Positive evidence for interlock-friction-by-work-character (5.1 design decision): the launch
ceremony itself was low-friction; the friction concentrated in routine reconcile ops and advisory noise, not in
decision-bearing gates.

### Day-1 evidence accumulation (2026-07-15, close-of-day)

Wave 3's first day produced contention and drain-shape evidence ahead of the 5.2 inductions:

- **Drain shape (5.3 input):** the housekeep drain ran sequential-primary (PR #255, ten entries) — matching the
  pin-primary / sequential-first leaning. Its friction captures: interruption-unsafe cross-store moves (routed
  `shared-inbox-model`), destination-overlap surfacing at the routing interlock (§ Errand), plus the live
  drain-vs-owner contention question answered same-day by the drain-skip rule (PR #256).
- **Errand-loop throughput:** five same-day capture → route/adopt → execute → merge cycles (PRs #256–#259 + the
  wording/footer fixes), all beside two live WU sessions. Interlock friction stayed in routine ops (reconcile,
  advisory noise), not decision-bearing gates — 5.3 / `interlock-release-refinement` input.
- **Resource-axis contention (unpredicted cell):** at load average ~30 (sibling suites + builds), shell-spawn
  quality-gate tests flake against flat 5s timeouts (`validate-config.test.ts`, unchanged by any merge; passes
  at normal load). Captured to `cli-test-hardening` — the shared-machine resource axis alongside the predicted
  shared-state axes.
- **Advisory-register finding:** HLD's first boot rendered cautionary notes/disk drift ("mixed") from two
  healthy-parallelism states (own seeded SESSION-NOTES; sibling churn on identity-global surfaces) — graded-
  advisory fix captured (§ Errand, "Grade the notes/disk drift advisory"). Sequential-era advisory semantics
  colliding with parallel steady-state is the day's recurring shape (see also the FP-first memory-entry
  amendment: errands un-frozen, two sanctioned classes).
- **Ops note:** both FP base-merges today conflicted only on ROADMAP's render stamp (auto-remedy pull-back
  captured); second merge verified green post-regen (build + 4854/4856 unit — the 2 fails are the load flake
  above).

### Day-2 evidence — external-budget contention (2026-07-16)

Wave-3 volume saturated two external budgets inside its first days — the day-1 shared-machine resource axis now
has an external-service sibling (an unpredicted contention class: metered third-party surfaces):

- **CI budget (Actions):** the monthly minutes budget drained 2+ weeks early and overran its top-up. A 27-hour
  sample (wave-3 day 1): 100 workflow runs — 51 CI + 49 Review Gate Wakeup. The cost shape is structural, not
  suite speed: per-job minute rounding across 8–9 jobs/run bills a ~7-minute heavy PR run as ~12 minutes; the
  wakeup relay (echo-only, fires per review-comment event) bills ~50 no-op minutes/day; each review-cycle push
  re-runs the full heavy suite (verified-tree lookback can't apply — the tree changed). The classify
  optimizations are confirmed working as designed (docs-only → light, duplicate-push skip, ceremony pushes
  cheap) — volume × billing shape is the driver, not classification misses.
- **Review budget (CodeRabbit):** hit the fair-usage "Adaptive PR review availability" throttle
  (95th-percentile identity, 7-day rolling window; Pro degrades to 1 review/hour at 60+ reviews/week). Key
  finding for policy: PR, IDE, and CLI reviews meter as separate hourly pools, and the adaptive throttle tracks
  PR reviews specifically — a CLI-frontline lane both relieves PR quota and stays under the adaptive threshold.
  Pro+ (~1.5× weekly headroom) judged insufficient alone; remediation is demand-side metering (review depth and
  channel scaled to change weight), not supply-side upgrade.
- **ROADMAP conflict class (systemic):** every shipping PR now conflicts on `ROADMAP.md` — the derived-artifact
  conflict class the derived-vs-mutated split (ADR-020) predicts: concurrent branches each carry a render
  derived from their own base snapshot, and git line-merge can't converge derived content. In-session friction
  fixes don't touch it; the structural fix is regen at the merge boundary (branch PRs stop editing ROADMAP;
  base-side regen keeps it current — branch-side staleness is already the documented model). Routed to
  `roadmap-tooling` (owns regen triggers); complements the day-1 auto-regen errand capture (remedy vs.
  elimination).

Routing: metering-policy design + end-to-end review-surface coherence route to the holistic review WU
(disposition vs. the existing `review-method-family` stub pending — likely rescope-in-place); interim
CLI-frontline wiring lands via a `pre-pr-open` errand; lane-vocabulary seam captured to the review-gate WUs; CI
test-job split-vs-consolidated re-weigh captured (§ Errand).

### Day-2 evidence — CTH ship: terminal-WU state has no owned exit ceremony (2026-07-16)

First wave-3 WU shipped end-to-end (`cli-test-hardening`, teardown → stamped detached husk), supplying the first
live observation of the post-ship terminal state — direct input to the 5.5 teardown-symmetry cell:

- **Teardown mechanics held** (husk stamped, branches reaped, user workspace closed), but the session ended with
  no owned closing ceremony: the agent improvised the terminal summary because no workflow emits a typed boundary
  block there (session-init and handoff both have one; the exit loci don't).
- **`session-handoff` cannot dispatch the state:** its between-WUs path is content-correct for post-ship
  (WORKING-MEMORY review, sync, confirm, no SESSION-NOTES) but keys on "no active WU + non-`chore/` branch" — a
  husk is detached HEAD, so the shipped-terminal state falls through undefined.
- **Base sync is mechanically wrong-sited:** the post-ship sync must freshen the primary's checked-out base, and
  a linked worktree/husk cannot (`git fetch origin main:main` refuses — reproduced at this session's init from
  FP's own worktree, 44 behind after the wave's ships).
- **The missed WORKING-MEMORY moment:** WU-ship is the dominant `_Remove when:_` trigger event, and the one
  ceremony positioned to prompt the review doesn't know a ship just happened.

Verification stays FP's (5.5 weighs this with the remaining teardown evidence); the actionable design routed
out 2026-07-16 per the seam-routing rule (latent, not consumed by remaining waves, too large for Phase 7):
terminal-WU handoff mode + sync-only handoff tier + boundary-marker family captured to `handoff-optimization`;
the adjacent errand sweep-loop gap (run-errand close has no next-offer; `--errand` vs `--housekeep` doorway
legibility) captured `WU_Target: TBD`, integration explicitly held for 5.3's batch-shape decision.

### Day-2 evidence — base auto-sync structurally refused in linked worktrees (2026-07-16)

Two independent sessions hit it same-day (FP's own init this morning; HLD's fresh session init): the
base-branch-sync channel's configured auto-pull (`session.init_pull.base: always` → `git fetch origin
main:main`) fails with git's "refusing to fetch into branch … checked out at <primary>" — and under the
linked-worktree model this refusal is **guaranteed, every session**: the fetch-into-ref shape assumes the base
is not checked out anywhere, but the launchpad model keeps `main` checked out at the primary permanently. The
channel's `pull` arm is structurally dead in exactly the topology FP verifies; sessions degrade correctly to a
stale-base orientation surface, so this is loud advisory noise (repeated every init), not a gate. The
stale local base itself is real (44 behind at both observations) and only clears by freshening from the
primary's own context (`git -C <primary> pull --ff-only` on a clean tree) — the reach-into-primary shape
`session-locus-model` already flags, and further evidence for the base-sync verb named in its § Boundaries.
Routed: determinate CLI fix captured (`USER-INBOX § Errand` — probe resolves the channel to `surface` with
primary-aware prompt text when the base is checked out in another worktree); the alarming base-drift rendering
riding along (71 raw commits / six overlapping paths at HLD) is `base-drift-guidance`'s already-captured
concern, re-observed.

## Wave-3 induction evidence

### Cell 5.2.a — errands-ref same-slug collision (2026-07-16) — CONFIRMED HOLDING + surfacing seams

Induced in an isolated two-clone rig (local bare origin, synthetic identity `bi-probe`, the real CLI verbs
driving `refs/arc/user/{id}/errands` end-to-end), so no live identity refs were touched:

- **Union leg:** distinct slugs opened on two machines union cleanly through the non-fast-forward reconcile
  (fetch → per-slug tree merge → commit onto both tips → retry push); the reconcile is transparent at the verb.
- **Collision leg (the cell):** the same slug opened on both machines (records always diverge — `createdAt` /
  `intent` bytes) surfaces **loud** at the loser's push: `conflict` outcome, local ref intact, remote unchanged,
  the open itself completing non-fatally with the record safe locally. Matrix prediction **holds**.
- **Recovery (playbook):** `arc errand close --force <slug>` on the losing machine removes its record; the
  close's own push then reconciles — the survivor unions back into the local ref and every wedged record
  publishes. No ref surgery needed; verified live (`probe-y` released, survivor record converged on both sides).

Surfacing seams routed to Phase 7 (Task 7.4):

1. **False self-heal promise:** every errand verb renders the conflict as "Record push deferred (conflict); it
   reconciles on the next `arc sync`" — untrue for a same-slug collision, which never self-reconciles and needs
   the recovery above (`handlers/errand.ts`, five conflict arms).
2. **Colliding slugs never named:** the `conflict` outcome carries `slugs[]` but both consumers drop it
   (`handlers/errand.ts`; `handlers/sync.ts` collapses to the bare detail string `conflict`), so the operator is
   never told which slug collides — costly because a single collision **wedges the whole per-identity ref**:
   every subsequent record publish is blocked behind it (verified: an unrelated open stayed unpublished until
   recovery).
3. **Fresh-machine no-trace:** `recordErrandPartialPushMarker` returns `false` when no sync-state record exists
   (the fresh-clone / materialize case) and the verb call sites discard the boolean; session-init then surfaces
   nothing — collision visibility degrades to one transient warn line.

Recorded, not routed: sibling-machine records whose branches aren't pushed yet render in session-init as
"names missing branch `chore/<slug>`; cleanup may be required" — misleading for a live cross-machine errand in
the window between record sync and first branch push. Wave 4's cross-machine cells re-observe this surface
naturally; disposition it there.

### Cell 5.2.b — `USER-INBOX` removal reconciliation (2026-07-16) — PREDICTION EXTENDED + one new wedge

Induced cross-machine in a two-clone rig (local bare origin, synthetic identity `bi-probe`, real
`user inbox-remove` / `save` / `push` / `pull` verbs). Four results:

- **Different-entry removal race from a stale copy → silent resurrection (the predicted lost-update, extended
  to removals).** A removes X and publishes the tombstone; B — holding a stale copy with X live — removes Y and
  saves on a later commit; the recency walk takes B's note's live mention of X over A's older tombstone. X
  resurrects on the merged view, propagates back to A (its own removal silently undone), and the tombstone
  vanishes without residue. Direct evidence for Task 5.4's disposition: the `resolveCrossWuState` recency
  limitation covers removals, not just body edits.
- **Same-entry removal race → converges.** Both sides tombstone Z; the merged view stays removed. The
  matrix-predicted safe case holds.
- **Serialized practice prevents resurrection — structurally.** Pull-before-write materializes the winning
  tombstones into the on-disk file (`## Removed:` sections); the next save re-parses and re-publishes them, so
  recency protects the removal. Confirmed live: with B pulling first, X stayed dead everywhere. The
  pull-at-init + single-drain-locus practice is a real mitigation; record it in the playbook as the operative
  discipline until 5.4's disposition lands.
- **NEW — same-commit concurrent-save wedge (unpredicted, loud, no sanctioned exit).** Two machines saving
  divergent notes onto the *same* base commit — routine when both drain at the same `main` tip — cannot
  converge through any verb: the push auto-reconcile unions manifests per-file and refuses on any same-path
  divergence (misreported as "the union produced an unparseable note"; the manifests parse fine),
  `user pull` refuses diverged refs to preserve local notes, and `arc sync`'s paired push hits the identical
  wall. The only offered exit is `arc user push --force` — destructive and contagious (the overwrite makes the
  other machine diverge in turn). The entry-aware `mergeCrossWuFile` machinery (union + tombstones + recency)
  that resolves exactly this sits on the load path but is never consulted by the push reconcile
  (`mergeManifestContent`, `lib/user-sync/compaction.ts`). Routed as a split-out capture (`USER-INBOX`,
  target TBD — candidate `sync-primitive-discipline`; `notes-export-state-coherence` shipped), sequenced behind
  wave 4's cross-machine cells, which observe this surface. Guidance seams routed to Task 7.5: `user status`
  points at a non-existent `repair` verb, the refusal message misdescribes the failure and offers no
  procedure, and status renders the annotated commit's age as the note's save time.

### Cell 5.2.c — compaction-seed shared-checkout race (2026-07-16) — CONFIRMED + refined benign

Induced in a single-clone rig (synthetic identity, real `arc status --session-init --write-compaction-seed` and
`arc recover audit` driving the seed end-to-end):

- **Clobber shape confirmed:** one per-checkout seed file, no session discriminator, atomic write — a second
  session's emission replaces the first cleanly (last-write-wins, never corruption).
- **"Loud after baseline" is enforced, not just visible:** a divergent-state clobber (branch switch + dirty
  file between emissions) makes the victim's `arc recover audit` **stop** (`ready: false`,
  `dirty-path-drift` with expected/actual path sets) — the foreign frame is refused, not injected.
- **"First-write silent" refined benign:** state-coincident sessions (the realistic drain + errand pair sharing
  the primary at one tip) produce seeds differing **only in `emittedAt`** — the seed is wholly
  checkout-derived, carrying no session-private state, so a silent clobber injects an *equivalent* frame.
  Harm is bounded to state drift, which the audit catches. Better than the matrix's classification.
- **Gap (routed to Task 7.6):** branch identity is not audited — a clean-tree seed emitted on a sibling
  session's branch audits `ready: true` against a `main` checkout (loadset, task cursor, and dirty paths are
  compared; `seed.branch` is not). Bounded — the next probe self-corrects the narration — but branch is
  exactly the dimension an errand-beside-base shared-checkout clobber always changes.
- **Practice:** one-session-per-checkout has held across all waves; the primary under drain + errand overlap
  is the only realistic shared-checkout candidate — the same serialization 5.3's pin-primary leaning protects.

### Detector-tests 5.5 — wave-3 detectors + teardown symmetry (2026-07-17) — CONFIRMED

Wave 3's detector verification composes the rig-side firings (recorded per cell above) with live-state negatives
taken after the wave's ships and teardowns; the teardown-symmetry trace-through (target 2) is verified against
two real WU ships and a full errand wave.

- **Errands-ref collision surfacing** — positive in the 5.2.a rig (loud at the loser's push, local ref intact,
  `close --force` recovery); live negatives clean: `errandState` shows zero residue and correctly classifies the
  one live errand (`chore/cut-ci-billed-minutes`, `merged-cleanup` — the split-out CI errand executing in the
  primary under the freshly-recorded occupancy invariant) rather than misclaiming it.
- **Notes-union / reconcile refusals** — positive in the 5.2.b rig (same-slug union refusal loud; wedge refusals
  across union/pull/sync); live negative: the user-notes channel reads `clean`/`same` after the full drain wave.
- **Compaction-seed recover audit** — positive in the 5.2.c rig (`dirty-path-drift` refusal fires; coincident
  clobber audits benign); the branch-identity gap is already routed (Task 7.6). No live recovery was needed this
  wave — no false positives observed.
- **Sweep/husk detector** — live positive-then-negative today: HLD's stamped husk surfaced `removable` and, post
  `arc teardown husk-lifecycle-drivers` (run from the primary), the sweep is empty, `orphanBranchSweep` is
  empty, and both wave-3 slugs read `shipped: true` from base-anchored checkouts.

**Teardown symmetry (trace-through target 2) — held in practice.**

- **WU path, two live end-to-end ships:** CTH (2026-07-16) and HLD (2026-07-17) both stamped husks with
  authorization + shipped evidence, reaped branches remote and local, and completed the two-phase physical
  removal from outside the worktree exactly as designed (HLD's removal ran from the primary this session; the
  compare-and-delete warning on the already-reaped branch is benign-loud idempotent completion).
- **Errand path, full wave of closes:** drains PR #255/#274 plus errand cycles #256–#259 / #275–#277 removed
  and pushed their records (zero residue / materializable candidates remain), dropped inbox-origin captures
  idempotently, and left no partial-push markers.
- **Verdict:** the intentionally-asymmetric paths are non-interfering and both preserve-before-delete — no
  state-safety gap surfaced across the wave. The gaps that did surface are *surface/verb locus* gaps, extending
  Task 7.3's family with two HLD-teardown instances: the stamped husk stayed invisible to every linked-worktree
  session (~10 h, hand-discovered), and `teardown`'s ship-check resolves `completed/` presence checkout-locally
  (refused from FP's then-stale checkout while the husk marker already carried base-anchored evidence; ran
  clean from the primary). Both recorded to 7.3; neither blocks GA mechanics.

**Interlock-friction by work character** (wave-evidence item): recorded through 5.1/5.3 — friction concentrated
in routine reconcile ops and advisory noise, not decision-bearing gates — held for
`interlock-release-refinement`'s post-waves consumption.

## Wave-3 seam-audit decisions

### 5.3 — parallel-errand fork + batch-errand sub-decision (2026-07-17) — RESOLVED

Both wave-gated calls closed once `husk-lifecycle-drivers` shipped and tore down (2026-07-17), weighed on the
accumulated wave-3 evidence.

**Fork — pin-primary for WU purposes, with serialized errand execution in the primary.** The spec's strict
pin-primary arm (every errand spawns a worktree) is *not* what the evidence supports: every observed drain and
errand ran in the primary sequentially and cleanly (drains PR #255/#274; errand cycles #256–#259 and #275–#277
beside two live WU sessions). What the wave *did* confirm is the arm's premise about the primary itself — WU work
never occupies it, its resting state is base, and it serves as the always-fresh orchestration + ceremony surface.
The settled shape:

- The primary never hosts WU checkouts; WUs always spawn worktrees (the shipped model, unchanged).
- Errand / grooming execution relocates to the primary under a **serialization invariant bound to the primary
  checkout** — out-of-WU execution occupies it only when it is free, one out-of-WU session at a time; `chore/`
  excursions return the primary to base at close; the primary is never parked on a branch. (Cell 5.2.c's
  compaction-seed analysis shows this occupancy rule is what keeps the shared-checkout clobber benign.)
- **Warm entries are occupancy-keyed, not temperature-keyed.** A warm errand raised from a WU worktree
  (`arc-errand`) relocates to the primary's base exactly like a cold entry (the shipped `out-of-wu-entry`
  relocate) when the primary is free; when the primary is occupied — or the operator prefers isolation — it
  **spawns its own worktree** instead of queueing or sharing the checkout. This closes 5.2.c's one realistic
  shared-checkout collision candidate (a warm errand beside a live primary session) as a rule rather than a
  practice.
- Worktree spawn otherwise remains the escape hatch for a genuinely concurrent out-of-WU need — supported,
  non-default (BI-1 made it one command; doc-only errands need no deps).

Rationale: the compensation family the strict arm promised to dissolve is real (the guaranteed
`fetch origin main:main` refusal at every linked-worktree init; CTH's wrong-sited post-ship sync) but is
addressed by the primary's resting-state-is-base property plus the routed determinate fixes — not by moving
errands out. The worktree-per-errand tax buys nothing the serialization invariant doesn't already provide at
observed scale. Doctrine consequence (8.1.a): § "Your main worktree is not always on main" still rewrites — its
premise inverts (the primary's resting state *is* base; WU work never lands there; errands are bounded
excursions that return).

**Batch shape — sequential lockstep drain codified; orchestrated dispatch preconditioned, not built.** The
sequential-primary drain (operator scopes and approves the slate up front; one primary agent executes
entry-by-entry in lockstep) is the codified default, documented at 8.1.d's Errand-class slice. Attention is the
bottleneck at every observed scale: with several WUs in flight plus the primary, a nested "which errand" layer
exceeds the operator's tracking budget, and even an errands-only session converges to sequential throughput
because the human is the serial approval gate. The "sequential feels slow" regime is addressed by tightening
per-errand overhead (the sweep-loop next-offer seam), not by parallelism. Exits dispositioned:

- (i) **Codified sequential drain — adopted.**
- (ii) **Orchestrated drain — demoted to a preconditioned escalation.** Feasibility is demonstrated (delegated
  errand #275) but the fit is structurally poor today: an errand's deliverable ≈ the subagent's scope, so every
  feedback loop crosses the primary as a relay hop — taxing exactly the gate conversation that is the actual
  bottleneck; much errand work fails arc-worker's eligibility bar by design (errands sit below spec-worthiness,
  not below judgment); and subagent observability is harness-variant, so the doctrine cannot assume it.
  Preconditions captured to `execution-delegation-doctrine` (USER-INBOX): an errand-scoped runner profile,
  non-interactive gate handling, observability parity.
- (iii) **Session-per-errand / first-class concurrent-errand lifecycle — rejected.**

**New decision input — metered external budgets.** Wave 3 evidenced a second concurrency-scaling axis beside
operator attention: metered third-party surfaces (Actions minutes exhausted 2+ weeks early, then 75% again after
a top-up; the CodeRabbit adaptive throttle). Doctrine reconciliation carries it — "scale concurrency to the
attention you can give it" gains a metered-budget sibling — and it independently reinforces sequential-first.
Live grounding gathered at the weigh-in: the Review Gate controller is `disabled_manually` (the 2026-07-11
schedule-tick spam ended in a manual off-switch — no cron spend), Wakeup bills ~8 min/day at current volume, and
the driver is plain CI volume × billing shape (57 runs/48h on a 9-job heavy shape billing ~12 min per ~7-min run,
with 2×/10× windows/macos multipliers on the targeted portability leg). Remediation split out as a combined
extended errand (USER-INBOX § Errand: shared-setup reuse + heavy-lane defer), hard-gated at GA closeout
(Task 8.5); the self-hosted-runner option is retained (held capture) pending the remediation's measured residual.
The day-1 shared-machine load-flake datapoint is retired as evidence — a local runaway process, since resolved.

### 5.4 — same-entry cross-WU merge disposition (2026-07-17) — RESOLVED

Disposition: **accept for GA with a documented limitation, plus a deterministic fast-follow captured to
`operational-state-docs`** — the recorded leaning, confirmed by the 5.2.b induction; "absorb into FP" and
"spawn-dependency gating GA" both rejected.

- **Evidence.** Cell 5.2.b extended the predicted recency lost-update to removals: a different-entry removal
  pushed from a stale sibling copy silently resurrects the other side's removed entry, while same-entry removal
  races converge (both sides tombstone). The serialized pull-before-write practice prevents resurrection
  structurally and held live — recorded as the playbook discipline. The unpredicted same-commit concurrent-save
  wedge is already its own split-out (entry-aware union at push reconcile, sequenced behind wave 4) and is not
  part of this disposition.
- **Why accept.** Exposure is narrow — genuinely-concurrent same-entry edits across worktrees, within
  `CROSS_WU_NOTE_WINDOW` — on recoverable, gitignored state (pre-load backups). The 5.3 occupancy invariant
  narrows it further: out-of-WU writers serialize on the primary, leaving WU-worktree pairs editing the same
  identity-global entry as the remaining window. A deterministic merge is a real fix with a known direction,
  but not one this exposure justifies gating GA on.
- **Documentation lands in Phase 8:** 8.1.c sharpens the doctrine's shared-state line; 8.2.c verifies the
  containment invariant ("same-entry merge loss documented with recovery"); the incident playbook carries
  pull-before-write as the operator discipline.
- **Fast-follow spawned:** USER-INBOX § Work Unit capture (`WU_Target: operational-state-docs`) carries the fix
  direction — causal ordering where note commits are ancestry-orderable, deterministic tie-break
  (lexicographically-smallest annotated-commit SHA) where genuinely concurrent, never wall-clock — over
  `resolveCrossWuState` and the note-window read path, extended to removal/tombstone reconciliation per 5.2.b.

## Wave-4 induction evidence

### Cross-machine materialize + notes convergence (2026-07-17, Tasks 6.1–6.3) — CONFIRMED + one seam

A real second machine (laptop, distinct machine-id) started `burn-in-probe-c` (`arc start --new`, planning
fixture), authored a draft increment + handoff SESSION-NOTES, pushed the branch, and synced notes; the WSL
primary materialized and resumed across the boundary under real latency.

- **Materialize spawn arm (6.1):** `arc materialize burn-in-probe-c` from the WSL primary spawned the worktree
  from origin's ref and resumed at the pushed tip. `arc status`'s `occupied: true` (in-flight-anywhere) did
  **not** block materialize — the verb's own gate is checked-out-here, a correct separation, recorded as a
  finding. A first pass carried only the spawn seed (the machine-2 content edits had been missed); the re-run
  against real content confirmed both channels carried genuine machine-2 work — the draft's
  "increment 1 from machine 2" (branch fetch) and the SESSION-NOTES handoff bullet + Commit-at-Handoff
  `f12e622d` (notes ref).
- **Projection contract / cross-machine notes (6.2, trace-through target 1):** `arc user pull` restored 5 files
  keyed to the branch tip as a clean fast-forward each time (`c899889 → c84006ae → 2a029795 → cfb2dac0`), with
  inbox captures preserved as an ancestor throughout — no divergence, no tombstone leakage. Per-WU SESSION-NOTES
  isolation and cross-WU entry-union both held across the boundary.
- **In-place arm (6.1):** not live-exercised — no second remote-only target was available, and re-materializing
  probe-c refuses as already-local (the double-materialize guard, distinct from the occupancy guard). Recorded as
  verified-by-construction (same materialize core, target-dir = current worktree) plus existing unit tests;
  occupancy guard not live this wave (minor gap).
- **Notes-lag detector (6.3):** a machine-2 notes-only edit + push (CI-free) put WSL remote-ahead; the
  session-init user channel fired `state: remote-ahead`, `recommendedAction: prompt`, with dirty-aware prompt
  text — then the re-pull converged (`local == origin == cfb2dac0`). Fires loud and converges clean under real
  latency.
- **partial-push marker + behind-base-at-integration (6.3):** partial-push-marker fires were verified in wave 1
  (synthetic, § Detector-tests 3.3) and not re-induced here (needs a deliberately-failed sync push). The
  behind-base surface is live on FP itself (184 behind base at this session's init) — real-latency behind-base
  evidence without forcing a fixture integration.

**New seam — materialize pollutes ROADMAP consistency under full protection.** `arc materialize` regenerated the
primary's ROADMAP to add the newly-in-flight probe-c row and **staged it uncommitted** on `main`, where full
protection forbids committing it. Worse, the render sources in-flight rows from **origin refs** (confirmed:
removing the local branch/worktree left the row), so any materialized (or otherwise-remote) plan branch makes
every worktree's ROADMAP "want" that row — tripping the regen hook on a sibling worktree's next commit (verified
live: the pre-commit `--staged` render carries the ref-sourced probe-c row, so an FP-branch commit is blocked
until the fixture's origin branch is deleted). The general form is broader than materialize: *any* new in-flight
branch appearing after a worktree's last ROADMAP regen trips that worktree's next commit — materialize is one way
to add the ref, and regular base merges are what kept FP current with its siblings during waves 2–3. A distinct
trigger from the merge-boundary ROADMAP conflict class already routed. Routed to `roadmap-tooling` (USER-INBOX);
the deeper question it raises — whether in-flight rows should derive from tree metas rather than ephemeral refs —
is named there. **Phase 8 candidate:** document as a GA parallelism limitation in the incident playbook (recovery:
`arc status --project --staged > ROADMAP.md`), same disposition as the same-entry merge (5.4).

**Fixture retirement:** probe-c is retired at wave close (delete origin `plan/burn-in-probe-c`, remove both
worktrees, clean its per-WU notes), which also resolves the ROADMAP drift above.

## Shared-mutable-surface matrix

This is the finalized Layer-1 starting state for the burn-in waves. It is a source-checked classification
matrix, not the wave evidence itself: waves still induce the conditions and verify the detectors/recovery paths.

Disposition key: **BI-n** = committed build item in `tasks-finalize-parallelism.md`; **wave n** = live burn-in
verification; **playbook** = document/recover rather than build inside FP.

### A. Repo-shared surfaces — common git dir or remote

- **Base branch.** Writers are WU integration, errand / housekeep grooming PRs, and any partial-protection direct
  base commit. The remote serializes the ref update, so two pushes/merges do not overwrite each other, but a branch
  can merge cleanly after `main` moved under its premise. Classification: **silent semantic drift unless the
  behind-base gate fires**. Disposition: pre-FP behind-base reconcile gate is landed; **waves re-verify** the
  session-init / integration surfaces and **playbook** carries recovery.
- **`refs/notes/arc/user/{id}`.** Writers are `arc user save`, handoff/sync saves, and paired push paths across WU
  sessions, errands, housekeep, and machines. The local notes write is `git notes add`: `runUserSave` wraps it in a
  per-identity advisory lock, but the lock currently anchors under the checkout's `.arc/user/{id}/.internal/`, so
  sibling worktrees on the same machine still acquire distinct locks and can race the shared ref. Cross-machine
  push divergence reconciles through the notes push/merge path, but same-machine local ref clobber remains the
  decisive gap. Classification: **silent**. Disposition: **BI-3** re-anchors the lock at the git common dir; **wave
  1** induces same-machine sibling notes saves.
- **Paired-push sibling-note export.** The same local notes ref is shared by sibling worktrees, while paired push
  pushes only the current branch before publishing the whole notes ref. Interleaving A save, B save, A paired push
  can publish B's note for an unpushed B commit, violating the branch-before-notes invariant while still succeeding
  and clearing the partial-push marker. The BI-3 common-dir save lock prevents local note clobber but does not make
  notes export branch-bounded. Classification: **silent invariant violation**. Disposition: **BI-3** adds a
  branch-bounded paired-notes export / reachability guard; **wave 1** induces the export-before-branch case.
- **Same-entry cross-WU resolution.** Writers are concurrent edits to one `WORKING-MEMORY` / `USER-INBOX` entry that
  later merge through the notes window. `mergeCrossWuFile` unions different entries, honors live removal
  tombstones, and resolves the same `(section, key)` identity by the most-recent note that mentions it. Two
  genuinely concurrent edits to one entry therefore produce a last-note-wins lost update. Classification:
  **silent, narrow, recoverable**. Disposition: **playbook** limitation for GA; deterministic tie-break / causal
  ordering is a fast-follow build candidate outside FP. **Wave 3** exercises the three-remover `USER-INBOX` seam.
- **`refs/arc/user/{id}/sync-state`.** Writers publish per-machine partial-push markers before the notes leg. Direct
  writes use tree commits with compare-and-swap retry; cross-machine non-fast-forward pushes reconcile by
  per-machine union. Today each worktree mints a distinct `.machine-id`; after **BI-3** sibling worktrees share a
  workspace machine id, so a same-workspace marker publish can overwrite a sibling's marker. That is
  presentation-only only when no earlier live notes-push intent is hidden; two unresolved sibling intents under one
  key can otherwise make a cross-machine resume miss notes lag. Classification: **loud / aware when every live
  intent remains represented; silent if same-workspace key collapse hides one**. Disposition: **BI-3** keys marker
  storage by export intent, retains machine id as provenance, and uses the same planned export target as the notes
  leg; **wave 1** verifies cross-worktree detector reads and the multi-intent shared-key case.
- **`refs/arc/user/{id}/errands`.** Writers are errand open/close/promote and errand partial-push recovery. Direct
  writes use the same tree-ref compare-and-swap retry; remote non-fast-forward pushes merge distinct slugs and
  surface divergent same-slug records as a conflict, leaving the local ref intact. Classification: **loud**.
  Disposition: **wave 3** verifies live errand beside concurrent WUs.
- **Git-guarded repo surfaces.** Worktree registry, branch creation, branch delete/push, `.git/config`, and
  lower-level `update-ref` races are guarded by git's own locks / old-value checks / refusal behavior. A second
  writer sees a refusal or non-fast-forward, not silent loss. Classification: **loud**. Disposition: **playbook**
  records symptoms and retry/reconcile steps.

### B. Tracked, branch-mediated surfaces

- **`ROADMAP.md`.** Writers are lifecycle ceremonies and hand-rendered readiness updates; the shipped executor still
  emits a "ROADMAP regen pending" advisory until `roadmap-tooling` owns the real renderer. Ordinary branch merges
  usually conflict on concurrent table edits, but a stale derived render can merge cleanly when the changed rows do
  not overlap. Classification: **loud with silent stale-render residue**. Disposition: `roadmap-tooling` before
  **wave 1**; wave 1 exercises concurrent ROADMAP regen live.
- **Foreign stub metas / draft buffers.** The housekeep drain routes captures into existing stubs from a base-branch
  write context; a concurrent owning-WU graduation/groom can move the target directory while the drain's branch
  edits the old path. The rule-level mitigation is to resolve lifecycle state by slug (`arc status <slug>`) before
  treating a stub as live, but a post-check race can still orphan a routed note until merge review catches it.
  Classification: **silent residue**. Disposition: drain-time status check + **wave 3** drain-shape evidence;
  recovery goes to **playbook**.
- **`completed/` archive index.** `computeArchiveDestination` assigns `completed/{quarter}/{NN}_{name}` by scanning
  the current quarter and picking `max(NN)+1`. Two concurrent archives from the same base can mint the same `NN`
  with different slugs and merge without data loss but with duplicated completion-order numbers. Classification:
  **silent cosmetic drift**. Disposition: **playbook** renumber recovery; base-ref shipped-set reads reduce stale
  consumers but do not change the assignment mechanism.
- **`ATOMIC-INBOX`, cohort docs, and `arc-config.yml`.** Writes are rare, human-reviewed, and branch-mediated:
  housekeep flushes homeless atomics, cohort decomposition/closeout updates coordination docs, and config edits are
  explicit operator changes. Overlap is a normal textual merge conflict; disjoint additions can merge cleanly
  without semantic loss. Classification: **loud / acceptable**. Disposition: **playbook** for conflict resolution.

### C. Per-checkout gitignored state

- **Harness integration layer.** Fresh worktrees do not receive `.claude/`, `.codex/`, `.gemini/`, hooks, skills, or
  harness allowlists from git. Without the layer, a session may start outside ARC's recovery and skill machinery,
  which is silent until a recovery/skill path is needed. Classification: **silent blocker**. Disposition: **BI-1**
  registered harness-dir copy-from-primary; **wave 1** verifies harness presence in doc-only worktrees.
- **`node_modules`.** Fresh worktrees lack project dependencies, so node-backed gates fail off-primary; the known
  bare-`npx arc` foreign-registry edge makes "just invoke npx" insufficient. Classification: **loud blocker**.
  Disposition: **BI-1** `worktree.post_create` provisioning; **wave 2** verifies a code WU's gates off-primary.
- **`worktree-marker.json`.** `writeWorktreeOwnershipMarker` writes
  `.arc/system/.internal/worktree-marker.json`; the source comment says the marker is gitignored, but the live
  repo only ignores `pristine.json`, so a spawned worktree currently becomes dirty. Classification: **loud**.
  Disposition: **BI-1** ignore-rule registration / ignored-path move; **wave 1** verifies clean marker state.
- **User files.** Per-WU `SESSION-NOTES` is correctly checkout-adjacent, but `WORKING-MEMORY`, `USER-INBOX`,
  `STATUS.USER`, future `VECTOR.USER`, and identity-global nudge markers are semantically cross-WU while physically
  checkout-local. Live evidence 2026-07-04: the primary and FP worktree inboxes diverged, and the primary probe saw
  only its own captures. Classification: **silent gap**. Disposition: **BI-6** canonical identity-global resolver
  with storage-forward-compat checked against `strategy-storage-evolution.md`, `draft-arc-backend.md`, and
  `operational-state-docs`; remaining row-A same-entry and removal-race seams stay in wave 3 / playbook.
- **`.machine-id`.** `getOrCreateMachineId` currently stores a bare UUID at `.arc/user/{id}/.internal/.machine-id`,
  so sibling worktrees on one machine mint distinct ids. That fragments sync-state marker identity and keeps marker
  semantics per-checkout instead of per-machine. Classification: **silent presentation/coherence drift**.
  Disposition: **BI-3** git-common-dir machine id; **wave 1** verifies sibling worktrees share one id.
- **Spawn-mode transition writes.** The executor's production binding opens user workspaces and stages relocation
  against its bound `cwd`; FP's spawn-mode graduation exposed that the invoking checkout, not the spawned checkout,
  received the transition writes. The spawned session then cannot resolve the WU from its own active tree.
  Classification: **silent until resume fails**. Disposition: **BI-4** spawn-mode ceremony-locus fix; **wave 2**
  re-graduation verifies.
- **`compaction-seed.json` and sibling per-checkout markers.** `resolveCompactionSeedPath` writes one seed per
  identity checkout. Two sessions sharing a checkout overwrite the same file; once a baseline exists, drift is
  visible, but the first-write race has no prior state to compare. Worktree-per-session isolates the steady state.
  Classification: **loud after baseline, first-write silent**. Disposition: one-session-per-checkout invariant +
  **playbook**; waves observe whether any shared-checkout case remains.
- **Audit log.** The release-wrapper audit log appends to `.arc/user/{id}/.internal/.audit-log.jsonl` per checkout,
  and write failure is intentionally non-blocking. Under worktrees the trail fragments by checkout; no work state is
  lost. Classification: **informational completeness gap only**. Disposition: **playbook** note and
  `operational-state-docs` follow-up candidate.

### Cross-cutting row

- **Probe-snapshot staleness (TOCTOU).** Session-init, handoff, and sync decisions read a coherent snapshot and act
  on it; a sibling session can invalidate the snapshot immediately after orientation. The next probe catches the
  drift, and destructive operations still have their own git/dirty/ref guards. Classification: **bounded stale
  premise, self-correcting**. Disposition: **playbook**; every wave deliberately re-probes detector surfaces before
  declaring them verified.

## Seam trace-throughs

These are the two Layer-1 non-write-race seam suspects traced to source. The trace classifies the contract and the
remaining verification hook; the burn-in waves still exercise each one in practice.

### Projection-builder consumer contract

- **Producer contract.** `projectManifest` is a pure projection over an existing sync manifest: it preserves the
  manifest version and path set, strips `## Removed:` sections only from registered cross-WU flat files, and leaves
  per-WU subdir files plus unknown-shape flat files unchanged. `stripTombstoneSections` also preserves
  tombstone-free content byte-for-byte via its early-out, so ordinary sync content is not normalized by accident.
- **Consumer assumptions.** `save-load.ts` writes local sync-state hashes over the projected save/load manifest,
  while raw save readback still verifies the unprojected manifest so projection cannot mask note-write corruption.
  `sync-status.ts` compares projected note, projected disk, and materialized local hash on one tombstone-free basis.
  `merge.ts` strips tombstones from the most-recent base before reconstructing older-only entries and appending the
  current winning tombstones.
- **Classification and disposition.** The contract is **source-consistent today** but **silent-if-drift**: a future
  producer/consumer mismatch could make status read stale/current incorrectly, materialized hashes disagree, or
  tombstone noise re-enter reconstructed content without a hard failure. Disposition: **wave 4** exercises the
  projection contract under cross-machine resume; any drift found there becomes a contract-test or record-projection
  fast-follow rather than an unclassified GA seam.

### Errand-vs-WU teardown symmetry

- **Errand close path.** `openErrand` mints an identity-scoped record in `refs/arc/user/{id}/errands`, optionally
  carrying an inbox-origin back-pointer, and occupies the errand branch in place. `closeErrand` refreshes the base,
  refuses unsafe reaps before record removal, switches off the branch when needed, deletes the local branch only
  after preservation is proven or force-authorized, prunes stale tracking refs, fast-forwards the local base when it
  can, then removes the record and pushes/reconciles that removal. The handler records a partial-push marker on
  deferred record-removal pushes and drops the originating `USER-INBOX` entry only after a successful close; that
  drop is idempotent.
- **WU ship and teardown path.** `integrate` is just the `Active -> Integrating` phase flip; it does not merge or
  reap. `archive` is the mergeable ship: relocate artifacts to `completed/`, set `State: Shipped`, clear the meta
  `Branch` field logically, and close the per-WU user workspace via the `user-workspace` side-effect. Physical
  cleanup is the post-merge `teardown` verb: gate on `completed/` presence, resolve the branch by slug because the
  meta `Branch` field is already `[none]`, remove a linked worktree first or switch the primary to base for the
  in-place arm, then run the merged-safe branch delete and prune. `arc user close` is also replayed in the
  integration tail as an idempotent filesystem-only closer for unattended merges.
- **Classification and disposition.** The paths are **intentionally asymmetric but non-interfering**. Errands own a
  record + optional inbox-origin cleanup and currently have no spawned worktree or per-WU `SESSION-NOTES`; WUs own
  lifecycle artifacts, per-WU user workspace cleanup, and optional linked-worktree teardown. Both delete durable
  intent/projection state only after the work is preserved or the caller has explicitly authorized the destructive
  path. Residual concurrency is already named elsewhere: errand-ref same-slug conflict is loud and wave-3 verified,
  `USER-INBOX` same-entry loss remains the row-A limitation, and branch/worktree refusals are git-guarded loud
  failures for the playbook.

## Adversarial pass

Fresh-context review ran two broad passes plus one targeted BI-3 design pass. Pass 1 found the paired-push
sibling-note export gap, folded into matrix row A, BI-3, and wave 1. Pass 2 confirmed that gap was represented,
then found the sync-state marker multi-intent gap now folded into BI-3 / wave 1, plus the lower-materiality
`USER-INBOX` local removal RMW residue folded into wave 3 / playbook handling. The targeted pass confirmed BI-3 is
a contained extension, not a bad pivot, but tightened the design: `.machine-id` is provenance only; marker storage
is keyed by export intent, and marker `intent` must match the notes export target actually attempted. The passes
withstood source checks for the projection contract, teardown paths, errand ref, archive index, ROADMAP
stale-render, foreign stubs, harness/deps provisioning, compaction marker, and audit-log rows.

## GA checklist starting state

The checklist starts from the finalized matrix above. It closes only when the build gates land, waves induce the
named detector conditions, and the playbook/doctrine closeout absorbs the accepted limitations.

### Build gates before waves

- [x] **BI-1:** spawned worktree provisioning: deps script, registered harness capability handling, per-WU user
  workspace scaffold, and clean worktree marker state. *Landed on base (2.I, #196); field-verified wave 1
  (§ Dogfood 2026-07-05 launch model; Task 3.1.c evidence).*
- [x] **BI-2:** in-place Materialize for cross-machine pickup under the occupancy guard. *Landed on base (2.I
  homogeneity check); field verification is wave 4's.*
- [x] **BI-3:** git-common-dir notes lock, branch-bounded paired-notes export, multi-intent sync-state marker
  handling, and workspace-scoped `.machine-id`. *Landed on base; field-verified wave 1 (Cells 3.2.a / 3.2.b).*
- [x] **BI-4:** CLI-complete start / mini-handoff / spawn-mode ceremony-locus fix. *Landed on base;
  field-verified wave 1 (rich boot off seeded SESSION-NOTES, Task 3.1.c evidence).*
- [x] **BI-5:** validate-first graduate transition crash-class fix. *Landed on base (2.I homogeneity check);
  field verification is wave 2's.*
- [x] **BI-6:** identity-global user surfaces resolve to one canonical machine-local materialization from every
  worktree; per-WU SESSION-NOTES remains worktree-scoped. *Landed on base; field-verified wave 1 (cross-worktree
  captures + notes convergence, Cells 3.2.a / 3.2.b; resolver-backed USER-INBOX writes from linked worktrees).*
- [x] **Deterministic ROADMAP renderer:** renderer slice from `roadmap-tooling` available before wave 1; full
  Heavy WU completion is not the gate. *Available and field-verified wave 1 (Cell 3.2.c: one normalized
  projection from three branch states; stale staged render rejected).*

**2.I.2 homogeneity check (2026-07-06)** — after merging `main` (post-#196) into FP, verified the base-state
precondition the waves require:

- **Build-item CLI (BI-1):** a worktree spawned off `main` resolves `npx arc` to the full lifecycle surface
  (`start`, `materialize`, `park`/`resume`, `activate`/`deactivate`, `integrate`, `teardown`, …); provisioning is
  present (`scripts/worktree-post-create.sh`, `src/lib/git/worktree-harness-dirs.ts` — with the reserved-dir guard
  from the #196 review).
- **Entry-arch (Phase 2.E):** the `--start` focused-recon arm (documented in `session-init.md` and the arc-session
  skill) and the spawn-anchored recipe (`src/lib/harness/worktree-entry.ts`) are on base.
- **Renderer capability / command:** the deterministic ROADMAP regeneration path resolves via `reconcileRoadmap`
  (`src/lib/work-unit/side-effects/readiness-regen.ts`), which composes `composeProjectReadinessView`
  (`src/lib/status/project-view.ts`) and writes + stages `.arc/backlog/ROADMAP.md` as a lifecycle-transition
  side-effect (degrading to an advisory on render/write failure). There is no standalone `arc roadmap` command —
  the **project** readiness view regenerates on lifecycle location moves by design; the per-developer counterpart
  (`STATUS.USER`) renders on demand via `arc status --user`.

Verified by artifact presence + CLI-surface probing (not a live `arc start` spawn, which would cut a real
branch/PR). Merge resolved cleanly — all conflicts took `main`'s integrated version; the only test noise was the
commit-msg-footer suite tripping the hook's `MERGE_HEAD` merge-exemption mid-merge, which cleared on commit.

### Wave evidence to collect

- [x] **Wave 1:** two doc-only WUs in worktrees; verify harness presence, identity-global user-surface visibility,
  notes-lock/machine-id behavior, paired-push sibling-note export prevention, multi-intent sync-state marker reads,
  ROADMAP contention, base-drift surface, and clean marker state. *Complete 2026-07-13 — synthetic fixtures
  (`burn-in-probe-a` shipped via PR #215; probe-b integration-ready). Per-condition evidence: harness presence +
  rich boot (Task 3.1.c), user-surface visibility + notes lock/machine-id + paired-push filter (Cell 3.2.a),
  multi-intent markers (Cell 3.2.b), ROADMAP contention (Cell 3.2.c), base-drift gate + surface (Cells 3.2.d /
  3.2.e, § Detector-tests 3.3), marker state (§ Detector-tests 3.3 sweep exercise). Residue carried forward:
  hook-env advisory seam (resolved same-day: PR #234 merged into FP, repro re-run clean — see Cell 3.2.e),
  marker-intent fulfillment seam
  (Phase 7.2), synthetic-notes cleanup barrier (Phase 8 task, commit `b5c444532`), probe-b integration-path
  decision (open — behind-base state served its purpose and may now reconcile + merge as the wave-1 tail or
  hold for wave-2 overlap).*
- [x] **Wave 2:** two code WUs (slate re-cut 2026-07-14); verify dependency provisioning, off-primary quality
  gates, BI-4 re-graduation, and the graduate-transition crash-class detector. *Complete 2026-07-15 — real
  workload (`commit-message-submission` in flight; `worktree-teardown-decoupling` shipped, PR #246).
  Per-condition evidence: dependency provisioning + off-primary gates confirmed first-hand and retrospectively
  (§ Wave-2 induction evidence; Task 4.2), BI-4 locus confirmed retrospectively with the re-graduation vehicle
  superseded (Task 4.3 `[~]`), BI-5 partial — fail-loud Class guard observed live, old-shape lane on test
  coverage. Marquee catch: the `arc start` dispatch split-brain (§ Wave-2 finding), fixed via split-outs
  PR #242 / PR #243, composer fix consumed live at the 2026-07-15 base merge. Residue carried forward:
  dispatch-fix live verification + `Depends On` discharge vehicle at the wave-3 slate cut (5.1.a); synthetic
  notes/marker retirement (4.5) still gates wave 3.*
- [x] **Wave 3:** two code WUs plus live errand/drain; verify errand ref merge/conflict behavior, same/different-entry
  `USER-INBOX` removal reconciliation, teardown symmetry, primary/errand concurrency fork evidence, and
  interlock-friction observations. *Complete 2026-07-17 — real workload (`cli-test-hardening` PR #269;
  `husk-lifecycle-drivers` shipped + torn down; drains PR #255/#274 + errand cycles #256–#259, #275–#277).
  Per-condition evidence: errand-ref collision (Cell 5.2.a), removal reconciliation (Cell 5.2.b),
  compaction-seed race (Cell 5.2.c), teardown symmetry + detector negatives (§ Detector-tests 5.5), fork +
  batch-shape decisions (§ Wave-3 seam-audit decisions), interlock-friction by work character recorded through
  5.1/5.3 for `interlock-release-refinement`. Residue carried forward: surfacing seams (Tasks 7.4–7.6), locus
  family instances (Task 7.3), same-commit save wedge split-out (sequenced behind wave 4).*
- [x] **Wave 4:** cross-machine resume; verify Materialize spawn + in-place pickup, notes lag / partial-push marker
  surfacing, and projection-contract evidence from Task 1.2. *Complete 2026-07-17 — real second machine (laptop)
  ran `burn-in-probe-c` as a planning fixture; WSL primary materialized + resumed across the boundary. Spawn arm +
  projection contract + notes-lag confirmed live; in-place arm verified-by-construction; partial-push + behind-base
  by cited coverage. One seam surfaced (materialize ROADMAP drift → `roadmap-tooling`). Fixture retirement at wave
  close resolves the drift. Record in § Wave-4 induction evidence.*

### Playbook / closeout items

- [ ] Same-entry cross-WU edit limitation: symptom, recovery from notes/backups, and guidance to avoid concurrent
  same-entry edits.
- [ ] `USER-INBOX` local removal RMW residue: serialized-primary guidance, resurrection symptom, and recovery from
  notes/backups.
- [ ] Base-drift and probe-staleness recovery: re-probe, merge base forward, and do not rewrite pushed branches.
- [ ] Git-guarded loud failures: worktree/branch/config/ref refusal symptoms and retry/reconcile path.
- [ ] Duplicate `completed/` sequence number: cosmetic renumber recovery.
- [ ] Shared-checkout compaction-marker race and audit-log fragmentation: document as non-GA-blocking operational
  state limitations.
- [ ] Doctrine reconciliation: update the concurrent-work / errand-class guidance to match wave evidence, especially
  the pin-primary vs. serialized-primary decision.

## Scope & sizing

Large (week+), and deliberately long-*running* — the burn-in waves are calendar-gated and observational, which
is the intended rhythm, not drift. Broad cross-cohort surface carrying five committed build items alongside the
audit / verify / flip / gate core, plus the doctrine-reconciliation closeout deliverable. Size firms up once the
real seam count is visible; the matrix skeleton bounds the known surface, and the § Resolution model bounds the
cost of a discovered seam (absorb-if-atomic, else spawn a follow-up WU dependency).
