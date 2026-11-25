---
purpose: Transform one planning work unit into exact authored destinations through the canonical decompose lifecycle.
audience: agent
arc:
  methods:
    - spec-review
---

# Workflow: Decompose Work Unit

**The operator owns semantic distribution; `arc decompose` owns source discovery, closed mode dispatch, topology,
every record write, and validation. Retirement alone writes the origin's lineage record** · `[invariant]`.

Extraction is the supported source-preserving arm for a started `Planning` or `Active` source. It is entered through
its own command mode, and the core retirement transform remains unchanged.

A cut runs as two store batches with authoring between them: the additive batch writes the members, the cohort
documents the cut creates, and the stored cut map; the terminal batch lands the cut. Each batch writes all of its
records or none. To resume a stored cut between batches, follow the stored-cut path in step 1.

Use only CLI-reported paths, packets, statuses, and remedies. Every selected mode emits one typed refusal envelope
on stdout. On refusal, surface the complete typed refusal envelope unchanged. Stop until the reported correction is
complete. Never construct identifiers, record references, apply authorities, or continuation commands.

The specification reviews below apply to every new specification set and every substantive edit to an existing
specification, regardless of when it was authored. For revisions, include removals and affected surrounding
obligations and definitions without reviewing unrelated content; unchanged bytes need no repeated review.

## Preconditions

- A retirement origin is a backlog stub or a started `Planning` work unit.
- An extraction origin is a started `Planning` or `Active` work unit whose implementation stays with the origin.
- The origin holds no inbound entries: fold each into its design or route it first.
- Destination, dependency, retained/transferred ownership, and placement intent is settled.
- Existing destinations are exact edit homes, never implicit new members.
- A started origin's cut, every extraction among them, runs in the origin's own checkout; a stub's runs from any
  checkout.

The completed map's operator-owned `authoring.shape` selects one closed command arm. Never reinterpret the map or
substitute one arm when the CLI refuses another.

## 1. Emit the exact preflight

Run machine mode before interactive prose:

```bash
arc decompose <origin> --preflight > <scratch-starter-map>
```

The read-only result binds the origin by its source units' digests and its dependency edges, and takes the planning
profile from the origin's `Design`. Successful preflight writes the starter map alone; refusal follows the common
envelope and never emits a partial starter map. On `cut-in-flight`, the refusal names the stored cut's continuations.
To recover the allocations, run the reported `--revise` without a map. This read-only command returns either
`carried` or `reauthor`. Use `carried.map` and `previousMaps` for destination authoring in step 4. For `reauthor`,
use the fresh starter and `storedAuthoring` to prepare a revised map and follow step 5's revision preview and
approval before applying it.

For other preflight refusals, stop and follow the reported remedy. Do not substitute working-tree bytes, select
another source, or hand-author missing machine fields.

## 2. Complete the operator-owned map

Use `arc schema get cut-map` for each authoring slot's structural shape, discriminators, and allowed constants;
refinements and cross-field checks stay with `arc decompose`.

Edit only the starter map's authoring slots:

- name each new member or exact existing destination; an existing home is an open work unit, and an allocation into
  a started home targets its draft, spec, or notes;
- allocate every source unit once; for retirement, inventoried companion units — including task-list phases and notes
  sections — use the same target or reasoned-drop dispositions as design units, and an allocation that would copy a
  completed task into a member's task list targets the member's draft, spec, or notes instead;
- for extraction, set every started-Planning companion allocation to `retained-origin`; Active origins report no
  companion units;
- disposition every incoming and outgoing dependency edge once;
- use `internalEdges` for dependencies between declared destinations and `outgoingDispositions` to redistribute an
  existing origin prerequisite;
- add an `externalEdges` entry only from a new member or live existing-home work unit to a work unit outside the cut;
- select the already-settled authoring shape and placement, giving each cohort document the cut creates its Purpose.
  A cohort created by the cut cannot take the origin's name.

Rename an open cohort to an available slug with `arc rename <slug> <new-slug>`. If an in-flight cut names that cohort,
use `--revise` to update the stored placement before finishing.

Preserve every machine-owned field. Do not calculate paths or identifiers, create unreported destinations, or
derive machine facts from prose.

## 3. Write the additive batch

Dispatch on the completed map's operator-authored `authoring.shape`. Run exactly one arm.

**Retirement:**

```bash
arc decompose <origin> --execute <completed-map>
```

**Extraction:**

```bash
arc decompose <origin> --extract <completed-map>
```

The batch creates each member as a stub with its reported copies, each cohort document the cut creates, and the stored
map, and removes nothing. It has no approval of its own: approving the map approves the layout. From here the cut
reads its map from the store by the origin's slug, so no later mode takes the map file.

Retain the report's `members` with their copies, its `cohorts`, its `authoring` requirements per destination, its
`records` (including any dependency settlements), and its `nextStep`. Every checkout sees the members as ordinary stubs.
Starting one before the terminal batch is deliberate: a later discard or revision then refuses to remove or move it.

On refusal, apply the common refusal rule above.

## 4. Author every reported destination

Author through the projected files; nothing new is created by hand. Follow the report's `authoring` entries in order.
On resume or after revision, use the current map's destinations and source allocations. Match each target allocation
to its destination and its source unit by the map's IDs, and use their reported locators:

- complete every new member's design copy and its authoring requirements;
- treat each reported task-list or notes copy as a whole retitled copy of the origin's companion, then prune it to its
  assigned content;
- manually transfer allocated content from every other companion from its reported source to its reported target
  locator;
- complete each created cohort document and the cohort coordination the map allocates to;
- apply every reported existing-home edit; and
- keep each member's seeded `Cohort` and `Depends On`, which the terminal batch checks.

Compare the allocations in `previousMaps` with the current map. Inspect the reported former locators and remove
withdrawn obligations only from surviving former destinations. Skip removed destinations and any replacement record
that merely reused a former name. Author the replacement allocation from the current map.

Do not add unreported destinations, topology changes, or dependency edits.

After destination authoring, run [spec-review][spec-review] over each new member's complete specification set,
including copied origin specifications continuing directly to task generation, and the affected contract of changed
existing destinations; a member under a draft planning profile has no specification to review. Apply both common
reader checks before distributed-result approval, with the remaining coherence and grounding work at the applicable
form and depth.

Keep the reviewed destination specification content for comparison if terminal approval needs to be renewed.

Run `arc check increment` over the authored destinations, then save them:

```bash
arc save
```

Confirm the store accepted each file edited in this step. Check the projection diagnostics and confirm each file is
in `arc selection` and absent from `arc selection --changed`. For outstanding edits to these files, follow the
reported remedy, recheck corrected edits, and save again before continuing. Pending edits to unrelated files can wait.

## 5. Preview and approve the distribution

```bash
arc decompose <origin> --finish
```

Branch on the result's `kind`:

- **`landed`** reports an already landed cut. Skip preview approval and terminal apply. Continue with any outstanding
  extraction reconciliation and applicable cohort upkeep in step 6, then check readiness in step 7.
- **`preview`** writes nothing. It reports the terminal batch with its `applyAuthority`, the `lineage` record and
  `removals` for retirement or each thinned artifact's `retainedContent` for extraction (`null` where the file goes),
  and each record in `writes`. Continue to the review and approval below.

The origin's current state must be eligible for the selected shape. A move from `Planning` to `Active` remains eligible
for extraction. Follow the CLI's reported remedy for an ineligible state. If scanned source units or dependency edges
have changed, use `--revise` to rebind them. For a renamed origin, run the reported `--revise` under its current name.

For extraction, run [spec-review][spec-review] over the exact reported retained specification content or absence,
using the reported source units and operator allocation intent. Removed units supply change context, not definitions
or obligations needed by retained design; a destination specification cannot supply missing retained authority.
Surface missing binding design at the stop below; do not approve a known-incomplete preview. In the human orientation,
name the surviving origin as the natural continuation; it is not a successor selected by the workflow.

> [!IMPORTANT]
> `workflow-interlock`: Stop after the preview. Surface the distributed authority, dependency effects, topology, the
> preview's lineage record and removals or retained content, and the increment result; await approval before
> proceeding to the terminal batch.

This is the sole semantic distribution approval, and it authorizes the terminal batch. Use the preview's values
verbatim and never re-derive them from records.

A rejection runs the discard instead, and a revision the revision:

- **Discard.** `arc decompose <origin> --discard` previews removing each member still a stub, the cohort documents the
  cut created, and the stored map. Its `leftEdited` lists existing homes and surviving cohort coordination targeted
  by the current map, including untouched destinations. Also surface known authoring edits that would survive and
  any dependency settlements identified from the additive report's `records`.
- **Revision.** `arc decompose <origin> --revise > <scratch-revision-starter>` emits a `carried` result, the complete
  revised map, or a `reauthor` result, a fresh starter with the stored authoring beside it and the first place to
  reauthor as its `reason` and `locus`. Author the revised map as step 2 does; then
  `arc decompose <origin> --revise <revised-map>` previews the members it adds or removes and each record it writes.

> [!IMPORTANT]
> `workflow-interlock`: Stop after a discard or revision preview. Surface it; await explicit 'apply' direction before
> applying it.

Apply the approved preview with its exact `applyAuthority`.

**Discard:**

```bash
arc decompose <origin> --discard --apply <applyAuthority>
```

**Revision:**

```bash
arc decompose <origin> --revise <revised-map> --apply <applyAuthority>
```

After a discard, report `leftEdited` as the surviving destinations targeted by the current map. Separately report
known surviving authoring edits, including edits to former targets, and dependency settlements identified from the
additive report's `records`. The cut has ended.

After a revision, rerun the read-only `--revise` from step 1 to recover `previousMaps`. On `carried`, resume step 4
from the approved revised map and the earlier allocations. Review, check, and save the affected documents in step 4.
For `reauthor`, follow step 1's revision path.

## 6. Apply the terminal batch

Right after approval, in the same session, apply the exact preview:

```bash
arc decompose <origin> --finish --apply <applyAuthority>
```

The apply builds the batch again and runs it only when it matches the authority. A stale authority refusal names
`--finish` for a fresh preview. Before renewed approval in step 5, compare the current destination specifications
with the content reviewed in step 4. Repeat step 4's review for substantive edits and their affected obligations.
Reuse completed reviews for unchanged content. If review leads to edits, check and save them in step 4 and preview again.

The terminal batch is the landing: no commit, push, pull request, or merge follows.

- **`applied`** reports the `members` and any `notices`. A retirement removes the checkout holding a started origin,
  or releases it where the origin was started in place; a `continuation` names a cleanup step that did not complete —
  run its `argv`.
- **`landed`** reports a cut that had already landed, with its members. Continue with any outstanding work below.

### Reconcile the landed cut

A retirement writes the origin's lineage record, naming its members as successors. Extraction writes no lineage
record: its origin survives. It stores no launch advice, publication packet, or selected successor. Never tear down
the surviving extraction origin.

For an extraction, the surviving origin's owner then reconciles it against the approved transfer and drop set, in the
origin's checkout:

- reconcile the surviving `tasks-{origin}.md`, when present, so transferred or dropped future work no longer remains
  assigned to the origin while completed history and retained work remain truthful; and
- review and revise every affected `**Next Task:**` and `**Next Action:**` pointer to name the next real origin-owned
  step.

This reconciliation is required for both an `Active` origin and a started `Planning` origin. A started Planning origin
that has not produced a task list does not gain a synthetic one, but its affected pointers still require review.

If later substantive source-specification edits occur, run [spec-review][spec-review] over their changed footprint and
affected contract. Retain both common checks at the selected depth; reuse completed reviews over unchanged bytes.
Task/pointer-only reconciliation does not trigger a specification review.

Where the origin no longer belongs directly to a cohort whose record keeps its `` ### `<origin>` `` section under
`## Members` — after a retirement, or an extraction that moved the origin into the members' cohort — remove that
section; the record's next hand edit refuses while it stays.

Run `arc check increment` over these edits, then save them:

```bash
arc save
```

Confirm the store accepted each file edited in this step. Check the projection diagnostics and confirm each file is
in `arc selection` and absent from `arc selection --changed`. For outstanding edits to these files, follow the
reported remedy, recheck corrected edits, and save again before continuing. Pending edits to unrelated files can wait.

## 7. Confirm lifecycle readiness

Read the ready and blocked frontier:

```bash
arc status --project
```

Use `arc status <member>` for one member. Each member is an ordinary stub and starts through the ordinary lifecycle.

---

[spec-review]: ../../../methods/spec-review.md
