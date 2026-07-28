---
purpose: Transform one planning work unit into exact authored destinations through the canonical decompose lifecycle.
audience: agent
arc:
  extensions:
    - pre-push-review
---

# Workflow: Decompose Work Unit

Decomposition is a retirement transform, not a code-deliverable integration. The operator decides and authors the
semantic distribution; `arc decompose` owns source discovery, canonical evidence, topology, mutation, validation,
recovery, and the landed publication handoff.

Do not construct receipt JSON, digests, branches, worktrees, topology paths, or recovery commands in this workflow.
Treat every CLI refusal as authoritative and re-enter only at the step named by its typed remedy.

---

## Preconditions

- The origin is a supported Planning source or backlog planning stub.
- `assess-cohort-fit` has already decided the destinations and dependency intent.
- Multi-member output has a cohort-backed placement. Cohortless output is permitted only for one new member.
- Existing destinations are exact edit homes, never implicit new members or continuation candidates.

An Active origin or extraction request is outside this core workflow. Follow the CLI refusal or route the concern
to a work unit that owns active-code decomposition.

## 1. Emit the exact preflight

Run machine mode before any interactive introduction or prose renderer:

```bash
arc decompose <origin> --preflight > <scratch-starter-map>
```

The command is read-only. It pins one local source ref and tree, infers the planning profile, inventories exact
source units and dependency edges, and writes one canonical starter map to stdout. Diagnostics go to stderr.

On refusal, stop. Display the typed status and remedy exactly as reported. Do not fetch, substitute a working-tree
file, select another branch, or hand-author missing machine fields.

## 2. Complete the operator-owned map

Edit only the authoring slots in the starter map:

- name each new member or exact existing destination;
- allocate every source unit exactly once to a compatible destination or drop it with a reason;
- disposition every incoming and outgoing edge exactly once;
- select the placement already justified by `assess-cohort-fit`.

Preserve the machine envelope byte-for-byte. Do not add a surviving-origin entry, calculate identifiers, invent
paths, or copy source prose into more than one destination. Shared coordination belongs only in a cohort-backed
coordination destination.

## 3. Prepare and materialize the candidate

Run the completed map:

```bash
arc decompose <origin> --cut-map <completed-map>
```

The command revalidates the preflight binding before mutation, produces one immutable plan, occupies the exact
candidate when full protection applies, materializes one final state per managed path, stages the preparation, and
reports:

- the candidate branch or partial-protection base projection;
- logical anchor and topology dispositions;
- every destination path and its authoring requirement;
- the receipt ID;
- typed recovery, if execution did not complete.

Use only paths and remedies in that result. Never create, switch, repair, or delete a branch, worktree, cohort
document, or evidence record yourself.

## 4. Author every reported destination

Follow the CLI result packets in their reported order:

- complete every new member's draft or finalized design family;
- complete required cohort or parent coordination, replacing `Purpose: —`;
- apply every reported existing-home semantic edit;
- preserve the reported profile and task-pointer maturity;
- leave `Decomposition Receipt` unchanged on new-leaf metas and absent everywhere else.

Do not edit the preparation or receipt namespace. Do not add unreported destinations or dependency edits.

## 5. Review the distributed candidate

> [!IMPORTANT]
> `workflow-interlock`: Review the actual authored candidate after every destination is complete. Surface the
> distributed design authority, dependency effects, topology, publication entries, and the proposed explicit
> selected-slugs-or-none continuation. Await approval before writing the continuation input or finalizing.

This is the one semantic distribution approval. Commit, push, and integration interlocks later in the workflow are
release controls and do not replace it.

## 6. Finalize with explicit continuation

Write the approved continuation selection to the CLI-reported scratch input path and invoke:

```bash
arc decompose <origin> --finalize <receipt-id> --continuation <continuation-file>
```

Finalization reopens the exact preparation, validates the complete candidate and topology, compares the prospective
and validated project projections, and atomically seals the receipt. `recorded`, `already-finalized`, and
`refreshed` are the only successful statuses.

On refusal, stop and render only the typed recovery result. A remedy may direct retry, discard, re-preflight,
reauthoring, or prose-only guidance. Do not reconstruct operands or commands from a mismatch locus.

## 7. Release by protection mode

Use the protection mode and candidate facts reported by the CLI.

### Partial protection

Run the `commit-interlock`, then commit the finalized transform directly on the configured base through
`workflowCommit`. Do not run a pre-push extension, push, open a PR, or perform a merge sequence.

### Full protection

Use the existing reported candidate branch; do not create or switch branches.

1. Run the `commit-interlock`, then `workflowCommit`.
2. If `pre-push-review` is active, execute its `.actions`.
3. Run the `push-interlock`, then `workflowPush` for the reported branch.
4. Surface PR status: open review threads, required approvals, and checks.
5. At the `integration-interlock`, await explicit merge direction.
6. Merge according to project policy:

   ```bash
   gh pr merge <pr-number> --squash
   ```

The PR description is the human-readable distribution account: destinations, dependency effects, coordination,
and justified drops. Do not paste machine evidence.

## 8. Resolve the landed handoff

After the configured base contains the exact landing, run:

```bash
arc decompose <origin> --handoff
```

The read-only result carries the pinned base and receipt identity, logical and live display anchor, ordered
publication entries, immutable initial continuation, and current selected readiness/blockers. It does not launch
members or persist a scheduling frontier.

Route only CLI-reported local cleanup and claim outcomes. Full-protection cleanup must remain gated by the exact
landed claim generation; partial protection performs no claim mutation. Never infer cleanup from generic history,
delete remote state, or invent a teardown command.

---

## Recovery invariants

- `retry` uses the exact reported receipt/candidate generation.
- `discard` is valid only for the exact uncommitted candidate and its matching claim.
- `re-preflight` returns to Step 1 and creates no authority from stale evidence.
- `reauthor` returns to Step 4 without changing mechanical bindings.
- prose-only guidance remains prose when required operands are unavailable.

Prepared, committed-unlanded, ambiguous, corrupt, raced, or descendant-base-only evidence never becomes a landed
handoff or cleanup grant.
