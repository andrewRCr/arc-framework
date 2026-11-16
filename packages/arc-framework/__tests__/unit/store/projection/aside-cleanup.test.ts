/** Pruning spent aside scaffolding is cosmetic: a filesystem refusal stops it without failing its caller. */
import { mkdir, mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { lstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, onTestFinished } from "vitest";
import { ASIDE_FILES_ROOT, nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { pruneAsideScaffold, removeProjectionAsideFile, type AsideScaffoldFs } from "../../../../src/lib/store/projection/aside-cleanup.js";

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
