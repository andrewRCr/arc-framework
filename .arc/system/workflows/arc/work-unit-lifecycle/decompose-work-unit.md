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

The operator owns semantic distribution. `arc decompose` owns source discovery, evidence, topology, mutation,
validation, recovery, and the landed handoff.

Use only CLI-reported paths, packets, statuses, and remedies. On refusal, surface the returned status and remedy
unchanged, stop, and re-enter only at the reported action. Never construct identifiers, evidence, Git topology, or
recovery commands.

## Preconditions

- The origin is a supported Planning source or backlog planning stub.
- Destination, dependency, and placement intent is settled.
- Existing destinations are exact edit homes, never implicit new members or continuation candidates.

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

## 3. Prepare and materialize the result

Run the completed map through the closed execute mode:

```bash
arc decompose <origin> --execute <completed-map>
```

On success, retain the complete result, including its plan packet, profile and topology packets, protection arm,
candidate facts when applicable, `discard` disposition, and `next` action. A full candidate reports the exact
`discard.command`; partial protection reports discard as not applicable. The command owns occupation, mutation,
staging, preparation, and restoration.

On refusal, stop and surface only its typed status and remedy. Run retry or discard only when the result supplies
the exact command; prose guidance and mismatch loci are never command operands.

## 4. Author every reported destination

Follow the successful result packets in their reported order:

- complete every new member's reported design family and authoring requirements;
- complete required cohort or parent coordination;
- apply every reported existing-home semantic edit;
- preserve the reported profile, topology, dependency effects, and task-pointer maturity.

Do not edit preparation or receipt evidence. Do not add unreported destinations, topology changes, or dependency
edits.

## 5. Review the distributed result

> [!IMPORTANT]
> `workflow-interlock`: Stop after every reported destination is authored. Surface the actual distributed
> authority, dependency effects, topology, publication entries, and explicit selected-slugs-or-none continuation;
> await approval before proceeding to the continuation input and finalization.

This is the sole semantic distribution approval. It creates no token, signature, or evidence field. Commit, push,
and integration interlocks are release controls only.

If approval rejects the distribution, run the retained exact `discard.command` when the result reports one, then
stop. When discard is not applicable, leave the staged partial result unchanged and surface that disposition.

## 6. Finalize with explicit continuation

Write only the approved closed continuation input to the exact `next.continuationPath` reported by execute. Invoke
the reported `next.command` verbatim; it is the complete `--finalize` with `--continuation` command. Never rebuild
the command from receipt, candidate, path, or mismatch facts.

Continue only when finalization reports `recorded`, `already-finalized`, or `refreshed`. On refusal, surface only
the typed status and remedy, stop, and follow its indicated re-entry:

- retry or discard runs only an exact reported command;
- re-preflight returns to Step 1;
- reauthor returns to Step 4 without changing mechanical bindings;
- prose-only guidance remains prose.

If direction after a finalization stop is to abandon a full candidate, run only the exact `discard.command` retained
from execute. Never derive it from the refusal, candidate facts, or mismatch loci.

## 7. Release through the reported protection arm

Follow exactly one protection arm from the finalized result.

### Partial protection

The finalized transform is already staged on the configured base.

Use the [`commit-format` method][commit-format] for the message.

> [!CAUTION]
> `commit-interlock` release — commit the finalized transform as `workflowCommit`:

```text
feat(planning): decompose {origin}

Context: {deepest-planning-artifact} (planning)
```

The direct commit is the landing. Do not run a pre-push extension, push, open a PR, wait at an integration
interlock, or merge.

### Full protection

Use the exact reported candidate branch as it stands. Do not create, switch, repair, or delete a branch or
worktree.

Use the [`commit-format` method][commit-format] for the message.

> [!CAUTION]
> `commit-interlock` release — commit the finalized transform as `workflowCommit`:

```text
feat(planning): decompose {origin}

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
finalization, review, or checks.

## 8. Resolve the landed handoff

After the configured base contains the exact landing, run:

```bash
arc decompose <origin> --handoff
```

The read-only result carries the pinned landing and receipt facts, logical and display anchor, ordered publication,
immutable initial continuation, and current selected readiness or blockers. It launches nothing and persists no
scheduling state.

Route only CLI-reported local cleanup and claim outcomes. Never infer teardown authority, mutate a partial-protection
claim, delete remote state, or launch members from this workflow.

---

[commit-format]: ../../../methods/commit-format.md
