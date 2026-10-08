/** Live-tree copies retain actual modules and skip loader transients at every depth. */
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { copyLiveTree } from "../helpers/copy-live-tree.js";

it("copies untracked nested modules while excluding bundle-require transients", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-live-tree-copy-"));
  const source = join(root, "source");
  const destination = join(root, "copied");
  try {
    await mkdir(join(source, "nested"), { recursive: true });
    await writeFile(join(source, "untracked.ts"), "export const root = true;");
    await writeFile(join(source, "nested/module.ts"), "export const nested = true;");
    await writeFile(join(source, "entry.bundled_123.mjs"), "temporary root");
    await writeFile(join(source, "nested/module.bundled_456.mjs"), "temporary nested");
    await writeFile(join(source, "nested/ordinary.mjs"), "ordinary module");
    await copyLiveTree(source, destination);
    expect((await readdir(destination)).sort()).toEqual(["nested", "untracked.ts"]);
    expect((await readdir(join(destination, "nested"))).sort()).toEqual(["module.ts", "ordinary.mjs"]);
    expect(await readFile(join(destination, "untracked.ts"), "utf8")).toBe("export const root = true;");
    expect(await readFile(join(destination, "nested/module.ts"), "utf8")).toBe("export const nested = true;");
    expect(await readFile(join(destination, "nested/ordinary.mjs"), "utf8")).toBe("ordinary module");
  } finally { await rm(root, { recursive: true, force: true }); }
});
