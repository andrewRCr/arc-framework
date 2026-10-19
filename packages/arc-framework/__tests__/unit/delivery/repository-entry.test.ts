import { expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRepositoryDeliveryEntry } from "../../../src/lib/delivery/repository-entry.js";
import { DeliveryEntryInspectionRequestSchema } from "../../../src/lib/delivery/entry-inspection.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";

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
