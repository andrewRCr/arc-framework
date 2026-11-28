import { readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { expect, it } from "vitest";

import { lifecycleRepository, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

it("hands delivery a usable task-list path before generate-tasks finalizes the meta", async () => {
  const { repo, run } = await lifecycleRepository();
  await seedWorkUnit(repo, "demo", {
    identity: "test-user", bind: repo,
    meta: { owner: "test-user", state: "Planning", currentWorkflow: "generate-tasks",
      taskList: null, design: ["spec-demo.md"] },
    taskList: "# Task List: Demo\n\n- **Design:** `spec-demo.md`\n\n## **Phase 1:** Build\n\n"
      + "### `[ ]` **1.1 Build the feature**\n\n- _Goal:_ Build the feature.\n",
  });
  const meta = await run(["view", "meta", "--path"]);
  const tasks = await run(["view", "tasks", "--path"]);
  expect(meta.exitCode, meta.output).toBe(0);
  expect(tasks.exitCode, tasks.output).toBe(0);
  const path = tasks.stdout.trim();
  expect(path).toBe(join(dirname(meta.stdout.trim()), "tasks-demo.md"));

  // Leave the inventory absent so its diagnostic proves the handler accepted and read the task list.
  const fromTasks = async (operand: string): Promise<unknown> => {
    const result = await run(["delivery", "plan", "from-tasks", "--task-list", operand,
      "--design-inventory", "missing-inventory.json", "--json"]);
    return JSON.parse(result.stdout);
  };
  const repoPath = relative(repo, path);
  const afterTaskList = { status: "refused", reason: "invalid-design-inventory" };
  expect(await fromTasks(repoPath)).toMatchObject(afterTaskList);

  const workflow = await readFile(join(repo, ".arc/system/workflows/arc/generate-tasks.md"), "utf8");
  const handoff = workflow.split(/\r?\n\s*\r?\n/u).find(p => p.includes("arc delivery plan from-tasks --task-list"));
  if (handoff === undefined) throw new Error("Expected the delivery handoff in generate-tasks");
  const directsRelative = /\brepo(?:sitory)?[-\s]+relative\b|\brelative to (?:the )?(?:repo(?:sitory)?|checkout)\b/iu;
  const operand = directsRelative.test(handoff) ? repoPath : path;
  expect(await fromTasks(operand), handoff).toMatchObject(afterTaskList);
}, LIFECYCLE_TIMEOUT_MS);
