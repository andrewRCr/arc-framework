# Notes: worktree-teardown-decoupling

Reference material for task generation and execution — implementation loci, existing-signal pointers, and
design rationale detail beneath the spec's decision grain.

## Implementation loci

- `packages/arc-framework/src/lib/work-unit/verbs/teardown.ts` — the three arms live here: linked-worktree
  reap (the branch-to-worktree lookup makes both a branchless husk and a detached husk with a surviving ref
  invisible as a worktree today), the in-place / primary arm (switch-to-base + best-effort `merge --ff-only`;
  stays outside husk mode), and the
  already-absent no-op. Husk mode's shared-projection placement and the marker-fallback resolution both land
  around this file's worktree-arm plumbing.
- `packages/arc-framework/src/lib/work-unit/mutators/reconcile-worktree.ts` — the teardown leg: clean-gate,
  identity-global user-surface reconcile (throws on `blocked` — the third refusal cause), `isSelfTeardown`
  (already computed for the locus-hop; the husk-mode key), the `chdir` + `git worktree remove` pair husk mode
  skips, and the `locusHopped` result bit the interim-messaging idea would have surfaced. The current reconcile
  can mutate an earlier file before a later file blocks, so husk preflight needs a complete dry-run over the set
  before the signposting write pass.
- `packages/arc-framework/src/lib/git/worktree-marker.ts` — optional husk-stamp field rides the existing
  machine-local, gitignored marker (schema-guard-compatible). The read is three-state (present / absent /
  malformed); `writeWorktreeOwnershipMarker` no-ops on `createdByArc: false`, which is why markerless linked
  worktrees exist (`arc start --here` in an external checkout; errand materialize via raw `git worktree add`).
  Creation ownership evolves from the legacy WU-shaped `wuName` toward a neutral `createdFor` subject, while the husk
  stamp separately records the exact driver-supplied terminal subject and branch projection.
- `packages/arc-framework/src/lib/git/worktree-roster.ts` — roster contract (`branch` always populated;
  detached-HEAD entries excluded) stays intact; the raw `git worktree list --porcelain` parse already
  captures detached stanzas before the branched filter — expose that scan for the sweep's husk arm.
- `packages/arc-framework/src/lib/git/worktree-cleanup.ts` — `decideWorktreeCleanup` maps marker-absent (and
  malformed) to `external`; the husk arm's stamp-keyed oracle sits beside this, not inside the roster.
- `packages/arc-framework/src/lib/session-init/stale-worktree-sweep.ts` + cleanup-decision plumbing — the
  husk arm and its `removable` / `blocked` dispositions.
- `packages/arc-framework/src/lib/git/branch-containment.ts` — `assessReapSafety` is the shared preservation
  verdict the reap-safety pre-gate reuses; its module doc records the multi-commit-squash residual the spec's
  accepted risk points at.
- Session-init husk advisory: probe rendering plus the `session-init.md` orientation line. The worktree probe already
  carries the branch-null signal needed for detached detection, including the `skipped` state when remote sync is
  disabled.
- `integrate-work-unit.md` Step 14 — carries the exact "the session terminates here" language the terminal
  messaging replaces.
- Unit / integration coverage for each leg (spec Success Criterion 9 enumerates them).

## Existing-signal pointers

- The self-teardown test and the locus-hop already exist — husk mode reuses the computed signal, adding no
  new detection.
- Post-detach, the local delete's internal containment re-check becomes a formality (the pre-gate already
  proved it), but the git operation can still fail. That failure retains the local branch with retry guidance,
  skips remote deletion, and continues prune. A re-run resolves the detached stamped marker even though the surviving
  ref maps to no branched worktree, retries the ref leg without removing an inside-husk cwd, and reports the result;
  the remote-head and prune legs otherwise stay best-effort notices.
- The husk tree contains `completed/` (the archive sweep lands on the WU branch pre-merge), which is what
  lets the re-run, sweep, and advisory name the WU from inside the husk.

## Forward-compatibility boundaries

- **Logical identity vs. branch projection:** the machine-local marker may point at a logical WU or errand record, but
  the husk stamp also retains the exact branch projection being reaped. Candidate lookup compares the requested typed
  subject with the stamp, not `branchToWorkUnitSlug()` output or the marker's original creation owner. This lifts into
  the storage-evolution target: records can later materialize from a separate git backing store without changing how a
  local worktree declares which logical subject and ref it hosted.
- **PR #241 warm errand topology:** current warm entry is in-place even when invoked from a linked WU worktree.
  `openErrand()` records that WU branch as `returnBranch`; `closeErrand()` restores it when available and otherwise
  detaches at refreshed base, then reaps the errand branch before removing the versioned errand record. The worktree
  remains WU-owned throughout, so close neither rewrites its ownership subject nor stamps a husk.
- **Future errand worktrees:** a separately spawned errand worktree can write `createdFor: { kind: "errand", slug }`
  and drive the same self-husk socket with an `errand` terminal subject. If the return branch is still occupied by the
  caller's WU worktree, PR #241's detached-base fallback already provides the required pre-reap topology. The future
  driver keeps the errand record until its branch-reap / husk-transition result satisfies the successful-close
  contract; the driver owns the exact stamp-failure policy, while physical removal can remain a later sweep concern.
  This WU supplies the representation and socket only.

## Rationale detail

- **No-exclusive-state mechanism** (why blessed manual deletion is safe): WORKING-MEMORY and USER-INBOX are
  primary-bound, and the WU's SESSION-NOTES is retired by `arc user close` at the integration ceremony — so
  a shipped spawned worktree holds nothing personal. The user-surface reconcile in husk mode is an idempotent
  legacy net, not load-bearing; its existing signpost mode retires any legacy linked copies because the husk
  lingers instead of being removed. Validated by FP dogfooding.
- **Stamp vs. locus record** (boundary with `session-locus-model`): the husk stamp is worktree-local state —
  "what this directory is"; the locus record is session state — "where the session is, what frame". Disjoint
  by design: the stamp is what the record's husk reporter will read. This WU emits the husk-transition event
  in the teardown result; the record consumes it later.
- **Scope estimate:** medium. No config axis, no meta-schema change, no tracked-storage migration; the machine-local
  marker guard remains backward-compatible with legacy WU-shaped markers.

---
