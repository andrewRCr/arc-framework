/** Native filesystem membership and resolver-control fixtures. */
import { mkdirSync, rmSync, symlinkSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, type TestContext } from "vitest";
import { hashSourceInputs } from "../../src/lib/dev-check.js";
import { captureBuildInventory } from "../../src/lib/build-inventory.js";
import { makeBuildFixture, writeBuildFixtureFile } from "../helpers/build-fixture.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("rich build inventory", () => {
  it("keeps an inert pull-request checkout under the root cache out of the build identity", () => {
    const { root, packageRoot } = makeBuildFixture();
    roots.push(root);
    const before = captureBuildInventory(packageRoot).identity;
    const materialize = (directory: string) => {
      writeBuildFixtureFile(join(root, directory, "package.json"), '{"private":true,"workspaces":["packages/cli"]}');
      writeBuildFixtureFile(join(root, directory, "packages/cli/package.json"), '{"name":"@fixture/changed"}');
      writeBuildFixtureFile(join(root, directory, "packages/cli/src/cli.ts"), "export const marker = 2;");
    };
    materialize(".cache/arc-lane-change-data");
    expect(captureBuildInventory(packageRoot).identity).toBe(before);
    materialize("_arc_change_data");
    expect(captureBuildInventory(packageRoot).identity).not.toBe(before);
  });

  for (const sourceContents of [true, false]) {
    it(`ignores non-input directories during ${sourceContents ? "baseline" : "qualification"} capture`, () => {
      const { root, packageRoot } = makeBuildFixture();
      roots.push(root);
      writeBuildFixtureFile(join(packageRoot, "src/entry.ts"), "export const marker = 1;");
      const capture = () => captureBuildInventory(packageRoot, ["."], sourceContents);
      const before = capture();
      const directory = join(root, ".aws/nested");
      mkdirSync(directory, { recursive: true });
      expect(capture()).toEqual(before);
      writeBuildFixtureFile(join(directory, "notes.txt"), "not a compiler input");
      expect(capture()).toEqual(before);
      const input = join(directory, "control.ts");
      writeBuildFixtureFile(input, "export const control = true;");
      const changed = capture();
      expect(changed.entries).toContainEqual({ path: ".aws/nested/control.ts", kind: "file" });
      expect(changed.identity).not.toBe(before.identity);
      rmSync(input);
      expect(capture()).toEqual(before);
    });
  }

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

  it("retains control-only directories and raw dangling, external, and empty-directory links", (context) => {
    const { root, packageRoot } = makeBuildFixture();
    const external = makeBuildFixture();
    roots.push(root, external.root);
    mkdirSync(join(packageRoot, "src/controls"), { recursive: true });
    mkdirSync(join(packageRoot, "src/empty"));
    const before = captureBuildInventory(packageRoot);
    const links = [
      { name: "dangling.ts", target: "missing.ts", kind: "file" as const },
      { name: "external", target: external.packageRoot, kind: "dir" as const },
      { name: "empty", target: join("..", "empty"), kind: "dir" as const },
    ];
    for (const link of links) createLink(link.target, join(packageRoot, "src/controls", link.name), link.kind, context);
    const inventory = captureBuildInventory(packageRoot);
    expect(inventory.entries).toContainEqual({ path: "packages/cli/src/controls", kind: "directory" });
    for (const link of links) {
      expect(inventory.entries).toContainEqual({
        path: `packages/cli/src/controls/${link.name}`, kind: "link", target: link.target,
      });
    }
    expect(inventory.entries).not.toContainEqual({ path: "packages/cli/src/empty", kind: "directory" });
    expect(inventory.contents).toEqual(before.contents);
    expect(inventory.identity).not.toBe(before.identity);
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


});

function createLink(target: string, path: string, kind: "file" | "dir", context: TestContext): void {
  try { symlinkSync(target, path, kind); }
  catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "EPERM") context.skip();
    else throw error;
  }
}
