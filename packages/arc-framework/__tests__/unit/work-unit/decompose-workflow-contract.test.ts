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
      "## 3. Dispatch the complete result",
      "## 4. Author every reported destination",
      "## 5. Review the distributed result",
      "## 6. Release through the reported protection arm",
      "## 7. Confirm lifecycle readiness and finish",
    ];
    const positions = headings.map((heading) => workflow.indexOf(heading));

    expect(positions).not.toContain(-1);
    expect(positions).toEqual([...positions].sort((left, right) => left - right));
  });

  it("separates semantic distribution, advancement, and destructive finish interlocks", () => {
    const authoring = workflow.indexOf("## 4. Author every reported destination");
    const release = workflow.indexOf("## 6. Release through the reported protection arm");
    const finishPreview = workflow.indexOf("arc decompose <origin> --finish <completed-map>");
    const finishApply = workflow.indexOf(
      "arc decompose <origin> --finish <completed-map> --apply",
    );
    const interlocks = [...workflow.matchAll(/`workflow-interlock`/gu)];

    expect(authoring).toBeGreaterThan(-1);
    expect(interlocks).toHaveLength(3);
    expect(interlocks[0]!.index).toBeGreaterThan(authoring);
    expect(release).toBeGreaterThan(interlocks[0]!.index);
    expect(interlocks[1]!.index).toBeGreaterThan(workflow.indexOf("--advance-base"));
    expect(interlocks[1]!.index).toBeLessThan(workflow.indexOf("`push-interlock`"));
    expect(interlocks[2]!.index).toBeGreaterThan(finishPreview);
    expect(interlocks[2]!.index).toBeLessThan(finishApply);
    expect(workflow.slice(interlocks[2]!.index, finishApply)).toContain("explicit 'apply' direction");
    expect(workflow).toContain("This is destructive mutation confirmation, not a second semantic");
  });

  it("surfaces extraction's typed report fields at the sole semantic distribution gate", () => {
    const reviewStart = workflow.indexOf("## 5. Review the distributed result");
    const releaseStart = workflow.indexOf("## 6. Release through the reported protection arm");
    const review = workflow.slice(reviewStart, releaseStart);

    expect(review).toContain("report.extraction.retainedOrigin");
    expect(review).toContain("report.extraction.reasonedDrops");
    expect(review).toContain("report.extraction.anchor");
    expect(review).toContain("surviving active origin as the natural continuation");
    expect(review).toContain("never re-derive");
    expect(review.match(/`workflow-interlock`/gu)).toHaveLength(1);
    expect(review).toContain("sole semantic distribution approval");
  });

  it("re-stages and verifies the approved authored bytes before either release arm", () => {
    const interlock = workflow.indexOf("`workflow-interlock`");
    const staging = workflow.indexOf("git add -- <reported-release-paths>");
    const partial = workflow.indexOf("### Partial protection");
    const full = workflow.indexOf("### Full protection");

    expect(staging).toBeGreaterThan(interlock);
    expect(staging).toBeLessThan(partial);
    expect(staging).toBeLessThan(full);
    expect(workflow).toContain("git diff --quiet -- <reported-release-paths>");
    expect(workflow).toContain("including paths the command found already applied");
    expect(workflow).toContain("git diff --cached --name-only --no-renames");
    expect(workflow).not.toMatch(/git add -- (?:\.arc|\.|--all|-A)\b/u);
  });

  it("uses a closed retirement/extraction dispatch and extraction finish", () => {
    const bashCommands = [...workflow.matchAll(/```bash\n([\s\S]*?)```/gu)].map(
      (match) => match[1]!.trim(),
    );

    expect(bashCommands).toEqual([
      "arc decompose <origin> --preflight > <scratch-starter-map>",
      "arc decompose <origin> --execute <completed-map>",
      "arc decompose <origin> --extract <completed-map>",
      "git add -- <reported-release-paths>\n"
        + "git diff --quiet -- <reported-release-paths>\n"
        + "git diff --cached --name-only --no-renames",
      "arc decompose <origin> --advance-base <completed-map>",
      "arc status",
      "arc decompose <origin> --finish <completed-map>",
      "arc decompose <origin> --finish <completed-map> --apply",
      "arc teardown --branch <reported-candidate-branch>",
      "arc teardown <origin>",
    ]);
    expect(workflow).toContain("profile and topology packets");
    expect(workflow).toContain("Retirement dispatch");
    expect(workflow).toContain("Extraction dispatch");
    for (const retired of ["--discard", "--finalize", "--continuation", "--handoff"]) {
      expect(workflow).not.toContain(retired);
    }
    expect(workflow).not.toMatch(/\bprepar(?:e|ation|ed)\b/iu);
  });

  it("keeps partial and full release controls mutually exclusive and ordered", () => {
    const partialStart = workflow.indexOf("### Partial protection");
    const fullStart = workflow.indexOf("### Full protection");
    const readinessStart = workflow.indexOf("## 7. Confirm lifecycle readiness and finish");
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
    expect(full).toContain("Retirement only");
    expect(full).toContain("Extraction never invokes this operation");
    expect(full).toContain("An `advanced` result fires the interlock below");
    expect(full.match(/`workflowCommit`/gu)).toHaveLength(2);
    expect(full.match(/`commit-interlock`/gu)).toHaveLength(2);
  });

  it("leaves Git topology and candidate cleanup to typed verbs", () => {
    expect(workflow).not.toMatch(
      /\bgit\s+(?:branch|checkout|switch|worktree|update-ref|write-tree)\b/iu,
    );
    expect(workflow).not.toContain("gh pr merge");
    expect(workflow).not.toContain("--squash");
    expect(workflow).toContain("arc teardown <origin>");
  });

  it("preserves extraction's no-record and ordinary-lifecycle boundary", () => {
    expect(workflow).toContain("Extraction writes no transition record, recovery record, or receipt");
    expect(workflow).toContain("It stores no launch advice, publication");
    expect(workflow).toContain("packet, or selected successor");
    expect(workflow).toContain("startable only through their landed base metas");
    expect(workflow).toContain("Never tear down the surviving extraction origin");
  });

  it("keeps package source and the self-hosted project projection byte-equal", () => {
    expect(projectWorkflow).toBe(workflow);
  });
});
