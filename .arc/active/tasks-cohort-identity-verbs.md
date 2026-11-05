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

### `[x]` **1.1 Build a branch link's repair beside the clash repair — § 3.3**

- _Goal:_ A live branch-link tie names, per holder, the move that takes its link off the branch, and a completed one
  says no lifecycle repair is available, naming each holder's UID.

- _Outcome:_ Added `branchLinkRepair` with per-holder rename, catch-up, and Errand-close instructions on the holding
  machine; completed holders retain the UID-bearing no-repair result.

### `[x]` **1.2 Give each lookup arm's ambiguity its repair in both backends — § 3.1, § 3.3**

- _Goal:_ Every reader that meets a clash through the lookup prints a repair that names a command which ends it: the slug
  arm's `clashRepair`, the branch-link arm's `branchLinkRepair`, and the lineage, commit, and claim arms' narrowed text.

    - `[x]` **1.2.a The ref backend**

        - Lookup ambiguities use slug-tier repairs, branch-link repairs, or the UID-only instruction by lookup arm.

    - `[x]` **1.2.b The reference backend**

        - The reference lookup carries the same remedies and ranking facts over every supported holder pair.

    - `[x]` **1.2.c The readers that print it**

        - Lifecycle and paused-work renderers preserve the supplied remedy; view adds projected-file guidance only for
          completed ties. Clash fixtures now carry the store's own recovery instruction.

- _Outcome:_ Both backends give every lookup arm its applicable recovery; orphan, missing-worktree, and teardown reports
  preserve the branch-link instructions, including catch-up moves for renamed holders.

### `[x]` **1.3 Carry the tie and its repair on a refusal of a name — § 3.2, § 3.7**

- _Goal:_ A typed read or write naming its record by slug alone refuses under a clash with the tie its ranking tier
  gives and `clashRepair`'s remedy for it, so each reader that binds a name within one family names the repair.

    - `[x]` **1.3.a Binding a reference by name**

        - Name-binding refusals carry their preferred tier and derive the repair from each owner's recorded primary
          role, preserving requested secondary kinds on the candidates.

    - `[x]` **1.3.b Resolving a write's owner**

        - Lineage owner ties name the intended origin by UID; other owner ties use the live-current clash repair.

- _Outcome:_ Name-bound reads and writes preserve ranked recovery through session frames, archive, and rename;
  cross-family clashes remain isolated to their own typed reads.

### `[x]` **1.4 Observe an ambiguous record, and pass its remedy through the cohort, parent, and edge rules — § 3.5**

- _Goal:_ An edit naming a clashed cohort or slug in `Cohort`, `Parent`, or `Depends On` refuses with the clash's
  repair, while every rule reading through `observeRecord` behaves as today.

    - `[x]` **1.4.a The observation**

        - Added `observeNamedRecord` with explicit ambiguity evidence while preserving `observeRecord`'s existing type
          and behavior for other rules.

    - `[x]` **1.4.b The three rules**

        - Cohort, Parent, and dependency checks preserve an ambiguous reference's remedy and argv; multiple dependency
          problems combine their repairs under the status observation command. Other failures retain their fixed text.

- _Outcome:_ Ref-store writes naming ambiguous cohort or dependency holders now report the applicable repair rather
  than replacing it with generic field-edit instructions.

### `[x]` **1.5 Name the repair in the standing clash reports — § 3.6**

- _Goal:_ Status's `slug-clash` warning for two live work units, and Start readiness withholding a target under a clash
  the standing selection reports, name `arc rename <uid> <new-slug>` for each holder.

- _Outcome:_ Standing status warnings preserve each holder's UID, owner, and location and name both rename commands;
  Start readiness carries the same repair when a former-name target resolves to a clashed current name.

### `[x]` **1.6 Admit a cohort path segment only by its current slug — § 6.1**

- _Goal:_ `meta.cohort` and `cohort.parent` refuse a path segment that resolves through a cohort's former slug, naming
  the current one, so no text-matching membership reader misses a member edited back onto an old name.

- _Outcome:_ Cohort membership checks resolve both path segments and reject former names with the current slug;
  Parent writes apply the same rule. Absent first-segment documents retain the prior comparison, while unavailable
  observations refuse the write. Flattened the path check to keep the canonical-name and Parent checks separate.

### `[x]` **1.7 Let a completed meta, and an open meta re-pointing its holding, name a completed cohort — § 6.2**

- _Goal:_ A cohort rename can rewrite a closed subcohort's completed members and its open straggler, while an open meta
  still cannot join a completed cohort.

- _Outcome:_ Completed metas may name completed cohorts; open metas may only re-point an existing holding proved by
  the prior leaf's resolved owner. Closed-subcohort Parent and open-straggler path rewrites land together, while new
  joins and malformed prior holdings refuse.

### `[x]` **1.8 Add the cohort heading and `Parent` writers — § 5.2**

- _Goal:_ The cohort rename can rewrite a document's `# Cohort:` heading and its `**Parent:**` field through the kind's
  own writers, every other line unchanged.

- _Outcome:_ Exported exact heading and Parent writers through the cohort kind; both retain all unrelated bytes and
  line endings. Parent writes return null when the document has no Parent field.

### `[x]` **1.9 Register the cohort verbs and the UID operand forms, keeping every pre-flip arm as today — § 1.1, § 10**

- _Goal:_ The new commands and operand forms exist, and before the flip every verb behaves as today but for one refusal
  order: `arc cohort close` and `arc cohort remove` refuse `unsupported` naming what serves, and every operand is a slug.

    - `[x]` **1.9.a The `arc cohort` group**

        - Registered close/remove with distinct schemas, protected `--yes`, machine-readable output, input policies,
          and no-input coverage. Completed the lazy-loading and help inventories; both dormant arms name tracked
          cohort file edits and archive's sidecar sweep.

    - `[x]` **1.9.b The operand schemas**

        - Rename and Errand close/abandon accept slug or full UUID subjects, including upper case; rename's destination
          remains slug-only. Help describes UID selection while existing operand labels remain stable.

    - `[x]` **1.9.c The in-repo arms parse a slug once the store is open**

        - In-repo subjects retain slug validation after store opening and existing stdin admission, through the same
          input refusal paths. Earlier project-root refusals precede UUID rejection; lower-case UUIDs remain slugs.
          Shared the Errand terminal store boundary without growing the existing handlers.

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

### `[x]` **2.1 Scan the primary kinds a verb names for an exact UID — § 1.2**

- _Goal:_ One scan selects an owner by exact UID across the primary kinds its caller names, a cohort among them, and
  refuses a UID that selects more than one owner, naming each.

- _Outcome:_ UID scans accept caller-selected primary kinds and list each in its own family, retaining the two work-item
  defaults. Cross-family ties name each kind; incomplete listings preserve their own or their diagnostics' repairs.

### `[x]` **2.2 Resolve a subject operand by UID or slug under each verb's type rule — § 1.1, § 1.2, § 1.3**

- _Goal:_ Rename, the cohort verbs, and the Errand verbs share one operand rule from the flip: an operand `z.uuid()`
  accepts selects that exact owner by its lowercased UID, any other is a slug through the lookup, and each verb applies
  its own type rule to what is selected.

- _Outcome:_ Added `resolveSubjectOperand` with exact UID scans, optional slug lookup, primary re-reads, and the three
  verb type rules. Results retain the original operand, whole store refusals, or actionable unselected evidence; Errand
  slug operands pass unchanged to their runtime.

### `[x]` **2.3 Close and abandon an Errand by UID, the selected record replacing the slug — § 9.1, § 9.2**

- _Goal:_ `arc errand close <uid>` and `arc errand abandon <uid>` end the named one of two clashed Errands, every step
  that used the operand as the Errand's slug reading the selected record instead.

    - `[x]` **2.3.a Resolving before the protection branch**

        - Close and abandon select off-branch UID operands before protection dispatch. Missing or refused evidence renders
          under `identity-conflict` with its condition and repair; thrown listing reads use `identity-read`.

    - `[x]` **2.3.b Close**

        - Close carries the selected primary through its initial read, slug checks, and finalized fallback. Its target guard
          requires the exact local subject or a sole branch link before reading branch evidence.

    - `[x]` **2.3.c Abandon**

        - Abandon carries the selected primary through store reads and transitions. Its return plan keeps the original
          operand and compares the holding Errand by owner UID, retaining another same-slug owner’s entries.

    - `[x]` **2.3.d Retries repeat the operand given**

        - Terminal authority keeps the original operand in confirmation and off-branch retries, defaulting to the slug for
          callers that supply none.

- _Outcome:_ Exact UID-selected exits work under same-slug clashes without changing pull order. Marker corroboration
  now resolves a complete inventory’s overwritten slug entry through its full claim, preserving both checkout identities
  and the original discovery evidence. Real-ref command scenarios cover isolated retirement, held-entry retention,
  wrong-machine refusal and repair, and the unambiguous slug’s foreign-confirmation continuation.

### `[x]` **2.4 Clear only the selected Errand's finalized head locks — § 9.2**

- _Goal:_ Closing one of two clashed Errands never clears the head locks guarding the other's branch deletion.

- _Outcome:_ Finalized lock recovery accepts an optional claim and matches it beside the slug and checkout receipt.
  UID-selected close passes its validated claim; slug and in-repo recovery retain their existing slug-only match.
  A real-ref UID retry clears its own persisted HEAD receipt while preserving the other live Errand’s exact receipt.

### `[x]` **2.5 Pass the repair through promote's refusal, and recover by the promoted meta's receipt — § 9.3**

- _Goal:_ Under a two-Errand clash `arc errand promote <slug>` names `arc errand close <uid>`, and a promotion under
  `--name` that stops after its role write resumes when rerun by its new name.

    - `[x]` **2.5.a The refusal**

        - `readPrimary` retains each lookup or read refusal’s condition and remedy text in the reason promotion renders.
          The two-Errand clash therefore names its close-by-UID repair.

    - `[x]` **2.5.b The recovery**

        - Promotion history matches the meta’s exact `promotionReceipt`, retaining owner, target, branch-link, provenance,
          and recorded-cut checks independently of the retry operand.

- _Outcome:_ Closing the named UID repairs a two-Errand clash and lets promotion take the remaining slug. After a role
  write leaves a former-name tie, a retry by the promoted name settles the original Errand claim without changing the
  role-written meta or its recorded cut.

### `[x]` **2.6 A clashed Errand's exit end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: a clash of two Errands names its repair, the repair runs by
  UID on either verb, and the slug then resolves to the remaining Errand, which promote then takes.

- _Outcome:_ The real-ref registered-command scenario passed: UID close and abandon retire only the selected owner,
  retain the other holder and its locks or entries, and leave its slug selectable. Retries retain the UID; the
  wrong-machine stop repairs from the selected checkout; promotion names the close and takes the remaining Errand.

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

### `[x]` **3.1 Resolve each holding of a cohort once per view — § 7.1**

- _Goal:_ One helper says which records hold a cohort — a member's `Cohort` through each segment, a subcohort's
  `Parent` through its one — whether alone or ambiguously, and one builder says how to re-point a holding, so every
  retiring path and both renames count and repair holdings alike.

    - `[x]` **3.1.a The helper**

        - Added `observeCohortHoldings` with cached typed segment resolution, UID-based sole and ambiguous holdings,
          current path evidence, and child members retained from the caller's candidate view. Unavailable reads fail closed.

    - `[x]` **3.1.b The edit builder**

        - Added structured UID-bearing field edits with open-member clears before Parent and restorations afterward.
          Ambiguous child paths require repair first; closed subtrees stay with an ambiguous name's keeper, and unsafe
          clear/restore recipes onto a completed child are withheld.

### `[x]` **3.2 Count holders by resolution in the open-members rule and archive's closeout rule — § 7.2**

- _Goal:_ No close the store admits — archive's in-batch close, `arc cohort close`, or `arc cohort remove` — leaves an
  open record that holds the cohort, a record on a former slug included, and none admits on evidence it cannot read.

    - `[x]` **3.2.a `cohort.open-members`**

        - Lists open candidates after the batch and resolves before it, retaining former and relevant ambiguous
          holdings. Refusals name exact holders and ordered repairs; closed-child advice uses retained resolution-view
          Parent evidence without adding closed candidates to the open count.

    - `[x]` **3.2.b Archive's closeout rule**

        - Counts resolved holdings in each view and admits retaining a cohort still held through a former name.
          Removed the text-only observer; unavailable segment evidence refuses both rules.

### `[x]` **3.3 Leave a held cohort open at archive, and report the record on a former slug — § 7.2**

- _Goal:_ Archiving a cohort's last current-path member lands the member and leaves the cohort open where a record on a
  former slug still holds it, reporting that record with its edit, rather than refusing or closing the cohort under it.

- _Outcome:_ Archive uses identity-bearing lifecycle candidates and resolved Parent holdings, excluding the completing
  subject and subcohorts already closing in the batch. Former-name holders keep the cohort open and are reported only
  from the final persisted closeout plan with no writes, including publication recovery and nested reruns. Registered
  CLI tests can construct dependencies after the module reset, keeping real Git error identities coherent.

### `[x]` **3.4 Close a cohort — § 8.1, § 8.5**

- _Goal:_ `arc cohort close <cohort>` places a cohort completed once no open record holds it, writing only with `--yes`.

- _Outcome:_ Added off-branch close with shared slug/UID selection, conflict and completed-state refusal, resolved open
  holder diagnostics, and ordered field repairs. Confirmation gates one version-bound batch without publication; JSON
  and text report the assigned placement, while failed result reads retain the persisted close. The in-repo arm keeps
  its unsupported result.

### `[x]` **3.5 Remove a cohort — § 8.2, § 8.5**

- _Goal:_ `arc cohort remove <cohort>` removes a cohort no record has ever held, so no record names a removed one.

- _Outcome:_ `runCohortRemove` selects the cohort once, checks conflicts and every resolved holder, and removes the
  unheld document in one confirmed `cohort-remove` batch without publication. Close and remove share plan and result
  rendering; completed members and closed subcohorts retain the document. A named-history retry re-reads the selected
  UID and repeats the complete holding check with a fresh version, preserving a live cohort that reuses its slug.

### `[x]` **3.6 Report a cohort left with nothing open from abandon, close, and remove — § 8.3, § 7.2**

- _Goal:_ Wherever a verb's batch leaves a cohort with no open holder, its result names the command that retires it, and
  that command never refuses on a holder the report missed.

- _Outcome:_ `reportEmptyCohorts` evaluates each resolved cohort after the batch, using open and all-record holdings
  to recommend close or remove without retiring it automatically. Abandon appends the commands to its notices;
  close and remove carry structured parent reports in JSON and render them in text. Unreadable evidence remains an
  advisory beside the landed operation. Tied and UUID-shaped names use the intended owner's UID.

### `[x]` **3.7 Refuse a member's cohort read on a removed cohort, naming the edit to its `Cohort` — § 8.4**

- _Goal:_ A member a pull lands naming a removed cohort is told how to repair it, where the store's not-found remedy
  names a pull that cannot.

- _Outcome:_ Archive and rename contextualize a missing cohort with the member's identity, full `Cohort` path, and
  the edit that clears or re-points it. Other refusals retain their original recovery. Two-store pulls cover missing
  leaves and parents; each command completes after the field edit. Session context still treats the missing document
  as none.

### `[x]` **3.8 A cohort retired end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: every retiring path refuses or stays open while a record holds
  the cohort, and each report names a command that then lands.

- _Outcome:_ The registered-command scenarios passed over both backends: former-name stubs block close until cleared,
  archive retains and reports them, and unrelated cohort clashes block neither close nor archive closeout. Reported
  retirement commands execute; archived holders prevent removal; confirmation previews write nothing; and a pulled
  member naming a removed cohort archives after its field repair. Closeout letters still follow stored `Parent` text.

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

### `[x]` **4.1 Select the rename's subject inside the rename, and repeat the operand in retries — § 1.3, § 2.1**

- _Goal:_ `arc rename <slug|uid> <new-slug>` starts from the record Task 2.2's resolver selects, never reads its subject
  by name again, and repeats the operand the person gave in every retry and continuation it prints.

    - _Amended in:_ 4.11.R (A1)

    - `[x]` **4.1.a The entry contract**

        - Rename resolves its operand inside each retry, dispatches an Errand to its exit remedy and a cohort to the
          temporary unsupported arm, and passes the selected primary to `readStoreRenameSubject`. Results retain the
          exact subject reference; ordinary same-name requests refuse unless history identifies a prior rename.
        - _Retired in:_ Phase 5

    - `[x]` **4.1.b The retry and the continuation**

        - Rollback recovery and partial-push continuations retain the exact supplied operand. Backend-dependent
          admission lets a current-name continuation reach the store while preserving the in-repo same-name refusal.

- _Outcome:_ A real rejected push retains the uppercase UID in its remedy; retries by the current name retain that
  invocation's operand and complete without changing the record, marker, or HEAD. Fresh same-name requests refuse;
  archived renames retain their placement. Physical steps use the historical origin independently of the operand.
  Integrating advisories retain their text-based origin-name matching.

### `[x]` **4.2 Give the rename's result one report, and `--json` — § 4, § 2.5, § 2.7**

- _Goal:_ Everything a rename leaves to the person — references, a member heading, a former-slug tie, a kept branch —
  reaches them in one typed report, in text and in `arc rename --json`, a failed push included.

    - `[x]` **4.2.a The report**

        - `RenameReport` preserves ordered per-record edits, exact document identities and heading repairs, former-slug
          remedies, and retained branches with reasons and catch-up guidance. Both landed result arms carry it; failed
          remote completion retains the report, untouched links have their own reason, and in-repo results carry an
          empty one. Text document labels include keyed companions' keys.

    - `[x]` **4.2.b `--json`**

        - The registered machine-mode option and schema emit one typed landed result with its report and reference,
          including a partial result's reason and remedy. Refusals use the shared lifecycle envelope and status fallback.
          In-repo results carry a null reference and empty report; their text output is preserved.

- _Outcome:_ A real rejected push keeps the report and original UID retry in either presentation; repairing it and
  rerunning by current name completes with unchanged records and marker. Before the flip, a rejecting commit hook
  yields a JSON refusal and the repaired attempt returns an empty report.

### `[x]` **4.3 Admit the target through the creation check — § 2.2**

- _Goal:_ A rename may take a slug a completed work unit holds, as creation may, and refuses any slug a live holder or a
  refusing completed holder has, naming each holder and telling the person to choose another slug.

- _Outcome:_ Work-unit targets use shared creation admission with the exact writing owner. An archived current-name work
  unit's slug is reusable; refused targets name each holder and carry rename-specific guidance instead of clash repairs.
  Current-name continuations and a return to the owner's former name land; a conflicted continuation waits for repair.
  The cohort's strict namespace lookup is retained separately.

### `[x]` **4.4 Settle the edges naming a reused slug in the rename's batch — § 2.3**

- _Goal:_ A rename onto a reused slug leaves no edge naming the subject itself or the slug's prior holder unsettled where
  the rename may write it, and refuses where only a dependent's owner can settle one.

    - `[x]` **4.4.a The batch carries observations**

        - Prepared writes carry read-only observations into their atomic batch. Versions, conflict sets, and absences
          remain backend-checked without writing the observed records; refreshed or restored evidence permits retry.

    - `[x]` **4.4.b Stubs' edges**

        - Stub settlements seed the rename sweep, sharing one put per stub. Original versions and provider observations
          bind the batch. A newly observed stub outside the acquired groups forces a retry; started dependents and stubs
          naming both slugs retain the dependency refusal until their edges are repaired.

    - `[x]` **4.4.c The subject's own edge**

        - The subject's target dependency takes its proven prior-provider disposition before the sweep; unproven edges
          refuse with explicit repair and retry. Compatible shared observations coalesce, contradictory observations
          refuse, and every resolved provider remains read-only evidence checked by the batch.

### `[x]` **4.5 Rewrite only the references that resolve to the subject, and report the rest — § 4**

- _Goal:_ A work unit's rename changes another record's reference to its old slug only where that slug, resolved among
  work items, names the subject alone, and reports every reference to the subject it leaves.

    - `[x]` **4.5.a Resolving once**

        - Family-scoped resolution gates shared stub and selected-cohort reference rewrites. Ambiguous references remain
          with field and text repairs; other holders' references stay unreported. Started work keeps its authored edges
          and prose, and publication failures retain the reference report from the landed batch.

    - `[x]` **4.5.b The member heading**

        - Another current or former name holder in the same resolved cohort keeps the heading unchanged and produces its
          exact document-line repair, including completed holders and former cohort paths. Unavailable holding evidence
          refuses with the original retry; repair permits continuation, and a distinct cohort permits the heading rewrite.

### `[x]` **4.6 Pull history refs round after round — § 2.6**

- _Goal:_ A rename batch that writes completed records lands on a clone lacking their history refs, pulling each round
  only the refs the backend names.

- _Outcome:_ Empty or already attempted ref sets return the latest refusal; stopped pulls preserve their notices, and
  every retry keeps the original operand and recovery guard. Archived subjects and closed-cohort headings now land
  together after their required histories are restored, while unrelated histories remain unfetched.

### `[x]` **4.7 Report a former-slug tie the batch leaves — § 2.7**

- _Goal:_ Renaming the second holder of a repaired clash away from the slug reports the former-slug tie it leaves and its
  repair.

- _Outcome:_ The post-batch lookup reports former-name ties with the store's condition and repair, on first runs and
  continuations. Unavailable or throwing lookups remain visible diagnostics while publication follows its existing path,
  and resumed runs preserve the landed record batch.

### `[x]` **4.8 Pin the subject's checkout by UID, and type the unbound-marker refusal — § 2.4**

- _Goal:_ Under a clash the rename never takes the other holder's checkout, and an unbound marker naming the slug refuses
  before the batch with the holders and the exits that recover each checkout, in text and `--json`.

- _Outcome:_ Rename retains the shared lookup's typed unbound result and renders its checkout-scoped exits in text and
  JSON before branch or record changes. Multiple-marker diagnostics remain intact; release permits rename and exact
  re-materialization of each holder, while bound checkouts follow only the selected UID.

### `[x]` **4.9 Decide the first run's branch steps from the branch's link lookup — § 2.5**

- _Goal:_ Where two holders link one branch, a first run moves only its own subject's branch and checkout, never
  deletes a remote branch another live holder links, and reports each branch it keeps with its reason.

    - `[x]` **4.9.a The local branch**

        - First-run branch lookup and the UID-selected checkout's actual branch govern local movement and its link.
          Shared branches stay unchanged elsewhere with a UID-specific catch-up command; sole holders retain the missing
          local-branch refusal and can retry after restoration.

    - `[x]` **4.9.b The remote branches**

        - Published moved links push their new name; created old refs require permitted ownership and publication
          preservation before deletion. Kept published refs report retention, and conditional manual-delete remedies
          require the lookup to select the subject, independently of adoption.

- _Outcome:_ Checkout authority can permit a local move without granting remote deletion authority. The same captured
  branch lookup governs each first-run decision, preserving shared or unobservable remote ownership and reporting the
  remaining branch and its applicable action.

### `[x]` **4.10 Keep the old remote branch on every continuation — § 2.5**

- _Goal:_ A rerun after a failed push or a refused delete completes the rename without deleting the old remote branch,
  and the preservation refusal tells the person how to settle the branch whichever holder's it is.

    - _Amended in:_ 4.11.R (A1)

- _Outcome:_ Continuations publish the remaining new ref and report the old remote kept, without repeating record or
  checkout changes. Store preservation refusals distinguish this work unit's commits from another holder's branch;
  their retry keeps either safely, while tracked renames retain the existing default remedy.

### `[x]` **4.11 Move a branch the first run left through the catch-up run — § 2.5, § 3.3**

- _Goal:_ Rerunning the rename with the subject's current slug on the machine holding its checkout renames the branch a
  first run left and moves its link, ending the branch-link tie.

- _Outcome:_ Catch-up selects the UID-held branch across retained aliases and lands only its observed primary link.
  Refused batches restore the branch and upstream while markers and folders stay fixed. Shared branch ownership
  resolves singly afterward; a failed push follows A1’s exact Git action without changing the landed records.

### `[x]` **4.11.R Preserve the pending push after catch-up publication fails**

- _Goal:_ A catch-up whose link-only batch lands but publication fails retains its selected reference and report and
  returns the exact repository-scoped Git push that finishes publication without further store or checkout changes (A1).

### `[x]` **4.12 A work-unit clash repaired by rename end to end** — validate exit criterion at segment scope

- _Goal:_ The segment's exit criterion holds end to end: a clash of two work units refuses naming the rename, the rename
  by UID lands changing only what names its subject, and the slug then resolves to the other holder.

- _Outcome:_ Registered commands carry the clash refusal through UID repair and exact omitted-reference reports,
  preserve the other checkout and shared remote, catch up the selected branch, and report the former-name tie. A cold
  clone reuses an archived target and discharges edges in the same batch through successive history rounds in both
  layouts. A1's exact pending push publishes the actual new branch without another record or checkout change.

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

### `[x]` **5.1 Write a cohort's document, heading, and own `Parent` under its new name, in one batch — § 5.1, § 5.2**

- _Goal:_ `arc rename <cohort> <new-slug>` renames an open cohort's document, recording its former slug, with its
  heading and its own `Parent` rewritten so its members' rewritten paths agree with it, in one version-checked batch
  that writes only what changes.

    - `[x]` **5.1.a The arm and its batch**

        - `runCohortRename` writes the selected UID's heading and canonical Parent once, observing its unchanged parent.
          Concurrent parent changes refuse atomically. Cohort results retain source, target, reference, and report in text
          and JSON; a history-proven rerun changes no records or history.

### `[x]` **5.2 Rewrite every record holding the cohort alone, and report the ambiguous ones — § 5.1, § 4**

- _Goal:_ Every member and subcohort that holds the cohort alone names its new slug after the batch, whatever its state,
  and none of another cohort's records sharing the slug is touched.

- _Outcome:_ Cohort-family resolution composes current and former member paths and open or closed Parent fields into
  one batch, preserving completed placement and started prose. Every unchanged read is observed. Ambiguous holdings
  carry ordered edits that land; closed ambiguous subtrees retain their Parent and member paths, including members
  on unique former aliases, with exact identity rows and an explanatory advisory.

### `[x]` **5.3 Rewrite references to the document's filename where the old slug names the cohort alone — § 5.1, § 4**

- _Goal:_ Stubs and open cohort documents citing `` `cohort-<old>.md` `` name the new file after the batch where the old
  slug names the cohort alone, each such reference is reported where it is ambiguous, and no work-item reference sharing
  the text changes.

- _Outcome:_ The cohort kind rewrites exact filename citations in open documents and whole Planning stub groups,
  excluding cut maps, while preserving work-item edges and started or closed prose. Ambiguous citations carry exact
  document, companion key, line, and replacement in text and JSON; all acquired group records join the batch observations.

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
        - a closed subcohort's Parent names a unique former alias while a pulled member names a clashed current slug;
          the reported member edit lands after the batch rewrites that Parent

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

- `[ ]` Status's `slug-clash` warning for two work units names `arc rename <uid> <new-slug>` for each, as does Start
  readiness withholding a target named by the former slug of one, and a live former-slug tie's remedy names the
  intended holder by its current name.

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

- `[ ]` A rejected push after an older-alias catch-up returns the exact repository-scoped Git push for the actual new
  branch, preserving the selected reference and retained-branch report. Executing that argv publishes the new branch,
  keeps the actual old remote, and changes no stored records, history, markers, or checkout paths; ordinary rename
  continuations retain their original operand and automatic publication recovery.

- `[ ]` All quality gates pass (tests, linting, type checking)

- `[ ]` Ready for integration
