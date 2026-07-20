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
  "disposition-approval",
  "disposition-report-item",
  "disposition-set",
  "disposition-set-preimage",
  "finding-classification",
  "finding-conversation-closure",
  "finding-disposition",
  "finding-settlement",
  "independent-analysis-contract",
  "independent-analysis-obligation-projection",
  "independent-analysis-rubric-digest-preimage",
  "project-routing-promotion",
  "normalized-review-finding",
  "review-applicability",
  "review-applicability-id-preimage",
  "review-assurance-input",
  "review-guidance-digest-preimage",
  "review-lifecycle-tail-proof",
  "review-method-activity",
  "review-policy-version-preimage",
  "review-receipt",
  "review-receipt-ledger",
  "review-request",
  "review-request-id-preimage",
  "review-requirement",
  "review-requirement-id-preimage",
  "review-rubric-overlay-resolution",
  "review-routing-decision",
  "review-routing-facts",
  "review-severity",
  "review-target",
  "review-target-id-preimage",
  "work-unit-review-assurance",
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
    expect(registry.meta("review-target")?.version).toBe(2);
    expect(registry.meta("review-request")?.version).toBe(2);
    expect(registry.meta("review-requirement")?.version).toBe(2);
    expect(registry.meta("review-receipt")?.version).toBe(2);
    expect(registry.meta("review-receipt-ledger")?.version).toBe(2);
    expect(registry.meta("independent-analysis-rubric-digest-preimage")?.version).toBe(1);
    expect(registry.meta("review-guidance-digest-preimage")?.version).toBe(2);
    expect(registry.meta("review-policy-version-preimage")?.version).toBe(2);
    expect(registry.meta("review-lifecycle-tail-proof")?.version).toBe(2);
    expect(registry.meta("review-applicability")?.version).toBe(2);
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
