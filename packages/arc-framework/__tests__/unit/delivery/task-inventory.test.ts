import { describe, expect, it } from "vitest";

import { extractTaskGoalInventory } from "../../../src/lib/delivery/task-inventory.js";

function taskList(goalLines: readonly string[], options?: {
  readonly marker?: " " | "x";
  readonly title?: string;
  readonly peerLines?: readonly string[];
}): string {
  return [
    "## **Phase 1:** Implementation",
    "",
    `### \`[${options?.marker ?? " "}]\` **1.1 ${options?.title ?? "Build inventory"}**`,
    "",
    ...goalLines,
    ...(options?.peerLines ?? []),
    "",
    "    - `[ ]` **1.1.a Child task**",
    "",
    "        - _Goal:_ Child intent must not enter the parent inventory.",
    "",
    "## **Phase 2:** Verification",
    "",
    "### `[ ]` **2.1 Verification**",
  ].join("\n");
}

describe("extractTaskGoalInventory", () => {
  it("extracts and normalizes the complete parent Goal extent only", () => {
    const entries = extractTaskGoalInventory(taskList([
      "- _Goal:_ Bind the task intent across",
      "  wrapped physical lines.",
      "",
      "  Preserve continuation after a blank.",
    ], { peerLines: ["", "- _Note:_ Presentation-only context."] }));

    expect(entries).toMatchObject([{
      taskId: "1.1",
      goal: "Bind the task intent across wrapped physical lines. Preserve continuation after a blank.",
    }]);
  });

  it("is invariant to wrapping, completion, peer descriptors, outcome, and title", () => {
    const wrapped = extractTaskGoalInventory(taskList([
      "- _Goal:_ Bind the same",
      "  semantic intent.",
    ]))[0];
    const completed = extractTaskGoalInventory(taskList([
      "- _Goal:_ Bind the same semantic intent.",
    ], {
      marker: "x",
      title: "Retitled inventory",
      peerLines: ["", "- _Outcome:_ The task is complete."],
    }))[0];

    expect(wrapped).toBeDefined();
    expect(completed).toBeDefined();
    expect(completed?.semanticDigest).toBe(wrapped?.semanticDigest);
    expect(completed?.goal).toBe(wrapped?.goal);
  });

  it("moves the digest only when parent Goal semantics move", () => {
    const before = extractTaskGoalInventory(taskList(["- _Goal:_ Bind the task intent."]))[0];
    const after = extractTaskGoalInventory(taskList(["- _Goal:_ Bind different task intent."]))[0];

    expect(after?.semanticDigest).not.toBe(before?.semanticDigest);
  });
});
