import { describe, expect, it } from "vitest";

import {
  buildDeliveryTaskInventory,
  extractTaskGoalInventory,
} from "../../../src/lib/delivery/task-inventory.js";

function taskList(goalLines: readonly string[], options?: {
  readonly marker?: " " | "x";
  readonly title?: string;
  readonly peerLines?: readonly string[];
}): string {
  return [
    "## Delivery Plan",
    "",
    "### `[ ]` **9.9 Task-shaped plan member**",
    "",
    "- _Goal:_ Plan prose must not enter the implementation inventory.",
    "",
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

describe("buildDeliveryTaskInventory", () => {
  it("binds the sole parent in the final Verification phase outside the implementation inventory", () => {
    const result = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind the implementation task.",
    ]));

    expect(result).toMatchObject({
      status: "ok",
      inventory: {
        implementation: [{ taskId: "1.1" }],
        verificationTaskId: "2.1",
      },
    });
  });

  it("digests only normalized implementation task identities and Goal semantics", () => {
    const before = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind stable implementation intent.",
    ]));
    const after = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind stable implementation intent.",
    ], {
      title: "Changed presentation title",
      peerLines: ["", "- _Note:_ Changed non-semantic context."],
    }).replace("2.1 Verification", "2.2 Run verification"));

    expect(before.status).toBe("ok");
    expect(after.status).toBe("ok");
    if (before.status !== "ok" || after.status !== "ok") return;
    expect(after.inventory.inventoryDigest).toBe(before.inventory.inventoryDigest);
  });

  it("excludes verification Goal content from entries and the inventory digest", () => {
    const withoutGoal = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind stable implementation intent.",
    ]));
    const withGoal = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind stable implementation intent.",
    ]).replace(
      "### `[ ]` **2.1 Verification**",
      [
        "### `[ ]` **2.1 Verification**",
        "",
        "- _Goal:_ This verification text is not implementation intent.",
      ].join("\n"),
    ));

    expect(withoutGoal.status).toBe("ok");
    expect(withGoal.status).toBe("ok");
    if (withoutGoal.status !== "ok" || withGoal.status !== "ok") return;
    expect(withGoal.inventory.implementation).toHaveLength(1);
    expect(withGoal.inventory.inventoryDigest).toBe(withoutGoal.inventory.inventoryDigest);
  });

  it.each([
    ["missing", []],
    ["empty", ["- _Goal:_"]],
    ["duplicate", ["- _Goal:_ First intent.", "", "- _Goal:_ Second intent."]],
  ] as const)("refuses an implementation parent with a %s Goal", (_kind, goalLines) => {
    expect(buildDeliveryTaskInventory(taskList(goalLines))).toEqual({
      status: "refused",
      reason: "task-list-malformed",
    });
  });

  it("refuses when the final phase is not titled Verification", () => {
    const result = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind implementation intent.",
    ]).replace("## **Phase 2:** Verification", "## **Phase 2:** Validation"));

    expect(result).toEqual({
      status: "refused",
      reason: "verification-phase-missing",
    });
  });

  it("refuses when the final Verification phase has no sole parent", () => {
    const base = taskList(["- _Goal:_ Bind implementation intent."]);
    const noParent = buildDeliveryTaskInventory(base.replace(
      "### `[ ]` **2.1 Verification**",
      "",
    ));
    const twoParents = buildDeliveryTaskInventory([
      base,
      "",
      "### `[ ]` **2.2 Additional verification parent**",
    ].join("\n"));

    expect(noParent).toEqual({
      status: "refused",
      reason: "verification-task-ambiguous",
    });
    expect(twoParents).toEqual({
      status: "refused",
      reason: "verification-task-ambiguous",
    });
  });

  it("refuses a verification parent that reuses an implementation task id", () => {
    const result = buildDeliveryTaskInventory(taskList([
      "- _Goal:_ Bind implementation intent.",
    ]).replace("2.1 Verification", "1.1 Verification"));

    expect(result).toEqual({
      status: "refused",
      reason: "task-list-malformed",
    });
  });
});
