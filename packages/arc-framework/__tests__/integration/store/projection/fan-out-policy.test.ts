/** Sibling settings and cached ignore authority are checked before a fan-out visits their files. */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { bindSpawnMaterialization, materializeSpawnedProjection } from "../../../../src/lib/store/projection/spawn-materialization.js";
import { afterEach, beforeEach, expect, it } from "vitest";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { commitProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

const changedSettings = {
  identity: (index: ProjectionIndex): ProjectionIndex => ({ ...index, projectedUnder: { ...index.projectedUnder, identity: SlugSchema.parse("someone-else") } }),
  view: (index: ProjectionIndex): ProjectionIndex => ({ ...index, projectedUnder: { ...index.projectedUnder, view: { mode: "all", pins: [] } } }),
  claim: (index: ProjectionIndex): ProjectionIndex => ({ ...index, projectedUnder: { ...index.projectedUnder, claim: SlugSchema.parse("former-claim") } }),
  uid: (index: ProjectionIndex): ProjectionIndex => ({ ...index, projectedUnder: { ...index.projectedUnder, claimUid: "123e4567-e89b-42d3-a456-426614174099" } }),
  layout: (index: ProjectionIndex): ProjectionIndex => ({ ...index, projectedUnder: { ...index.projectedUnder, layoutActive: "flat" } }),
  pending: (index: ProjectionIndex): ProjectionIndex => ({ ...index, reprojectionPending: true }),
  unproved: (index: ProjectionIndex): ProjectionIndex => ({ ...index, ignoreGuard: null }),
  configuration: (index: ProjectionIndex): ProjectionIndex => {
    if (index.ignoreGuard === null) throw new Error("Missing passing ignore proof");
    return { ...index, ignoreGuard: { ...index.ignoreGuard, configuration: { ...index.ignoreGuard.configuration, path: "another-excludes-file" } } };
  },
};

it.each(Object.entries(changedSettings))("leaves a sibling with %s disagreement to its own next command", async (_kind, change) => {
  const { h, sibling, input, store, disk, file } = await createFanOutFixture(directories);
  const before = await disk(), bytes = await file();
  expect(await withProjectionLock(sibling.location, session => commitProjectionIndex({ location: sibling.location,
    checkout: sibling.checkout, index: change(before), checkpoint: session.step }))).toMatchObject({ status: "done" });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, content: "Stored while the sibling has another basis.\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await file()).toBe(bytes);
  expect((await disk()).state).toBe(before.state);
  expect(projectionProcessState().diagnostics).toEqual([]);
  expect(await h.file()).toContain("Stored while the sibling has another basis.");
  await endProjection(input);
  const next = { store: h.store, checkout: sibling.checkout, location: sibling.location, ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(next)).toMatchObject({ kind: "ready" });
  expect(await file()).toContain("Stored while the sibling has another basis.");
  expect((await disk()).reprojectionPending).toBeUndefined();
});


it("skips a previously materialized spawn whose own view differs from the command's", async () => {
  const { h, sibling, input, store, disk, file } = await createFanOutFixture(directories);
  await h.exec("git", ["config", "extensions.worktreeConfig", "true"], { cwd: h.checkout });
  await h.exec("git", ["config", "--worktree", "arc.inflightView", "all"], { cwd: sibling.checkout });
  await rm(join(sibling.location.stateDir, "index"));
  bindSpawnMaterialization(input);
  await materializeSpawnedProjection(sibling.checkout);
  expect((await disk()).projectedUnder.view.mode).toBe("all");
  expect(projectionProcessState().roots.get(sibling.checkout)).toMatchObject({ spawned: true, view: { mode: "all" } });
  const before = await file(), current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A writer using the mine view.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await h.file()).toContain("A writer using the mine view.");
  expect(await file()).toBe(before);
  await endProjection(input);
  expect(await startProjection({ store: h.store, checkout: sibling.checkout, location: sibling.location })).toMatchObject({ kind: "ready" });
  expect(await file()).toContain("A writer using the mine view.");
});

it("retries a current writer's pending layout while leaving a flagged sibling for its own command", async () => {
  const { h, sibling, input, store, disk, file } = await createFanOutFixture(directories);
  const version = success(await store.version());
  for (const target of [{ checkout: h.checkout, location: h.location, index: await h.disk() },
    { checkout: sibling.checkout, location: sibling.location, index: await disk() }]) {
    expect(await withProjectionLock(target.location, session => commitProjectionIndex({ checkout: target.checkout,
      location: target.location, index: { ...target.index, reprojectionPending: true }, checkpoint: session.step })))
      .toMatchObject({ status: "done" });
    await rm(join(target.checkout, h.path));
  }
  success(await store.push());
  expect(await h.file()).toContain("opening\nbase\nclosing");
  expect((await h.disk()).reprojectionPending).toBeUndefined();
  await expect(file()).rejects.toMatchObject({ code: "ENOENT" });
  expect((await disk()).reprojectionPending).toBe(true);
  expect(success(await store.version())).toBe(version);
  await endProjection(input);
  expect(await startProjection({ store: h.store, checkout: sibling.checkout, location: sibling.location })).toMatchObject({ kind: "ready" });
  expect(await file()).toContain("opening\nbase\nclosing");
  expect((await disk()).reprojectionPending).toBeUndefined();
  expect(success(await store.version())).toBe(version);
});
