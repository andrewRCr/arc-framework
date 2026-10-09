/** Built-CLI discovery of registered contracts outside an ARC project. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProductionSchemaRegistry } from "../../src/production-schema-registry.js";
import {
  SchemaGetEnvelopeSchema, SchemaListEnvelopeSchema, SchemaRefusalEnvelopeSchema,
} from "../../src/lib/schema-command/envelope.js";
import { runArc } from "./helpers.js";

describe("arc schema discovery", () => {
  let cwd: string;
  beforeEach(async () => { cwd = await mkdtemp(join(tmpdir(), "arc-schema-")); });
  afterEach(async () => { await rm(cwd, { recursive: true, force: true }); });

  it("lists all identities and their metadata in plain and JSON output", async () => {
    const registry = createProductionSchemaRegistry();
    const plain = await runArc(["schema", "list"], cwd);
    expect(plain.exitCode, plain.stderr).toBe(0);
    expect(plain.stdout.trim().split(/\r?\n/u)).toEqual(registry.ids().map((id) => {
      const meta = registry.meta(id);
      return `${id} ${meta?.version} ${meta?.migrationPosture}`;
    }));
    const json = await runArc(["schema", "list", "--json"], cwd);
    expect(json.exitCode, json.stderr).toBe(0);
    const payload = SchemaListEnvelopeSchema.parse(JSON.parse(json.stdout));
    expect(payload).toEqual({ status: "ok", schemas: registry.ids().map((id) => ({
      id, version: registry.meta(id)?.version, migrationPosture: registry.meta(id)?.migrationPosture, editorDocument: null,
    })) });
    expect(json.stdout.trim().split("\n")).toHaveLength(1);
  });

  it("returns authored request and cut-map documents", async () => {
    for (const id of ["review-resolve-request", "decompose-cut-map"]) {
      const result = await runArc(["schema", "get", id], cwd);
      expect(result.exitCode, result.stderr).toBe(0);
      const payload = SchemaGetEnvelopeSchema.parse(JSON.parse(result.stdout));
      expect(payload).toMatchObject({ status: "ok", id, editorDocument: null,
        schema: { $id: `urn:arc:schema:${id}`, type: "object" } });
      if (id === "review-resolve-request") {
        expect(payload.schema.required).not.toContain("frontlineActive");
      }
      expect(result.stdout.trim().split("\n")).toHaveLength(1);
    }
  });

  it("refuses unknown identities with the command that lists valid ones", async () => {
    const result = await runArc(["schema", "get", "missing"], cwd);
    expect(result.exitCode).toBe(1);
    expect(SchemaRefusalEnvelopeSchema.parse(JSON.parse(result.stdout))).toEqual({
      status: "refused", reason: "unknown-schema-id", id: "missing", remedy: "arc schema list",
    });
    expect(result.stderr).toBe("");
  });

  it("rejects a JSON flag on the always-JSON get command", async () => {
    const result = await runArc(["schema", "get", "slug", "--json"], cwd);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("unknown option '--json'");
  });
});
