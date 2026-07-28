import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(
  process.cwd(),
  "arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
), "utf8");
const projectWorkflow = readFileSync(resolve(
  process.cwd(),
  "../../.arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md",
), "utf8");

describe("decompose workflow contract", () => {
  it("orders the canonical verbs around one post-authoring distribution interlock", () => {
    const preflight = workflow.indexOf("--preflight");
    const execute = workflow.indexOf("--cut-map");
    const author = workflow.indexOf("## 4. Author every reported destination");
    const interlock = workflow.indexOf("`workflow-interlock`");
    const finalize = workflow.indexOf("--continuation");
    const handoff = workflow.indexOf("--handoff");

    expect([preflight, execute, author, interlock, finalize, handoff])
      .toEqual([...[preflight, execute, author, interlock, finalize, handoff]].sort((a, b) => a - b));
    expect(workflow.match(/`workflow-interlock`/gu)).toHaveLength(1);
  });

  it("keeps release modes exclusive and delegates mechanics and recovery to CLI facts", () => {
    expect(workflow).toContain("### Partial protection");
    expect(workflow).toContain("### Full protection");
    expect(workflow).toContain("Do not construct receipt JSON, digests, branches, worktrees, topology paths");
    expect(workflow).toContain("render only the typed recovery result");
    expect(workflow).toContain("Do not reconstruct operands or commands");
    expect(workflow).toMatch(/does not launch\s+members/u);
  });

  it("contains no workflow-owned Git topology or branch/worktree mutation", () => {
    expect(workflow).not.toMatch(/\bgit (?:branch|checkout|switch|worktree|update-ref|write-tree)\b/iu);
    expect(workflow).not.toMatch(/\barc teardown\b/iu);
    expect(workflow).not.toContain("\"schemaVersion\"");
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
