# Notes: Project State Integrity

Reference context for task generation and execution — implementation loci, verified evidence, and rationale
detail that the spec summarizes.

## Contents

- [Implementation loci](#implementation-loci-verified-2026-07-08-paths-re-verified-at-task-generation)
- [Live repro evidence](#live-repro-evidence--fixture-backed)
- [Failure-vector inventory](#failure-vector-inventory--overlap-harness)
- [Parked-WU topology](#parked-wu-topology--design-reckoning-settled-2026-07-08)
- [Rationale detail](#rationale-detail)

## Implementation loci (verified 2026-07-08; paths re-verified at task generation)

All paths below are under `packages/arc-framework/`.

- **Branch-name identity mint + `plan/`-prefix phase proxy** (what the identity re-key replaces):
  `src/lib/git/in-flight-derivation.ts` `classifyBranch` (~line 186) — name parsed after the type prefix
  (~line 206), planning state from `PLANNING_BRANCH_PREFIX` (~line 212). Input set is remote-tracking refs
  only: `src/commands/active/in-flight.ts` sources branches from `resolveInFlightBranchSet` (~line 59); no
  local-branch input.
- **Silent degradation to wrong shapes**: `resolveWorktreePathsByBranch` failure returns an empty map
  (`src/lib/git/worktree-roster.ts` ~142–154) — every entry turns `remoteOnly` with no warning. The
  loud-degradation work starts here.
- **Path-equality self-exclusion**: `src/lib/git/foreign-artifact-detection.ts` ~101–106 and
  `src/scripts/check-foreign-writes.ts` ~103–106; `originatingMetaPath` is `undefined` exactly when
  `resolveActiveWu` cannot resolve (ceremony windows).
- **Fire-time probes**: `committedMatches` (diff `base...branch`, mutable base ref) and `uncommittedMatches`
  (`git status --porcelain` with `cwd` set to the sibling worktree) —
  `src/lib/git/foreign-artifact-detection.ts` ~132–172. The hook runs `localOnly: true`
  (`src/scripts/check-foreign-writes.ts` ~140), so commit-time detection never prunes.
- **Filesystem-free index construction**: `buildLifecycleIndexFromMetas`
  (`src/lib/work-unit/lifecycle-index.ts` ~231) — the union-fed construction the composer's dep resolution
  uses. An at-ref active meta resolves (`Planning`/`Active`, active) via `resolveLifecyclePosition` /
  `locationFromPath` and classifies pending, never `shipped` (`shipped` requires (`Shipped`, completed) per
  the lifecycle-resolver canonical map).
- **Errand identity source**: `errandSlugByBranch` option on `deriveInFlight` (~line 120), populated by
  `readErrandSlugByBranch` (`src/commands/active/in-flight.ts` ~60).
- **Existing regen triggers** (the tracked render's same-commit ceremony fire sites): the composer bindings
  at `src/lib/work-unit/executor-context.ts` ~263 (via `reconcileRoadmap`,
  `src/lib/work-unit/side-effects/readiness-regen.ts`) and `src/handlers/start.ts` ~579
  (`refreshRoadmapForStartCeremony`, which bypasses `reconcileRoadmap`).
- **Title read-back to retire**: `resolveTitle` (`src/lib/status/project-view.ts` ~159–168) — the only
  `ROADMAP.md` data read-back in `src/` (repo-grepped).
- **Pre-commit chain** (the regenerate-wins assert's home): `arc/system/.internal/githooks/pre-commit`
  (package source; syncs to the `.arc/` copy). CHECK 17 is the existing render-fields-without-regen nudge;
  CHECK 18 (`src/scripts/validate-cohort-consistency.ts`) is the blockable-check precedent; CHECK 19
  (`src/scripts/check-foreign-writes.ts`) is the advisory precedent.

## Live repro evidence — fixture-backed

The stale `plan/burn-in-probe-a` branch on `origin` (with the WU's real `chore/burn-in-probe-a` checked out
locally, absent from the remote) supplied the deterministic standing repro for the (A) work: it exhibited both
standing false facts (phantom remote-only materialize candidate; invisible local in-flight worktree). That
topology is now fixture-backed by the integration harness, so the live branch is released from its special
preservation hold and may be pruned during normal branch hygiene. The wave-1 phantom-overlap signature remains:
the detector's own probes return empty on re-run — transient truth, unreproducible minutes later.

## Failure-vector inventory — overlap harness

**Reshuffle-step catalog.** The integration harness exposes the git-level effects the oracle consumes: spawn a
linked worktree from a ref, rename a checked-out local `plan/<name>` branch to `<type>/<name>` while updating its
meta, delete or recreate a remote branch with matching remote-tracking ref churn, push a branch, and inject any
of those steps at a selected git-call boundary.

**Mutation-class crossing.**

- **Ref churn:** remote delete/recreate/push can land before either ref snapshot or exactly before the second
  ref snapshot. Expected outcome: clean quiescent reads; marked indeterminate reads when the snapshot changes.
- **Worktree churn:** spawn and local branch rename can land before either worktree-list snapshot or before the
  second local-ref snapshot. Expected outcome: clean local-worktree visibility when calm; marked indeterminate
  reads when the worktree branch set changes mid-derivation.
- **Sibling mid-commit writes:** a checked-out sibling can change target paths between the overlap detector's
  two status reads. Expected outcome: an indeterminate probe note, never a foreign overlap assertion.
- **Stale refs:** a stale remote `plan/<name>` can coexist with the local renamed `<type>/<name>` worktree.
  Expected outcome: content-keyed dedupe selects the local worktree candidate; the stale ref stays provenance,
  not a materialize candidate or overlap candidate.
- **Unpushed branches:** a local worktree branch absent from `origin` must enter through the worktree/local-ref
  union. Expected outcome: the local entry is visible without requiring a push.

**Pinned wave-1 mechanism.** The reproduced mechanism is stale remote twin plus invisible local rename:
`origin/plan/<name>` carried the same meta slug while the real `<type>/<name>` branch was checked out locally
and unpushed. The old branch-keyed, remote-only derivation minted a separate candidate from the stale `plan/`
ref and missed the local worktree. During ceremony windows, originating meta/name resolution could be absent,
so overlap self-exclusion fell back to path equality and failed to recognize the stale remote twin as self. Its
committed diff against base touched `.arc/active/meta-<name>.md`, producing the transient phantom overlap. The
fixture-backed regression now routes that topology through the overlap detector with the originating meta path
absent and asserts no overlap.

## Parked-WU topology — design reckoning (settled 2026-07-08)

Task generation ran a four-pass adversarial-review loop (task-audit rubric, full depth); passes 1–3 plus
three pass-4 findings are folded into the suite. The remaining pass-4 major — parked-WU topology — got a
dedicated design reckoning rather than a patch; the outcome is folded into spec § A (parked classification)
and § B (per-axis precedence) and the corresponding tasks. This section keeps the finding record and the
rationale detail the spec summarizes.

**The finding (verified against source).** park@Active leaves the WU's authoritative meta (`State: Active`,
matching `Branch`) on the preserved, pushed branch and writes a pointer record to
`.arc/backlog/planned/<name>/` that also stores the literal `State: Active` (`pointer-record.ts` ~53–65);
`parked` is derived from the `(Active, planned)` position (`lifecycle-resolver.ts` ~52), and today's composer
renders that pair as the Parked tier (`project-view.ts` ~247). A state-blind
active-meta-over-stub precedence would have the preserved branch's at-ref meta supersede the park pointer and
render every parked WU **In Flight** — a false-fact class on the tier SC 2 protects. The oracle side
inherited the same blindness: entry data alone cannot distinguish parked from in-flight (both are Active
metas at live refs), and the materialize surface would offer a parked WU whose sanctioned verb is
`arc resume` (pre-existing today).

**Settled design — per-axis precedence behind one classifier.** The rule is axis-shaped and survives WLSM's
reform: a park pointer record is authoritative for *scheduling-tier membership* (Parked, never In Flight;
the In Flight supersede applies only to non-parked slugs); the at-ref branch meta stays authoritative for
*progress facts* (row fields, dep classification — a parked WU's dep edges classify pending). "Is this
parked" resolves only through the lifecycle classifier's canonical `(Active, planned)` → `parked` map —
unambiguous today, since that pair arises solely via park@Active — so WLSM's scheduling-axis reform swaps
the classifier while the rule and its consumers stay put. The oracle stamps entries from an injected
parked-slug set resolved through the same classifier (a domain classification, not a degradation mark);
materialize surfaces exclude parked, the foreign-write advisory drops parked candidates (a shelf is frozen —
collision resolves at resume), and views render parked as parked. **No interim park-model change**: an
explicit stored scheduling field would build WLSM's axis ahead of its design, and parking has never been
exercised (zero parked WUs), so migration stays free whenever WLSM lands.

**Grounding — the pause-is-orthogonal idiom.** Convergent across domains: OS process suspension
(suspended-ready / suspended-blocked composite states), statechart history states, BPMN instance suspension,
kanban's blocked-as-annotation and parking-lot, scrum's de-scoping (sprint removal leaves refinement
untouched). Interruption lives on an orthogonal scheduling axis that preserves progress-axis position — it
is never modeled as a backward move. Backward moves on the progress axis are their own deliberate acts
(issue-tracker reopen, Definition-of-Ready decay and re-attestation); under an event log they stop being
"backward" at all (append-only log, non-monotonic projection) — the shape the ancestry-first dedupe already
assumes ("`State` never leads"). park@Active had the concept right (State preserved, only the shelf changes)
and the encoding wrong (directory position doubling as the scheduling bit). The axis-decomposition framing
for the backward verbs (`deactivate` ≈ readiness-revocation ± de-schedule; `park` = pure de-schedule;
`reopen` a genuine progress-axis retreat) is captured to WLSM's seam in `USER-INBOX`
(`WU_Target: wu-lifecycle-state-model`).

## Rationale detail

- **Why a hook assert, not a git merge driver**: a merge driver cannot ship purely via the repo (requires
  per-clone config), so regenerate-wins enforcement is convention + pre-commit assert.
- **ADR-022 §8 interim**: the tracked render is the "derived → tracked + regeneratable" interim tier; under
  the git-backing-store target the source resolution swaps to the backing store and the in-flight supersede
  tier *dissolves* (graduation stops being branch-local; one record per WU) — scaffolding that dissolves
  rather than reshapes. The sink swap (tracked-commit → materialized-write) leaves the render layer unchanged.
- **CSA sequencing**: `cli-substrate-adoption` would supply the zod meta-frontmatter schema for typed parsing;
  a hand-rolled parser is acceptable to land earlier — the schema swap is contained to the record-model
  boundary.
