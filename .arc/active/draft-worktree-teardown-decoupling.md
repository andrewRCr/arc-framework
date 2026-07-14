# Draft: worktree-teardown-decoupling

- **Origin:** [internal] — FP wave-2 slate; design seed recorded in `notes-finalize-parallelism.md`
  § Dogfood finding (2026-07-13): worktree self-teardown, resolved structural 2026-07-14.
- **Purpose:** Decouple ARC's ceremony-side teardown (ref reaps) from physical worktree removal, so a
  work unit shipped from inside its own worktree ends in a clean *"shipped — pending physical teardown"*
  terminal state on a disposable detached husk, instead of deleting the session's cwd out from under the
  harness. Manual directory deletion becomes a blessed, idempotent path; ARC's own removal is convenience
  automation with the stale-worktree sweep as backstop.

---

## Problem / Motivation

`integrate-work-unit` Step 14 runs `arc teardown <wu>` post-merge. When the session runs inside the
worktree being removed (a self-teardown), `reconcile-worktree` hops only the **CLI subprocess's** cwd
(`process.chdir(primary)`) before `git worktree remove` — the parent harness process stays in the deleted
directory. The session terminates in a cascade of cryptic ENOENT hook/skill failures rather than a clean
"shipped" signal (observed live at PR #235's integration tail).

The asymmetry is physical and irreducible at that locus: you cannot stand in a directory you are deleting.
In-place / errand completion reaps a *ref* and leaves the session alive on `main`; worktree-WU completion
cannot be made symmetric from within the worktree — but it **can** end in a live session on a harmless
husk. The justification is arc-backend-invariant: a worktree stays a directory-you-can't-delete-from-within
regardless of where WU state lives. This gates the GA `--here` → spawn default flip, so it ships as wave-2
code workload.

## Alternatives

- **Refs-early husk (chosen, ratified here):** on self-teardown, detach the worktree's HEAD
  (`git switch --detach`) — detaching frees the branch, dissolving git's "branch checked out in a worktree"
  refusal — then run every reap as a ref op (merged-safe branch delete, landed-proof-gated remote-head
  delete, prune) and **skip physical removal**. The session survives on a detached husk carrying no refs;
  a later manual delete leaves *nothing* dangling. Closest to the ideal terminal state.
- **Physical-deferred (set aside):** keep branch + worktree + prune together in a deferred reap; a manual
  `rm` removes the directory but leaves refs for the next sweep. Rejected: the interim state is a live
  branch with a deleted upstream, which reads as branch-gone / orphan-sweep anomalies rather than
  "shipped" — it repurposes anomaly surfaces as a normal lifecycle state.
- **Interim messaging errand only:** surface the already-computed `locusHopped` bit as a clean
  self-teardown notice, mechanics unchanged. Subsumed — the structural fix's terminal messaging delivers
  this and removes the failure it would have narrated.
- **Status quo (documented termination):** the workflow already warns the session terminates. Rejected:
  the harness-side failure cascade is not addressable above ARC's layer, and the terminal moment bypasses
  any clean close.

## Design

**Terminal-state model.** A **husk** is a spawned, ARC-marked worktree whose WU has shipped and whose
refs are fully reaped: detached HEAD, no branch, no exclusive state (post-BI-6, WORKING-MEMORY /
USER-INBOX are primary-bound and SESSION-NOTES is retired by `arc user close` at Step 13). It is
disposable by any means — `arc teardown` re-run, sweep offer, Herdr's delete button, or bare
`rm -rf` + `git worktree prune`. Deliberately **no new lifecycle state value and no meta-schema touch**:
the husk condition is derived from machine-local signals (detached HEAD + the ownership marker's husk
stamp, with `completed/` membership naming the WU when there is one). Whether it graduates to a real
state value or annotation is `wu-lifecycle-state-model`'s call; this WU emits the mechanics and the
transition it would formalize. A husk is **terminal**: it is
never repurposed for new work (a checkout's role is durable — `session-locus-model`'s locus doctrine;
disposal is the husk's only forward edge).

1. **Locus-aware `arc teardown`.** The self-teardown test (`isSelfTeardown`, already computed for the
   locus-hop) selects the mode:
    - *From outside the target worktree* (primary or sibling): unchanged — full physical reap exactly as
      today (worktree remove, branch delete, remote head, prune).
    - *From inside* (husk mode), in pinned order — **all refusable gates fire before the detach**, because
      detach is cheap but directional and a half-husked state must never exist:
        1. *Gates:* the clean-gate as today (a dirty tree refuses), **and a reap-safety pre-gate** — compute
           the same preservation verdict the merged-safe delete leg enforces (landed-in-base
           patch-equivalence / upstream containment) *before* touching anything. Failure refuses husk mode
           whole: still branched, nothing detached, a distinct refusal message naming the unproven
           preservation (symmetric with the dirty-tree refusal). Without this gate, a refusable delete after
           detach would strand a detached worktree with a live branch — the exact dangling state the
           refs-early variant exists to avoid.
        2. *Reconcile:* the identity-global user-surface reconcile at this last ARC-attended moment
           (idempotent legacy net; a later manual `rm` bypasses it, acceptably — the husk carries no
           exclusive state).
        3. *Detach + stamp:* `git switch --detach`, then extend the worktree ownership marker with a **husk
           stamp** — `{ husk: { sha: <HEAD at husk time>, at: <timestamp> } }`, an optional field on the
           existing machine-local, gitignored marker (schema-guard-compatible; no tracked artifact, no
           meta touch). The stamp records that preservation was proven at husk creation and pins the HEAD
           it was proven for — the downstream surfaces key on it (items 3–4). Boundary with
           `session-locus-model`'s machine-local session/locus record: the stamp is **worktree-local**
           state ("what this directory is"), the record is **session** state ("where the session is,
           what frame") — disjoint by design; the stamp is what the record's husk reporter reads.
        4. *Ref reaps:* the existing branch-delete / remote-head / prune legs unchanged (the local delete's
           internal containment re-check is now a formality; the post-detach remote-head and prune legs
           stay best-effort notices as today). No `chdir`, no `git worktree remove`.
      Result reports husk mode
      (e.g. `worktreeRemoved: null` + a husk field) so callers and messaging key off it — and that result
      is the deterministic husk-transition hook `session-locus-model`'s locus record will consume (locus
      kind `shipped-husk`); this WU emits the event, never the record.
      Two placement constraints, both forward-compat: husk mode lives in the **shared projection layer**
      keyed on the self-teardown test alone — WU-agnostic, so the recordless cheap-branch path
      (`runBranchTeardown`) and `session-locus-model`'s ephemeral-errand-worktree direction inherit it
      unchanged. And detach is the **only always-valid destination** in a linked worktree — a
      switch-to-base dies when the primary holds the base (the live `arc errand close` topology failure,
      2026-07-14), so the detach choice sidesteps that failure class entirely, not just the
      branch-checked-out refusal.
2. **Branchless-husk reap (re-runnability fix).** Today `teardown.ts` reaches the worktree arm only inside
   `if (branch !== null)` — a husk (branch already reaped) is invisible to a re-run from the primary.
   Extend worktree resolution with a marker fallback: when no branch maps, resolve the WU's worktree by
   ownership-marker `wuName` and remove it physically. This is what makes teardown idempotent across the
   husk state: husk-mode run, then a later primary-side re-run, completes the physical half.
3. **Sweep husk detection.** Two settled design points here, both source-verified:
    - *Enumeration:* the shared worktree roster **excludes detached-HEAD worktrees by documented contract**
      (`branch` always populated) — a husk can never be a roster entry, and widening that contract would
      ripple through every session-init consumer. So the husk arm adds a **sweep-local detached-worktree
      scan** over the raw `git worktree list --porcelain` parse (which already captures detached entries
      before the roster's branched filter); the roster contract stays intact.
    - *Removability oracle:* **not** ancestry/patch containment of HEAD in `origin/<base>` — under a squash
      merge (multi-commit squashes especially) that check false-negatives forever, and the backstop would
      render a routine shipped husk as a permanent `blocked: unmerged` anomaly — the exact failure mode the
      physical-deferred variant was rejected for. Instead the oracle reads the **husk stamp**: candidate =
      detached-HEAD worktree + ARC marker carrying a husk stamp; disposition `removable` when clean **and**
      HEAD still equals the stamped sha (preservation was proven at husk creation, guaranteed by item 1's
      pre-gate; the stamp is the durable record of that proof). A husk whose HEAD moved past the stamp
      (someone committed inside it) is `blocked`, surfaced not removed. Offer `git worktree remove {path}`
      as today. The sweep stays the "if you didn't, I'll get it eventually" backstop for blessed manual
      deletion — and because the oracle is stamp-keyed rather than shipped-set-keyed, it is **WU-agnostic**:
      a recordless cheap-branch husk (and `session-locus-model`'s future ephemeral errand worktrees)
      surfaces through the same arm, named via marker `wuName` + `completed/` match when it is a WU,
      generically ("shipped husk") when it is not.
4. **Session-init husk advisory.** A session initing inside a husk today finds an archived meta and falls
   to the orphan path. Derive a *"shipped — pending teardown; reap me or just delete me"* orientation line
   from existing signals (worktree `detached-head` state — already a probe state — + the husk-stamped
   marker + `completed/` match for the WU naming) — an advisory rendering, no new envelope state value.
   The stamp makes the derivation unambiguous: detached-HEAD-without-stamp stays the ordinary
   detached-head surface, untouched. **Explicitly interim:** this is orientation-by-signals, cheap and
   self-contained precisely so `session-locus-model`'s orientation-by-record (the husk is its strongest
   test case — the archived meta is exactly where orientation-by-meta fails) can supersede it without
   unwinding anything.
5. **`integrate-work-unit` Step 14 edit + terminal messaging.** Replace the "session terminates here"
   documentation with the husk terminal state. Two message variants, both part of the contract:
    - *Success:* "refs reaped; this worktree is now a disposable husk — delete it at leisure, or the
      primary's sweep will offer." The session survives to close cleanly; fresh work starts in another
      worktree as before.
    - *Refusal* (item 1's gates): "cannot husk: {dirty tree | preservation unproven}" — still branched,
      nothing changed, resolve and re-run. Same shape as today's dirty-tree refusal.
   This subsumes the interim messaging errand entirely.

## Unknowns and Assumptions

- **Assumption (validated by FP dogfooding):** a current spawned worktree carries no exclusive state; the
  user-surface reconcile is a legacy net, not load-bearing. Manual deletion is therefore safe by design.
- **Assumption:** the harness survives on a detached husk — the cwd remains a real directory, so hooks,
  skills, and the terminal all keep working. (This is the whole premise; nothing suggests otherwise — the
  observed failures were all deleted-cwd ENOENT.)
- **Edge accepted:** other machines' local branches for the shipped WU still go orphan (upstream deleted);
  the existing orphan-branch sweep owns that surface unchanged.
- **Edge accepted:** a husk abandoned forever costs a stale `git worktree list` entry until swept or
  pruned — the backstop's job.
- **Edge accepted (occupied-husk removal):** the shipping session *survives* in the husk, so an outside
  removal (a concurrent primary session accepting the sweep offer, Herdr's delete button, manual `rm`)
  while that session still sits there reproduces the stranded-harness cascade — now user-mediated instead
  of ARC-initiated. ARC has no occupancy signal to gate on; the offer-only surfaces and the terminal
  notice ("delete at leisure") make this the operator's informed call. Narrow, accepted.
- **Edge accepted (gate/delete race):** item 1 pre-computes the preservation verdict, then the delete leg
  re-checks internally; only an external push racing that window could diverge them. Worst case is a
  refused delete after detach, surfaced by the existing refusal notice and caught by the sweep's `blocked`
  arm. Negligible and accepted.

## Scope Estimate

**Small-to-Medium (days).** Loci: `teardown.ts` + `reconcile-worktree.ts` (husk leg, reap-safety pre-gate,
marker-fallback resolution), `worktree-marker.ts` (optional husk-stamp field), `worktree-roster.ts`
(expose the raw detached-entry scan for the sweep — the roster contract itself is unchanged),
`stale-worktree-sweep.ts` + cleanup-decision plumbing (husk arm), session-init husk advisory (probe
rendering + `session-init.md` orientation line), `integrate-work-unit.md` Step 14, terminal messaging,
plus unit / integration coverage for each leg. No config axis, no meta-schema change, no migration.

Dependencies: none blocking. Coordination: `wu-lifecycle-state-model` consumes the shipped mechanics and
owns the state-formalization question (routed via its USER-INBOX capture); `session-locus-model` will
report the husk transition through its locus record later — this WU only emits the transition.
