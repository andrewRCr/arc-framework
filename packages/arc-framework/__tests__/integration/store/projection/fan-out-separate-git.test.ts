/** Native separate Git directories never become projection destinations from their roster spelling. */
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createEngineFixture, configureEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { withFanOut } from "../../../../src/lib/store/projection/with-fan-out.js";
import { createProjectionFanOutDependencies } from "../../../../src/lib/store/projection/fan-out-binding.js";

const directories: string[] = [];
beforeEach(() => { beginProjectionCommand(); });
afterEach(async () => { beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

for (const name of ["git-data", ".git"] as const) it.each([false, true])(`refreshes the actual primary and skips its ${name} roster spelling, writer primary=%s`, async writerPrimary => {
  const h = await createEngineFixture(directories);
  const admin = await mkdtemp(join(tmpdir(), "arc-fan-out-admin-")); directories.push(admin);
  const gitDir = join(admin, name);
  await h.exec("git", ["init", `--separate-git-dir=${gitDir}`], { cwd: h.checkout });
  await h.exec("git", ["commit", "--allow-empty", "-m", "Seed code"], { cwd: h.checkout });
  const native = createProjectionEnginePorts(h.checkout), location = await locateProjection(h.checkout, native);
  const initial = { store: h.store, checkout: h.checkout, location, ports: () => native };
  expect(await startProjection(initial)).toMatchObject({ kind: "ready" });
  await endProjection(initial);
  const checkout = join(admin, "linked");
  await h.exec("git", ["worktree", "add", "--detach", checkout], { cwd: h.checkout });
  await configureEngineCheckout(checkout);
  const sibling = await seedProjection({ store: h.store, checkout, files: [{ path: h.path, reference: h.record.reference }] });
  const linkedInput = { store: h.store, checkout, location: sibling.location, ports: () => createProjectionEnginePorts(checkout) };
  expect(await startProjection(linkedInput)).toMatchObject({ kind: "ready" });
  await endProjection(linkedInput);
  const writer = writerPrimary ? initial : linkedInput;
  const store = withFanOut(h.store, createProjectionFanOutDependencies(writer.checkout));
  let observing = false, fallbacks = 0;
  const ports = writer.ports();
  const command = { ...writer, store, ports: () => ({ ...ports, exec: async (...args: Parameters<typeof ports.exec>) => {
    if (observing && args[0] === "git" && args[1][0] === "rev-parse") fallbacks++;
    return ports.exec(...args);
  } }) };
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  const before = await readProjectionIndex(location, true), current = await h.stored();
  observing = true;
  success(await store.write({ action: "put", reference: current.reference, expected: current.version,
    content: "A write through a separate Git directory.\n", provenance: { verb: "save", lifecycleAction: "save" } }));
  observing = false;
  expect(await readFile(join(checkout, h.path), "utf8")).toContain("A write through a separate Git directory.");
  expect(fallbacks).toBe(0);
  await expect(access(join(name === ".git" ? admin : gitDir, ".arc"))).rejects.toMatchObject({ code: "ENOENT" });
  if (writerPrimary) expect(await h.file()).toContain("A write through a separate Git directory.");
  else {
    expect(await readProjectionIndex(location, true)).toEqual(before);
    expect(await h.file()).toContain("opening\nbase\nclosing");
    await endProjection(command);
    expect(await startProjection(initial)).toMatchObject({ kind: "ready" });
    expect(await h.file()).toContain("A write through a separate Git directory.");
  }
});
