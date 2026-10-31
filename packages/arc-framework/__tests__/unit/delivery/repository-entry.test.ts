import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRepositoryDeliveryEntry } from "../../../src/lib/delivery/repository-entry.js";
import { DeliveryEntryInspectionRequestSchema } from "../../../src/lib/delivery/entry-inspection.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createNativeReviewPerformanceFixture } from "../../fixtures/native-review-performance.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";

async function inspectionInput(store: Store, workItem: OwnerIdentity, onTestFinished: (cleanup: () => Promise<void>) => void) {
  const commonDir = await mkdtemp(join(tmpdir(), "arc-delivery-entry-"));
  onTestFinished(() => rm(commonDir, { recursive: true, force: true }));
  return { cwd: "/unavailable", taskListPath: ".arc/active/tasks-example.md", baseBranch: "main",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }), store, workItem,
    exec: scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec };
}
const taskList = "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n";

it("inspects the selected generation's stored task list without a checkout file", async ({ onTestFinished }) => {
  const h = createLifecycleHarness();
  const first = await h.seedMeta("example", { taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](first.reference.owner),
    "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n");
  lifecycleSuccess(await h.store.write({ action: "remove", reference: first.reference, expected: first.version,
    provenance: { verb: "remove", lifecycleAction: "remove" } }));
  await h.seedMeta("example");
  const commonDir = await mkdtemp(join(tmpdir(), "arc-delivery-entry-"));
  onTestFinished(() => rm(commonDir, { recursive: true, force: true }));
  const input = { cwd: "/unavailable", taskListPath: ".arc/active/tasks-example.md", baseBranch: "main",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }), store: h.store,
    workItem: first.reference.owner,
    exec: scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec };
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "not-applicable",
    nextAction: "continue-work-unit" });
});

it("names a missing stored task list's own remedy, and inspects once the task list is stored", async ({ onTestFinished }) => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { taskList: "tasks-example.md" });
  const reference = recordReferences["work-item/task-list"](primary.reference.owner);
  const missing = await h.store.read({ reference });
  if (missing.status !== "refused") throw new Error("Expected the unstored task list to refuse.");
  const input = await inspectionInput(h.store, primary.reference.owner, onTestFinished);
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "refused", reason: "evidence-unavailable",
    recommendedActionText: `${missing.refusal.condition} ${missing.refusal.remedy.text}` });
  await h.seed(reference, taskList);
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "not-applicable" });
});

it("names a refused review-response listing's own remedy, and inspects once the store is readable", async ({ onTestFinished }) => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), taskList);
  const input = await inspectionInput(h.store, primary.reference.owner, onTestFinished);
  h.store.state.corrupt = true;
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "refused",
    reason: "review-fix-response-unavailable",
    recommendedActionText: expect.stringContaining("Rebuild the namespace index from a saved state.") });
  h.store.state.corrupt = false;
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "not-applicable" });
});

it("raises a refused task-list re-read behind a pending member response whole, and checks its binding once stored", async ({
  onTestFinished,
}) => {
  const { h, primary } = await createNativeReviewPerformanceFixture("delivery-member");
  const input = await inspectionInput(h.store, primary.reference.owner, onTestFinished);
  await expect(inspectRepositoryDeliveryEntry(input)).rejects.toMatchObject({ offBranch: true,
    refusal: { code: "not-found" } });
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), taskList);
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "refused", reason: "review-fix-response-stale" });
});
