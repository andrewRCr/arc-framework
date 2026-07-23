import { describe, expect, it, vi } from "vitest";

import { canonicalDigest } from "../../../../../../src/lib/kernel/index.js";
import { createReviewTarget } from "../../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  CodeRabbitExecutableUnavailableError,
} from "../../../../../../src/scripts/review-gate/providers/coderabbit/executable.js";
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
const executableIdentity = {
  path: "/opt/review-tools/coderabbit",
  digest: canonicalDigest({ executable: "coderabbit" }),
  qualifiedVersion: "coderabbit/0.6.5",
};

describe("CodeRabbit frontline execution", () => {
  it("returns source-unbound without resolving or launching a changed registration", async () => {
    const resolveExecutable = vi.fn();
    const run = vi.fn();

    await expect(executeCodeRabbitFrontline({
      source: {
        sourceId: "coderabbit-cli",
        kind: "command",
        executable: "coderabbit",
        argv: ["review", "--changed"],
      },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, { run, resolveExecutable })).resolves.toMatchObject({
      outcome: {
        outcome: "unavailable",
        reason: { class: "source-unbound" },
      },
      executableIdentity: null,
    });
    expect(resolveExecutable).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("returns capability-unsupported when the configured executable cannot be resolved", async () => {
    const run = vi.fn();

    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, {
      run,
      resolveExecutable: vi.fn().mockRejectedValue(new CodeRabbitExecutableUnavailableError("coderabbit")),
    })).resolves.toMatchObject({
      outcome: {
        outcome: "unavailable",
        reason: { class: "capability-unsupported" },
      },
      executableIdentity: null,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("returns authorization-rejected when the resolved executable cannot be launched", async () => {
    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, {
      run: vi.fn().mockRejectedValue(Object.assign(new Error("spawn EACCES"), { code: "EACCES" })),
      resolveExecutable: vi.fn().mockResolvedValue(executableIdentity),
    })).resolves.toMatchObject({
      outcome: {
        outcome: "failed",
        reason: { class: "authorization-rejected" },
      },
      executableIdentity: null,
    });
  });

  it("runs the resolved executable once inside the immutable exact-head checkout", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0, signal: null, stdout: cleanOutput, stderr: "" });
    const resolveExecutable = vi.fn().mockResolvedValue(executableIdentity);

    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, { run, resolveExecutable })).resolves.toMatchObject({
      outcome: {
        outcome: "clean",
        source: { sourceId: "coderabbit-cli", executable: "coderabbit" },
        target: { targetId: target.targetId },
      },
      executableIdentity: {
        digest: executableIdentity.digest,
        qualifiedVersion: executableIdentity.qualifiedVersion,
      },
    });
    expect(resolveExecutable).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(executableIdentity.path, [
      "review", "--agent", "--type", "committed", "--base-commit", target.diffBaseSha,
    ], {
      cwd: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: expect.any(AbortSignal),
    });
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
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, {
      run: vi.fn().mockResolvedValue({ exitCode: 0, signal: null, stdout, stderr: "" }),
      resolveExecutable: vi.fn().mockResolvedValue(executableIdentity),
    })).resolves.toMatchObject({
      outcome: {
        outcome: "findings",
        findings: [{
          findingId: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          severity: "major",
          locus: finding.fileName,
          evidenceUrlOrId: finding.codegenInstructions,
        }],
      },
    });
  });

  it("surfaces rate limiting as unavailable and keeps the hosted provider identity separate", async () => {
    const result = await executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, {
      run: vi.fn().mockResolvedValue({ exitCode: 1, signal: null, stdout: "", stderr: "rate limit exceeded" }),
      resolveExecutable: vi.fn().mockResolvedValue(executableIdentity),
    });

    expect(result).toMatchObject({
      outcome: { outcome: "unavailable", reason: { class: "rate-limited" } },
    });
    expect(CODERABBIT_FRONTLINE_REGISTRATION.sourceId).toBe("coderabbit-cli");
    expect(CODERABBIT_FRONTLINE_REGISTRATION.sourceId).not.toBe("coderabbit-pr");
  });

  it("maps an aborted provider process to timed-out and never accepts its clean output", async () => {
    const controller = new AbortController();
    const run = vi.fn(async (_command, _argv, options: { signal: AbortSignal }) => {
      controller.abort();
      expect(options.signal).toBe(controller.signal);
      return { exitCode: 0, signal: null, stdout: cleanOutput, stderr: "", canceled: false };
    });

    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 25,
      signal: controller.signal,
    }, {
      run,
      resolveExecutable: vi.fn().mockResolvedValue(executableIdentity),
    })).resolves.toMatchObject({
      outcome: {
        outcome: "timed-out",
        findings: [],
        reason: { class: "execution-timeout" },
      },
    });
  });

  it("maps unknown process failures to the closed adapter-failure class", async () => {
    await expect(executeCodeRabbitFrontline({
      source: { sourceId: "coderabbit-cli", ...CODERABBIT_FRONTLINE_REGISTRATION.descriptor },
      target,
      pass: 1,
      maxPasses: 2,
      reviewRoot: "/tmp/exact-head",
      remainingMs: 60_000,
      signal: new AbortController().signal,
    }, {
      run: vi.fn().mockRejectedValue(new Error("unknown provider failure")),
      resolveExecutable: vi.fn().mockResolvedValue(executableIdentity),
    })).resolves.toMatchObject({
      outcome: {
        outcome: "failed",
        findings: [],
        reason: { class: "unexpected-adapter-failure" },
      },
    });
  });
});
