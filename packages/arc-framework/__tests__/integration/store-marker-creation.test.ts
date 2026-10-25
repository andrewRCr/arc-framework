/** Creation binds minted owners after committing records and preserves concurrent markers. */
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

async function fixture(here: boolean) {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const path = join(f.cwd, ".arc-checkouts", "created"), configPath = join(f.cwd, ".arc/system/arc-config.yml");
  await writeFile(configPath, (await readFile(configPath, "utf8")).replace(/^worktree.location_template:.*$/mu,
    `worktree.location_template: ${path}`));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await f.exec("git", ["commit", "-m", "Configure creation checkout"]);
  return { f, h, path: here ? f.cwd : path, argv: ["start", "created", "--new", "--yes", ...(here ? ["--here"] : [])] };
}
async function createdOwner(h: ReturnType<typeof createLifecycleHarness>) {
  const lookup = lifecycleSuccess(await h.store.lookup({ kind: "slug", slug: SlugSchema.parse("created") }));
  const record = lifecycleSuccess(await h.store.read({ reference: lookup.reference }));
  expect(record).toMatchObject({ placement: { kind: "active" }, fields: { state: "Planning" } });
  const owner = record.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected the created owner's UID");
  return owner;
}

it.each([false, true])("creation stamps its committed owner on the marker, here=%s", async here => {
  const { f, h, path, argv } = await fixture(here);
  const result = await repairCli(f, argv, { store: h.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  const owner = await createdOwner(h);
  expect(await readWorktreeMarker(path)).toMatchObject({ kind: "present",
    marker: { spawnedByArc: !here, createdFor: { kind: "work-unit", name: owner.name, uid: owner.uid } } });
}, 30_000);

it.each([false, true])("creation preserves a changed marker and the committed record, here=%s", async here => {
  const { f, h, path, argv } = await fixture(here);
  let concurrent: Buffer | undefined;
  const batch = async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = await h.store.batch(input);
    if (result.status === "ok") {
      const current = await readWorktreeMarker(path);
      if (current.kind !== "present") throw new Error("Expected the initial creation marker");
      await writeWorktreeMarker(path, { ...current.marker, createdAt: "2000-01-01T00:00:00.000Z" });
      concurrent = await readFile(resolveWorktreeMarkerPath(path));
    }
    return result;
  };
  const store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return batch;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const result = await repairCli(f, argv, { store });
  expect(result.exitCode, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain("arc materialize created --here");
  await createdOwner(h);
  expect(await readFile(resolveWorktreeMarkerPath(path))).toEqual(concurrent);
  const current = await readWorktreeMarker(path);
  expect(current).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "created" } } });
  expect(current).not.toHaveProperty("marker.createdFor.uid");
  expect((await f.exec("git", ["worktree", "list", "--porcelain"])).stdout).toContain(path);
}, 30_000);
