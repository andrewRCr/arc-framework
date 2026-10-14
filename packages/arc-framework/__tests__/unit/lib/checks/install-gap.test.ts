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

const esmMissing = (name: string, importer: string): string =>
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '${name}' imported from ${importer}`;
const cjsMissing = (specifier: string): string => `Error: Cannot find module '${specifier}'\n  code: 'MODULE_NOT_FOUND'`;

it("names a package the lockfile declares but node_modules lacks", async () => {
  const root = await project({ "node_modules/eslint-plugin-jsdoc": { dev: true } });
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc", join(root, "eslint.config.js")), [root]))
    .resolves.toEqual(["eslint-plugin-jsdoc"]);
});

it("reads a scoped CommonJS specifier's package from the check's own directory", async () => {
  const root = await project({ "packages/app/node_modules/@scope/tool": {} });
  await expect(findUninstalledLockedPackages(cjsMissing("@scope/tool/lib/run.js"), [join(root, "packages/app"), root]))
    .resolves.toEqual(["@scope/tool"]);
});

it("reports nothing once the package is installed where the importer resolves it", async () => {
  const root = await project({ "node_modules/eslint-plugin-jsdoc": {}, "packages/app/node_modules/eslint-plugin-jsdoc": {} },
    ["packages/app/node_modules/eslint-plugin-jsdoc"]);
  await expect(findUninstalledLockedPackages(cjsMissing("eslint-plugin-jsdoc"), [join(root, "packages/app"), root]))
    .resolves.toEqual([]);
});

it("counts only the copies the importer's directory can resolve", async () => {
  const root = await project({ "packages/a/node_modules/foo": {}, "packages/b/node_modules/foo": {},
    "packages/b/node_modules/bar": {} }, ["packages/b/node_modules/foo"]);
  const output = [cjsMissing("foo"), cjsMissing("bar")].join("\n");
  await expect(findUninstalledLockedPackages(output, [join(root, "packages/a"), root])).resolves.toEqual(["foo"]);
  await expect(findUninstalledLockedPackages(output, [join(root, "packages/b"), root])).resolves.toEqual(["bar"]);
});

it("resolves from the importing file an ESM message names, and otherwise from the check's directory", async () => {
  const root = await project({ "packages/a/node_modules/foo": {} });
  await expect(findUninstalledLockedPackages(esmMissing("foo", join(root, "packages/a/src/index.js")), [root]))
    .resolves.toEqual(["foo"]);
  await expect(findUninstalledLockedPackages(cjsMissing("foo"), [root])).resolves.toEqual([]);
});

it("keeps an undeclared package, a missing local file, and an optional entry out of the gap", async () => {
  const root = await project({ "node_modules/@esbuild/darwin-arm64": { optional: true } });
  const output = [
    esmMissing("left-pad", join(root, "src/index.js")),
    `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '${root}/src/missing.js' imported from ${root}/src/index.js`,
    cjsMissing("./relative.js"),
    esmMissing("@esbuild/darwin-arm64", join(root, "src/index.js")),
  ].join("\n");
  await expect(findUninstalledLockedPackages(output, [root])).resolves.toEqual([]);
});

it("reads npm 6's nested lockfile by install path", async () => {
  const root = await mkdtemp(join(tmpdir(), "arc-install-gap-v1-"));
  roots.push(root);
  await writeFile(join(root, "package-lock.json"), JSON.stringify({ lockfileVersion: 1, dependencies: {
    "eslint-plugin-jsdoc": { version: "1.0.0", dev: true, dependencies: { "comment-parser": { version: "1.0.0" } } },
  } }));
  const output = [esmMissing("eslint-plugin-jsdoc", join(root, "eslint.config.js")),
    esmMissing("comment-parser", join(root, "node_modules/eslint-plugin-jsdoc/dist/index.js"))].join("\n");
  await expect(findUninstalledLockedPackages(output, [root])).resolves.toEqual(["eslint-plugin-jsdoc", "comment-parser"]);
});

it("reports nothing without an npm lockfile, and reads the first directory that has one", async () => {
  const bare = await mkdtemp(join(tmpdir(), "arc-install-gap-bare-"));
  roots.push(bare);
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc", join(bare, "eslint.config.js")), [bare]))
    .resolves.toEqual([]);
  const root = await project({ "node_modules/eslint-plugin-jsdoc": {} });
  await expect(findUninstalledLockedPackages(esmMissing("eslint-plugin-jsdoc", join(root, "eslint.config.js")), [bare, root]))
    .resolves.toEqual(["eslint-plugin-jsdoc"]);
});

it("names npm ci and every missing package in the reason", () => {
  expect(installGapReason(["eslint-plugin-jsdoc"]))
    .toBe("eslint-plugin-jsdoc is in package-lock.json but not installed; run npm ci, then retry");
  expect(installGapReason(["a", "@b/c"])).toBe("a, @b/c are in package-lock.json but not installed; run npm ci, then retry");
});
