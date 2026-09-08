---
purpose: Transform one planning work unit into exact authored destinations through the canonical decompose lifecycle.
audience: agent
arc:
  methods:
    - commit-format
  extensions:
    - pre-push-review
---

# Workflow: Decompose Work Unit

**The operator owns semantic distribution; `arc decompose` owns source discovery, closed mode dispatch, topology,
mutation, validation, and rollback. Retirement alone owns the durable transition record** · `[invariant]`.

Extraction is the supported source-preserving arm for a started `Planning` or `Active` source. It is entered through
its own command mode, and the core retirement transform remains unchanged.

Use only CLI-reported paths, packets, statuses, and remedies. Every selected mode emits one typed refusal envelope
on stdout. On refusal, surface its status, reason, optional locus and evidence, remedy, and any optional report
unchanged. Stop until the reported correction is complete. Never construct identifiers, Git topology, recovery
commands, or extraction report fields.

## Preconditions

- A retirement origin is a supported Planning source or backlog planning stub.
- An extraction origin is a started Planning or Active source whose implementation stays with the origin.
- Destination, dependency, retained/transferred ownership, and placement intent is settled.
- Existing destinations are exact edit homes, never implicit new members.

The completed map's operator-owned `authoring.shape` selects one closed command arm. Never reinterpret the map or
substitute one arm when the CLI refuses another.

## 1. Emit the exact preflight

Run machine mode before interactive prose:

```bash
arc decompose <origin> --preflight > <scratch-starter-map>
```

The read-only result pins the source, planning profile, exact source units, and dependency edges. Successful
preflight writes the starter map alone; refusal follows the common envelope and never emits a partial starter map.

On refusal, stop. Do not fetch, substitute working-tree bytes, select another source, or hand-author missing
machine fields.

## 2. Complete the operator-owned map

Edit only the starter map's authoring slots:

- name each new member or exact existing destination;
- allocate every source unit once; for retirement, inventoried companion units — including task-list phases and notes
  sections — use the same target or reasoned-drop dispositions as design units;
- for extraction, set every started-Planning companion allocation to `retained-origin`; Active origins report no
  companion units;
- disposition every incoming and outgoing dependency edge once;
- select the already-settled authoring shape and placement.

Preserve every machine-owned field. Do not calculate paths or identifiers, create unreported destinations, or
derive machine facts from prose.

## 3. Dispatch the complete result

Dispatch on the completed map's operator-authored `authoring.shape`. Run exactly one arm.

**Retirement dispatch:**

```bash
arc decompose <origin> --execute <completed-map>
```

**Extraction dispatch:**

```bash
arc decompose <origin> --extract <completed-map>
```

On success, retain the complete staged result, including its plan packet, profile and topology packets, protection
arm, release paths, and candidate branch and worktree when applicable. Retirement owns transition-record creation;
extraction stages an additive result without mutating the surviving source or writing a transition record.

On refusal, apply the common refusal rule above. Retry only after the reported state is resolved. A failed
full-protection attempt leaves only an ARC-owned candidate that ordinary cleanup may remove; it creates no special
discard or recovery protocol.

## 4. Author every reported destination

Follow the successful result packets in their reported order:

- complete every new member's reported design family and authoring requirements;
- treat reported `provisional-task` and `provisional-notes` entries as whole retitled copies of the origin companions,
  then prune them to their assigned content;
- manually transfer allocated content from every other companion from its reported source to its admissible reported
  destination;
- complete required cohort or parent coordination;
- apply every reported existing-home semantic edit; and
- preserve the reported profile, topology, dependency effects, and task-pointer maturity.

Do not add unreported destinations, topology changes, or dependency edits.

## 5. Review the distributed result

For extraction, add these exact typed result fields to the common review surface:

- `report.extraction.retainedOrigin`;
- `report.extraction.reasonedDrops`; and
- `report.extraction.anchor`.

Use their reported values verbatim and never re-derive them from artifacts or Git state. In the human orientation,
name the surviving origin as the natural continuation; it is not a successor selected by the workflow.

> [!IMPORTANT]
> `workflow-interlock`: Stop after every reported destination is authored. Surface the actual distributed authority,
> dependency effects, topology, the retirement transition record when present, and the extraction fields above when
> present; await approval before proceeding to release.

This is the sole semantic distribution approval. Commit, push, integration, advancement, and finish-apply
interlocks are release or mutation controls only. If approval rejects the distribution, leave the staged partial
result or ARC-owned candidate unchanged and await explicit cleanup direction.

## 6. Release through the reported protection arm

From the reported result locus, stage only the approved release paths reported by the successful command. This set
includes every authorable destination, including paths the command found already applied. A retirement result also
includes its transition record; an extraction result never does. Then verify that no release path retains unstaged
changes and that the complete staged path set exactly matches the reported release set:

```bash
git add -- <reported-release-paths>
git diff --quiet -- <reported-release-paths>
git diff --cached --name-only --no-renames
```

Any unstaged reported path or additional or missing cached path stops release. Follow exactly one protection arm
only after the approved working-tree bytes and the index match.

### Partial protection

The approved transform is staged on the configured base.

Use the [`commit-format` method][commit-format] for the message.

> [!CAUTION]
> `commit-interlock` release — commit the staged transform as `workflowCommit`:

```text
feat(planning): decompose {origin}

Context: {deepest-planning-artifact} (planning)
```

The direct commit is the landing. Do not run a pre-push extension, push, open a PR, wait at an integration
interlock, or merge.

### Full protection

Use the exact reported candidate branch with the approved transform staged. Do not create, switch, repair, or delete
a branch or worktree.

Use the [`commit-format` method][commit-format] for the message.

> [!CAUTION]
> `commit-interlock` release — commit the staged transform as `workflowCommit`:

```text
feat(planning): decompose {origin}

Context: {deepest-planning-artifact} (planning)
```

**Retirement only:** invoke the authoritative advancement operation after the initial commit. It re-derives the
current configured base and stages an append-only merge from the same completed map only when needed:

```bash
arc decompose <origin> --advance-base <completed-map>
```

An `unchanged` result continues without a commit. An `advanced` result fires the interlock below. On refusal, apply
the common refusal rule above; do not rebuild the candidate, map, or merge manually.
Extraction never invokes this operation; its typed refusal is final for that candidate.

> [!IMPORTANT]
> `workflow-interlock`: Stop after an `advanced` result. Surface its candidate branch, previous and current base,
> and complete staged merge diff; await explicit 'commit' direction before committing the advancement.

Use the [`commit-format` method][commit-format] for the advancement message.

> [!CAUTION]
> `commit-interlock` release — commit the approved advanced result as `workflowCommit`:

```text
chore(planning): advance decomposition {origin} to current base

Context: {deepest-planning-artifact} (planning)
```

- **Extensions** · `#pre-push-review`: If `pre-push-review` appears in the active-extensions list, load and execute
  its `.actions` before the push. Halt on failure; otherwise, skip.

> [!CAUTION]
> `push-interlock` release — push the exact reported candidate branch as `workflowPush`.

Open or locate its PR according to project policy. Surface PR status: open review threads, required approvals, and
checks.

> [!IMPORTANT]
> `integration-interlock`: Stop before merge. Surface the exact PR status; await explicit 'merge' direction before
> merging.

After approval, merge according to project policy. Do not hardcode a merge method or infer merge authority from
review or checks.

## 7. Confirm lifecycle readiness and finish

After the configured base contains the landing, resolve the ordinary lifecycle and ready/blocked frontier:

```bash
arc status
```

For extraction, newly created leaves are ordinarily startable only through their landed base metas.
Extraction writes no transition record, recovery record, or receipt. It stores no launch advice, publication
packet, or selected successor.

From the surviving source, preview the separately retryable finish:

```bash
arc decompose <origin> --finish <completed-map>
```

Surface the exact preview, including `preview.applyAuthority`, source paths, retained bytes or deletion,
transferred locators, and live-base destination validation. This is destructive mutation confirmation, not a
second semantic distribution gate.

> [!IMPORTANT]
> `workflow-interlock`: Stop after the exact finish preview. Surface the preview; await explicit 'apply' direction
> before destructive source mutation.

On approval, apply the exact preview:

```bash
arc decompose <origin> --finish <completed-map> --apply <preview.applyAuthority>
```

Apply the common refusal rule above to a refused finish. An `already-finished` outcome completes this leg without
new mutation; it does not authorize a new commit by itself. Never tear down the surviving extraction origin.

A `finished` outcome leaves the exact source thinning staged. Before cleanup, the surviving origin's owner must
perform ordinary work-unit reconciliation against the approved transfer and drop set:

- reconcile the surviving `tasks-{origin}.md`, when present, so transferred or dropped future work no longer
  remains assigned to the origin while completed history and retained work remain truthful; and
- review and revise every affected `**Next Task:**` and `**Next Action:**` pointer to name the next real
  origin-owned step.

This reconciliation is required for both an `Active` origin and a started `Planning` origin. A started Planning
origin that has not produced a task list does not gain a synthetic one, but its affected pointers still require
review. These are owner-authored semantic edits, not finish-adapter output, and their changed paths join the same
durable finish release.

Stage only the preview's source paths and the changed owner-reconciliation paths. Verify that none retains an
unstaged change and that the complete staged path set exactly equals their union:

```bash
git add -- <finish-source-paths> <changed-owner-reconciliation-paths>
git diff --quiet -- <finish-source-paths> <changed-owner-reconciliation-paths>
git diff --cached --name-only --no-renames
```

Any additional or missing cached path, or any unstaged finish-release path, stops release. Use the
[`commit-format` method][commit-format] for the message.

> [!CAUTION]
> `commit-interlock` release — commit the exact staged finish and owner reconciliation as `workflowCommit`:

```text
chore(planning): finish source extraction for {origin}

Context: {deepest-planning-artifact} (planning)
```

An `already-finished` outcome takes no mutation or commit arm. Before cleanup, prove that the thinned source and
the required task/pointer reconciliation already reside in `HEAD` and that their paths have no indexed or
working-tree diff. If they are not durable, stop and reconcile the incomplete prior finish; never mint an empty or
ceremonial source-finish commit merely because the CLI reported `already-finished`.

For a full-protection landing, remove the reported candidate projection through the ordinary branch teardown:

```bash
arc teardown --branch <reported-candidate-branch>
```

For retirement only, remove the landed origin's local projection through the ordinary origin teardown:

```bash
arc teardown <origin>
```

Route only CLI-reported cleanup outcomes. Never infer teardown authority, delete remote state, or launch members
from this workflow.

---

[commit-format]: ../../../methods/commit-format.md
