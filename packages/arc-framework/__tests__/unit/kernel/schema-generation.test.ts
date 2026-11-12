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
import { resolveSchemaReference } from "../../helpers/schema-reference.js";
import { PRODUCTION_SCHEMA_IDS } from "../../helpers/production-schema-ids.js";

/** Timeout for measured repository scans on slower hosted runners. */
const REPOSITORY_SCAN_TIMEOUT = 10_000;

const strict = (id: string): KernelSchemaMeta => ({ id, version: 1, migrationPosture: "strict-current" });

describe("kernel schema projection", () => {
  it("projects the built-in schema map without touching disk", () => {
    expect(Object.keys(projectKernelSchemas("output").schemas)).toEqual([
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
    const firstBundle = projectKernelSchemas("output", first);

    expect(first.ids()).toEqual(PRODUCTION_SCHEMA_IDS);
    expect(Object.keys(firstBundle.schemas)).toEqual([...PRODUCTION_SCHEMA_IDS, "__shared"]);
    for (const [id, schema] of Object.entries(firstBundle.schemas)) {
      expect(schema.$id).toBe(`urn:arc:schema:${id}`);
    }
    expect(JSON.stringify(firstBundle.schemas["canonical-change-set"]))
      .toContain('"$ref":"urn:arc:schema:canonical-change"');
    expect(firstBundle.schemas["finding-classification"]?.properties?.severity)
      .toEqual({ $ref: "urn:arc:schema:review-severity" });
    expect(firstBundle.schemas["review-severity"]?.enum)
      .toEqual(["critical", "major", "minor"]);
    expect(firstBundle.schemas["review-routing-facts"]?.properties?.activity)
      .toEqual({ $ref: "urn:arc:schema:review-method-activity" });
    const frontlinePayload = resolveSchemaReference(firstBundle,
      firstBundle.schemas["review-frontline-resolve-envelope"]?.anyOf?.[0]?.properties?.payload);
    const routing = resolveSchemaReference(firstBundle, frontlinePayload.properties?.routing);
    expect(JSON.stringify(routing)).toContain('"$ref":"urn:arc:schema:review-routing-facts"');
    const frontlineReview = resolveSchemaReference(firstBundle, frontlinePayload.properties?.frontlineReview);
    expect(frontlineReview.type).toBe("object");
    expect(frontlineReview.required).toEqual([
      "schemaVersion", "semanticsVersion", "action", "reasons", "source", "maxPasses", "promptText",
    ]);
    const localPreparePayload = resolveSchemaReference(firstBundle,
      firstBundle.schemas["review-local-prepare-envelope"]?.anyOf
        ?.find((variant) => resolveSchemaReference(firstBundle, variant.properties?.state).const === "ready")?.properties?.payload);
    expect(localPreparePayload.properties?.request).toEqual({ $ref: "urn:arc:schema:review-request" });
    const reviewerPayload = resolveSchemaReference(firstBundle, localPreparePayload.properties?.reviewerPayload);
    expect(reviewerPayload.type).toBe("object");
    expect(reviewerPayload.required).toEqual([
      "schemaVersion", "reviewRoot", "diffBaseSha", "headSha", "sourceRef", "sourceDigest",
      "guidance", "guidanceDigest", "reviewerInstructions",
    ]);
    expect(firstBundle.schemas["work-unit-review-assurance"]?.properties?.reviewRubric)
      .toEqual({ $ref: "urn:arc:schema:review-rubric-overlay-resolution" });
    expect(serializeKernelSchemaBundle(projectKernelSchemas("output", second)))
      .toBe(serializeKernelSchemaBundle(firstBundle));
  }, REPOSITORY_SCAN_TIMEOUT);

  it("serializes identical bytes and ids across opposite registration orders", () => {
    const shared = z.object({ value: z.string() });
    const alpha = z.object({ value: shared });
    const beta = z.object({ count: shared });
    const forward = createRegistry();
    forward.register(alpha, strict("alpha"));
    forward.register(beta, strict("beta"));
    const reverse = createRegistry();
    reverse.register(beta, strict("beta"));
    reverse.register(alpha, strict("alpha"));

    const forwardBytes = serializeKernelSchemaBundle(projectKernelSchemas("output", forward));
    const reverseBytes = serializeKernelSchemaBundle(projectKernelSchemas("output", reverse));
    expect(reverseBytes).toBe(forwardBytes);
    expect(forwardBytes.endsWith("\n")).toBe(true);
    expect(JSON.parse(forwardBytes)).toMatchObject({
      schemas: {
        alpha: { $id: "urn:arc:schema:alpha" },
        beta: { $id: "urn:arc:schema:beta" },
      },
    });
  });

});
