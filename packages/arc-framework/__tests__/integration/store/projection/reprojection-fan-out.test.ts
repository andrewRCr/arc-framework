/** A claim-changing verb reprojects its entering checkout without discarding start-owned copies. */
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success } from "../../../helpers/store/suite-tools.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

it("reprojects the writer's fresh claim, marks its landed record, and checks its retained start copies", async () => {
  const h = await createFanOutFixture(directories, { workItem: true });
  await endProjection(h.input);
  await h.h.edit("An edit taken in at this command's start.\n");
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  const root = projectionProcessState().roots.get(h.h.checkout);
  if (root === undefined || root.copies.length === 0) throw new Error("Start retained no copy");
  const startCopies = [...root.copies];
  const primary = await seed(h.h, h.h.reference("work-item/meta", "next"), makeMetaFixture("work-item-next", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }), { kind: "active" });
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Missing created claim UID");
  const tasks = await seed(h.h, recordReferences["work-item/task-list"](primary.reference.owner), "The new claim's original tasks.\n");
  await writeWorktreeMarker(h.h.checkout, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(primary) });
  success(await h.store.write({ action: "put", reference: tasks.reference, expected: tasks.version,
    content: "The claim-changing verb's tasks.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  const path = ".arc/active/current/tasks-work-item-next.md";
  expect(await readFile(join(h.h.checkout, path), "utf8")).toContain("The claim-changing verb's tasks.");
  await expect(access(join(h.h.checkout, h.h.path))).rejects.toMatchObject({ code: "ENOENT" });
  expect(await readFile(join(h.h.checkout, h.siblingPath), "utf8")).toContain("An edit taken in at this command's start.");
  const disk = await h.h.disk();
  expect(disk.projectedUnder).toMatchObject({ claim: "work-item-next", claimUid: owner.uid });
  expect(disk.entries[path]).toMatchObject({ reference: tasks.reference, changed: true });
  expect(root.copies).toEqual(expect.arrayContaining(startCopies));
  await endProjection(h.input);
  for (const copy of startCopies) await expect(access(join(h.h.checkout, copy.copy))).rejects.toMatchObject({ code: "ENOENT" });
  expect((await h.h.stored()).content).toBe("An edit taken in at this command's start.\n");
});

it("keeps the visit's ignore snapshot and finds a policy change at the next start", async () => {
  let checkout = "", armed = false;
  const target = ".arc/active/current/tasks-work-item-next.md";
  const h = await createFanOutFixture(directories, { workItem: true, ports: ports => ({ ...ports,
    hooks: { afterRecheck: async path => {
      if (!armed || path !== target) return;
      armed = false;
      await writeFile(join(checkout, ".gitignore"), ".arc/user/*/\n!.arc/active/\n");
    } },
  }) });
  checkout = h.h.checkout;
  const original = await readFile(join(checkout, ".gitignore"), "utf8");
  const primary = await seed(h.h, h.h.reference("work-item/meta", "next"), makeMetaFixture("work-item-next", {
    owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }), { kind: "active" });
  const tasks = await seed(h.h, recordReferences["work-item/task-list"](primary.reference.owner), "Initial tasks.\n");
  await writeWorktreeMarker(checkout, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(primary) });
  armed = true;
  const written = success(await h.store.write({ action: "put", reference: tasks.reference, expected: tasks.version,
    content: "The first verb's tasks.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  if (written.version === undefined) throw new Error("The tasks write returned no version");
  expect(armed).toBe(false);
  expect((await h.h.disk()).ignoreGuard).not.toBeNull();
  expect(await readFile(join(checkout, target), "utf8")).toContain("The first verb's tasks.");
  await endProjection(h.input);
  success(await h.h.store.write({ action: "put", reference: tasks.reference, expected: written.version,
    content: "Tasks waiting for the ignore repair.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  expect((await h.h.disk()).ignoreGuard).toBeNull();
  expect(await readFile(join(checkout, target), "utf8")).toContain("The first verb's tasks.");
  await endProjection(h.input);
  await writeFile(join(checkout, ".gitignore"), original);
  expect(await startProjection(h.input)).toMatchObject({ kind: "ready" });
  expect((await h.h.disk()).ignoreGuard).not.toBeNull();
  expect(await readFile(join(checkout, target), "utf8")).toContain("Tasks waiting for the ignore repair.");
  await endProjection(h.input);
});
