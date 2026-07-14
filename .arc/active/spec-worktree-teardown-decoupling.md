# Spec (`outline`): worktree-teardown-decoupling

- **Origin:** [internal] — FP wave-2 slate; design seed recorded in `notes-finalize-parallelism.md`
  § Dogfood finding (2026-07-13).

- **Purpose:** Decouple ARC's ceremony-side teardown (ref reaps) from physical worktree removal, so a work
  unit shipped from inside its own worktree ends in a clean *"shipped — pending physical teardown"* terminal
  state on a disposable detached husk instead of deleting the session's cwd out from under the harness.
  Manual directory deletion becomes a blessed, idempotent path; ARC's own removal is convenience automation
  with the stale-worktree sweep as backstop.

---

## Problem / Context

`integrate-work-unit` Step 14 runs `arc teardown <wu>` post-merge. When the session runs inside the worktree
being removed (a self-teardown), `reconcile-worktree` hops only the **CLI subprocess's** cwd before
`git worktree remove` — the parent harness process stays in the deleted directory, and the session terminates
in a cascade of cryptic ENOENT hook/skill failures rather than a clean "shipped" signal (observed live at
PR #235's integration tail).

The asymmetry is physical and irreducible at that locus: you cannot stand in a directory you are deleting.
In-place / errand completion reaps a *ref* and leaves the session alive on its recorded return branch or a detached
refreshed-base fallback; worktree-WU completion cannot be made symmetric from within the worktree — but it **can** end
in a live session on a harmless husk. The justification is backend-invariant: a worktree stays a
directory-you-can't-delete-from-within regardless
of where WU state lives. This gates the GA `--here` → spawn default flip, so it ships as wave-2 code workload.

## Decisions

1. **Refs-early husk on self-teardown.** From inside the target worktree, `arc teardown` detaches HEAD
   (freeing the branch from git's "checked out in a worktree" refusal), runs every reap as a ref op, and
   **skips physical removal**. The session survives on a detached husk; normally its refs are gone, while an
   operational local-delete failure retains the ref with explicit retry guidance. Once the reaps complete, a later
   manual delete leaves nothing dangling. Chosen over: *physical-deferred* (its interim state — a live branch with
   a deleted upstream — repurposes branch-gone / orphan-sweep anomaly surfaces as a normal lifecycle state);
   *interim messaging only* (subsumed — the structural fix's terminal messaging delivers it and removes the
   failure it would have narrated); *status quo* (the harness-side failure cascade is not addressable above
   ARC's layer).

2. **The husk is a derived, terminal condition — no new state machinery.** A husk is an ARC-marked spawned worktree
   whose authorized terminal transition detached it from its branch, with no exclusive state. The shipped-WU driver is
   the producer in this WU; the typed stamp keeps future terminal drivers distinct. The normal transition fully reaps
   its refs, while an operational local-delete failure can retain the branch with an explicit retry notice. No new
   lifecycle state value, no meta-schema touch: the condition derives
   from machine-local signals (detached HEAD + the ownership marker's husk stamp, with `completed/` membership
   naming the WU when there is one). The definition names the canonical **marked** husk — the stamp-visible condition; a
   markerless linked worktree whose refs were reaped the same way is the externally-managed degenerate case
   (Decision 3's marker boundary), invisible to the derived surfaces by design. Whether the condition
   graduates to a real state value is `wu-lifecycle-state-model`'s call; this WU emits the mechanics and the
   transition it would formalize. A husk is terminal — never repurposed for new work; disposal (teardown
   re-run, sweep offer, external delete, bare `rm -rf` + `git worktree prune`) is its only forward edge.

3. **Locus-aware teardown, gates pinned before detach.** The existing self-teardown test selects the mode
   **within the linked-worktree arm only** — the in-place / primary arm (branch checked out in the primary
   worktree) keeps its switch-to-base relocation unchanged, and the already-absent arm stays a no-op: a
   primary is durable and never husks. Within the linked arm: from outside the target worktree, teardown is
   unchanged (full physical reap). From inside (husk mode), the order is pinned — **all refusable gates fire
   before the detach**, because detach is cheap but directional and a half-husked state must never exist:
    1. *Gates:* the clean-gate as today, **plus a reap-safety pre-gate** and a complete dry-run of the
       identity-global user-surface reconcile — compute the same preservation
       verdict the merged-safe branch-delete leg enforces (landed-in-base patch-equivalence / upstream
       containment), and discover a logical block across the full linked and canonical file set, before touching
       anything. Failure refuses husk mode whole: still branched, nothing detached, no user-surface writes, and a
       distinct refusal message naming the cause.
    2. *Reconcile:* after the dry-run clears, run the identity-global user-surface reconcile at this last
       ARC-attended moment (idempotent
       legacy net; a later manual `rm` bypasses it, acceptably — the husk carries no exclusive state). Because
       the husk remains live, use the existing signpost mode: durable legacy copies move to canonical and leave
       a signpost, while regenerable caches are removed. The complete dry-run makes a logical `blocked` outcome
       atomic across the set and keeps it in the preceding still-branched gate arm.
    3. *Detach + stamp:* `git switch --detach`, then extend the worktree ownership marker with a **husk
       stamp** — `{ husk: { sha, at, subject, branch } }`, an optional field on the existing machine-local,
       gitignored marker. `subject` is a discriminated logical identity — `{ kind: "work-unit", name }`,
       `{ kind: "errand", slug }`, or genuinely recordless `{ kind: "branch", ref }` — while `branch` pins the exact
       projection occupied at detach. A recordless branch subject's `ref` must equal that exact `branch` value.
       The stamp records that preservation was proven for that exact target and HEAD at husk creation; downstream
       surfaces key on the stamp's terminal subject, never on a slug inferred from a branch prefix or on the marker's
       original creation owner.
    4. *Ref reaps:* continue through the existing branch-delete / remote-head / prune legs. Post-detach remote-head
       and prune failures stay best-effort notices. An operational local branch-delete failure returns the husk with
       `branchDeleted: false`, skips remote-head deletion, continues prune, and leaves the surviving ref for a re-run
       instead of throwing after the directional transition. No `chdir`, no `git worktree remove`.

   The result reports `worktreeRemoved: null` plus
   `husk: { worktreePath, subject, branch, stamped, outcome: "created" | "already-husked" }` so callers and
   messaging key off an explicit payload — the deterministic husk-transition event `session-locus-model`'s locus
   record will later consume; this WU emits the event, never the record. Two placement constraints, both
   forward-compat: husk mode
   lives in the **shared projection layer**, keyed on the self-teardown test alone *within the linked arm* —
   WU-agnostic, so the recordless cheap-branch path inherits it unchanged, while the in-place / primary arm
   stays outside the key's reach — and detach is the **only always-valid destination** in a linked worktree
   (a switch-to-base dies when the primary holds the base), sidestepping that failure class entirely.

   **Marker boundary (settled).** The detach + ref-reap core fires on the self-teardown test alone (within
   the linked arm, per above) — including in a linked worktree carrying **no** ARC ownership marker (an
   externally-created checkout, or an errand worktree materialized via raw `git worktree add`) — because the
   cascade fix must be universal.
   The husk **stamp**, and with it the sweep / advisory / fallback visibility chain, fires only when a
   marker already exists: ARC never mints a marker at husk time — marker presence is the created-by-ARC
   provenance contract, and minting one would flip an external worktree to ARC-removable. A markerless husk
   is externally-managed, consistent with the existing external-worktree taxonomy: the session still
   survives; disposal is the operator's; the terminal notice drops the sweep-backstop clause. A **malformed**
   marker is treated as absent at stamp time — no stamp, externally-managed husk; it is never repaired into
   validity (a read-modify-write extend on garbage would mint the very provenance flip the no-mint rule
   forbids). An operational stamp-write failure after detach is likewise non-fatal: surface a notice and finish
   the ref reaps as an unstamped, externally-managed husk rather than stranding a half-husk. The stamp is a
   visibility backstop, not authorization for the transition.

   **Driver socket (settled).** The husk core (gates → reconcile → detach + stamp → ref reaps) is
   driver-agnostic: the refusable authorization gate in step 1 is **driver-supplied**. This WU wires the
   sole *shipped* driver, whose authorization is the reap-safety preservation proof. Future lifecycle
   drivers reaching the same self-teardown locus (pre-merge `abandon`, `park@Planning`) supply their own
   authorization (the discard confirmation; the artifacts-relocated criterion) and stamp accordingly —
   wiring them is bounded follow-up work on this socket, not a redesign of the husk model.

   **Logical subject and marker evolution (settled).** Worktree provenance and teardown target are separate.
   The marker gains a storage-neutral `createdFor` subject while continuing to accept legacy `wuName` markers;
   newly spawned WU worktrees dual-write both during compatibility, and the guard rejects disagreement between those
   two WU identities. A neutral marker needs `createdFor`, while a legacy marker needs `wuName`; neither shape admits an
   identity-free ownership record. The husk stamp always carries the
   driver-supplied terminal `subject` plus the exact `branch`, because a worktree can temporarily or permanently host
   a projection different from the one it was created for. Current producers wire `work-unit` and exact recordless
   `branch`; the `errand` variant is reserved in the shared type and driver socket for ARC-created errand worktrees,
   without changing `arc errand close` in this WU. This keeps logical identity independent of branch naming and of
   whether authored records later materialize from a separate git backing store.

4. **Detached-husk reap makes teardown idempotent — same oracle as the sweep.** Today the worktree arm is
   reachable only when a branch maps to a branched worktree — a normal branchless husk is invisible to a re-run,
   while a husk whose local ref survived an operational delete failure has a ref that maps to no worktree. After
   result-bearing ref resolution, extend worktree resolution with a marker fallback whenever no branched worktree
   maps: resolve the detached candidate by an exact match between the requested typed subject and the husk stamp's
   terminal subject, preserving the stamp's exact branch and any surviving ref as retry operands. Never match on
   top-level creation ownership or `branchToWorkUnitSlug()` collapse: a WU named `foo`, an errand slugged `foo`, and a
   recordless `chore/foo` branch are distinct targets even when they share text.
   The fallback removal keys on the same removability oracle as the sweep (Decision 5): it removes only a stamped husk
   that is clean **and** whose HEAD still equals the stamped sha; anything else — HEAD moved past the stamp, dirty tree,
   or no husk stamp — is refused and surfaced, mirroring the sweep's `blocked` disposition, never silently deleted.
   Run from *inside* the husk itself, the re-run performs no physical removal (the cwd-deletion class this WU exists to
   eliminate must not re-enter through the new path), retries presence-guarded ref cleanup when a local branch survived,
   and reports the already-husked state with truthful branch accounting. Husk-mode run, then a later primary-side
   outside re-run, completes the physical half.

5. **Sweep husk detection — stamp-keyed, roster contract intact.** The shared worktree roster excludes
   detached-HEAD worktrees by documented contract, so the husk arm adds a **sweep-local detached-worktree
   scan** over the raw `git worktree list --porcelain` parse; the roster contract stays unchanged. The
   removability oracle reads the **husk stamp**, not ancestry/patch containment of HEAD in the base (under
   squash merges that check false-negatives forever, rendering a routine husk a permanent `blocked` anomaly):
   candidate = detached-HEAD worktree + ARC marker carrying a husk stamp; disposition `removable` when clean
   **and** HEAD still equals the stamped sha; a husk whose HEAD moved past the stamp is `blocked`, surfaced
   not removed. Because the oracle is stamp-keyed rather than shipped-set-keyed, it is WU-agnostic: a
   recordless cheap-branch husk (when marked — Decision 3's marker boundary) surfaces through the same arm.
   Labels derive from the husk subject: `work-unit` subjects additionally check `completed/` membership, while exact
   `branch` subjects use generic shipped-husk wording; the reserved `errand` subject remains distinct without claiming
   WU completion. The arm preserves the roster sweep's existing ownership boundary: when team mode and an identity are
   active, marker `spawningIdentity` filters out another identity's husks; solo mode remains a pass-through.

6. **Session-init husk advisory — derived, explicitly interim.** A session initing inside a husk derives a
   *"shipped — pending teardown; reap me or just delete me"* orientation line from existing signals (the
   worktree probe's branch-null signal — `detached-head`, or `skipped` when remote sync is disabled — plus the
   husk-stamped `work-unit` subject + `completed/` match) — an advisory rendering, no new envelope state value.
   Detached-HEAD-without-stamp stays the ordinary detached-head surface, untouched. Interim by design:
   orientation-by-signals, cheap and self-contained, so
   `session-locus-model`'s orientation-by-record can supersede it without unwinding anything.

7. **`integrate-work-unit` Step 14 gets the husk terminal state.** Replace the "session terminates here"
   documentation with two message variants, both part of the contract — *success*: "this worktree is now a
   disposable husk — delete it at leisure, or the primary's sweep will offer," reporting refs reaped or the
   surviving local ref plus retry guidance when deletion failed (markerless husk: the sweep-backstop clause
   drops, per Decision 3's marker boundary); *refusal*: "cannot husk:
   {dirty tree | preservation unproven | user-surface reconcile blocked}" — still branched, nothing changed,
   resolve and re-run (a preservation refusal the check cannot resolve in place — the squash residual under
   Consequences — disposes from outside the worktree instead). This subsumes the interim messaging errand
   entirely.

## Scope boundary (No-gos)

- **No new lifecycle state value, no meta-schema change, no config axis, no migration.** The husk stays a
  derived machine-local condition; formalization belongs to `wu-lifecycle-state-model`.
- **No roster-contract widening.** Detached-HEAD worktrees stay excluded from the shared roster; the sweep
  reads its own detached scan.
- **No locus-record work.** This WU emits the husk-transition event in the teardown result;
  `session-locus-model` owns consuming it.
- **No occupancy gating.** An outside removal of a still-occupied husk (sweep accept, external tool, manual
  `rm`) is the operator's informed call — ARC has no occupancy signal and does not invent one.
- **No abandon / park self-teardown coverage.** The same deleted-cwd cascade is reachable through the
  lifecycle transitions that drive worktree teardown (pre-merge `abandon`, `park@Planning`) from inside a
  spawned worktree. Consciously deferred: abandoned / parked work has different preservation semantics
  (nothing has landed), so those drivers wire into Decision 3's driver socket as bounded follow-up work —
  captured. Exposure noted since the GA spawn-default flip raises it.
- **No errand-close rewiring.** In-place warm entry from a linked WU worktree remains the errand topology: close
  restores the recorded pre-open WU branch, or detaches at refreshed base when unavailable. A future separately
  spawned errand worktree uses the reserved `errand` subject and husk-driver socket; that driver must retain the errand
  record until its branch-reap / husk-transition result satisfies the driver's successful-close contract, with the
  exact stamp-failure policy settled there. This WU supplies the compatible representation, not that lifecycle
  integration.
- **No harness-side changes.** The fix lives entirely at ARC's layer.
- **Other machines' orphan branches stay the orphan-branch sweep's surface, unchanged.**

## Consequences & Risks

- **Preflight half-husks are prevented; post-detach failures are explicit.** The gates-before-detach ordering means
  every logical refusal leaves a fully-branched, untouched worktree. Operational failures after detach return a live
  retained-ref or externally-managed husk with notices and retry guidance rather than an ambiguous rejection.
- **Accepted — occupied-husk removal:** the shipping session survives in the husk, so an outside removal
  while it still sits there reproduces the stranded-harness cascade, now user-mediated instead of
  ARC-initiated. Offer-only surfaces and the "delete at leisure" notice make it an informed call. Narrow.
- **Accepted — gate/delete race:** the pre-gate computes the preservation verdict, the delete leg re-checks;
  only an external push racing that window diverges them. Worst case is a refused delete after detach — a
  `removable` husk whose live local branch survives physical removal (worktree removal never deletes branch
  refs) and falls to the orphan-branch sweep's surface. Surfaced by the existing refusal notice. Negligible.
- **Accepted — operational local-delete failure:** detach is already directional when `git branch -D` fails.
  Return a live husk with `branchDeleted: false`, skip remote deletion, continue prune, and tell the operator to
  retry; this preserves the session and truthful accounting without pretending the ref reap completed.
- **Accepted — abandoned husk:** costs a stale `git worktree list` entry until swept or pruned — the
  backstop's job.
- **Accepted — pre-gate squash residual:** the reap-safety pre-gate reuses the delete leg's preservation
  verdict, including its documented residual — a multi-commit squash whose remote-tracking ref has already
  been pruned loses provability, so such a WU refuses husk mode even though it landed. Behavior parity with
  today's delete leg (the same refusal exists now); the escape hatch is disposing from outside the worktree
  via operator-verified paths. The refusal message names the unproven preservation rather than promising a
  universal resolve-and-re-run.
- **Manual `rm` bypasses the user-surface reconcile** — acceptable: a spawned worktree carries no exclusive
  state (validated by FP dogfooding); the reconcile is a legacy net, not load-bearing.
- **Premise:** the harness survives on a detached husk — the cwd remains a real directory, so hooks, skills,
  and the terminal keep working. All observed failures were deleted-cwd ENOENT; nothing suggests otherwise.

## Success Criteria

1. `arc teardown <wu>` run from inside the WU's own worktree completes with the session alive: HEAD
   detached, local branch deleted, remote head deleted (or best-effort notice), prune run, no physical removal, and a
   result reporting husk mode. A valid marker normally carries the terminal stamp; a marker-write failure reports an
   unstamped externally-managed husk and still completes the ref reaps.
2. Gate failure (dirty tree, preservation unproven, or a blocked user-surface reconcile) refuses husk mode
   whole: still branched, nothing detached, a distinct refusal message naming the cause.
3. Self-teardown in a **markerless** linked worktree still ends in a live detached session; normally its refs are fully
   reaped, while an operational local-delete failure preserves the ref with retry guidance. No marker is minted, and
   the husk is absent from the sweep / advisory / marker-fallback surfaces (externally-managed, per Decision 3's marker
   boundary).
4. Re-running `arc teardown <wu>` against a husk resolves the worktree via the marker fallback whenever no
   branched worktree maps, including when a local ref survived. From the primary it removes the husk physically
   **only** when the removability oracle clears (stamped, clean, HEAD equals the stamped sha), refusing and surfacing
   it otherwise. From inside the husk it removes no worktree, retries presence-guarded cleanup of any surviving ref,
   and reports the already-husked state with truthful branch accounting. Teardown is idempotent across the husk state.
   Resolution matches the exact stamped `work-unit` subject; recordless branch teardown matches the exact stamped
   `branch` subject, so equal slugs across target kinds or branch prefixes never alias.
5. The stale-worktree sweep surfaces a husk: `removable` when clean and HEAD equals the stamped sha;
   `blocked` when HEAD has moved past the stamp; a marked recordless cheap-branch husk surfaces through the
   same arm with generic naming.
6. Session-init inside a husk renders the shipped-pending-teardown advisory; a detached-HEAD worktree
   without a husk stamp renders the ordinary detached-head surface, unchanged.
7. `integrate-work-unit` Step 14 documents the husk terminal state with both message variants; the "session
   terminates here" language is gone.
8. Bare `rm -rf` + `git worktree prune` on a husk whose reap legs all succeeded leaves nothing dangling —
   no local refs survive husk creation, and remote-leg failures surface as best-effort notices at husk time.
9. Unit / integration coverage lands for each leg: husk-mode teardown (marked and markerless), pre-gate refusal,
   marker-fallback reap (removal, refusal, branchless inside-husk no-op, and surviving-ref inside-husk retry), sweep
   husk arm, and the session-init advisory.
10. An operational local branch-delete failure after detach returns a live husk with `branchDeleted: false`,
    skips remote-head deletion, continues prune, and reports retry guidance without claiming all refs were reaped.
11. Legacy WU-shaped ownership markers remain valid, new markers can carry a storage-neutral creation subject, and
    every new husk stamp records a typed terminal subject plus its exact branch projection. The reserved `errand`
    subject composes with future ARC-created errand worktrees without changing current warm in-place errand close.

## Open items

- Message wording for the terminal and refusal notices — drafted in Decisions 3 and 7; final phrasing lands
  with the workflow edit.
