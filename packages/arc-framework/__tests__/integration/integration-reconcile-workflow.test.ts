/** Integration workflow contract for the final current-WU reconcile gate. */

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
  it.each(WORKFLOWS)("fails closed before the stable exact-head checkpoint in %s", async (path) => {
    const content = await readFile(path, "utf8");
    const step = content.slice(content.indexOf("### 13) Behind-base reconcile gate and merge"));
    const baseReconcile = step.indexOf("git merge --no-edit {baseOid}");
    const reconcile = step.indexOf("arc wu reconcile {name} --apply --json");
    const lifecycle = step.indexOf("arc status {name} --json");
    const authorization = step.indexOf("`integration-interlock`: Stop before merge");

    expect(baseReconcile).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(baseReconcile);
    expect(lifecycle).toBeGreaterThan(reconcile);
    expect(authorization).toBeGreaterThan(lifecycle);
    expect(step).toContain("`conflict` — including missing, ambiguous, corrupt, or");
    expect(step).toContain("restart Step 13 from the authoritative base-drift read");
    expect(step).toContain("Do not widen the review-readiness request");
  });
});
