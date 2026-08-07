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
      "approved-disposition-record",
      "approved-disposition-set",
      "canonical-change",
      "canonical-change-set",
      "change-path-fact",
      "change-path-set",
      "delivery-deliverable-id-preimage",
      "delivery-plan",
      "delivery-plan-authoring-input",
      "delivery-plan-member",
      "delivery-plan-seam",
      "delivery-state",
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
      "normalized-review-finding",
      "priority",
      "project-routing-promotion",
      "proposed-disposition-set",
      "remote-evidence",
      "remote-failure-reason",
      "review-applicability",
      "review-applicability-id-preimage",
      "review-assurance-input",
      "review-chunking-resolve-envelope",
      "review-chunking-resolve-request",
      "review-command-error-envelope",
      "review-frontline-resolve-envelope",
      "review-frontline-run-envelope",
      "review-guidance-digest-preimage",
      "review-hosted-await-envelope",
      "review-hosted-request-envelope",
      "review-hosted-settle-envelope",
      "review-lifecycle-tail-proof",
      "review-local-attest-envelope",
      "review-local-prepare-envelope",
      "review-local-resume-envelope",
      "review-method-activity",
      "review-operation-state",
      "review-policy-version-preimage",
      "review-readiness-envelope",
      "review-receipt",
      "review-receipt-ledger",
      "review-reduce-envelope",
      "review-reduction-projection",
      "review-request",
      "review-request-id-preimage",
      "review-requirement",
      "review-requirement-id-preimage",
      "review-resolve-envelope",
      "review-respond-envelope",
      "review-response-input",
      "review-response-plan",
      "review-routing-decision",
      "review-routing-facts",
      "review-rubric-overlay-resolution",
      "review-severity",
      "review-suspension-state",
      "review-target",
      "review-target-id-preimage",
      "severity-gating-policy",
      "slug",
      "standard-review-contract",
      "standard-review-obligation-projection",
      "standard-review-rubric-digest-preimage",
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
