# Task List: Cohort Identity Verbs

- **Design:** `spec-cohort-identity-verbs.md`

---

## **Phase 1:** Clash repairs, cohort path rules, and the command surface before the flip

_Purpose:_ Land every part of the design that observes none of the ref-backend hardening's surfaces: the repair each
clash refusal carries, the rules that hold a cohort path to its current slug, the cohort writers, and the new commands
and operand forms, which change nothing a verb does before the flip.

_Mode:_ `layer` — closes on the store-side repairs, path rules, and writers, and the registered command surface,
settled.

_Exit criterion:_ Over both backends, every clash refusal the lookup, a read or write by name, the branch-link lookup,
and the three write rules raise carries the repair for its holders and tie; `meta.cohort` and `cohort.parent` refuse a
former slug naming the current one and admit a completed meta's rewrite onto a completed cohort; and before the flip
`arc cohort close` and `arc cohort remove` refuse `unsupported` while every in-repo arm's existing tests pass unchanged.

### `[ ]` **1.1 Build a branch link's repair beside the clash repair — § 3.3**

- _Goal:_ A live branch-link tie names, per holder, the move that takes its link off the branch, and a completed one
  says no lifecycle repair is available, naming each holder's UID.

    - Add `branchLinkRepair(candidates, tie, branch)` to `lib/store/clash-repair.ts`, `branch` being the branch the
      lookup names: a completed tie takes `clashRepair`'s completed text; a live tie names `arc rename <uid> <new-slug>`
      for a work unit, the catch-up `arc rename <uid> <slug>` for one where `workBranchName(branch)` does not match
      `^[^/]+/<current-slug>$`, any one-segment prefix, as `branchRename` matches, and `arc errand close <uid>` for an
      Errand, each run on the machine holding that holder's checkout; its argv is `arc status --json`.
    - `clashRepair` already carries § 3.1's preferred move, former-tie, and completed-tie text and its argv rule; it is
      unchanged, and its cases in `__tests__/unit/lib/store/clash-repair.test.ts` stand.

    - Build `test-first` (one behavior at a time):
        - a live tie of two work units names `arc rename <uid> <new-slug>` for each, with `arc status --json` as argv
        - a live tie of a work unit and an Errand names the rename for one and `arc errand close <uid>` for the other
        - a work unit whose current slug no longer names the branch takes the catch-up form
        - a completed tie of closed Errands takes the completed text, naming each UID

### `[ ]` **1.2 Give each lookup arm's ambiguity its repair in both backends — § 3.1, § 3.3**

- _Goal:_ Every reader that meets a clash through the lookup prints a repair that names a command which ends it: the slug
  arm's `clashRepair`, the branch-link arm's `branchLinkRepair`, and the lineage, commit, and claim arms' narrowed text.

- _Note:_ `handlers/lifecycle-shared.ts` also changes on `feat/seam-delivery-review`, outside `refuse` and
  `refuseWithRemedy`; expect a merge there (§ 11.2).

    - `[ ]` **1.2.a The ref backend**

        - In `lookupCapturedRefTrees` (`lib/store/ref/lookup.ts`), build the `ambiguous-match` remedy by arm: the slug arm
          with `clashRepair(candidates, tie)`, the `ref` arm with `branchLinkRepair(candidates, tie, input.ref)`, and the
          lineage, commit, and claim arms with "Name the intended owner by UID, then repeat the lookup."

    - `[ ]` **1.2.b The reference backend**

        - The same three remedies in `__tests__/helpers/store/lookup.ts`, replacing "Disambiguate the stored names or
          links", so the conformance suites assert one text over both backends.

    - `[ ]` **1.2.c The readers that print it**

        - `refuse` and `refuseWithRemedy` (`handlers/lifecycle-shared.ts`) and the paused-work disposition
          (`lib/session-init/paused-work.ts`, its refusal arm) print the refusal's own remedy in place of rebuilding
          `clashRepair` from any `tie`, so a branch-link tie keeps `branchLinkRepair`'s text; paused work's standing-clash
          actions keep building `clashRepair` from their holders.
        - `resolveStoreViewTarget` (`handlers/view-store.ts`) appends its completed-holder text only to a completed tie.
        - The other readers already print the remedy as given — session entry, `arc status <slug>`, archive's cohort
          read, decomposition's refusals, teardown's branch gate, the orphan-branch sweep (`readOrphanStoreCandidates`),
          and the missing-worktree check (`readStoreMissingFolderActions`) — and take no change.
        - The fixtures that hardcode the old text take the store's remedy: `createClashDouble`
          (`__tests__/helpers/store/clash-double.ts`) and `rule-view.ts`, whose planted ambiguity gains a `tie`.

    - Build `test-first` (one behavior at a time):
        - over both backends, a slug clash of each holder pair § 1 of Success Criteria lists refuses with `clashRepair`'s
          remedy for those types (`store-ref-lookup-ties.test.ts`, `reference-lookup-ranking.test.ts`)
        - a live branch-link tie of two work units refuses with `branchLinkRepair`'s per-holder moves
        - a lineage, commit, or claim tie refuses with the narrowed text, which no longer says to rename
        - the orphan-branch sweep, the missing-worktree check, and teardown's branch gate warn with the branch-link
          remedy under a live tie
        - given an `ambiguous-match` refusal carrying a tie and `branchLinkRepair`'s remedy, `refuse` and
          `refuseWithRemedy` print that remedy, in text and `--json`, rather than rebuilding `clashRepair`

### `[ ]` **1.3 Carry the tie and its repair on a refusal of a name — § 3.2, § 3.7**

- _Goal:_ A typed read or write naming its record by slug alone refuses under a clash with the tie its ranking tier
  gives and `clashRepair`'s remedy for it, so each reader that binds a name within one family names the repair.

    - `[ ]` **1.3.a Binding a reference by name**

        - `resolveCapturedReference` (`lib/store/ref/reference-resolution.ts`) sets `tie: { liveness, name }` from the
          preferred tier and its remedy from `clashRepair`, a completed tie included, built over each work-item
          candidate's recorded primary role (`metadata.primary.role`), since a secondary-kind read keeps the requested
          kind on its candidates and `canonicalPrimaryKind` maps only a primary kind; the lineage arm's
          `resolveCapturedLineage` keeps "Name the intended origin by UID, then retry" (§ 3.4).
        - A write's names bind here (`bindName`, `lib/store/ref/write-names.ts`) before `resolveOwner` runs, so writes
          by name take this remedy with no change of their own.

    - `[ ]` **1.3.b Resolving a write's owner**

        - `resolveOwner`'s refusal of several candidates (`lib/store/ref/write-resolution.ts`) takes "Name the intended
          origin by UID, then retry" for the lineage owners it is handed (`lineageOwnerCandidates`, its `preselected`
          path), and otherwise `clashRepair`'s remedy for a live current-name tie, in place of its text saying to rename
          one.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, a read of a work item by a slug two live work units hold refuses with the tie and
          `clashRepair`'s remedy; a completed tie names each holder's UID
        - a read of a secondary kind by a slug a work unit and an Errand share names the Errand's close, not a rename
        - a write naming its owner by such a slug refuses at binding with the same remedy
          (`store-ref-name-resolution.test.ts`)
        - a lineage write whose origin name several candidates hold refuses with the origin text
        - with two cohorts holding one slug, session entry's frame read (`readStoreCohortDoc`), archive's cohort read
          (`prepareObservedCohorts`), and a member's rename (`acquireRenameGroups`) each refuse naming the cohort rename
        - a clash between a work unit and a cohort refuses no cohort read and no work-item read

### `[ ]` **1.4 Observe an ambiguous record, and pass its remedy through the cohort, parent, and edge rules — § 3.5**

- _Goal:_ An edit naming a clashed cohort or slug in `Cohort`, `Parent`, or `Depends On` refuses with the clash's
  repair, while every rule reading through `observeRecord` behaves as today.

    - `[ ]` **1.4.a The observation**

        - `observeNamedRecord` beside `observeRecord` in `lib/store/kinds/rule-support.ts` returns
          `{ status: "ambiguous"; condition; candidates; tie?; remedy }` for an `ambiguous-match` refusal and otherwise
          what `observeRecord` returns. `observeRecord`'s type and every consumer of it stay unchanged, since one that
          returns early only on `unavailable` would read an added status as known (`observeInboundHeld`).

    - `[ ]` **1.4.b The three rules**

        - `checkMetaCohort` and `parentProblem` read through `observeNamedRecord` and report the observation's condition
          with its remedy; `parentProblem` returns the remedy beside its condition and `checkCohortParent`'s `fail` takes
          it, building the `BrokenRule` directly where `brokenRule`'s string remedy cannot carry an argv.
        - `checkMetaDependsOn` reports an ambiguous slug lookup's condition with the lookup's remedy; any other refusal
          keeps the fixed remedy; several ambiguous edges join their remedy texts under `arc status --json`.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, an edit naming a clashed cohort in `Cohort` refuses `meta.cohort` with `clashRepair`'s
          remedy
        - over the ref backend, a changed `Parent` naming a clashed cohort refuses `cohort.parent` the same way
        - a new `Depends On` edge on a slug two live holders share refuses `meta.depends-on` with the lookup's remedy,
          and two such edges join their remedies
        - an unavailable read and a not-found edge keep each rule's fixed remedy

### `[ ]` **1.5 Name the repair in status's clash warning — § 3.6**

- _Goal:_ Status's `slug-clash` warning for two live work units names `arc rename <uid> <new-slug>` for each holder.

    - `clashWarning` (`lib/status/store-project-standing.ts`) keeps each holder's UID, owner, and location and replaces
      "Rename one holder to repair the clash" with `clashRepair`'s text for its holders under a live current-name tie.

    - Build `test-first` (one behavior at a time):
        - the warning for two live work units names the rename for each by UID (`store-project-standing.test.ts`)

### `[ ]` **1.6 Admit a cohort path segment only by its current slug — § 6.1**

- _Goal:_ `meta.cohort` and `cohort.parent` refuse a path segment that resolves through a cohort's former slug, naming
  the current one, so no text-matching membership reader misses a member edited back onto an old name.

    - `checkMetaCohort` (`kinds/meta/reference-rules.ts`) resolves every segment — the leaf, a one-segment path, and
      the first segment of a two-segment path — and refuses one whose read document's current name differs, naming it;
      the first segment's text comparison with the leaf's `Parent` passes when a pull left that `Parent` on the former
      slug.
    - A first segment the view holds no document for keeps today's text comparison with the leaf's `Parent` alone, as
      the `parent/child` case in `reference-rules.test.ts` admits with only the leaf in view; an unavailable read
      refuses as the leaf's does.
    - `parentProblem` (`kinds/cohort/rules.ts`) refuses a `Parent` naming its parent by a former slug the same way.

    - Build `test-first` (one behavior at a time):
        - over both backends, after a cohort's rename, a `Cohort` naming its old slug as a one-segment path or as the leaf
          refuses `meta.cohort`, naming the current slug
        - with a subcohort whose `Parent` still names its renamed parent's former slug, a member edit to
          `<former>/<leaf>` refuses, naming the parent's current slug
        - a `Parent` naming a renamed parent's old slug refuses `cohort.parent`, naming the current slug
        - a path naming the current slugs lands, and a two-segment path whose first segment has no document in view lands
          as today

### `[ ]` **1.7 Let a completed meta, and an open meta re-pointing its holding, name a completed cohort — § 6.2**

- _Goal:_ A cohort rename can rewrite a closed subcohort's completed members and its open straggler, while an open meta
  still cannot join a completed cohort.

    - In `checkMetaCohort`, a completed meta's changed `Cohort` names an existing cohort by its current slug, open or
      completed, agreeing with that cohort's `Parent`; an open meta's changed `Cohort` may name a completed cohort only
      where its prior `Cohort`'s leaf, resolved in the view before the write, is the owner the new leaf names in the view
      after it.
    - `checkCohortParent` already admits a closed subcohort's `Parent` rewrite onto its open, top-level renamed parent,
      its open members taking the rewritten path in the same batch; the task adds its test.
    - Read the meta's own placement only on the completed-cohort branch, since existing unit cases replace
      `input.after` without the meta (`reference-rules.test.ts`).
    - No checked local write forms an open meta in a completed cohort, so those fixtures land the meta through a
      two-clone pull or a direct ref plant.

    - Build `test-first` (one behavior at a time):
        - a completed meta's `Cohort` rewritten onto a completed cohort's current path lands
        - an open meta joining a completed cohort refuses, as today
        - an open meta re-pointing a completed cohort it already held, from a former slug to the current one, lands
        - a closed subcohort's `Parent` rewritten to its renamed parent's new slug, with its open straggler's path in the
          same batch, lands

### `[ ]` **1.8 Add the cohort heading and `Parent` writers — § 5.2**

- _Goal:_ The cohort rename can rewrite a document's `# Cohort:` heading and its `**Parent:**` field through the kind's
  own writers, every other line unchanged.

    - `rewriteCohortHeading(content, slug)` and `writeCohortParent(content, parent)` beside `rewriteCohortMemberHeading`
      in `lib/store/kinds/cohort/`, exported through the kind's index; the rendered forms match
      `writeCohortDocument`'s (`creation-writer.ts`). `writeCohortParent` rewrites the single existing `**Parent:**` line
      and returns null where none exists, as in a top-level document.

    - Build `test-first` (one behavior at a time):
        - the heading writer rewrites only the `# Cohort:` line, every other line byte-identical
        - the `Parent` writer rewrites the field's value and leaves every other line, a member heading naming the same
          slug included, byte-identical
        - the `Parent` writer returns null for a document with no `**Parent:**` line

### `[ ]` **1.9 Register the cohort verbs and the UID operand forms, keeping every pre-flip arm as today — § 1.1, § 10**

- _Goal:_ The new commands and operand forms exist, and before the flip every verb behaves as today but for one refusal
  order: `arc cohort close` and `arc cohort remove` refuse `unsupported` naming what serves, and every operand is a slug.

- _Note:_ `cli.ts` also changes on `feat/seam-delivery-review`; merge base after it lands, before this task edits it
  (§ 11.2).

    - `[ ]` **1.9.a The `arc cohort` group**

        - `arc cohort close <cohort>` and `arc cohort remove <cohort>` in `cli.ts`, each with `--yes` and `--json`,
          handled in a new `handlers/cohort.ts` that Tasks 3.4 and 3.5 extend; the `DormantStoreCommand` union
          (`commands/store-command-support.ts`) gains `cohort close` and `cohort remove`, whose serving path names edits
          to the tracked cohort files and archive's sidecar sweep.
        - Each command's input schema registration and policy declarations follow `handlers/store-command-input.ts`,
          `--yes` a protected confirmation as abandon's is (`handlers/lifecycle.ts`) and `--json` routed through the
          interaction adapter, as `repository-inventory.test.ts` reconciles; each takes a `NO_INPUT_MATRIX` entry
          (`__tests__/fixtures/command-input/no-input-matrix.ts`) with the totals in `no-input-invocations.test.ts`; the
          command-surface documentation (`command-surface-documentation.test.ts`) takes whatever entries it requires;
          and the dormant-command table in `store-command-registration.test.ts` gains both.

    - `[ ]` **1.9.b The operand schemas**

        - `RenameCommandInputSchema` (`handlers/lifecycle.ts`) and `ErrandCloseInputSchema` and
          `ErrandAbandonInputSchema` (`handlers/errand.ts`) admit a `z.uuid()` subject operand, upper case included,
          beside a slug; rename's `newSlug` stays `SlugSchema`. Help text states the UID form, and the literal
          `arc errand close <slug>` usage `locus-methodology-contracts.test.ts` pins follows any usage change.

    - `[ ]` **1.9.c The in-repo arms parse a slug once the store is open**

        - Where `usesOffBranchState` is false, `handleRename`, `handleErrandClose`, and `handleErrandAbandon` parse each
          operand with `SlugSchema` after the store opens — for rename, after its stdin Git check, which already follows
          the open — and refuse one it rejects through today's input refusal: `parseLifecycleCommand`'s for rename,
          `locus.errand-close.input` and `locus.errand-abandon.input` for the Errand verbs; then the in-repo arm runs
          unchanged.
        - From the flip, until Tasks 2.3 and 4.1 land, a UID operand still reaches `SlugSchema.parse` in the store arms;
          no task in this phase sends one over the ref backend.

    - Build `test-first` (one behavior at a time):
        - before the flip, `arc cohort close` and `arc cohort remove` refuse `unsupported`, naming the serving path, in
          text and `--json`
        - before the flip, a lower-case UUID operand on `arc rename`, `arc errand close`, and `arc errand abandon` is
          taken as a slug, and an upper-case one refuses through today's input refusal
        - an operand that is a UUID but not a slug meeting an earlier refusal (the project root, configuration) shows
          that refusal first
        - the in-repo arms' existing tests pass unchanged

## **Phase 2:** Selecting a subject by UID, and the Errand exits

_Purpose:_ Build the subject operand every new verb shares — an exact UID scanned across the primary kinds a verb names,
or a slug through the lookup — and prove it on its thinnest consumer, the Errand close and abandon that end a clash of
two Errands.

_Mode:_ `slice` — closes on a clash of two Errands ended by UID, end to end.

_Exit criterion:_ Over the ref backend, with two live Errands holding one slug, the clash refusal names
`arc errand close <uid>`; `arc errand close <uid>` closes the named Errand, clearing only its own finalized head locks,
after which the slug resolves to the other; `arc errand abandon <uid>` lands the same way; a retry either prints repeats
the UID given; closing one on the machine holding only the other's checkout refuses naming where to run it; and
`arc errand promote <slug>` refuses naming the close, then lands on the remaining Errand.

_Design decisions:_ This phase and every later one read through listings, history refs, or pull consumption, so they
implement after `storage-ref-hardening` lands whole, with its listing scope, fault classes, and pull consumption as
`spec-cohort-identity-verbs.md` § 11.1 expects them; should they be ready while more than about a week of it remains,
that ordering returns to the Owner. The resolver built here serves Phases 3–5.

### `[ ]` **2.1 Scan the primary kinds a verb names for an exact UID — § 1.2**

- _Goal:_ One scan selects an owner by exact UID across the primary kinds its caller names, a cohort among them, and
  refuses a UID that selects more than one owner, naming each.

    - `readWorkItemByUid` (`lib/store/work-item-uid.ts`) takes the primary kinds it lists as a parameter, today's
      `work-item/meta` and `work-item/record` by default for teardown (`runTeardownForOperand`) and the inbox list
      (`lib/inbox/lists.ts`), lists each in its own kind's family, and matches the UID on any owner that carries one
      rather than on work-item owners alone.
    - Its `incomplete` and `ambiguous-match` results keep their shapes; their texts stop saying "work item", the
      ambiguity's condition names each owner's kind, and an incomplete listing keeps its own remedy where it carries one,
      such as a missing object's restore remedy.

    - Build `test-first` (one behavior at a time):
        - passed `cohort/document` beside the two, a cohort's UID selects its document
        - a UID carried by both a work item and a cohort refuses `ambiguous-match` naming both
        - an unreadable listing or one with diagnostics returns `incomplete`
        - the default kinds select as today for teardown and the inbox list

### `[ ]` **2.2 Resolve a subject operand by UID or slug under each verb's type rule — § 1.1, § 1.2, § 1.3**

- _Goal:_ Rename, the cohort verbs, and the Errand verbs share one operand rule from the flip: an operand `z.uuid()`
  accepts selects that exact owner by its lowercased UID, any other is a slug through the lookup, and each verb applies
  its own type rule to what is selected.

    - A resolver in `lib/store/` beside `work-item-uid.ts`, taking the operand, the primary kinds to scan, the verb's
      type rule, and whether a slug resolves through the lookup: a UID scans through `readWorkItemByUid`; for rename and
      the cohort verbs a slug resolves through `lookup({ kind: "slug" })`, while the Errand verbs, which keep their own
      slug reads (§ 1.3), get a slug back unchanged. No lineage arm.
    - Its result, which Phases 3–5 consume:
        - selected: the primary re-read by its reference, so it carries fields, placement, and version, with whether it
          was selected by UID or slug, and the operand as given;
        - a store refusal, a refused lookup's included, passed through whole, `candidates`, `tie`, and remedy intact;
        - `unselected`, with a condition and remedy, for an `incomplete` scan, as teardown's condition and remedy, and
          for a UID selecting nothing, naming the UID and saying to pull state or check the UID; each verb renders it
          through its own refusal, since a store `not-found` must name a reference or a lookup and no lookup arm takes a
          UID;
        - a type-rule refusal as `record-malformed` naming its rule, as `readWorkUnit`'s `lifecycle.work-unit` does.
    - The type rules, per § 1.2's table: rename scans all three kinds and refuses an Errand naming
      `arc errand close <uid>`; the cohort verbs scan all three and refuse a work unit naming the work-unit verbs and an
      Errand naming `arc errand close <uid>`; the Errand verbs scan the two work-item kinds and refuse a work unit naming
      the work-unit verbs.

    - Build `test-first` (one behavior at a time):
        - each cell of § 1.2's table selects or refuses as stated
        - an upper-case UID selects the same owner as its lower-case form
        - a slug shaped like a UUID selects by UID, and its holder stays reachable by its own UID
        - a slug the lookup refuses returns the refusal whole, and an Errand verb's slug returns unchanged
        - an incomplete scan returns `unselected` with its condition and remedy

### `[ ]` **2.3 Close and abandon an Errand by UID, the selected record replacing the slug — § 9.1, § 9.2**

- _Goal:_ `arc errand close <uid>` and `arc errand abandon <uid>` end the named one of two clashed Errands, every step
  that used the operand as the Errand's slug reading the selected record instead.

- _Note:_ The handler resolves before `readBasis`'s pull, so a UID only a remote holds refuses `not-found` naming the
  pull; and the hardening also edits `errand/store-runtime.ts`'s pull site, so expect a merge there.

    - `[ ]` **2.3.a Resolving before the protection branch**

        - Where `usesOffBranchState` holds, `handleErrandClose` and `handleErrandAbandon` (`handlers/errand.ts`) resolve
          the operand right after the store opens and before they branch on protection; a partial Errand keeps no record,
          so a UID under partial protection refuses `not-found` rather than reaching `settlePartialErrandAtRuntime`'s
          roster match by slug. The in-repo arms keep Task 1.9.c's slug parse.
        - On both verbs each refusal of Task 2.2's resolver renders as a `refused` outcome under `identity-conflict`,
          the reason both give an identity that is not a closeable Errand (`close-locus.ts`, `abandon-locus.ts`), its
          condition and remedy as the prompt text; a UID selecting nothing is § 1.2's `not-found` refusal in that form,
          and a listing read that throws renders under the `identity-read` stage.

    - `[ ]` **2.3.b Close**

        - `readReconciledCloseIdentity` (`lib/errand/close-runtime.ts`), the check of the record's slug, and the
          already-finalized fallback (`close-locus.ts`) take the selected record, and the recovery call passes its slug,
          and its claim once Task 2.4 gives the receipt match that parameter; later steps already read by the record's
          claim.
        - Where `usesOffBranchState` holds, a guard in the target-resolution step `close-runtime.ts` wires to
          `resolveTarget`, ahead of `resolveCloseChangeRequest`, reads the frame (`readFrame`) and matches its roster by
          the subject's slug and claim, as `authorizeErrandTerminal` does (`sameSubject`); where no row matches and
          `lookup({ kind: "ref" })` of the subject's branch returns anything but the subject alone, close refuses before
          the branch is read, naming the machine holding the subject's checkout. `readCloseOccupancy`, `onAuthority`, and
          every other step keep today's order.

    - `[ ]` **2.3.c Abandon**

        - The matching steps in `abandon-runtime.ts` and `abandon-locus.ts`, and `readBasis`
          (`lib/errand/store-runtime.ts`) where it serves them, take the selected record.
        - The return plan (`prepareHandlerErrandReturn`, through `prepareErrandReturn`, `lib/inbox/errand-return.ts`)
          takes the operand given, which its list resolution already selects by UID, and `prepareReturnEntry` compares
          the holding Errand with the subject by UID rather than by slug: `openErrandHolding`
          (`lib/inbox/errand-home.ts`) adds the holder's reference to `EntryErrandHome.held` beside its slug, which
          `lib/inbox/offer.ts` and `errand-adoption.ts` keep reading unchanged.

    - `[ ]` **2.3.d Retries repeat the operand given**

        - `AuthorizeErrandTerminalOptions` (`lib/errand/terminal-authority.ts`) gains an optional `operand`, defaulting
          to the subject's slug for its other callers, which `renderRetry` and `renderOffBranchRefusal` repeat rather
          than the record's slug, which refuses under the clash.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, with two live Errand owners planted on one slug through `plantRef`
          (`__tests__/helpers/store/ref-plant.ts`), each carrying a v3 `TransientIdentityRecord` body, a branch, a
          checkout, and merged evidence — a fixture this task builds, modeled on the store-backed Errand CLI fixture in
          `errand-preservation-store-cli.test.ts` (`createLifecycleHarness`, `dispatchRegisteredCli`) —
          `arc errand close <uid>` closes the named one and the slug then resolves to the other
        - `arc errand abandon <uid>` lands the same way and returns only its own held inbox entries
        - closing one by UID on the machine holding the other's checkout, and none of its own, refuses naming the
          machine holding its checkout
        - a slug close with no clash and no checkout here takes today's foreign-confirmation path unchanged
        - before the flip, a full-protection close with no checkout here takes today's identity-only path
        - a UID under partial protection refuses `not-found`, a `refused` outcome under `identity-conflict` naming the
          UID, in text and `--json`
        - the confirmation retry and the off-branch retry each print repeat the UID given
        - a slug operand with no clash closes and abandons as today, the slug reaching the Errand runtime unchanged

### `[ ]` **2.4 Clear only the selected Errand's finalized head locks — § 9.2**

- _Goal:_ Closing one of two clashed Errands never clears the head locks guarding the other's branch deletion.

    - `recoverFinalizedErrandCloseHeadLock` (`lib/errand/close-head-lock.ts`), a receipt match, takes an optional claim
      and clears a lock only where its receipt matches both the slug and that claim, the receipts carrying both; with no
      record selected, as on the slug and in-repo arms where the completed record is not kept, it matches the slug
      alone, as today.

    - Build `test-first` (one behavior at a time):
        - with finalized head locks for both clashed Errands, closing one by UID clears only its own
        - with a slug operand and no clash, a finalized lock still clears

### `[ ]` **2.5 Pass the repair through promote's refusal, and recover by the promoted meta's receipt — § 9.3**

- _Goal:_ Under a two-Errand clash `arc errand promote <slug>` names `arc errand close <uid>`, and a promotion under
  `--name` that stops after its role write resumes when rerun by its new name.

    - `[ ]` **2.5.a The refusal**

        - `readPrimary` (`lib/errand/promote-store.ts`) passes the store's refusal through, joining its condition and
          remedy text into the reason `promote.ts` renders, rather than the condition alone; the remedy's argv does not
          survive that string.

    - `[ ]` **2.5.b The recovery**

        - `recover` and `sourceFromHistory` match the Errand's history by the promoted meta's `promotionReceipt` rather
          than by the operand, so a rerun by the new name finds the promotion where today it refuses by either name.

    - Build `test-first` (one behavior at a time):
        - promote under a two-Errand clash refuses naming `arc errand close <uid>`, and lands on the remaining Errand
          once one closes
        - a promotion under `--name` leaving a former-slug tie, interrupted after its role write, resumes when rerun by
          its new name with the flags its recovery matches (`--name` and the branch type)

### `[ ]` **2.6 A clashed Errand's exit end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: a clash of two Errands names its repair, the repair runs by
  UID on either verb, and the slug then resolves to the remaining Errand, which promote then takes.

## **Phase 3:** Counting a cohort's holders by resolution, and retiring a cohort

_Purpose:_ Count a cohort's holders by resolving each path segment rather than matching its text, on every retiring path
and at the store's backstop, and give a cohort nothing else will retire its explicit close and removal.

_Mode:_ `slice` — closes on a cohort closed and removed end to end, never under a record that holds it.

_Exit criterion:_ Over both backends, `arc cohort close` refuses a cohort an open stub names by a former slug, naming
what settles it, and closes it once the stub leaves the cohort; archive of that cohort's last current-path member lands,
leaves the cohort open, and reports the stub; over the ref backend, a clash between two other cohorts blocks neither
close nor archive's in-batch close; an abandon leaving a cohort with nothing open names `arc cohort close`, which then
closes it; `arc cohort remove` removes a cohort nothing ever named and refuses one an archived member names; each writes
nothing without `--yes`; and a member a pull lands naming a removed cohort refuses archive naming the edit to its
`Cohort`, then archives after it.

### `[ ]` **3.1 Resolve each holding of a cohort once per view — § 7.1**

- _Goal:_ One helper says which records hold a cohort — a member's `Cohort` through each segment, a subcohort's
  `Parent` through its one — whether alone or ambiguously, and one builder says how to re-point a holding, so every
  retiring path and both renames count and repair holdings alike.

    - `[ ]` **3.1.a The helper**

        - `observeCohortHoldings(candidates, resolve, cohort)` in `lib/store/kinds/cohort/check-support.ts`. Each
          candidate is `{ reference, field: "cohort" | "parent", path }`, built by its site from what it lists — store
          records for the rules and the verbs, `LifecycleEntry` for archive's trigger, since `LifecycleIndexEntry`
          carries no reference. `cohort` is the cohort's UID-bearing reference, compared with `sameOwner`.
        - It resolves each distinct segment once in the view `resolve`, through Task 1.4's `observeNamedRecord`; a
          segment resolving to another cohort or to nothing, or one that is not a slug (`SlugSchema.safeParse`; a pulled
          meta's `Cohort` is a free string), holds none. Any unavailable segment read makes the whole result
          `unavailable`, so every caller fails closed.
        - Each holding carries its candidate, the segment that holds, `sole` or `ambiguous` (the cohort among an
          `ambiguous` observation's candidates), and every segment's resolved current slug, so a caller can rewrite a
          whole path such as `pOld/s`.

    - `[ ]` **3.1.b The edit builder**

        - `cohortHoldingEdits(holdings, slug)` returns the ordered edits that re-point holdings onto `slug` — the current
          slug for the retiring paths, a renamed cohort's new slug for Task 5.2 — each a structured
          `{ record: type, name, UID; field; from; to }` change that the rename's report (Task 4.2) reuses. A
          subcohort's `Parent` whose open members' paths name it takes § 4's three edits in order, its completed members'
          `Cohort` after the second.

    - Build `test-first` (one behavior at a time):
        - over both backends, a member's `Cohort` on the cohort's current slug and one on its former slug each hold it
          `sole`, the second re-pointed by the builder onto the current path
        - over the ref backend, a segment naming a slug two cohorts share holds `ambiguous` for each
        - a path on another cohort, on nothing, or not a slug holds none, and an unavailable segment read makes the
          result unavailable
        - a subcohort's `Parent` on a former slug with open members there yields the three edits in order, a completed
          member's after the second
        - fixtures place a holding on a former slug by renaming the cohort document with a direct store write, which both
          backends record as a former slug

### `[ ]` **3.2 Count holders by resolution in the open-members rule and archive's closeout rule — § 7.2**

- _Goal:_ No close the store admits — archive's in-batch close, `arc cohort close`, or `arc cohort remove` — leaves an
  open record that holds the cohort, a record on a former slug included, and none admits on evidence it cannot read.

    - `[ ]` **3.2.a `cohort.open-members`**

        - `checkCohortOpenMembers` (`kinds/cohort/rules.ts`) lists the open members and open subcohorts in the view after
          the batch and resolves their segments in the view before it, counting an ambiguous segment only where its
          candidates include the retiring cohort; its condition names each holder and, on a former slug, its edit.

    - `[ ]` **3.2.b Archive's closeout rule**

        - `checkCohortArchiveCloseout` counts by the same resolution in the views before and after the batch, and
          `observeOpenCohortHoldings`, whose text count it was the only consumer of, is removed.

    - Build `test-first` (one behavior at a time):
        - closing a cohort an open stub holds by a former slug refuses `cohort.open-members`, naming the stub and its edit
        - a member the same batch archives no longer counts
        - over the ref backend, a clash between two other cohorts blocks no retirement
        - archive's closeout rule admits a batch leaving open a cohort a record on a former slug still holds
        - a segment read that refuses makes each rule refuse rather than admit

### `[ ]` **3.3 Leave a held cohort open at archive, and report the record on a former slug — § 7.2**

- _Goal:_ Archiving a cohort's last current-path member lands the member and leaves the cohort open where a record on a
  former slug still holds it, reporting that record with its edit, rather than refusing or closing the cohort under it.

    - Archive's trigger in `prepareObservedCohorts` (`lib/work-unit/verbs/archive-store.ts`) counts each cohort's open
      holders through `observeCohortHoldings` in place of `isArchivalTriggeredWithDescendants`'s text match, its
      candidates built from `view.result.entries` (`LifecycleEntry`, which carries a reference, unlike
      `membershipIndex`'s entries), the subject marked completed in `runStoreArchive`'s preparation, and the open
      subcohorts less those the same batch closes, resolved in the store its cohort preparation holds. The in-repo
      archive keeps `isArchivalTriggeredWithDescendants` (`verbs/archive.ts`).
    - The report comes only from the final `prepareStoredCloseout` preparation, the one with no writes that
      `reportStoredArchive` consumes, which every archive reaches after publication (`settleStoredArchiveSteps`), its
      holdings joining the `notices` that become `warnings`; `runStoreArchive`'s preparation, and a closeout preparation
      that writes, report none.

    - Build `test-first` (one behavior at a time):
        - archive of the last current-path member, with an open stub on the former slug, lands, leaves the cohort open,
          and reports the stub with its edit once, on the first run and on the retry path
        - a rerun for a member at `p/s` that closes `s` and finds `p` held by a former slug reports that holder once
        - with no such record, archive closes the cohort as today

### `[ ]` **3.4 Close a cohort — § 8.1, § 8.5**

- _Goal:_ `arc cohort close <cohort>` places a cohort completed once no open record holds it, writing only with `--yes`.

    - The off-branch arm in `handlers/cohort.ts` (Task 1.9.a), replacing the dormant refusal where `usesOffBranchState`
      holds; its subject through Task 2.2's resolver.
    - It refuses a completed cohort, a document with unresolved conflicts (naming them), and a cohort an open member or
      open subcohort holds by resolution, naming each holder with what settles it — for one on a former slug the
      re-pointing edit, then its archive, its abandon, or clearing its `Cohort`; `cohort.open-members` backstops it.
    - Without `--yes` it prints what it will close and exits non-zero, as abandon does (`handlers/abandon-store.ts`),
      `--json` emitting the plan under a refused status; with it, one batch places the document completed in the current
      quarter, the ref backend assigning the next sequence where no member archives in the batch, under the provenance
      verb `cohort-close`, with no push.
    - `--json` emits the cohort's reference, its placement after the batch as re-read, as archive's is, and, once
      Task 3.6 adds it, any parent reported.

    - Build `test-first` (one behavior at a time):
        - over both backends, a cohort with no open holder closes with `--yes`, and prints its plan and writes nothing
          without it
        - a cohort an open member holds refuses naming it; one an open stub holds by a former slug refuses naming the
          edit and the moves that settle it, and closes once the stub is archived
        - a parent whose subcohort's `Parent` and open member a pull left on its former slug refuses naming § 4's three
          edits in order, and each edit lands as its own write
        - a completed cohort refuses; one selected by UID closes the same way
        - over the ref backend, under a clash of the cohort's own slug, close refuses while a candidate naming it holds

### `[ ]` **3.5 Remove a cohort — § 8.2, § 8.5**

- _Goal:_ `arc cohort remove <cohort>` removes a cohort no record has ever held, so no record names a removed one.

    - The off-branch arm in `handlers/cohort.ts`: it refuses, naming `arc cohort close`, while any record holds the
      cohort — a member open or completed, a subcohort open or closed — found by resolution; `cohort.open-members`
      backstops the open half. It removes the document through a `remove` mutation, as decomposition's discard does,
      under the provenance verb `cohort-remove`, with no push; its conflicts, `--yes`, and `--json` behave as close's.

    - Build `test-first` (one behavior at a time):
        - over both backends, a cohort nothing ever named is removed with `--yes`
        - a cohort an archived member names refuses naming `arc cohort close`
        - over the ref backend, with cohorts A and B on one slug and a record naming it, after B's rename
          `arc cohort remove <B uid>` lands, and A's remove still refuses while the record names the slug

### `[ ]` **3.6 Report a cohort left with nothing open from abandon, close, and remove — § 8.3, § 7.2**

- _Goal:_ Wherever a verb's batch leaves a cohort with no open holder, its result names the command that retires it, and
  that command never refuses on a holder the report missed.

    - `runStoreAbandon` (`lib/work-unit/verbs/abandon-store.ts`) evaluates the cohorts the subject's `Cohort` segments
      resolve to, from a fresh read after its batch lands: each left with no open member or subcohort, counted by
      resolution over open records, is named with `arc cohort close <cohort>`, or `arc cohort remove <cohort>` where no
      record holds it, counted over every record. A segment ambiguous among cohorts evaluates each cohort it may name,
      and the command names a cohort by slug, or by UID where its slug is tied. The report rides
      `AbandonResult.notices`, which `handleStoreAbandon` prints; evidence that cannot be read becomes a notice saying
      so, and never fails the landed abandon. Abandon closes no cohort.
    - A close or remove that empties a parent reports the parent the same way, in its text and `--json`.

    - Build `test-first` (one behavior at a time):
        - abandoning a cohort's last open member names `arc cohort close`, which then closes it
        - abandoning the only member of a cohort no other record ever held names `arc cohort remove`
        - a cohort still holding an open record is not reported
        - unreadable evidence after the batch yields a notice and a successful abandon
        - over the ref backend, abandoning a member under a two-cohort tie of its cohort's slug names
          `arc cohort close <uid>`
        - closing, and removing, a parent's last open subcohort reports the parent

### `[ ]` **3.7 Refuse a member's cohort read on a removed cohort, naming the edit to its `Cohort` — § 8.4**

- _Goal:_ A member a pull lands naming a removed cohort is told how to repair it, where the store's not-found remedy
  names a pull that cannot.

- _Note:_ `lib/store/lifecycle-rename.ts` also changes on `feat/seam-delivery-review`; merge base after it lands, before
  this task edits it (§ 11.2).

    - Archive's cohort read (`prepareObservedCohorts`) and the rename's member-heading read (`acquireRenameGroups`,
      `lib/store/lifecycle-rename.ts`) refuse a `Cohort` naming no document, naming the member and the edit that clears
      or re-points it, in place of `resolveCapturedReference`'s "Pull state or name the owner by UID, then retry".

    - Build `test-first` (one behavior at a time):
        - archive and rename of a member naming a removed cohort each refuse naming the edit, and land after it
        - the session frame reads the missing document as none (`readStoreCohortDoc`), as today

### `[ ]` **3.8 A cohort retired end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: every retiring path refuses or stays open while a record holds
  the cohort, and each report names a command that then lands.

- _Note:_ Both backends choose a closing cohort's letter from its subcohorts' `Parent` text (`cohortClosePlacement`), so
  a closed subcohort left on its parent's former slug does not count toward the parent's letter.

## **Phase 4:** The work-unit rename under a clash

_Purpose:_ Let `arc rename` select a work unit by UID or slug and land under a clash of its own slug, changing only what
names its subject: the target through the shared admission check, the edges a reused slug settles, the references that
resolve to the subject alone, its own checkout found by UID, and each branch step decided from who links the branch.

_Mode:_ `slice` — closes on a clash of two work units repaired by renaming one by UID, end to end.

_Exit criterion:_ Over the ref backend, with two live work units holding one slug, the clash refusal names
`arc rename <uid> <new-slug>`; the rename by UID lands, rewrites no other record naming the slug, reports each with its
edit, and leaves the slug resolving to the other holder; with both linking one branch, the rename moves only the
subject's checkout and keeps the old remote branch, and the catch-up run moves a branch the first run left; renaming the
second holder away reports the former-slug tie; and a rename onto an archived work unit's slug lands, on a clone lacking
its history refs, discharging the edges naming it.

### `[ ]` **4.1 Select the rename's subject inside the rename, and repeat the operand in retries — § 1.3, § 2.1**

- _Goal:_ `arc rename <slug|uid> <new-slug>` starts from the record Task 2.2's resolver selects, never reads its subject
  by name again, and repeats the operand the person gave in every retry and continuation it prints.

- _Note:_ `lib/store/lifecycle-rename.ts` also changes on `feat/seam-delivery-review`; merge base after it lands, before
  this task edits it (§ 11.2), and read its `VerbBase.workItem`, the work item an invocation selects, beside this task's.

- _Note:_ The Integrating advisories match the origin name as text, so under a clash they may name the other holder's
  dependents; they stay advisory, as § 2.1 keeps them.

    - `[ ]` **4.1.a The entry contract**

        - `runStoreRename`'s params become `{ operand, targetSlug }`; `rename()` (`lib/work-unit/verbs/rename-store.ts`)
          resolves and dispatches the operand inside `runStoreRename`'s retry, which Task 4.6 turns into the history
          rounds, so the cohort arm inherits them, in place of `SlugSchema.parse` of the source. An Errand refuses naming
          `arc errand close <uid>`; a cohort dispatches to the cohort arm, which refuses `unsupported` until Task 5.1.
        - `readStoreRenameSubject` takes the selected primary in place of its `readWorkUnit` read; the inventory read,
          the Candidate check, and the Integrating advisories over `readLifecycleView` stand, and `renameOrigin` already
          reads by reference. The result carries the subject's kind, name, and UID.
        - _Retired in:_ Phase 5

    - `[ ]` **4.1.b The retry and the continuation**

        - `renameSteps`' `retryCommand` and `finishRename`'s remedy argv take the operand in place of the subject's
          original name and the requested source slug.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, with two live work units holding one slug, the rename by UID selects the named one, an
          upper-case UID included, and by slug refuses with `clashRepair`'s remedy
        - a UID selecting an Errand refuses naming `arc errand close <uid>`
        - a retry after a failed push prints the UID operand given; a rerun by slug resolves the subject's current name
        - an archived work unit's rename lands as today

### `[ ]` **4.2 Give the rename's result one report, and `--json` — § 4, § 2.5, § 2.7**

- _Goal:_ Everything a rename leaves to the person — references, a member heading, a former-slug tie, a kept branch —
  reaches them in one typed report, in text and in `arc rename --json`, a failed push included.

- _Note:_ `cli.ts` also changes on `feat/seam-delivery-review`; merge base after it lands, before this task edits it
  (§ 11.2).

    - `[ ]` **4.2.a The report**

        - The rename result's report holds: per record left, its type, name, and UID with the ordered edits that re-point
          it, Task 3.1.b's edit type; a member heading's document, line, and replacement, with no command; a former-slug
          tie with its repair; each kept branch with its reason — adopted, another holder's link, or a continuation — and
          the catch-up command where one applies. `keptBranches`' strings give way to it, and the cases asserting them
          change: `rename-store-command.test.ts`, `lifecycle-rename-report.test.ts`, `lifecycle-program.test.ts`, and
          `rename-store.test.ts`.
        - A `partial` result after the batch lands, on a failed push, carries the report, since a continuation runs no
          batch.

    - `[ ]` **4.2.b `--json`**

        - `arc rename` registers `--json` (`cli.ts`, through the interaction adapter), `RenameCommandInputSchema` and its
          schema fields take `json`, and a `renamed` or `partial` result emits one typed envelope, its `status` the
          result's, with the subject's reference, the report, and a `partial` result's reason and remedy. A refusal
          emits through `refuseWithRemedy`'s JSON form, a rejection carrying no remedy taking
          `spineRemedy(reason, …, ["arc", "status", "--json"])` as `arc publish`'s does (`handlers/lifecycle.ts`), and an
          unbound marker's through `refuseUnboundTarget`'s (Task 4.8); `reportRenameResult`
          (`handlers/lifecycle-rename-report.ts`) renders the same report as text.
        - `handleRename` gives the in-repo arm's result and refusals the same `--json` forms before the flip, its report
          empty; its text output stays today's.
        - The option takes a `declareCliOptionSite("json", …)` machine-mode site in
          `lifecycleCommandInputPolicyDeclarations` (`handlers/lifecycle.ts`), as `publish`'s does, and the
          `rename:option.json` inventory entry `repository-inventory.test.ts` reconciles, with whatever the no-input suite
          (`NO_INPUT_MATRIX`, `no-input-invocations.test.ts`) then requires of the rename entry.

    - Build `test-first` (one behavior at a time):
        - a rename that leaves references prints them, and emits them under `--json`
        - a failed push's `partial` result carries the report, in text and `--json`
        - a refusal under `--json` emits the lifecycle refusal's JSON form, and a rejection with no remedy its fallback
        - before the flip, `arc rename --json` emits the in-repo result with an empty report, and its text is unchanged

### `[ ]` **4.3 Admit the target through the creation check — § 2.2**

- _Goal:_ A rename may take a slug a completed work unit holds, as creation may, and refuses any slug a live holder or a
  refusing completed holder has, naming each holder and telling the person to choose another slug.

    - The target runs `checkCreationAdmission` (`lib/store/creation-admission.ts`) with the subject as writing owner,
      replacing the arm's own collision check in `readStoreRenameSubject`, which moves into a helper the cohort arm keeps
      (Task 5.4).
    - A held or refused answer becomes a `lifecycle.rename` refusal carrying `renderCreationAdmissionRefusal`'s condition
      and remedy, its "retry creation" worded for the rename, never the admission's `ambiguous-match`, which the
      renderers would print as the clash's repair. `rename-store.test.ts`'s case asserting `record-malformed` changes.

    - Build `test-first` (one behavior at a time):
        - over both backends, renaming onto an archived work unit's slug lands
        - renaming onto a live holder's current or former slug refuses naming that holder by type, name, and UID, with
          the remedy to choose another slug
        - a resumed rename, and a rename back to the subject's former slug, land
        - on a resume, a subject with unresolved conflicts refuses as any holder does

### `[ ]` **4.4 Settle the edges naming a reused slug in the rename's batch — § 2.3**

- _Goal:_ A rename onto a reused slug leaves no edge naming the subject itself or the slug's prior holder unsettled where
  the rename may write it, and refuses where only a dependent's owner can settle one.

    - `[ ]` **4.4.a The batch carries observations**

        - The prepared rename (`PreparedStoreRename`, over `PreparedLifecycleWrite`) carries observations into its batch,
          where `applyPreparedLifecycleWrite` passes none today, so the settler's observations and the retired-edge
          records reach it.

    - `[ ]` **4.4.b Stubs' edges**

        - Through `settleCreationSlugEdges` (`lib/store/creation-slug-settlement.ts`) with the subject as writing owner,
          the rename's reference sweep seeded from the settler's puts, so each stub takes one put.

    - `[ ]` **4.4.c The subject's own edge**

        - Its edge naming the target is discharged where the prior holder shipped, otherwise replaced or dropped through
          `resolveRetiredEdge` and `replaceDependencySlot`, in the subject's own meta write.

    - Build `test-first` (one behavior at a time):
        - renaming onto an archived work unit's slug discharges a stub's edge naming it and the subject's own
        - an edge on a retired origin's slug takes its lineage disposition, its records bound as observations
        - an in-flight dependent's edge naming the target refuses through `work-item.slug-edges` with its remedy
        - a stub whose edges name both the subject's current slug and the target refuses through `work-item.slug-edges`,
          and lands once that stub's edge on the target is settled

### `[ ]` **4.5 Rewrite only the references that resolve to the subject, and report the rest — § 4**

- _Goal:_ A work unit's rename changes another record's reference to its old slug only where that slug, resolved among
  work items, names the subject alone, and reports every reference to the subject it leaves.

    - `[ ]` **4.5.a Resolving once**

        - Before its batch the verb resolves the old slug among work items once, through a resolver Task 5.2 shares for
          cohorts: names the subject → the sweep over records the subject does not own (`acquireRenameGroups`,
          `planRenameReferences`, `renameMutation`), `renameMeta`'s `waits-on` branch, and the cohort document's
          backticked filenames rewrite as today; ambiguous — the family includes Errands, so a work unit and an Errand
          sharing the slug are this case — → rewritten none and each reported; names another holder → left unreported.
        - A started dependent's edge keeps the old slug, as today, and is reported with the edit that re-points it.

    - `[ ]` **4.5.b The member heading**

        - The rename rewrites its member heading in the cohort document its own `Cohort` names unless another work item
          holding the old slug as its current or a former name holds that cohort, asked through
          `observeCohortHoldings` over those work items' `Cohort`; then the heading is reported with its edit.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, renaming one of two work units sharing a slug rewrites no other record naming the slug,
          reports each with its edit, and leaves the slug resolving to the other holder
        - renaming the work unit of a work-unit and cohort pair rewrites its stubs' edges as with no clash
        - renaming a duplicate stub of a doubled cut, it and its original both holding the original cohort, reports its
          member heading and leaves the heading unchanged
        - a started member's prose is neither rewritten nor reported
        - an ended subject whose slug a live item reused leaves that item's references unreported

### `[ ]` **4.6 Pull history refs round after round — § 2.6**

- _Goal:_ A rename batch that writes completed records lands on a clone lacking their history refs, pulling each round
  only the refs the backend names.

    - In place of `runStoreRename`'s one retry, pull the refs each `state-unresolvable` names through
      `pullHistoryForRetry` and retry until the batch lands, a round's refusal names no refs or only refs already pulled,
      or the pull returns false, which ends the rounds with the refusal the round holds, its notices written through the
      arm's notice writer; the `recovery === undefined` guard holds every round.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, renaming an archived work unit whose cohort archive closed lands on a clone lacking both
          history refs
        - a designation question during a round ends the rounds with its notice
        - a refusal naming no refs, or only refs already pulled, ends the rounds with it

### `[ ]` **4.7 Report a former-slug tie the batch leaves — § 2.7**

- _Goal:_ Renaming the second holder of a repaired clash away from the slug reports the former-slug tie it leaves and its
  repair.

    - After its batch the rename looks the old slug up; an `ambiguous-match` with `tie.name: "former"` enters the report
      with `clashRepair`'s repair, naming the intended holder by its current name.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, renaming both holders of a clash off the slug, the second reports the tie

### `[ ]` **4.8 Pin the subject's checkout by UID, and type the unbound-marker refusal — § 2.4**

- _Goal:_ Under a clash the rename never takes the other holder's checkout, and an unbound marker naming the slug refuses
  before the batch with the holders and the exits that recover each checkout, in text and `--json`.

    - Already shipped: `rename()` finds its checkout through `findWorkUnitHoldingCheckout`
      (`lib/work-unit/verbs/unshared-work.ts`) by an owner request matched by UID, and an unbound marker naming a current
      or former slug throws `classifyUnboundMarker`'s report with `arc locus release` under a clash.
    - `findWorkUnitHoldingCheckout` flattens the `unbound` result to a thrown string, which `runStoreRename`'s catch
      reports as text; the rename reads its checkout through `readWorkUnitCheckout` instead, keeping the typed `unbound`
      result, and returns it as a refusal before the batch, rendered through `refuseUnboundTarget`
      (`handlers/lifecycle-shared.ts`), its parameter narrowed to the `reason` and `exits` it reads, which its three
      callers' classifications still satisfy, its envelope carrying the exits as its remedy. Two marker holders keep the
      shared lookup's refusal (`requireSingleHolder`, `lib/locus/lifecycle-ports.ts`), which names each checkout and its
      reason; the lookup is unchanged.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, under a clash, renaming a work unit whose checkout carries an unbound marker refuses before
          the batch naming both holders by UID and the release exit, in text and `--json`
        - two markers holding the slug refuse before the batch with the shared lookup's refusal naming each checkout
        - after release and the rename, `arc materialize <new-slug>` brings back the subject's checkout, and
          `arc materialize <slug>` the other holder's, each with `--here` where release kept the checkout

### `[ ]` **4.9 Decide the first run's branch steps from the branch's link lookup — § 2.5**

- _Goal:_ Where two holders link one branch, a first run moves only its own subject's branch and checkout, never
  deletes a remote branch another live holder links, and reports each branch it keeps with its reason.

    - `[ ]` **4.9.a The local branch**

        - Before its batch the first run reads `lookup({ kind: "ref" })` of the branch the subject's link names, as
          teardown's branch gate does (`teardown-store.ts`). The local branch is renamed and the link moved where the
          subject's own checkout here has the old branch checked out, or the lookup returns the subject; with the subject
          returned but no local copy, the rename refuses before its batch, as today. Otherwise there is no branch step,
          the link is unchanged (`renameMutation`), and the report keeps the branch with the catch-up command.

    - `[ ]` **4.9.b The remote branches**

        - The new name is pushed where the link moved and the old branch was published (`reconcileRenameRemoteBranch`).
          The old remote branch is deleted after `requirePublishedPreservation` only where the link was created and the
          lookup returns the subject, a completed holder, or nothing; otherwise it is kept, as `keepOld` keeps an adopted
          branch's, and reported with its reason. The report's delete command, which `retained` prints today, appears
          only for a branch that is the subject's own, and no branch step no longer reports a published branch
          `unpublished`.

    - Build `test-first` (one behavior at a time):
        - over the ref backend, with both work units linking one branch, renaming one from its own checkout's machine
          moves that checkout and never the other's, and keeps the old remote branch, printing no delete command
        - run where no checkout of the subject holds the branch, it lands with the branch and link unchanged, reporting
          the branch kept with the catch-up command
        - a rename with no clash renames, pushes, and deletes on its first run as today

### `[ ]` **4.10 Keep the old remote branch on every continuation — § 2.5**

- _Goal:_ A rerun after a failed push or a refused delete completes the rename without deleting the old remote branch,
  and the preservation refusal tells the person how to settle the branch whichever holder's it is.

    - A continuation pushes what remains and reports the old branch kept, never deleting it, so
      `requirePublishedPreservation` is reachable only on a first run. On the store arm its remedy names both readings —
      merge the commits and delete the old branch if they are this work unit's, leave it if the branch is another's —
      through an optional remedy parameter on `reconcileRenameRemoteBranch` that `finishRename` passes; the in-repo arm
      (`commands/rename.ts`) passes none and keeps today's text.

    - Build `test-first` (one behavior at a time):
        - a continuation after a failed push keeps the old remote branch, with a clash and without one;
          `rename-store-command.test.ts`'s case expecting the continuation to delete it changes
        - the preservation refusal names both readings, and a continuation then completes with the branch kept
        - before the flip, the preservation refusal reads as today

### `[ ]` **4.11 Move a branch the first run left through the catch-up run — § 2.5, § 3.3**

- _Goal:_ Rerunning the rename with the subject's current slug on the machine holding its checkout renames the branch a
  first run left and moves its link, ending the branch-link tie.

    - `arc rename <uid> <slug>`, with the subject's current slug, finds the checkout by UID; where it holds a branch the
      subject's link names after one of the subject's former slugs (`record.aliases`, since `renameOrigin` gives only the
      newest), it renames that branch to `<prefix>/<slug>`, moves the link in a link-only batch, and pushes the new name,
      keeping the old remote branch. The checkout's marker and folder are unchanged. Elsewhere a continuation still runs
      no local step (`persistRename`), and `branchRename` matches only a branch named after the current slug.

    - Build `test-first` (one behavior at a time):
        - after a first run elsewhere, the catch-up run on the checkout's machine moves the branch and link and keeps the
          old remote branch
        - before the catch-up, the other holder's rename, run where its own checkout is not, leaves the branch both links
          name and keeps the old remote branch
        - after the catch-up, the branch-link lookup returns one holder and the session-start checks warn no more

### `[ ]` **4.12 A work-unit clash repaired by rename end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: a clash of two work units refuses naming the rename, the rename
  by UID lands changing only what names its subject, and the slug then resolves to the other holder.

## **Phase 5:** The cohort rename

_Purpose:_ Rename an open cohort as one version-checked batch the store's checks admit — its document, heading, and own
`Parent`, every record holding it alone, and the references to its filename — whatever its members' states, on a clone
missing their history refs.

_Mode:_ `slice` — closes on a parent cohort with members in every state renamed in one batch, end to end.

_Exit criterion:_ Over both backends, renaming a parent cohort with a started member, a completed member, an open
subcohort, and a closed subcohort with a completed member lands in one batch, and over the ref backend on a clone
lacking the completed records' history refs, after which every one of them names the new slug and the document's
heading, the subcohorts' `Parent`, and the stubs' and open documents' filename references name it; over the ref
backend, renaming one of two cohorts sharing a slug rewrites none of the other's members and reports a subcohort naming
the slug with the edits that re-point it, in order, which then land; and an edit putting a member's `Cohort` back on the
old name refuses naming the current one.

### `[ ]` **5.1 Write a cohort's document, heading, and own `Parent` under its new name, in one batch — § 5.1, § 5.2**

- _Goal:_ `arc rename <cohort> <new-slug>` renames an open cohort's document, recording its former slug, with its
  heading and its own `Parent` rewritten so its members' rewritten paths agree with it, in one version-checked batch
  that writes only what changes.

- _Note:_ `lib/store/lifecycle-rename.ts` and `cli.ts` also change on `feat/seam-delivery-review`; merge base after it
  lands, before this task edits them (§ 11.2).

    - `[ ]` **5.1.a The arm and its batch**

        - The cohort arm, in its own module, takes Task 4.1.a's dispatch in place of its `unsupported` refusal. Its batch
          puts each record whose content changes once, combining Tasks 5.1–5.3's rewrites, since `BatchInputSchema`
          refuses a duplicate, and binds every record it read but leaves unchanged — the parent, an ambiguous holder,
          another cohort's members — as an observation, never through `applyPreparedLifecycleWrite`, which puts every
          acquired record.
        - The document's put carries its UID-bearing owner under the new name, the rename `requestedRenames` and
          `resolvedOwnerWrite` read, as `renameMutation` does, and the backend records the former slug
          (`prepareRefRenames`); its `# Cohort:` heading through `rewriteCohortHeading`, and a `Parent` naming its parent
          by a former slug through `writeCohortParent` at the parent's current slug.
        - Its result takes Task 4.2's report under the cohort's reference, old and new slug, in text and `--json`. A rerun
          whose target is already the cohort's name, its old slug resolving as a former one, reports the cohort already
          renamed and writes nothing.

    - Build `test-first` (one behavior at a time):
        - over both backends, an open cohort with no members is renamed, its heading names the new slug, its old slug
          resolves to it as a former name, and the result prints and emits the rename
        - a subcohort whose `Parent` a pull left on its parent's former slug has it rewritten to the current one
        - a rerun after the batch landed reports already renamed and writes nothing
        - the batch puts only changed records, every unchanged read bound as an observation

### `[ ]` **5.2 Rewrite every record holding the cohort alone, and report the ambiguous ones — § 5.1, § 4**

- _Goal:_ Every member and subcohort that holds the cohort alone names its new slug after the batch, whatever its state,
  and none of another cohort's records sharing the slug is touched.

    - `observeCohortHoldings` over every record: each member's `Cohort`, open or completed, started members included, and,
      for a parent, its subcohorts' members' and every subcohort's `Parent`, open or closed; holdings resolve among
      cohorts through Task 4.5.a's resolver, never through the cross-family slug lookup.
    - A `sole` holding is rewritten — each `Cohort` through `writeMetaCohort` (`kinds/meta/bullet-writers.ts`) to the
      current path its segments resolve to, the new slug in the renamed cohort's segment, and each `Parent` through
      `writeCohortParent`. An `ambiguous` holding is not rewritten; Task 4.2's report lists it with
      `cohortHoldingEdits` onto the new slug, a subcohort's as § 4's three edits in order and its completed members'
      after the second.

    - Build `test-first` (one behavior at a time):
        - over both backends, renaming a subcohort `s` of `p` to `t` turns its members' `p/s` into `p/t`, and renaming `p`
          to `q` turns them into `q/s`, a member left on either former slug included
        - over both backends, renaming the cohort of a work-unit and cohort pair sharing a slug rewrites its members as
          with no clash
        - renaming a cohort whose started member's prose names it rewrites the `Cohort` and leaves the prose
        - over the ref backend, renaming one of two cohorts sharing a slug rewrites none of the other's members and
          reports a subcohort naming the slug, with an open and a completed member, with the edits in order, which then
          land

### `[ ]` **5.3 Rewrite references to the document's filename where the old slug names the cohort alone — § 5.1, § 4**

- _Goal:_ Stubs and open cohort documents citing `` `cohort-<old>.md` `` name the new file after the batch where the old
  slug names the cohort alone, each such reference is reported where it is ambiguous, and no work-item reference sharing
  the text changes.

    - A filename-reference rewriter in the cohort kind's folder rewrites the references in the stubs the rename sweeps —
      the whole group less the cut map, as `renameSweepRecords` selects — and in open cohort documents, where Task 4.5.a's
      resolution among cohorts names the subject alone; ambiguous among cohorts, none is rewritten and each is reported.
      The work-item sweep (`rewriteBacktickedArtifactReferences`) keeps leaving every `cohort-` reference unchanged.

    - Build `test-first` (one behavior at a time):
        - a parent's citation of a renamed subcohort's document, and a stub's, name the new file
        - over the ref backend, under a two-cohort clash, the filename references are rewritten none and each is reported
        - a work-item edge whose text equals the cohort's old slug is unchanged
        - a closed cohort's document keeps its text

### `[ ]` **5.4 Refuse a closed cohort and a taken target — § 5.1, § 5.4, § 5.5**

- _Goal:_ A cohort is never renamed once closed, and never onto a slug any holder's name resolves through.

    - A closed cohort refuses terminally: no verb renames a closed cohort.
    - The target check is today's lookup check, the helper Task 4.3 extracts, not 4.3's admission, which frees a
      completed work unit's slug: the lookup finds nothing or returns the subject (`sameReference`); any other lookup
      refusal passes through whole; a taken target refuses naming each holder the lookup returns or ties, through an
      exported `holderCondition` (`lib/store/creation-admission.ts`), with the remedy "Choose another slug."

    - Build `test-first` (one behavior at a time):
        - renaming a closed cohort refuses
        - renaming onto a completed work unit's slug refuses naming it, while an abandoned work unit's slug, its primary
          removed, is free
        - renaming a cohort a stored cut map names lands; the cut's `--finish` then refuses `cohort-parent` naming
          `--revise`, after which `--revise` re-places the cut and `--finish` lands

### `[ ]` **5.5 Land the mixed-state batch through the history rounds — § 5.3**

- _Goal:_ The cohort rename's batch, whose completed members and closed subcohorts Task 5.2 writes in place, lands
  whatever its holders' states, on a clone missing their history refs.

    - The arm runs inside Task 4.6's rounds through Task 4.1.a's dispatch; a completed member's path takes `meta.cohort`'s
      completed-meta rule and an open straggler of a closed subcohort its re-pointing rule (Task 1.7).

    - Build `test-first` (one behavior at a time):
        - over both backends, renaming a parent cohort with a started member, a completed member, an open subcohort,
          and a closed subcohort with a completed member lands in one batch
        - over the ref backend, the same batch lands on a clone lacking the completed records' history refs
        - renaming a parent whose closed subcohort holds an open stub a pull landed after its close lands, re-pointing it

### `[ ]` **5.6 A cohort renamed end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: one batch renames a cohort and every record holding it alone,
  in every state, and the store's checks then hold every path to the new slug.

## **Phase 6:** Verification

### `[ ]` **6.1 Complete verification** — load and follow `verify-work-unit.md`

---

## Success Criteria

Over the ref backend and, where it can form the state, the reference backend, from the flip:

- `[ ]` With two live holders of one slug — two work units, a work unit and a cohort, a work unit and an Errand, two
  Errands, two cohorts — the slug lookup's refusal, the lifecycle verbs' and `arc rename`'s refusals, and
  `meta.depends-on`'s refusal of an edge naming the slug carry `clashRepair`'s remedy for those types; for two cohorts so
  do `meta.cohort`'s and `cohort.parent`'s refusals and session entry's, archive's, and a member's rename's.

- `[ ]` Status's `slug-clash` warning for two work units names `arc rename <uid> <new-slug>` for each, and a live
  former-slug tie's remedy names the intended holder by its current name.

- `[ ]` `arc rename <uid> <new-slug>` renames the named work unit or cohort under the clash, after which the slug resolves
  to the other holder.

- `[ ]` `arc errand close <uid>` and `arc errand abandon <uid>` each end the named Errand of two, after which the slug
  resolves to the other; a retry either prints repeats the UID; `arc errand promote <slug>` under the clash refuses naming
  `arc errand close <uid>` and lands on the remaining Errand once one closes.

- `[ ]` A UID operand selecting an Errand on `arc rename`, a work unit on `arc errand close`, or nothing refuses as § 1.2
  states; an upper-case UID selects the same owner; a slug resolving to a cohort renames it; a closed cohort refuses.

- `[ ]` Renaming a work unit onto an archived work unit's slug lands, discharging a stub's edge and the subject's own edge
  naming it, and refuses while an in-flight dependent's edge names it; onto a live holder's current or former slug it
  refuses naming that holder; a resumed rename and a rename back to a former slug land.

- `[ ]` Renaming one of two work units sharing a slug rewrites no other record naming the slug, reports each with its
  edit, and leaves the slug resolving to the other; renaming one of two cohorts reports a subcohort naming the slug, with
  an open and a completed member, with the edits in order, rewrites none of the other's members, and the edits land;
  renaming the cohort of a work-unit and cohort pair rewrites its members as with no clash; renaming a duplicate stub of
  a doubled cut reports its member heading and leaves it unchanged.

- `[ ]` With both work units linking one branch, renaming an active one moves only its own checkout and keeps the old
  remote branch, as its continuation after a failed push does; run where no checkout of it holds the branch, it lands
  with the branch and link unchanged and reports the catch-up command, which then moves them; before that catch-up, the
  other holder's rename run where its own checkout is not leaves the branch both links name and keeps the old remote
  branch; a rename with no clash renames, pushes, and deletes as today.

- `[ ]` Renaming the second holder of a repaired clash away reports the former-slug tie, and a promotion under `--name`
  leaving the tie resumes when rerun by its new name.

- `[ ]` Renaming a parent cohort with a started member, a completed member, an open subcohort, and a closed subcohort with
  a completed member lands in one batch, on a clone lacking those records' history refs too, after which each names the
  new slug, as do the document's heading, the subcohorts' `Parent`, and the filename references; renaming a subcohort
  rewrites its members' paths, one left on its parent's former slug included, to the current path, and its own `Parent`
  where a pull left it there; renaming a parent whose closed subcohort holds an open stub a pull landed after its close
  lands, re-pointing that stub; renaming an archived work unit whose cohort archive closed lands on a clone lacking both
  their history refs.

- `[ ]` After a cohort rename, an edit putting a member's `Cohort` or a subcohort's `Parent` back on the old name refuses,
  naming the current one, and a completed member's rewrite to a completed cohort's current slug lands.

- `[ ]` `arc cohort close` refuses a cohort an open stub names by a former slug, naming the edit; archive of its last
  current-path member then lands, leaves it open, and reports the stub; a clash between two other cohorts blocks neither
  close nor archive's in-batch close; a parent whose subcohort's `Parent` and open member a pull left on its former slug
  refuses close naming § 4's three edits in order, which land.

- `[ ]` `arc cohort close` closes a cohort an abandon left with no open member, as that abandon's result named, and
  refuses a completed one; `arc cohort remove` removes a cohort nothing ever named and refuses one an archived member
  names, naming `arc cohort close`; without `--yes` each writes nothing; a member a pull lands naming a removed cohort
  refuses archive and rename naming the edit to its `Cohort`, and both land after it.

- `[ ]` Closing one of two clashed Errands by UID clears only its own finalized head locks, and on a machine holding no
  checkout of it refuses naming the machine holding its checkout; abandoning one returns only its own held inbox
  entries; a UID under partial protection refuses `not-found`.

- `[ ]` Under a clash, renaming a work unit whose checkout carries an unbound marker refuses before the batch naming the
  holders by UID and the release exit; after release and the rename, `arc materialize <new-slug>` and
  `arc materialize <slug>` bring back each holder's checkout.

- `[ ]` Before the flip every command behaves as today, but for § 10's refusal order, or refuses `unsupported` naming
  what serves.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
