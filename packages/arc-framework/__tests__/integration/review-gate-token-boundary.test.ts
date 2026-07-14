import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string): Promise<string> => readFile(resolve(root, path), "utf8");

describe("review-gate token boundary", () => {
  it("keeps every production token consumer opaque", async () => {
    const paths = [
      "packages/arc-framework/src/scripts/review-gate/hosts/github/api/http.ts",
      "packages/arc-framework/src/scripts/review-gate/hosts/github/api/rest.ts",
      "packages/arc-framework/src/scripts/review-gate/hosts/github/api/graphql.ts",
      "packages/arc-framework/src/scripts/review-gate/runtime/composition.ts",
      "packages/arc-framework/src/scripts/review-gate/runtime/token-qualification.ts",
    ];
    const source = (await Promise.all(paths.map(read))).join("\n");
    expect(source).not.toMatch(/startsWith\(["']ghs_|token\.length|token\.split|token.*RegExp|\/ghs_/u);
    expect(source).not.toMatch(/token\s*:\s*string\s*\|/u);
  });

  it("isolates the temporary format override to the qualification-only mint", async () => {
    const [mint, normalWorkflow, attestWorkflow, qualifyWorkflow] = await Promise.all([
      read("packages/arc-framework/src/scripts/review-gate/runtime/github-app-mint.ts"),
      read(".github/workflows/review-gate.yml"),
      read(".github/workflows/review-gate-attest.yml"),
      read(".github/workflows/review-gate-qualify.yml"),
    ]);
    expect(mint).toContain("X-GitHub-Stateless-S2S-Token");
    expect(normalWorkflow).not.toContain("Stateless-S2S");
    expect(attestWorkflow).not.toContain("Stateless-S2S");
    expect(normalWorkflow).toContain("actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349");
    expect(attestWorkflow).toContain("actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349");
    expect(qualifyWorkflow).toContain("ARC_QUALIFICATION_RESULT: ${{ runner.temp }}");
  });
});
