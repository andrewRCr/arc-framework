/** Task closure authority follows paired scanner items and the derived writer. */
import { describe, expect, it } from "vitest";
import { checkTaskListClose, checkTaskListDeliveryPlan } from "../../../../../../src/lib/store/kinds/task-list/authority-rules.js";
import { DELIVERY_PLAN_START_SENTINEL as start, DELIVERY_PLAN_END_SENTINEL as end } from "../../../../../../src/lib/store/kinds/task-list/delivery-plan-splice.js";
import { TASK_RULE_CONTENT as content, taskRuleInput } from "../../../../../helpers/store/task-rule-input.js";
const marked = (marker: string) => content.replace("`[ ]`", `\`[${marker}]\``);
describe("task marker authority", () => {
  it.each(["x", "~"])("refuses hand closure to %s", (marker) => {
    expect(checkTaskListClose(taskRuleInput(marked(marker)))).toMatchObject([{ rule: "task-list.close" }]);
  });
  it.each(["x", "~"])("refuses a new list carrying a closed %s line", (marker) => {
    expect(checkTaskListClose(taskRuleInput(marked(marker), null))).toMatchObject([{ rule: "task-list.close" }]);
  });
  it.each(["x", "~"])("refuses an added closed %s subtask", (marker) => {
    const next = `${content}\n    - \`[${marker}]\` **1.1.a Added**\n`;
    expect(checkTaskListClose(taskRuleInput(next))).toMatchObject([{ rule: "task-list.close" }]);
  });
  it.each([["x", " "], ["~", " "], ["x", "~"], ["~", "x"]])("refuses changing prior %s to %s", (prior, next) => {
    expect(checkTaskListClose(taskRuleInput(marked(next), marked(prior)))).toMatchObject([{ rule: "task-list.close" }]);
  });
  it("admits a close verb", () => {
    expect(checkTaskListClose(taskRuleInput(marked("x"), content, { kind: "verb", verb: "close" }))).toEqual([]);
  });
  it("admits an unrelated edit leaving closed markers unchanged", () => {
    const prior = marked("x");
    expect(checkTaskListClose(taskRuleInput(`${prior}\n## Notes\n\nEdit.\n`, prior))).toEqual([]);
  });
  it("admits restructuring open tasks and future phases", () => {
    const next = `${content.replace("1.1 Build", "1.2 Changed")}\n## **Phase 2:** Future\n`;
    expect(checkTaskListClose(taskRuleInput(next))).toEqual([]);
  });
  it("admits closure repairs when the prior scanner fails", () => {
    expect(checkTaskListClose(taskRuleInput(marked("x"), content.replace("1.1 Build", "1.1.1 Bad")))).toEqual([]);
  });
  it("admits a new list with only open lines", () => {
    expect(checkTaskListClose(taskRuleInput(content, null))).toEqual([]);
  });
});

const region = `${start}\n## Delivery Plan\n\nOwned body.\n${end}`;
const withPlan = `${content}\n${region}\n`;
describe("delivery-plan authority", () => {
  it("refuses a hand edit of managed body bytes", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan.replace("Owned body.", "Edited body."), withPlan)))
      .toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("refuses removing a managed region", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(content, withPlan))).toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("refuses adding a managed region by hand", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan, content))).toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it.each([start, end])("refuses removing a managed marker %s", (marker) => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan.replace(marker, ""), withPlan)))
      .toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("refuses a new task list carrying a managed region", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan, null))).toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("refuses changing managed line-ending bytes", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan.replaceAll("\n", "\r\n"), withPlan)))
      .toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("protects the readable region despite malformed prior task lines", () => {
    const prior = withPlan.replace("1.1 Build", "1.1.1 Bad");
    expect(checkTaskListDeliveryPlan(taskRuleInput(prior.replace("Owned body.", "Edit."), prior)))
      .toMatchObject([{ rule: "task-list.delivery-plan" }]);
  });
  it("admits an edit outside unchanged managed bytes", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(`${withPlan}\n## Notes\n\nEdit.\n`, withPlan))).toEqual([]);
  });
  it("admits an edit of the unmarked provisional section", () => {
    const prior = `${content}\n## Delivery Plan\n\nProvisional prose.\n`;
    expect(checkTaskListDeliveryPlan(taskRuleInput(prior.replace("Provisional prose.", "Edited prose."), prior))).toEqual([]);
  });
  it("admits a composition verb changing the managed region", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(withPlan.replace("Owned body.", "Updated."), withPlan,
      { kind: "verb", verb: "delivery-compose" }))).toEqual([]);
  });
  it("admits a new unmarked task list", () => {
    expect(checkTaskListDeliveryPlan(taskRuleInput(content, null))).toEqual([]);
  });
});
