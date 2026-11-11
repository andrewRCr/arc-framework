/** Store operations refresh real linked checkouts through command-owned projection ports. */
import { configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createFanOutFixture } from "../../../helpers/store/projection/fan-out-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });


it("fans a landed verb write into both checkouts and marks only the writer's record changed", async () => {
  const { h, sibling, store, file, disk } = await createFanOutFixture(directories);
  const current = await h.stored();
  const result = await store.write({ action: "put", reference: current.reference, content: "The verb's new content.\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } });
  expect(result.status).toBe("ok");
  expect(await file()).toContain("The verb's new content.");
  expect(await h.file()).toContain("The verb's new content.");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: true });
  expect((await disk()).entries[h.path]).toMatchObject({ changed: false });
  expect((await disk()).state).toBe(success(await store.version()));
  expect(projectionProcessState().roots.get(sibling.checkout)?.ready).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual([]);
});

it("fans a command-start take-in out after the start lease is released", async () => {
  const { h, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  await h.edit("Saved before the next command.\n");
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  expect((await h.stored()).content).toBe("Saved before the next command.\n");
  expect(await file()).toContain("Saved before the next command.");
  expect(projectionProcessState().lockHeld).toBe(false);
  expect(projectionProcessState().diagnostics).toEqual([]);
});


it("keeps an end-check take-in local until the sibling's next command", async () => {
  const { h, sibling, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  await h.edit("First saved content.\n");
  expect(await startProjection(input)).toMatchObject({ kind: "ready" });
  const entry = (await h.disk()).entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing first-check copy");
  await writeFile(join(h.checkout, entry.copies[0].name), renderStampedFile({
    content: "A later editor save.\n", stamp: h.entry.base.blob }));
  await endProjection(input);
  expect((await h.stored()).content).toBe("A later editor save.\n");
  expect(await file()).toContain("First saved content.");
  const next = { store: h.store, checkout: sibling.checkout, location: sibling.location,
    ports: () => createProjectionEnginePorts(sibling.checkout) };
  expect(await startProjection(next)).toMatchObject({ kind: "ready" });
  expect(await file()).toContain("A later editor save.");
});


it("shares the round's source reads and holder roster while preserving destination-specific edit rights", async () => {
  let observed: ReturnType<typeof createRefusingStore> | undefined;
  let rosters = 0;
  const { h, store, file, disk, siblingPath } = await createFanOutFixture(directories, { workItem: true,
    store: source => { observed = createRefusingStore(source); return observed.store; },
    ports: ports => ({ ...ports, exec: async (command, args, options) => {
      if (command === "git" && args[0] === "worktree" && args[1] === "list") rosters++;
      return ports.exec(command, args, options);
    } }) });
  if (observed === undefined) throw new Error("Source counter unavailable");
  const before = { read: observed.calls("read"), version: observed.calls("version"), changes: observed.calls("changes"),
    lookup: observed.calls("lookup"), rosters };
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, content: "# Updated tasks\n", expected: current.version,
    provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await file()).toContain("# Updated tasks");
  expect((await h.disk()).entries[h.path]).toMatchObject({ protected: false, changed: true });
  expect((await disk()).entries[siblingPath]).toMatchObject({ protected: true, changed: false });
  expect(observed.calls("version") - before.version).toBe(1);
  expect(observed.calls("changes") - before.changes).toBe(1);
  expect(observed.calls("read") - before.read).toBeLessThanOrEqual(2);
  expect(observed.calls("lookup") - before.lookup).toBe(1);
  expect(rosters - before.rosters).toBe(1);
});


it("fans out from an unclaimed writer whose own checkout has no projection", async () => {
  const { h, input, file } = await createFanOutFixture(directories);
  await endProjection(input);
  const checkout = join(h.checkout, "unclaimed");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const ports = createProjectionEnginePorts(checkout), location = await locateProjection(checkout, ports);
  const store = withFanOut(h.store, createProjectionFanOutDependencies(checkout));
  expect(await startProjection({ store, checkout, location, ports: () => ports })).toEqual({ kind: "no-projection" });
  const current = await h.stored();
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "Written from an unclaimed checkout.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  expect(await h.file()).toContain("Written from an unclaimed checkout.");
  expect(await file()).toContain("Written from an unclaimed checkout.");
  expect((await h.disk()).entries[h.path]).toMatchObject({ changed: false });
  expect(await readProjectionIndex(location, false)).toEqual({ kind: "no-projection" });
});
