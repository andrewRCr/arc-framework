/**
 * Task-list fixture carrying the amendment placement forms.
 *
 * Two declared segments keep the segment-verifier checks live rather than skipped, and neither
 * segment is a `layer` — so a misplaced corrective parent is caught rather than exempted. Phase 1
 * closes a segment and hosts both corrective parents ahead of its verifier, which is the one
 * position the placement scheme can be got wrong.
 */

const AMENDMENT_PLACEMENT_TASK_LIST = `# Task List: Amendment Placement

- **Design:** \`spec-amendment-placement.md\`

---

## **Phase 1:** Establish the corrected capability

_Mode:_ \`slice\` — closes on the capability being exercised end to end.

_Exit criterion:_ The capability is exercised end to end through its public interface, with both
amendments' corrective work closed.

### \`[x]\` **1.1 Author the capability**

- _Goal:_ The capability exists behind its public interface and is reachable from the command
  surface it serves.

    - \`[x]\` **1.1.a Author the module**
        - The module carries the public interface.

    - \`[x]\` **1.1.b Reach it from the command surface**
        - The command surface resolves the module.

### \`[ ]\` **1.R Correct the capability's boundary handling — A1**

- _Goal:_ The boundary case A1 settled is handled as the amended design states, correcting Task 1.1.

    - \`[ ]\` **1.R.a Handle the boundary case**
        - The boundary case returns the amended result.

### \`[ ]\` **1.R2 Correct the capability's failure reporting — A2**

- _Goal:_ The failure path reports as the amended design states, correcting Task 1.1.

    - \`[ ]\` **1.R2.a Report the amended failure**
        - The failure path carries the amended reason.

### \`[ ]\` **1.2 Establish the corrected capability** — validate exit criterion at segment scope

- _Goal:_ The capability's exercised behavior and both corrections are the segment's recorded evidence.

## **Phase 2:** Extend the capability

_Mode:_ \`slice\` — closes on the extension being exercised end to end.

_Exit criterion:_ The extension is exercised end to end alongside the capability it builds on.

### \`[ ]\` **2.1 Author the extension**

- _Goal:_ The extension composes over the capability without widening its public interface.

    - \`[x]\` **2.1.a Author the extension**
        - The extension composes over the capability.

    - \`[ ]\` **2.1.R Correct the extension's composition — A3**
        - The composition follows the amended design.

### \`[ ]\` **2.2 Extend the capability** — validate exit criterion at segment scope

- _Goal:_ The extension's exercised behavior is the segment's recorded evidence.

## **Phase 3:** Verification

### \`[ ]\` **3.1 Complete verification** — load and follow \`verify-work-unit.md\`
`;

/** Repository-relative path the segmentation scan reports diagnostics against. */
export const amendmentPlacementTaskListPath = ".arc/active/tasks-amendment-placement.md";

/** Shape options for the amendment placement task list. */
export interface AmendmentTaskListOptions {
  /**
   * Append the post-completion amendment bullet beneath the completed parent's Goal. It sits at
   * Goal-child depth, which ends the descriptor extent rather than extending it — the one shape
   * that records the correction without moving the digest a bound plan compares.
   */
  readonly amendedIn?: boolean;
}

/** Final physical line of the completed parent's wrapped Goal. */
export const completedParentGoalTail = "  surface it serves.\n";

const AMENDED_IN_BULLET = "\n    - _Amended in:_ 1.R (A1)\n";

/** Build the amendment placement task list every shipped task-list consumer must accept. */
export function amendmentPlacementTaskList(options: AmendmentTaskListOptions = {}): string {
  if (options.amendedIn !== true) return AMENDMENT_PLACEMENT_TASK_LIST;
  const parts = AMENDMENT_PLACEMENT_TASK_LIST.split(completedParentGoalTail);
  if (parts.length !== 2) {
    throw new Error("amendment fixture: the completed parent's Goal tail is no longer unique");
  }
  return parts.join(`${completedParentGoalTail}${AMENDED_IN_BULLET}`);
}
