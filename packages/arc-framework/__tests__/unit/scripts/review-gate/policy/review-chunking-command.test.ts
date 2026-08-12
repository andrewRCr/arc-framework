import { describe, expect, it, vi } from "vitest";

import type { RawGitExec } from "../../../../../src/lib/change-facts.js";
import type { ReaderResult } from "../../../../../src/lib/config/status-reader.js";
import { createReviewTarget } from "../../../../../src/scripts/review-gate/core/gate-contract-v2.js";
import {
  resolveReviewChunkingCommand,
} from "../../../../../src/scripts/review-gate/policy/review-chunking-command.js";

const target = createReviewTarget({
  schemaVersion: 2,
  semanticsVersion: "review-gate/v2",
  kind: "change-set",
  repositoryId: "repo-1",
  baseRef: "main",
  diffBaseSha: "a".repeat(40),
  diffBaseTree: "b".repeat(40),
  headSha: "c".repeat(40),
  headTree: "d".repeat(40),
});
const request = { schemaVersion: 1, target };

function config(lines: string, files: string, warnings: string[] = []): ReaderResult {
  return {
    settings: {
      "changeset.advisory_threshold_lines": lines,
      "changeset.advisory_threshold_files": files,
    } as ReaderResult["settings"],
    defaultsApplied: [],
    warnings,
  };
}

describe("resolveReviewChunkingCommand", () => {
  it("returns disabled with config diagnostics without invoking Git", async () => {
    const exec = vi.fn<RawGitExec>();
    const result = await resolveReviewChunkingCommand(request, {
      readSettings: async () => config("0", "0", ["config unavailable"]),
      exec,
    });

    expect(result).toMatchObject({
      mode: "review-chunking-resolve",
      state: "disabled",
      nextAction: "none",
      diagnostics: [{ code: "config-warning", message: "config unavailable" }],
      payload: { target },
    });
    expect(result.payload).not.toHaveProperty("metrics");
    expect(exec).not.toHaveBeenCalled();
  });

  it("reports all tripped dimensions for exact-target metrics", async () => {
    const result = await resolveReviewChunkingCommand(request, {
      readSettings: async () => config("'3'", " 1 "),
      exec: async () => ({
        stdout: new TextEncoder().encode("2\t1\tfile.txt\0"),
      }),
    });

    expect(result).toMatchObject({
      state: "consider-chunks",
      nextAction: "select-review-scope",
      payload: {
        metrics: { lines: 3, files: 1 },
        thresholds: { lines: 3, files: 1 },
        tripped: ["lines", "files"],
      },
    });
  });

  it.each([
    ["invalid target identity", { ...request, target: { ...target, targetId: `sha256:${"0".repeat(64)}` } }],
    ["malformed threshold", request],
  ])("rejects %s through a typed invalid-input error", async (kind, input) => {
    await expect(resolveReviewChunkingCommand(input, {
      readSettings: async () => config(kind === "malformed threshold" ? "-1" : "0", "0"),
      exec: async () => ({ stdout: new Uint8Array() }),
    })).rejects.toMatchObject({ code: "invalid-input" });
  });

  it("fails closed when exact-target statistics are unavailable", async () => {
    await expect(resolveReviewChunkingCommand(request, {
      readSettings: async () => config("1", "0"),
      exec: async () => {
        throw new Error("missing object");
      },
    })).rejects.toMatchObject({
      code: "invalid-input",
      message: "Unable to measure exact review target: git-failure",
    });
  });
});
