import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const testDirectory = fileURLToPath(new URL(".", import.meta.url));
const cliRoot = resolve(testDirectory, "../../../../../");
const repositoryRoot = resolve(cliRoot, "../..");
const rootPackage = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
const cliPackage = JSON.parse(readFileSync(resolve(cliRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

describe("repository-only review action launchers", () => {
  it("exposes thin root scripts without adding a published package command", () => {
    expect(rootPackage.scripts["review-gate:next-action"]).toBe(
      "tsx packages/arc-framework/src/scripts/review-gate/run-next-action.ts",
    );
    expect(rootPackage.scripts["review-gate:perform-action"]).toBe(
      "tsx packages/arc-framework/src/scripts/review-gate/run-perform-action.ts",
    );
    expect(rootPackage.scripts["review-gate:assert-head-mutable"]).toBe(
      "tsx packages/arc-framework/src/scripts/review-gate/run-assert-head-mutable.ts",
    );
    expect(cliPackage.scripts).not.toHaveProperty("review-gate:next-action");
    expect(cliPackage.scripts).not.toHaveProperty("review-gate:perform-action");
    expect(cliPackage.scripts).not.toHaveProperty("review-gate:assert-head-mutable");
  });
});
