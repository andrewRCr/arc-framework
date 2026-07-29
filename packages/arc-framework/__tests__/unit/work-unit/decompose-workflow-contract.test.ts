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
      "## 3. Prepare and materialize the result",
      "## 4. Author every reported destination",
      "## 5. Review the distributed result",
      "## 6. Finalize with explicit continuation",
      "## 7. Release through the reported protection arm",
      "## 8. Resolve the landed handoff",
    ];
    const positions = headings.map((heading) => workflow.indexOf(heading));

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("places one distribution interlock after destination authoring and before finalization", () => {
    const authoring = workflow.indexOf("## 4. Author every reported destination");
    const finalization = workflow.indexOf("## 6. Finalize with explicit continuation");
    const interlocks = [...workflow.matchAll(/`workflow-interlock`/gu)];

    expect(authoring).toBeGreaterThan(-1);
    expect(interlocks).toHaveLength(1);
    expect(interlocks[0]!.index).toBeGreaterThan(authoring);
    expect(finalization).toBeGreaterThan(interlocks[0]!.index);
    expect(workflow.slice(interlocks[0]!.index, finalization)).toContain("selected-slugs-or-none");
  });

  it("uses only closed command modes and CLI-reported continuation and recovery", () => {
    const bashCommands = [...workflow.matchAll(/```bash\n([\s\S]*?)```/gu)].map(
      (match) => match[1]!.trim(),
    );

    expect(bashCommands).toEqual([
      "arc decompose <origin> --preflight > <scratch-starter-map>",
      "arc decompose <origin> --execute <completed-map>",
      "arc decompose <origin> --handoff",
    ]);
    expect(workflow).toContain("profile and topology packets");
    expect(workflow).toContain("next.continuationPath");
    expect(workflow).toContain("next.command");
    expect(workflow).toContain("discard.command");
    expect(workflow).toContain("reject");
    expect(workflow).toContain("abandon");
    expect(workflow).toContain("--finalize");
    expect(workflow).toContain("--continuation");
    expect(workflow).toContain("exact reported command");
    expect(workflow).not.toContain("--cut-map");
  });

  it("keeps partial and full release controls mutually exclusive and ordered", () => {
    const partialStart = workflow.indexOf("### Partial protection");
    const fullStart = workflow.indexOf("### Full protection");
    const handoffStart = workflow.indexOf("## 8. Resolve the landed handoff");
    expect(partialStart).toBeGreaterThan(-1);
    expect(fullStart).toBeGreaterThan(partialStart);
    expect(handoffStart).toBeGreaterThan(fullStart);

    const partial = workflow.slice(partialStart, fullStart);
    const full = workflow.slice(fullStart, handoffStart);
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
    expect(workflow).not.toContain("arc teardown");
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
