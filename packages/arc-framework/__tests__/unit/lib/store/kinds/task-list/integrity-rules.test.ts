/** Completed identifiers are compared through the task scanner's file-order pairs. */
import { describe, expect, it } from "vitest";
import { checkTaskListCompletedIdentifier, checkTaskListCompletedGoal } from "../../../../../../src/lib/store/kinds/task-list/integrity-rules.js";
import { checkTaskListRecord } from "../../../../../../src/lib/store/kinds/task-list/check.js";
import { TASK_RULE_CONTENT as content, taskRuleInput } from "../../../../../helpers/store/task-rule-input.js";
const completed = content.replace("`[ ]`", "`[x]`");
const prefix = content.slice(0, content.indexOf("### `[ ]`"));
describe("completed task identifiers", () => {
  it("refuses deleting a completed parent", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(prefix, completed))).toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("refuses renumbering a completed parent", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(completed.replace("1.1 Build", "1.2 Build"), completed)))
      .toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("refuses removing a completed subtask", () => {
    const prior = `${content}\n    - \`[x]\` **1.1.a Completed**\n`;
    expect(checkTaskListCompletedIdentifier(taskRuleInput(content, prior))).toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("refuses removing a whole list carrying a completed task", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(null, completed))).toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("binds a verb removing a completed identifier", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(prefix, completed, { kind: "verb", verb: "revise" })))
      .toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("protects the completed occurrence of a repeated identifier", () => {
    const prior = `${content}\n### \`[x]\` **1.1 Repeated**\n`;
    expect(checkTaskListCompletedIdentifier(taskRuleInput(content, prior))).toMatchObject([{ rule: "task-list.completed-identifier" }]);
  });
  it("admits retaining a completed identifier while editing surrounding prose", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(`${completed}\n## Notes\n\nEdit.\n`, completed))).toEqual([]);
  });
  it("admits restructuring open tasks and future phases", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(`${content.replace("1.1 Build", "2.1 Changed")}\n## **Phase 2:** Future\n`)))
      .toEqual([]);
  });
  it("admits removal of a deferred task without completion captures", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(prefix, content.replace("`[ ]`", "`[~]`")))).toEqual([]);
  });
  it("admits an identifier repair when the prior scanner fails", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(completed, completed.replace("1.1 Build", "1.1.1 Bad")))).toEqual([]);
  });
  it("admits a new list with no previously completed identifier", () => {
    expect(checkTaskListCompletedIdentifier(taskRuleInput(completed, null))).toEqual([]);
  });
});

const child = (id: string, goal: string) => `    - \`[x]\` **${id} Completed**\n        - _Goal:_ ${goal}\n`;
describe("completed task Goals", () => {
  it.each([
    { action: "change", writer: { kind: "hand-edit" } as const },
    { action: "remove", writer: { kind: "hand-edit" } as const },
    { action: "change", writer: { kind: "verb", verb: "revise" } as const },
    { action: "remove", writer: { kind: "verb", verb: "revise" } as const },
  ])("refuses $action of a completed Goal before less-indented body prose by $writer.kind", ({ action, writer }) => {
    const prior = `${content}\n${child("1.1.a", "Child intent.")}\n      Later body prose.\n`;
    const next = action === "change" ? prior.replace("Child intent.", "Changed intent.")
      : prior.replace("        - _Goal:_ Child intent.\n", "");
    expect(checkTaskListRecord(taskRuleInput(next, prior, writer)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });

  it("refuses changing a completed parent's Goal", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed.replace("Build behavior.", "Different intent."), completed)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("refuses removing a completed parent's Goal", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed.replace("- _Goal:_ Build behavior.\n", ""), completed)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("refuses changing a wrapped Goal continuation", () => {
    const prior = completed.replace("Build behavior.", "Build behavior\n  including details.");
    expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("including details.", "excluding details."), prior)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("refuses changing a completed subtask's own Goal", () => {
    const prior = `${content}\n${child("1.1.a", "Child intent.")}`;
    expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("Child intent.", "Changed child intent."), prior)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("does not borrow a child Goal when a completed parent's Goal is lost", () => {
    const prior = `${completed}\n${child("1.1.a", "Child intent.")}`;
    expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("- _Goal:_ Build behavior.\n", ""), prior)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("does not borrow a sibling Goal when a completed subtask's Goal is lost", () => {
    const prior = `${content}\n${child("1.1.a", "First child.")}\n${child("1.1.b", "Second child.")}`;
    expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("        - _Goal:_ First child.\n", ""), prior)))
      .toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("does not borrow parent-level prose after a completed subtask", () => {
    const prior = `${content}\n${child("1.1.a", "Child intent.")}`;
    const next = `${prior.replace("        - _Goal:_ Child intent.\n", "")}\n- _Goal:_ Child intent.\n`;
    expect(checkTaskListCompletedGoal(taskRuleInput(next, prior))).toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("keeps repeated identifiers' Goals paired in file order", () => {
    const prior = `${completed}\n### \`[x]\` **1.1 Repeated**\n\n- _Goal:_ Other intent.\n`;
    const next = prior.replace(/Build behavior\.|Other intent\./gu, (value) => value === "Build behavior." ? "Other intent." : "Build behavior.");
    expect(checkTaskListCompletedGoal(taskRuleInput(next, prior))).toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("refuses loss of Goal-bearing completed tasks when the whole list is removed", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(null, completed))).toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("binds a verb changing completed intent", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed.replace("Build behavior.", "Changed."), completed,
      { kind: "verb", verb: "revise" }))).toMatchObject([{ rule: "task-list.completed-goal" }]);
  });
  it("admits whitespace-only Goal wrapping compatible with its semantic digest", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed.replace("Build behavior.", "Build\n  behavior."), completed))).toEqual([]);
  });
  it("admits title and surrounding-prose edits with completed intent unchanged", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(`${completed.replace("1.1 Build", "1.1 Renamed")}\n## Notes\n\nEdit.\n`, completed)))
      .toEqual([]);
  });
  it("admits restructuring open Goals and future phases", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(`${content.replace("Build behavior.", "Changed.")}\n## **Phase 2:** Future\n`)))
      .toEqual([]);
  });
  it("admits a repair without a readable prior scan", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed, completed.replace("1.1 Build", "1.1.1 Bad")))).toEqual([]);
  });
  it("admits a new list without previously completed intent", () => {
    expect(checkTaskListCompletedGoal(taskRuleInput(completed, null))).toEqual([]);
  });
  it("admits a deferred Goal change without completion captures", () => {
    const prior = content.replace("`[ ]`", "`[~]`");
    expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("Build behavior.", "Changed."), prior))).toEqual([]);
  });
});

it.each([
  { check: checkTaskListCompletedIdentifier, rule: "task-list.completed-identifier" },
  { check: checkTaskListCompletedGoal, rule: "task-list.completed-goal" },
])("reports unavailable retention evidence for $rule when the proposed scan fails", ({ check, rule }) => {
  const next = `${completed}\n### \`[ ]\` **2.1.1 Bad**\n`;
  expect(check(taskRuleInput(next, completed))).toMatchObject([{ rule, condition: expect.stringContaining("scanner") }]);
});

it("refuses changing a wrapped subtask Goal after wrapped Context", () => {
  const prior = `${content}\n    - \`[x]\` **1.1.a Completed**\n        - _Context:_ Authored context\n          with details.\n\n        - _Goal:_ Child intent\n          including details.\n`;
  expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("including details.", "excluding details."), prior)))
    .toMatchObject([{ rule: "task-list.completed-goal" }]);
});
it("admits retained completed intent across parent and subtask roles", () => {
  const next = `${prefix}### \`[ ]\` **2.1 Container**\n\n    - \`[x]\` **1.1 Moved**\n        - _Goal:_ Build behavior.\n`;
  expect(checkTaskListCompletedGoal(taskRuleInput(next, completed))).toEqual([]);
});

it("retains subtask Goals under every whitespace indentation accepted by the scanner", () => {
  const space = "\u00a0";
  const prior = `${content}\n${space.repeat(4)}- \`[x]\` **1.1.a Completed**\n${space.repeat(8)}- _Goal:_ Unicode child.\n`;
  expect(checkTaskListCompletedGoal(taskRuleInput(prior.replace("Unicode child.", "Changed child."), prior)))
    .toMatchObject([{ rule: "task-list.completed-goal" }]);
});
