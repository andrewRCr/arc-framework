import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const artifactPath = resolve(packageRoot, "dist/schemas/kernel.json");

describe("production schema artifact", () => {
  it("contains the complete composed schema family from the production build", () => {
    const bundle = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      schemas: Record<string, { $id?: string }>;
    };

    expect(Object.keys(bundle.schemas)).toEqual([
      "canonical-change",
      "canonical-change-set",
      "change-path-fact",
      "change-path-set",
      "finding-classification",
      "finding-disposition",
      "independent-analysis-contract",
      "independent-analysis-obligation-projection",
      "independent-analysis-rubric-digest-preimage",
      "priority",
      "project-routing-promotion",
      "review-assurance-input",
      "review-method-activity",
      "review-receipt",
      "review-request",
      "review-request-id-preimage",
      "review-requirement",
      "review-requirement-id-preimage",
      "review-routing-decision",
      "review-routing-facts",
      "review-rubric-overlay-resolution",
      "review-severity",
      "review-target",
      "review-target-id-preimage",
      "slug",
      "work-class",
      "work-unit-review-assurance",
      "work-unit-state",
    ]);
    for (const [id, schema] of Object.entries(bundle.schemas)) {
      expect(schema.$id).toBe(`${id}.schema.json`);
    }
  });

  it("includes the generated schema bundle in the publishable package", () => {
    const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    const report = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;

    expect(report[0]?.files.map(({ path }) => path)).toContain("dist/schemas/kernel.json");
  });
});
