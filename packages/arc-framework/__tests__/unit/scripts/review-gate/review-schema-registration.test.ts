import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  SchemaError,
  createKernelRegistry,
} from "../../../../src/lib/kernel/index.js";
import {
  registerReviewDomainSchemas,
} from "../../../../src/scripts/review-gate/core/register-review-schemas.js";

const kernelIdentities = ["priority", "slug", "work-class", "work-unit-state"];
const reviewIdentities = [
  "canonical-change",
  "canonical-change-set",
  "change-path-fact",
  "change-path-set",
  "finding-classification",
  "finding-disposition",
  "independent-analysis-contract",
  "project-routing-promotion",
  "review-assurance-input",
  "review-method-activity",
  "review-routing-decision",
  "review-routing-facts",
  "review-severity",
];

describe("review schema registration", () => {
  it("composes domain-owned schemas into a fresh kernel registry", () => {
    const registry = createKernelRegistry();

    expect(registerReviewDomainSchemas(registry)).toBe(registry);
    expect(registry.ids()).toEqual([...reviewIdentities, ...kernelIdentities].sort());
    for (const id of reviewIdentities) {
      expect(registry.get(id)).toBeDefined();
      expect(registry.meta(id)).toMatchObject({ id, migrationPosture: "strict-current" });
    }
    expect(registry.meta("review-severity")?.version).toBe(2);
    expect(registry.meta("canonical-change-set")?.version).toBe(1);
  });

  it("leaves the kernel factory unchanged and rejects repeated composition", () => {
    const registry = createKernelRegistry();
    registerReviewDomainSchemas(registry);

    expect(() => registerReviewDomainSchemas(registry)).toThrowError(SchemaError);
    expect(createKernelRegistry().ids()).toEqual(kernelIdentities);
    expect(registry.ids()).toEqual([...reviewIdentities, ...kernelIdentities].sort());
  });

  it("keeps review imports and vocabulary out of kernel schema modules", () => {
    const packageRoot = resolve(import.meta.dirname, "../../../..");
    for (const relativePath of [
      "src/lib/kernel/schema/registry.ts",
      "src/lib/kernel/schema/vocabulary.ts",
    ]) {
      const source = readFileSync(join(packageRoot, relativePath), "utf8");
      expect(source).not.toMatch(/review-gate|change-facts|review-routing|finding-disposition/u);
    }
  });
});
