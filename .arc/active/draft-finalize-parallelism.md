# Draft: Finalize Parallelism

- **Cohort:** agile-parallelism
- **Origin:** [internal]
- **Purpose:** Own the end-to-end verification and GA gate for ARC's parallelism story — worktree-by-default,
  multiple in-flight work units + errands, and cross-machine resume — delivered across ~6+ work units in two
  cohorts that each ship and integrate independently. Shipping all members is not the same as a
  verified-watertight-end-to-end system; this is the cohort closeout that proves the seams between independently
  shipped members and blesses the worktree-by-default flip for general use.

---

## Problem / Motivation

Parallelism is delivered piecemeal: worktree-default, multi-in-flight WUs/errands, and cross-machine coherence
span the `concurrent-work-conventions` and `cross-machine-coherence` cohorts plus `out-of-wu-entry`, each landing
on its own schedule. Seams *between* those members will otherwise only surface in actual multi-WU practice — the
friction-after-the-fact this closeout exists to pre-empt. Nothing today owns the end-to-end verification or a
GA-readiness checklist; per-cohort closeout criteria are narrower than the cross-cohort whole.

## Scope (audit + verify + flip + gate, plus committed seam fixes — NOT a redesign catch-all)

- **End-to-end trace-through** of every parallelism path — start/discovery → `init-work-unit` (worktree spawn) →
  planning → execution → integration / merge / completion → cross-machine resume — hunting seams *between* the
  independently shipped members. Known seam suspects:
    - the three-remover `USER-INBOX`-line reconciliation (`run-errand` § Complete, same-session finalize,
      session-init errand sweep);
    - the projection-builder consumer contract between `async-merge-lifecycle` and `cross-machine-sync-coherence`;
    - base-drift across worktrees;
    - errand-vs-WU teardown symmetry;
    - **the primary worktree as a contended singleton** — errands, housekeep drains, plan-grooming, and
      base-context ceremony writes (ROADMAP regen, archival) all assume the primary checkout; concurrent
      out-of-WU sessions compete for one resource that nothing today arbitrates.
- **Verify the worktree-default flip in real practice** — `async-merge-lifecycle` *lands* it (create-new
  `arc start` + `init-work-unit` default); this WU *exercises* it across genuinely concurrent WUs.
- **Own the parallelism GA-readiness checklist** — the single enumeration of what-must-be-true for
  worktree-by-default + multi-in-flight to be blessed. Exists nowhere today.
- **Committed build items** and **seam-audit decisions** below — concerns routed in while the members shipped,
  integrated at the 2026-07-01 planning iteration and the 2026-07-03 wave-zero fold.

### Committed build items

Concrete gaps with settled direction — FP builds these. (Two further items from the 2026-07-01 drain — the
behind-base reconcile gate in `integrate-work-unit` and the sweep base-ref shipped index — were split out same
session as **pre-FP errands**, captured to `USER-INBOX § Errand` pre-routed; the § Milestone path carries their
sequencing, and this WU's entry verifies they landed.)

**1. Worktree dependency provisioning — always-invoked post-create manifest.** The flip-decisive gap:
`arc start` create-new and the worktree-spawn primitives create a worktree but don't provision dependencies.
`node_modules` is gitignored, so a fresh worktree has none; git / shell hooks survive, but every node-backed
quality gate fails there (`typecheck` / `test` / `build` / `lint:ts` / `lint:md`) — confirmed live 2026-06-15
(`markdownlint-cli2: Permission denied` in a worktree). A doc-only WU in a worktree is fine; a code WU is
non-functional for its mandatory per-task quality-gate checkpoint until deps are provisioned. No parallel code
WU has ever run in a worktree — this item gates the flip itself. Direction: an **always-invoked**
post-worktree-create setup command (e.g. `worktree.post_create`) the scaffold runs on every worktree create —
not optional, not a doc-only note. Sane default when unconfigured: emit a help / notice (deps must be
provisioned), never a silent no-op. The project supplies its command — a *script* here, not bare `npm install`
(see the enrichment below); ARC owns the seam + invocation point + default. Coordinate with the
verify-and-configure workflow so the command is configured as an agent-led part of initial ARC setup. Absorbed
here rather than a scaffold-owner WU because the flip cannot be blessed without it.

Broadened at the 2026-07-01 gap-hunt: deps are one instance of a wider class — **untracked per-checkout
prerequisites**. A fresh worktree also lacks the harness integration layer (`.claude/` / `.codex/` / `.gemini/`
are gitignored: skills, hooks, permission allowlists — a session launched there has no ARC skill entry, emits no
compaction seed, and gets no post-compaction recovery injection) and the gitignored user-dir scaffold. The
post-create seam provisions all of it — and since bare `npx arc` in a deps-less worktree can resolve to an
unrelated npm registry package, provisioning precedes any CLI invocation there.

Enriched at the 2026-07-03 wave-zero dogfood (hand-provisioning FP's own worktree): the seam is an **ordered
manifest**, not a single command — (1) project deps script, (2) registered harness dirs, (3) user-dir scaffold
at the correct locus (build item 4's ceremony-locus fix). Deps alone took install → build → re-install before
`npx arc` resolved (workspace bin links live at gitignored `dist/`, absent at install time → no bin link; the
foreign-registry hazard fired live), so the project hook (`worktree.post_create`) is a *script*, not
`npm install`. Harness layers provision by **copy-from-primary as the universal default**: ARC keeps a
registered list of gitignored harness dirs (`.claude/`, `.codex/`, `.gemini/`, `.opencode/`, …) and mirrors
whatever the primary has — zero per-harness knowledge, covers harnesses ARC has never heard of. The
`arc update`-style **regeneration** path (claude/codex reference impls + registration at `verify-and-configure`
/ an add-agent workflow — the hooks / release-wrapper precedent) is the clean evolution; timing settled
2026-07-03: **downstream** — BI-1 ships copy-from-primary plus the registered-dir list as the designed seam,
and the regen path routes to the verify-and-configure / add-agent owner post-FP (§ Resolution model handles
escalation if the waves surface drift pain). Unconfigured default stays notice-not-silent.

**2. In-place Materialize for cross-machine pickup — mirror the `--here` opt-out.** The begin-work transitions
(`graduate` / `resume`) carry a `--here` in-place opt-out so a stub can graduate or a parked WU resume in the
current checkout without spawning a worktree. **Materialize** — cross-machine pickup of a remote-only in-flight
WU — is the cross-machine twin of the same spawn-vs-in-place question and is currently **spawn-only**
(`git worktree add origin/<branch>`); a single-checkout / heavy-toolchain dev picking up a remote WU on a second
machine hits the same worktree + dependency-provisioning tax the local hatch relieves. Direction: mirror the
opt-out — an in-place Materialize (`git fetch` + checkout the remote WU branch in the current checkout, honoring
the worktree-occupancy guard) alongside the default spawn. Locus-only, exactly like the local hatch: coherence
still rests on the pushed branch + notes-sync; reuse the hatch's no-spawn reconcile-branch legs where applicable.

**3. Repo-shared anchoring for per-machine sync guards (gap-hunt finding, 2026-07-01).** The notes advisory lock
(`user/{identity}/.internal/.notes.lock`, `lib/user-sync/notes-lock.ts`) serializes writers to the repo-shared
`refs/notes/arc/user/{identity}` — but the lock file anchors at the *worktree* root (`resolveArcRoot` walks to
the nearest `.arc`), so it only serializes sessions inside one checkout. Post-flip, two same-machine sessions in
different worktrees each acquire "the" lock and race the unguarded `git notes add` read-modify-write — a
silently dropped note, the exact loss the lock exists to prevent (the non-fast-forward `cat_sort_uniq` recovery
covers cross-*machine* divergence, not a same-machine ref clobber). Direction settled (2026-07-03, adversarial
pass 1): **re-anchor the lock at the git common dir** — a contained path change to the proven mechanism,
serializing all same-machine worktrees; the principled evolution (rewriting the notes save as ref-CAS with
retry) routes to `sync-primitive-discipline`, already named FP-adjacent. `.machine-id` settles with it as
**workspace-as-machine**: minted at the git common dir, so worktrees share one machine identity — the
semantically correct reading (worktrees *are* one machine) and the end of marker-tree pollution from
per-checkout mints. Gates wave 1 — the first concurrent notes sync.

**4. Worktree launch bridge — one-session init as the worktree-by-default ergonomic target (wave-zero fold,
2026-07-03).** FP's own graduation — the first spawned-worktree launch — exposed the init ergonomics gap: the
session that runs `init-work-unit` stays in the primary while the WU lives in the new worktree, so starting one
WU takes two agent sessions with no context bridge between them. The in-place model hid the distinction between
the *orchestration locus* (discovery + graduation ceremony) and the *WU locus* (the work); worktrees separate
them physically. Materialize already works "CLI mechanics, then a session resumes there" — local start is its
local twin, so the shape is sound; the friction is the mechanical tail leaking into the init session and the
dropped context. Settled direction — **layered model**:

- **(a) Substrate, harness-agnostic:** make `arc start` CLI-complete — spawn, provision, relocate, reconcile,
  ceremony commit, push — invocable from a session *or* the bare shell; the first worktree session is then a
  plain Resume. The three judgment steps blocking this are all eliminable: `Next Action` has the deterministic
  `[begin current workflow]` sentinel, ROADMAP regen becomes deterministic when `roadmap-tooling` lands
  (pre-wave-1 on the milestone path anyway), and graduation commit messages are formulaic
  (`chore(arc): graduate <name> into active`).
- **(b) Bridge:** `init-work-unit` ends with a mini-handoff into the spawned WU's seeded SESSION-NOTES — the
  existing handoff idiom applied at spawn (the notes ref is checkout- and branch-independent) — so the worktree
  session boots rich instead of cold.
- **(c) Sugar, harness-conditional:** where the harness can relocate a live session into a worktree, offer the
  hop. Researched 2026-07-03 — two capability tiers, surfaced per harness (never hidden). Claude Code supports
  **true relocate** (`EnterWorktree`). Codex CLI has **no live-session relocate** (the analog exists only in
  the Codex desktop app; CLI feature requests are open and unscheduled) — its supported shape is
  **spawn-anchored**: launch a fresh session in the worktree (`codex --cd <path>` interactive;
  `codex exec --cd <path>` non-interactive), which layer (b)'s mini-handoff makes first-class — the fresh
  session boots rich, so spawn-anchored ≈ relocate minus live context. Caveat: Codex has known cwd-confusion
  bugs when run inside a linked worktree — re-verify at build time.

Carries the **spawn-mode ceremony-locus fix**: during FP's graduation the `start` transition staged the
backlog→active relocation in the **primary's** index (on `main`) and opened the per-WU user workspace in the
**primary's** user dir — correct under `--here` (invoking checkout = plan branch), wrong under spawn, where the
init commit must land on the plan branch (the worktree session resolves its active WU from `.arc/active/` on
*its* checkout, and the push step pushes the plan branch; precedent: `partial-push-marker`'s init commit rode
its WU branch to `main` via the final PR). Every prior graduate was `--here`, so the locus assumption never
surfaced. Recovered by hand 2026-07-03 (moves replicated in the worktree, committed `42f34628` on the plan
branch, primary reset clean); also caught en route: the meta reconcile's bullet re-render collapses a multi-line
`Depends On` to a ~250-char single line (no 120 re-wrap), and the user-open ran against the primary's disk.
Fix: spawn-mode transition targets the spawned worktree for relocation staging + user-open, and the bullet
re-render learns to wrap at 120. Verify via a wave-2 re-graduation. Files: `src/commands/start.ts`,
`src/lib/git/worktree-scaffold.ts`, `src/lib/work-unit/executor-context.ts`, `src/lib/active/meta-reader.ts`
(`renderBullets` wrap).

Interlock semantics for shell-invoked start (settled 2026-07-03): the explicit user invocation **is** the
approval — release-wrapper reasoning: the ceremony's content is deterministic (relocation, meta writes,
formulaic message), so no judgment remains for a gate to protect. Scoped narrowly: the release covers the
ceremony's own commit + push only; the command prints exactly what it committed and pushed (audit visibility);
in-session starts keep their normal workflow gates. Coordination: composes with the singleton fork below
(pin-primary-to-base — the primary as permanent orchestration surface); ceremony-commit determinism depends on
`roadmap-tooling`; the transition rework shares surface with `graduation-cleanup`'s flip-time history-hygiene
ceremony — coordinate or sequence at its pickup.

**5. Graduate-transition crash class — silent reconcile bail + non-atomic partial state (wave-zero fold,
2026-07-03; absorbed per § Resolution model).** FP's first `arc start` crashed mid-transition:
`reconcileMetaFields` (the populate-when-absent healer) anchors the field block on the H1 + closing `---` rule
and **silently no-ops when it can't anchor** — FP's meta predated the closing-rule convention, so the heal
bailed and the fail-loud `Current Workflow` stage write threw (`Cannot set meta field`). The transition left
partial state with no rollback: worktree + branch created, relocation staged, meta `Branch` cell already
written; recovery was manual (unwind, append `---`, re-run — the healer then correctly backfilled
`Current Workflow`, `PR URL`, `Completed`). Remedies settled (2026-07-03, adversarial pass 1), both facets
absorbed in FP: **(a)** pre-flight meta-shape validation that fails loud with an actionable error before any
mutation, plus an `arc verify` check for old-shape metas — no extension of silent healing (notice-not-silent);
**(b)** validate-first mutation ordering — all validation precedes any mutation, shrinking the partial-state
window to near zero; the residual (a crash mid-mutation after validation passed) gets a playbook recovery
entry, not rollback machinery. The silent-heal-then-loud-crash composition was the sharp edge; pre-flight
validation removes its trigger. Files: `src/lib/active/meta-reader.ts`
(`reconcileMetaFields` anchor, `replaceBulletField` throw), `src/commands/start.ts` (mutation ordering).

### Seam-audit decisions

Settled *as decisions to make* — the audit resolves each; neither is a pre-committed feature.

- **Parallel errands — worktree support, or a documented primary-worktree-only invariant.** Errands currently
  run as `chore/<slug>` branches occupied in the primary worktree, while worktree spawning is reserved for work
  units. That may be a principled boundary — errands are atomic and short-lived, and executing from the primary
  checkout avoids extra branch/worktree state colliding with active WUs — but the GA story names "multiple
  in-flight work units + errands," so the closeout must explicitly verify whether primary-worktree-only errands
  suffice. **Decide empirically, not speculatively:** burn-in wave 3 (below) runs a live errand session beside
  concurrent WU sessions; what it surfaces — occupancy collisions, close/reap interference, inbox-origin races,
  contention on the primary singleton — is the evidence this decision consumes. If the boundary holds, document
  the invariant and its reason; if practice needs concurrent errands, scope the minimal worktree support and its
  interaction with active-WU occupancy, errand close/reap, and inbox-origin cleanup.

  **Singleton examination (2026-07-01 grooming — the decision's design fork, pre-scouted):** contention is
  impossible *today* by construction — pre-flip, every locus (WU via `--here`, errand, grooming, housekeep)
  runs in the one primary checkout, serialized by the single working tree — so no pre-FP model change is
  needed; exposure begins only when the flip moves WU sessions into worktrees. Post-flip the contenders are
  exclusively **out-of-WU loci** (errand / housekeep / grooming / base-context ceremonies), and the fork is:

    - **Pin the primary to base** — the primary never checks out feature or `chore/` branches; errands and
      grooming spawn worktrees like WUs; the primary becomes the always-fresh orchestration + ceremony surface.
      Dissolves the singleton *and* subsumes a whole compensation family (the base-ref-backed reads, the sweep
      staleness class, the fetch-into-ref freshen exist because the primary may sit on a non-base branch). Cost:
      every errand pays the worktree-spawn + dep-provisioning tax (build item 1 mitigates; doc-only errands need
      no deps).
    - **Keep errands-in-primary + a documented serialization invariant** — one out-of-WU session at a time,
      operator-enforced. Cheap, solo-friendly; leaves the compensation family in place and true concurrent
      out-of-WU sessions unarbitrated (two agents sharing one checkout share HEAD + index — not safely
      arbitrable without real locking).

  Wave 3 supplies the evidence; settle the fork at the seam audit with it. **Fork-input note (2026-07-03
  settle pass):** BI-1's provisioning manifest and BI-4's CLI-complete start shrink pin-primary's stated cost —
  the worktree tax approaches one command, and doc-only errands need no deps — while its benefit side
  (dissolves the singleton, subsumes the base-ref compensation family) is untouched. The fork enters wave 3
  with a **recorded leaning toward pin-primary**; the wave confirms or refutes a leaning rather than opening a
  neutral question.

  **Batch-errand sub-decision (coupled — decide with the fork).** ARC has sequential errand execution but no
  explicit batch shape for a coherent set of small concerns. Recorded leaning (2026-07-03, ergonomics-driven):
  errands are *determinate and low-risk by design*, so the target DX is **one dedicated errand/housekeep
  session draining to completion under a single primary agent** — the operator scopes and approves up front,
  then stays hands-off except for surfaced judgment calls and warranted review gates; the primary dispatches,
  executes, and verifies, potentially isolating each errand on its own branch/worktree *mechanically* while
  attention stays single-locus. Errand parallelism, if real, lives **under one primary agent in one session,
  not across parallel harness sessions** — session-per-errand is the anti-goal. Exits at the seam audit:
  (i) codified sequential drain (exists today as the housekeep + `run-errand` loop; document as the pattern);
  (ii) orchestrated drain (the primary dispatches errand executions to subagents on isolated branches — needs
  the delegation-relaxation socket and non-interactive gate handling); (iii) first-class concurrent-errand
  lifecycle (only if evidence demands it). Within exit (ii), the isolation mechanics resolve by concurrency,
  not preference: **concurrent** dispatch requires per-errand worktrees — shared-checkout concurrency is
  already ruled unsafe by the singleton analysis (shared HEAD + index) — while **primary-managed overlap
  boundaries** is the sequential shape in one checkout. Leaning: sequential-first — the drain bottleneck is
  operator attention and primary verification, not execution wall-clock; escalate to worktree-dispatch only if
  wave evidence shows batches stalling on execution time (post-BI-1 the spawn tax is one command). Coupling:
  under pin-primary the drain session is the primary's natural tenant and per-errand worktrees are orchestration
  mechanics, not operator burden — the two leanings reinforce each other. Seams (recorded here; route captures
  at planning close): the execution-delegation
  relaxation is `execution-delegation-doctrine`'s doctrine — errands are its natural standing-relaxation case;
  gate intensity under a trust grant is `interlock-release-refinement`'s model; BI-4's invocation-is-approval
  reasoning extends to orchestrator-invoked ceremony steps and coordinates with `cli-substrate-adoption`'s
  uniform non-interactive contract.
  During the burn-in, also record interlock-friction evidence by work character: which errand / grooming stops
  carried real judgment, which were routine confirmations after an explicit trust grant, and which reviewed-lane
  surfaces still needed human eyes — plus **drain-shape evidence**: did the batch want sequential or dispatched
  execution; batch size and file-overlap frequency; the post-BI-1 spawn cost in practice; and where the
  operator actually needed to intervene. Feed that evidence to
  `interlock-release-refinement`'s interlock-intensity / trust-grant model; FP supplies observations, not the
  approval model.
- **Cross-WU personal-state same-entry merge resolution (GA-readiness item).**
  `mergeCrossWuFile → resolveCrossWuState` (`lib/user-sync/merge.ts`) resolves divergent edits to the **same**
  entry identity by wall-clock note recency: recency silently drops one edit and clock skew makes resolution
  machine-dependent. Exposure is parallelism-gated — only genuinely-concurrent worktrees editing the same
  `WORKING-MEMORY` / `USER-INBOX` entry hit it; the entry-union model handles concurrent edits to *different*
  entries cleanly. **Not a hard GA blocker** — narrow (same-entry-only lost update) on recoverable personal
  state (gitignored, backed up, within `CROSS_WU_NOTE_WINDOW`). Leaning: ship GA with a **documented limitation +
  guidance** (avoid concurrent same-entry edits across worktrees), deterministic fix as fast-follow; decide at
  the seam audit (absorb / spawn-dependency / accept) and escalate if real multi-WU practice shows a higher
  collision rate. Fix direction when built: causal ordering where ancestry-orderable, deterministic tie-break
  (lexicographically-smallest annotated-commit SHA) where genuinely concurrent — never wall-clock. Likely build
  home `operational-state-docs` (owns the `merge.ts` record / identity reshape). Files: `lib/user-sync/merge.ts`
  (`resolveCrossWuState`), `lib/user-sync/notes-ref.ts` (`readRecentUserNotes` / `CROSS_WU_NOTE_WINDOW`).
- **`/arc-shift` revival — routed here by the cohort doc (decide post-waves).** The deferred mid-session
  cross-worktree shift verb: its premise requires real worktrees-in-use, so `cohort-agile-parallelism.md`
  routed the revival call to FP, where the substrate becomes real. Decide with burn-in evidence — did an
  investigation-shaped detour actually surface during the waves? — and evaluate the cohort doc's alternative
  framing (PR-review checkout into a transient worktree with live review context) as the likelier earning
  case. Exits per the cohort record: revive the narrow verb (a `shift-work-unit.md` workflow + thin skill,
  uncommitted-work gate first), materialize a provisional stub, or dismiss. Coordination note: BI-4's
  spawn-anchored hop overlaps the investigation case's mechanics (a fresh session in the target worktree), so
  revival must argue value *beyond* a rich-booted fresh session — carrying live, expensive-to-reconstruct
  context is the differentiator.

## Verification design — bound the cost of the unknowns

Unknown gaps cannot be enumerated away; the design goal is that discovering one never costs the work in flight
at the time. Three layers, cheapest-first.

**Shape: one long-running WU with internal phases** (settled 2026-07-01; the split-the-bless alternative — a
separate burn-in/GA member — was declined: it would separate the checklist's author from its consumer and add a
handoff seam to the WU that exists to hunt handoff seams). Phase 1: seam audit / build the matrix. Phase 2: the
committed build items — item 1 gates **all worktree waves** (its harness-layer leg: wave-1 sessions without it
would run silently outside the ARC machinery, contaminating the evidence) and its node-deps leg specifically
gates wave 2 (code WU in a worktree); item 2 gates wave 4 (cross-machine); item 4's ceremony-locus fix verifies
via a wave-2 re-graduation.
Phase 3+: the burn-in waves, during which FP is deliberately active alongside the wave workload — the observer
WU is itself part of the concurrency under test (wave 1 is a three-in-flight state including FP). Later phases
are calendar-gated and observational; that is the intended rhythm, not drift.

**Launch constraint: never `--here`.** FP launches into a **spawned worktree** — the standing interim
"`--here` until FP ships" default explicitly does not apply to FP itself. In-place launch would occupy the
primary singleton for the WU's whole long-running life and exempt the observer from the very mechanics under
test. Discharged wave-zero (2026-07-03): FP's worktree was provisioned by hand — the full manifest (deps via
install → build → re-install, harness-layer copy, user dir), not bare `npm install`; the friction captures from
that provisioning fed BI-1's enrichment and minted BI-4 / BI-5.

**1. Systematic gap-hunt (convert unknowns to knowns).** The seam audit's method is enumeration, not recall:
build the **shared-mutable-surface matrix** — every file, ref, or store written by more than one concurrent
session class (base branch; ROADMAP; meta files; the `completed/` index; the user-notes ref; `USER-INBOX` /
`WORKING-MEMORY`; errand records; nudge markers; partial-push markers; the audit log; the worktree list; config)
crossed against the session classes that write it (WU session in a worktree, errand session, housekeep/grooming
on primary, cross-machine sibling, CI). For each cell: who writes, on what trigger, what happens on concurrent
write, and — the key classification — is the failure **loud** (blocked, conflicting, refused) or **silent**
(lost update, stale read, wrong-premise work). Silent cells are the GA blockers; loud cells need only a
documented recovery. ARC's shared-state surface is finite — this matrix is buildable and *is* the GA checklist's
skeleton.

**2. Adversarial pass over the checklist itself.** `adversarial-review` lands before this WU (milestone path
below) — run its fresh-subagent mechanism against the seam audit and draft GA checklist with the prompt "what
concurrent-session failure does this matrix miss?" Fresh eyes attack the enumeration's blind spots, which is
exactly the unknown-unknowns worry stated operationally.

**3. Staged burn-in with sacrificial workload (bound what's left).** Do not flip worktree-by-default and launch
real heavy work into it. Phase the live verification as waves, each using **deliberately low-stakes work**
(P3 smalls, doc sweeps, backlog grooming) so a discovered gap costs a cheap redo, never a compromised Heavy WU:

- **Wave 1 — two doc-only WUs in parallel worktrees.** No node toolchain dependence; exercises spawn, notes
  sync, ROADMAP contention, integration ordering.
- **Wave 2 — one code WU + one doc WU.** First real exercise of worktree dependency provisioning + per-task
  quality gates off-primary.
- **Wave 3 — code WU + code WU + a live errand session.** Adds the primary-singleton contention and the
  parallel-errand decision's evidence; first-in-wins reconcile discipline under real overlap.
- **Wave 4 — cross-machine resume mid-flight.** Materialize (spawn and in-place) against work another machine
  started; notes-lag and partial-push surfaces under real latency.

**Workload selection basis (codified 2026-07-03).** A wave workload qualifies when it is: **sacrificial** —
Light-class, small, cheap to redo (sacrificial means cheap to redo, never valueless — real backlog items whose
delivery is wanted anyway); **wave-shape-matched** — wave 1 doc-only (no node toolchain), wave 2 exactly one
code WU (first BI-1 exercise), wave 3 code + code + live errand; **surface-disjoint from FP's own build items**
— nothing touching user-sync, scaffold, or start-transition code, else a workload failure contaminates the
observer; **mutually disjoint on code surfaces** — contention belongs on the shared ARC surfaces under test
(ROADMAP, notes ref, base branch), not on co-edited modules; **outside the milestone path** —
`roadmap-tooling` (pre-wave-1 dependency) and `interlock-release-refinement` (consumes wave evidence) are
excluded by role; **completable within its wave's observation window**; and **spec-ready in time** — few picks
are spec-ready today, so a pick must clear its own Light-scaled planning pipeline (draft → spec → tasks) before
its wave launches; groom picks in the primary during FP Phases 1–2 (the mid-FP companion lane) so no wave gates
on planning. Risk decays across waves as surfaces verify: waves 1–2 carry strictly sacrificial picks; later
waves may carry higher-value (still Light, still disjoint) work as the verified surface grows — and the
Heavy/Novel backlog advances meanwhile via grooming sessions in the primary (planning is cheap and off the
burn-in surface), queuing as the GA bless's first consumers.

**Provisional slate (2026-07-03; confirm Class resolution and spec readiness at pickup).** Wave 1:
`inbound-routing-method` + `adr-accept-timing` (Light, doc/method-shaped, disjoint). Wave 2 code:
`cli-test-hardening` (Light; exercises the full node gate suite; touches tests, not source); doc partner from
the `[TBD]` pool (`synthesis-modality` / `cohort-cut-coherence` — resolve Class at pickup). Wave 3:
`ci-cross-platform-hardening` + one further Light code pick + the live errand drain, which doubles as the
drain-shape evidence collector. `skill-infrastructure-cleanup` is excluded — it overlaps BI-1's harness-layer
surface now, or will as it iterates. The Heavy/Novel queue (`pr-decomposition`, `commit-increments`,
`execution-delegation-doctrine`, `goal-aware-direction`, …) is deliberately not workload: it grooms in the
primary during the waves and queues as the GA bless's first consumers.

Each wave also **verifies the detectors, not just the paths**: deliberately induce the conditions the
session-init probe claims to catch (base drift, notes lag, behind-base at integration, stale worktree) and
confirm the surface actually fires. A detector that silently no-ops is itself a GA blocker.

**Containment invariants (GA-checklist section).** Invert prevention into blast-radius guarantees — each
verified, not assumed: committed + pushed work is never losable; uncommitted work is never destroyed by any ARC
verb (`worktree remove` refuses dirty; no destructive auto-actions); personal notes have a pre-load backup;
same-entry cross-WU merge loss is documented with its recovery; every loud failure has a written recovery path.
Deliverable: a short **parallelism incident playbook** (symptom → diagnosis → recovery) distilled from the
matrix, so the first real incident is a lookup, not an investigation.

### The authored matrix skeleton — 2026-07-01 gap-hunt pass

Layer 1 executed early, at grooming (a second pass on the grooming branch), so pre-FP-shaped findings could
still reroute the milestone path — none did; all findings are FP-internal. Grounded in a two-sweep source audit
(CLI-side writers across `packages/arc-framework/src`; workflow-instructed hand-edits across
`system/workflows` / `methods` / skills) plus targeted path-resolution verification. Cell *verification*
(induce the condition, observe the failure) is wave work; this skeleton and its classifications are the GA
checklist's starting state. Disposition key: **BI-n** = committed build item above; **wave n** = verified in
that burn-in wave; **playbook** = documented limitation / recovery entry.

**A. Repo-shared surfaces — no branch isolation (common git dir or remote):**

- **Base branch** — written by every merge (WU integration, errand, grooming PR; sibling machines). The remote
  serializes the ref; nothing guards semantic drift — a behind-base branch merges stale-premise work cleanly.
  **Silent** → pre-FP errand (behind-base reconcile gate); waves re-verify the gate fires.
- **`refs/notes/arc/user/{id}`** (user-notes ref) — notes sync at every handoff / save, all session classes,
  all machines. Guards: advisory lock + non-fast-forward `cat_sort_uniq` recovery — but the lock file is
  per-checkout: same-machine cross-worktree writers race `git notes add` and drop a note. **Silent** → **BI-3**.
- **Same-entry cross-WU resolution** (`resolveCrossWuState`) — divergent edits to one entry resolve by
  wall-clock recency; one edit silently loses. **Silent**, narrow, recoverable → documented limitation
  (§ Seam-audit decisions carries the fix direction).
- **`refs/arc/user/{id}/sync-state`** (marker ref) — tree-CAS retry; concurrent publishers converge. **Loud** →
  wave 1 verifies detectors read it *cross-worktree* (the local `.sync-state.json` cache alone would miss a
  sibling worktree's partial-push marker). Classification premise shifted with BI-3's workspace-as-machine
  settle (adversarial pass 2): same-workspace worktrees now share one marker key, and the publish sits outside
  the notes lock's span — wave 1's verification explicitly includes the shared-key same-workspace case
  (misordered sibling publishes; low materiality — TTL-bounded, presentation-only, a later push subsumes).
- **`refs/arc/user/{id}/errands`** — tree-CAS + same-slug collision surfacing (never auto-resolved). **Loud** →
  wave 3.
- **Worktree registry** (`git worktree` metadata) — git's own locking; a second op is refused. **Loud** →
  playbook.
- **Branch pushes** — single-owner per branch; non-fast-forward refused at the remote. **Loud** → playbook.
- **`.git/config`** — lives in the common git dir, shared by all worktrees; `arc join` / `init` write it,
  settings probes read it. Git's own config locking makes overlap **loud** → playbook (adversarial-pass row).
- **Branch-creation ref races** — two sessions minting the same `plan/` / `chore/` / errand-slug branch; git's
  ref locking refuses the second. **Loud** → playbook (adversarial-pass row).

**B. Tracked files, branch-mediated — contention surfaces at merge:**

- **`ROADMAP.md`** — hand-regenerated at every lifecycle fire-point, any lifecycle session. Concurrent regens
  from different base states: usually a merge conflict (**loud**), but a clean merge of a stale render is
  possible (**silent residue**) → `roadmap-tooling` (pre-FP, deterministic regen); wave 1 exercises it live.
- **Foreign stub metas** (drain routes an Inbound-Buffer entry) vs. that WU concurrently graduating or grooming
  — modify-vs-move across branches; git rename detection usually follows the move, but a whole-directory
  relocation can orphan the routed entry at the old path. **Silent** → wave-verify; a drain-time
  `arc status <slug>` check (the pre-routed `cross-wu-coordination` errand's prescription) covers the window.
- **`completed/` archive index** — sequence numbers are scan-max-assigned per branch; two concurrent archivals
  mint the same `NN_` and both merge cleanly. **Silent** (cosmetic) → playbook (renumber); the sweep base-ref
  index errand reduces reliance on the directory scan.
- **`ATOMIC-INBOX` / cohort docs / `arc-config.yml`** — drain-only writes / decompose-time authorship / rare
  edits; overlap is a textual merge conflict. **Loud** → accept.

**C. Per-checkout gitignored state — the flip multiplies checkouts; the failure mode is absence or divergence,
not a write race:**

- **Harness integration layer** (`.claude/` / `.codex/` / `.gemini/`: skills, hooks, allowlists — gitignored)
  — absent in a fresh worktree: no ARC skill entry, no compaction-seed emission, no post-compaction recovery
  injection, no wrapper allowlist. A session launched there runs *without* the ARC machinery and mostly won't
  know it. **Silent** → **BI-1 (broadened)**.
- **`node_modules`** — the known flip-decisive gap. **Loud** (gates fail) with one sharp edge (bare `npx arc`
  resolving a foreign registry package) → **BI-1**.
- **User files** (`USER-INBOX` / `WORKING-MEMORY` / `SESSION-NOTES`) — per-checkout copies reconciled via the
  notes ref; entry-union handles different-entry edits; same-entry is row A-3; the three-remover `USER-INBOX`
  line reconciliation stays a named seam suspect → wave 3.
- **`.machine-id`** — exclusive-create mint per checkout: every spawned worktree becomes a distinct "machine"
  in the marker trees. Settled with **BI-3**: workspace-as-machine — minted at the git common dir, worktrees
  share one machine identity.
- **Spawn-mode transition writes** — the graduate transition stages the relocation and runs user-open against
  the *invoking* checkout instead of the spawned worktree (correct under `--here` only; unseen pre-FP because
  every prior graduate was `--here`). Wrong-locus writes, **silent** until the worktree session fails to resolve
  its WU → **BI-4** (ceremony-locus fix); wave-2 re-graduation verifies.
- **`compaction-seed.json` and sibling per-checkout markers** — overwritten in place; two sessions sharing one
  checkout clobber each other. The recovery audit's drift checks catch the steady state (**loud**), but a
  first-write race in a shared checkout has no baseline to drift from and stays **silent** until the next probe
  (adversarial-pass correction); post-flip, per-session worktrees isolate it naturally. Reinforces the
  one-session-per-checkout invariant (§ Seam-audit decisions, singleton fork).
- **Audit log** (`.audit-log.jsonl`) — append-only, per-checkout; the trail fragments across worktrees.
  Informational completeness gap only → note for `operational-state-docs`.

**Cross-cutting — probe-snapshot staleness (TOCTOU):** every session-init freshness surface reads once and
orients on the snapshot; a concurrent session can invalidate the premise a moment later. Bounded and
self-correcting at the next probe → playbook, not a blocker.

**Findings routed (all FP-internal — the pre-FP milestone path stands unchanged):** notes-lock scope +
`.machine-id` semantics → **BI-3** (minted this pass); harness-layer / user-scaffold absence → **BI-1
broadened**; the rest carry their dispositions above.

An early ad-hoc adversarial pass (layer 2's mechanism, run fresh-eyes against this skeleton in the same
grooming pass) failed to refute any routed finding — each confirmed against source
(`lib/user-sync/sync-state.ts` path anchoring; `lib/git/worktree-scaffold.ts` provisions only the meta +
user-open, no harness layer) — and contributed the `.git/config` and branch-creation rows plus the
compaction-seed first-write correction above. The full pass re-runs at FP proper once `adversarial-review`
ships its mechanism.

## Milestone path (interim sequencing record)

No goal-aware-direction mechanism exists yet, so the established pre-FP sequence is recorded here as the
current milestone target (this WU is the milestone). Cross-references only — each item's substance lives in its
own stub.

**Revised 2026-07-02** (`execution-delegation-doctrine` grooming session): the original path serialized
`interlock-release-refinement` and `roadmap-tooling` wholly ahead of this WU, conflating "before FP starts" with
"before the wave that needs it." FP is long-running and phased — Phase 1's matrix skeleton is already authored
and Phase 2's build items depend on neither — so the path pulls FP's start forward:

1. `adversarial-review` — first, unchanged: gates nothing, multiplies everything after it (FP's own spec/tasks
   and the layer-2 checklist pass consume it).
2. **Pre-FP errands drain** (`USER-INBOX § Errand`, pre-routed 2026-07-01; this WU's entry verifies they
   landed): the behind-base reconcile gate — now carrying its `integrate-work-unit` edit **alone** (the
   "after or with IRR" ordering note is superseded; IRR rebases onto it later); the sweep base-ref index (most
   valuable *pre*-flip); `cross-wu-coordination`'s cheap-first slice (document + prescribe `arc status <slug>`).
3. **This WU starts** — spawned worktree per the launch constraint, spec/tasks via the adversarial mechanism,
   then Phase 2's build items.
4. `roadmap-tooling` — re-slotted *beside* FP Phases 1–2: needed **before wave 1** (concurrent regens), not
   before FP's start. Full WU or its deterministic-renderer slice; decide at pickup.
5. `interlock-release-refinement` — **inverted out of the hard path.** Its parallelism-relevant slice (the
   integration-time interlock-stacking collapse) either slice-extracts per its own draft's ahead-of-cohort
   extraction note, or — preferred — consumes this WU's burn-in evidence of which stops actually hurt under
   concurrency and which were not decision-bearing after a trust grant, post-waves. Approval friction during waves
   is tolerable by design (sacrificial workloads, loud-only); it never corrupts.

**Mid-FP concurrency model (delicate — kept explicit by design).** FP active in its worktree does not serialize
the rest of development; companion work launches while FP runs, by locus:

- **The primary stays the out-of-WU surface** — errands, grooming, housekeep, and base-context ceremonies
  (`chore/` branches), serialized by the singleton reality until the wave-3 fork settles it.
- **Before build item 1 lands** (no automated worktree provisioning): a companion WU may run `--here` in the
  primary when errand contention allows; code WUs stay out of worktrees.
- **After build item 1 lands:** companion WUs launch into worktrees and double as burn-in wave workload under
  the wave discipline (wave 1's doc-only pair first; the provisional slate in § Verification design names the
  picks, confirmed at pickup).
- The standing `--here` interim default (WORKING-MEMORY) dissolves **progressively with the waves** — its
  removal trigger is build item 1 + wave verification, not "FP ships"; the WM entry is updated to match.

Additionally `sync-primitive-discipline` (its own planned stub) pulled adjacent to FP or
named as a seam-audit input.

## Resolution model for discovered seams

This WU **gates** completion, so it cannot route a fix back to an already-shipped owning WU. For each seam found:

- **Absorb-if-relatively-atomic** into this WU's own spec / task list as a general "resolve discovered seams"
  phase; **else**
- **Spawn a direct follow-up WU draft** as an explicit dependency.

(Hope it isn't needed; plan for it.)

## Dependencies

Explicit — it is the closeout. All named dependencies have shipped as of 2026-07-03; FP is the cohort's last
unshipped member:

- `concurrent-work-conventions` members (all shipped): `concurrent-work-doctrine`, `merge-safety-mechanism`,
  `async-merge-lifecycle`, `single-owner-wu-model`.
- `cross-machine-coherence` members (shipped): `partial-push-marker`, `stale-state-detect-and-pull` (decomposed
  from `cross-machine-sync-coherence` 2026-06-25; `coord-probe` relocated standalone as the external-coord
  enhancement and dropped from this gate).
- `state-ref-write-safety` (shipped) — the single-machine state-ref CAS (shed from the cross-machine WU at
  decomposition).
- `out-of-wu-entry` (shipped).
- The worktree-default flip — landed within `async-merge-lifecycle`'s scope; this WU exercises it.

Natural **agile-parallelism cohort closeout** — the cohort archives on its ship.

## Scope Estimate

Large (week+), and deliberately long-*running* (the burn-in waves are calendar-gated) — broad cross-cohort
surface carrying five committed build items alongside the audit / verify / flip / gate core. Size firms up once
the real seam count is visible.

## Continuity

- **Readiness:** formalization-ready — direction, scope, verification design, WU shape, and pre-FP sequencing
  are settled; the wave-zero fold's two flagged decisions settled 2026-07-03 (below); remaining open items are
  wave work and the workload picks, not design.
- **Resolved:** inbound buffer drained (2026-07-01) — build items absorbed (two retained; two split back out as
  pre-routed pre-FP errands), two seam-audit decisions recorded. Pre-FP audit + sequencing settled
  (§ Milestone path). Verification design settled: shared-mutable-surface matrix → adversarial checklist pass →
  staged sacrificial burn-in + containment invariants. Shape settled: one long-running phased WU, not a split
  bless. Singleton fork pre-scouted (pin-primary-to-base vs. serialization invariant) — no pre-FP exposure;
  wave 3 decides. Gap-hunt matrix pass run (2026-07-01, second grooming pass): two-sweep source audit + early
  adversarial pass → matrix skeleton authored (§ Verification design); all findings FP-internal — BI-3 minted
  (notes-lock scope + `.machine-id` semantics), BI-1 broadened (untracked per-checkout prerequisites including
  the harness layer); the pre-FP milestone path stands unchanged. Wave-zero captures folded (2026-07-03,
  post-graduation): BI-4 minted (worktree launch bridge — layered model, carrying the spawn-mode ceremony-locus
  fix), BI-5 minted (graduate-transition crash class, absorbed per § Resolution model), BI-1 enriched to an
  ordered provisioning manifest, matrix row added (spawn-mode transition writes); `USER-INBOX` captures cleared
  at absorption. Settle pass run same session (2026-07-03): pre-FP errands verified landed (behind-base gate
  PR #181; sweep base-ref index PR #180; the `arc status <slug>` prescription in DEV-RULES + strategy) —
  § Milestone path item 2's entry obligation discharged; shell-start interlock settled (invocation-is-approval,
  BI-4); harness-regen timing settled (downstream, BI-1); Codex research resolved (no live relocate —
  spawn-anchored via `--cd`; two surfaced capability tiers, BI-4c); `/arc-shift` revival added as a third
  seam-audit decision (routed from the cohort doc); workload selection basis codified (§ Verification design).
  Adversarial pass 1 run (2026-07-03, fresh subagent per the mechanism): 1 blocker + 1 major confirmed against
  source and settled — BI-3 direction fixed (common-dir lock re-anchor + workspace-as-machine `.machine-id`;
  ref-CAS evolution routed to `sync-primitive-discipline`), BI-5 remedies fixed (fail-loud pre-flight +
  validate-first ordering + playbook residual; spin-out hedge dropped); two minors folded (wave-gating wording,
  dependency shipped-annotations). Adversarial pass 2 run same session: verdict **ready** — all pass-1 fixes
  verified holding against source; two minors folded (matrix row A-4 re-annotated for the workspace-as-machine
  shared-key case — publish sits outside the notes-lock span, verified; BI-1 direction wording reconciled to
  the script-not-command enrichment). Converged at pass 2 of the `Heavy` cap.
- **Open:** matrix cell verification (induce the condition, observe the failure — wave work; the skeleton is
  authored); burn-in workload slate is recorded provisionally (basis codified; confirm each pick's Class
  resolution and spec readiness at pickup); orchestrated-drain shape (sequential-first leaning recorded —
  wave 3 evidence decides).
- **Next:** cross into create-spec (the adversarial loop converged 2026-07-03); slot `roadmap-tooling` (full or
  renderer slice) before wave 1; confirm the provisional slate picks at pickup.
