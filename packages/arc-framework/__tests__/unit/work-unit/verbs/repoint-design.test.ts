/**
 * Unit tests for `runRepointDesign` — the event-driven `Design` repoint.
 *
 * Not a lifecycle transition: it fires the executor's `writeDesignField` seam to
 * advance the active WU's `Design` pointer at two planning moments —
 * `draft-created` (`[none] → draft-<name>.md`) and `spec-finalized`
 * (`draft-<name>.md → spec-<name>.md`). The repoint operates on the parsed
 * identifier-list so a layered `Design` keeps its siblings; it is never a blind
 * whole-field overwrite.
 */

import { describe, it, expect } from "vitest";

import { runRepointDesign, type RepointDesignContext } from "../../../../src/lib/work-unit/verbs/repoint-design.js";

interface Harness {
  ctx: RepointDesignContext;
  calls: { metaPath: string; value: string }[];
}

function buildCtx(): Harness {
  const calls: { metaPath: string; value: string }[] = [];
  return {
    ctx: {
      writeDesignField: async (metaPath, value) => {
        calls.push({ metaPath, value });
      },
    },
    calls,
  };
}

describe("runRepointDesign — event-driven Design repoint", () => {
  it("draft-created repoints `[none] → draft-<name>.md`", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runRepointDesign(ctx, { name: "demo-wu", event: "draft-created", currentDesign: [] });
    expect(result).toEqual({ status: "ok", metaPath: ".arc/active/meta-demo-wu.md", design: "draft-demo-wu.md" });
    expect(calls).toEqual([{ metaPath: ".arc/active/meta-demo-wu.md", value: "draft-demo-wu.md" }]);
  });

  it("draft-created is idempotent when the draft is already the pointer", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runRepointDesign(ctx, {
      name: "demo-wu",
      event: "draft-created",
      currentDesign: ["draft-demo-wu.md"],
    });
    expect(result).toEqual({ status: "ok", metaPath: ".arc/active/meta-demo-wu.md", design: "draft-demo-wu.md" });
    expect(calls).toEqual([{ metaPath: ".arc/active/meta-demo-wu.md", value: "draft-demo-wu.md" }]);
  });

  it("spec-finalized swaps the draft member for the spec, preserving layered siblings", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runRepointDesign(ctx, {
      name: "demo-wu",
      event: "spec-finalized",
      currentDesign: ["draft-demo-wu.md", "spec-shared-foundation.md"],
    });
    expect(result.status).toBe("ok");
    expect(calls).toEqual([
      { metaPath: ".arc/active/meta-demo-wu.md", value: "spec-demo-wu.md, spec-shared-foundation.md" },
    ]);
  });

  it("spec-finalized takes the direct (no-draft) path when Design is `[none]`", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runRepointDesign(ctx, { name: "demo-wu", event: "spec-finalized", currentDesign: [] });
    expect(result).toEqual({ status: "ok", metaPath: ".arc/active/meta-demo-wu.md", design: "spec-demo-wu.md" });
    expect(calls).toEqual([{ metaPath: ".arc/active/meta-demo-wu.md", value: "spec-demo-wu.md" }]);
  });

  it("rejects an empty work-unit name and performs no write", async () => {
    const { ctx, calls } = buildCtx();
    const result = await runRepointDesign(ctx, { name: "  ", event: "draft-created", currentDesign: [] });
    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
  });
});
