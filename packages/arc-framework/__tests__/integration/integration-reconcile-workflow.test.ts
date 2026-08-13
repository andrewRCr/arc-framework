/** Structural contract for the current-WU checkpoint, reconcile, and merge spine. */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOWS = [
  join(
    ROOT,
    "packages",
    "arc-framework",
    "arc",
    "system",
    "workflows",
    "arc",
    "work-unit-lifecycle",
    "integrate-work-unit.md",
  ),
  join(ROOT, ".arc", "system", "workflows", "arc", "work-unit-lifecycle", "integrate-work-unit.md"),
];

describe("integration current-WU reconcile workflow", () => {
  it.each(WORKFLOWS)("orders typed procedures around the final integration interlock in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const start = content.indexOf("### 13) Behind-base reconcile gate and merge");
    const end = content.indexOf("### 14) Post-merge worktree cleanup", start);
    const step = content.slice(start, end);
    const orderedSurfaces = [
      "arc integrate checkpoint {name} --json",
      "arc base merge --expected-base {payload.safety.baseOid} --json",
      "arc review change-request resolve --head-ref {type}/{name} --head-sha {head-sha} --json",
      "arc review status --target '{targetRef}' --json",
      "arc wu reconcile {name} --apply --json",
      "payload.interlockSurface.machineEvidence.text",
      "**Extension report** · `#pre-merge`",
      "`integration-interlock`:",
      "arc integrate merge {name} --checkpoint {payload.checkpointHandle} --json",
    ];

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    let previous = -1;
    for (const surface of orderedSurfaces) {
      const current = step.indexOf(surface);
      expect(current, surface).toBeGreaterThan(previous);
      previous = current;
    }

    expect(step.match(/repeat the Step 3 push extension contract/giu)).toHaveLength(2);
    expect(step.match(/`push-interlock` release/gu)).toHaveLength(2);
    expect(step.match(/`commit-interlock` release/gu)).toHaveLength(1);
    expect(step).toContain("review-applicability\njudgment");
    expect(step).toMatch(/`pending`[\s\S]*requires direction/u);

    for (const invariant of [
      "Clearance never carries.",
      "Advisory receipts are not merge authority.",
      "The integration interlock is the sole merge authority.",
    ]) {
      expect(step.split(invariant)).toHaveLength(2);
    }

    for (const retiredMechanic of [
      "arc base drift --json",
      "git merge --no-edit",
      "arc status {name} --json",
      "arc merge lock release -",
      "gh pr merge",
    ]) {
      expect(step).not.toContain(retiredMechanic);
    }
  });
});
