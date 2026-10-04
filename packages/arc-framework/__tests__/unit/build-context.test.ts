/** Installation qualification through actual npm package resolution boundaries. */
import { rmSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { captureBuildContext } from "../../src/lib/build-context.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("build installation context", () => {
  it("identifies the installed Node source loader consumed by compiler children", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const manifest = join(root, "node_modules/tsx/package.json");
    const before = captureBuildContext(packageRoot);
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace("1.0.0", "1.0.1"));
    expect(captureBuildContext(packageRoot).identity).not.toBe(before.identity);
  });
  it("detects installed metadata changes with the committed lock unchanged", () => {
    const fixture = makeBuildFixture();
    roots.push(fixture.root);
    const lock = readFileSync(join(fixture.root, "package-lock.json"), "utf8");
    const before = captureBuildContext(fixture.packageRoot);
    writeFileSync(join(fixture.root, "node_modules/.package-lock.json"), lock.replaceAll("1.0.0", "1.0.1"));
    expect(readFileSync(join(fixture.root, "package-lock.json"), "utf8")).toBe(lock);
    expect(captureBuildContext(fixture.packageRoot).identity).not.toBe(before.identity);
  });

  it("resolves nested compiler tools without requiring exported manifest subpaths", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const manifest = join(root, "node_modules/tsup/node_modules/esbuild/package.json");
    writeBuildFixtureFile(manifest, JSON.stringify({
      name: "esbuild", version: "2.0.0", exports: { ".": "./dist/index.js" },
    }));
    writeBuildFixtureFile(join(root, "node_modules/tsup/node_modules/esbuild/dist/index.js"), "module.exports = {};\n");
    const before = captureBuildContext(packageRoot);
    expect(before.contents["node_modules/tsup/node_modules/esbuild/package.json"]).toMatch(/^[a-f0-9]{64}$/u);
    writeFileSync(manifest, readFileSync(manifest, "utf8").replace("2.0.0", "2.0.1"));
    expect(captureBuildContext(packageRoot).identity).not.toBe(before.identity);
  });

  it.each(["missing", "malformed", "empty"])("refuses %s installed metadata with a repair command", (kind) => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const metadata = join(root, "node_modules/.package-lock.json");
    if (kind === "missing") rmSync(metadata);
    else writeFileSync(metadata, kind === "malformed" ? "broken" : '{"lockfileVersion":3,"packages":{}}');
    expect(() => captureBuildContext(packageRoot)).toThrow(/npm ci.*npm run build:fast/u);
    writeFileSync(metadata, readFileSync(join(root, "package-lock.json")));
    expect(captureBuildContext(packageRoot).identity).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps equivalent checkout roots and unrelated environment independent", () => {
    const first = makeBuildFixture();
    const second = makeBuildFixture();
    roots.push(first.root, second.root);
    expect(captureBuildContext(first.packageRoot)).toEqual(captureBuildContext(second.packageRoot));
  });

  it.each(["node", "platform", "architecture"] as const)("includes %s in the runtime context", (dimension) => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const runtime = { node: "v24", platform: "linux", architecture: "x64" };
    expect(captureBuildContext(packageRoot, { ...runtime, [dimension]: "changed" }).identity)
      .not.toBe(captureBuildContext(packageRoot, runtime).identity);
  });
});
