import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { selectE2EBuildCommand } from "../e2e/global-setup.js";

describe("E2E global setup build selection", () => {
  it("retains the full build for the ordinary suite", () => {
    expect(selectE2EBuildCommand(undefined)).toBe("npm run build");
    expect(selectE2EBuildCommand("test:e2e")).toBe("npm run build");
  });

  it("uses the runtime-only build for the focused developer loop", () => {
    expect(selectE2EBuildCommand("test:e2e:focused")).toBe("npm run build:fast");
  });

  it("serializes local heavy tiers at the package front while leaving unit-only runs concurrent", () => {
    const packageManifest = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    const rootManifest = JSON.parse(readFileSync(new URL("../../../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(packageManifest.scripts["test"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts full",
    );
    expect(packageManifest.scripts["test:unit"]).toBe("vitest run --project unit --project unit-mocks");
    expect(packageManifest.scripts["test:integration"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts integration",
    );
    expect(packageManifest.scripts["test:e2e"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts e2e",
    );
    expect(packageManifest.scripts["test:e2e:focused"]).toBe(
      "node --import tsx src/scripts/run-local-test-tier.ts e2e-focused",
    );
    expect(rootManifest.scripts["test:e2e:focused"]).toBe(
      "npm run test:e2e:focused -w packages/arc-framework",
    );
  });
});
