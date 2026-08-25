/** Local base command typed adapter behavior. */

import { describe, expect, it, vi } from "vitest";

import { handleBaseMerge } from "../../../src/handlers/base.js";
import { BaseMergeResultSchema } from "../../../src/scripts/base/merge.js";

const oid = "a".repeat(40);
const headOid = "b".repeat(40);

describe("base merge handler", () => {
  it("carries the checkpoint Candidate head through the typed command contract", async () => {
    const write = vi.fn();
    const merge = async (...args: string[]) => ({
      schemaVersion: 1,
      mode: "base-merge",
      state: "skipped-clean",
      nextAction: "continue-reconcile",
      expectedBase: args[1] ?? "",
      expectedHead: args[2] ?? "",
    }) as const;

    await handleBaseMerge({
      expectedBase: oid,
      expectedHead: headOid,
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
  });

  it("emits a schema-valid invalid-input refusal", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();

    await handleBaseMerge({ expectedBase: "HEAD", expectedHead: headOid, json: true }, undefined, {
      write,
      setExitCode,
    });

    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(BaseMergeResultSchema.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      state: "blocked",
      reason: "invalid-input",
      expectedBase: null,
      expectedHead: null,
    });
    expect(setExitCode).toHaveBeenCalledWith(64);
  });

  it("emits a typed refusal outside an ARC project without invoking merge", async () => {
    const write = vi.fn();
    const setExitCode = vi.fn();
    const merge = vi.fn();

    await handleBaseMerge({ expectedBase: oid, expectedHead: headOid, json: true }, undefined, {
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
    });
    expect(merge).not.toHaveBeenCalled();
    expect(setExitCode).toHaveBeenCalledWith(1);
  });
});
