# Cohort: `state-storage`

> _Identity and coordination record for this cohort. Membership is **derived** from each member's `Cohort`
> field — recorded here only as shared coordination, never as a roster or status table._

**Purpose:** Move ARC's operational and planning state off tracked branch files and Git notes into same-repository
`refs/arc/*`, behind one storage contract with pluggable backends (ADR-035). The members share one design core —
the contract and its map of every consumer — and one serialized cutover. The cohort is done when nothing in ARC is
still shaped by state living in code history: the storage-coupling register below is its "it's all handled" line.

---

## Coordination

```text
Stage 1  storage-contract          design core; ships the contract over today's tracked layout
Stage 2  storage-seam              every reader and writer through the contract; after storage-contract lands
         storage-ref-backend       the refs/arc/* store, user sync onto it, import, fetch-refspec install
         storage-projection        the working copy
Stage 3  storage-cutover           rehearse, quiesce, import, flip, retire notes; then deletion and documentation
```

Each member's `Depends On` edges are the source of truth. Two orderings are not edges:

- **Design overlaps.** `storage-ref-backend` and `storage-projection` may design alongside `storage-contract` once
  its draft settles the decisions they share — ref layout, each surface's concurrency mechanism, and the
  projection's caller-visible behavior — and may implement once its spec is approved. A `Depends On` edge clears
  only when the dependency ships, so this is recorded here rather than as an edge. Only `storage-seam` needs the
  contract landed.
- **The seam decomposes.** When `storage-contract`'s planning closes, `storage-seam` decomposes against its consumer
  map into members that inherit that map rather than redesigning their subsystem — likely lifecycle and in-flight,
  delivery, review and evidence, locus and session-init, and status and roadmap, run in parallel. It is the
  decomposition machinery's first heavy field use since its corrective work; `decomposition-doctrine` is still in
  planning.

After the cutover, deletion passes, documentation, `naming-conventions`, `wu-lifecycle-state-model`'s front half,
and the follow-ons all run in parallel. The follow-ons are standalone work units, each tagged core or deferred by
`storage-contract`:

- history policy on (`history.policy: rewrite-with-lease` by default), branchless planning, and the
  backing-repository backend — not yet stubbed;
- the records engine — `operational-state-docs`;
- framework core from the package — `framework-core-from-package`;
- delivery re-scoped toward observe-and-attest — `delivery-observe-attest`;
- the status HUD — `status-hud`, which reads records through the oracle and so carries no edge on the program.

### Shared contracts

- **The storage contract** — its interface, record model, ref layout, and each shared surface's concurrency
  mechanism: owned by `storage-contract`; consumed by every other member.
- **The consumer map:** owned by `storage-contract`; the design core `storage-seam` decomposes against.
- **The projection's caller-visible behavior:** defined by `storage-contract`, built by `storage-projection`, and
  read through by `storage-seam`'s rerouted readers.
- **The import:** built by `storage-ref-backend`; run by `storage-cutover`.

### Soft coordination

- **Landing.** Every program work unit lands single-branch with chunked review until the program completes. A work
  unit may project its review chunks as stacked draft pull requests for host-visible review: branch k carries the
  base plus the work unit's diff for chunks 1 through k and opens against branch k−1, and the top branch's tree
  equals the work-unit head. The projections are rebuilt after fixes and closed when the one real pull request
  merges. Their reviews are attention rather than ARC evidence, so the real pull request's standard review closes by
  the Owner-directed stop.
- **Pull-forward filter.** Delivery and review work runs ahead of the seam only as Errands that tax every program
  landing, add no stored record or record shape, and land before the seam starts. No delivery or review work unit is
  pulled forward.
- **Core or deferred.** `storage-contract` tags every program item. 1.0 ships the complete core for solo developers
  through mid-size teams; larger scale is deferred and never precluded.
- **Import scope.** Under the pre-public-release posture, the import may be a one-off tool for this repository and
  CineXplorer rather than a shipped `arc migrate`; `storage-ref-backend` decides.

### Cross-cohort

- **Never alongside the seam:** `cli-substrate-complete-migration`, which must land before `storage-seam` starts
  (an edge); `naming-conventions`, which follows the cutover (an edge); and anything that edits the lifecycle write
  path, `review-checkout-lifecycle` and `stub-mint-to-launch` among it.
- **`configuration`:** `config-storage-architecture` co-designs with `storage-contract` — its per-machine `.local/`
  tier is the local-only overlay the backends need — and depends on it. Its notes-sync piece is throwaway.
- **`agent-context-optimization`:** the session-init agenda (`composable-workflows` and its siblings) changes how
  session-init's result reaches the agent, while the seam changes what session-init reads. Decided by the Owner
  (2026-09-28): it stays in its own cohort and is sequenced, not folded in. Its design does not depend on the seam
  and waits by choice until more of the program is underway; implement it after the seam's locus and session-init
  work lands.
- **`review-protocol-alignment`:** the Owner-accepted terminus's only store, the integration boundary files, is
  tracked, so its durable form is designed against the contract alongside the seam's review and evidence work.
- **`chunked-delivery`:** `delivery-rebuild-continuity` is held at Planning with no lifecycle action; the cutover
  imports its artifacts from its plan branch, and its D4 and D6 are re-scoped afterward.
  `delivery-correction-convergence` waits on the cutover.
- **`wu-lifecycle-state-model`:** its placement-as-record half moved into `storage-seam`; its front half waits on
  the cutover.
- **Standalone stubs that shrank:** `roadmap-tooling`'s staging, conflict, and regeneration entries moved to
  `storage-seam`, on which it now depends; `shared-inbox-model` keeps the inbox model and waits on the cutover.

### Closeout criteria

Every member has shipped and the storage-coupling register has no open row. A row closes when its fate is realized,
or, for a follow-on, when the owning follow-on work unit's draft holds the item.

## Storage-coupling register

Every mechanism, workaround, or assumption shaped by state living in tracked files or Git notes, with the member or
stub whose draft holds it and its fate: removed at cutover, rewritten, follow-on, or stays and why. The re-cut seeded
the known rows; `storage-contract`'s draft-design completes the sweep.

| Mechanism                                                                                                                                                                                                                                                                                                        | Owner                                                  | Fate                                                                                                                                                                                                                                   | State  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Candidate and transition records tracked under `.arc/system/.internal/` (24 and 11 files at seeding); Candidate records are never retired at archive, and a withdrawal is inferred from surviving topology rather than recorded                                                                                  | `storage-seam`                                         | Rewritten: the records move to the store, and their retirement and withdrawal become store facts                                                                                                                                       | open   |
| `candidate-response-confirmation.ts:107` reads a Candidate record out of Git history                                                                                                                                                                                                                             | `storage-seam`                                         | Rewritten: records leave code history                                                                                                                                                                                                  | open   |
| Stacked delivery's terminal top: the work-unit branch carries lifecycle artifacts, stays outside provider mutation, and absorbs predecessor movement append-only (`refresh.ts:94`)                                                                                                                               | `delivery-observe-attest`                              | Follow-on: dissolves once state is off-branch and the history policy allows a lease-guarded rewrite                                                                                                                                    | closed |
| The append-only rebase invariant (`DEV-RULES.ARC` § Commit Discipline), justified by SHA-keyed notes                                                                                                                                                                                                             | `storage-cutover`                                      | Rewritten: defers to `history.policy` once the cutover retires notes (ADR-025 note)                                                                                                                                                    | open   |
| Workflows, extensions, overrides, scripts, and ARC's own lint and contract checks read state through Git history or the pull-request diff                                                                                                                                                                        | `storage-seam`                                         | Rewritten: they read by projected path or through an `arc` command, and checks run where state is written                                                                                                                              | open   |
| Archival by `git mv`, the archive index (`completed-index.ts`), and the relocatability rule for movable artifacts                                                                                                                                                                                                | `storage-seam`                                         | Rewritten: archival becomes a store operation; `storage-cutover`'s documentation pass rewrites the rule                                                                                                                                | open   |
| The auto-merge lane's planning classification by tracked artifact prefix: `isPlanningArtifactPath` and `classifyPlanningLane` in `change-facts.ts`, `classify-change.sh`'s lane paths, the lane-attestation workflow, `arc review planning-lane`, and the planning-grooming command                              | `storage-cutover`                                      | Removed at cutover; the rest of `change-facts.ts` survives                                                                                                                                                                             | open   |
| `archive.cadence: manual`, the two-PR landing bridge, and the checkpoint workarounds in `WORKING-MEMORY`                                                                                                                                                                                                         | `storage-cutover`                                      | Removed at cutover                                                                                                                                                                                                                     | open   |
| Review projections: per-chunk stacked draft pull requests beside a single-branch landing                                                                                                                                                                                                                         | `delivery-observe-attest`                              | Follow-on: retires when stacked delivery returns                                                                                                                                                                                       | closed |
| `session-init-performance`'s notes probes and repeated Git discovery work                                                                                                                                                                                                                                        | `session-init-performance`                             | Rewritten: the notes items go with the seam's locus and session-init reads                                                                                                                                                             | open   |
| Residue: `refs/notes/test`, `refs/notes/tmp-remote-andrew*`, and the `spike/delivery-rebuild-continuity-model` branch                                                                                                                                                                                            | `storage-cutover`                                      | Removed at cutover, after the held delivery work unit's artifacts are imported                                                                                                                                                         | open   |
| Lifecycle state encoded in directory placement (`backlog/{provisional,planned}`, `active/`, `completed/`) and read by 55 code files; a parked work unit's state is derived from it                                                                                                                               | `storage-seam`                                         | Rewritten: lifecycle becomes a record field, and placement a projection of it                                                                                                                                                          | open   |
| Surviving code builds work-unit state paths itself: 36 hand-built lines in 19 files, and 12 layout-resolver calls with a work-unit kind in 8 files (counted at `7ddab4979`)                                                                                                                                      | `storage-seam`                                         | Rewritten: callers ask the contract, and its in-repo implementation and the projection resolve paths through `resolveArcPath`, the one layout authority                                                                                | open   |
| Lifecycle read from branch refs: a lingering `feat/` or `plan/` ref outranks the archived record, and `plan/` branches outlive their work unit with no verb that reaps them                                                                                                                                      | `storage-seam`                                         | Rewritten: in-flight derivation reads the store, and `plan/<slug>` becomes a local-only anchor until branchless planning                                                                                                               | open   |
| Archive before merge under `archive.cadence: with-integration`: the meta reaches `completed/` on the branch before merge, leaving an interval no locus frame recognizes                                                                                                                                          | `storage-seam`                                         | Rewritten: archival becomes a store operation at or after merge                                                                                                                                                                        | open   |
| Retirement writes tracked changes — a receipt under `.arc/.internal/retirement-receipts/` and artifact deletions — that reach base only through a pull request, so teardown cannot read the receipt and a batch cannot stage two retirements                                                                     | `storage-seam`                                         | Rewritten: retirement becomes a store write                                                                                                                                                                                            | open   |
| The per-work-unit user workspace — review records and `SESSION-NOTES` — is swept at archive with only a notes snapshot behind it                                                                                                                                                                                 | `storage-seam`                                         | Rewritten: the contract decides whether review evidence is a stored record, and user sync moves onto the store                                                                                                                         | open   |
| `ROADMAP.md` carried on every branch: staging by lifecycle verbs, merge conflicts, the conflict remedy and merge driver, the HEAD-pinned render stamp, and in-flight rows sourced from remote refs                                                                                                               | `storage-seam`                                         | Removed as a stored file, and its rendering rewritten to read the store; `roadmap-tooling` keeps the render standard                                                                                                                   | open   |
| The tracked `ATOMIC-INBOX` as a multi-writer hotspot, held empty by a promotion ban in `WORKING-MEMORY`                                                                                                                                                                                                          | `shared-inbox-model`                                   | Rewritten: the project inbox becomes a store surface with entry-granular writes; the ban lifts on that                                                                                                                                 | open   |
| Inbox-to-stub routing moves an entry from a notes-backed source to a tracked destination with no primitive binding the two                                                                                                                                                                                       | `shared-inbox-model`                                   | Rewritten: both ends become store records, and the move is designed against the contract's concurrency                                                                                                                                 | open   |
| `config.user.yml` syncs through user notes                                                                                                                                                                                                                                                                       | `config-storage-architecture`                          | Rewritten: user configuration syncs through the store                                                                                                                                                                                  | open   |
| ADR-022's record-authoritative model — markdown rendered from the record, one editable region reconciled back — and the notes-synced managed documents                                                                                                                                                           | `operational-state-docs`                               | Follow-on: file-as-record (Owner, 2026-09-25), with the ADR-022 amendment                                                                                                                                                              | closed |
| Notes-specific sync: the notes machinery in `lib/user-sync/`, the `commands/user/` push, fetch, compaction, and sync-status family, `handlers/user-sync.ts` with its command registrations, and the notes portions of the user and sync handlers and `lib/io-context.ts`                                         | `storage-cutover`                                      | Removed at cutover; the cross-work-unit entry parser, the inbox writer and execution offers, and `resolveCurrentWuName` survive, and the Git failure-text predicates and `resolveGitCommonDir` survive by moving into `lib/git/` first | open   |
| Branch-tree readers: `project-view-ref.ts`, the Git retirement-authorization and transition-record readers, the ref-reading parts of in-flight derivation, the remote-ref reader, the archive index, and session-init's base-archive sweeps, and base drift's read of `completed/` from base history             | `storage-cutover`                                      | Removed at cutover, once their surviving consumers read the store; `branchToWorkUnitSlug` and the remote reader's network timeout and live tip read survive                                                                            | open   |
| Lifecycle classification and exclusion: `path-treatment.ts`, `lifecycle-contribution.ts` with its Git variant, and the evidence-neutral and regenerable arms                                                                                                                                                     | `storage-cutover`                                      | Removed at cutover, once its surviving consumers — Candidate evidence, base-drift overlap, and six delivery and review modules — move off it                                                                                           | open   |
| Lifecycle hook checks: `validate-meta-spec`, `validate-cohort-consistency`, `assert-roadmap-regenerated` with `roadmap-regeneration-assert.ts`, `check-foreign-writes`, `remedy-roadmap-conflict`, and the pre-commit hook's contributor-protected-path, task-list modification, and ROADMAP render-field checks | `storage-cutover`                                      | Removed at cutover, except content rules that move into a record-family parser (`storage-seam`)                                                                                                                                        | open   |
| In-flight derivation, and the in-flight oracle behind the `WorkUnitStateResult` and `ErrandStateResult` session-init slots                                                                                                                                                                                       | `storage-seam`                                         | Rewritten: reads the store, and each rebuilt slot gets its full schema                                                                                                                                                                 | open   |
| The lifecycle executor's write path and `arc start` placement, with the `provisional-placement` callers                                                                                                                                                                                                          | `storage-seam`                                         | Rewritten: lifecycle transitions write store records                                                                                                                                                                                   | open   |
| The notes-related session-init probes, the `UserSessionInitStatusResult` slot, and user-reference reconciliation (`user-reference-reconcile.ts`, the `userReferenceReconcile` slot)                                                                                                                              | `storage-seam`                                         | Rewritten: session-init reads user state from the store, and each rebuilt slot gets its full schema                                                                                                                                    | open   |
| The `currentWuReconcile` and `StaleWorktreeSweepResult` session-init slots, built over the lifecycle index, transition records, the archive index's ref readers, the retirement-authorization context, and locus classification                                                                                  | `storage-seam`                                         | Rewritten: each reads the store, and each rebuilt slot gets its full schema                                                                                                                                                            | open   |
| Locus derivation (`DerivedLocusFrame`) from the checkout marker and branch topology                                                                                                                                                                                                                              | `storage-seam`                                         | Rewritten: from the marker plus the store, with the slot's full schema                                                                                                                                                                 | open   |
| A singleton's own record writes stale its publication boundary; without an Owner-accepted terminus, a shipped work unit lands on `resume-pre-publication` with no continuation                                                                                                                                   | `storage-seam`                                         | Rewritten: records leave the branch, so a work unit's own writes stop moving its head                                                                                                                                                  | open   |
| Correction convergence's record-only effects: committed record bytes move heads, reopen evidence, and add ceremony                                                                                                                                                                                               | `delivery-correction-convergence`                      | Rewritten: most dissolve once records leave the branch; re-scoped at its next planning iteration                                                                                                                                       | open   |
| Delivery's construction machinery: private per-member candidate namespaces with separate lifecycle contracts, a duplicated top absorption, and a rematerialize verb bound to the public member                                                                                                                   | `delivery-observe-attest`                              | Follow-on: deleted with the substrate or shrunk to observation (build-versus-compose analysis § 9.3)                                                                                                                                   | closed |
| The user-notes sync modules that `user-sync-module-split` and `sync-handler-decomposition` plan to split                                                                                                                                                                                                         | `user-sync-module-split`, `sync-handler-decomposition` | Re-scope: the notes-specific sync is removed at cutover, so split only what survives it                                                                                                                                                | open   |
| Squashing planning commits at graduation orphans their SHA-keyed user notes                                                                                                                                                                                                                                      | `graduation-cleanup`                                   | Re-scope or retire: after cutover no planning commits land on the branch, and notes retire                                                                                                                                             | open   |
| The notes lock serializes one machine only, and `git notes add` writes with no old-value protection                                                                                                                                                                                                              | `sync-primitive-discipline`                            | Removed at cutover: user sync moves onto the store's compare-and-swap writes; re-scope the primitive contract                                                                                                                          | open   |
| `VECTOR.USER` is notes-backed, and `VECTOR.PROJECT` takes base-branch writes                                                                                                                                                                                                                                     | `goal-aware-direction`                                 | Rewritten: both become store surfaces                                                                                                                                                                                                  | open   |
| Handoff routes base and notes sync to the primary, and its triggers key on `refs/notes/` refs                                                                                                                                                                                                                    | `handoff-optimization`                                 | Rewritten: handoff syncs the store                                                                                                                                                                                                     | open   |
| Deferring commits to a parent boundary is argued against partly because notes sync needs commits to attach to                                                                                                                                                                                                    | `commit-increments`                                    | Rewritten: store sync needs no code commit, so that part of the argument falls away                                                                                                                                                    | open   |
| User notes sync through the code remote, so a public repository publishes them (`public-repo-flip`'s first gate)                                                                                                                                                                                                 | `public-repo-flip`                                     | Stays: the default backend gives no privacy on a public repository (ADR-035); the flip waits on the backing-repository backend or the local-only one                                                                                   | open   |
| The rebrand's namespace inventory keeps `refs/notes/arc/user/`                                                                                                                                                                                                                                                   | `arcd-rebrand`                                         | Rewritten: the inventory takes `refs/arc/*` instead                                                                                                                                                                                    | open   |

## Members

### `storage-contract`

_Exposes:_ the contract, its first implementation over today's tracked layout, the consumer map, the core-or-deferred
tags, and the completed register.

### `storage-seam`

_Exposes:_ every ARC reader and writer of operational and planning state routed through the contract.

_Consumes:_ the landed contract and its consumer map; `cli-substrate-complete-migration` landed first.

### `storage-ref-backend`

_Exposes:_ the `refs/arc/*` backend, user sync moved onto it, the import, and fetch-refspec installation.

_Consumes:_ the contract's approved interface, ref layout, and concurrency mechanisms.

### `storage-projection`

_Exposes:_ the working copy at the familiar `.arc/` paths.

_Consumes:_ the contract's approved interface and the projection behavior it defines.

### `storage-cutover`

_Exposes:_ the flipped repository — notes retired, state in the store — then the deletion passes and documentation.

_Consumes:_ every other member, landed.

## ADR anchors

- `adr-035-keep-operational-state-in-repository-refs.md` — the direction: one contract, pluggable backends,
  same-repository refs by default, a projection as the working copy, notes retired.
- `adr-025-concurrent-work-by-convention.md` — its append-only invariant gives way to the history policy at cutover.
- `adr-012-adopt-unified-user-directory-model.md` — its Part 3, user-directory portability through Git notes, is
  superseded by ADR-035 and retired at the cutover.
- `adr-022-managed-operational-state-documents.md` — the managed-document model; `operational-state-docs` carries
  its file-as-record amendment.

---
