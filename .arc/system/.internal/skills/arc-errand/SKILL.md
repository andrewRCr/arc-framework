---
name: arc-errand
description: Launch an Errand from a work-unit session — classify against the decision matrix, run the advisory foreign-artifact check, queue a forward-pointing entry, and return.
disable-model-invocation: false
---

# ARC Errand

Queue a committed-but-not-yet-executed side-task (an Errand) from any work-unit session without
disrupting the worktree you are in. The entry lands in the primary worktree's errand queue; you
service it later from there on a `chore/<slug>` branch. This skill does not cut a branch or commit —
it only queues.

1. Confirm the work is an Errand.

   - The commitment boundary gates entry: only work you are committing to do yourself, soon belongs
     here. If you are not committing now, capture it to `USER-INBOX` instead (triaged at a ceremony).
     See `system/rules/DEV-RULES.ARC.md` § Leave it cleaner.
   - Classify against the decision matrix in
     `reference/strategies/arc/strategy-work-organization.md` § Errand Work Class:
     - **Create** a new tracked unit of work, or work spanning more than one review increment or
       carrying design that must be authored → it is a Work Unit, not an Errand. Stop and route it
       there.
     - **Maintain** an existing artifact in a single review increment → an Errand. Continue.

2. Gather the entry inputs.

   - **slug** — a short, branch-safe label (lowercase letters, digits, hyphens). It is the queue key
     and the `chore/<slug>` branch name.
   - **goal** — the one-line outcome the errand delivers.
   - **pointers** — the files, symbols, or context the executing session needs to start.
   - **target path(s)** — the artifact(s) the errand will edit, for the advisory check below.

3. Run the advisory foreign-artifact check.

   - Run `arc errand check --target <path> [<path> ...] --json` and read the overlap facts.
   - Each reported overlap means the target is being edited on another in-flight work unit's branch
     or worktree — editing it in parallel plants a latent cross-branch conflict. Bias to surface:
     word a brief caveat naming the branch, e.g. "Coordinate with `<branch>` (in flight); sequence
     after it integrates." Fold multiple overlaps into one caveat line.
   - No overlap → no caveat. The check is advisory and never blocks.

4. Queue the errand and return.

   - Run `arc errand queue --slug <slug> --goal "<goal>" --pointers "<pointers>"`, adding
     `--caveat "<caveat>"` when step 3 produced one.
   - Report the queued entry and return to your work unit. The errand is serviced later from the
     primary worktree, where the `chore/<slug>` branch is cut at execution.
