import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { indexOfSoftWrappedProse, softWrappedProse } from "../../helpers/soft-wrapped-prose.js";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..", "..");
const WORKFLOWS = [
  join(ROOT, "packages/arc-framework/arc/system/workflows/arc/supplemental/deliver-stack.md"),
  join(ROOT, ".arc/system/workflows/arc/supplemental/deliver-stack.md"),
];
const TASK_LOOPS = [
  join(ROOT, "packages/arc-framework/arc/system/workflows/arc/process-task-loop.template.md"),
  join(ROOT, ".arc/system/workflows/arc/process-task-loop.md"),
];

describe("delivery discovered-entry workflow", () => {
  it.each(WORKFLOWS)("dispatches only the typed route and precomposed text in %s", async (path) => {
    const content = await readFile(path, "utf8");
    for (const route of [
      "not-applicable", "authoring-required", "canonicalize-provisional",
      "validate-canonical", "continue-publication", "resume-bound",
      "correction-routing-required", "review-fix-verification-required", "refused",
    ]) expect(content).toContain(`\`${route}\``);

    expect(content).toMatch(softWrappedProse("Render `laterEntryCostText` and `recommendedActionText` verbatim when present"));
    expect(content).toMatch(softWrappedProse("invokes `publicationAction.command` unchanged before reading position"));
    expect(content).toContain("`authoring-required / author-correction`");
    expect(content).toContain("arc delivery review-fix continue -");
    expect(content).toMatch(softWrappedProse("`refused` stops before every eligibility or mutation verb"));
    expect(content).toMatch(softWrappedProse("never parses headings, derives members, or re-decides cohesion"));

    const continuationStart = indexOfSoftWrappedProse(content, "Before authoring or publishing any approved correction");
    const continuationEnd = content.indexOf("### Complete a review-fix verification continuation");
    expect(continuationStart).toBeGreaterThan(-1);
    expect(continuationEnd).toBeGreaterThan(continuationStart);
  });

  it("keeps the package and installed workflow byte-identical", async () => {
    const [packaged, installed] = await Promise.all(WORKFLOWS.map((path) => readFile(path, "utf8")));
    expect(installed).toBe(packaged);
  });

  it("routes bound correction entry before task implementation from both shipped task loops", async () => {
    const contents = await Promise.all(TASK_LOOPS.map((path) => readFile(path, "utf8")));
    const packaged = contents[0]!;
    const installed = contents[1]!;
    expect(installed).toBe(packaged);
    const inspect = packaged.indexOf("arc delivery entry inspect -");
    const implementation = packaged.indexOf("**One task at a time:**");
    expect(inspect).toBeGreaterThan(-1);
    expect(inspect).toBeLessThan(implementation);
    expect(packaged).toContain('{"entryMode":"execution"}');
    expect(packaged).toMatch(
      /correction-routing-required[\s\S]*review-fix-verification-required[\s\S]*review-fix continue/iu,
    );
    expect(packaged).toMatch(/resume-bound[\s\S]*review-fix continue/iu);
  });
});
