/** Native delivery entry reads its held work unit and task list without projected files. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { inspectActiveRepositoryDeliveryEntry } from "../../../src/handlers/delivery-entry.js";
import { lifecycleSuccess } from "../../helpers/store/lifecycle-harness.js";
import { recordPut } from "../../../src/lib/store/lifecycle-write.js";
import { writeMetaTaskList } from "../../../src/lib/store/kinds/meta/writers.js";
import { createReviewHarness } from "../../helpers/store/review-harness.js";
import { recordReferences } from "../../../src/lib/store/identity.js";
import { writeWorktreeMarker } from "../../../src/lib/git/worktree-marker.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import type { Store } from "../../../src/lib/store/contract.js";

async function fixture(taskList: string | null = "tasks-example.md", storedTasks = true) {
  const h = createReviewHarness(), cwd = await mkdtemp(join(tmpdir(), "arc-delivery-entry-store-"));
  onTestFinished(async () => rm(cwd, { recursive: true, force: true }));
  const primary = await h.seedMeta("example", { taskList }, { kind: "active" },
    { branches: [{ repository: "project", ref: "feat/example", linkedAs: "created", excluded: [] }] });
  const seedTasks = () => h.seed(recordReferences["work-item/task-list"](primary.reference.owner),
    "# Task List: example\n\n## **Phase 1:** Build\n\n### `[ ]` **1.1 Build**\n");
  if (storedTasks) await seedTasks();
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "example" },
    spawningIdentity: "andrew", createdAt: "2026-10-19T00:00:00.000Z" });
  const git = scriptGitExec([{ match: ["rev-parse", "--git-common-dir"], responses: [{ stdout: join(cwd, "common") }] }]);
  return { ...h, primary, seedTasks, inspect: (entryMode: "execution" | "integrating" | "prepublication" = "execution",
    store: Store = h.store) => inspectActiveRepositoryDeliveryEntry({ entryMode }, undefined,
    { cwd, exec: git.exec, store, projectId: async () => "project" }) };
}
it.each(["execution", "integrating", "prepublication"] as const)("inspects %s entry with neither a metadata file nor task-list file", async mode => {
  const h = await fixture();
  expect(await h.inspect(mode)).toMatchObject({ status: "not-applicable", nextAction: "continue-work-unit" });
});
it("refuses an absent metadata task binding without writes and inspects after repair", async () => {
  const h = await fixture(null);
  const version = lifecycleSuccess(await h.store.version());
  await expect(h.inspect()).rejects.toThrow("Task list unavailable");
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  lifecycleSuccess(await h.store.write({ ...recordPut(h.primary, { content: writeMetaTaskList(h.primary.content, "tasks-example.md") }),
    provenance: { verb: "edit", lifecycleAction: "edit" } }));
  expect(await h.inspect()).toMatchObject({ status: "not-applicable" });
});
it("refuses a missing stored task list and reads it after restoration", async () => {
  const h = await fixture("tasks-example.md", false);
  const version = lifecycleSuccess(await h.store.version());
  expect(await h.inspect()).toMatchObject({ status: "refused", reason: "evidence-unavailable" });
  expect(lifecycleSuccess(await h.store.version())).toBe(version);
  await h.seedTasks();
  expect(await h.inspect()).toMatchObject({ status: "not-applicable" });
});
it("raises the store's refusal resolving the active work unit's branch whole, and inspects once it reads", async () => {
  const h = await fixture();
  let refusing = true, primaryReads = 0;
  const refusal = { code: "state-unresolvable" as const, class: "recoverable" as const, historyRefs: [],
    condition: "The work unit's primary record objects are missing.", remedy: { text: "Fetch the missing objects, then retry." } };
  const store = Object.create(h.store) as Store;
  // The occupancy resolver reads the claimed primary first; the branch read is the second.
  store.read = async input => refusing && input.reference.kind === "work-item/meta" && ++primaryReads % 2 === 0
    ? { status: "refused", refusal: { ...refusal, reference: input.reference } } : h.store.read(input);
  await expect(h.inspect("execution", store)).rejects.toMatchObject({ offBranch: true,
    refusal: { code: "state-unresolvable", condition: refusal.condition } });
  refusing = false;
  expect(await h.inspect("execution", store)).toMatchObject({ status: "not-applicable" });
});
