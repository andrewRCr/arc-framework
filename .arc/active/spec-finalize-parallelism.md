# Spec (`detailed` · `RFC`): finalize-parallelism

- **Origin:** [internal]

- **Purpose:** Own the end-to-end verification and GA gate for ARC's parallelism story — worktree-by-default,
  multiple in-flight work units + errands, and cross-machine resume. Prove the seams *between* independently
  shipped cohort members, land the committed build items that block the flip, and bless worktree-by-default for
  general use. Shipping every member is not the same as a verified-watertight system; this is that closeout.

---

## Introduction / Context

ARC's parallelism layer was delivered piecemeal. Worktree isolation, the Errand work class, multi-in-flight
awareness, and cross-machine coherence each landed on their own schedule across three surfaces — the
`concurrent-work-conventions` sub-cohort (`concurrent-work-doctrine`, `merge-safety-mechanism`,
`notes-merge-coherence`, `worktree-default-start`, `async-merge-lifecycle`, `single-owner-wu-model`), the
`cross-machine-coherence` members (`partial-push-marker`, `stale-state-detect-and-pull`,
`state-ref-write-safety`), and `out-of-wu-entry`. Within that sub-cohort the deliverables split cleanly:
`worktree-default-start` wired the create-new `arc start` worktree-spawning mode and flipped new-WU dispatch to
worktree-by-default (the flip itself), `async-merge-lifecycle` made the awaiting-review window a fully-supported
lifecycle pattern (the async-merge tail), and `notes-merge-coherence` shipped the `lib/user-sync/` notes-merge
engine (the projection builder whose cross-member consumer contract § Verification design flags as a seam) —
distinct members this closeout verifies together. All have shipped; `finalize-parallelism` is the
`agile-parallelism` cohort's last unshipped member, and the cohort archives on its ship. It additionally depends
on `lifecycle-closeout` (the `lifecycle-state-machine` cohort's global-consistency tail) — a cross-cohort dep
whose lifecycle-corpus consistency the doctrine reconciliation below leans on.

The forcing constraint: **seams between those members surface only in actual multi-WU practice**, and nothing
today owns either the end-to-end verification or a GA-readiness enumeration. Per-cohort closeout criteria were
each narrower than the cross-cohort whole. Concretely, no parallel *code* WU has ever run in a spawned worktree —
`node_modules` is gitignored, so every node-backed quality gate fails there (confirmed live 2026-06-15:
`markdownlint-cli2: Permission denied`), and the harness integration layer (`.claude/` / `.codex/` / `.gemini/`)
is likewise absent from a fresh worktree, so a session launched there runs silently outside the ARC machinery.
The worktree *spawn mechanism* works; multi-in-flight-**for-real** does not, and blessing it blind would convert
design-time unknowns into production incidents on real Heavy work.

This WU also discharges its own dogfood: FP is the first WU to launch into a spawned worktree (never `--here` —
see Non-Goals), so provisioning that worktree by hand at wave-zero (2026-07-03) surfaced the ergonomic and
correctness gaps the build items below fix.

## Goals

- **Trace every parallelism path end-to-end** — start/discovery → `init-work-unit` (worktree spawn) → planning →
  execution → integration/merge/completion → cross-machine resume — hunting the seams *between* independently
  shipped members, not re-verifying each member in isolation.
- **Convert unknown seams to known ones** via systematic enumeration (a shared-mutable-surface matrix), not
  recall — and classify each surface's concurrent-write failure as **loud** (blocked/refused/conflicting) or
  **silent** (lost update, stale read, wrong-premise work). Silent cells are the GA blockers.
- **Land the committed build items** that gate the flip — dependency/harness provisioning, in-place materialize,
  repo-shared sync-guard anchoring, the worktree launch bridge, the graduate-transition crash-class fix, and the
  identity-global user-surface binding.
- **Verify the worktree-default flip in real practice** — `worktree-default-start` *landed* the create-new
  `arc start` flip (and `async-merge-lifecycle` the awaiting-review / async-merge tail); this WU *exercises* the
  flip across genuinely concurrent WUs and errands, on deliberately sacrificial workload so a discovered gap
  costs a cheap redo, never a compromised Heavy WU.
- **Own the parallelism GA-readiness checklist** — the single enumeration of what-must-be-true for
  worktree-by-default + multi-in-flight to be blessed, plus a parallelism incident playbook so the first real
  incident is a lookup, not an investigation. Neither exists anywhere today.
- **Reconcile the concurrency doctrine with the verified shape** — the shipped doctrine
  (`strategy-concurrent-work.md`) was authored ahead of real multi-WU practice, and at least one section is
  contradicted by a recorded seam-audit leaning. Blessing worktree-by-default while its own doctrine describes a
  pre-verification model ships an incoherent surface; close that gap at GA so the doctrine matches as-built.

## Non-Goals

- **Not a redesign catch-all.** Scope is audit + verify + flip + gate, plus the committed build items and
  seam-audit decisions below. Newly discovered seams route through the § Resolution model (absorb-if-atomic, else
  spawn a follow-up WU) — they do not silently expand this WU.
- **Not unbounded parallelism.** The GA target is *bounded, deliberate* concurrency: single-owner WUs, one
  developer + one agent + one work unit under attention at a time, concurrency scaled to the attention available.
  Session-per-errand and dozens-of-concurrent-sessions are explicit anti-goals, consistent with PROJECT-PRD's
  *Focused attention over multi-tracked throughput* tradeoff.
- **Not the render automation.** Deterministic ROADMAP regeneration is `roadmap-tooling`'s deliverable, slotted
  before wave 1 (concurrent regens); FP consumes it, doesn't build it.
- **Not the interlock-intensity model.** FP *supplies* burn-in evidence of which stops hurt under concurrency;
  `interlock-release-refinement` owns the trust-grant/interlock-release model that consumes it.
- **Not the principled sync-primitive rewrite.** BI-3 stays a contained guard/export/marker correction on the
  existing notes path; the full ref-CAS-with-retry evolution routes to `sync-primitive-discipline`.

## Proposed Design

The design has three coupled parts: the **committed build items** (concrete gaps with settled direction FP
builds), the **verification design** (how FP proves the seams and bounds the cost of the unknowns), and the
**seam-audit decisions** (settled *as decisions to make* — resolved empirically with burn-in evidence). The
enumerable substrate the task list is built from is: five build items × their files, plus the three verification
layers, plus the matrix skeleton's cell-verification work.

### Shape and launch constraint

**One long-running WU with internal phases** (not a split burn-in/GA member): separating the checklist's author
from its consumer would add a handoff seam to the very WU that exists to hunt handoff seams. Phase 1 builds the
matrix; Phase 2 lands the build items; Phase 3+ are the calendar-gated, observational burn-in waves, during which
FP is deliberately active alongside the wave workload — the observer WU is itself part of the concurrency under
test.

**FP launches into a spawned worktree, never `--here`.** The standing interim "`--here` until FP ships" default
explicitly does not apply to FP itself: in-place launch would occupy the primary singleton for the WU's whole
long-running life and exempt the observer from the very mechanics under test.

### Committed build items

**BI-1 — Worktree dependency provisioning (always-invoked post-create manifest).** The flip-decisive gap:
`arc start` create-new and the worktree-spawn primitives create a worktree but don't provision what a working
session needs. The seam is an **ordered manifest**, not a single command, run by the scaffold on every worktree
create:

1. **Project deps script.** A configured `worktree.post_create` *script* (not bare `npm install`): deps here took
   install → build → re-install before `npx arc` resolved, because workspace bin links live at gitignored
   `dist/`, absent at install time. Until it runs, bare `npx arc` in a deps-less worktree can resolve an unrelated
   npm-registry package — so provisioning precedes any CLI invocation there. Unconfigured default: emit a
   notice (deps must be provisioned), never a silent no-op. Coordinate with the verify-and-configure workflow so
   the command is configured as an agent-led part of initial ARC setup.
2. **Registered harness dirs.** The gitignored harness integration layer (`.claude/`, `.codex/`, `.gemini/`,
   `.opencode/`, …: skills, hooks, permission allowlists) is absent in a fresh worktree — a session launched there
   has no ARC skill entry, emits no compaction seed, and gets no post-compaction recovery injection. Provision by
   **copy-from-primary as the universal default** where the harness resolves project config per worktree. The
   invariant is common even when harness behavior is not: effective config and scripts must resolve from one coherent
   install root. Claude Code currently fits the per-worktree copy model; Codex CLI resolves project hooks from the
   primary/shared git-dir config, so its registered-dir copy is a no-op for hook config and the installer must verify
   the primary-backed recipe instead of assuming the linked worktree's `.codex/` is authoritative.
3. **User-dir scaffold** at the correct locus (per BI-4's ceremony-locus fix).

Also folded here (2026-07-03 dogfood finding): the spawn/scaffold path writes a per-worktree
`worktree-marker.json` ownership marker into the **tracked** `.arc/system/.internal/` tree with no `.gitignore`
carve-out (unlike its sibling `pristine.json`), so the marker surfaces as a dirty, committable file. Provisioning
registers the marker's ignore rule (or writes it to an already-ignored path) so an arc-spawned worktree leaves a
clean tree.

The `arc update`-style **regeneration** path for harness dirs (reference impls + registration at
verify-and-configure / an add-agent workflow) is the clean long-term evolution but is **downstream**: BI-1 ships
the registered harness capability surface (copy when per-worktree, primary-backed verification when repo-global),
and the regen path routes to its owner post-FP (§ Resolution model handles escalation if the waves surface drift
pain). Files/seam: `worktree.post_create` config key, `src/lib/git/worktree-scaffold.ts`, the registered
harness-dir list.

**BI-2 — In-place Materialize for cross-machine pickup.** The begin-work transitions (`graduate` / `resume`)
carry a `--here` in-place opt-out; **Materialize** (cross-machine pickup of a remote-only in-flight WU) is the
cross-machine twin of the same spawn-vs-in-place question and is currently spawn-only
(`git worktree add origin/<branch>`). A single-checkout / heavy-toolchain dev picking up a remote WU on a second
machine hits the same worktree + dependency-provisioning tax the local hatch relieves. Direction: mirror the
opt-out — an in-place Materialize (`git fetch` + checkout the remote WU branch in the current checkout, honoring
the worktree-occupancy guard) alongside the default spawn. Locus-only, exactly like the local hatch: coherence
still rests on the pushed branch + notes-sync; reuse the hatch's no-spawn reconcile-branch legs where applicable.
Mechanism: materialize is agent-driven bash today (outside `executeTransition`), so the occupancy guard never
runs for it — BI-2 makes materialize a guarded `from: null` transition edge (the scaffold / create-new
precedent). Since a remote-only WU has no local from-state, the CLI command reads the remote ref as a pre-step
and supplies slug/branch via `TransitionInputs`; the executor stays local-index-only. The in-place variant's op
is `{mutation: "spawn", inPlace: true, createBranch: false}` (reusing the `--here` legs); `inPlace: true` is
never the guard's exempt case, so the occupancy guard enforces. The spawn variant (`inPlace: false`, a new
worktree) is correctly exempt.

**BI-3 — Repo-shared anchoring for per-machine sync guards.** The notes advisory lock
(`lib/user-sync/notes-lock.ts`) serializes writers to the repo-shared `refs/notes/arc/user/{identity}`, but the
lock file anchors at the *worktree* root (`resolveArcRoot` walks to the nearest `.arc`), so it only serializes
sessions inside one checkout. Post-flip, two same-machine sessions in different worktrees each acquire "the" lock
and race the unguarded `git notes add` read-modify-write — a silently dropped note, the exact loss the lock
exists to prevent (the non-fast-forward `cat_sort_uniq` recovery covers cross-*machine* divergence, not a
same-machine ref clobber). Direction part 1: **re-anchor the lock at the git common dir** — a contained path
change to the proven mechanism, serializing all same-machine worktrees.

The same repo-shared notes ref also means paired push must not publish sibling worktree notes whose branches have
not landed. Direction part 2: derive a branch-bounded planned notes-export target after the worktree leg lands,
then have both the sync-state marker and the notes push refer to that same export target, or refuse with actionable
recovery when the safe subset cannot be proven. A marker for the raw local notes ref paired with a filtered notes
push is invalid: fulfillment/self-invalidation would compare against a target the push did not actually attempt.

`.machine-id` settles as **workspace-as-machine provenance**: minted at the git common dir, so worktrees share one
machine identity — semantically correct (worktrees *are* one machine) and the end of marker-tree pollution from
per-checkout mints. It is **not** sufficient as the storage key for live notes-push intent. Direction part 3:
key sync-state marker storage by export intent (with machine id retained as payload/provenance), so every live
export intent remains independently represented until fulfilled or expired. The principled evolution (rewriting the
notes save as ref-CAS with retry) routes to `sync-primitive-discipline`. Gates wave 1 (the first concurrent notes
sync). Files: `lib/user-sync/notes-lock.ts` (anchor), `.machine-id` mint locus, `sync-state-marker.ts` /
`sync-state-publish.ts` / `partial-push-marker-surface.ts` (intent representation), and the paired notes-push path.

**BI-4 — Worktree launch bridge (one-session init as the worktree-by-default ergonomic target).** FP's own
graduation exposed the init ergonomics gap: the session that runs `init-work-unit` stays in the primary while the
WU lives in the new worktree, so starting one WU takes two agent sessions with no context bridge. Materialize
already works "CLI mechanics, then a session resumes there" — local start is its local twin. Layered model:

- **(a) Substrate, harness-agnostic:** make `arc start` CLI-complete — spawn, provision, relocate, reconcile,
  ceremony commit, push — invocable from a session *or* the bare shell; the first worktree session is then a
  plain Resume. The three judgment steps blocking this are all eliminable: `Next Action` has the deterministic
  `[begin current workflow]` sentinel, ROADMAP regen becomes deterministic once `roadmap-tooling` lands
  (pre-wave-1 anyway), and graduation commit messages are formulaic (`chore(arc): graduate <name> into active`).
- **(b) Bridge:** `init-work-unit` ends with a mini-handoff into the spawned WU's seeded SESSION-NOTES — the
  existing handoff idiom applied at spawn (the notes ref is checkout- and branch-independent) — so the worktree
  session boots rich instead of cold.
- **(c) Sugar, harness-conditional:** where the harness can relocate a live session into a worktree, offer the
  hop (surfaced per harness, never hidden). Claude Code supports **true relocate** (`EnterWorktree`). Codex CLI
  has **no live-session relocate** — its supported shape is **spawn-anchored**: launch a fresh session in the
  worktree (`codex --cd <path>`), which layer (b)'s mini-handoff makes first-class (spawn-anchored ≈ relocate
  minus live context). Caveat: Codex has known cwd-confusion bugs inside a linked worktree — re-verify at build
  time.

Carries the **spawn-mode ceremony-locus fix**: the graduate transition stages the backlog→active relocation and
opens the per-WU user workspace against the **invoking** checkout — correct under `--here`, wrong under spawn,
where the init commit must land on the plan branch (the worktree session resolves its active WU from
`.arc/active/` on *its* checkout, and the push step pushes the plan branch). Every prior graduate was `--here`,
so the locus assumption never surfaced. Fix: spawn-mode transition targets the spawned worktree for relocation
staging + user-open, and the meta bullet re-render learns to wrap `Depends On` at 120 (it currently collapses a
multi-line value to a ~250-char single line). Verify via a wave-2 re-graduation. Files: `src/commands/start.ts`,
`src/lib/git/worktree-scaffold.ts`, `src/lib/work-unit/executor-context.ts`, `src/lib/active/meta-reader.ts`
(`renderBullets` wrap).

*Interlock semantics for shell-invoked start:* the explicit user invocation **is** the approval
(release-wrapper reasoning — the ceremony's content is deterministic, so no judgment remains for a gate to
protect). Scoped narrowly: the release covers the ceremony's own commit + push only; the command prints exactly
what it committed and pushed (audit visibility); in-session starts keep their normal workflow gates. Composes
with the pin-primary singleton fork; the transition rework shares surface with `graduation-cleanup`'s flip-time
history-hygiene ceremony — coordinate or sequence at its pickup.

**BI-5 — Graduate-transition crash class (silent reconcile bail + non-atomic partial state).** FP's first
`arc start` crashed mid-transition: `reconcileMetaFields` (the populate-when-absent healer) anchors the field
block on the H1 + closing `---` rule and **silently no-ops when it can't anchor** — FP's meta predated the
closing-rule convention, so the heal bailed and the fail-loud `Current Workflow` stage write threw. The
transition left partial state with no rollback (worktree + branch created, relocation staged, meta `Branch` cell
written); recovery was manual. Remedies, both absorbed:

- **(a)** pre-flight meta-shape validation that fails loud with an actionable error before any mutation, plus an
  `arc verify` check for old-shape metas — no extension of silent healing (notice-not-silent).
- **(b)** validate-first mutation ordering — all validation precedes any mutation, shrinking the partial-state
  window to near zero; the residual (a crash mid-mutation after validation passed) gets a playbook recovery
  entry, not rollback machinery.

The silent-heal-then-loud-crash *composition* was the sharp edge; pre-flight validation removes its trigger.
Files: `src/lib/active/meta-reader.ts` (`reconcileMetaFields` anchor, `replaceBulletField` throw),
`src/commands/start.ts` (mutation ordering).

**BI-6 — Identity-global user-surface binding.** Worktree parallelism exposed a storage-boundary mismatch:
flat `user/{identity}/` surfaces are semantically identity-global but physically checkout-local. Live evidence
2026-07-04: the primary worktree and the FP worktree held divergent `USER-INBOX.md` copies, and a session-init
inbox probe on the primary counted only the primary's captures. That makes mid-WU capture invisible to housekeep
and creates a teardown loss mode: a linked worktree's gitignored inbox survives only if notes save/load happened
before the worktree is removed.

Direction: resolve user state by **semantic scope**, through a storage resolver rather than raw checkout paths.
Per-WU surfaces (`SESSION-NOTES.md`, contributor-role per-WU meta) stay worktree-adjacent. Identity-global
surfaces (`USER-INBOX.md`, `WORKING-MEMORY.md`, `STATUS.USER.md`, future `VECTOR.USER`, and identity-global nudge
markers) resolve from any worktree to one machine-local canonical materialization — likely the primary worktree's
`user/{identity}/` root as the zero-config interim. This is not a new storage axis and not a file-aggregation
workaround: it is the near-term instance of the storage abstraction that `strategy-storage-evolution.md` and
`draft-arc-backend.md` require. When Local/backend storage lands, the resolver's backing store changes; callers
do not.

Write model: near-term notes save/load splits sources by scope — current worktree for the active WU's
`SESSION-NOTES.md`, canonical identity-global root for cross-WU records — and performs a one-time migration that
reconciles existing divergent worktree copies. Do not build read-side sweeps over every worktree copy as the
primary solution: that bakes in checkout-local state and conflicts with `operational-state-docs`' record direction.
The durable record shape stays slug-keyed / entry-granular, mapping cleanly to the backend event-log model for
mutable inbox records; BI-6 only fixes the materialization binding needed before worktree GA.

### Verification design

Unknown gaps cannot be enumerated away; the design goal is that discovering one never costs the work in flight
at the time. Three layers, cheapest-first.

**Layer 1 — Systematic gap-hunt (convert unknowns to knowns).** Build the **shared-mutable-surface matrix**:
every file, ref, or store written by more than one concurrent session class (base branch; ROADMAP; meta files;
the `completed/` index; the user-notes ref; `USER-INBOX` / `WORKING-MEMORY`; errand records; nudge markers;
partial-push markers; the audit log; the worktree list; config) crossed against the session classes that write
it (WU session in a worktree, errand session, housekeep/grooming on primary, cross-machine sibling, CI). For
each cell: who writes, on what trigger, what happens on concurrent write, and the key classification — **loud**
vs **silent**. Silent cells are GA blockers; loud cells need only a documented recovery. The matrix skeleton is
already authored (below) from a two-sweep source audit; *cell verification* — induce the condition, observe the
failure — is wave work.

The matrix enumerates **shared-mutable surfaces** (write contention). A seam between members can also be an
**interface / consumer-contract** mismatch or a **teardown-ordering** asymmetry that induces no write race and so
never appears as a matrix cell — yet these are squarely the "seams between independently shipped members" Goal 1
targets. Layer 1 therefore carries a second, explicit trace-through beside the matrix, seeded with the named
suspects the audit must resolve (each traced to source, classified loud/silent, and dispositioned like a matrix
cell):

- **The projection-builder consumer contract** between `async-merge-lifecycle` and `cross-machine-sync-coherence`
  — `notes-merge-coherence`'s `lib/user-sync/projection.ts` (the tombstone-free manifest projection —
  `projectManifest`, consumed by `commands/user/{save-load,sync-status}.ts`; `stripTombstoneSections`, consumed
  by `merge.ts`) is consumed across the member boundary; a contract drift between producer and consumer is a
  silent wrong-premise seam, not a write race.
- **Errand-vs-WU teardown symmetry** — whether errand close/reap and WU integration/worktree-removal tear down
  their branch, worktree, notes, and inbox-origin state through symmetric, non-interfering paths under
  concurrency.

Both are trace-through targets from Phase 1, verified in the waves whose session mix exercises them (the
projection contract under wave 4's cross-machine resume; teardown symmetry under wave 3's errand-beside-WU mix).

**Layer 2 — Adversarial pass over the checklist itself.** Run `adversarial-review`'s fresh-subagent mechanism
against the seam audit and draft GA checklist with the prompt "what concurrent-session failure does this matrix
miss?" Fresh eyes attack the enumeration's blind spots — the unknown-unknowns worry stated operationally.

**Layer 3 — Staged burn-in with sacrificial workload.** Do not flip worktree-by-default and launch real heavy
work into it. Phase the live verification as waves, each using deliberately low-stakes work so a discovered gap
costs a cheap redo:

BI-1's legs gate the waves asymmetrically: its **harness-layer leg gates every worktree wave** (a wave-1 session
without it runs silently outside the ARC machinery — no skill entry, no compaction seed, no recovery injection —
contaminating the evidence), while its **node-deps leg additionally gates wave 2 onward** (the first code WU
off-primary). BI-3 gates wave 1 (first concurrent notes sync); BI-2 gates wave 4 (cross-machine materialize).

- **Wave 1 — two doc-only WUs in parallel worktrees.** No node toolchain dependence; exercises spawn, notes
  sync, ROADMAP contention, integration ordering. (Gated on BI-1's harness-layer leg + BI-3 + `roadmap-tooling`.)
- **Wave 2 — one code WU + one doc WU.** First real exercise of worktree dependency provisioning + per-task
  quality gates off-primary; a re-graduation verifies BI-4's ceremony-locus fix. (Adds BI-1's node-deps leg.)
- **Wave 3 — code WU + code WU + a live errand session.** Adds primary-singleton contention and the
  parallel-errand decision's evidence; first-in-wins reconcile discipline under real overlap.
- **Wave 4 — cross-machine resume mid-flight.** Materialize (spawn and in-place, per BI-2) against work another
  machine started; notes-lag and partial-push surfaces under real latency.

Each wave also **verifies the detectors, not just the paths**: deliberately induce the conditions the
session-init probe claims to catch (base drift, notes lag, behind-base at integration, stale worktree) and
confirm the surface actually fires. A detector that silently no-ops is itself a GA blocker.

*Workload selection basis.* A wave workload qualifies when it is **sacrificial** (Light-class, small, cheap to
redo — cheap ≠ valueless: real backlog items wanted anyway), **wave-shape-matched**, **surface-disjoint from FP's
own build items** (nothing touching user-sync, scaffold, or start-transition code, else a workload failure
contaminates the observer), **mutually disjoint on code surfaces** (contention belongs on the shared ARC surfaces
under test, not co-edited modules), **outside the milestone path**, **completable within its observation
window**, and **spec-ready in time** (a pick clears its own Light-scaled draft→spec→tasks pipeline, groomed in
the primary during Phases 1–2 so no wave gates on planning). Risk decays across waves as surfaces verify; the
Heavy/Novel backlog advances meanwhile via primary grooming sessions and queues as the GA bless's first
consumers.

*Provisional slate* (confirm Class + spec-readiness at pickup): Wave 1 `inbound-routing-method` +
`adr-accept-timing`; Wave 2 code `cli-test-hardening` + a doc partner from the `[TBD]` pool; Wave 3
`ci-cross-platform-hardening` + one further Light code pick + the live errand drain (which doubles as the
drain-shape evidence collector). `skill-infrastructure-cleanup` is excluded — it overlaps BI-1's harness-layer
surface.

**Containment invariants (GA-checklist section).** Invert prevention into blast-radius guarantees, each verified
not assumed: committed + pushed work is never losable; uncommitted work is never destroyed by any ARC verb
(`worktree remove` refuses dirty; no destructive auto-actions); personal notes have a pre-load backup; same-entry
cross-WU merge loss is documented with its recovery; every loud failure has a written recovery path. Deliverable:
a short **parallelism incident playbook** (symptom → diagnosis → recovery) distilled from the matrix, authored
into `strategy-concurrent-work.md` (adopter-facing, co-located with the doctrine reconciliation); the
GA-readiness checklist stays WU-internal as a one-time gate record.

### The authored matrix skeleton (Layer-1 pass, 2026-07-01)

Grounded in a two-sweep source audit (CLI-side writers across `packages/arc-framework/src`; workflow-instructed
hand-edits across `system/workflows` / `methods` / skills) plus targeted path-resolution verification. Cell
*verification* is wave work; this skeleton and its classifications are the GA checklist's starting state.
Disposition key: **BI-n** = committed build item; **wave n** = verified in that burn-in wave; **playbook** =
documented limitation / recovery entry.

**A. Repo-shared surfaces — no branch isolation (common git dir or remote):**

- **Base branch** — every merge writes it; the remote serializes the ref, nothing guards semantic drift (a
  behind-base branch merges stale-premise work cleanly). **Silent** → pre-FP errand (behind-base reconcile gate,
  landed PR #181); waves re-verify the gate fires.
- **`refs/notes/arc/user/{id}`** — notes sync at every handoff/save, all classes, all machines; the per-checkout
  lock lets same-machine cross-worktree writers race `git notes add` and drop a note, and paired push can publish a
  sibling worktree's note before that sibling branch lands unless the notes leg is branch-bounded. **Silent** →
  **BI-3**.
- **Same-entry cross-WU resolution** (`resolveCrossWuState`) — divergent edits to one entry resolve by
  wall-clock recency; one edit silently loses. **Silent**, narrow, recoverable → documented limitation
  (§ Seam-audit decisions carries fix direction).
- **`refs/arc/user/{id}/sync-state`** (marker ref) — tree-CAS retry; cross-machine publishers converge. With BI-3's
  workspace-as-machine, same-workspace worktrees share provenance but cannot collapse live marker storage to one
  latest-wins key: two unresolved sibling notes-push intents must remain independently represented until fulfilled
  or expired. **Silent if same-key overwrite hides a live intent** → **BI-3**; wave 1 verifies detector reads
  *cross-worktree* and the multi-intent shared-key case.
- **`refs/arc/user/{id}/errands`** — tree-CAS + same-slug collision surfacing (never auto-resolved). **Loud** →
  wave 3.
- **Worktree registry**, **branch pushes**, **`.git/config`**, **branch-creation ref races** — all guarded by
  git's own ref/config locking; a second op is refused. **Loud** → playbook.

**B. Tracked files, branch-mediated — contention surfaces at merge:**

- **`ROADMAP.md`** — hand-regenerated at every lifecycle fire-point; concurrent regens from different base states
  usually conflict (**loud**), but a clean merge of a stale render is possible (**silent residue**) →
  `roadmap-tooling` (deterministic regen); wave 1 exercises it live.
- **Foreign stub metas** (drain routes an Inbound-Buffer entry) vs. that WU concurrently graduating/grooming —
  modify-vs-move across branches; a whole-directory relocation can orphan the routed entry. **Silent** →
  wave-verify; a drain-time `arc status <slug>` check covers the window.
- **`completed/` archive index** — scan-max-assigned sequence numbers; two concurrent archivals mint the same
  `NN_` and both merge cleanly. **Silent** (cosmetic) → playbook (renumber); the sweep base-ref index errand
  reduces reliance on the directory scan.
- **`ATOMIC-INBOX` / cohort docs / `arc-config.yml`** — drain/decompose/rare edits; overlap is a textual
  conflict. **Loud** → accept.

**C. Per-checkout gitignored state — the flip multiplies checkouts; the failure mode is absence or divergence,
not a write race:**

- **Harness integration layer** — absent in a fresh worktree: no ARC skill entry, no compaction-seed emission,
  no recovery injection, no wrapper allowlist. **Silent** → **BI-1 (broadened)**.
- **`node_modules`** — the known flip-decisive gap; gates fail, with the bare-`npx arc` foreign-registry edge.
  **Loud** → **BI-1**.
- **`worktree-marker.json`** — the spawn ownership marker lands in the tracked `.internal/` tree with no ignore
  carve-out; surfaces as a dirty/committable file. **Loud** (visible) → **BI-1** (register its ignore rule).
- **User files** — per-WU `SESSION-NOTES` is correctly checkout-adjacent, but identity-global files
  (`USER-INBOX`, `WORKING-MEMORY`, `STATUS.USER`, future `VECTOR.USER`, global nudge markers) are semantically
  cross-WU while physically checkout-local. Different worktrees can therefore hold divergent captures and a
  primary housekeep/session-init probe sees only one copy. **Silent** → **BI-6**. After canonical binding, the
  remaining user-file seams are row A-3 same-entry edits and the wave-3 `USER-INBOX` removal race.
- **`.machine-id`** — exclusive-create mint per checkout: every spawned worktree becomes a distinct "machine."
  → **BI-3** (workspace-as-machine).
- **Spawn-mode transition writes** — the graduate transition stages relocation + user-open against the invoking
  checkout instead of the spawned worktree. **Silent** until the worktree session fails to resolve its WU →
  **BI-4**; wave-2 re-graduation verifies.
- **`compaction-seed.json` and sibling per-checkout markers** — overwritten in place; two sessions sharing one
  checkout clobber each other. Steady-state drift is **loud**, but a first-write race in a shared checkout has no
  baseline to drift from and stays **silent** until the next probe; post-flip, per-session worktrees isolate it.
  Reinforces the one-session-per-checkout invariant.
- **Audit log** (`.audit-log.jsonl`) — append-only, per-checkout; the trail fragments across worktrees.
  Informational completeness gap only → note for `operational-state-docs`.

**Cross-cutting — probe-snapshot staleness (TOCTOU):** every session-init freshness surface reads once and
orients on the snapshot; a concurrent session can invalidate it a moment later. Bounded and self-correcting at
the next probe → playbook.

### Seam-audit decisions

Settled *as decisions to make* — the audit resolves each with burn-in evidence; neither is a pre-committed
feature. Resolution options and recorded leanings are captured so the decision enters its wave sharpened, not
neutral.

- **Parallel errands — worktree support, or a documented primary-worktree-only invariant.** Errands run as
  `chore/<slug>` branches in the primary worktree; worktree spawning is reserved for WUs. The GA story names
  "multiple in-flight WUs + errands," so the closeout must verify whether primary-only errands suffice. Decide
  empirically at wave 3 (a live errand session beside concurrent WU sessions); the design fork is:
    - **Pin the primary to base** — the primary never checks out feature/`chore/` branches; errands and grooming
      spawn worktrees; the primary becomes the always-fresh orchestration + ceremony surface. Dissolves the
      singleton *and* subsumes the base-ref-backed reads / sweep-staleness / fetch-into-ref compensation family.
      Cost: every errand pays the worktree-spawn + dep tax (BI-1 mitigates; doc-only errands need no deps).
    - **Keep errands-in-primary + a documented serialization invariant** — one out-of-WU session at a time,
      operator-enforced. Cheap, solo-friendly; leaves the compensation family in place and true concurrent
      out-of-WU sessions unarbitrated (two agents sharing one checkout share HEAD + index).

  **Recorded leaning: pin-primary.** BI-1's manifest and BI-4's CLI-complete start shrink its stated cost (the
  worktree tax approaches one command, doc-only errands need no deps) while its benefit side is untouched; wave 3
  confirms or refutes the leaning rather than opening a neutral question.

  **Batch-errand sub-decision (coupled — decide with the fork).** ARC has sequential errand execution but no
  explicit batch shape. Recorded leaning: errands are determinate and low-risk, so the target DX is **one
  dedicated errand/housekeep session draining to completion under a single primary agent** — the operator scopes
  and approves up front, then stays hands-off except for surfaced judgment and warranted review gates. Errand
  parallelism, if real, lives **under one primary agent in one session, not across parallel harness sessions** —
  session-per-errand is the anti-goal. Exits: (i) codified sequential drain (exists today; document the pattern);
  (ii) orchestrated drain (the primary dispatches errand executions to subagents on isolated branches — needs the
  delegation-relaxation socket and non-interactive gate handling); (iii) first-class concurrent-errand lifecycle
  (only if evidence demands). Leaning: sequential-first — the drain bottleneck is operator attention and primary
  verification, not execution wall-clock; escalate to worktree-dispatch only if waves show batches stalling on
  execution time. Seams (route captures at planning close): the execution-delegation relaxation is
  `execution-delegation-doctrine`'s; gate intensity under a trust grant is `interlock-release-refinement`'s;
  BI-4's invocation-is-approval reasoning coordinates with `cli-substrate-adoption`'s uniform non-interactive
  contract. During burn-in, record interlock-friction evidence by work character (which stops carried real
  judgment, which were routine confirmations after a trust grant, which reviewed-lane surfaces still needed human
  eyes) plus drain-shape evidence (sequential vs dispatched; batch size + file-overlap frequency; post-BI-1 spawn
  cost; where the operator actually intervened). FP supplies observations, not the approval model.

- **Cross-WU personal-state same-entry merge resolution (GA-readiness item).**
  `mergeCrossWuFile → resolveCrossWuState` (`lib/user-sync/merge.ts`) resolves divergent edits to the **same**
  entry by wall-clock note recency: recency silently drops one edit and clock skew makes resolution
  machine-dependent. Exposure is parallelism-gated (only genuinely-concurrent worktrees editing the same
  `WORKING-MEMORY` / `USER-INBOX` entry); the entry-union model handles different-entry edits cleanly. **Not a
  hard GA blocker** — narrow (same-entry-only lost update) on recoverable state (gitignored, backed up, within
  `CROSS_WU_NOTE_WINDOW`). Leaning: ship GA with a **documented limitation + guidance** (avoid concurrent
  same-entry edits across worktrees), deterministic fix as fast-follow; decide at the seam audit
  (absorb / spawn-dependency / accept). Fix direction when built: causal ordering where ancestry-orderable,
  deterministic tie-break (lexicographically-smallest annotated-commit SHA) where genuinely concurrent — never
  wall-clock. Likely build home `operational-state-docs`. Files: `lib/user-sync/merge.ts` (`resolveCrossWuState`),
  `lib/user-sync/notes-ref.ts` (`readRecentUserNotes` / `CROSS_WU_NOTE_WINDOW`).

- **`/arc-shift` revival (routed here by the cohort doc — decide post-waves).** The deferred mid-session
  cross-worktree shift verb: its premise requires real worktrees-in-use, so `cohort-agile-parallelism.md` routed
  the revival call to FP. Decide with burn-in evidence — did an investigation-shaped detour actually surface? —
  and evaluate the cohort doc's alternative framing (PR-review checkout into a transient worktree with live
  review context) as the likelier earning case. Exits: revive the narrow verb (a `shift-work-unit.md` workflow +
  thin skill, uncommitted-work gate first), materialize a provisional stub, or dismiss. Coordination: BI-4's
  spawn-anchored hop overlaps the investigation case's mechanics, so revival must argue value *beyond* a
  rich-booted fresh session — carrying live, expensive-to-reconstruct context is the differentiator.

### Doctrine reconciliation (closeout deliverable)

The concurrency doctrine (`strategy-concurrent-work.md`, shipped by `concurrent-work-doctrine`) was authored ahead
of real multi-WU practice. A late-phase reconciliation pass — gated on the seam-audit decisions settling on wave
evidence — brings it into agreement with the verified, as-built shape. This is a **gate/bless deliverable, not a
build item** (no code gap): an accurate doctrine is part of the GA bless, and FP is the verifier that learns the
as-built shape, so it authors the reconciliation rather than routing it out (the same author-and-consumer unity
behind the split-the-bless decline). Target surface:

- **`strategy-concurrent-work.md` § "Your main worktree is not always on main"** — the sharpest coupling. Its
  premise (the primary normally sits on a non-`main` branch; admin / coordination / planning run from it) is
  **inverted by the pin-primary-to-base outcome** if wave 3 confirms that recorded leaning (primary always on
  base; errands / grooming spawn worktrees). A rewrite, not a tweak, if pin-primary wins; a confirm-as-written if
  the serialization-invariant arm wins instead.
- **§ Worktrees by default** — the "cheap to create / just works" framing holds only once BI-1 makes
  dependency + harness provisioning automatic; add the line acknowledging worktree creation includes provisioning.
- **§ Shared files under concurrency** — the "mutated shared state … backend territory, out of scope" line is
  sharpened by the same-entry cross-WU merge decision (documented limitation + deterministic fast-follow).
- **The Errand-class slice of `strategy-work-organization.md`** — absorbs the parallel-errand invariant the fork
  settles, plus any orchestrated-drain-shape convention wave 3 produces.
- **§ Merge ordering / § Async-merge / § Worktree operations** — `async-merge-lifecycle`'s shipped territory;
  reconciliation is confirm-as-built here unless a wave surfaces a seam.

The precise touched section-set firms up as the seam-audit decisions settle; the pass runs late, after the waves,
and is cheap relative to the build items.

### Resolution model for discovered seams

This WU **gates** completion, so it cannot route a fix back to an already-shipped owning WU. For each seam found:

- **Absorb-if-relatively-atomic** into this WU's own spec / task list as a general "resolve discovered seams"
  phase; **else**
- **Spawn a direct follow-up WU draft** as an explicit dependency.

## Alternatives & Rationale

- **Split the bless (separate burn-in/GA member) vs. one long-running phased WU.** Declined the split: it would
  separate the checklist's author from its consumer and add a handoff seam to the WU whose reason for existing is
  hunting handoff seams. The build items are the observer's own instrumentation; keeping them in one continuous
  context is the point. Chosen: one WU with internal phases, FP active alongside the wave workload.

- **Pin-primary-to-base vs. errands-in-primary + serialization invariant** (the parallel-errand fork). Not
  pre-decided — resolved empirically at wave 3 — but pin-primary carries the recorded leaning because it
  dissolves the singleton *and* subsumes a whole compensation family, at a cost BI-1/BI-4 have already shrunk.
  Deciding speculatively now would fabricate confidence the evidence hasn't earned; deciding with a recorded
  leaning avoids re-opening a neutral question under wave-time pressure.

- **`worktree.post_create` as a script vs. bare `npm install`.** The dogfood proved bare `npm install`
  insufficient (install → build → re-install before `npx arc` resolved, because bin links live at gitignored
  `dist/`). A project-supplied *script* is the honest seam; ARC owns the invocation point + default, the project
  owns the command.

- **Copy-from-primary vs. regenerate for harness dirs.** Copy-from-primary is the universal default: zero
  per-harness knowledge, covers harnesses ARC has never heard of. Regeneration (reference impls + registration)
  is cleaner but requires per-harness maintenance and belongs downstream at the verify-and-configure / add-agent
  owner — shipping it inside BI-1 would over-scope the flip-critical seam.

- **Re-anchor the lock (BI-3) vs. rewrite the notes save as ref-CAS.** Re-anchoring is a contained path change to
  a proven mechanism, sufficient to close the same-machine clobber; the principled ref-CAS-with-retry rewrite is
  a larger, separable concern routed to `sync-primitive-discipline`. Ship the contained fix, route the evolution.

- **Pre-flight validation (BI-5) vs. rollback machinery.** The crash class came from a silent-heal-then-loud-crash
  *composition*; validate-first ordering removes the trigger and shrinks the partial-state window to near zero.
  Full transactional rollback would be heavier than the residual risk warrants — the residual (crash mid-mutation
  after validation) is a playbook entry, not machinery.

- **Materialize spawn-only vs. mirrored in-place opt-out (BI-2).** Spawn-only forces the worktree + dep tax on a
  single-checkout/heavy-toolchain second machine; mirroring the `--here` hatch is locus-only and reuses the
  hatch's reconcile legs, so the cost is low and the symmetry with local start is clean.

## Cross-cutting Considerations

- **Testing / verification** is the WU's spine, not a side concern: the three-layer design (matrix → adversarial
  pass → staged sacrificial burn-in) *is* the test strategy, and each wave verifies detectors as well as paths.
  FP's own build items get ordinary per-task quality gates; the burn-in waves are the integration test for the
  seams between members.

- **Migration / rollout** is the staged worktree-default flip. The standing `--here` interim default dissolves
  **progressively with the waves** — its removal trigger is BI-1 + wave verification, not "FP ships"; the
  WORKING-MEMORY entry updates to match. Rollout is deliberately calendar-gated and observational; that rhythm is
  the design, not drift. The doctrine reconciliation rides the same rollout tail: `strategy-concurrent-work.md`
  updates as the flip is blessed, so the shipped doctrine and the shipped behavior land coherent rather than
  drifting apart across the flip.

- **Blast-radius / safety.** The containment invariants above are the security-analog for this WU: the guarantee
  is that no ARC verb destroys committed or uncommitted work, and every loud failure has a written recovery.
  Sacrificial-only workload in early waves bounds the cost of a discovered gap to a cheap redo.

- **User-facing impact (DX).** BI-4's launch bridge is the ergonomic target: worktree-by-default should cost one
  session, not two, and boot rich rather than cold. The harness-conditional relocate/spawn-anchored split means
  the DX degrades gracefully on harnesses without live relocate rather than blocking them.

- **Concurrency model during FP's own run.** FP active in its worktree does not serialize the rest of
  development: the primary stays the out-of-WU surface (errands, grooming, housekeep, base-context ceremonies);
  before BI-1 a companion WU may run `--here` when errand contention allows (code WUs stay out of worktrees);
  after BI-1 companion WUs launch into worktrees and double as burn-in workload under the wave discipline.

## Success Criteria

- **The shared-mutable-surface matrix is complete and every cell is classified** loud vs silent, with every
  silent cell either closed by a build item, verified in a wave, or carried as a documented limitation with a
  recovery path. No unclassified surface remains — **and the interface/consumer-contract + teardown-symmetry
  trace-through is resolved too** (the projection-builder cross-member contract and errand-vs-WU teardown each
  traced, classified, and dispositioned), so a non-write-race seam between members can't hide.
- **All six build items land and are verified:** BI-1 provisions a spawned worktree to a working state (node
  gates pass off-primary; harness layer present; marker tree clean) and emits a notice when unconfigured; BI-2's
  in-place Materialize checks out a remote WU without spawning, honoring the occupancy guard; BI-3 serializes
  same-machine notes writers, prevents paired-push sibling-note early export, and keeps marker surfacing from hiding
  live sibling partial-push intents; BI-4 makes a shell-invoked `arc start` CLI-complete with the mini-handoff, and a
  wave-2 re-graduation lands its ceremony on the plan branch with a 120-wrapped `Depends On`; BI-5's pre-flight
  validation fails loud on an old-shape meta before any mutation; BI-6 makes identity-global user surfaces resolve
  to one canonical machine-local materialization from every worktree, with per-WU `SESSION-NOTES` still scoped to
  the active worktree.
- **All four burn-in waves complete** on sacrificial workload with their induced detector-tests firing (base
  drift, notes lag, behind-base-at-integration, stale worktree each surface as claimed) — no detector silently
  no-ops.
- **The three seam-audit decisions are resolved with evidence** (parallel-errand fork + batch sub-decision;
  same-entry merge disposition; `/arc-shift` revival), each recorded with its rationale and any spawned
  follow-up WU.
- **The GA-readiness checklist and the parallelism incident playbook exist and are blessed** — worktree-by-default
  is declared GA, and the interim `--here` default is retired progressively per its wave-tied trigger.
- **The concurrency doctrine matches the as-built shape** — `strategy-concurrent-work.md` (and the Errand-class
  slice of `strategy-work-organization.md`) is reconciled with the settled seam-audit decisions and wave findings:
  no doctrine section contradicts the verified behavior (in particular, § "main worktree not always on main"
  agrees with the resolved primary-worktree posture).
- **The containment invariants are each verified, not assumed** — committed+pushed work unlosable; no ARC verb
  destroys uncommitted work; notes pre-load backup present; same-entry merge loss documented with recovery.

## Open Questions

All open items are resolved **during** the work with burn-in evidence — none is deferred design debt. They are
open because they are empirical (they need the live substrate to answer), not because the design is unsettled:

- **Matrix cell verification** — the skeleton and classifications are authored; inducing each condition and
  observing the actual failure is wave work.
- **Burn-in workload slate** — recorded provisionally; each pick's Class resolution and spec readiness confirm at
  pickup (few are spec-ready today; picks clear their own Light-scaled pipeline in the primary before their wave).
- **Orchestrated-drain shape** (sequential vs dispatched errand execution) — sequential-first leaning recorded;
  wave-3 drain-shape evidence decides whether to escalate to worktree-dispatch.
- **The three seam-audit decisions** — enumerated above with options and recorded leanings; each settles at its
  wave, not before, because deciding speculatively would fabricate confidence the evidence hasn't earned.
- **The doctrine reconciliation's exact edit-set** — which sections of `strategy-concurrent-work.md` need rewrite
  vs. confirm-as-written depends on the seam-audit outcomes (most sharply, whether pin-primary inverts § "main
  worktree not always on main"). The deliverable is committed; its content is evidence-gated, so it runs late.
