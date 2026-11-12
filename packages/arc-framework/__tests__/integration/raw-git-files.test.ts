/** Real Git file-descriptor streaming preserves raw artifacts and owned file lifetimes. */
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createSpawnRawGitExec } from "../../src/lib/change-facts.js";
import { createExecaGitExec, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import type { RawGitExec } from "../../src/lib/git/exec.js";
import { removeGitBackedDirs } from "../helpers/temp-repo.js";
const roots: string[] = [];
afterEach(async () => { await removeGitBackedDirs(roots.splice(0)); });
const factories: Array<{ name: string; create(root: string): RawGitExec }> = [
  { name: "execa with 32-byte capture ceiling", create: root => createExecaRawGitExec(root, 32) },
  { name: "standalone spawn", create: createSpawnRawGitExec },
];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "arc-raw-files-")); roots.push(root);
  await createExecaGitExec()("git", ["init", "-q"], { cwd: root }); return root;
}
it.each(factories)("streams binary file stdin/stdout through $name", async ({ create }) => {
  const root = await fixture(), raw = create(root), bytes = Buffer.alloc(128 * 1024);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256;
  const input = join(root, "input.bin"), output = join(root, "output.bin");
  await writeFile(input, bytes);
  const stored = await createExecaRawGitExec(root)(["hash-object", "-w", "--stdin"], { input: bytes });
  const oid = Buffer.from(stored.stdout).toString().trim(), hashed = join(root, "oid.txt");
  await raw(["hash-object", "-w", "--stdin"], { inputFile: input, outputFile: hashed, objectAccess: "local-only" });
  expect((await readFile(hashed, "utf8")).trim()).toBe(oid);
  const result = await raw(["cat-file", "blob", oid], { outputFile: output, objectAccess: "local-only" });
  expect(result.stdout.byteLength).toBe(0); expect(await readFile(output)).toEqual(bytes);
  if (process.platform !== "win32") expect((await stat(output)).mode & 0o777).toBe(0o600);
  expect(await readFile(input)).toEqual(bytes);
});
it.each(factories)("refuses conflicting input and occupied output through $name", async ({ create }) => {
  const root = await fixture(), raw = create(root), input = join(root, "input"), output = join(root, "occupied");
  await writeFile(input, Buffer.from([0, 255])); await writeFile(output, "keep me");
  await expect(raw(["hash-object", "--stdin"], { input: Buffer.from("bytes"), inputFile: input })).rejects.toThrow(/input/iu);
  await expect(raw(["hash-object", "--stdin"], { inputFile: input, outputFile: output })).rejects.toThrow();
  expect(await readFile(output, "utf8")).toBe("keep me");
});
it.each(factories)("closes owned descriptors after open and Git failures through $name", async ({ create }) => {
  const root = await fixture(), raw = create(root), input = join(root, "input"); await writeFile(input, "input");
  const count = async () => process.platform === "linux" ? (await readdir("/proc/self/fd")).length : undefined;
  const before = await count();
  for (let index = 0; index < 5; index++) {
    await expect(raw(["not-a-real-git-command"], { inputFile: input, outputFile: join(root, `failure-${index}`) })).rejects.toThrow();
    await expect(raw(["hash-object", "--stdin"], { inputFile: input, outputFile: root })).rejects.toThrow();
  }
  expect(await count()).toBe(before);
});
