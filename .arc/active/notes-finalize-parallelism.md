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

- [ ] **BI-1:** spawned worktree provisioning: deps script, registered harness capability handling, per-WU user
  workspace scaffold, and clean worktree marker state.
- [ ] **BI-2:** in-place Materialize for cross-machine pickup under the occupancy guard.
- [ ] **BI-3:** git-common-dir notes lock, branch-bounded paired-notes export, multi-intent sync-state marker
  handling, and workspace-scoped `.machine-id`.
- [ ] **BI-4:** CLI-complete start / mini-handoff / spawn-mode ceremony-locus fix.
- [ ] **BI-5:** validate-first graduate transition crash-class fix.
- [ ] **BI-6:** identity-global user surfaces resolve to one canonical machine-local materialization from every
  worktree; per-WU SESSION-NOTES remains worktree-scoped.
- [ ] **Deterministic ROADMAP renderer:** renderer slice from `roadmap-tooling` available before wave 1; full
  Heavy WU completion is not the gate.

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

- [ ] **Wave 1:** two doc-only WUs in worktrees; verify harness presence, identity-global user-surface visibility,
  notes-lock/machine-id behavior, paired-push sibling-note export prevention, multi-intent sync-state marker reads,
  ROADMAP contention, base-drift surface, and clean marker state.
- [ ] **Wave 2:** one code WU plus one doc WU; verify dependency provisioning, off-primary quality gates,
  BI-4 re-graduation, and the graduate-transition crash-class detector.
- [ ] **Wave 3:** two code WUs plus live errand/drain; verify errand ref merge/conflict behavior, same/different-entry
  `USER-INBOX` removal reconciliation, teardown symmetry, primary/errand concurrency fork evidence, and
  interlock-friction observations.
- [ ] **Wave 4:** cross-machine resume; verify Materialize spawn + in-place pickup, notes lag / partial-push marker
  surfacing, and projection-contract evidence from Task 1.2.

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
