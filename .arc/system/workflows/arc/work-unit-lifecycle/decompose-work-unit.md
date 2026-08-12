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

**The operator owns semantic distribution; `arc decompose` owns source discovery, topology, mutation, validation,
rollback, and the durable transition record** · `[invariant]`.

Use only CLI-reported paths, packets, statuses, and remedies. On refusal, surface the returned status and remedy
unchanged, stop, and re-enter only at the reported action. Never construct identifiers, Git topology, or recovery
commands.

## Preconditions

- The origin is a supported Planning source or backlog planning stub.
- Destination, dependency, and placement intent is settled.
- Existing destinations are exact edit homes, never implicit new members.

An Active origin, extraction, or extension-owned transform is outside this core workflow. Follow the typed refusal
or route it to its owning work unit.

## 1. Emit the exact preflight

Run machine mode before interactive prose:

```bash
arc decompose <origin> --preflight > <scratch-starter-map>
```

The read-only result pins the source, planning profile, exact source units, and dependency edges. Diagnostics use
stderr; a refusal emits no partial map.

On refusal, stop. Do not fetch, substitute working-tree bytes, select another source, or hand-author missing
machine fields.

## 2. Complete the operator-owned map

Edit only the starter map's authoring slots:

- name each new member or exact existing destination;
- allocate every source unit once or drop it with a reason;
- disposition every incoming and outgoing dependency edge once;
- select the already-settled placement.

Preserve every machine-owned field. Do not calculate paths or identifiers, add a surviving origin, or create
unreported destinations.

## 3. Stage the complete result

Run the completed map through the closed execute mode:

```bash
arc decompose <origin> --execute <completed-map>
```

On success, retain the complete staged result, including its plan packet, profile and topology packets, protection
arm, and candidate branch and worktree when applicable. The command owns occupation, mutation, transition-record
creation, staging, and rollback.

On refusal, stop and surface its typed status and remedy. Retry only after the reported state is resolved. A failed
full-protection attempt leaves only an ARC-owned candidate that ordinary cleanup may remove; it creates no special
discard or recovery protocol.

## 4. Author every reported destination

Follow the successful result packets in their reported order:

- complete every new member's reported design family and authoring requirements;
- complete required cohort or parent coordination;
- apply every reported existing-home semantic edit;
- preserve the reported profile, topology, dependency effects, and task-pointer maturity.

Do not add unreported destinations, topology changes, or dependency edits.

## 5. Review the distributed result

> [!IMPORTANT]
> `workflow-interlock`: Stop after every reported destination is authored. Surface the actual distributed authority,
> dependency effects, topology, and transition record; await approval before proceeding to release.

This is the sole semantic distribution approval. Commit, push, and integration interlocks are release controls only.
If approval rejects the distribution, leave the staged partial result or ARC-owned candidate unchanged and await
explicit cleanup direction.

## 6. Release through the reported protection arm

From the reported result locus, stage only the approved release paths reported by the successful execute result.
This set includes every authorable destination, including paths that execute found already applied, plus the
transition record. Then verify that no release path retains unstaged changes and that the complete staged path set
exactly matches the reported release set:

```bash
git add -- <reported-release-paths>
git diff --quiet -- <reported-release-paths>
git diff --cached --name-only --no-renames
```

Any unstaged reported path or additional/missing cached path stops release. Follow exactly one protection arm only
after the approved working-tree bytes and the index match.

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

Invoke the authoritative advancement operation unconditionally after the initial commit. It re-derives the current
configured base and stages an append-only merge from the same completed map only when needed:

```bash
arc decompose <origin> --advance-base <completed-map>
```

An `unchanged` result continues without a commit. An `advanced` result fires the interlock below. On refusal, surface
the reason and stop; do not rebuild the candidate, map, or merge manually.

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

## 7. Confirm lifecycle readiness and clean up

After the configured base contains the landing, resolve the ordinary lifecycle and ready/blocked frontier:

```bash
arc status
```

Use the reported lifecycle state to continue normal work-unit processing. The transition stores no launch advice,
publication packet, or selected successor.

When the landed origin's local projections should be removed, run the ordinary teardown verb:

```bash
arc teardown --branch <reported-candidate-branch>
arc teardown <origin>
```

The branch form applies only to full protection; partial protection has no candidate projection.

Route only CLI-reported cleanup outcomes. Never infer teardown authority, delete remote state, or launch members
from this workflow.

---

[commit-format]: ../../../methods/commit-format.md
