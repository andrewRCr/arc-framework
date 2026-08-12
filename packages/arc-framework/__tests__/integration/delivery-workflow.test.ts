import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyFile } from "../../src/lib/classification.js";

const root = resolve(import.meta.dirname, "../../../..");

describe("packaged delivery workflow", () => {
  it("ships one framework-owned workflow with closed prepare/interlock/apply ordering", async () => {
    const [packaged, installed, recipe] = await Promise.all([
      readFile(resolve(root, "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(root, ".arc/system/workflows/arc/supplemental/deliver-stack.md"), "utf8"),
      readFile(resolve(root, "packages/arc-framework/init-recipe.json"), "utf8"),
    ]);
    expect(installed).toBe(packaged);
    expect(JSON.parse(recipe).include_files).toContain("system/workflows/arc/supplemental/deliver-stack.md");
    expect(classifyFile("system/workflows/arc/supplemental/deliver-stack.md")).toBe("Framework");
    expect(packaged).toContain("arc delivery eligibility prepare");
    expect(packaged).toContain("arc delivery materialize");
    expect(packaged).toContain("arc delivery land prepare");
    expect(packaged).toContain("arc delivery land apply");
    expect(packaged).toContain("arc delivery reconcile");
    expect(packaged).toContain("arc delivery rewrite");
    expect(packaged).toContain("arc delivery teardown");
    expect(packaged).toContain("arc delivery native link");
    expect(packaged).toContain("arc delivery native observe");
    expect(packaged).toContain("`unlinked` makes no native call");
    expect(packaged).toContain("never enters the delivery plan or state");
    expect(packaged).toContain("integrate-work-unit.md");
    const prepare = packaged.indexOf("arc delivery land prepare");
    const interlock = packaged.indexOf("`integration-interlock`", prepare);
    const apply = packaged.indexOf("arc delivery land apply", interlock);
    expect(prepare).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(apply);
    expect(packaged.slice(apply)).toMatch(/retryable[\s\S]*prepare[\s\S]*new integration interlock/iu);
    expect(packaged).toMatch(/delivery-member[\s\S]*planId[\s\S]*deliverableId[\s\S]*workUnitSlug/u);
    expect(packaged).not.toMatch(/if\s+.*(?:state|status)\s*==/iu);
  });
});
