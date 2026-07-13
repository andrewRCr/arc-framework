import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../..");
const read = (path: string): Promise<string> => readFile(resolve(root, path), "utf8");

describe("review-gate qualification delivery boundary", () => {
  it("keeps live input and raw checkpoints private and outside the repository", async () => {
    const launcher = await read("packages/arc-framework/src/scripts/review-gate/run-qualification.ts");
    expect(launcher).toContain("qualification-directory-must-be-private-outside-repository");
    expect(launcher).toContain("qualification-directory-permissions-not-private");
    expect(launcher).toContain("qualification-input-permissions-not-private");
    expect(launcher).toContain('processRunner.run("gh"');
    expect(launcher).toContain('processRunner.run("git"');
    expect(launcher).not.toMatch(/ARC_QUALIFICATION_(?:SCOPE|PROBES).*process\.stdout/iu);
  });

  it("uses developer authentication only for assigned actions and canonical re-query", async () => {
    const port = await read("packages/arc-framework/src/scripts/review-gate/runtime/gh-qualification-port.ts");
    const workflow = await read(".github/workflows/review-gate.yml");
    const reconcile = await read("packages/arc-framework/src/scripts/review-gate/run-reconcile.ts");
    expect(port).toContain("runPerformAction");
    expect(port).toContain("deriveReviewGateAction");
    expect(port).toContain("assertQualificationPending");
    expect(port).toContain("buildCodexReviewCommand");
    expect(port).toContain("@coderabbitai full review");
    expect(port).not.toContain("labels[]=arc-review-gate");
    expect(port).toContain("review-gate.yml/dispatches");
    expect(port).toContain("inputs[qualification_provider]");
    expect(workflow).toContain("ARC_QUALIFICATION_MODE:");
    expect(reconcile).toContain("selectReconcilePolicy");
    expect(port).toContain("event_type=review-gate-qualify");
    expect(port).toContain("event_type=review-gate-repair");
    expect(port).not.toMatch(/secrets\.|PRIVATE_KEY|ARC_APP_TOKEN/u);
  });
});
