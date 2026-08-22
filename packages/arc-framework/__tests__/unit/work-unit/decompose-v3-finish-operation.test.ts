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
    before: { mode: "100644", contentDigest: digestBytes(encoder.encode("remove\n")) },
    after: { kind: "absent" },
    removedLocators: [{ artifact: "rfc-origin.md", kind: "preamble" }],
  }, {
    path: ".arc/active/spec-origin.md",
    before: { mode: "100755", contentDigest: digestBytes(encoder.encode("before\n")) },
    after: { kind: "file", mode: "100755", bytes: encoder.encode("after\n") },
    removedLocators: [{ artifact: "spec-origin.md", kind: "preamble" }],
  }];
}

function memoryIO(overrides: {
  failPath?: string;
  failMutated?: boolean;
  restorationResidue?: string;
  initial?: Record<string, { index: ReturnType<typeof image>; worktree: ReturnType<typeof image> }>;
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
  const capture = (paths: readonly string[]) => Promise.resolve(paths.map((path) => {
    const value = state.get(path);
    if (value === undefined) throw new Error(`missing test state: ${path}`);
    return clone(value);
  }));
  return {
    state,
    applied,
    capture,
    verify: async (preimages) => {
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
      .resolves.toEqual({ status: "previewed" });
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
