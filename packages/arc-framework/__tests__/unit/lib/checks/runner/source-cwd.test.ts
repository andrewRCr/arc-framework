/** Routed cwd containment follows both lexical names and actual directory links. */
import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSourceCwd } from "../../../../../src/lib/checks/runner/source-cwd.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function fixture(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "arc-source-cwd-"));
  directories.push(parent);
  const root = join(parent, "source");
  await mkdir(join(root, "packages", "nested"), { recursive: true });
  await mkdir(join(parent, "sibling"));
  await symlink(join(parent, "sibling"), join(root, "outside"), "junction");
  await symlink(join(root, "packages"), join(root, "inside"), "junction");
  await writeFile(join(root, "file.txt"), "file");
  return root;
}

it.each([
  { name: "root", input: ".", expected: "." },
  { name: "nested directory", input: "packages/nested", expected: "packages/nested" },
  { name: "normalized directory", input: "packages/../packages/nested", expected: "packages/nested" },
  { name: "internal directory link", input: "inside/nested", expected: "packages/nested" },
])("retains a contained $name as a slash-relative cwd", async ({ input, expected }) => {
  expect(await resolveSourceCwd(await fixture(), input)).toBe(expected);
});

it.each(["../sibling", "outside", "outside/child", "absent", "file.txt", "packages\0bad"])(
  "refuses cwd %j with repair and local/explicit-input remedies", async input => {
    const root = await fixture();
    await expect(resolveSourceCwd(root, input)).rejects.toThrow(/repair.*retry.*local.*explicit/iu);
    expect(await resolveSourceCwd(root, "packages/nested")).toBe("packages/nested");
  });

it.each([{ authored: "DIRECTORY", stored: "Directory" }, { authored: "é", stored: "e\u0301" }])(
  "transports actual directory spelling for compatible alias $authored or refuses an incompatible lookup", async ({ authored, stored }) => {
    const root = await mkdtemp(join(tmpdir(), "arc-source-cwd-spelling-"));
    directories.push(root);
    await mkdir(join(root, stored));
    let compatible = true;
    try { await realpath(join(root, authored)); }
    catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      compatible = false;
    }
    if (compatible) expect(await resolveSourceCwd(root, authored)).toBe((await readdir(root))[0]);
    else await expect(resolveSourceCwd(root, authored)).rejects.toThrow(/contained directory.*repair.*retry/iu);
  });
