/**
 * Package legal files — npm packs only files inside the package directory, so
 * the package carries its own copies of the repository's license and notice
 * files. Each copy must match its repository-root original, and the package
 * manifest must declare both licenses and pack the files npm omits by default.
 */

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(currentDir, "../..");
const REPO_ROOT_DIR = resolve(PACKAGE_DIR, "../..");

describe("package legal files", () => {
  it.each(["LICENSE", "LICENSE-CONTENT", "NOTICE"])("ships %s identical to the repository root", async (name) => {
    const [root, packaged] = await Promise.all([
      readFile(join(REPO_ROOT_DIR, name), "utf8"),
      readFile(join(PACKAGE_DIR, name), "utf8"),
    ]);

    expect(packaged).toBe(root);
  });

  it("declares both licenses and packs the license and notice files", async () => {
    const manifest = JSON.parse(await readFile(join(PACKAGE_DIR, "package.json"), "utf8")) as {
      license?: unknown;
      files?: unknown;
    };

    expect(manifest.license).toBe("Apache-2.0 AND MIT-0");
    expect(manifest.files).toEqual(expect.arrayContaining(["LICENSE-CONTENT", "NOTICE"]));
  });
});
