import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";


describe("test script entry contracts", () => {
  it("routes supported run-mode tiers through the controller", () => {
    const packageManifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootManifest = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageManifest.scripts["test"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts lane",
    );
    expect(packageManifest.scripts["test:full"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts full",
    );
    expect(packageManifest.scripts["test:changed"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts changed",
    );
    expect(packageManifest.scripts["test:unit"]).toBe("node --import tsx src/scripts/run-local-test-tier.ts unit");
    expect(packageManifest.scripts["test:integration"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts integration",
    );
    expect(packageManifest.scripts["test:arc-contracts"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts arc-contracts",
    );
    expect(packageManifest.scripts["test:e2e"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts e2e",
    );
    expect(packageManifest.scripts["test:e2e:focused"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts e2e-focused",
    );
    expect(packageManifest.scripts["test:portability"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts portability",
    );
    expect(rootManifest.scripts["test:e2e:focused"]).toBe(
      "npm run test:e2e:focused -w packages/arc-framework --",
    );
    expect(rootManifest.scripts["test"]).toBe("npm run test -w packages/arc-framework --");
    expect(rootManifest.scripts["test:full"]).toBe("npm run test:full -w packages/arc-framework --");
    expect(rootManifest.scripts["test:changed"]).toBe("npm run test:changed -w packages/arc-framework --");
  });
});
