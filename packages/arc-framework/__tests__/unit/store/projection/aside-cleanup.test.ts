/** Pruning spent aside scaffolding is cosmetic: a filesystem refusal stops it without failing its caller. */
import { link, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, onTestFinished } from "vitest";
import { ASIDE_FILES_ROOT, nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { pruneAsideScaffold, removeProjectionAsideFile, removeReturnedAsideFile, type AsideScaffoldFs } from "../../../../src/lib/store/projection/aside-cleanup.js";

let checkout: string;
beforeEach(async () => { checkout = await mkdtemp(join(tmpdir(), "arc-aside-cleanup-")); });
afterEach(async () => { await rm(checkout, { recursive: true, force: true }); });

const refusal = (code: string) => Object.assign(new Error(`${code}: refused`), { code });

it.each(["EBUSY", "EIO"])("stops pruning on a %s refusal without failing the deletion", async code => {
  const folder = `${ASIDE_FILES_ROOT}/scratch`;
  await mkdir(join(checkout, folder), { recursive: true });
  const fs: AsideScaffoldFs = { rmdir: () => { throw refusal(code); }, lstat: path => lstatSync(path) };
  await expect(pruneAsideScaffold(checkout, folder, undefined, fs)).resolves.toBeUndefined();
  expect((await stat(join(checkout, folder))).isDirectory()).toBe(true);
});

it("treats an unreadable ancestor as nothing to prune", async () => {
  const folder = `${ASIDE_FILES_ROOT}/scratch`;
  await mkdir(join(checkout, folder), { recursive: true });
  const removed: string[] = [];
  const fs: AsideScaffoldFs = { rmdir: path => { removed.push(path); }, lstat: () => { throw refusal("EIO"); } };
  await expect(pruneAsideScaffold(checkout, folder, undefined, fs)).resolves.toBeUndefined();
  expect(removed).toEqual([]);
});

it("never prunes through a linked ancestor, nor the empty folder its target holds", async () => {
  const external = await mkdtemp(join(tmpdir(), "arc-aside-cleanup-target-"));
  onTestFinished(() => rm(external, { recursive: true, force: true }));
  await mkdir(join(external, "scratch"));
  await mkdir(join(checkout, ASIDE_FILES_ROOT), { recursive: true });
  await symlink(external, join(checkout, ASIDE_FILES_ROOT, "linked"), "dir");
  const removed: string[] = [];
  const fs: AsideScaffoldFs = { rmdir: path => { removed.push(path); }, lstat: path => lstatSync(path) };
  await expect(pruneAsideScaffold(checkout, `${ASIDE_FILES_ROOT}/linked/scratch`, undefined, fs)).resolves.toBeUndefined();
  expect(removed).toEqual([]);
  expect((await stat(join(external, "scratch"))).isDirectory()).toBe(true);
});

it("still fails when the lease step before a prune fails", async () => {
  const folder = `${ASIDE_FILES_ROOT}/scratch`;
  await mkdir(join(checkout, folder), { recursive: true });
  await expect(pruneAsideScaffold(checkout, folder, () => Promise.reject(new Error("The projection lock was lost"))))
    .rejects.toThrow("The projection lock was lost");
});

it("deletes the spent file even when pruning its folder is refused", async () => {
  const location = nameAsideFile({ path: ".arc/user/andrew/scratch/note.md", base: "a".repeat(40), role: "aside",
    writer: { pid: 1, processInstance: "cleanup-test", processScope: "cleanup-scope" } });
  expect(location.startsWith(`${ASIDE_FILES_ROOT}/`)).toBe(true);
  await mkdir(dirname(join(checkout, location)), { recursive: true });
  await writeFile(join(checkout, location), "spent\n");
  let attempts = 0;
  const fs: AsideScaffoldFs = { rmdir: () => { attempts += 1; throw refusal("EBUSY"); }, lstat: path => lstatSync(path) };
  await expect(removeProjectionAsideFile(checkout, location, undefined, true, fs)).resolves.toBeUndefined();
  expect(attempts).toBe(1);
  await expect(stat(join(checkout, location))).rejects.toMatchObject({ code: "ENOENT" });
});

/** A copy linked back to its path, both names holding one file. */
async function returnedCopy() {
  const path = ".arc/user/andrew/scratch/note.md";
  const location = nameAsideFile({ path, base: "a".repeat(40), role: "aside",
    writer: { pid: 1, processInstance: "cleanup-test", processScope: "cleanup-scope" } });
  const at = { alias: join(checkout, location), path: join(checkout, path) };
  await Promise.all([dirname(at.alias), dirname(at.path)].map(folder => mkdir(folder, { recursive: true })));
  await writeFile(at.alias, "saved\n");
  await link(at.alias, at.path);
  return { path, location, at };
}

it("unlinks a returned alias and prunes its folder while both names hold one file", async () => {
  const { path, location, at } = await returnedCopy();
  expect(await removeReturnedAsideFile(checkout, location, path)).toBe("removed");
  expect(await readFile(at.path, "utf8")).toBe("saved\n");
  await expect(stat(dirname(at.alias))).rejects.toMatchObject({ code: "ENOENT" });
});

it.each([
  ["another file", async (file: string) => { await rm(file); await writeFile(file, "saved\n"); }],
  ["nothing", async (file: string) => { await rm(file); }],
  ["a directory", async (file: string) => { await rm(file); await mkdir(file); }],
  ["nothing, a file standing where its folder was", async (file: string) => {
    await rm(dirname(file), { recursive: true });
    await writeFile(dirname(file), "not a folder\n");
  }],
])("keeps a returned alias whose path comes to hold %s before the unlink", async (_name, replace) => {
  const { path, location, at } = await returnedCopy();
  expect(await removeReturnedAsideFile(checkout, location, path, () => replace(at.path))).toBe("retained");
  expect(await readFile(at.alias, "utf8")).toBe("saved\n");
});

it("keeps a returned alias whose path becomes a symbolic link to it", async () => {
  const { path, location, at } = await returnedCopy();
  await rm(at.path);
  await symlink(at.alias, at.path, "file");
  expect(await removeReturnedAsideFile(checkout, location, path)).toBe("retained");
  expect(await readFile(at.path, "utf8")).toBe("saved\n");
});

it("reports a returned alias that is already gone, leaving its path alone", async () => {
  const { path, location, at } = await returnedCopy();
  expect(await removeReturnedAsideFile(checkout, location, path, () => rm(at.alias))).toBe("missing");
  expect(await readFile(at.path, "utf8")).toBe("saved\n");
});

it("keeps a returned alias when the lease step before its unlink fails", async () => {
  const { path, location, at } = await returnedCopy();
  await expect(removeReturnedAsideFile(checkout, location, path, () => Promise.reject(new Error("The projection lock was lost"))))
    .rejects.toThrow("The projection lock was lost");
  expect(await readFile(at.alias, "utf8")).toBe("saved\n");
});
