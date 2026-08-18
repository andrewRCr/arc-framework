/** GitHub required-check adapter behavior. */

import { describe, expect, it, vi } from "vitest";

import { createGhRequiredChecksPort } from "../../../../../../src/scripts/review-gate/hosts/github/checks-await.js";
import type { HostedProcessRunner } from "../../../../../../src/scripts/review-gate/hosted/gh-process.js";

describe("GitHub required-check port", () => {
  it("normalizes required check buckets while allowing their meaningful nonzero exit", async () => {
    const run = vi.fn(async () => ({
      stdout: JSON.stringify([
        { name: "build", state: "SUCCESS", bucket: "pass" },
        { name: "test", state: "IN_PROGRESS", bucket: "pending" },
        { name: "lint", state: "FAILURE", bucket: "fail" },
        { name: "optional", state: "SKIPPED", bucket: "skipping" },
        { name: "neutral", state: "NEUTRAL", bucket: null },
      ]),
      stderr: "",
    }));
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([
      { name: "build", state: "green" },
      { name: "test", state: "pending" },
      { name: "lint", state: "failed" },
      { name: "optional", state: "green" },
      { name: "neutral", state: "green" },
    ]);
    expect(run).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ allowFailure: true }));
  });

  it("treats GitHub's no-required-checks exit as an empty successful observation", async () => {
    const run = vi.fn(async () => ({
      stdout: "",
      stderr: "no required checks reported on the 'feature' branch",
    }));
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([]);
  });

  it("does not hide an unrelated empty-output failure", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "authentication failed" }));
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000)))
      .rejects.toThrow("required-checks: malformed JSON");
  });
});
