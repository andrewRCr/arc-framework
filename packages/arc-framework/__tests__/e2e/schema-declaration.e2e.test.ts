/** Installed editor-schema validation against the repository's authored checks. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";
import { dump, load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { editorDocumentReference } from "../../src/lib/schema-command/editor-documents.js";
import { cleanupTempDir, createTempRepo, runArc } from "./helpers.js";

const declarationPath = fileURLToPath(new URL("../../../../.arc/system/arc-checks.yml", import.meta.url));
const documentPath = ".arc/system/.internal/schemas/check-declaration.schema.json";

describe("installed check-declaration editor schema", () => {
  let root: string;
  beforeEach(async () => { root = await createTempRepo(); });
  afterEach(async () => { await cleanupTempDir(root); });

  async function installedValidator() {
    await mkdir(join(root, ".arc/system"), { recursive: true });
    const result = await runArc(["schema", "install", "--json"], root);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ status: "ok", documents: [documentPath] });
    const document = JSON.parse(await readFile(join(root, documentPath), "utf8")) as AnySchema;
    return new Ajv2020({ strict: true, allErrors: true }).compile(document);
  }

  it("accepts this repository's declaration", async () => {
    const validator = await installedValidator();
    const declaration = load(await readFile(declarationPath, "utf8"));
    expect(validator(declaration), JSON.stringify(validator.errors)).toBe(true);
  });

  it.each(["top level", "check", "shards"])("rejects an unknown key at the %s in the editor and CLI", async (locus) => {
    const validator = await installedValidator();
    const declaration = {
      checks: { verify: {
        command: [process.execPath, "--version"],
        ...(locus === "check" ? { unexpected: true } : {}),
        shards: { count: 2, argument: "--shard={index}", ...(locus === "shards" ? { unexpected: true } : {}) },
      } },
      ...(locus === "top level" ? { unexpected: true } : {}),
    };
    expect(validator(declaration)).toBe(false);
    expect(validator.errors).toContainEqual(expect.objectContaining({
      keyword: "additionalProperties", params: { additionalProperty: "unexpected" },
    }));
    await writeFile(join(root, ".arc/system/arc-checks.yml"), dump(declaration));
    const refused = await runArc(["check", "gate", "merge", "--dry-run", "--json"], root);
    expect(refused.exitCode, refused.stderr).toBe(2);
    expect(JSON.parse(refused.stdout).error.message).toContain("unexpected");
  });

  it("opens the repository declaration with its editor document reference", async () => {
    const firstLine = (await readFile(declarationPath, "utf8")).split(/\r?\n/u)[0];
    expect(editorDocumentReference("check-declaration", ".arc/system/arc-checks.yml"))
      .toEqual({ status: "found", reference: firstLine });
  });
});
