/** Registered task-list checks compose all applicable authority, integrity, and shape rules. */
import { expect, it } from "vitest";
import { createKindRegistry } from "../../../../../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../../../../../src/lib/store/kinds/registrations.js";
import { DELIVERY_PLAN_START_SENTINEL as start, DELIVERY_PLAN_END_SENTINEL as end } from "../../../../../../src/lib/store/kinds/task-list/delivery-plan-splice.js";
import { TASK_RULE_CONTENT as content, taskRuleInput } from "../../../../../helpers/store/task-rule-input.js";
function registeredCheck() {
  const check = createKindRegistry(PRODUCTION_REGISTRATIONS)["work-item/task-list"].check;
  if (check === null) throw new Error("A task-list check must be registered");
  return check;
}
it("returns every applicable rule through the production registration", async () => {
  const prior = `${content.replace("[ ]", "[x]")}\n${start}\nOld plan.\n${end}\n`;
  const next = `${content.replace("1.1 Build", "1.2 New closed").replace("[ ]", "[x]").replace("- _Goal:_ Build behavior.",
    "- _Goal:_ Other intent spanning\n  multiple lines.\n- _Context:_ Context.")}\n_Mode:_ invalid declaration\n${start}\nChanged plan.\n${end}\n`;
  // Put the new mode in the phase preamble, where segmentation reads declarations.
  const proposed = next.replace("\n_Mode:_ invalid declaration", "").replace("### `[x]`", "_Mode:_ invalid declaration\n\n### `[x]`");
  expect((await registeredCheck()(taskRuleInput(proposed, prior))).map(({ rule }) => rule).sort()).toEqual([
    "task-list.close", "task-list.completed-goal", "task-list.completed-identifier", "task-list.delivery-plan",
    "task-list.descriptor", "task-list.segmentation",
  ]);
});
it("returns both applicable completed integrity rules together", async () => {
  expect((await registeredCheck()(taskRuleInput(null, content.replace("[ ]", "[x]"), { kind: "verb", verb: "close" })))
    .map(({ rule }) => rule).sort()).toEqual(["task-list.completed-goal", "task-list.completed-identifier"]);
});
it("admits valid creation through the production registration", async () => {
  expect(await registeredCheck()(taskRuleInput(content, null))).toEqual([]);
});
