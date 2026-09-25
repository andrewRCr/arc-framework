import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createRegistry,
  type KernelSchemaMeta,
} from "../../../src/lib/kernel/index.js";
import {
  projectKernelSchemas,
  serializeKernelSchemaBundle,
  writeKernelSchemaArtifact,
} from "../../../src/lib/kernel/schema/generate.js";
import { createProductionSchemaRegistry } from "../../../src/production-schema-registry.js";
import { PRODUCTION_SCHEMA_IDS } from "../../helpers/schema-artifact.js";

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
