import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { TASK_RULE_CONTENT } from "../helpers/store/task-rule-input.js";
import { expectLifecycleResult, lifecycleRepository, LIFECYCLE_IDENTITY, LIFECYCLE_TIMEOUT_MS } from "../helpers/store-lifecycle-fixture.js";
import { retainLateEdit, workflowSaveBlocked } from "../helpers/workflow-save-gate.js";

it.each(["refused edit", "retained aside edit"] as const)("keeps the planning next action for a %s", async condition => {
  const h = await lifecycleRepository();
  const nextAction = "Finish the task list";
  const { meta, taskList } = await seedWorkUnit(h.repo, "example", {
    identity: LIFECYCLE_IDENTITY, bind: h.repo, taskList: TASK_RULE_CONTENT,
    meta: { state: "Planning", owner: LIFECYCLE_IDENTITY, currentWorkflow: "generate-tasks",
      design: ["spec-example.md"], nextAction },
    records: [{ kind: "work-item/spec", content: "# Specification: Example\n" }],
  });
  if (!taskList) throw new Error("Expected a seeded task list");
  const view = await h.run(["view", "tasks", "--path"]);
  expectLifecycleResult(view, 0, /tasks-example\.md/u);
  const path = view.stdout.trim();
  const original = await readFile(path, "utf8");
  const edit = "    - `[ ]` **1.1.1 Check the result**";
  const repaired = "    - `[ ]` **1.1.a Check the result**";
  let repair: () => Promise<void>;
  if (condition === "refused edit") {
    await appendFile(path, `\n${edit}\n`);
    const saved = await h.run(["save"]);
    expect(saved.exitCode, saved.output).toBe(0);
    expect(saved.output).toContain("task-list.segmentation");
    expect((await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, taskList.reference)).version).toEqual(taskList.version);
    expect(await readFile(path, "utf8")).toContain(edit);
    repair = async () => {
      await writeFile(path, `${original}\n${repaired}\n`);
      const retry = await h.run(["save"]);
      expect(retry.exitCode, retry.output).toBe(0);
    };
  } else {
    repair = await retainLateEdit(h, path, repaired);
    expect((await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, taskList.reference)).content).not.toContain(repaired);
  }

  const workflow = await readFile(join(h.repo, ".arc/system/workflows/arc/generate-tasks.md"), "utf8");
  const afterSave = workflow.split(/^arc save$/mu).at(-1)?.split("arc finalize generate-tasks")[0] ?? "";
  const finalize = async (): Promise<void> => {
    if (await workflowSaveBlocked(h, afterSave, [path])) return;
    const result = await h.run(["finalize", "generate-tasks", "--class", "Light"]);
    expect(result.exitCode, result.output).toBe(0);
  };
  await finalize();
  expect((await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, meta.reference)).fields).toMatchObject({ nextAction });

  await repair();
  expect((await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, taskList.reference)).content).toContain(repaired);
  await finalize();
  expect((await readStoreRecord(h.repo, LIFECYCLE_IDENTITY, meta.reference)).fields)
    .toMatchObject({ nextAction: "Task list finalized — ready to activate" });
}, LIFECYCLE_TIMEOUT_MS);
