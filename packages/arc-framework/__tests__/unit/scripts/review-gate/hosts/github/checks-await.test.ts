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
      .mockResolvedValueOnce({ stdout: JSON.stringify([[]]), stderr: "" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ base: { ref: "main" } }),
        stderr: "",
      });
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
      })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ base: { ref: "main" } }),
        stderr: "",
      });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([
      { name: "merge-ok", state: "pending" },
    ]);
  });

  it("keeps classic required contexts pending before GitHub reports them", async () => {
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
          protection: { required_status_checks: { contexts: ["merge-ok", "lint"] } },
        }),
        stderr: "",
      })
      .mockResolvedValueOnce({ stdout: JSON.stringify([[]]), stderr: "" })
      .mockResolvedValueOnce({
        stdout: JSON.stringify({ base: { ref: "main" } }),
        stderr: "",
      });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([
      { name: "merge-ok", state: "pending" },
      { name: "lint", state: "pending" },
    ]);
  });

  it("refreshes configured contexts when a pull request retargets without head movement", async () => {
    const headSha = "1234567890abcdef1234567890abcdef12345678";
    let baseRef = "main";
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1);
      if (args[0] === "pr") {
        return {
          stdout: "",
          stderr: "no required checks reported on the 'feature' branch",
        };
      }
      if (endpoint === "repos/owner/repo/pulls/42") {
        return { stdout: JSON.stringify({ head: { sha: headSha }, base: { ref: baseRef } }), stderr: "" };
      }
      if (endpoint === `repos/owner/repo/branches/${baseRef}`) {
        return {
          stdout: JSON.stringify({
            protected: true,
            protection: { required_status_checks: { contexts: [`${baseRef}-check`] } },
          }),
          stderr: "",
        };
      }
      if (endpoint === `repos/owner/repo/rules/branches/${baseRef}?per_page=100`) {
        return { stdout: JSON.stringify([[]]), stderr: "" };
      }
      throw new Error(`unexpected GitHub command: ${args.join(" ")}`);
    });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);
    const signal = AbortSignal.timeout(1000);

    await expect(port.readHead("owner/repo", 42, signal)).resolves.toBe(headSha);
    await expect(port.readRequiredChecks("owner/repo", 42, signal)).resolves.toEqual([
      { name: "main-check", state: "pending" },
    ]);

    baseRef = "release";
    await expect(port.readHead("owner/repo", 42, signal)).resolves.toBe(headSha);
    await expect(port.readRequiredChecks("owner/repo", 42, signal)).resolves.toEqual([
      { name: "release-check", state: "pending" },
    ]);
  });

  it("refreshes configured contexts when policy changes on the same base", async () => {
    let configuredContexts = ["merge-ok"];
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1);
      if (args[0] === "pr") {
        return {
          stdout: "",
          stderr: "no required checks reported on the 'feature' branch",
        };
      }
      if (endpoint === "repos/owner/repo/pulls/42") {
        return { stdout: JSON.stringify({ base: { ref: "main" } }), stderr: "" };
      }
      if (endpoint === "repos/owner/repo/branches/main") {
        return {
          stdout: JSON.stringify({
            protected: true,
            protection: { required_status_checks: { contexts: configuredContexts } },
          }),
          stderr: "",
        };
      }
      if (endpoint === "repos/owner/repo/rules/branches/main?per_page=100") {
        return { stdout: JSON.stringify([[]]), stderr: "" };
      }
      throw new Error(`unexpected GitHub command: ${args.join(" ")}`);
    });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);
    const signal = AbortSignal.timeout(1000);

    await expect(port.readRequiredChecks("owner/repo", 42, signal)).resolves.toEqual([
      { name: "merge-ok", state: "pending" },
    ]);

    configuredContexts = ["merge-ok", "new-policy-check"];
    await expect(port.readRequiredChecks("owner/repo", 42, signal)).resolves.toEqual([
      { name: "merge-ok", state: "pending" },
      { name: "new-policy-check", state: "pending" },
    ]);
  });

  it("retries configured contexts when the base changes during their read", async () => {
    let baseRef = "main";
    const run = vi.fn(async (args: string[]) => {
      const endpoint = args.at(-1);
      if (args[0] === "pr") {
        return {
          stdout: "",
          stderr: "no required checks reported on the 'feature' branch",
        };
      }
      if (endpoint === "repos/owner/repo/pulls/42") {
        return { stdout: JSON.stringify({ base: { ref: baseRef } }), stderr: "" };
      }
      if (endpoint === "repos/owner/repo/branches/main") {
        return {
          stdout: JSON.stringify({
            protected: true,
            protection: { required_status_checks: { contexts: ["main-check"] } },
          }),
          stderr: "",
        };
      }
      if (endpoint === "repos/owner/repo/rules/branches/main?per_page=100") {
        baseRef = "release";
        return { stdout: JSON.stringify([[]]), stderr: "" };
      }
      if (endpoint === "repos/owner/repo/branches/release") {
        return {
          stdout: JSON.stringify({
            protected: true,
            protection: { required_status_checks: { contexts: ["release-check"] } },
          }),
          stderr: "",
        };
      }
      if (endpoint === "repos/owner/repo/rules/branches/release?per_page=100") {
        return { stdout: JSON.stringify([[]]), stderr: "" };
      }
      throw new Error(`unexpected GitHub command: ${args.join(" ")}`);
    });
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000))).resolves.toEqual([
      { name: "release-check", state: "pending" },
    ]);
  });

  it("does not hide an unrelated empty-output failure", async () => {
    const run = vi.fn(async () => ({ stdout: "", stderr: "authentication failed" }));
    const port = createGhRequiredChecksPort({ run } satisfies HostedProcessRunner);

    await expect(port.readRequiredChecks("owner/repo", 42, AbortSignal.timeout(1000)))
      .rejects.toThrow("required-checks: malformed JSON");
  });
});
