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
    expect(packaged).toContain("arc delivery rematerialize");
    expect(packaged).not.toContain("arc delivery rewrite --input");
    expect(packaged).toContain("arc delivery terminal prepare");
    expect(packaged).toContain("arc delivery teardown");
    expect(packaged).toContain("arc delivery native link");
    expect(packaged).toContain("arc delivery native observe");
    expect(packaged).toContain("arc delivery native unlink");
    expect(packaged).toContain("arc delivery native land-select");
    expect(packaged).toContain("arc delivery native land-prepare");
    expect(packaged).toContain("arc delivery native land-submit");
    expect(packaged).toContain("arc delivery native land-status");
    expect(packaged).toContain("opt-out `unlinked` result makes zero native host calls");
    expect(packaged).toMatch(/opt-out[\s\S]*zero native host calls/iu);
    expect(packaged).toMatch(/native unlink[\s\S]*fresh `unlinked`[\s\S]*ordinary singleton/iu);
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
    const nativeObserve = packaged.indexOf("arc delivery native observe");
    const nativeSelect = packaged.indexOf("arc delivery native land-select", nativeObserve);
    const nativeUnlink = packaged.indexOf("arc delivery native unlink", nativeSelect);
    const nativePrepare = packaged.indexOf("arc delivery native land-prepare", nativeSelect);
    const nativeInterlock = packaged.indexOf("`integration-interlock`", nativePrepare);
    const nativeSubmit = packaged.indexOf("arc delivery native land-submit", nativeInterlock);
    const nativeStatus = packaged.indexOf("arc delivery native land-status", nativeSubmit);
    expect(nativeObserve).toBeLessThan(nativeSelect);
    expect(nativeSelect).toBeLessThan(nativeUnlink);
    expect(nativeSelect).toBeLessThan(nativePrepare);
    expect(nativePrepare).toBeLessThan(nativeInterlock);
    expect(nativeInterlock).toBeLessThan(nativeSubmit);
    expect(nativeSubmit).toBeLessThan(nativeStatus);
    expect(packaged).toMatch(/exact member\/head set[\s\S]*residual race/iu);
    expect(packaged).toMatch(/pending[\s\S]*restart[\s\S]*land-status/iu);
    expect(packaged).toMatch(/none-landed[\s\S]*new\s+interlock/iu);
    expect(packaged).toMatch(/partial-landed[\s\S]*stop/iu);
    expect(packaged).toMatch(/linked-single[\s\S]*contribution proof[\s\S]*new-head review/iu);
    expect(packaged).toMatch(/The terminal\s+member is never included/u);
  });
});
