/** Native bundling respects shared dynamic-import configuration. */
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "tsup";
import { afterEach, describe, expect, it } from "vitest";

import { baseOptions } from "../../tsup.config.js";

const roots = new Set<string>();

afterEach(async () => {
  await Promise.all([...roots].map(async (root) => rm(root, { recursive: true, force: true })));
  roots.clear();
});

describe("shared build options", () => {
  it("keeps a dynamic import in one JavaScript bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-build-config-"));
    roots.add(root);
    const entry = join(root, "entry.ts");
    const lazyModule = join(root, "lazy.ts");
    const outDir = join(root, "dist");
    await writeFile(entry, 'await import("./lazy.js");\n', "utf8");
    await writeFile(lazyModule, 'export const marker = "lazy-marker";\n', "utf8");

    await build({
      ...baseOptions,
      entry: [entry],
      outDir,
      dts: false,
      sourcemap: false,
      metafile: false,
      banner: undefined,
      silent: true,
    });

    const outputs = (await readdir(outDir)).filter((name) => name.endsWith(".js"));
    expect(outputs).toHaveLength(1);
    expect(await readFile(join(outDir, outputs[0] ?? ""), "utf8")).toContain("lazy-marker");
  });
});
