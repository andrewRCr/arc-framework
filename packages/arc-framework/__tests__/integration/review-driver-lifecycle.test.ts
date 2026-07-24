import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const packageArc = resolve(root, "packages/arc-framework/arc");
const projectArc = resolve(root, ".arc");

const workflows = [
  "system/workflows/arc/work-unit-lifecycle/integrate-work-unit.md",
  "system/workflows/arc/supplemental/run-errand.md",
];

describe("lifecycle review driver", () => {
  it.each(workflows)("projects the same typed driver through %s", async (path) => {
    const [packaged, project] = await Promise.all([
      readFile(resolve(packageArc, path), "utf8"),
      readFile(resolve(projectArc, path), "utf8"),
    ]);
    expect(project).toBe(packaged);
    for (const command of [
      "arc review chunking resolve -",
      "arc review resolve -",
      "arc review hosted request -",
      "arc review hosted await -",
      "arc review hosted settle -",
    ]) expect(packaged).toContain(command);
    expect(packaged).toContain("review applicability");
    expect(packaged).toContain("targeted verification");
    expect(packaged).toContain("agent-selected supplemental review");
    expect(packaged).not.toContain("project review coordinator");
    expect(packaged).not.toContain("coordinate-pr-review");
  });

  it("combines WU convergence, exact-head unlock, and truthful review disclosure", async () => {
    const workflow = await readFile(
      resolve(packageArc, workflows[0] ?? ""),
      "utf8",
    );
    expect(workflow).toContain("arc review readiness -");
    expect(workflow).toContain("arc review unlock -");
    expect(workflow).toContain("Approve (or redirect)?");
    expect(workflow).toMatch(/runtime-owned bindings/i);
    expect(workflow).toContain("no-action record-only");
    expect(workflow).toContain("`Coverage`");
  });

  it("publishes a content-gated PR review record", async () => {
    const path = "reference/templates/arc/work-unit/template-pull-request.md";
    const [packaged, project] = await Promise.all([
      readFile(resolve(packageArc, path), "utf8"),
      readFile(resolve(projectArc, path), "utf8"),
    ]);
    expect(project).toBe(packaged);
    expect(packaged).toContain("## Review");
    expect(packaged).toContain("**Local:**");
    expect(packaged).toContain("**Hosted PR:**");
    expect(packaged).toContain("**Triage:**");
    expect(packaged).toContain("**Coverage:**");
    expect(packaged.replaceAll("\n> ", " ")).toContain(
      "Omit the whole section when no review ran",
    );
  });
});
