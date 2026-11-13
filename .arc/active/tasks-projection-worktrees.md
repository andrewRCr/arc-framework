# Task List: Projection Worktrees

- **Design:** `spec-projection-worktrees.md`

---

## **Phase 1:** Refresh, fan-out, and materialization

_Purpose:_ Keep every worktree's copy current — at each command's start, at a writer's fan-out, and in a full
materialization — at a cost that grows with what changed.

_Mode:_ `slice` — closes on the working copy end to end across worktrees: an edit in one reaches the store and every
sibling's copy, and a new worktree projects its layout.

_Exit criterion:_ Over the reference backend with real worktrees, a worktree marked for a work unit materializes the
layout the isolation test asserts; an edit in one worktree reaches every sibling's copy at the writer's fan-out, and a
pull's merges fan out; a deleted file returns at `arc sync`; a state version that no longer resolves rebuilds the
worktree; over the ref backend, twenty worktrees saving into refreshes, fan-outs, and file removals lose no save, a copy
whose path moved on kept and reported; and at this repository's size the no-change overhead, a full materialization, and
a one-file fan-out of a record that is not a primary each stay within their bounds, and a ten-file fan-out within its
bound but on Windows, where § 15.4 expects it to reach the bound, each Windows median read as Success Criterion 4 reads
it.

_Amended in:_ 1.12.R (A4)

_Design decisions:_ This list is the third of three members' that build one design (spec § 1.1, § 1.3), over
`projection-substrate`'s engine and `projection-write-back`'s write path, both on base
(`notes-projection-worktrees.md` § Grounding basis); tests run as theirs do (§ 1.5). The rebuild
on `state-unresolvable` (1.6.b) and the fan-out of `pull` and `push` (1.7) rest on the store's `pull`, `push`, and that
refusal (`Store`, `lib/store/contract.ts`), and the timing suite (1.12.a) and the multi-process lane (1.13) on
`createRefStore` (`lib/store/create.ts`) and the `ARC_STORE_BURSTS` gate. The lane's bursts into a removal's persist
step wait for that step, in Phase 2 (2.7). Fan-out wraps only the store `createStore` returns; a move or an import that
bypasses it is caught at each worktree's next command start, since that start refreshes from the index's state version.
The index's partitions (1.2) and protection's shared reads (1.4) come before materialization, refresh, and fan-out,
which read through both (`notes-projection-worktrees.md` § Spike 3, § Spike 4). The tasks review as spec § 1.3's chunks:
1.1–1.3 and 1.4.a the first; 1.4.b and 1.5–1.11 the second; 1.12 and 1.13 the third; and Phase 2 the fourth. Each chunk
lands with tests of its own code that need no later chunk's, and a test that also needs a later chunk's code lands with
that chunk.

### `[x]` **1.1 Decide which checkouts hold a projection — § 2.5**

- _Goal:_ A worktree holds a projection when it holds an index, and gets one only when it is the primary or its
  work-unit marker names a work unit or a transient claim — an `arc start --here` checkout included — so ARC's machinery
  checkouts and unclaimed worktrees run with the projection off.

- _Outcome:_ Command entry reads projection eligibility from the primary flag and decoded marker ownership before
  walking projected files. Existing indexes remain readable in unclaimed checkouts; only work-unit and ready transient
  claims gain a missing projection, with husks and machinery excluded.

### `[x]` **1.2 The index's header and partitions — § 3.1, § 16.2**

- _Goal:_ A command reads and writes only the index partitions holding the entries it touches, so its index cost follows
  the roots it walks rather than the archive, and a write that stops anywhere leaves the last whole index or one the
  next start rebuilds, never a mix.

    - `[x]` **1.2.R Preserve racy installed stats across partition publications — A1**

        - _Goal:_ Implement A1 so a same-tick save to a staged file remains detectable after an unrelated partition
          advances the shared reference, without reading or rewriting the saved file's partition.

        - _Outcome:_ Partition publication smudges staged stats as well as observed stats; swap and fixture callers
          carry no exemption. Copy-mark-only writes preserve the current reference, and an unrelated partition's
          publication leaves an installing file's same-tick save detectable without loading its group.

- _Outcome:_ The format-2 header commits content-addressed root partitions with lazy path reads and independent
  updates. Scans load their explicit groups, lock-free readers retry a moved header, and late mismatches invalidate
  only the command's own partition under its lease. Interrupted publications retain the old header; later writes
  collect obsolete partitions, including a previously held file. Path lookups ignore inherited descriptor names.

### `[x]` **1.3 Bind a projection root for any worktree, reading through one source — § 2.1, § 14**

- _Goal:_ Refresh, fan-out, materialization, and the persist and release steps each act on a worktree through one root
  binding — its location, claim, effective `layout.active`, view, `history` memo, and a take-in under that worktree's
  own rights — reading records through one source interface, so a sibling's edit is taken in under the sibling's rights
  and a second source plugs in without changing the engine.

- _Outcome:_ `bindProjectionRoot` binds arbitrary checkouts with fresh target-local capture and rights, supplied actor
  and history, and optional process registration. Read-only bindings prepare sealed admissions without sending or
  creating machine IDs. Held roots refresh their layout in place; moves drop and report the stale binding. Actors use
  the located common directory once per identity and command, retaining legacy candidates; renderers accept source
  reads with writable history, through the `ProjectionSource` seam.

### `[x]` **1.4 Read protection once per round — § 16.3, § 2.2, § 15.5**

- _Goal:_ A file's protection costs nothing per worktree but the claim of a worktree whose marker names the file's own
  work unit: rights answer another work unit's checkout protected without reading its claim, and a refresh's renders
  read the owner's meta and the holding checkout through evidence the refresh shares, while the take-in's rights and the
  refusal behind a notice still observe the current place.

    - `[x]` **1.4.a Rights read only the file's own work unit's claim**

        - Live and captured rights reject unrelated marker owners before claim lookup, sharing lifecycle's UID-first
          current/former-name predicate. Own broken and unbound claims retain their refusals and recovery routes.

    - `[x]` **1.4.b A refresh's protection over its own evidence**

        - Rendering uses source-owned meta and inventory reads, a per-round read memo, and shared lazy roster and
          marker observations. Holder and markerless searches retain their validation; take-ins observe fresh evidence,
          including the current holder after a move. Unbound-marker classification uses the source inventory.

### `[x]` **1.5 Materialize a worktree in full, and rebuild one with no usable index — § 2.5, § 3.1**

- _Goal:_ A worktree with no projection gets every record written under the replace guard and adoption rules, and one
  whose index it cannot use is rebuilt writing over no file that might hold an edit, withholding and reporting each.

- _Amended in:_ 1.6.R (A2)

- _Amended in:_ review-fix (A7)

- _Outcome:_ Full inventories render canonical lifecycle and personal paths, cohort copies, and Errand descriptions
  through shared protection evidence. First commands rebuild missing or unusable indexes, retaining edits and aside
  copies as withheld until deletion; their changed marks remain until save. Spawn hooks materialize under the target's
  configuration and lease, preserving copy bookkeeping across repeated bindings. Guard records survive and failures
  report without failing the spawn. The tracked npm policy reaches future worktrees; the checkout and clone inventory
  found no installer copies to remove.

### `[x]` **1.6 Refresh from the store's changes — § 15.2**

- _Goal:_ Each command's start brings its worktree up from the state version its index last projected, rewriting only
  the records `changes` names and the files marked pending, moving every file a primary record's change relocates, and
  rebuilding when that state version no longer resolves.

- _Amended in:_ review-fix (A7)

    - `[x]` **1.6.R Retain ownership during path reuse — A2**

        - _Goal:_ Implement A2's durable ownership handoff so an arriving record remains retryable and a save timed into
          path reuse or its recovery is never sent to the other record.
        - Added the non-nested arriving-entry journal and shared installer/reconciler. Leaving authority survives
          interrupted links, late saves, and staging cleanup; fresh take-in refuses journals and selection omits them.
          Reprojection publishes its retry flag before moving files and acknowledges the whole target only after
          desired arrivals are confirmed, including claim-only A → B → A retries.

    - `[x]` **1.6.a Reducing `changes`**

        - Added a root-local refresh over the caller's held index, with owner and conflict reduction, guarded re-lays,
          pending removals, moved changed marks, and live admission beside memoized rendering reads. The start retains
          sweep and write-back observations through its first refresh publication and its final no-change write.

    - `[x]` **1.6.b A state version that no longer resolves**

        - Rebuilds every persisted partition from current inventory on an unavailable state window, without fetching
          history. Complete or absent listings authorize removal; missed, diagnosed, and unreadable listings preserve
          their files and retain the anchor for repair and retry.

- _Outcome:_ Command entry now carries one held index from sweep through write-back, reprojection, refresh, and final
  publication. Pending removals and ownership transfers retry without a new store write. Captured writes from renamed
  owners retain their historical basis while atomic admission observes the current canonical owner name.

### `[x]` **1.7 Fan out from the store `createStore` builds — § 2.2, § 1.2**

- _Goal:_ Once a write or a pull's merges land, the writer brings every worktree on the machine that holds a projection
  up from that worktree's own state version, taking each one's projection lock in turn — and whatever fan-out misses,
  the next command's start refreshes.

- _Amended in:_ review-fix (A7)

    - `[x]` **1.7.a The wrapper**

        - Added an invocation-bound, clone-scoped store facade, deferred rounds through a common projection-lock
          wrapper, and scaffold holds through marker binding. Start and history-pull work flushes after release;
          command end disposes notification authority and drops its deferred work. In-repo stores remain inert.

    - `[x]` **1.7.b One fan-out**

        - Native roster visits use direct Git-directory reads, bounded leases, leased header checks, fresh target
          settings, and shared round reads, protection, and command history. Take-ins queue another round; verb writes
          mark only their entering checkout. Skipped siblings recover at their next start, including interrupted
          replacements whose unchanged bytes are classified before edit rights. Unready roots retry transient unsent
          paths, retaining their recovered copies for command end; intentional reverts and late saves remain edits.

- _Outcome:_ Marker UIDs now participate in projection provenance without changing `ActiveLayoutContext`'s shape,
  allowing refused creation stamps to recover editability after a same-slug bind. Live preparation shares the command's
  history while atomic admission still captures and validates the historical bytes consumed.

### `[x]` **1.8 Reproject on a changed view setting, identity, claim, or layout — § 10.4, § 10.3**

- _Goal:_ A command that reads a view setting, identity, checkout claim, or `layout.active` different from the one its
  index recorded reprojects what it governs — views added, files leaving a view by the removal path, the new identity's
  personal root laid on a changed identity, and `current/`, its scratch folder, and owning-checkout notices following
  the claim or layout.

- _Outcome:_ Reprojection and fan-out share the fresh-settings predicate, including marker UID and durable retry flags.
  Personal selection follows the current identity while other personal files and entries remain untouched. A changed
  view can bind an initially unmapped open conflict from its final index and resolve it once; existing selections,
  accepted intents, and ambiguous tokens keep their authority boundaries. Native cases cover guarded view removals,
  identity round trips, claim changes during fan-out, ignore-policy repair, and flat layout.

### `[x]` **1.9 Rebuild deleted files at `arc sync` — § 2.4**

- _Goal:_ `arc sync` rebuilds every deleted projected file as a full materialization, from the flip.
- _Outcome:_ The command's store drives a deleted-file materialization before network work, retaining present files
  and the refresh anchor. Empty Markdown and indexed leaf links use guarded replacement; ancestor links remain
  blocked. Partition failures invalidate under the lease and report a retry; restoration failures still allow sync.
  Dry-run, skip, missing identity, recreated files, cold archive partitions, and deferred fan-out have native coverage.

### `[x]` **1.10 Hold the `.worktreeinclude` copy off the projection's paths — § 11.6**

- _Goal:_ A new linked worktree takes none of the primary's projected files through `.worktreeinclude`, so the
  projection fills them itself.
- _Outcome:_ A real linked-worktree regression holds the existing `.arc/` exclusion under a broad include pattern:
  projected `active/current/` files and machine-local configuration stay out while `.env` is copied.

### `[x]` **1.11 The isolation invariant and its test — § 10.5**

- _Goal:_ An integration test holds "`active/current/` holds only this checkout's work item": a worktree spawned for a
  work unit holds exactly that work unit's files and a copy of each cohort document it names in `active/current/`,
  exactly the selected views in `active/in-flight/`, and nothing else at `active/`'s top level.
- _Outcome:_ Native linked-worktree cases over the reference backend assert exact current files, both named cohort
  copies, exact `mine`, `cohort`, and `all` in-flight inventories with a pinned peer, and no other active-root entries.

### `[x]` **1.12 The no-change budget and the tripwires — § 15.3, § 15.4, § 15.5**

- _Goal:_ A command with nothing changed spends at most 10 ms on Linux and macOS and 60 ms on Windows in the projection,
  its folder walk, index read, and stats running while its two Git calls do, and each tripwire shows only when the
  median of its recent measurements crosses its bound.

- _Amended in:_ 1.12.R (A4)

    - `[x]` **1.12.a The start's cost**

        - The start overlaps its two Git calls with the yielding synchronous hot-root walk, shared index read, and
          platform stats. Due-only lease steps, empty-aside pruning, and an empty end avoid redundant disk work. The
          native suite records interleaved standard/expanded starts and complete fan-outs and materialization on all
          three references; the effective numerical bounds and raw evidence are in A4.
          Native read, listing, and lookup assertions count shared-reader process starts; the completed-lookup check
          observes native starts instead of request exchanges.

    - `[x]` **1.12.b The tripwires**

        - _Amended in:_ 1.12.R (A4)

        - The index retains nine start, fan-out, and full-materialization samples, with matching median notices in
          command reports and status. Fan-outs cover every round and append at the writer's leased end publication;
          failed publication retains pending samples, while later cleanup failure cannot duplicate them on retry.
          Deleted-file restoration preserves full-materialization history, and unprojected writers record no sample.

### `[x]` **1.12.R Calibrate complete operations on each platform — A4**

- _Goal:_ Implement A4's platform-specific complete-operation bounds, preserve raw measurements and cold archives,
  and keep sequential sibling visits and durable recovery ordering.

    - `[x]` **1.12.R.a Align declared and runtime bounds**

        - `projectionPerformanceBounds` supplies each platform's separate start budget/tripwire, one-file and ten-file
          fan-out limits, and materialization bound. Runtime notices use the ten-file fan-out figure and retain raw
          nine-sample medians; native status, publication retry, and all three platform boundaries remain covered.

    - `[x]` **1.12.R.b Report qualification without unsupported Git credit**

        - The native report shares the runtime declaration and retains every raw sample, paired archive comparison,
          and Git/filesystem baseline. It reports exposed Git credit as not established, with zero credit and qualified
          medians equal to raw medians; the process-count startup subtraction is removed.

    - `[x]` **1.12.R.c Reconcile the measured evidence with the revised criterion**

        - The three same-build named references, slower repeats, and bounded archive probe remain in
          `notes-projection-worktrees.md` § A4. Their raw calibration medians fit the declared platform limits, and the
          unreadable settled-partition check remains. No criterion checkbox is attested by this calibration.

- _Outcome:_ Complete-operation acceptance and raw runtime notices now share one platform declaration, with separate
  one-file/ten-file limits and no unsupported Git credit. The original Goal and criterion remain as the superseded
  record; criterion 11 carries the effective performance obligation without changing sibling scheduling.

### `[x]` **1.13 Hold saves through bursts across processes — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving into refreshes, fan-outs,
  and file removals at once, lose no save and no write.

- _Outcome:_ The native suite coordinates twenty distinct engine processes per ref-store layout, with rotated editors
  saving at every swap hook and serial fan-out visit. Its oracle accepts current recoverable bytes and rejects settled
  or unindexed copies; physical directory identity prevents duplicate writer visits. Dispatched run `43126888591` at
  `4c81df9ec8` passed Linux portability and the Windows/macOS named-file pair, covering both layouts, timing isolation,
  and the native alias regression. Detailed evidence is in `notes-projection-worktrees.md`.

### `[x]` **1.14 The working copy across worktrees** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds across real worktrees on a freshly merged base.

- _Outcome:_ The linked-worktree scenario covers materialization, edit and pull fan-out, sync restoration, and expired
  anchors after base merge `63d619fc93`; ownership recovery and the native save bursts hold on Linux and the portability
  pair. A1, A2, and A4 close here. Linux reference run `f148db31f906455ea075a3a6c09ff531` and hosted repeat
  `43139555055` fit all complete-operation bounds with zero Git credit; the first macOS miss remains recorded.
  Paired archive measurements and unreadable settled-partition cases show no archive-entry cost at fixed owner/quarter
  counts. Exact heads, raw medians, negative controls, and the approved repeat are in `notes-projection-worktrees.md`.

## **Phase 2:** Worktrees — the removal slots and the release step

_Purpose:_ Fill the removal function's three projection slots so ARC removes or releases a checkout only after its edits
persist, and give every worktree its own user surfaces.

_Mode:_ `slice` — closes on ARC removing or releasing a projected checkout only after its edits persist.

_Exit criterion:_ Over the reference backend, the removal check answers `persist-would-refuse` for each state an edit
could lose and `unobservable` for a failed read, the persist and release steps refuse over each and succeed once it is
resolved or, for an aside copy kept because its path moved on, deleted, and teardown through its store-backed context
persists, then removes; and over the ref backend, twenty worktrees saving into removals' persist steps lose no save but
for § 17's residuals.

_Design decisions:_ The removal check, the removal function, the release, and the slot type (`checkWorktreeRemoval`,
`removeWorktreeCheckout`, `releaseWorktreeCheckout`, `ProjectionRemovalSlots`, `lib/git/worktree-removal.ts`) are
`seam-lifecycle`'s, on base, and the worktree lock is live (`lockSpawnedCheckout`, `PROJECTION_LOCK_REASON`). This phase
fills the slots in `lib/store/projection/`, each binding its target's root through 1.3's binder, and binds them wherever
a caller composes the removal machinery (2.4), beside the missing-folder remedy (`clearMissingWorktreeRegistrations`).
No production composition sets the slots today, so every caller runs `passingProjectionRemovalSlots` until 2.4.

### `[x]` **2.1 The removal check's projection part — § 12.2**

- _Goal:_ The `check` slot, reading only and taking no lock, answers `would-refuse` with a remedy for every state an
  edit could lose, `unobservable` with its detail when a read it needs fails, and `passes` otherwise — so no failed read
  ever reads as `persist-would-refuse`, and the check never passes a file the persist step would refuse, save a new
  file under a prospective owner, whose kind's content checks run only once the persist step has minted its stub.

- _Outcome:_ `checkProjectionRemoval` binds the target read-only, checks every index partition and identity root,
  and reuses adoption and write-back preparation without publishing or sending. File preparation carries hypothetical
  send marks into swap-ordered aside checks; links remain opaque. Pending read failures retain their own provenance,
  including unreadable interrupted versions, while unfinished acceptance and local edit holds keep their remedies.
  Existing unindexed records use only attachment's read path; prospective owners are validated without minting.
  `notes-projection-worktrees.md` records the fault boundaries and repaired continuations.

### `[x]` **2.2 The persist step — § 12.2**

- _Goal:_ The `persist` slot writes back every edit in the target checkout under its projection lock, every projected
  root included, takes over every settled aside copy, and refuses with the blocking file's remedy rather than let a
  removal drop an edit — releasing the lock before it returns.

- _Outcome:_ `persistProjectionRemoval` writes back every target root under its native lease, with a fresh history
  memo over the retrying Store and receipt-based invalidation of the command memo. It reconciles ownership handoffs,
  consumes actual send/read-back outcomes, and settles live writers' copies in swap order, retaining held edits and
  their repair routes. Bounded final file/copy observations follow feasibility so newly observed edits re-enter the
  persistence loop. Success marks the target retiring and drops its command binding before unlock and fan-out;
  `notes-projection-worktrees.md` records the fault boundaries, repaired continuations, and final-observation fix.

### `[x]` **2.3 The release step — § 12.3**

- _Goal:_ On every path that releases a checkout rather than removing it — teardown, abandon, and `arc locus release` of
  an anchored checkout, and the end of an Errand on the primary — the `release` slot persists every edit as the persist
  step does and, on a linked checkout, removes its projection, refusing where an edit would go back as a refused edit.

- _Outcome:_ `releaseProjectionRemoval` continues persistence under the target's existing lease. Native primary
  detection retains the primary's projection and command binding; linked release guards and swaps every indexed
  root, settles removal copies, and verifies physical completion before deleting recovery storage and index parts.
  Fresh copy-ancestor authority keeps links opaque, and a final actual-copy observation holds unrecorded edits with
  their recovery route. Only a completed linked release marks the target retiring and drops its command binding.
  `notes-projection-worktrees.md` records the native fault boundaries, repaired continuations, and fix check.

### `[x]` **2.4 Bind the slots where the removal function's callers are composed — § 12.2, § 12.3**

- _Goal:_ Every production caller of the removal check, the removal function, and the release takes the projection's
  three slots, so none falls back to the passing defaults once the capability is on.

    - `[x]` **2.4.a The callers on the merged base**

        - Rechecked every composition and direct removal entry point against the baseline in
          `notes-projection-worktrees.md`. The caller families match; operand teardown now delegates through
          `handlers/teardown-operand.ts`. The notes pin the current inventory and identify nullable executor identity
          and the store-rename adapter's dropped Store/identity authority for the bindings.

    - `[x]` **2.4.b Lifecycle's contexts**

        - Bound one capability-gated factory into Store teardown, executor reconcile, lifecycle teardown and legacy
          removal checks, direct start, and both rename directions. Slots retain the resolved Store, command identity,
          and command-scoped mint port; unavailable identity keeps target eligibility and remedy ordering.
          `notes-projection-worktrees.md` records native refusal/repair coverage and the authority checks.

    - `[x]` **2.4.c The sweeps, the Errand exits, and the releases**

        - Bound status sweep/recovery, all five Errand exit constructions, and locus release to their resolved Store
          and identity. Primary Errands release their projection before restoring the branch or clearing the claim,
          rechecking their exact generation after release. Native refusal, error, and repaired completion coverage is
          recorded in `notes-projection-worktrees.md`.

    - `[x]` **2.4.R Enforce the inert compositions' slot bindings — A5**

        - _Goal:_ Implement A5's static enforcement for the direct start spawn, rename apply/rollback, and legacy
          park/abandon compositions while preserving their resolved Store and command identity authority.
        - _Outcome:_ Added focused ESLint enforcement of explicit slot/check presence and exercised missing and
          corrected contexts. Store rename now forwards its required slots explicitly through both move directions.
          Separate Store/identity inspection is recorded in `notes-projection-worktrees.md`; A5 acceptance remains at 2.8.

### `[x]` **2.5 The user surfaces in every worktree — § 12.8**

- _Goal:_ Under the capability every worktree holds its own copy of the identity's personal records, `USER-INBOX` and
  `WORKING-MEMORY` among them, read through the store and never through the user-surfaces resolver.

    - `[x]` **2.5.R Protect residual personal files before unindexed removal — A6**

        - _Goal:_ Implement A6's destructive-removal refusal for non-machine-local personal files in an ARC-managed
          checkout without a projection/index, preserving explicit recovery and identity-free empty-husk retirement.
        - Removal checks and persistence share the registry-based, link-opaque residual observer; release carries its
          own disposition. Native compensation checks before clearing ownership and retains pending recovery evidence
          and the claim, with actionable detail. Explicit recovery permits retirement or same-claim setup retry.

- _Outcome:_ Projected inboxes stay checkout-local and fan out through the Store; off-branch teardown, reconciliation,
  husking and cleanup readers bypass legacy personal-file merging and safety reads. Production contexts forward their
  Store, and lint enforces the projection import boundary. Unindexed retirement now preserves personal bytes before
  deletion, including failed setup compensation, while release and empty-husk fast paths remain identity-free.
  `notes-projection-worktrees.md` records preservation, recovery and the bounded evidence limits; A6 revalidates at 2.8.

### `[x]` **2.6 Machine-local paths under `.arc/system/.internal/` — § 12.9**

- _Goal:_ The registry lists every machine-local file under `.arc/system/` by name, so a source projecting
  `.arc/system/` leaves them alone.

- _Outcome:_ `MACHINE_LOCAL_PATHS` names the checkout's marker, pristine metadata and generated schema subtree.
  Projection discovery excludes those paths while a neighboring project-owned file under `.internal/` remains eligible.

### `[x]` **2.7 Hold saves through bursts into a removal's persist step — § 1.5**

- _Goal:_ Twenty worktrees of one clone, each a separate process over the ref backend, saving while their checkouts are
  persisted for removal, lose no save.

- _Outcome:_ Native teardown persist bursts cover both hook seams and layouts; each successful persist proves its
  actual Store read observed its completed save before returning, and the final conservation oracle retains refusals'
  recovery evidence. Implementation `33c3c309cc` passed CI run `43327625683` on Windows (`131564473396`), macOS
  (`131564473414`), and Linux portability (`131564906747`); see `notes-projection-worktrees.md` § Persist burst evidence.

### `[x]` **2.8 Removal after persist** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds on a freshly merged base, the slots bound behind the live lock.

- _Outcome:_ After append-only base merge `9534b4ceb1`, the reference-backend scenario covers held states and repair,
  persistence, release and Store-backed teardown. Full CI `43361738519` passed at that engine, including Linux
  portability (`131677209242`) and all Windows/macOS pair shards; Windows `131676871143` and macOS `131676871194`
  confirm 2.7's twenty-process saves at every persist seam/layout. A5 and A6 revalidate here. Installer-residue cleanup
  found no untracked blocker. Full evidence and retained earlier failures are in `notes-projection-worktrees.md`.

## **Phase 3:** Verification

### `[ ]` **3.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

- `[ ]` Over the reference backend with real repositories and worktrees, on Linux and in a dispatched run of the
        portability pair, a hand edit in any worktree, and a conflict record its write files, reach every other
        worktree's copy at the writer's fan-out, a pull's merges included; the save-loss harness loses no save timed
        into a refresh; and over the ref backend, twenty worktrees saving into refreshes, fan-outs, file removals, and
        checkouts' persist steps at once lose no save, but for the residuals the spec's § 17 names.

- `[ ]` A file withheld at a rebuild stays in its file and is reported; for it, for an edit to a protected or another
  person's archived file, an unadopted file, a file that fails to parse, a refused edit, a file held by a conflict, a
  clash found in the checkout included, a file not yet settled, and an aside copy kept because its path moved on, the
  removal check answers `persist-would-refuse`, and `unobservable` for a failed read, and the persist and release steps
  refuse, then succeed once it is resolved or, for the copy, deleted.

- `[ ]` The isolation test passes; `layout.active: flat` lays the checkout's work item flat; and a changed view setting,
  identity, checkout claim, or `layout.active` reprojects what it governs.

- `[ ]` A verb run from the checkout marks the files its write changes there, so `arc selection --changed` lists them.

- `[ ]` The no-change overhead stays within 10 ms on Linux and macOS and 60 ms on Windows at this repository's size; the
        start, a full materialization, and a one-file fan-out of a record that is not a primary into 20 worktrees each
        measure within their tripwires' bounds on every platform; and a ten-file fan-out into 20 worktrees measures
        within its bound on Linux and macOS, its Windows median recorded against it. On Windows each of these is read
        past the host's Git cost: a median counts against its bound less the amount by which its Git calls' time on that
        host exceeds the longer of 42 ms a call, what § Spike 2 measured, and the projection's own work run beneath
        them, and never above its measurement. The calls' time is taken from the tripwire suite's medians on that host —
        two calls run at once for calls that ran at once, which count as one call, and one call's for each other — and
        the work beneath them from the suite's time for that work run alone, so the projection is held to its own share
        (spec § 15.3, § 15.4).

- `[ ]` Over the in-repo implementation the removal slots pass.

- `[ ]` The `.worktreeinclude` copy copies nothing under the projected roots or `.arc/system/.local/`.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` An installing file's same-tick save remains detectable after another partition advances the reference,
        without loading or rewriting the saved file's partition; a later clean, value-equal publication writes no
        partition (A1).

- `[ ]` A new record arriving at a reused path remains retryable until installed. Saves during removal, linking, and
        interrupted installation, including unstamped files, never reach the other record; proved installations resume
        automatically, ambiguous bytes remain recoverable and reported, and deletion permits successful retry. A
        blocked arrival after a claim-only change retries without an intervening store write, including A → B → A after
        partial progress or interruption (A2).

- `[ ]` Complete external medians over the reference backend fit the separate Linux, Windows, and macOS bounds in
        specification § 15.3 and § 15.4: no-change start, one-file backlog-companion fan-out into twenty linked
        worktrees, ten-file fan-out, and full materialization. Each platform has its own same-build named reference;
        all raw samples and same-run Git and filesystem baselines remain, and only established exposed host-Git delay
        receives credit. Interleaved standard/expanded starts show no systematic cost from settled archive entry
        growth, whose partitions remain unread; runtime notices retain raw nine-sample medians. This supersedes the
        earlier performance criterion (A4; specification criterion 11).

- `[ ]` Executable retirement contexts refuse held projected edits, retain checkout and claim, and succeed after
        repair; lint rejects missing slots at direct start, rename apply/rollback, and legacy park/abandon compositions.
        Store/identity forwarding is inspected, and factory tests cover capability, identity, and mint-port authority
        (A5; spec criterion 12).

- `[ ]` Unindexed ARC-managed targets refuse destructive removal over non-machine-local personal files and retain
        their bytes until explicit recovery; retry leaves primary bytes untouched. Release, empty/machine-local-only
        targets without identity, missing folders, disabled capability, unreadability, and symbolic links follow A6's
        defined behavior; failed setup compensation preserves pending recovery state and permits same-claim retry
        after recovery and setup repair (spec criterion 13).

- `[ ]` While its evidence is not whole, a rebuild with no usable index withholds every file at a path it lays no stored
        record at under the held mark, which removal, persist and release refuse over, and publishes no state version;
        once the reported condition is resolved, the next rebuild settles each held file by the rebuild rule with no
        store write where nothing blocks its path, and the next rebuild or full materialization gives one still at an
        unlaid path the ordinary withheld mark (A7; spec criterion 14).

- `[ ]` Ready for integration
