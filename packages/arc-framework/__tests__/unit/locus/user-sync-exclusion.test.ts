/** Machine-local locus files never enter portable user-note manifests. */

import { describe, expect, it } from "vitest";

import { serialize } from "../../../src/lib/git/user-sync.js";

describe("locus user-sync exclusion", () => {
  it("excludes every descendant of the dot-prefixed internal root", async () => {
    let reads = 0;
    const result = await serialize(
      "/repo/.arc/user/andrew",
      async () => [
        { name: "WORKING-MEMORY.md", size: 4 },
        { name: `.internal/loci/locus-${"a".repeat(64)}.json`, size: 4 },
      ],
      async (path) => {
        reads += 1;
        return path.endsWith("WORKING-MEMORY.md") ? "safe" : "machine-local";
      },
    );
    expect(result.manifest.files).toEqual({ "WORKING-MEMORY.md": "safe" });
    expect(reads).toBe(1);
  });
});

