/**
 * Unit tests for package version resolution.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getFrameworkVersion,
  findVersionFromDir,
  checkLatestVersion,
} from "../../src/lib/version.js";
import type { FetchFn } from "../../src/lib/version.js";

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

describe("checkLatestVersion", () => {
  it("returns version string on successful registry response", async () => {
    const mockFetch: FetchFn = async () => ({
      ok: true,
      json: async () => ({ version: "2.3.4" }),
    });

    const result = await checkLatestVersion("@arc-framework/cli", mockFetch);
    expect(result).toBe("2.3.4");
  });

  it("returns null on network error (non-fatal)", async () => {
    const mockFetch: FetchFn = async () => {
      throw new Error("fetch failed");
    };

    const result = await checkLatestVersion("@arc-framework/cli", mockFetch);
    expect(result).toBeNull();
  });

  it("returns null on non-ok HTTP response", async () => {
    const mockFetch: FetchFn = async () => ({
      ok: false,
      json: async () => ({}),
    });

    const result = await checkLatestVersion("@arc-framework/cli", mockFetch);
    expect(result).toBeNull();
  });

  it("encodes scoped package names correctly in URL", async () => {
    let capturedUrl = "";
    const mockFetch: FetchFn = async (url) => {
      capturedUrl = url;
      return { ok: true, json: async () => ({ version: "1.0.0" }) };
    };

    await checkLatestVersion("@arc-framework/cli", mockFetch);
    expect(capturedUrl).toBe(
      "https://registry.npmjs.org/@arc-framework%2Fcli/latest",
    );
  });
});
