import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
      "correction-routing-required", "refused",
    ]) expect(content).toContain(`\`${route}\``);

    expect(content).toContain("Render `laterEntryCostText` and `recommendedActionText` verbatim when present");
    expect(content).toContain("invokes `publicationAction.command` unchanged before reading position");
    expect(content).toContain("`planned / terminal-authoring`");
    expect(content).toContain("`refused` stops before every eligibility or mutation verb");
    expect(content).toContain("never parses headings, derives members, or re-decides cohesion");
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
    const inspect = packaged.indexOf("arc delivery entry inspect --input - --json");
    const implementation = packaged.indexOf("**One task at a time:**");
    expect(inspect).toBeGreaterThan(-1);
    expect(inspect).toBeLessThan(implementation);
    expect(packaged).toContain('{"entryMode":"execution"}');
    expect(packaged).toMatch(
      /correction-routing-required[\s\S]*selectedDeliverableId[\s\S]*entryMode[\s\S]*plan-review-fix/iu,
    );
    expect(packaged).toMatch(
      /resume-bound[\s\S]*read-position-and-reconcile[\s\S]*rerun the entry inspection/iu,
    );
  });
});
