import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  SchemaError,
  createKernelRegistry,
} from "../../../../src/lib/kernel/index.js";
import {
  registerReviewDomainSchemas,
} from "../../../../src/scripts/review-gate/core/register-review-schemas.js";
import {
  assertReviewDurableRecordInventory,
} from "../../../../src/scripts/review-gate/core/schema-inventory.js";

const kernelIdentities = ["priority", "slug", "work-class", "work-unit-state"];
const reviewIdentities = [
  "approved-disposition-record",
  "approved-disposition-set",
  "canonical-change",
  "canonical-change-set",
  "change-path-fact",
  "change-path-set",
  "disposition-approval",
  "disposition-report-item",
  "disposition-set",
  "disposition-set-preimage",
  "disposition-set-state",
  "finding-classification",
  "finding-disposition",
  "finding-settlement",
  "fix-authorization",
  "fix-authorization-consumption",
  "fix-authorization-preimage",
  "frontline-execution-outcome",
  "frontline-outcome-digest-preimage",
  "frontline-outcome-record",
  "frontline-run-state",
  "local-review-policy-binding",
  "local-review-policy-binding-digest-preimage",
  "local-review-source",
  "local-review-source-digest-preimage",
  "local-review-state",
  "merge-lock-command-error-envelope",
  "merge-lock-hold-envelope",
  "merge-lock-release-envelope",
  "merge-lock-resolve-envelope",
  "standard-review-contract",
  "standard-review-obligation-projection",
  "standard-review-rubric-digest-preimage",
  "project-routing-promotion",
  "proposed-disposition-set",
  "normalized-review-finding",
  "review-applicability",
  "review-applicability-id-preimage",
  "review-command-error-envelope",
  "review-chunking-resolve-envelope",
  "review-chunking-resolve-request",
  "review-frontline-resolve-envelope",
  "review-frontline-run-envelope",
  "review-hosted-await-envelope",
  "review-hosted-request-envelope",
  "review-hosted-settle-envelope",
  "review-local-attest-envelope",
  "review-local-prepare-envelope",
  "review-local-resume-envelope",
  "review-reduce-envelope",
  "review-respond-envelope",
  "review-assurance-input",
  "review-guidance-digest-preimage",
  "review-lifecycle-tail-proof",
  "review-method-activity",
  "review-operation-state",
  "review-policy-version-preimage",
  "review-readiness-envelope",
  "review-receipt",
  "review-receipt-ledger",
  "review-request",
  "review-request-id-preimage",
  "review-reduction-projection",
  "review-requirement",
  "review-requirement-id-preimage",
  "review-resolve-envelope",
  "review-response-input",
  "review-response-plan",
  "review-rubric-overlay-resolution",
  "review-routing-decision",
  "review-routing-facts",
  "review-severity",
  "review-suspension-state",
  "review-target",
  "review-target-id-preimage",
  "review-unlock-envelope",
  "severity-gating-policy",
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
    expect(registry.meta("standard-review-rubric-digest-preimage")?.version).toBe(1);
    expect(registry.meta("review-guidance-digest-preimage")?.version).toBe(2);
    expect(registry.meta("review-policy-version-preimage")?.version).toBe(2);
    expect(registry.meta("review-lifecycle-tail-proof")?.version).toBe(2);
    expect(registry.meta("review-response-plan")?.version).toBe(2);
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

  it("rejects a durable-record inventory entry whose registered version diverges", () => {
    const registry = createKernelRegistry();
    registry.register(z.string(), {
      id: "review-target",
      version: 1,
      migrationPosture: "strict-current",
    });

    expect(() => assertReviewDurableRecordInventory(registry))
      .toThrow("review-target inventory version 2 does not match registered version 1");
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
