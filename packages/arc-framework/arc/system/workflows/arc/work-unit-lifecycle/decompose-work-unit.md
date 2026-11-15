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
records or none. A session resuming a cut between the batches continues at step 4.

Use only CLI-reported paths, packets, statuses, and remedies. Every selected mode emits one typed refusal envelope
on stdout. On refusal, surface its status, reason, optional locus and evidence, remedy, and any optional report
unchanged. Stop until the reported correction is complete. Never construct identifiers, record references, apply
authorities, or continuation commands.

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
envelope and never emits a partial starter map. An origin already holding a stored cut refuses, naming that cut's
continuations; resume it at step 4 rather than starting another.

On refusal, stop. Do not substitute working-tree bytes, select another source, or hand-author missing machine fields.

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
  A created cohort cannot take the origin's name, and its name is final.

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

Retain the report's `members` with their copies, its `cohorts`, its `authoring` requirements per destination, and its
`nextStep`. Every checkout sees the members as ordinary stubs. Starting one before the terminal batch is deliberate:
a later discard or revision then refuses to remove or move it.

On refusal, apply the common refusal rule above.

## 4. Author every reported destination

Author through the projected files; nothing new is created by hand. Follow the report's `authoring` entries in order:

- complete every new member's design copy and its authoring requirements;
- treat each reported task-list or notes copy as a whole retitled copy of the origin's companion, then prune it to its
  assigned content;
- manually transfer allocated content from every other companion from its reported source to its reported target
  locator;
- complete each created cohort document and the cohort coordination the map allocates to;
- apply every reported existing-home edit; and
- keep each member's seeded `Cohort` and `Depends On`, which the terminal batch checks.

Do not add unreported destinations, topology changes, or dependency edits.

After destination authoring, run [spec-review][spec-review] over each new member's complete specification set,
including copied origin specifications continuing directly to task generation, and the affected contract of changed
existing destinations; a member under a draft planning profile has no specification to review. Apply both common
reader checks before distributed-result approval, with the remaining coherence and grounding work at the applicable
form and depth.

Run `arc check increment` over the authored destinations, then save them:

```bash
arc save
```

## 5. Preview and approve the distribution

```bash
arc decompose <origin> --finish
```

The preview writes nothing. It reports the terminal batch with its `applyAuthority`: for a retirement, the `lineage`
record, the `removals`, and each record in `writes`; for an extraction, each thinned artifact's `retainedContent`,
`null` where the file goes, and each record in `writes`. An origin whose lifecycle state or name changed since the
additive batch refuses, naming the move or revision that restores it.

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
  cut created, and the stored map. Its `leftEdited` lists the existing homes and cohort coordination authoring
  changed, which no discard undoes.
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

After a discard, report the homes and coordination left edited; the cut has ended. After a revision, authoring resumes
at step 4 for what the revision added, carrying any changed unit into its destination by hand.

## 6. Apply the terminal batch

Right after approval, in the same session, apply the exact preview:

```bash
arc decompose <origin> --finish --apply <applyAuthority>
```

The apply builds the batch again and runs it only when it matches the authority; otherwise it refuses, naming
`--finish` for a fresh preview, which returns to step 5's approval. The terminal batch is the landing: no commit,
push, pull request, or merge follows.

- **`applied`** reports the `members` and any `notices`. A retirement removes the checkout holding a started origin,
  or releases it where the origin was started in place; a `continuation` names a cleanup step that did not complete —
  run its `argv`.
- **`landed`** reports a cut that had already landed, with its members; nothing further applies.

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

## 7. Confirm lifecycle readiness

Read the ready and blocked frontier:

```bash
arc status --project
```

Use `arc status <member>` for one member. Each member is an ordinary stub and starts through the ordinary lifecycle.

---

[spec-review]: ../../../methods/spec-review.md
