/** Production review-fix continuation reads native lifecycle records without projected files. */
import { expect, it, onTestFinished } from "vitest";
import { handleDeliveryExecution } from "../../../src/handlers/delivery-execution.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTaskList } from "../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";

async function fixture(state: "Active" | "Shipped", binding: string | null = "tasks-example.md", storedTasks = true) {
  const h = createReviewHarness();
  const projectId = "123e4567-e89b-42d3-a456-426614174099";
  await h.seedProject(projectId);
  const primary = await h.seedMeta("example", { state, owner: "test-user", taskList: binding,
    currentWorkflow: state === "Active" ? "process-task-loop" : null }, state === "Active" ? { kind: "active" }
    : { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
  { branches: [{ repository: projectId, ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const seedTasks = () => h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    `# Task List: example\n\n## **Phase 1:** Build\n\n### \`[${state === "Shipped" ? "x" : " "}]\` **1.1 Build**\n`);
  if (storedTasks) await seedTasks();
  const checkout = await createReviewCheckout(h, { script: [
    { match: ["diff", "--cached", "--name-only", "-z", "--"], responses: [{ stdout: "" }] },
    { match: ["rev-parse", "--verify", "--quiet", "origin/main"], responses: [{ stdout: "b".repeat(40) }] },
    { match: ["cherry", "b".repeat(40), "a".repeat(40)], responses: [{ stdout: `+ ${"a".repeat(40)}\n` }] },
    { match: ["symbolic-ref", "--quiet", "--short", "HEAD"], responses: [{ stdout: "feat/example" }] },
  ] });
  onTestFinished(checkout.cleanup);
  await checkout.occupy("feat/example", { kind: "work-unit", name: "example" });
  return { ...checkout, primary, seedTasks, run: async () => {
    let output = "";
    await handleDeliveryExecution("review-fix-continue", { input: "-" }, undefined, {
      readText: async () => JSON.stringify({ repository: "owner/repository" }),
      write: text => { output += text; }, setExitCode: () => {},
    }, checkout);
    return JSON.parse(output) as unknown;
  } };
}
it.each(["Active", "Shipped"] as const)("continues a %s work unit from its stored tasks without projected files", async state => {
  const h = await fixture(state);
  const result = await h.run();
  expect(result, JSON.stringify(result)).toMatchObject({ status: "idle", nextAction: "continue-work-unit" });
});

it("refuses a missing metadata task binding without writes and continues after repair", async () => {
  const h = await fixture("Active", null);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ status: "refused", reason: "execution-unavailable" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { content: writeMetaTaskList(h.primary.content, "tasks-example.md") }),
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await h.run()).toMatchObject({ status: "idle", nextAction: "continue-work-unit" });
});
it("refuses an archived owner with no task kind and continues after restoration", async () => {
  const h = await fixture("Shipped", "tasks-example.md", false);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.run()).toMatchObject({ status: "refused", reason: "evidence-unavailable" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedTasks();
  expect(await h.run()).toMatchObject({ status: "idle", nextAction: "continue-work-unit" });
});
