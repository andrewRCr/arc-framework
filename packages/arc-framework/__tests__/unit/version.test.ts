/**
 * Unit tests for package version resolution.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getFrameworkVersion, findVersionFromDir } from "../../src/lib/version.js";

const thisDir = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(thisDir, "../..");
const pkgJson = JSON.parse(readFileSync(resolve(pkgRoot, "package.json"), "utf8")) as {
  version: string;
};

describe("getFrameworkVersion", () => {
  it("returns the version from the CLI package's package.json", () => {
    const version = getFrameworkVersion();
    expect(version).toBe(pkgJson.version);
  });
});

describe("findVersionFromDir", () => {
  it("returns the version from the nearest ancestor package.json", () => {
    const version = findVersionFromDir(resolve(pkgRoot, "src/lib"));
    expect(version).toBe(pkgJson.version);
  });

  it("falls back to 0.0.0 when no package.json is found", () => {
    const version = findVersionFromDir("/");
    expect(version).toBe("0.0.0");
  });
});
