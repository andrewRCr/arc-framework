import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

describe("delivery lifecycle composition ownership", () => {
  it("keeps planning, private review, and terminal checkpoint composition in their lifecycle phases", async () => {
    const [generate, prepare, integrate] = await Promise.all([
      readFile(join(ROOT, "packages/arc-framework/arc/system/workflows/arc/generate-tasks.template.md"), "utf8"),
      readFile(join(
        ROOT,
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/prepare-work-unit.md",
      ), "utf8"),
      readFile(join(
        ROOT,
        "packages/arc-framework/arc/system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
      ), "utf8"),
    ]);

    expect(generate.match(/unmarked provisional `## Delivery Plan`/gu)).toHaveLength(1);
    expect(prepare.match(/arc review chunking resolve -/gu)).toHaveLength(1);
    expect(prepare.indexOf("arc review chunking resolve -")).toBeLessThan(prepare.indexOf("arc publish {name}"));
    expect(integrate.match(/arc review chunking resolve -/gu)).toHaveLength(1);
    const phaseTwo = integrate.indexOf("## Phase 2");
    expect(phaseTwo).toBeGreaterThan(0);
    for (const match of integrate.matchAll(/arc review chunking resolve -/gu)) {
      expect(match.index).toBeGreaterThan(phaseTwo);
    }

    expect(integrate).not.toContain("arc delivery terminal attach");
    const checkpoint = integrate.indexOf("arc integrate checkpoint {name}");
    expect(checkpoint).toBeGreaterThan(phaseTwo);
    expect(checkpoint).toBeLessThan(integrate.indexOf("arc user close", checkpoint));
  });
});
