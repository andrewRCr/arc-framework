import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectRepositoryDeliveryEntry, inspectRepositoryDeliveryCandidateRenewal, inspectRepositoryDeliveryReopen }
  from "../../../src/lib/delivery/repository-entry.js";
import { DeliveryEntryInspectionRequestSchema } from "../../../src/lib/delivery/entry-inspection.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { createNativeReviewPerformanceFixture } from "../../fixtures/native-review-performance.js";
import type { Store } from "../../../src/lib/store/contract.js";
import type { OwnerIdentity } from "../../../src/lib/store/identity.js";
import { handleDeliveryEntryInspect } from "../../../src/handlers/delivery-entry.js";

const previousExitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = previousExitCode; });

async function inspectionInput(store: Store, workItem: OwnerIdentity, onTestFinished: (cleanup: () => Promise<void>) => void) {
  const commonDir = await mkdtemp(join(tmpdir(), "arc-delivery-entry-"));
  onTestFinished(() => rm(commonDir, { recursive: true, force: true }));
  return { cwd: "/unavailable", taskListPath: ".arc/active/tasks-example.md", baseBranch: "main",
    request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", entryMode: "integrating" }), store, workItem,
    exec: scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: commonDir }] }]).exec };
}
const taskList = "# Task List\n\n## **Phase 1:** Build\n\n### `[x]` **1.1 Build feature**\n";

it.each(["entry", "renewal", "reopen", "public-entry"] as const)("retains task-list conflict coordinates through %s and continues after repair", async kind => {
  const h = createLifecycleHarness(), primary = await h.seedMeta("example", { taskList: "tasks-example.md" });
  const reference = recordReferences["work-item/task-list"](primary.reference.owner);
  await h.seed(reference, taskList);
  const conflict = recordReferences["work-item/conflict-record"](primary.reference.owner, "tasks-conflict");
  const store = Object.create(h.store) as Store;
  let conflicted = true;
  store.read = async input => {
    const result = await h.store.read(input);
    return conflicted && input.reference.kind === "work-item/task-list" && result.status === "ok"
      ? { status: "ok", result: { ...result.result, conflicts: [conflict] } } : result;
  };
  const input = { ...await inspectionInput(store, primary.reference.owner, onTestFinished), workUnitId: "example" };
  let output = "";
  const write = (text: string) => { output += text; };
  if (kind === "public-entry") vi.spyOn(process.stdout, "write").mockImplementation(chunk => { write(String(chunk)); return true; });
  const publicEntry = async () => {
    output = "";
    await handleDeliveryEntryInspect({ input: "-" }, undefined, {
      readText: async () => JSON.stringify({ entryMode: "integrating" }),
      inspect: request => inspectRepositoryDeliveryEntry({ ...input,
        request: DeliveryEntryInspectionRequestSchema.parse({ workUnitId: "example", ...request }) }),
      write, setExitCode: code => { process.exitCode = code; },
    });
    return JSON.parse(output) as unknown;
  };
  const run = () => kind === "public-entry" ? publicEntry() : kind === "entry" ? inspectRepositoryDeliveryEntry(input)
    : kind === "renewal" ? inspectRepositoryDeliveryCandidateRenewal({ ...input, sourceBoundary: null })
    : inspectRepositoryDeliveryReopen(input);
  const refusal = { reference,
    code: "record-malformed", class: "recoverable", rule: "delivery.task-list-conflict",
    condition: expect.stringContaining(JSON.stringify(conflict)), remedy: { text: expect.stringMatching(/resolve/iu) } };
  if (kind === "public-entry") expect(await run()).toMatchObject({ status: "rejected", refusal });
  else await expect(run()).rejects.toMatchObject({ name: "StoreRefusalError", offBranch: true, refusal });
  conflicted = false;
  expect(await run()).toMatchObject({ status: kind === "reopen" ? "reopen-permitted" : "not-applicable" });
});

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
  await expect(inspectRepositoryDeliveryEntry(input)).rejects.toMatchObject({ offBranch: true, refusal: missing.refusal });
  await h.seed(reference, taskList);
  expect(await inspectRepositoryDeliveryEntry(input)).toMatchObject({ status: "not-applicable" });
});

it("retains a corrupt task-list index's own refusal, and inspects once the store is readable", async ({ onTestFinished }) => {
  const h = createLifecycleHarness();
  const primary = await h.seedMeta("example", { taskList: "tasks-example.md" });
  await h.seed(recordReferences["work-item/task-list"](primary.reference.owner), taskList);
  const input = await inspectionInput(h.store, primary.reference.owner, onTestFinished);
  h.store.state.corrupt = true;
  const unreadable = await h.store.read({ reference: recordReferences["work-item/task-list"](primary.reference.owner) });
  if (unreadable.status !== "refused") throw new Error("Expected the corrupt task-list index to refuse.");
  await expect(inspectRepositoryDeliveryEntry(input)).rejects.toMatchObject({ offBranch: true, refusal: unreadable.refusal });
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
