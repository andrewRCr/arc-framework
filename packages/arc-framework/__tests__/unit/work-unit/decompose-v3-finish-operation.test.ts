import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import {
  executeV3ExtractionSourceFinish,
  type V3ExtractionSourceFinishIO,
  type V3PartialPathPreimage,
} from "../../../src/lib/work-unit/decompose-v3-finish-operation.js";
import type {
  V3ExtractionSourceThinningFilePlan,
} from "../../../src/lib/work-unit/decompose-v3-thinning.js";

const encoder = new TextEncoder();

function image(content: string, mode: "100644" | "100755" = "100644") {
  return {
    kind: "object" as const,
    objectKind: "blob",
    mode,
    bytes: encoder.encode(content),
  };
}

function plans(): V3ExtractionSourceThinningFilePlan[] {
  return [{
    path: ".arc/active/rfc-origin.md",
    before: {
      mode: "100644",
      contentDigest: digestBytes(encoder.encode("remove\n")),
      byteLength: encoder.encode("remove\n").byteLength,
    },
    after: { kind: "absent" },
    removedLocators: [{ artifact: "rfc-origin.md", kind: "preamble" }],
  }, {
    path: ".arc/active/spec-origin.md",
    before: {
      mode: "100755",
      contentDigest: digestBytes(encoder.encode("before\n")),
      byteLength: encoder.encode("before\n").byteLength,
    },
    after: { kind: "file", mode: "100755", bytes: encoder.encode("after\n") },
    removedLocators: [{ artifact: "spec-origin.md", kind: "preamble" }],
  }];
}

function retainedPlan(): V3ExtractionSourceThinningFilePlan {
  const bytes = encoder.encode("retained\n");
  return {
    path: ".arc/active/meta-origin.md",
    before: { mode: "100644", contentDigest: digestBytes(bytes), byteLength: bytes.byteLength },
    after: { kind: "file", mode: "100644", bytes },
    removedLocators: [],
  };
}

function memoryIO(overrides: {
  failPath?: string;
  failMutated?: boolean;
  finalCaptureFault?: "throw" | "wrong-state";
  preimageRace?: string;
  restorationResidue?: string;
  initial?: Record<string, {
    index: V3PartialPathPreimage["index"];
    worktree: V3PartialPathPreimage["worktree"];
  }>;
} = {}): V3ExtractionSourceFinishIO & { state: Map<string, V3PartialPathPreimage>; applied: string[] } {
  const initial = overrides.initial ?? {
    ".arc/active/rfc-origin.md": { index: image("remove\n"), worktree: image("remove\n") },
    ".arc/active/spec-origin.md": {
      index: image("before\n", "100755"),
      worktree: image("before\n", "100755"),
    },
  };
  const clone = (value: V3PartialPathPreimage): V3PartialPathPreimage => structuredClone(value);
  const state = new Map(Object.entries(initial).map(([path, value]) => [
    path,
    clone({ path, ...value }),
  ]));
  const applied: string[] = [];
  let restoreAttempted = false;
  let finalCaptureFaultInjected = false;
  const capture = async (paths: readonly string[]): Promise<V3PartialPathPreimage[]> => {
    const observed = paths.map((path) => {
      const value = state.get(path);
      if (value === undefined) throw new Error(`missing test state: ${path}`);
      return clone(value);
    });
    if (!finalCaptureFaultInjected
      && applied.length === plans().length
      && overrides.finalCaptureFault !== undefined) {
      finalCaptureFaultInjected = true;
      if (overrides.finalCaptureFault === "throw") throw new Error("injected final capture failure");
      const first = observed[0];
      if (first !== undefined) first.index = image("wrong final state\n");
    }
    return observed;
  };
  return {
    state,
    applied,
    capture,
    verify: async (preimages) => {
      if (!restoreAttempted && overrides.preimageRace !== undefined) {
        return { status: "mismatch", path: overrides.preimageRace };
      }
      if (restoreAttempted && overrides.restorationResidue !== undefined) {
        return { status: "mismatch", path: overrides.restorationResidue };
      }
      const observed = await capture(preimages.map(({ path }) => path));
      return JSON.stringify(observed) === JSON.stringify(preimages)
        ? { status: "restored" }
        : { status: "mismatch", path: preimages[0]?.path ?? "unknown" };
    },
    restore: (preimages) => {
      restoreAttempted = true;
      for (const preimage of preimages) state.set(preimage.path, clone(preimage));
      return Promise.resolve();
    },
    apply: (file) => {
      if (file.path === overrides.failPath) {
        if (overrides.failMutated) {
          state.set(file.path, {
            path: file.path,
            index: { kind: "absent" },
            worktree: { kind: "absent" },
          });
        }
        return Promise.resolve({
          status: "refused" as const,
          reason: "injected-apply-failure",
          mutated: overrides.failMutated === true,
        });
      }
      const after = file.after.kind === "absent"
        ? { kind: "absent" as const }
        : image(new TextDecoder().decode(file.after.bytes), file.after.mode);
      state.set(file.path, { path: file.path, index: after, worktree: after });
      applied.push(file.path);
      return Promise.resolve({ status: "applied" as const });
    },
  };
}

describe("executeV3ExtractionSourceFinish", () => {
  it("previews only after comparing every index and worktree preimage", async () => {
    const io = memoryIO();

    await expect(executeV3ExtractionSourceFinish(plans(), false, io))
      .resolves.toEqual({ status: "previewed", files: plans() });
    expect(io.applied).toEqual([]);
  });

  it("applies every path in deterministic order and verifies the final staged state", async () => {
    const io = memoryIO();

    await expect(executeV3ExtractionSourceFinish(plans(), true, io))
      .resolves.toEqual({ status: "finished" });
    expect(io.applied).toEqual([
      ".arc/active/rfc-origin.md",
      ".arc/active/spec-origin.md",
    ]);
    expect(io.state.get(".arc/active/rfc-origin.md")).toEqual({
      path: ".arc/active/rfc-origin.md",
      index: { kind: "absent" },
      worktree: { kind: "absent" },
    });
  });

  it.each([false, true])("recognizes an exact already-finished source state with apply=%s", async (apply) => {
    const io = memoryIO({
      initial: {
        ".arc/active/rfc-origin.md": {
          index: { kind: "absent" },
          worktree: { kind: "absent" },
        },
        ".arc/active/spec-origin.md": {
          index: image("after\n", "100755"),
          worktree: image("after\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(plans(), apply, io))
      .resolves.toEqual({ status: "already-finished" });
    expect(io.applied).toEqual([]);
  });

  it("resumes only the before-images from an exact partial prior apply", async () => {
    const io = memoryIO({
      initial: {
        ".arc/active/rfc-origin.md": {
          index: { kind: "absent" },
          worktree: { kind: "absent" },
        },
        ".arc/active/spec-origin.md": {
          index: image("before\n", "100755"),
          worktree: image("before\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io))
      .resolves.toEqual({ status: "finished" });
    expect(io.applied).toEqual([".arc/active/spec-origin.md"]);
  });

  it("previews only paths still pending after an exact partial prior apply", async () => {
    const io = memoryIO({
      initial: {
        ".arc/active/rfc-origin.md": {
          index: { kind: "absent" },
          worktree: { kind: "absent" },
        },
        ".arc/active/spec-origin.md": {
          index: image("before\n", "100755"),
          worktree: image("before\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(plans(), false, io)).resolves.toEqual({
      status: "previewed",
      files: [plans()[1]],
    });
  });

  it("treats a retained-only plan as complete for preview, apply, and repeat", async () => {
    const retained = retainedPlan();
    const io = memoryIO({
      initial: {
        [retained.path]: {
          index: image("retained\n"),
          worktree: image("retained\n"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish([retained], false, io))
      .resolves.toEqual({ status: "already-finished" });
    await expect(executeV3ExtractionSourceFinish([retained], true, io))
      .resolves.toEqual({ status: "already-finished" });
    await expect(executeV3ExtractionSourceFinish([retained], true, io))
      .resolves.toEqual({ status: "already-finished" });
    expect(io.applied).toEqual([]);
  });

  it("excludes retained paths from a mixed preview, apply, and repeat", async () => {
    const retained = retainedPlan();
    const changed = plans()[1]!;
    const mixed = [retained, changed];
    const io = memoryIO({
      initial: {
        [retained.path]: {
          index: image("retained\n"),
          worktree: image("retained\n"),
        },
        [changed.path]: {
          index: image("before\n", "100755"),
          worktree: image("before\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(mixed, false, io)).resolves.toEqual({
      status: "previewed",
      files: [changed],
    });
    await expect(executeV3ExtractionSourceFinish(mixed, true, io))
      .resolves.toEqual({ status: "finished" });
    expect(io.applied).toEqual([changed.path]);
    await expect(executeV3ExtractionSourceFinish(mixed, true, io))
      .resolves.toEqual({ status: "already-finished" });
    expect(io.applied).toEqual([changed.path]);
  });

  it("runs the pre-mutation guard for apply only", async () => {
    let guardCalls = 0;
    const io = memoryIO();
    io.beforeApply = () => {
      guardCalls += 1;
      return Promise.resolve({ status: "refused", reason: "base-raced", locus: "refs/heads/main" });
    };

    await expect(executeV3ExtractionSourceFinish(plans(), false, io))
      .resolves.toEqual({ status: "previewed", files: plans() });
    expect(guardCalls).toBe(0);
    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "base-raced",
      locus: "refs/heads/main",
    });
    expect(guardCalls).toBe(1);
    expect(io.applied).toEqual([]);
  });

  it("authorizes the exact pending paths before the pre-mutation guard", async () => {
    const events: string[] = [];
    const io = memoryIO();
    io.authorizeApply = (pending) => {
      events.push(`authorize:${pending.map(({ path }) => path).join(",")}`);
      return Promise.resolve({ status: "refused", reason: "apply-authority", locus: "apply" });
    };
    io.beforeApply = () => {
      events.push("guard");
      return Promise.resolve({ status: "ready" });
    };

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "apply-authority",
      locus: "apply",
    });
    expect(events).toEqual([
      "authorize:.arc/active/rfc-origin.md,.arc/active/spec-origin.md",
    ]);
    expect(io.applied).toEqual([]);
  });

  it("refuses any changed preimage before the first mutation", async () => {
    const io = memoryIO({
      initial: {
        ".arc/active/rfc-origin.md": { index: image("remove\n"), worktree: image("remove\n") },
        ".arc/active/spec-origin.md": {
          index: image("before\n", "100755"),
          worktree: image("changed\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "source-worktree-preimage",
      locus: ".arc/active/spec-origin.md",
      evidence: {
        expected: {
          before: {
            kind: "object",
            objectKind: "blob",
            mode: "100755",
            contentDigest: digestBytes(encoder.encode("before\n")),
            byteLength: encoder.encode("before\n").byteLength,
          },
          after: {
            kind: "object",
            objectKind: "blob",
            mode: "100755",
            contentDigest: digestBytes(encoder.encode("after\n")),
            byteLength: encoder.encode("after\n").byteLength,
          },
        },
        actual: {
          kind: "object",
          objectKind: "blob",
          mode: "100755",
          contentDigest: digestBytes(encoder.encode("changed\n")),
          byteLength: encoder.encode("changed\n").byteLength,
        },
      },
    });
    expect(io.applied).toEqual([]);
  });

  it("reports the planned transition and observed index state for an index mismatch", async () => {
    const observed = encoder.encode("changed\n");
    const io = memoryIO({
      initial: {
        ".arc/active/rfc-origin.md": {
          index: image("changed\n"),
          worktree: image("remove\n"),
        },
        ".arc/active/spec-origin.md": {
          index: image("before\n", "100755"),
          worktree: image("before\n", "100755"),
        },
      },
    });

    await expect(executeV3ExtractionSourceFinish(plans(), false, io)).resolves.toEqual({
      status: "refused",
      reason: "source-index-preimage",
      locus: ".arc/active/rfc-origin.md",
      evidence: {
        expected: {
          before: {
            kind: "object",
            objectKind: "blob",
            mode: "100644",
            contentDigest: digestBytes(encoder.encode("remove\n")),
            byteLength: encoder.encode("remove\n").byteLength,
          },
          after: { kind: "absent" },
        },
        actual: {
          kind: "object",
          objectKind: "blob",
          mode: "100644",
          contentDigest: digestBytes(observed),
          byteLength: observed.byteLength,
        },
      },
    });
  });

  it("reports only the exact path when a captured preimage races", async () => {
    const path = ".arc/active/spec-origin.md";
    const io = memoryIO({ preimageRace: path });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "source-preimage-raced",
      locus: path,
    });
    expect(io.applied).toEqual([]);
  });

  it("restores only paths mutated by a failed apply", async () => {
    const io = memoryIO({ failPath: ".arc/active/spec-origin.md", failMutated: true });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "injected-apply-failure",
      locus: ".arc/active/spec-origin.md",
    });
    expect(io.state.get(".arc/active/rfc-origin.md")?.index).toEqual(image("remove\n"));
    expect(io.state.get(".arc/active/spec-origin.md")?.index).toEqual(image("before\n", "100755"));
  });

  it.each([
    ["throw", "source-final-capture"],
    ["wrong-state", "source-final-state"],
  ] as const)("restores every mutation after a %s final capture", async (finalCaptureFault, reason) => {
    const io = memoryIO({ finalCaptureFault });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason,
      locus: ".arc/active/rfc-origin.md",
    });
    expect(io.state.get(".arc/active/rfc-origin.md")?.index).toEqual(image("remove\n"));
    expect(io.state.get(".arc/active/spec-origin.md")?.index).toEqual(image("before\n", "100755"));
  });

  it("reports the exact residue when bounded restoration cannot verify", async () => {
    const io = memoryIO({
      failPath: ".arc/active/spec-origin.md",
      failMutated: true,
      restorationResidue: ".arc/active/rfc-origin.md",
    });

    await expect(executeV3ExtractionSourceFinish(plans(), true, io)).resolves.toEqual({
      status: "refused",
      reason: "source-restoration-failed",
      locus: ".arc/active/rfc-origin.md",
    });
  });
});
