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
    const run = vi.fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "no required checks reported on the 'feature' branch",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ base: { ref: "main" } }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ protected: false }),
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: JSON.stringify([[]]), stderr: "" });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([]);
  });

  it("keeps configured required checks pending before GitHub reports them", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({
        stdout: "",
        stderr: "no required checks reported on the 'feature' branch",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ base: { ref: "main" } }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({
          protected: true,
          protection: { required_status_checks: { contexts: [] } },
        }),
        stderr: "",
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify([[
          {
            type: "required_status_checks",
            parameters: { required_status_checks: [{ context: "merge-ok", integration_id: 15368 }] },
          },
        ]]),
        stderr: "",
      });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([
      { name: "merge-ok", state: "pending" },
    ]);
  });

  it("does not hide an unrelated empty-output failure", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "authentication failed" }));
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000)))
      .rejects.toThrow("required-checks: malformed JSON");
  });
});
