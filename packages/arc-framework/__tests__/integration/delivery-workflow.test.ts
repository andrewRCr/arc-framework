import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyFile } from "../../src/lib/classification.js";

const root = resolve(import.meta.dirname, "../../../..");

function section(document: string, heading: string): string {
  const start = document.indexOf(`## ${heading}`);
  if (start < 0) throw new Error(`missing workflow section: ${heading}`);
  const end = document.indexOf("\n## ", start + 3);
  return document.slice(start, end < 0 ? undefined : end);
}

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
    expect(packaged).toContain("refs/arc/delivery-candidates/{planId}/{chunkKey}");
    expect(packaged).toContain("use detached worktrees for project gates");
    expect(packaged).not.toContain("refs/heads/cut/");
    expect(packaged).not.toContain("arc delivery materialize");
    expect(packaged).toContain("arc delivery land prepare");
    expect(packaged).toContain("arc delivery land apply");
    expect(packaged).toContain("arc delivery reconcile");
    expect(packaged).toContain("arc delivery rematerialize");
    expect(packaged).not.toContain("arc delivery rewrite");
    expect(packaged).not.toContain("arc delivery terminal prepare");
    expect(packaged).toContain("arc delivery teardown");
    expect(packaged).toContain("arc delivery top-remedy");
    expect(packaged).toContain("arc delivery native link");
    expect(packaged).toContain("arc delivery native observe");
    expect(packaged).toContain("arc delivery native unlink");
    expect(packaged).toContain("arc delivery native land-select");
    expect(packaged).toContain("arc delivery native land-prepare");
    expect(packaged).toContain("arc delivery native land-submit");
    expect(packaged).toContain("arc delivery native land-status");
    expect(packaged).toContain("opt-out `unlinked` result makes zero native host calls");
    const materializeSection = section(packaged, "Validate and publish");
    const nativeSection = section(packaged, "Select and execute the native landing arm");
    const reviewSection = section(packaged, "Review and land the current member");
    const terminalSection = section(packaged, "Terminal handoff");
    const terminalTail = packaged.slice(packaged.indexOf("arc delivery teardown"));
    const recoverySection = materializeSection.slice(
      materializeSection.indexOf("After interruption"),
      materializeSection.indexOf("Only after every request ID exists"),
    );
    expect(materializeSection).toMatch(/opt-out[\s\S]*zero native host calls/iu);
    expect(materializeSection).toContain("terminalPresentation");
    expect(materializeSection.indexOf("terminalPresentation")).toBeLessThan(
      materializeSection.indexOf("arc delivery publish"),
    );
    expect(materializeSection.indexOf("arc delivery publish")).toBeLessThan(
      materializeSection.indexOf("arc delivery native link"),
    );
    expect(materializeSection).toMatch(/every member ref[\s\S]*before[\s\S]*request/iu);
    expect(nativeSection).toMatch(/native unlink[\s\S]*fresh `unlinked`[\s\S]*ordinary singleton/iu);
    expect(nativeSection).not.toContain("only the plan, request, and remote locators");
    expect(packaged).toContain("never enters the delivery plan or state");
    expect(packaged).toContain("integrate-work-unit.md");
    const prepare = packaged.indexOf("arc delivery land prepare");
    const interlock = packaged.indexOf("`integration-interlock`", prepare);
    const apply = packaged.indexOf("arc delivery land apply", interlock);
    expect(prepare).toBeLessThan(interlock);
    expect(interlock).toBeLessThan(apply);
    expect(reviewSection).toMatch(/retryable[\s\S]*prepare[\s\S]*new integration interlock/iu);
    expect(reviewSection).toMatch(/delivery-member[\s\S]*planId[\s\S]*deliverableId[\s\S]*workUnitSlug/u);
    const rematerialize = reviewSection.indexOf("arc delivery rematerialize");
    const teardown = reviewSection.indexOf("arc delivery teardown", rematerialize);
    expect(rematerialize).toBeGreaterThanOrEqual(0);
    expect(teardown).toBeGreaterThan(rematerialize);
    const mutationTail = reviewSection.slice(rematerialize, teardown);
    expect(mutationTail).toContain("verify-review-fix");
    expect(mutationTail).toContain("validate-criteria");
    expect(mutationTail).toMatch(/memberDeliverableIds[\s\S]*contribution-equivalent[\s\S]*re-verifies nothing/iu);
    expect(mutationTail).toMatch(/tier1Required[\s\S]*Tier 1/iu);
    expect(mutationTail).toMatch(/same finding-disposition approval/iu);
    expect(mutationTail).not.toContain("`integration-interlock`");
    const reviewStart = packaged.indexOf("## Review and land the current member");
    const terminalStart = packaged.indexOf("## Terminal handoff", reviewStart);
    const teardownInDocument = packaged.indexOf("arc delivery teardown", reviewStart);
    expect(reviewStart).toBeGreaterThanOrEqual(0);
    expect(teardownInDocument).toBeGreaterThan(reviewStart);
    expect(terminalStart).toBeGreaterThan(teardownInDocument);
    expect(terminalTail).toMatch(/terminal-checkpoint[\s\S]*integrate-work-unit\.md/iu);
    expect(terminalTail).toMatch(/retarget[\s\S]*reopen-and-retarget/iu);
    expect(terminalTail).toMatch(/explicit[\s\S]*arc delivery top-remedy[\s\S]*terminal-checkpoint/iu);
    expect(recoverySection).toMatch(/applied \/ read-position[\s\S]*arc delivery position/iu);
    expect(recoverySection).not.toContain("retryable / read-position");
    for (const arm of [
      "retryable / cleared / delivery-publish` with `operationKind: materialize",
      "retryable / preserved / delivery-publish` with `operationKind: publish",
      "retryable / cleared / delivery-rematerialize` with `operationKind: rewrite` and `mode: review-fix",
      "retryable / cleared / delivery-native-observe` with `operationKind: rewrite` and",
      "retryable / cleared / delivery-land-prepare` with `operationKind: land` and `mode: sequential",
      "retryable / cleared / delivery-native-land-select` with `operationKind: land` and `mode: native",
      "retryable / preserved / delivery-teardown` with `operationKind: teardown",
      "retryable / cleared / delivery-top-remedy` with `operationKind: top-remedy",
    ]) {
      expect(recoverySection).toContain(arm);
    }
    expect(recoverySection).toMatch(/provider-adoption[\s\S]*arc delivery native observe/iu);
    expect(recoverySection).toMatch(
      /planId[\s\S]*operationId[\s\S]*affectedDeliverableIds[\s\S]*operationKind[\s\S]*narrow `mode`/u,
    );
    expect(recoverySection).toMatch(/workflow prose infers neither a selector nor a[\s\S]*recovery policy/iu);
    expect(recoverySection).toMatch(/unlisted action\/transition\/selector pairing[\s\S]*stops/iu);
    expect(reviewSection).toMatch(/teardown-member[\s\S]*selectedDeliverableId[\s\S]*arc delivery teardown/iu);
    expect(terminalSection).not.toContain("`integration-interlock`");
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
    expect(nativeSection).toMatch(/exact member\/head set[\s\S]*residual race/iu);
    expect(nativeSection).toMatch(/ordinary polling[\s\S]*land-status/iu);
    expect(nativeSection).toMatch(/restart or interruption[\s\S]*arc delivery reconcile/iu);
    expect(nativeSection).toMatch(/terminal `failed`[\s\S]*exact `none-landed`[\s\S]*new\s+interlock/iu);
    expect(nativeSection).toMatch(/partial-landed[\s\S]*stop/iu);
    expect(nativeSection).toMatch(/linked-single[\s\S]*contribution proof[\s\S]*new-head review/iu);
    expect(nativeSection).toMatch(/The terminal\s+member is never included/u);
  });
});
