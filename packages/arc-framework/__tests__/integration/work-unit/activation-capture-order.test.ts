import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("saves capture dispositions and folds before removing their sources", async () => {
  const workflow = await readFile(resolve(import.meta.dirname,
    "../../../arc/system/workflows/arc/work-unit-lifecycle/activate-work-unit.md"), "utf8");
  const gate = workflow.slice(workflow.indexOf("### 1)"), workflow.indexOf("### 2)"));
  const notes = gate.search(/notes(?:-\{name\}\.md| companion)/u);
  const fold = gate.indexOf("fold");
  const save = gate.indexOf("arc save", notes);
  const remove = gate.indexOf("arc user inbox-remove");

  expect(notes).toBeGreaterThanOrEqual(0);
  expect(fold).toBeGreaterThanOrEqual(0);
  expect(save).toBeGreaterThan(Math.max(notes, fold));
  expect(remove, "The source row must remain until its disposition is saved").toBeGreaterThan(save);
  expect(gate.slice(0, save)).toMatch(/\bID\b[^.]*\bversion\b/iu);
  expect(gate).toMatch(/\b(?:retry|restart)\b[^.]*\bsaved\b/iu);
});
