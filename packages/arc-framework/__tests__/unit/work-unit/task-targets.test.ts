/** Target preparation identifies malformed or ambiguous lines and preserves unrelated parents. */
import { expect, it } from "vitest";
import { prepareTaskTargets } from "../../../src/lib/work-unit/task-targets.js";
const content = "### `[ ]` **1.1 Parent**\n\n    - `[ ]` **1.1.a Child**\n";
it("names the malformed scanner line", () => {
  expect(prepareTaskTargets(content.replace("1.1.a", "1.1.1"), ["1.1"], "close"))
    .toMatchObject({ status: "refused", reason: expect.stringContaining("line 3") });
});
it("names all lines for a duplicate child selected by its parent", () => {
  expect(prepareTaskTargets(`${content}    - \`[ ]\` **1.1.a Duplicate**\n`, ["1.1"], "close"))
    .toMatchObject({ status: "refused", reason: expect.stringContaining("3, 4") });
});
it("does not cascade an unrelated parent with only deferred children", () => {
  const before = `${content}\n### \`[ ]\` **1.2 Unrelated**\n\n    - \`[~]\` **1.2.a Deferred**\n`;
  const result = prepareTaskTargets(before, ["1.1.a"], "close");
  expect(result).toMatchObject({ status: "prepared", content: expect.stringContaining("### `[ ]` **1.2 Unrelated**") });
});
it("a named close completes an otherwise deferred parent", () => {
  expect(prepareTaskTargets(content.replaceAll("`[ ]`", "`[~]`"), ["1.1"], "close"))
    .toMatchObject({ status: "prepared", content: expect.stringContaining("### `[x]` **1.1 Parent**") });
});
