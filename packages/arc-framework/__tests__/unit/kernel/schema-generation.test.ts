import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createRegistry,
  type KernelSchemaMeta,
} from "../../../src/lib/kernel/index.js";
import {
  projectKernelSchemas,
  serializeKernelSchemaBundle,
} from "../../../src/lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";
import { PRODUCTION_SCHEMA_IDS } from "../../helpers/production-schema-ids.js";

/** Timeout for measured repository scans on slower hosted runners. */
const REPOSITORY_SCAN_TIMEOUT = 10_000;

const strict = (id: string): KernelSchemaMeta => ({ id, version: 1, migrationPosture: "strict-current" });

describe("kernel schema projection", () => {
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
    const first = createProductionSchemaRegistry();
    const second = createProductionSchemaRegistry();
    const firstBundle = projectKernelSchemas(first);

    expect(Object.keys(firstBundle.schemas)).toEqual(PRODUCTION_SCHEMA_IDS);
    for (const [id, schema] of Object.entries(firstBundle.schemas)) {
      expect(schema.$id).toBe(`${id}.schema.json`);
    }
    expect(JSON.stringify(firstBundle.schemas["canonical-change-set"]))
      .toContain('"$ref":"canonical-change.schema.json"');
    expect(firstBundle.schemas["finding-classification"]?.properties?.severity)
      .toEqual({ $ref: "review-severity.schema.json" });
    expect(firstBundle.schemas["review-severity"]?.enum)
      .toEqual(["critical", "major", "minor"]);
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
  }, REPOSITORY_SCAN_TIMEOUT);

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

});
