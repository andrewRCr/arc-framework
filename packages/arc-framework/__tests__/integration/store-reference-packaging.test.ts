/** Production package metadata excludes the test-only storage reference backend. */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceBundleInputs, type ReferenceMetafile } from "../helpers/store/ship-guard.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const referenceRoot = join(packageRoot, "__tests__/helpers/store");

describe("reference backend package output", () => {
  it("contains no reference backend in the actual package build metadata", async () => {
    const metafile = JSON.parse(await readFile(join(packageRoot, "dist/metafile-esm.json"), "utf8")) as ReferenceMetafile;
    expect(referenceBundleInputs(metafile, packageRoot, referenceRoot)).toEqual([]);
  });
});
