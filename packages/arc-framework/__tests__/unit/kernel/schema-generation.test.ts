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

const temporaryRoots: string[] = [];
const strict = (id: string): KernelSchemaMeta => ({ id, version: 1, migrationPosture: "strict-current" });

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kernel schema artifact generation", () => {
  it("projects the built-in schema map without touching disk", () => {
    expect(Object.keys(projectKernelSchemas().schemas)).toEqual([
      "priority",
      "slug",
      "work-class",
      "work-unit-state",
    ]);
  });

  it("projects the composed review family with stable references and bytes", () => {
    const first = registerReviewDomainSchemas(createKernelRegistry());
    const second = registerReviewDomainSchemas(createKernelRegistry());
    const firstBundle = projectKernelSchemas(first);

    expect(Object.keys(firstBundle.schemas)).toEqual([
      "canonical-change",
      "canonical-change-set",
      "change-path-fact",
      "change-path-set",
      "finding-classification",
      "finding-disposition",
      "independent-analysis-contract",
      "independent-analysis-obligation-projection",
      "priority",
      "project-routing-promotion",
      "review-assurance-input",
      "review-method-activity",
      "review-request",
      "review-request-id-preimage",
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
    expect(JSON.stringify(firstBundle.schemas["canonical-change-set"]))
      .toContain('"$ref":"canonical-change.schema.json"');
    expect(firstBundle.schemas["finding-classification"]?.properties?.severity)
      .toEqual({ $ref: "review-severity.schema.json" });
    expect(firstBundle.schemas["review-routing-facts"]?.properties?.activity)
      .toEqual({ $ref: "review-method-activity.schema.json" });
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
