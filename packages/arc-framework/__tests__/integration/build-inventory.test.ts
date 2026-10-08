/** Native resolver output and first-party build membership agree across directory changes. */
import { mkdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { build } from "esbuild";
import { afterEach, describe, expect, it } from "vitest";
import { captureBuildInventory } from "../../src/lib/build-inventory.js";
import { identifyBuildInputs } from "../../src/lib/build-evidence.js";
import { hashSourceInputs, selectBundleInputs } from "../../src/lib/dev-check.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("native resolver membership", () => {
  it("keeps identities stable for irrelevant directories but invalidates a newly preferred source", async () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    writeBuildFixtureFile(join(packageRoot, "src/entry.ts"), 'export { marker } from "choice";');
    writeBuildFixtureFile(join(packageRoot, "src/fallback.ts"), 'export const marker = "fallback";');
    writeBuildFixtureFile(join(packageRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: {
      baseUrl: ".", paths: { choice: ["src/nested/preferred/index.ts", "src/fallback.ts"] },
    } }));
    const compile = () => build({ absWorkingDir: packageRoot, entryPoints: ["src/entry.ts"], bundle: true,
      metafile: true, write: false, format: "esm", tsconfig: "tsconfig.json", logLevel: "silent" });
    const first = await compile();
    expect(first.outputFiles[0]?.text).toContain('"fallback"');
    const inputs = selectBundleInputs(first.metafile, packageRoot) ?? [];
    expect(inputs).toContain(join(packageRoot, "src/fallback.ts"));
    const keys = inputs.map((path) => relative(root, path).replaceAll("\\", "/"));
    const graphs = { cli: keys, schema: keys, controls: ["packages/cli/tsconfig.json"] };
    const before = captureBuildInventory(packageRoot);
    const identities = identifyBuildInputs(graphs, before.contents, before.identity);
    const preferred = join(packageRoot, "src/nested/preferred");
    mkdirSync(preferred, { recursive: true });
    for (const state of ["empty", "text-only"]) {
      if (state === "text-only") writeBuildFixtureFile(join(preferred, "notes.txt"), "not source");
      const generated = await compile();
      const current = captureBuildInventory(packageRoot);
      expect(generated.outputFiles[0]?.text).toBe(first.outputFiles[0]?.text);
      expect(identifyBuildInputs(graphs, current.contents, current.identity)).toEqual(identities);
    }
    writeBuildFixtureFile(join(preferred, "index.ts"), 'export const marker = "preferred";');
    const generated = await compile();
    expect(generated.outputFiles[0]?.text).toContain('"preferred"');
    expect(generated.outputFiles[0]?.text).not.toBe(first.outputFiles[0]?.text);
    const current = captureBuildInventory(packageRoot);
    const changed = identifyBuildInputs(graphs, current.contents, current.identity);
    expect(changed.runtime).not.toBe(identities.runtime);
    expect(changed.runtimeSchema).not.toBe(identities.runtimeSchema);
  });

  it("hashes native metadata-omitted resolver manifests into both identities", async () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    writeBuildFixtureFile(join(packageRoot, "src/entry.ts"), 'import "./nested/effect.js"; export const marker = 1;');
    writeBuildFixtureFile(join(packageRoot, "src/nested/effect.js"), 'console.log("resolver-side-effect");');
    const manifest = join(packageRoot, "src/nested/package.json");
    writeBuildFixtureFile(manifest, '{"sideEffects":true}');
    const compile = async () => build({ absWorkingDir: packageRoot, entryPoints: ["src/entry.ts"],
      bundle: true, metafile: true, write: false, format: "esm", logLevel: "silent" });
    const first = await compile();
    const inputs = selectBundleInputs(first.metafile, packageRoot) ?? [];
    expect(inputs).not.toContain(manifest);
    const before = captureBuildInventory(packageRoot);
    const oldDigest = hashSourceInputs(inputs, root);
    const keys = inputs.map((path) => path.slice(root.length + 1).replaceAll("\\", "/"));
    const graphs = { cli: keys, schema: keys, controls: ["packages/cli/package.json"] };
    const identities = identifyBuildInputs(graphs, before.contents, before.identity);
    writeBuildFixtureFile(manifest, '{"sideEffects":false}');
    const second = await compile();
    const after = captureBuildInventory(packageRoot);
    expect(first.outputFiles[0]?.text).toContain("resolver-side-effect");
    expect(second.outputFiles[0]?.text).not.toContain("resolver-side-effect");
    expect(hashSourceInputs(inputs, root)).toBe(oldDigest);
    expect(after.entries).toEqual(before.entries);
    const changed = identifyBuildInputs(graphs, after.contents, after.identity);
    expect(changed.runtime).not.toBe(identities.runtime);
    expect(changed.runtimeSchema).not.toBe(identities.runtimeSchema);
  });
});
