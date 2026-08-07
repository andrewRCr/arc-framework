import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../../../arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);
const projectWorkflow = readFileSync(
  new URL("../../../../../.arc/system/workflows/arc/work-unit-lifecycle/decompose-work-unit.md", import.meta.url),
  "utf8",
);

describe("decompose workflow contract", () => {
  it("orders the typed decomposition lifecycle", () => {
    const headings = [
      "## 1. Emit the exact preflight",
      "## 2. Complete the operator-owned map",
      "## 3. Stage the complete result",
      "## 4. Author every reported destination",
      "## 5. Review the distributed result",
      "## 6. Release through the reported protection arm",
      "## 7. Confirm lifecycle readiness and clean up",
    ];
    const positions = headings.map((heading) => workflow.indexOf(heading));

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("places one distribution interlock after destination authoring and before release", () => {
    const authoring = workflow.indexOf("## 4. Author every reported destination");
    const release = workflow.indexOf("## 6. Release through the reported protection arm");
    const interlocks = [...workflow.matchAll(/`workflow-interlock`/gu)];

    expect(authoring).toBeGreaterThan(-1);
    expect(interlocks).toHaveLength(1);
    expect(interlocks[0]!.index).toBeGreaterThan(authoring);
    expect(release).toBeGreaterThan(interlocks[0]!.index);
  });

  it("uses only preflight, staged execution, and receipt-free base advancement", () => {
    const bashCommands = [...workflow.matchAll(/```bash\n([\s\S]*?)```/gu)].map(
      (match) => match[1]!.trim(),
    );

    expect(bashCommands).toEqual([
      "arc decompose <origin> --preflight > <scratch-starter-map>",
      "arc decompose <origin> --execute <completed-map>",
      "arc decompose <origin> --advance-base <completed-map>",
      "arc status",
      "arc teardown <origin>",
    ]);
    expect(workflow).toContain("profile and topology packets");
    expect(workflow).toContain("reject");
    for (const retired of ["--discard", "--finalize", "--continuation", "--handoff"]) {
      expect(workflow).not.toContain(retired);
    }
    expect(workflow).not.toMatch(/\breceipt\b/iu);
    expect(workflow).not.toMatch(/\bprepar(?:e|ation|ed)\b/iu);
  });

  it("keeps partial and full release controls mutually exclusive and ordered", () => {
    const partialStart = workflow.indexOf("### Partial protection");
    const fullStart = workflow.indexOf("### Full protection");
    const readinessStart = workflow.indexOf("## 7. Confirm lifecycle readiness and clean up");
    expect(partialStart).toBeGreaterThan(-1);
    expect(fullStart).toBeGreaterThan(partialStart);
    expect(readinessStart).toBeGreaterThan(fullStart);

    const partial = workflow.slice(partialStart, fullStart);
    const full = workflow.slice(fullStart, readinessStart);
    expect(partial).toContain("`commit-interlock`");
    expect(partial).toContain("`workflowCommit`");
    expect(partial).not.toContain("pre-push-review");
    expect(partial).not.toContain("`push-interlock`");
    expect(partial).not.toContain("`workflowPush`");
    expect(partial).not.toContain("`integration-interlock`");

    const fullControls = [
      "`commit-interlock`",
      "`workflowCommit`",
      "`#pre-push-review`",
      "`push-interlock`",
      "`workflowPush`",
      "PR status",
      "`integration-interlock`",
      "merge according to project policy",
    ].map((control) => full.indexOf(control));

    expect(fullControls).not.toContain(-1);
    expect(fullControls).toEqual([...fullControls].sort((left, right) => left - right));
  });

  it("leaves Git topology and candidate cleanup to typed verbs", () => {
    expect(workflow).not.toMatch(
      /\bgit\s+(?:branch|checkout|switch|worktree|update-ref|write-tree)\b/iu,
    );
    expect(workflow).not.toContain("gh pr merge");
    expect(workflow).not.toContain("--squash");
    expect(workflow).toContain("arc teardown <origin>");
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
