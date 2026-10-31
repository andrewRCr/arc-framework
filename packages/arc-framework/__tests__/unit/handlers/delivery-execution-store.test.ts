/** Production review-fix continuation reads native lifecycle records without projected files. */
import { expect, it, onTestFinished, vi } from "vitest";
import { handleDeliveryExecution } from "../../../src/handlers/delivery-execution.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTaskList } from "../../../src/lib/store/kinds/meta/writers.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { createReviewCheckout } from "../../helpers/store/review-checkout.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { nativeListingRefusal } from "../../fixtures/native-refusal.js";

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
  return { ...checkout, primary, seedTasks, run: async (store: Store = checkout.store) => {
    let output = "";
    await handleDeliveryExecution("review-fix-continue", { input: "-" }, undefined, {
      readText: async () => JSON.stringify({ repository: "owner/repository" }),
      write: text => { output += text; }, setExitCode: () => {},
    }, { ...checkout, store });
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

/** A store whose review family listing cannot be read until repaired. */
function unreadableReviewListing(store: Store) {
  let unreadable = true;
  const refusing = Object.create(store) as Store;
  refusing.list = async input => unreadable && input.family === "review" ? { status: "ok", result: { status: "unreadable",
    condition: "The review family index cannot be read.", remedy: { text: "Restore the review family index, then retry." } } }
    : store.list(input);
  return { store: refusing, repair: () => { unreadable = false; } };
}

it("names a refused review-response listing's own remedy on a closed task list, and continues once it reads", async () => {
  const h = await fixture("Shipped");
  const { store, repair } = unreadableReviewListing(h.store);
  expect(await h.run(store)).toMatchObject({ status: "refused", reason: "review-fix-response-unavailable",
    recommendedActionText: "The review family index cannot be read. Restore the review family index, then retry." });
  repair();
  expect(await h.run(store)).toMatchObject({ status: "idle", nextAction: "continue-work-unit" });
});

it("names a native refusal escaping execution with its own remedy, and emits the route once the store is repaired", async () => {
  const refusal = nativeListingRefusal();
  const route = { status: "idle", nextAction: "continue-work-unit", recommendedActionText: "Continue the work unit." };
  const execute = vi.fn().mockRejectedValueOnce(refusal).mockResolvedValueOnce(route);
  const run = async () => {
    let output = "";
    await handleDeliveryExecution("review-fix-continue", { input: "-" }, undefined, {
      readText: async () => JSON.stringify({ repository: "owner/repository" }), execute,
      write: text => { output += text; }, setExitCode: () => {},
    });
    return JSON.parse(output) as unknown;
  };
  expect(await run()).toMatchObject({ status: "refused", reason: "execution-unavailable",
    recommendedActionText: refusal.message });
  expect(await run()).toMatchObject(route);
});

it("names the store's refusal resolving the review-fix work unit's branch, and continues once it reads", async () => {
  const h = await fixture("Active");
  let refusing = true, primaryReads = 0;
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
    condition: "The work unit's primary record objects are missing.", remedy: { text: "Fetch the missing objects, then retry." } };
  const store = Object.create(h.store) as Store;
  // The occupancy resolver reads the claimed primary first; the branch read is the second.
  store.read = async input => refusing && input.reference.kind === "work-item/meta" && ++primaryReads % 2 === 0
    ? { status: "refused", refusal: { ...refusal, reference: input.reference } } : h.store.read(input);
  expect(await h.run(store)).toMatchObject({ status: "refused", reason: "execution-unavailable",
    recommendedActionText: `${refusal.condition} ${refusal.remedy.text}` });
  refusing = false;
  expect(await h.run(store)).toMatchObject({ status: "idle", nextAction: "continue-work-unit" });
});
