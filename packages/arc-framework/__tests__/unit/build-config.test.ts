import { describe, expect, it } from "vitest";

import { baseOptions } from "../../tsup.config.js";
import { fastOptions } from "../../tsup.fast.config.js";

describe("runtime-only build options", () => {
  it("regenerates the esbuild metafile", () => {
    // The stamp is computed over the metafile's input graph. Left stale, the stamp and the live
    // hash agree over an outdated graph, so a newly bundled source file is invisible to both sides
    // of the comparison and edits to it read fresh.
    expect(fastOptions.metafile).toBe(true);
  });

  it("cleans the output directory", () => {
    expect(fastOptions.clean).toBe(true);
  });

  it("runs the same success hook as the full build", () => {
    // Identity, not equivalence: a restated hook is free to drift from the one that writes the
    // kernel schema artifact and the content-hash stamp.
    expect(fastOptions.onSuccess).toBe(baseOptions.onSuccess);
  });

  it("overrides declaration emit alone", () => {
    expect(Object.keys(fastOptions).sort()).toEqual(Object.keys(baseOptions).sort());

    const diverged = (Object.keys(baseOptions) as (keyof typeof baseOptions)[]).filter(
      (key) => fastOptions[key] !== baseOptions[key],
    );

    expect(diverged).toEqual(["dts"]);
    expect(fastOptions.dts).toBe(false);
  });
});
