/** Committed creations keep their linked checkout protected through marker-write failure and repair. */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { runCreateNew } from "../../src/commands/start.js";
import { StartCommandInputSchema } from "../../src/handlers/start.js";
import { createUserIOContext } from "../../src/lib/io-context.js";
import { getInternalTemplatePath } from "../../src/lib/paths.js";
import { readWorktreeMarker, resolveWorktreeMarkerPath, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { lockSpawnedCheckout, PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createLifecycleHarness, lifecycleSuccess } from "../helpers/store/lifecycle-harness.js";
import { repairCli, repairCliFixture } from "../helpers/repair-cli.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

const filesystem = vi.hoisted(() => ({ write: vi.fn<typeof writeFile>(), native: null as typeof writeFile | null,
  deniedMarker: "" }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  filesystem.native = original.writeFile;
  return { ...original, writeFile: filesystem.write };
});
function resetMockDefaults(): void {
  vi.resetAllMocks(); filesystem.deniedMarker = "";
  filesystem.write.mockImplementation(async (...args) => {
    if (filesystem.deniedMarker && String(args[0]).startsWith(`${filesystem.deniedMarker}.tmp-`)) {
      throw new Error("marker write denied");
    }
    if (filesystem.native === null) throw new Error("Missing native filesystem");
    return filesystem.native(...args);
  });
}
beforeEach(resetMockDefaults);

async function fixture(foreignLock = false, foreignOwner = false) {
  const f = await repairCliFixture(), h = createLifecycleHarness();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "project", uid: randomUUID() })), "{}");
  const path = join(f.cwd, ".arc-checkouts", "created"), config = join(f.cwd, ".arc/system/arc-config.yml");
  await writeFile(config, (await readFile(config, "utf8")).replace(/^worktree.location_template:.*$/mu,
    `worktree.location_template: ${path}`));
  await f.exec("git", ["add", ".arc/system/arc-config.yml"]);
  await f.exec("git", ["commit", "-m", "Configure creation checkout"]);
  let original: Buffer | undefined;
  const batch = async (input: Parameters<typeof h.store.batch>[0]) => {
    const result = await h.store.batch(input);
    if (result.status !== "ok") return result;
    if (foreignOwner) {
      const current = await readWorktreeMarker(path);
      if (current.kind !== "present" || current.marker.provisioning !== undefined) throw new Error("Missing creation marker");
      await writeWorktreeMarker(path, { ...current.marker, createdFor: { kind: "work-unit", name: "created", uid: randomUUID() } });
    }
    filesystem.deniedMarker = resolveWorktreeMarkerPath(path);
    original = await readFile(filesystem.deniedMarker);
    if (foreignLock) await f.exec("git", ["worktree", "lock", "--reason", "another tool owns this checkout", path]);
    return result;
  };
  const store = new Proxy(h.store, { get(target, key) {
    if (key === "batch") return batch;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { f, h, path, store, original: () => original };
}

async function retained(f: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  const found = lifecycleSuccess(await f.h.store.lookup({ kind: "slug", slug: SlugSchema.parse("created") }));
  expect(lifecycleSuccess(await f.h.store.read({ reference: found.reference }))).toMatchObject({ placement: { kind: "active" } });
  expect(await readFile(resolveWorktreeMarkerPath(f.path))).toEqual(f.original());
  expect(await readWorktreeMarker(f.path)).toMatchObject({ kind: "present", marker: {
    spawnedByArc: true, createdFor: { kind: "work-unit", name: "created" },
  } });
}

async function repaired(f: Awaited<ReturnType<typeof fixture>>): Promise<void> {
  filesystem.deniedMarker = "";
  const notes = join(f.path, ".arc/user/test-user/created/SESSION-NOTES.md");
  await mkdir(join(f.path, ".arc/user/test-user/created"), { recursive: true });
  await writeFile(notes, "Retain these personal notes.\n");
  const version = lifecycleSuccess(await f.h.store.version());
  const result = await repairCli({ ...f.f, cwd: f.path }, ["materialize", "created", "--here"], { store: f.store });
  expect(result.exitCode ?? 0, result.stdout + result.stderr).toBe(0);
  expect(lifecycleSuccess(await f.h.store.version())).toBe(version);
  const marker = await readWorktreeMarker(f.path);
  expect(marker).toMatchObject({ kind: "present", marker: { createdFor: { kind: "work-unit", name: "created", uid: expect.any(String) } } });
  expect(await readWorktreeLock(f.f.exec, f.path)).toBe(PROJECTION_LOCK_REASON);
  await expect(f.f.exec("git", ["worktree", "remove", f.path])).rejects.toThrow();
  expect(await readFile(notes, "utf8")).toBe("Retain these personal notes.\n");
}

it.each([false, true])("reports a protected retained creation after a marker write fails, lock failure=%s", async lockFails => {
  const f = await fixture(), original = { ...createUserIOContext(), exec: f.f.exec };
  const io = { ...original, exec: async (...args: Parameters<typeof original.exec>) => {
    if (lockFails && args[1][0] === "worktree" && args[1][1] === "lock") {
      throw makeGitProcessError({ command: args[0], args: args[1], exitCode: 128, stderr: "lock denied" });
    }
    return original.exec(...args);
  } };
  const input = StartCommandInputSchema.parse({ name: "created", new: true });
  const result = await runCreateNew({ io, store: f.store, internalTemplateDir: getInternalTemplatePath() },
    { worktreePath: f.f.cwd, identity: "test-user", name: input.name, baseRef: "main" });
  expect(result).toMatchObject({ ok: false, reason: expect.stringContaining("marker write denied"), worktreePath: f.path,
    spawnLock: lockFails ? { kind: "failed", detail: expect.stringContaining("lock denied") } : { kind: "locked" } });
  await retained(f);
  if (lockFails) expect(await lockSpawnedCheckout(f.f.exec, f.path)).toEqual({ kind: "locked" });
  await repaired(f);
}, 30_000);

it("preserves a concurrently replaced marker for a different owner without locking it", async () => {
  const f = await fixture(false, true);
  const result = await repairCli(f.f, ["start", "created", "--new", "--yes"], { store: f.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("marker generation changed");
  expect(result.stderr).toContain("claim");
  await retained(f);
  expect(await readWorktreeLock(f.f.exec, f.path)).toBeUndefined();
}, 30_000);

it("the creation handler reports a retained foreign lock after marker write failure", async () => {
  const f = await fixture(true);
  const result = await repairCli(f.f, ["start", "created", "--new", "--yes"], { store: f.store });
  expect(result.exitCode).toBe(1);
  expect(result.stdout + result.stderr).toContain("marker write denied");
  expect(result.stderr).toContain("another tool owns this checkout");
  expect(result.stderr).toContain(f.path);
  await retained(f);
  expect(await readWorktreeLock(f.f.exec, f.path)).toBe("another tool owns this checkout");
  await f.f.exec("git", ["worktree", "unlock", f.path]);
  expect(await lockSpawnedCheckout(f.f.exec, f.path)).toEqual({ kind: "locked" });
  await repaired(f);
}, 30_000);
