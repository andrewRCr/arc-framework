/**
 * Unit tests for `runFinalizeStage` — the planning-ceremony finalize-fact write.
 *
 * Not a lifecycle transition and not a pointer write: it persists the deterministic
 * finalize facts a planning/verification ceremony produces — the resolved `Class`,
 * the derived `Task List`, and the fixed terminal `Next Action` — keyed by the
 * fire-point. The PPR-owned pointers (`Current Workflow` / `Design` / begin-sentinel)
 * stay with `set-stage` / `repoint-design`; this verb owns the complementary facts.
 */

import { describe, it, expect } from "vitest";

import {
  runFinalizeStage,
  type FinalizeStageContext,
} from "../../../../src/lib/work-unit/verbs/finalize-stage.js";

interface Harness {
  ctx: FinalizeStageContext;
  classWrites: { metaPath: string; value: string }[];
  softWrites: { metaPath: string; updates: Record<string, string> }[];
}

function buildCtx(): Harness {
  const classWrites: { metaPath: string; value: string }[] = [];
  const softWrites: { metaPath: string; updates: Record<string, string> }[] = [];
  return {
    ctx: {
      writeClassField: async (metaPath, value) => {
        classWrites.push({ metaPath, value });
      },
      writeSoftFields: async (metaPath, updates) => {
        softWrites.push({ metaPath, updates: { ...updates } as Record<string, string> });
      },
    },
    classWrites,
    softWrites,
  };
}

const META = ".arc/active/meta-demo-wu.md";

describe("runFinalizeStage — create-spec finalize", () => {
  it("persists the resolved Class and writes no bullet fields (Next Action stays PPR's begin-sentinel)", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "create-spec", workClass: "Heavy" });
    expect(result).toMatchObject({ status: "ok", metaPath: META, firePoint: "create-spec", workClass: "Heavy" });
    expect(classWrites).toEqual([{ metaPath: META, value: "Heavy" }]);
    expect(softWrites).toEqual([]);
  });

  it("normalizes a case-variant Class to its display form", async () => {
    const { ctx, classWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "create-spec", workClass: "heavy" });
    expect(result).toMatchObject({ status: "ok", workClass: "Heavy" });
    expect(classWrites).toEqual([{ metaPath: META, value: "Heavy" }]);
  });

  it("rejects a missing Class where the fire-point requires it", async () => {
    const { ctx, classWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "create-spec" });
    expect(result.status).toBe("rejected");
    expect(classWrites).toEqual([]);
  });

  it("rejects an unresolved / unrecognized Class token", async () => {
    for (const bad of ["[TBD]", "wibble"]) {
      const { ctx, classWrites } = buildCtx();
      const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "create-spec", workClass: bad });
      expect(result.status).toBe("rejected");
      expect(classWrites).toEqual([]);
    }
  });
});

describe("runFinalizeStage — generate-tasks finalize (terminus)", () => {
  it("writes Class, the derived Task List filename, and the fixed terminal Next Action", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, {
      name: "demo-wu",
      firePoint: "generate-tasks",
      workClass: "Light",
    });
    expect(result).toMatchObject({
      status: "ok",
      metaPath: META,
      firePoint: "generate-tasks",
      workClass: "Light",
      taskList: "tasks-demo-wu.md",
      nextAction: "Task list finalized — ready to activate",
    });
    expect(classWrites).toEqual([{ metaPath: META, value: "Light" }]);
    expect(softWrites).toEqual([
      {
        metaPath: META,
        updates: {
          "Task List": "`tasks-demo-wu.md`",
          "Next Action": "Task list finalized — ready to activate",
        },
      },
    ]);
  });
});

describe("runFinalizeStage — verify finalize", () => {
  it("writes only the fixed integration-handoff Next Action — no Class, no Task List", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "verify" });
    expect(result).toMatchObject({
      status: "ok",
      metaPath: META,
      firePoint: "verify",
      workClass: null,
      taskList: null,
      nextAction: "integrate-work-unit Step 1 — verify completion",
    });
    expect(classWrites).toEqual([]);
    expect(softWrites).toEqual([
      {
        metaPath: META,
        updates: { "Next Action": "integrate-work-unit Step 1 — verify completion" },
      },
    ]);
  });

  it("rejects a Class supplied to a fire-point that takes none", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "demo-wu", firePoint: "verify", workClass: "Heavy" });
    expect(result.status).toBe("rejected");
    expect(classWrites).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});

describe("runFinalizeStage — guards", () => {
  it("rejects an unrecognized fire-point and performs no write", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, {
      name: "demo-wu",
      firePoint: "wibble" as never,
      workClass: "Heavy",
    });
    expect(result.status).toBe("rejected");
    expect(classWrites).toEqual([]);
    expect(softWrites).toEqual([]);
  });

  it("rejects an empty work-unit name and performs no write", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "  ", firePoint: "verify" });
    expect(result.status).toBe("rejected");
    expect(classWrites).toEqual([]);
    expect(softWrites).toEqual([]);
  });

  it("rejects a non-slug-safe work-unit name and performs no write", async () => {
    const { ctx, classWrites, softWrites } = buildCtx();
    const result = await runFinalizeStage(ctx, { name: "../evil", firePoint: "generate-tasks", workClass: "Heavy" });
    expect(result.status).toBe("rejected");
    expect(classWrites).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});
