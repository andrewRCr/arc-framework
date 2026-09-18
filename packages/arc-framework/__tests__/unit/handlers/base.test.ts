/** Local base command typed adapter behavior. */

import { describe, expect, it, vi } from "vitest";

import { handleBaseMerge } from "../../../src/handlers/base.js";
import { BaseMergeResultSchema } from "../../../src/scripts/base/merge.js";

const oid = "a".repeat(40);
const headOid = "b".repeat(40);

describe("base merge handler", () => {
  it("carries the checkpoint Candidate head through the typed command contract", async () => {
    const write = vi.fn();
    const merge = vi.fn(async (...args: [string, string, string, "regenerate-roadmap"?]) => ({
      schemaVersion: 1,
      mode: "base-merge",
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: args[1],
      expectedHead: args[2],
    }) as const);

    await handleBaseMerge({
      expectedBase: oid,
      expectedHead: headOid,
      regenerateRoadmap: true,
      json: true,
    } as Parameters<typeof handleBaseMerge>[0], undefined, {
      resolveRoot: () => "/repo",
      merge,
      write,
    });

    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toMatchObject({
      state: "skipped-clean",
      expectedBase: oid,
      expectedHead: headOid,
    });
    expect(merge).toHaveBeenCalledWith("/repo", oid, headOid, "regenerate-roadmap");
  });

  it("emits a schema-valid invalid-input refusal", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleBaseMerge({ expectedBase: "HEAD", expectedHead: headOid }, undefined, {
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(BaseMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      state: "blocked",
      reason: "invalid-input",
      expectedBase: null,
      expectedHead: headOid,
      coordinates: { expectedBase: null, expectedHead: headOid, actualBase: null, actualHead: null },
      continuation: {
        kind: "remedy",
        remedy: { argv: ["arc", "base", "merge", "--help"] },
      },
    });
    expect(setExitCode).toHaveBeenCalledWith(64);
  });

  it("emits a typed refusal outside an ARC project without invoking merge", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const merge = vi.fn();

    await handleBaseMerge({ expectedBase: oid, expectedHead: headOid }, undefined, {
      resolveRoot: () => null,
      merge,
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(BaseMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      state: "blocked",
      reason: "operational-failure",
      expectedBase: oid,
      expectedHead: headOid,
      detail: "Not inside an ARC project.",
      coordinates: { expectedBase: oid, expectedHead: headOid, actualBase: null, actualHead: null },
      continuation: { kind: "terminal-explanation" },
    });
    expect(merge).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
