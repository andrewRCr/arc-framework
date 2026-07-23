import { describe, expect, it, vi } from "vitest";

import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  CODERABBIT_FRONTLINE_REGISTRATION,
  executeCodeRabbitFrontline,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/frontline-execution.js";

const oid = (value: string): string => value.repeat(40);
const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: oid("a"),
  diffBaseTree: oid("b"),
  headSha: oid("c"),
  headTree: oid("c"),
});
const cleanOutput = [
  JSON.stringify({ type: "status", phase: "analyzing", status: "reviewing" }),
  JSON.stringify({
    type: "complete",
    status: "review_completed",
    findings: 0,
    reviewedFiles: ["src/index.ts"],
  }),
].join("\n");

describe("CodeRabbit frontline execution", () => {
  it("binds the project source to structured agent argv and the exact diff base", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, signal: null, stdout: cleanOutput, stderr: "" });
    const readHead = vi.fn().mockResolvedValue(target.headSha);

    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      cliVersion: "0.6.5",
    }, { run, readHead })).resolves.toMatchObject({
      outcome: "clean",
      source: { sourceId: "coderabbit-cli", executable: "coderabbit" },
      target: { targetId: target.targetId },
    });
    expect(run).toHaveBeenCalledWith("coderabbit", [
      "review", "--agent", "--type", "committed", "--base-commit", target.diffBaseSha,
    ]);
    expect(readHead).toHaveBeenCalledTimes(2);
  });

  it("preserves structured findings for author-side triage", async () => {
    const finding = {
      type: "finding",
      severity: "major",
      fileName: "src/index.ts",
      codegenInstructions: "In src/index.ts around line 5, preserve the exact target binding.",
      suggestions: [],
    };
    const stdout = [
      JSON.stringify(finding),
      JSON.stringify({
        type: "complete",
        status: "review_completed",
        findings: 1,
        reviewedFiles: [finding.fileName],
      }),
    ].join("\n");

    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      cliVersion: "0.6.5",
    }, {
      run: vi.fn().mockResolvedValue({ exitCode: 0, signal: null, stdout, stderr: "" }),
      readHead: vi.fn().mockResolvedValue(target.headSha),
    })).resolves.toMatchObject({
      outcome: "findings",
      findings: [{
        findingId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        severity: "major",
        locus: finding.fileName,
        evidenceUrlOrId: finding.codegenInstructions,
      }],
    });
  });

  it("surfaces rate limiting as unavailable and keeps the hosted provider identity separate", async () => {
    const result = await executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      cliVersion: "0.6.5",
    }, {
      run: vi.fn().mockResolvedValue({ exitCode: 1, signal: null, stdout: "", stderr: "rate limit exceeded" }),
      readHead: vi.fn().mockResolvedValue(target.headSha),
    });

    expect(result).toMatchObject({ outcome: "unavailable", reason: { class: "rate-limited" } });
    expect(CODERABBIT_FRONTLINE_REGISTRATION.sourceId).toBe("coderabbit-cli");
    expect(CODERABBIT_FRONTLINE_REGISTRATION.sourceId).not.toBe("coderabbit-pr");
  });
});
