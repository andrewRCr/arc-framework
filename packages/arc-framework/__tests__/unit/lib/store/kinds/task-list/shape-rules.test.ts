/** Task-list shape admission follows changed clusters and diagnostic identity. */
import { describe, expect, it } from "vitest";
import { checkTaskListDescriptor, checkTaskListSegmentation } from "../../../../../../src/lib/store/kinds/task-list/shape-rules.js";
import { TASK_RULE_CONTENT as content, taskRuleInput } from "../../../../../helpers/store/task-rule-input.js";
const bad = content.replace("- _Goal:_ Build behavior.", "- _Goal:_ Build behavior across\n  a wrapped line.\n- _Context:_ Preserve context.");
const segmented = content.replace("### `[ ]`", "_Mode:_ `layer` — Settled structure.\n\n_Exit criterion:_ Structure is settled.\n\n### `[ ]`")
  + "\n## **Phase 2:** Verification\n\n### `[ ]` **2.1 Verify**\n";
describe("changed descriptor clusters", () => {
  it("refuses a newly broken cluster", () => expect(checkTaskListDescriptor(taskRuleInput(bad, content)))
    .toMatchObject([{ rule: "task-list.descriptor", condition: expect.stringContaining("blank line") }]));
  it("refuses a broken cluster on creation", () => expect(checkTaskListDescriptor(taskRuleInput(bad, null)))
    .toMatchObject([{ rule: "task-list.descriptor" }]));
  it("refuses a changed already-broken cluster", () => expect(checkTaskListDescriptor(taskRuleInput(bad.replace("context.", "changed context."), bad)))
    .toMatchObject([{ rule: "task-list.descriptor" }]));
  it("refuses a newly broken cluster after an unparseable prior", () => expect(checkTaskListDescriptor(taskRuleInput(bad, `${content}\n    - \`[ ]\` **1.1.1 Invalid**`)))
    .toMatchObject([{ rule: "task-list.descriptor" }]));
});
describe("new segmentation diagnostics", () => {
  it("refuses a new missing exit criterion", () => expect(checkTaskListSegmentation(taskRuleInput(segmented.replace("_Exit criterion:_ Structure is settled.\n", ""), segmented)))
    .toMatchObject([{ rule: "task-list.segmentation", condition: expect.stringContaining("no _Exit criterion:_") }]));
  it("refuses new numeric third-level task grammar", () => expect(checkTaskListSegmentation(taskRuleInput(`${content}\n    - \`[ ]\` **1.1.1 Invalid**`, content)))
    .toMatchObject([{ rule: "task-list.segmentation", condition: expect.stringContaining("malformed") }]));
  it("refuses malformed task grammar on creation", () => expect(checkTaskListSegmentation(taskRuleInput(`${content}\n    - \`[ ]\` **1.1.1 Invalid**`, null)))
    .toMatchObject([{ rule: "task-list.segmentation" }]));
});
describe("shape admission and repair", () => {
  it.each([
    ["insert the missing separator", bad.replace("\n- _Context:_", "\n\n- _Context:_"), bad],
    ["leave a broken cluster on a renamed task", bad.replace("1.1 Build", "1.1 Renamed"), bad],
    ["shift an unchanged broken cluster", `Introductory prose.\n\n${bad}`, bad],
    ["change prose after a broken cluster", `${bad}\nUnrelated prose.\n`, bad],
    ["create a valid cluster", content, null],
    ["remove descriptor content", content.replace("- _Goal:_ Build behavior.", ""), bad],
    ["remove a task list", null, bad],
  ])("admits a descriptor write to %s", (_name, next, prior) => expect(checkTaskListDescriptor(taskRuleInput(next, prior))).toEqual([]));
  const missing = segmented.replace("_Exit criterion:_ Structure is settled.\n", "");
  it.each([
    ["shift a legacy segmentation diagnostic", `Introductory prose.\n\n${missing}`, missing],
    ["repair the missing exit criterion", segmented, missing],
    ["create valid segmentation", segmented, null],
    ["change a legacy malformed scanner error", `${content}\n    - \`[ ]\` **1.1.2 Different invalid**`, `${content}\n    - \`[ ]\` **1.1.1 Invalid**`],
    ["repair legacy malformed task grammar", content, `${content}\n    - \`[ ]\` **1.1.1 Invalid**`],
    ["remove a malformed task list", null, `${content}\n    - \`[ ]\` **1.1.1 Invalid**`],
  ])("admits segmentation writes to %s", (_name, next, prior) => expect(checkTaskListSegmentation(taskRuleInput(next, prior))).toEqual([]));
});
