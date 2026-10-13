/** Lifecycle rules preserve stale fields while checking changes and active placement entry. */
import { describe, expect, it } from "vitest";
import { checkMetaStage, checkMetaPrepareTasks } from "../../../../../../src/lib/store/kinds/meta/lifecycle-rules.js";
import type { ReadPlacement, WriteCheckInput } from "../../../../../../src/lib/store/index.js";
import { META_RULE_CONTENT as content, META_RULE_UID as uid, metaRuleInput } from "../../../../../helpers/store/meta-rule-input.js";
import { ruleRecord, ruleView } from "../../../../../helpers/store/rule-view.js";

const active: ReadPlacement = { kind: "active" };
const planned: ReadPlacement = { kind: "backlog", commitment: "planned" };
function placed(input: WriteCheckInput, nextPlacement: ReadPlacement = active, priorPlacement: ReadPlacement = active): WriteCheckInput {
  input.before = ruleView(input.prior === undefined ? [] : [ruleRecord("work-item/meta", "example", uid,
    input.prior.content, input.prior.fields, priorPlacement)]);
  input.after = ruleView(input.next === undefined ? [] : [ruleRecord("work-item/meta", "example", uid,
    input.next.content, input.next.fields, nextPlacement)]);
  return input;
}
const inconsistent = content.replace("`process-task-loop`", "`integrate-work-unit`");
const planning = content.replace("`Active`", "`Planning`").replace("`process-task-loop`", "`generate-tasks`");
const unavailable = (input: WriteCheckInput, side: "before" | "after"): WriteCheckInput => {
  input[side] = { ...input[side], read: async () => ({ status: "refused", refusal: { code: "namespace-corrupt", class: "terminal",
    namespace: "work-item", condition: "Record observation unavailable", remedy: { text: "Repair the namespace and retry." } } }) };
  return input;
};
describe("metadata lifecycle stage", () => {
  it.each([
    [inconsistent, content], [content.replace("`Active`", "`Integrating`"), content],
    [planning.replace("spec-example.md", "draft-example.md"), planning], [inconsistent, null],
  ])("refuses a newly inconsistent active tuple", async (next, prior) => {
    expect(await checkMetaStage(metaRuleInput(next, prior))).toMatchObject([{ rule: "meta.stage" }]);
  });
  it("refuses entering active placement with an unchanged inconsistent tuple", async () => {
    expect(await checkMetaStage(placed(metaRuleInput(inconsistent, inconsistent), active, planned)))
      .toMatchObject([{ rule: "meta.stage" }]);
  });
  it.each(["before", "after"] as const)("refuses unavailable %s placement evidence", async (side) => {
    expect(await checkMetaStage(unavailable(metaRuleInput(), side))).toMatchObject([{ rule: "meta.stage" }]);
  });
  it("admits a new consistent in-flight record", async () => {
    expect(await checkMetaStage(metaRuleInput(content, null))).toEqual([]);
  });
  it("admits a consistent changed state and workflow", async () => {
    expect(await checkMetaStage(metaRuleInput(inconsistent.replace("`Active`", "`Integrating`")))).toEqual([]);
  });
  it("admits an unchanged stale tuple under an unrelated edit", async () => {
    expect(await checkMetaStage(metaRuleInput(`${inconsistent}\n## Notes\n\nEdit.\n`, inconsistent))).toEqual([]);
  });
  it("admits a tuple outside active placement", async () => {
    expect(await checkMetaStage(placed(metaRuleInput(inconsistent, null), planned))).toEqual([]);
  });
  it("admits field repairs without prior parsed evidence in unchanged active placement", async () => {
    expect(await checkMetaStage(metaRuleInput(inconsistent, "# Broken\n"))).toEqual([]);
  });
  it("admits removal", async () => {
    expect(await checkMetaStage(metaRuleInput(null))).toEqual([]);
  });
});

const prepared = content.replace("`process-task-loop`", "`prepare-work-unit`")
  .replace("- **Task List:** [none]", "- **Task List:** `tasks-example.md`");
const closedTasks = "# Tasks\n\n## **Phase 1:** Work\n\n### `[x]` **1.1 Done**\n\n- _Goal:_ Complete the work.\n";
function withTasks(input: WriteCheckInput, bytes: string, name = "example"): WriteCheckInput {
  const next = input.next;
  if (next === undefined) throw new Error("This fixture needs a next meta.");
  const current = ruleRecord("work-item/meta", "example", uid, next.content, next.fields);
  const tasks = ruleRecord("work-item/task-list", name, name === "example" ? uid : "00000000-0000-4000-8000-000000000002", bytes);
  input.after = ruleView([current, tasks]);
  return input;
}
describe("metadata task preparation", () => {
  it("refuses another work unit's task-list filename", async () => {
    const input = withTasks(metaRuleInput(prepared.replace("tasks-example.md", "tasks-other.md")), closedTasks, "other");
    expect(await checkMetaPrepareTasks(input)).toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses an absent own task list", async () => {
    expect(await checkMetaPrepareTasks(metaRuleInput(prepared))).toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it.each(["[none]", "[none associated]"])("refuses the no-task-list sentinel %s", async (value) => {
    const next = content.replace("`process-task-loop`", "`prepare-work-unit`")
      .replace("- **Task List:** [none]", `- **Task List:** ${value}`);
    expect(await checkMetaPrepareTasks(metaRuleInput(next))).toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses an open task in the proposed own task list", async () => {
    expect(await checkMetaPrepareTasks(withTasks(metaRuleInput(prepared), closedTasks.replace("`[x]`", "`[ ]`"))))
      .toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses a changed task list while preparation is already selected", async () => {
    const input = withTasks(metaRuleInput(prepared, prepared.replace("tasks-example.md", "tasks-other.md")),
      closedTasks.replace("`[x]`", "`[ ]`"));
    expect(await checkMetaPrepareTasks(input)).toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses a malformed cursor in the proposed own task list", async () => {
    expect(await checkMetaPrepareTasks(withTasks(metaRuleInput(prepared), closedTasks.replace("1.1 Done", "1.1.1 Bad"))))
      .toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses unavailable resulting placement evidence", async () => {
    expect(await checkMetaPrepareTasks(unavailable(metaRuleInput(prepared), "after")))
      .toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it("refuses an unavailable own task-list observation", async () => {
    const input = withTasks(metaRuleInput(prepared), closedTasks), read = input.after.read;
    input.after = { ...input.after, read: async (request) => request.reference.kind === "work-item/task-list"
      ? { status: "refused", refusal: { code: "namespace-corrupt", class: "terminal", namespace: "work-item",
        condition: "Task list unavailable", remedy: { text: "Repair and retry." } } } : read(request) };
    expect(await checkMetaPrepareTasks(input)).toMatchObject([{ rule: "meta.prepare-tasks" }]);
  });
  it.each(["x", "~"])("admits an own list containing only closed %s tasks", async (marker) => {
    expect(await checkMetaPrepareTasks(withTasks(metaRuleInput(prepared, marker === "x" ? null : content), closedTasks.replace("[x]", `[${marker}]`)))).toEqual([]);
  });
  it("admits an unchanged stale preparation pointer under an unrelated edit", async () => {
    const input = withTasks(metaRuleInput(`${prepared}\n## Notes\n\nEdit.\n`, prepared), closedTasks.replace("`[x]`", "`[ ]`"));
    expect(await checkMetaPrepareTasks(input)).toEqual([]);
  });
  it("admits task-list changes outside preparation", async () => {
    expect(await checkMetaPrepareTasks(metaRuleInput(content.replace("- **Task List:** [none]", "- **Task List:** `tasks-other.md`"))))
      .toEqual([]);
  });
  it("admits preparation outside active placement", async () => {
    expect(await checkMetaPrepareTasks(placed(metaRuleInput(prepared), planned))).toEqual([]);
  });
  it("admits integrity fields without prior comparison authority", async () => {
    expect(await checkMetaPrepareTasks(metaRuleInput(prepared, "# Broken\n"))).toEqual([]);
  });
  it("admits removal", async () => {
    expect(await checkMetaPrepareTasks(metaRuleInput(null))).toEqual([]);
  });
});
