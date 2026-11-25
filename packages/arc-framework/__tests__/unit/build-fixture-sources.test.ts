/** Synthetic native fixtures retain live dependency graphs without unrelated production workload. */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { copyLiveDependencies } from "../helpers/copy-live-dependencies.js";

it("copies dirty-tree dependencies, runtime siblings and explicit loader roots into independent checkouts", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-fixture-sources-"));
  const source = join(root, "source");
  const first = join(root, "first");
  const second = join(root, "second");
  try {
    await mkdir(join(source, "nested"), { recursive: true });
    const files = {
      "entry.ts": 'import "./nested/module.js"; export type { Shape } from "./shape.js"; export { value } from "./sibling.js";',
      "nested/module.ts": 'export { value } from "../sibling.js"; export const data = import("../data.json");',
      "shape.ts": "export interface Shape { value: number }",
      "sibling.ts": "export const value = 1;",
      "sibling.js": 'export const value = "runtime";',
      "data.json": '{"value":true}',
      "loader.ts": 'export { value } from "./sibling.js";',
      "unrelated.ts": "export const unrelated = true;",
      "entry.bundled_123.mjs": "temporary",
      "nested/module.bundled_456.mjs": "temporary",
    };
    for (const [file, content] of Object.entries(files)) await writeFile(join(source, file), content);
    await copyLiveDependencies(source, first, ["entry.ts", "loader.ts"]);
    expect((await readdir(first)).sort()).toEqual([
      "data.json", "entry.ts", "loader.ts", "nested", "shape.ts", "sibling.js", "sibling.ts",
    ]);
    expect(await readdir(join(first, "nested"))).toEqual(["module.ts"]);
    for (const file of ["entry.ts", "nested/module.ts", "shape.ts", "sibling.js", "sibling.ts", "data.json", "loader.ts"] as const) {
      expect(await readFile(join(first, file), "utf8")).toBe(files[file]);
    }
    await copyLiveDependencies(source, second, ["entry.ts", "loader.ts"]);
    await writeFile(join(first, "nested/module.ts"), "fixture-local edit");
    expect(await readFile(join(source, "nested/module.ts"), "utf8")).toBe(files["nested/module.ts"]);
    expect(await readFile(join(second, "nested/module.ts"), "utf8")).toBe(files["nested/module.ts"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("refuses an unresolved relative edge instead of copying an incomplete graph", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-fixture-missing-source-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "entry.ts"), 'export { missing } from "./deleted.js";');
    await expect(copyLiveDependencies(source, join(root, "copied"), ["entry.ts"]))
      .rejects.toThrow("Unresolved fixture dependency ./deleted.js in entry.ts");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("re-reads changed imports and contents across repeated copies of the same source paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-fixture-live-imports-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "entry.ts"), 'export { value } from "./first.js";');
    await writeFile(join(source, "first.ts"), "export const value = 1;");
    await copyLiveDependencies(source, join(root, "warm"), ["entry.ts"]);
    await writeFile(join(source, "entry.ts"), 'export { value } from "./untracked.js";');
    await writeFile(join(source, "untracked.ts"), "export const value = 2;");
    const changed = join(root, "changed");
    await copyLiveDependencies(source, changed, ["entry.ts"]);
    expect((await readdir(changed)).sort()).toEqual(["entry.ts", "untracked.ts"]);
    expect(await readFile(join(changed, "untracked.ts"), "utf8")).toBe("export const value = 2;");
    await writeFile(join(source, "untracked.ts"), "export const value = 3;");
    const updated = join(root, "updated");
    await copyLiveDependencies(source, updated, ["entry.ts"]);
    expect(await readFile(join(updated, "untracked.ts"), "utf8")).toBe("export const value = 3;");
    await writeFile(join(source, "entry.ts"), "export const value = 4;");
    const removed = join(root, "removed");
    await copyLiveDependencies(source, removed, ["entry.ts"]);
    expect(await readdir(removed)).toEqual(["entry.ts"]);
    expect(await readFile(join(removed, "entry.ts"), "utf8")).toBe("export const value = 4;");
    expect(await readFile(join(changed, "untracked.ts"), "utf8")).toBe("export const value = 2;");
  } finally { await rm(root, { recursive: true, force: true }); }
});

it("resolves new and deleted candidates afresh when importer contents stay unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-fixture-live-resolution-"));
  try {
    const source = join(root, "source");
    await mkdir(source);
    await writeFile(join(source, "entry.ts"), 'export { value } from "./sibling.js";');
    await writeFile(join(source, "sibling.js"), "export const value = 1;");
    await copyLiveDependencies(source, join(root, "warm"), ["entry.ts"]);
    await writeFile(join(source, "sibling.ts"), "export const value = 2;");
    const added = join(root, "added");
    await copyLiveDependencies(source, added, ["entry.ts"]);
    expect((await readdir(added)).sort()).toEqual(["entry.ts", "sibling.js", "sibling.ts"]);
    await rm(join(source, "sibling.js"));
    const removedRuntime = join(root, "removed-runtime");
    await copyLiveDependencies(source, removedRuntime, ["entry.ts"]);
    expect((await readdir(removedRuntime)).sort()).toEqual(["entry.ts", "sibling.ts"]);
    await writeFile(join(source, "sibling.js"), "export const value = 3;");
    await rm(join(source, "sibling.ts"));
    const removedSource = join(root, "removed-source");
    await copyLiveDependencies(source, removedSource, ["entry.ts"]);
    expect((await readdir(removedSource)).sort()).toEqual(["entry.ts", "sibling.js"]);
    expect(await readFile(join(removedSource, "sibling.js"), "utf8")).toBe("export const value = 3;");
    await rm(join(source, "sibling.js"));
    await expect(copyLiveDependencies(source, join(root, "missing"), ["entry.ts"]))
      .rejects.toThrow("Unresolved fixture dependency ./sibling.js in entry.ts");
  } finally { await rm(root, { recursive: true, force: true }); }
});
