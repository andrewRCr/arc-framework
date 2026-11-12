/** Hand marker changes name the task verbs without supplying an executable guess. */
import { expect, it } from "vitest";
import { checkTaskListClose } from "../../../../../../src/lib/store/kinds/task-list/authority-rules.js";
import { TASK_RULE_CONTENT as content, taskRuleInput } from "../../../../../helpers/store/task-rule-input.js";
const marked = (marker: string) => content.replace("`[ ]`", `\`[${marker}]\``);
it("names both close forms for a hand completion", () => {
  const result = checkTaskListClose(taskRuleInput(marked("x")));
  expect(result[0]?.remedy.text).toContain("arc release commit --close=1.1");
  expect(result[0]?.remedy.text).toContain("arc task close 1.1");
  expect(result[0]?.remedy.argv).toBeUndefined();
});
it("names deferral for an open or newly added deferred task", () => {
  for (const prior of [content, null]) expect(checkTaskListClose(taskRuleInput(marked("~"), prior))[0]?.remedy.text).toContain("arc task defer 1.1");
});
it.each([["x", "~"], ["x", " "], ["~", " "]])("keeps a closed %s task closed after a hand %s edit", (prior, next) => {
  const result = checkTaskListClose(taskRuleInput(marked(next), marked(prior)));
  expect(result[0]?.remedy.text).toContain("closed task stays closed");
  expect(result[0]?.remedy.text).toContain("new task");
});
it("names both repairs once for a mixed edit", () => {
  const before = `${content}\n### \`[ ]\` **1.2 Defer this**\n`;
  const next = before.replace("`[ ]`", "`[x]`").replace("### `[ ]` **1.2", "### `[~]` **1.2");
  const result = checkTaskListClose(taskRuleInput(next, before));
  expect(result).toHaveLength(1);
  expect(result[0]?.remedy.text).toContain("arc task close 1.1");
  expect(result[0]?.remedy.text).toContain("arc task defer 1.2");
});
