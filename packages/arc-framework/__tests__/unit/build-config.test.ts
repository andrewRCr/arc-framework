import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "tsup";
import { afterEach, describe, expect, it } from "vitest";

import { baseOptions } from "../../tsup.config.js";
import { fastOptions } from "../../tsup.fast.config.js";

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
      onSuccess: undefined,
      banner: undefined,
      silent: true,
    });

    const outputs = (await readdir(outDir)).filter((name) => name.endsWith(".js"));
    expect(outputs).toHaveLength(1);
    expect(await readFile(join(outDir, outputs[0] ?? ""), "utf8")).toContain("lazy-marker");
  });
});

describe("runtime-only build options", () => {
  it("regenerates the esbuild metafile", () => {
    // The stamp is computed over the metafile's input graph. Left stale, the stamp and the live
    // hash agree over an outdated graph, so a newly bundled source file is invisible to both sides
    // of the comparison and edits to it read fresh.
    expect(fastOptions.metafile).toBe(true);
  });

  it("cleans the output directory", () => {
    expect(fastOptions.clean).toBe(true);
  });

  it("runs the same success hook as the full build", () => {
    // Identity, not equivalence: a restated hook is free to drift from the one that writes the
    // kernel schema artifact and the content-hash stamp.
    expect(fastOptions.onSuccess).toBe(baseOptions.onSuccess);
  });

  it("overrides declaration emit alone", () => {
    expect(Object.keys(fastOptions).sort()).toEqual(Object.keys(baseOptions).sort());

    const diverged = (Object.keys(baseOptions) as (keyof typeof baseOptions)[]).filter(
      (key) => fastOptions[key] !== baseOptions[key],
    );

    expect(diverged).toEqual(["dts"]);
    expect(fastOptions.dts).toBe(false);
  });
});
