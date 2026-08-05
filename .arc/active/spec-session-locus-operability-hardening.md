# Spec (`detailed` · `RFC`): session-locus-operability-hardening

- **Origin:** `[internal]` — repository-wide session recovery failures and a system-level proportionality audit of
  the shipped locus substrate.

- **Purpose:** Retire durable locus records, leases, and process-liveness gates; derive each checkout's role from
  the git and ARC state that already owns it, so one checkout's degradation cannot stop healthy work elsewhere.

---

## Introduction / Context

ARC currently persists one machine-local locus record per managed checkout and attaches a process-anchored lease to
the record for a live session. The store joins worktree topology, work-unit metadata, transient identity, ownership
markers, and process liveness into a repository-wide state machine. That model was intended to preserve warm
leave/return continuity and prevent conflicting use of a checkout.

Field behavior shows that the persisted join is the failure source. Correct lifecycle transitions move or retire a
work-unit meta while its locus record remains, so shipped and parked work reads as `subject-unresolved`. Sandboxed
harnesses cannot reliably inspect another process and can therefore report a live transient as dead or an
unverifiable anchor as a repository-wide stop. The mutation, reconciliation, recovery, and cleanup layers then
amplify one local ambiguity across every session in the repository.

The store is also redundant. A missing record can already be reconstructed from the git worktree roster, the
checkout's ownership marker, its exact work-unit meta, and the v3 Errand identity ref. Transient pause and
materialization state comes from the identity ref. Teardown's destructive authority comes from marker provenance
and git facts. The genuinely non-derivable state is limited to the transient's machine-local parent checkout and
partial-Errand capture binding; both share the transient occupancy's lifetime and belong on its checkout marker.

This RFC removes the persisted join. The checkout becomes the locus, and its role is a read-time projection. A
repository-wide roster remains useful for discovery and diagnostics, but no sibling checkout's marker, meta,
lifecycle, topology, or retired locus state can stop entry, handoff, recovery, or exit in the current checkout. The
shared Errand identity ref remains a separate repository-wide authority: an invalid complete basis may still stop an
identity mutation rather than permit a lossy rewrite.

## Goals

- Derive every checkout role from explicit marker, meta, lifecycle-index, identity-ref, and git-topology facts.
- Ensure degraded, stale, missing, or mid-lifecycle sibling checkout state cannot stop work in the entering
  checkout.
- Preserve warm transient leave/return, partial-protection Errands, promotion, handoff, and compaction recovery
  without a durable locus record or process lease.
- Retain the identity ref's version-checked transaction, marker-generation compare-and-swap, provisioning rollback
  receipts, and every git-fact guard on destructive paths.
- Make claim-ending foreign actions require subject-scoped operator confirmation while keeping own-checkout exits
  self-authorizing.
- Remove all record-, lease-, lock-, process-anchor-, recovery-residue-, and reconciliation-only code, contracts,
  commands, workflow prose, tests, and backlog obligations.
- Leave one typed, mechanically checked authority boundary that prevents branch shape or a new occupancy store from
  becoming an implicit role oracle.
- Reduce the locus-driven session-init surface and keep user-facing offers and diagnostics CLI-composed.

## Non-Goals

- Detecting or arbitrating two sessions intentionally opened in one checkout.
- Adding advisory positive-liveness machinery, a resident process, PID persistence, or a replacement lock service.
- Replacing the v3 Errand identity ref, work-unit metas, completed index, ownership marker, or git worktree roster.
- Changing the identity ref's state machine, complete-basis transaction, pause semantics, or materialization model.
- Repairing malformed or same-slug-conflicting entries in the shared identity basis. The provisional
  `identity-conflict-recovery` stub owns that possible recovery path and is promoted only if operational evidence
  shows it earns backlog commitment.
- Redesigning non-locus advisories; their union, vocabulary, and cadence remain the concern of
  `operational-advisory-registers`.
- Implementing the forcing-function portions of `recovery-hardening`; that work follows this retirement against the
  smaller recovery surface.
- Inferring role, ownership, or lifecycle state from a branch prefix or branch existence.
- Adding a storage mode, configuration axis, external-PM authority, or service-only state class.
- Preserving compatibility readers or migrating machine-local development records. ARC is pre-public-release; the
  retired `.internal/loci/` state is cleared rather than migrated.

## Proposed Design

### Authority boundary and failure direction

Create a typed authority/corroboration split across `src/lib/locus/role-derivation.ts` and
`src/lib/locus/role-corroboration.ts`:

```ts
type CheckoutAuthorityTopology = Pick<RegisteredWorktree, "path" | "primary">;
type CheckoutCorroborationTopology = Pick<RegisteredWorktree, "branch" | "head">;

interface CheckoutRoleAuthorityFacts {
  topology: CheckoutAuthorityTopology;
  marker: OwnershipMarkerProjection;
  lifecycle: WorkUnitLifecycleProjection;
  identity: ErrandIdentityProjection;
}
```

`work-unit-lifecycle` means the exact checkout-pinned meta plus the completed index used to distinguish an active
subject from a retired one. The registered-worktree adapter projects `path` and `primary` into the authority facts;
`branch` and `head` enter only `CheckoutCorroborationTopology`. `deriveCheckoutRole(authorityFacts)` cannot receive
branch/HEAD. `corroborateCheckoutRole(derivedRole, corroborationFacts)` must receive an authority-derived role and may
return only that same subject or `unresolved-checkout`; it cannot originate or retarget a subject.

Enforce the split mechanically in three ways: the public types exclude branch/HEAD from authority input; a module
dependency contract prevents the authority builder and `role-derivation.ts` from reading those fields while the
roster adapter passes them only to `role-corroboration.ts`; and a behavioral invariance matrix holds authority facts
constant while varying branch names and HEAD values, proving that corroboration only preserves the exact subject or
downgrades it to unresolved. The contract also asserts that record, lease, and process inputs are absent.

All checkout-role derivations obey one failure rule: an unreadable or contradictory input yields an unresolved
diagnostic for that checkout and the least destructive interpretation. It never invents retirement, proves
availability, authorizes cleanup, or stops another checkout. Repository-wide aggregation can offer or diagnose;
only checkout-derived facts from the current checkout can block a current-checkout operation. Identity-backed
mutations additionally validate the shared identity ref's complete basis; an invalid basis blocks the mutation
because preserving unrelated authoritative entries takes precedence over availability.

### Derived roster

Replace record-first subject projection in `src/lib/locus/reader.ts` and `src/lib/locus/roster.ts` with one pass over
the registered worktree snapshot:

1. Canonicalize the checkout path, project `path`/`primary` into authority topology, retain branch/HEAD separately
   for corroboration, and read the marker generation.
2. Read the exact owner-matching active meta when present. For a marker-named WU with no active meta, consult the
   completed index and classify it as `retired` only when the lifecycle scan positively establishes retirement.
3. Read the exact v3 transient identity snapshot for a marker-named Errand claim.
4. Corroborate the derived subject against the checkout branch and HEAD. A mismatch emits an unresolved diagnostic;
   it never selects a different subject from the branch.
5. Derive the workflow, stage, session type, task cursor, cohort document, and load set through
   `projectCheckoutSubjectMeta` for a resolved WU.

`projectCheckoutSubjectMeta` receives the same active-extension projection used by session init and recovery;
neither path hardcodes an empty extension set. The shared projection is the sole producer of the active WU load set.

The public roster changes in place. Rows no longer expose `recordId`, `lease`, `heartbeatAt`, `establishedAt`, or
record-store failure kinds. The stable row classes are:

- `free-primary` — primary, clean, on configured base, and no transient occupancy marker;
- `work-unit` — exact owner-matching meta and corroborating topology;
- `transient` — exact marker subject plus identity-ref generation agreement for identity-backed Errands, or the
  marker's origin binding for an identity-free partial Errand;
- `retired` — completed-index evidence positively retires the marker/meta subject;
- `unmanaged-checkout` — no ARC role evidence;
- `unresolved-checkout` — present but unreadable or contradictory marker, meta, identity, lifecycle, or topology.

An identity with no local checkout remains an identity-ref discovery projection rather than a fake checkout row.
Materializable and in-flight identity surfaces continue to derive directly from the identity snapshot.

### Unified transient-occupancy marker

Every transient occupancy writes `.arc/system/.internal/worktree-marker.json`, including an Errand using the
physical primary under full or partial protection. Marker absence is therefore a new proof condition for a free
primary; it is not treated as a spelling change for record absence.

The marker keeps spawn provenance and adds an occupancy-bearing union:

- `spawnedByArc: true` means ARC created the linked checkout and may use that provenance in cleanup;
- `spawnedByArc: false` is valid only for a transient occupying the physical primary and grants no worktree-removal
  authority;
- `createdFor` names the exact transient kind, slug, and claim ID while transient occupancy exists;
- `parentCheckoutPath` carries the optional machine-local warm-return parent;
- `originEntry` and `originEntrySourceDigest` are an all-or-none pair for a partial Errand's capture settlement;
- the existing provisioning state and exact marker bytes remain the generation-CAS and rollback boundary.

The marker does not gain `promotedFrom`, promotion staging, or another terminal state. Machine-local parent paths
never enter the synced identity ref.

Primary allocation establishes the marker before changing occupancy-visible state and removes it on rollback.
Spawn allocation retains its pending-to-ready receipt sequence. A crashed session can leave a stale marker; that is
an advisory occupancy fact whose removal requires confirmation, not a new residue state or liveness inference.

On close, abandon, or leave, the terminal transaction removes the transient marker when it restores or vacates the
checkout. On promotion:

- the promoted WU meta is committed with an immutable optional `Promotion Receipt` before the identity is retired;
  its canonical `errand-v1/<slug>/<claim-id>` value binds the new WU to the exact originating Errand generation;
- the identity record remains until inbox settlement succeeds; its existing origin fields are the settlement
  staging, and identity-record removal is the commit;
- a primary transient marker is removed because the primary has no spawn provenance to preserve;
- a spawned marker converts to WU ownership, preserves spawn provenance, and drops transient-only parent and origin
  fields.

During promotion's settlement window, an `open` identity and a WU meta may coexist. The exact marker subject wins
until the identity transaction commits; only then can the WU meta become the derived role. After identity removal,
the `Promotion Receipt` is the durable exact-generation replay authority; marker state supplies only current
checkout ownership and spawn provenance. The receipt is absent from ordinary WUs, cannot be changed or removed by
later meta mutations, and travels unchanged through WU relocation and archival.

### Current-checkout frame and session init

The status probe identifies the entering checkout directly from the worktree snapshot and selects that row. It no
longer projects `current`, `recovery`, or `reconciliation`, and it does not ask a separate attach operation to mint
authority. `primaryAvailability` retains its clean/base git-fact checks and treats the unified primary marker as
occupied.

Delete session-init's attach-and-reprobe arm, record-residue resolution, dead-lock break, and adoption dispatch.
The entering row supplies role and derived context in one read. A malformed sibling contributes only a roster
diagnostic or cleanup advisory. The current row may stop only when its own required facts are unresolved.

The bare `arc locus --json` roster remains as a read-only inspection surface over derived rows. Remove mutation
subcommands `attach`, `release`, and `resolve`. Remove `arc reconcile --attach-session` and every `attachSession`
option passed through start, materialize, park/resume, and graduation. Any owning verb that needs confirmation
exposes that confirmation itself.

### Terminal Errand operations

Close, abandon, leave, partial settle, and promote retain the checks their subject actually owns: identity-backed
Errands retain the identity state machine and version-checked transaction; partial Errands retain their marker
origin binding; every shape retains exact branch/HEAD proofs, marker generation, and idempotent replay. They replace
`selfHeld`/lease authority with this rule:

- cwd resolves to the exact marker/identity subject — proceed without an extra confirmation;
- cwd does not resolve to that subject — return a typed `confirmation-required` result naming the subject,
  evidence, and destructive effect; proceed only through the verb's explicit confirmation option;
- marker, identity, branch, HEAD, or lifecycle evidence disagrees — refuse without treating confirmation as a
  substitute for failed git or generation guards.

The existing `confirmedNoLiveSession` plumbing becomes the common foreign-exit confirmation input, renamed if
needed to describe authority rather than liveness. `arc errand` verbs expose it directly; `arc locus resolve` no
longer acts as a privileged path.

Remove `recordId`, `leaseId`, and `sessionHomePath` from exit results and workflow consumption. A result carries the
subject, exact checkout path when local, parent path when a marker supplies one, identity generation, and the
existing branch/head/capture settlement evidence required by that verb.

Record-outlived-checkout arms collapse into ordinary idempotent replay because no checkout record can outlive its
checkout. `leave` removes the `lease.attachedAt === identity.updatedAt` check; marker/identity claim agreement is the
generation binding. Roster-wide `HEAD.lock` close receipts remain unchanged.

An identity-backed terminal mutation may still refuse when any entry makes the shared identity basis malformed or
same-slug-conflicting. That is a failure of the mutation's authoritative ledger, not a sibling-checkout stop. Keep
the refusal lossless and explicit; confirmation and force flags cannot bypass it. The provisional
`identity-conflict-recovery` stub records the separate evidence-gated operator-recovery concern.

Remove the declared `close --force` option and every recovery message that emits it. It is already refused for v3
and has no surviving semantics.

### Handoff

Derive handoff from the current checkout only:

- one resolved WU meta yields `release-work-unit` context without any release command;
- marker and identity agreement yields `leave-errand`, including the marker-carried parent path;
- neither yields `between-work-units`;
- groom, housekeep, and malformed shapes retain only workflow-specific refusals with a real source; an identity-free
  partial Errand derives from its marker and follows the existing partial-settlement flow. Inert durable role
  vocabulary is removed.

Delete record/lease generation freshness checks, session-home cross-checks, duplicate-record checks, `leaseId`
payloads, and emitted `arc locus release`. Process exit releases no persisted state. Handoff writes user notes and
performs the subject workflow's own settlement only.

### Compaction seed and recovery

The compaction seed retains the active checkout path and, when a transient marker supplies it, the parent checkout
path. Remove `recordId`, `leaseId`, and duplicate `sessionHomePath` hints. The checkout path digest is derivable and
is not persisted as an authority token.

Recovery re-reads the current checkout and derives its frame with the same role/load-set projection as session init.
For a transient, it reads the marker's parent path and re-derives the parent WU frame from that checkout. A missing,
moved, or unreadable parent degrades to `parent not found; return to base`; it never stops recovery. Recovery does
not scan repository-wide residue and succeeds while arbitrary sibling rows are stale, malformed, or mid-lifecycle.

The seed no longer distinguishes two harness sessions in the same checkout with the same role. This is an accepted
cost of removing per-session durable state; harness-owned session-keyed recovery markers remain outside this model.

### Rename and cleanup

Replace `src/lib/work-unit/rename-locus.ts` with a marker-and-git worktree move transaction. It preserves:

- the deterministic operation lock that serializes a physical move;
- the pre-move roster snapshot and post-move path check;
- exact marker-generation compare-and-swap;
- subject/role conflict refusal;
- physical `git worktree move` ordering and rollback behavior;
- deferred rename marker behavior where the existing lifecycle requires it.

Delete the lease-live and lease-unknown refusal reasons. Retain `roster-changed`, `generation-changed`, and
`role-conflict`, re-keyed to topology plus marker generation. Do not sweep sibling markers to rewrite a warm parent
path. A stale parent path follows recovery's non-destructive fallback.

Remove the lease-derived occupancy veto from stale-worktree and orphan-branch sweeps. These remain offer-only and
confirmation-gated. Their retained authorization set is: shipped/retired evidence, clean worktree, exact expected
HEAD, merged/ancestry or remote proof, marker provenance, and lifecycle-location match. `git worktree remove`
continues to refuse a dirty checkout. `locusOwnsBranch` and `locusWorkUnitAtPath` survive against the derived roster;
only `locusOccupancyAtPath` and its `locusState` parameter disappear.

### Retention and deletion inventory

Retain and reshape:

- `src/lib/active/meta-schema.ts`, `meta-reader.ts`, and meta mutation/transition consumers — add the optional,
  immutable `Promotion Receipt` field and its canonical exact-generation parser/rendering;
- `src/lib/git/worktree-marker.ts` — unified primary/spawned occupancy, parent/origin fields, marker CAS;
- `src/lib/locus/role-derivation.ts` and `role-corroboration.ts` — authority-only subject derivation followed by
  preserve-or-unresolve branch/HEAD corroboration;
- `src/lib/locus/reader.ts`, `roster.ts`, `state.ts`, `subject-meta.ts`, and `schema/state.ts` — derived rows,
  registered-worktree fact projection, and current-checkout frame;
- `src/lib/locus/allocator.ts`, `primary-safety.ts`, provisioning receipts, marker provisioning, and rollback;
- `src/lib/locus/schema/identity.ts` and all Errand identity snapshot/transaction/transition modules;
- teardown authority, marker provenance, exact branch/head checks, close `HEAD.lock` receipts, and completed index;
- `handlers/locus.ts` and `commands/locus.ts` only for the read-only roster command.

Delete completely after all consumers move:

- `src/lib/locus/root.ts`, `record-store.ts`, `lock.ts`, `mutation.ts`, `mutation-anchor.ts`,
  `platform-inspectors.ts`, `process-inspector.ts`, and `process-exec.ts`;
- `src/lib/locus/reconciliation.ts`, `resolve-driver.ts`, `selected-generation.ts`, `stop-tier.ts`,
  `entry-boundary.ts`, and record/lease-only trusted-row authority;
- `src/lib/locus/schema/record.ts` and `schema/mutation.ts`; move any surviving identity/path primitives to their
  owning schema module and delete dead exports such as `refreshLocusLeaseHeartbeat`;
- record/lock evidence collection and every record-backed provisional-roster branch in `evidence.ts` and
  `roster.ts`;
- `src/lib/errand/abandon-locus.ts`, `close-locus.ts`, and record-only close/settlement occupancy arms after their
  surviving git/identity logic moves to the owning runtime;
- the record/lease implementation in `src/lib/handoff/locus-plan.ts`; rewrite it as the smaller derived
  checkout-frame plan, or rename it without retaining a compatibility wrapper;
- record/lease-only paths in `src/lib/recover/locus-context.ts`, `recover/audit.ts`, compaction seed schema/emitter,
  status schemas/results, and status handlers;
- `src/lib/session-init/locus-classification.ts`'s occupancy classifier while retaining derived branch/WU helpers;
- `src/lib/work-unit/rename-locus.ts`, replaced by the marker/topology move transaction above;
- CLI registrations and input-policy entries for locus mutation verbs, `reconcile --attach-session`, and
  `errand close --force`.

Update the package-source methodology and sync its self-hosting copy for:

- `session-init.template.md` and `session-init/probe-envelope.md`;
- `session-handoff.template.md` and `session-recover.md`;
- `run-errand.md`, `init-work-unit.md`, `resume-work-unit.md`, and any remaining command reference that consumes
  attach, release, resolve, record, or lease fields;
- `packages/arc-framework/arc/reference/briefs/AGENT-BRIEF.ARC.md` and `.arc/reference/briefs/AGENT-BRIEF.ARC.md` —
  redefine a locus as the checkout plus its derived role and define primary availability by base/clean/marker facts;
- both package and self-hosting copies of `strategy-concurrent-work.md` — remove record/lease vocabulary and the
  false `errand close --force` identity-conflict remedy, replacing it with the fail-closed identity-basis boundary;
- both package and self-hosting copies of `strategy-work-organization.md` — define Main-on-Main availability by
  base/clean/marker facts and rewrite Errand pause/re-entry without roles, leases, dead-lease resolution, or residue.

Delete or rewrite the matching record/lock/process/reconciliation unit suites, locus mutation E2E suites, fixture
builders, and methodology-contract assertions. Retain and expand identity-transaction, marker, teardown-guard,
close-head-lock, provisioning-rollback, status, handoff, recovery, rename, and cleanup-sweep coverage around the new
contracts.

### Delivery and review slices

This remains one WU: every slice implements one retirement and none is independently useful or ownable. It does
not land as one review surface. Task generation must preserve these four ordered, contract-closed slices:

1. **Derived-role foundation (additive).** Add the typed authority boundary, unified marker schema/lifecycle,
   completed-index port, derived reader, and fixture matrix while the record path remains available for unchanged
   consumers. During this internal migration only, allocation writes the unified marker and the existing record so
   new primary and spawned transients are readable by both paths; there is no record fallback in the derived reader.
   No production consumer switches before the derived projection is tested.
2. **Session-frame consumers.** Switch status/session-init, load-set projection, handoff, compaction seed, and
   recovery to the derived current-checkout frame. Remove attach/release emissions from those consumers, but keep
   compatibility implementation until every producer and mutator moves.
3. **Terminal and lifecycle consumers.** Switch Errand exits/promote, primary/spawn allocation, start/materialize/
   park/graduation, rename, teardown, stale-worktree/orphan sweeps, `Promotion Receipt`, and confirmation plumbing.
   Stop minting records, leases, locks, and process anchors.
4. **Substrate retirement and corpus closure.** Delete the store and dead modules, shrink schemas/envelopes/CLI,
   remove stale workflow prose and tests, run mechanical consumer/dead-export/declared-option checks, and destroy
   the killed sibling WUs.

Each slice closes its own declarations and consumers and receives a structured review increment. The final review
adds a seam scope across all four slices and verifies their union covers the complete change set.

### Sibling work-unit disposition

- Destroy `claimed-sweep-verbs` and `locus-generation-binding` in slice 4. Their tracked artifacts are part of this
  change set; `ROADMAP.md` is regenerated rather than hand-edited.
- Keep `recovery-hardening`, remove its dissolved locus-buffer obligation, and sequence it after this WU.
- Leave `recurring-errand-pr-resolution`, `operational-advisory-registers`, and `staleness-guard-policy` in place.
- Keep `identity-conflict-recovery` provisional and off ROADMAP; its draft's observed-need trigger governs whether it
  is ever promoted.
- Route the stale `wu-lifecycle-state-model` coordination pointer through `USER-INBOX`; do not edit the sibling's
  tracked planning artifact from this branch.

## Alternatives & Rationale

### Harden records, leases, and stop attribution

Rejected. Containment, retired-subject repair, and fail-toward-dead correction improve symptoms but preserve the
redundant persisted join that creates invalidation and liveness failures. Four drafting passes overturned the same
region while keeping that premise.

### Keep records and remove only leases

Rejected. Lease removal fixes unverifiable process gates but not the shipped/parked `subject-unresolved` failures.
The remaining record is still a cache of marker, meta, identity, and topology facts.

### Replace process anchors with portable advisory file locks

Not selected now. A kernel-released file lock is the credible future positive-liveness mechanism, but no chartered
goal requires liveness once same-checkout contention is treated as operator-scheduled. Adding it would prepay for a
hypothetical advisory.

### Derive roles from branch names

Rejected. It recreates the pre-locus ambiguity, conflicts with multi-WU/branch-independent identity, and violates
the storage-evolution boundary. Branch remains corroboration only.

### Split the retirement into multiple WUs

Rejected. The reader, session consumers, terminal consumers, and deletion are ordered migration surfaces of one
decision. None has a stable independent purpose; separate WUs would multiply compatibility states and coordination
without independent ownership. Four review slices provide bounded attention without fabricating concern boundaries.

## Cross-cutting Considerations

### Trust and destructive behavior

Confirmation grants authority only for a named foreign terminal act. It never overrides dirty-tree, exact-head,
marker-generation, identity-generation, ancestry, lifecycle-location, or branch-preservation failures. Unreadable
state always resolves away from cleanup. The identity ref remains the only shared multi-writer surface and retains
its complete-basis, version-checked transaction. Consequently, malformed or conflicting identity-basis state may
block unrelated identity mutations; no checkout-level containment claim weakens that fail-closed boundary.

### Performance

The derived reader performs bounded reads over the existing git worktree snapshot, markers, exact subject metas,
completed index, and one identity snapshot. It removes filesystem scans of `.internal/loci/`, record/lock reads,
and process inspection. Subject/meta and identity reads are shared within one probe rather than repeated per
consumer.

### Compatibility and rollout

The project is pre-public-release. Public JSON and workflow contracts change in place; no aliases, record migration,
or dual-version reader ships. Implementation slices may temporarily keep old code reachable for internal buildable
transitions, but the final state has no compatibility surface. Existing machine-local locus directories are safe to
delete after the new reader no longer consumes them.

### Storage and procedure evolution

The marker is checkout-ephemeral machine-local state, not a canonical WU record or backing-store class. The design
preserves version-checked shared writes and keeps WU identity independent of branches. `Promotion Receipt` is an
ARC-owned, immutable execution-provenance fact needed for standalone promotion replay; it is not a portfolio fact,
has no external-provider mapping, and is neither copied from nor synchronized to `Origin` or a tracker. Deterministic
derivation and prompt composition stay CLI-side; workflows dispatch on typed results and lose dead control-flow
arms. No new agent-interpreted markup or storage-mode branch is introduced.

### Project alignment

Checked against the _Operational friction down, judgment friction up_ principle — passes. Deterministic role
projection becomes CLI code, while subject-scoped friction remains only where a foreign terminal act needs operator
authority. The scope is lifecycle and CLI tooling and introduces none of the PROJECT-PRD's excluded concerns.

Checked against § 2 Architecture Components — CLI Package — passes. The design keeps contract and derivation logic
in the TypeScript library/schema layer, orchestration in commands/handlers, and user rendering in the CLI boundary.
It introduces no new language, framework, dependency, infrastructure, or deployment surface.

### Verification strategy

Required fixtures cover:

- active WU, parked WU, positively retired WU, and unreadable lifecycle index;
- spawned Errand, primary full-protection Errand, primary partial-protection Errand, and warm Errand with a linked
  parent;
- marker/meta, marker/identity, branch, and HEAD disagreement;
- branch/HEAD invariance across authority-identical fixtures: corroboration preserves the exact derived subject or
  returns unresolved, and never originates or retargets one;
- stale or missing parent path with recovery-to-base fallback;
- arbitrary malformed sibling checkout rows during entry, handoff, recovery, and checkout-local exit, alongside a
  separate assertion that malformed or conflicting shared identity bases fail identity mutations closed;
- own-checkout versus foreign-checkout terminal authority and confirmation;
- promotion settlement before/after identity removal, immutable receipt parsing and retention, exact-generation
  lost-response replay, and primary versus spawned conversion;
- rename roster/marker generation races and retained refusal reasons;
- cleanup offers with no lease veto while every retained destructive guard still applies.

Mechanical closure uses four independent checks: a dead-export/import sweep, an envelope/workflow consumer trace, a
declared-CLI-option-to-live-body check, and an adopter-doctrine/command-example contract check across the shipped
locus corpus. The doctrine check covers at least the brief, concurrent-work strategy, and work-organization strategy
and rejects retired durable-role, record-free-primary, lease/dead-lease/residue, and `errand close --force`
guidance. The option check is required because export and consumer scans cannot detect a Commander option whose
handler refuses or ignores it. Package/self-hosting sync and the full relevant quality-gate suite close the final
slice.

## Success Criteria

1. Entry, handoff, recovery, and checkout-derived exit for a healthy checkout complete while any sibling checkout is
   absent, stale, malformed, retired, or mid-lifecycle; sibling checkout facts can diagnose or offer but cannot stop
   those operations. Shared identity-basis invalidity remains an explicit fail-closed boundary for identity
   mutations.
2. With a valid shared identity basis, a sandboxed session can enter, work, hand off, recover, and exit without
   process inspection or hand-editing machine state, and own-checkout terminal operations add no confirmation
   prompt.
3. Shipping, parking, archiving, and husk removal create no record residue or corruption-vocabulary diagnostic.
4. Every destructive path retains its git, marker, identity, ancestry, lifecycle, and exact-generation guards;
   foreign terminal authority is confirmation-gated and confirmation cannot override a failed guard.
5. Role derivation accepts only typed authority facts; branch/HEAD enter a separate corroborator that can preserve
   the exact derived subject or degrade it to a non-destructive unresolved result, never originate or retarget one.
6. Handoff and recovery derive from the current checkout, preserve the warm-parent case, and recover to base when a
   recorded parent path no longer resolves.
7. No record store, lease, record lock, process anchor, liveness inspector, attach/release/resolve mutation verb,
   reconcile-attach surface, dead workflow arm, unread envelope field, or body-less CLI option remains.
8. `claimed-sweep-verbs` and `locus-generation-binding` are destroyed in the tracked change set; surviving sibling
   WUs carry the revised dependency/coordination posture; and `identity-conflict-recovery` remains a provisional,
   evidence-gated stub rather than a sequenced commitment.
9. Locus-driven session-init prose and schema surface shrink in net lines; the shipped brief, concurrent-work
   strategy, and work-organization strategy describe the derived-role model without retired record/lease doctrine
   or `errand close --force`; and all user-facing offers or diagnostics remain precomposed by the CLI.
10. Authority-input, dependency-boundary, and branch/HEAD-invariance contracts fail if a durable occupancy record,
    process-liveness source, or branch-shape oracle enters role derivation.
11. The four delivery slices are independently reviewable, their union covers every changed file and hunk, and a
    final seam review validates the cross-slice contracts.

## Open Questions

None. Internal module partitioning may change during task generation only where it preserves the named ownership,
authority, migration-slice, and deletion boundaries above.
