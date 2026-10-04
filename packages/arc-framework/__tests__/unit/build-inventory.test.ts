/** Native filesystem membership and resolver-control fixtures. */
import { rmSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, type TestContext } from "vitest";
import { build } from "esbuild";
import { hashSourceInputs, selectBundleInputs } from "../../src/lib/dev-check.js";
import { identifyBuildInputs } from "../../src/lib/build-evidence.js";
import { captureBuildInventory } from "../../src/lib/build-inventory.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("rich build inventory", () => {
  it("invalidates membership when a resolution-changing JS sibling is added", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    writeBuildFixtureFile(join(packageRoot, "src/dep.ts"), "export const marker = 1;");
    const before = captureBuildInventory(packageRoot);
    writeBuildFixtureFile(join(packageRoot, "src/dep.js"), "export const marker = 2;");
    const after = captureBuildInventory(packageRoot);
    expect(after.identity).not.toBe(before.identity);
    expect(after.entries).toContainEqual({ path: "packages/cli/src/dep.js", kind: "file" });
    rmSync(join(packageRoot, "src/dep.js"));
    expect(captureBuildInventory(packageRoot).identity).toBe(before.identity);
  });

  for (const kind of ["file", "dir"] as const) {
    it(`records raw ${kind} link retargeting despite unchanged old inputs`, (context) => {
      const { root, packageRoot } = makeBuildFixture();
      roots.push(root);
      writeBuildFixtureFile(join(packageRoot, "src/a/value.ts"), "export const marker = 1;");
      writeBuildFixtureFile(join(packageRoot, "src/b/value.ts"), "export const marker = 2;");
      const link = join(packageRoot, kind === "file" ? "src/linked.ts" : "src/linked");
      createLink(kind === "file" ? "a/value.ts" : "a", link, kind, context);
      const before = captureBuildInventory(packageRoot);
      const oldDigest = hashSourceInputs([join(packageRoot, "src/a/value.ts")], root);
      rmSync(link);
      createLink(kind === "file" ? "b/value.ts" : "b", link, kind, context);
      const after = captureBuildInventory(packageRoot);
      expect(hashSourceInputs([join(packageRoot, "src/a/value.ts")], root)).toBe(oldDigest);
      expect(after.entries.map((entry) => entry.path)).toEqual(before.entries.map((entry) => entry.path));
      expect(after.identity).not.toBe(before.identity);
    });
  }

  it("records same-content file replacement by an internal link", (context) => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const entry = join(packageRoot, "src/entry.ts");
    writeBuildFixtureFile(entry, "export const marker = 1;");
    writeBuildFixtureFile(join(packageRoot, "src/target.ts"), "export const marker = 1;");
    const before = captureBuildInventory(packageRoot);
    rmSync(entry);
    createLink("target.ts", entry, "file", context);
    const after = captureBuildInventory(packageRoot);
    expect(after.contents).toEqual(before.contents);
    expect(after.identity).not.toBe(before.identity);
  });

  it("excludes output, staging, leases, and installed content", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const before = captureBuildInventory(packageRoot);
    for (const key of ["dist/cli.js", ".arc-dev-build-fixture/cli.js", "node_modules/dependency/file.js",
      ".arc-build-artifacts.lock"]) writeBuildFixtureFile(join(packageRoot, key), "generated");
    expect(captureBuildInventory(packageRoot)).toEqual(before);
  });

  it("retains source directories whose names match package artifact directories", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    for (const key of ["src/dist/input.js", "src/templates/control.json", "src/arc/tool.ts"]) {
      writeBuildFixtureFile(join(packageRoot, key), "source");
    }
    const inventory = captureBuildInventory(packageRoot);
    expect(inventory.contents).toHaveProperty("packages/cli/src/dist/input.js");
    expect(inventory.contents).toHaveProperty("packages/cli/src/templates/control.json");
    expect(inventory.contents).toHaveProperty("packages/cli/src/arc/tool.ts");
  });

  it("retains ordinary content selectivity and ignores timestamps", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const file = join(packageRoot, "src/unrelated.ts");
    writeBuildFixtureFile(file, "export const marker = 1;");
    const before = captureBuildInventory(packageRoot);
    utimesSync(file, new Date(1), new Date(1));
    expect(captureBuildInventory(packageRoot)).toEqual(before);
    writeBuildFixtureFile(file, "export const marker = 2;");
    expect(captureBuildInventory(packageRoot).identity).toBe(before.identity);
  });

  it("reads only resolver contents during ordinary inventory qualification", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    writeBuildFixtureFile(join(packageRoot, "src/ordinary.ts"), "export const marker = 1;");
    const baseline = captureBuildInventory(packageRoot);
    const qualified = captureBuildInventory(packageRoot, ["."], false);
    expect(qualified.contents).not.toHaveProperty("packages/cli/src/ordinary.ts");
    expect(qualified.contents).toHaveProperty("packages/cli/package.json");
    expect(qualified.entries).toEqual(baseline.entries);
    expect(qualified.identity).toBe(baseline.identity);
  });

  it("conservatively invalidates an unused first-party manifest", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const manifest = join(packageRoot, "src/unused/package.json");
    writeBuildFixtureFile(manifest, '{"name":"unused"}');
    const before = captureBuildInventory(packageRoot);
    writeBuildFixtureFile(manifest, '{"name":"unused-renamed"}');
    const after = captureBuildInventory(packageRoot);
    expect(after.entries).toEqual(before.entries);
    expect(after.identity).not.toBe(before.identity);
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

function createLink(target: string, path: string, kind: "file" | "dir", context: TestContext): void {
  try { symlinkSync(target, path, kind); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") context.skip();
    else throw error;
  }
}
