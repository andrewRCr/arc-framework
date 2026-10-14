/** A check's missing-package failure reads as an install gap only when the npm lockfile declares the package. */
import { afterEach, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findUninstalledLockedPackages, installGapReason } from "../../../../src/lib/checks/install-gap.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function project(packages: Record<string, object>, installed: readonly string[] = []): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-install-gap-"));
  roots.push(root);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: { "": {}, ...packages } }));
  await Promise.all(installed.map(path => mkdir(join(root, path), { recursive: true })));
  return root;
}

const esmMissing = (name: string): string =>
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '${name}' imported from /repo/packages/arc-framework/eslint.config.js`;

it("names a package the lockfile declares but node_modules lacks", async () => {
  const root = await project({ "node_modules/eslint-plugin-jsdoc": { dev: true } });
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc"), [root])).resolves.toEqual(["eslint-plugin-jsdoc"]);
});

it("reads a scoped CommonJS specifier's package and a workspace's nested install location", async () => {
  const root = await project({ "packages/app/node_modules/@scope/tool": {} });
  const output = "Error: Cannot find module '@scope/tool/lib/run.js'\n  code: 'MODULE_NOT_FOUND'";
  await expect(findUninstalledLockedPackages(output, [root])).resolves.toEqual(["@scope/tool"]);
});

it("reports nothing once the declared package is installed at any of its locations", async () => {
  const root = await project({ "node_modules/eslint-plugin-jsdoc": {}, "packages/app/node_modules/eslint-plugin-jsdoc": {} },
    ["packages/app/node_modules/eslint-plugin-jsdoc"]);
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc"), [root])).resolves.toEqual([]);
});

it("keeps an undeclared package, a missing local file, and an optional entry out of the gap", async () => {
  const root = await project({ "node_modules/@esbuild/darwin-arm64": { optional: true } });
  const output = [
    esmMissing("left-pad"),
    `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${root}/src/missing.js' imported from ${root}/src/index.js`,
    "Error: Cannot find module './relative.js'",
    esmMissing("@esbuild/darwin-arm64"),
  ].join("\n");
  await expect(findUninstalledLockedPackages(output, [root])).resolves.toEqual([]);
});

it("reports nothing without an npm lockfile, and reads the first directory that has one", async () => {
  const bare = await mkdtemp(join(tmpdir(), "arc-install-gap-bare-"));
  roots.push(bare);
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc"), [bare])).resolves.toEqual([]);
  const root = await project({ "node_modules/eslint-plugin-jsdoc": {} });
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc"), [bare, root]))
    .resolves.toEqual(["eslint-plugin-jsdoc"]);
});

it("names npm ci and every missing package in the reason", () => {
  expect(installGapReason(["eslint-plugin-jsdoc"]))
    .toBe("eslint-plugin-jsdoc is in package-lock.json but not installed; run npm ci, then retry");
  expect(installGapReason(["a", "@b/c"])).toBe("a, @b/c are in package-lock.json but not installed; run npm ci, then retry");
});
