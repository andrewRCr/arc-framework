/** Creation publishes its scaffold only after the marker's UID stamp settles. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Store } from "../../../../src/lib/store/contract.js";
const binding = vi.hoisted(() => ({ store: null as Store | null }));
vi.mock("../../../../src/lib/store/create.js", async original => {
  const actual = await original<typeof import("../../../../src/lib/store/create.js")>();
  return { ...actual, createStore: (...args: Parameters<typeof actual.createStore>) => binding.store ?? actual.createStore(...args) };
});
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { createLifecycleHarness, lifecycleSuccess } from "../../../helpers/store/lifecycle-harness.js";
import { configureEngineCheckout, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { dispatchRegisteredCli } from "../../../helpers/registered-cli.js";
import { beginProjectionCommand } from "../../../../src/lib/store/projection/process-state.js";
import { locateProjection } from "../../../../src/lib/store/projection/location.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { OwnerIdentitySchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { readWorktreeMarkerGeneration, replaceWorktreeMarkerGeneration, readWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";

const directories: string[] = [];
afterEach(async () => { binding.store = null; beginProjectionCommand(); await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  const checkout = await createTempRepoCore({ prefix: "arc-fan-out-creation-" }); directories.push(checkout);
  const exec = await configureEngineCheckout(checkout), h = createLifecycleHarness();
  await mkdir(join(checkout, ".arc/system"), { recursive: true });
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({
    type: "project", name: "test-project", uid: "123e4567-e89b-42d3-a456-426614174099" })), "{}");
  const spawned = join(checkout, "spawned");
  await writeFile(join(checkout, ".arc/system/arc-config.yml"), `branch.base: main\nworktree.location_template: ${spawned}\n`);
  await exec("git", ["branch", "-M", "main"], { cwd: checkout });
  await exec("git", ["add", ".gitignore", ".arc"], { cwd: checkout });
  await exec("git", ["commit", "-m", "Project configuration"], { cwd: checkout });
  return { ...h, checkout, spawned };
}

async function invoke(h: Awaited<ReturnType<typeof fixture>>, args: readonly string[], store: Store = h.store) {
  const previousCwd = process.cwd(), previousExitCode = process.exitCode;
  try {
    process.chdir(h.checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["--no-input", ...args], undefined, async () => {
      const { withFanOut: wrap } = await import("../../../../src/lib/store/projection/with-fan-out.js");
      const { createProjectionFanOutDependencies: dependencies } = await import("../../../../src/lib/store/projection/fan-out-binding.js");
      binding.store = wrap(store, dependencies(h.checkout));
    });
    return process.exitCode;
  } finally { binding.store = null; process.chdir(previousCwd); process.exitCode = previousExitCode; }
}

it.each([false, true])("creates editable metadata without an unbound-marker notice, here=%s", async here => {
  const h = await fixture();
  expect(await invoke(h, ["start", "fresh", "--new", "--yes", ...(here ? ["--here"] : [])])).toBeUndefined();
  const checkout = here ? h.checkout : h.spawned;
  const marker = await readWorktreeMarker(checkout);
  expect(marker).toMatchObject({ kind: "present", marker: { createdFor: { name: "fresh", uid: expect.any(String) } } });
  const location = await locateProjection(checkout, createProjectionEnginePorts(checkout));
  const disk = await readProjectionIndex(location, true, { groups: "all" });
  expect(disk).toMatchObject({ kind: "index", index: { entries: {
    ".arc/active/current/meta-fresh.md": { protected: false, notices: [], changed: here },
  } } });
  const ownFile = await readFile(join(checkout, ".arc/active/current/meta-fresh.md"), "utf8");
  expect(ownFile).toContain("fresh");
  expect(ownFile).not.toContain("marker is unbound");
  const list = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(list).toMatchObject({ status: "complete", records: [{ placement: { kind: "active" } }] });
  if (!here) {
    const outside = await readFile(join(h.checkout, ".arc/active/in-flight/fresh/meta-fresh.md"), "utf8");
    expect(outside).not.toContain("marker is unbound");
    expect(outside).not.toContain("arc materialize fresh --here");
  }
}, 30_000);


it.each([false, true])("fans out a refused stamp's protected meta and reprojects after marker repair, here=%s", async here => {
  const h = await fixture(), checkout = here ? h.checkout : h.spawned;
  const store = overrideEngineStore(h.store, { batch: async input => {
    const result = await h.store.batch(input);
    if (result.status === "ok") {
      const current = await readWorktreeMarkerGeneration(checkout);
      if (current.kind !== "present") throw new Error("Creation marker missing at the landed batch");
      expect(await replaceWorktreeMarkerGeneration(checkout, current.bytes, { ...current.marker,
        createdAt: "2026-01-01T00:00:00.000Z" })).toMatchObject({ kind: "replaced" });
    }
    return result;
  } });
  expect(await invoke(h, ["start", "fresh", "--new", "--yes", ...(here ? ["--here"] : [])], store)).toBe(1);
  expect(await readWorktreeMarker(checkout)).toMatchObject({ kind: "present", marker: { createdFor: { name: "fresh" } } });
  const live = lifecycleSuccess(await h.store.list({ family: "work-item", kind: "work-item/meta" }));
  expect(live).toMatchObject({ status: "complete", records: [{ placement: { kind: "active" } }] });
  const source = await locateProjection(h.checkout, createProjectionEnginePorts(h.checkout));
  const protectedPath = here ? ".arc/active/current/meta-fresh.md" : ".arc/active/in-flight/fresh/meta-fresh.md";
  expect(await readProjectionIndex(source, true, { groups: "all" })).toMatchObject({ kind: "index", index: { entries: {
    [protectedPath]: { protected: true, changed: true },
  } } });
  const before = lifecycleSuccess(await h.store.version());
  const target = { ...h, checkout };
  expect(await invoke(target, ["materialize", "fresh", "--here"])).toBeUndefined();
  expect(await readWorktreeMarker(checkout)).toMatchObject({ kind: "present", marker: { createdFor: { uid: expect.any(String) } } });
  expect(lifecycleSuccess(await h.store.version())).toBe(before);
  expect(await invoke(target, ["selection"])).toBe(0);
  const location = await locateProjection(checkout, createProjectionEnginePorts(checkout));
  expect(await readProjectionIndex(location, true, { groups: "all" })).toMatchObject({ kind: "index", index: { entries: {
    ".arc/active/current/meta-fresh.md": { protected: false },
  } } });
}, 30_000);
