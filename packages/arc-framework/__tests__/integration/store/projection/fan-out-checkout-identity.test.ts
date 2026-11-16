/** A checkout keeps one identity however a command, Git's worktree list, or a caller spells it. */
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

it.skipIf(process.platform === "win32")("reuses a sibling's ignore proof when its own command reached the checkout through a link", async () => {
  const { h, sibling, store, input, file, disk } = await createFanOutFixture(directories);
  await endProjection(input);
  const parent = await mkdtemp(join(tmpdir(), "arc-checkout-alias-")); directories.push(parent);
  const alias = join(parent, "alias");
  await symlink(sibling.checkout, alias, "dir");
  const own = { store: h.store, checkout: alias, ports: () => createProjectionEnginePorts(alias) };
  expect(await startProjection(own)).toMatchObject({ kind: "ready" });
  expect(projectionProcessState().roots.has(sibling.checkout)).toBe(true);
  await endProjection(own);
  const proved = (await disk()).ignoreGuard;
  expect(proved?.roots.every(root => root.startsWith(`${sibling.checkout}/`))).toBe(true);
  // The writer's fan-out reaches the sibling by Git's spelling and finds the proof its own command recorded.
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  const current = await h.stored();
  expect((await store.write({ action: "put", reference: current.reference, content: "Delivered by Git's spelling.\n",
    expected: current.version, provenance: { verb: "save", lifecycleAction: "save" } })).status).toBe("ok");
  expect(await file()).toContain("Delivered by Git's spelling.");
  expect((await disk()).ignoreGuard).toEqual(proved);
  expect(projectionProcessState().diagnostics).toEqual([]);
  await endProjection(input);
});
