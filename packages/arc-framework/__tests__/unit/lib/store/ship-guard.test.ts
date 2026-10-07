/** Architecture guards for the test-only whole-contract reference backend. */

import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { referenceBundleInputs, type ReferenceMetafile } from "../../../helpers/store/ship-guard.js";

const packageRoot = resolve(import.meta.dirname, "../../../..");
const referenceRoot = join(packageRoot, "__tests__/helpers/store");
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
