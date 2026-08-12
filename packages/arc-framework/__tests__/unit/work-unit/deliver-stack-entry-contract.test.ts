import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const WORKFLOWS = [
  join(ROOT, "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md"),
  join(ROOT, ".arc/system/workflows/arc/supplemental/deliver-stack.md"),
];

describe("delivery discovered-entry workflow", () => {
  it.each(WORKFLOWS)("dispatches only the typed route and precomposed text in %s", async (path) => {
    const content = await readFile(path, "utf8");
    for (const route of [
      "not-applicable", "authoring-required", "canonicalize-provisional",
      "validate-canonical", "resume-bound", "refused",
    ]) expect(content).toContain(`\`${route}\``);

    expect(content).toContain("Render `laterEntryCostText` and `recommendedActionText` verbatim when present");
    expect(content).toContain("`refused` stops before every eligibility or mutation verb");
    expect(content).toContain("never parses headings, derives members, or re-decides cohesion");
  });

  it("keeps the package and installed workflow byte-identical", async () => {
    const [packaged, installed] = await Promise.all(WORKFLOWS.map((path) => readFile(path, "utf8")));
    expect(installed).toBe(packaged);
  });
});
