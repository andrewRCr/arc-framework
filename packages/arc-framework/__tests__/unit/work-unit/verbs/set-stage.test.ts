/**
 * Unit tests for `runSetStage` — the planning-stage-pointer write.
 *
 * Not a lifecycle transition: it fires the executor's `writeCurrentWorkflowField`
 * seam to write the active WU's `Current Workflow` to the planning sub-stage a
 * session is entering, refusing anything outside the planning enum (the clear to
 * `[none]` is the activate edge's, not this command's).
 */

import { describe, it, expect } from "vitest";

import { runSetStage, type SetStageContext } from "../../../../src/lib/work-unit/verbs/set-stage.js";

interface Harness {
  ctx: SetStageContext;
  calls: { metaPath: string; stage: string }[];
  softWrites: { metaPath: string; updates: Record<string, string> }[];
}

function buildCtx(): Harness {
  const calls: { metaPath: string; stage: string }[] = [];
  const softWrites: { metaPath: string; updates: Record<string, string> }[] = [];
  return {
    ctx: {
      writeCurrentWorkflowField: async (metaPath, stage) => {
        calls.push({ metaPath, stage });
      },
      writeSoftFields: async (metaPath, updates) => {
        softWrites.push({ metaPath, updates: { ...updates } as Record<string, string> });
      },
    },
    calls,
    softWrites,
  };
}

describe("runSetStage — planning-stage-pointer write", () => {
  it("writes the matching basename for each of the three planning stages", async () => {
    for (const stage of ["draft-design", "create-spec", "generate-tasks"] as const) {
      const { ctx, calls } = buildCtx();
      const result = await runSetStage(ctx, { name: "demo-wu", stage });
      expect(result).toEqual({ status: "ok", metaPath: ".arc/active/meta-demo-wu.md", stage, advanced: false });
      expect(calls).toEqual([{ metaPath: ".arc/active/meta-demo-wu.md", stage }]);
    }
  });

  it("leaves `Next Action` untouched by default (the entry-correction shape)", async () => {
    const { ctx, softWrites } = buildCtx();
    const result = await runSetStage(ctx, { name: "demo-wu", stage: "create-spec" });
    expect(result).toMatchObject({ status: "ok", advanced: false });
    expect(softWrites).toEqual([]);
  });

  it("on `advance`, resets `Next Action` to the boundary sentinel (the finalization shape)", async () => {
    const { ctx, calls, softWrites } = buildCtx();
    const result = await runSetStage(ctx, { name: "demo-wu", stage: "generate-tasks", advance: true });
    expect(result).toEqual({
      status: "ok",
      metaPath: ".arc/active/meta-demo-wu.md",
      stage: "generate-tasks",
      advanced: true,
    });
    expect(calls).toEqual([{ metaPath: ".arc/active/meta-demo-wu.md", stage: "generate-tasks" }]);
    expect(softWrites).toEqual([
      { metaPath: ".arc/active/meta-demo-wu.md", updates: { "Next Action": "[begin current workflow]" } },
    ]);
  });

  it("refuses a stage outside the planning enum and performs no write", async () => {
    const { ctx, calls, softWrites } = buildCtx();
    const result = await runSetStage(ctx, { name: "demo-wu", stage: "wibble" });
    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(softWrites).toEqual([]);
  });

  it("refuses the `[none]` clear — that exit belongs to the activate edge", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runSetStage(ctx, { name: "demo-wu", stage: "[none]" });
    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
  });

  it("rejects an empty work-unit name and performs no write", async () => {
    const { ctx, calls, softWrites } = buildCtx();
    const result = await runSetStage(ctx, { name: "  ", stage: "draft-design" });
    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});
