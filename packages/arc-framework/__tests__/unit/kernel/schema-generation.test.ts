import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createKernelRegistry,
  createRegistry,
  type KernelSchemaMeta,
} from "../../../src/lib/kernel/index.js";
import {
  projectKernelSchemas,
  serializeKernelSchemaBundle,
  writeKernelSchemaArtifact,
} from "../../../src/lib/kernel/schema/generate.js";
import {
  registerReviewDomainSchemas,
} from "../../../src/scripts/review-gate/core/register-review-schemas.js";
import { registerDeliveryDomainSchemas } from "../../../src/lib/delivery/schema.js";
import { registerDeliveryAuthoringSchemas } from "../../../src/lib/delivery/design-inventory.js";

const temporaryRoots: string[] = [];
const strict = (id: string): KernelSchemaMeta => ({ id, version: 1, migrationPosture: "strict-current" });

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kernel schema artifact generation", () => {
  it("projects the built-in schema map without touching disk", () => {
    expect(Object.keys(projectKernelSchemas().schemas)).toEqual([
      "priority",
      "remote-evidence",
      "remote-failure-reason",
      "slug",
      "work-class",
      "work-unit-state",
    ]);
  });

  it("projects the composed production families with stable references and bytes", () => {
    const first = registerDeliveryAuthoringSchemas(
      registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())),
    );
    const second = registerDeliveryAuthoringSchemas(
      registerDeliveryDomainSchemas(registerReviewDomainSchemas(createKernelRegistry())),
    );
    const firstBundle = projectKernelSchemas(first);

    expect(Object.keys(firstBundle.schemas)).toEqual([
      "approved-disposition-record",
      "approved-disposition-set",
      "canonical-change",
      "canonical-change-set",
      "change-path-fact",
      "change-path-set",
      "delivery-deliverable-id-preimage",
      "delivery-design-inventory-input",
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
      "lane-progress-state",
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
      "review-assurance-input",
      "review-change-request-resolve-result",
      "review-checks-await-result",
      "review-chunking-resolve-envelope",
      "review-chunking-resolve-request",
      "review-command-error-envelope",
      "review-frontline-resolve-envelope",
      "review-frontline-run-envelope",
      "review-frontline-run-request",
      "review-guidance-digest-preimage",
      "review-hosted-await-envelope",
      "review-hosted-request-envelope",
      "review-hosted-settle-envelope",
      "review-lifecycle-tail-proof",
      "review-local-attest-envelope",
      "review-local-prepare-envelope",
      "review-local-resume-envelope",
      "review-merge-method-resolve-result",
      "review-method-activity",
      "review-operation-state",
      "review-planning-grooming-resolve-envelope",
      "review-planning-grooming-resolve-request",
      "review-policy-version-preimage",
      "review-pre-publication-envelope",
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
      "review-status-result",
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
      "__shared",
    ]);
    for (const [id, schema] of Object.entries(firstBundle.schemas)) {
      expect(schema.$id).toBe(`${id}.schema.json`);
    }
    expect(JSON.stringify(firstBundle.schemas["canonical-change-set"]))
      .toContain('"$ref":"canonical-change.schema.json"');
    expect(firstBundle.schemas["finding-classification"]?.properties?.severity)
      .toEqual({ $ref: "review-severity.schema.json" });
    expect(firstBundle.schemas["review-routing-facts"]?.properties?.activity)
      .toEqual({ $ref: "review-method-activity.schema.json" });
    const frontlineEnvelope = JSON.stringify(
      firstBundle.schemas["review-frontline-resolve-envelope"],
    );
    const localPrepareEnvelope = JSON.stringify(
      firstBundle.schemas["review-local-prepare-envelope"],
    );
    expect(frontlineEnvelope).toContain('"$ref":"review-routing-facts.schema.json"');
    expect(frontlineEnvelope).toContain('"frontlineReview":{"type":"object"');
    expect(frontlineEnvelope).toContain(
      '"required":["schemaVersion","semanticsVersion","action","reasons","source","maxPasses","promptText"]',
    );
    expect(localPrepareEnvelope).toContain('"request":{"$ref":"review-request.schema.json"}');
    expect(localPrepareEnvelope).toContain('"reviewerPayload":{"type":"object"');
    expect(localPrepareEnvelope).toContain(
      '"required":["schemaVersion","reviewRoot","diffBaseSha","headSha","sourceRef","sourceDigest",'
      + '"guidance","guidanceDigest","reviewerInstructions"]',
    );
    expect(firstBundle.schemas["work-unit-review-assurance"]?.properties?.reviewRubric)
      .toEqual({ $ref: "review-rubric-overlay-resolution.schema.json" });
    expect(serializeKernelSchemaBundle(projectKernelSchemas(second)))
      .toBe(serializeKernelSchemaBundle(firstBundle));
  });

  it("serializes identical bytes and ids across opposite registration orders", () => {
    const alpha = z.object({ value: z.string() });
    const beta = z.object({ count: z.number() });
    const forward = createRegistry();
    forward.register(alpha, strict("alpha"));
    forward.register(beta, strict("beta"));
    const reverse = createRegistry();
    reverse.register(beta, strict("beta"));
    reverse.register(alpha, strict("alpha"));

    const forwardBytes = serializeKernelSchemaBundle(projectKernelSchemas(forward));
    const reverseBytes = serializeKernelSchemaBundle(projectKernelSchemas(reverse));
    expect(reverseBytes).toBe(forwardBytes);
    expect(forwardBytes.endsWith("\n")).toBe(true);
    expect(JSON.parse(forwardBytes)).toMatchObject({
      schemas: {
        alpha: { $id: "alpha.schema.json" },
        beta: { $id: "beta.schema.json" },
      },
    });
  });

  it("creates the artifact directory and atomically publishes exact bytes", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "arc-kernel-schema-"));
    temporaryRoots.push(outDir);
    const renames: Array<readonly [string, string]> = [];

    const finalPath = await writeKernelSchemaArtifact({
      outDir,
      fileSystem: {
        mkdir,
        writeFile,
        rename: async (temporaryPath, destinationPath) => {
          renames.push([temporaryPath, destinationPath]);
          await rename(temporaryPath, destinationPath);
        },
        unlink,
      },
    });

    const expected = serializeKernelSchemaBundle(projectKernelSchemas());
    expect(finalPath).toBe(join(outDir, "schemas", "kernel.json"));
    expect(await readFile(finalPath, "utf8")).toBe(expected);
    expect(await readdir(dirname(finalPath))).toEqual(["kernel.json"]);
    expect(renames).toHaveLength(1);
    expect(dirname(renames[0]?.[0] ?? "")).toBe(dirname(finalPath));
    expect(renames[0]?.[1]).toBe(finalPath);
  });

  it("removes a partial temporary write when generation fails", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "arc-kernel-schema-failure-"));
    temporaryRoots.push(outDir);

    await expect(writeKernelSchemaArtifact({
      outDir,
      fileSystem: {
        mkdir,
        writeFile: async (path, data, encoding) => {
          await writeFile(path, data, encoding);
          throw new Error("disk full");
        },
        rename,
        unlink,
      },
    })).rejects.toThrow("disk full");

    expect(await readdir(join(outDir, "schemas"))).toEqual([]);
  });
});
