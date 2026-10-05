/** Architecture guards for the test-only whole-contract reference backend. */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { referenceBundleInputs, referenceImportViolations, type ReferenceMetafile } from "../../../helpers/store/ship-guard.js";

const packageRoot = resolve(import.meta.dirname, "../../../..");
const referenceRoot = join(packageRoot, "__tests__/helpers/store");
const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function importFixture(statement: string): Promise<{ source: string; backend: string }> {
  const root = await mkdtemp(join(tmpdir(), "arc-reference-boundary-"));
  temporaryRoots.push(root);
  const source = join(root, "src");
  const backend = join(root, "__tests__/helpers/store");
  await Promise.all([mkdir(source, { recursive: true }), mkdir(backend, { recursive: true })]);
  await writeFile(join(backend, "reference-backend.ts"), "export const backend = {};\n");
  await writeFile(join(source, "consumer.ts"), statement);
  return { source, backend };
}

describe("reference backend import boundary", () => {
  it("finds no production import into the test-only reference backend", () => {
    expect(referenceImportViolations(join(packageRoot, "src"), referenceRoot)).toEqual([]);
  });

  it.each([
    "import { backend } from '../__tests__/helpers/store/reference-backend.js';",
    "export { backend } from '../__tests__/helpers/store/reference-backend.js';",
    "const backend = import('../__tests__/helpers/store/reference-backend.js');",
    "type Backend = typeof import('../__tests__/helpers/store/reference-backend.js');",
    "const backend = require('../__tests__/helpers/store/reference-backend.js');",
  ])("rejects a planted production import: %s", async (statement) => {
    const fixture = await importFixture(statement);
    expect(referenceImportViolations(fixture.source, fixture.backend)).toEqual([
      { file: "consumer.ts", specifier: "../__tests__/helpers/store/reference-backend.js" },
    ]);
  });

  it("accepts a similarly named directory outside the reference root", async () => {
    const fixture = await importFixture("import '../__tests__/helpers/store-other/backend.js';");
    expect(referenceImportViolations(fixture.source, fixture.backend)).toEqual([]);
  });
});

describe("reference backend build output", () => {
  it.each(["raw", "output"] as const)("rejects a planted %s input even when it is outside src", (location) => {
    const input = "__tests__/helpers/store/reference-backend.ts";
    const metafile: ReferenceMetafile = {
      inputs: location === "raw" ? { [input]: {} } : {},
      outputs: { "dist/cli.js": { inputs: location === "output" ? { [input]: {} } : {} } },
    };
    expect(referenceBundleInputs(metafile, packageRoot, referenceRoot)).toEqual([input]);
  });

  it("checks every output and accepts ordinary production inputs", () => {
    const input = "__tests__/helpers/store/reference-backend.ts";
    const metafile: ReferenceMetafile = {
      inputs: { "src/cli.ts": {} },
      outputs: { "dist/cli.js": { inputs: { "src/cli.ts": {} } }, "dist/lib.js": { inputs: { [input]: {} } } },
    };
    expect(referenceBundleInputs(metafile, packageRoot, referenceRoot)).toEqual([input]);
  });

});
