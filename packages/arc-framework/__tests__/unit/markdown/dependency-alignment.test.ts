import { describe, expect, it } from "vitest";

import { assertMarkdownDependencyAlignment } from "../../../src/lib/markdown/index.js";

interface VersionOverrides {
  rootMarkdownlint?: string;
  packageStringWidth?: string;
  lockedRootMarkdownlint?: string;
  lockedMarkdownlint?: string;
  lockedMarkdownlintStringWidth?: string;
  lockedPackageStringWidth?: string;
  lockedStringWidth?: string;
  runtimeMarkdownlint?: string;
  runtimeStringWidth?: string;
}

function dependencyInput(overrides: VersionOverrides = {}) {
  return {
    rootManifest: {
      devDependencies: { markdownlint: overrides.rootMarkdownlint ?? "0.40.0" },
    },
    packageManifest: {
      dependencies: { "string-width": overrides.packageStringWidth ?? "8.1.0" },
    },
    lockfile: {
      packages: {
        "": { devDependencies: { markdownlint: overrides.lockedRootMarkdownlint ?? "0.40.0" } },
        "node_modules/markdownlint": {
          version: overrides.lockedMarkdownlint ?? "0.40.0",
          dependencies: { "string-width": overrides.lockedMarkdownlintStringWidth ?? "8.1.0" },
        },
        "node_modules/string-width": { version: overrides.lockedStringWidth ?? "8.1.0" },
        "packages/arc-framework": {
          dependencies: { "string-width": overrides.lockedPackageStringWidth ?? "8.1.0" },
        },
      },
    },
    runtimeVersions: {
      markdownlint: overrides.runtimeMarkdownlint ?? "0.40.0",
      stringWidth: overrides.runtimeStringWidth ?? "8.1.0",
    },
  };
}

describe("Markdown dependency alignment", () => {
  it("returns the one exact linter-authoritative width version", () => {
    expect(assertMarkdownDependencyAlignment(dependencyInput())).toEqual({
      markdownlint: "0.40.0",
      stringWidth: "8.1.0",
    });
  });

  it.each([
    ["root declaration", { rootMarkdownlint: "^0.40.0" }],
    ["package declaration", { packageStringWidth: "^8.1.0" }],
    ["locked root declaration", { lockedRootMarkdownlint: "0.39.0" }],
    ["locked linter", { lockedMarkdownlint: "0.39.0" }],
    ["linter width dependency", { lockedMarkdownlintStringWidth: "8.2.2" }],
    ["locked package declaration", { lockedPackageStringWidth: "8.2.2" }],
    ["locked width package", { lockedStringWidth: "8.2.2" }],
    ["loaded linter", { runtimeMarkdownlint: "0.39.0" }],
    ["loaded width package", { runtimeStringWidth: "8.2.2" }],
  ] satisfies readonly (readonly [string, VersionOverrides])[])(
    "rejects divergence in the %s",
    (_label, overrides) => {
      expect(() => assertMarkdownDependencyAlignment(dependencyInput(overrides))).toThrowError(
        expect.objectContaining({ code: "markdown.dependency-misaligned" }),
      );
    },
  );
});
