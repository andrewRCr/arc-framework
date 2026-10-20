/** Stored-map continuations retain opaque operands and the preview/apply distinction. */
import { describe, expect, it } from "vitest";
import { decomposeDiscardArgv, decomposeFinishArgv, decomposeReviseArgv } from "../../../../src/lib/decompose/command-argv.js";
import { renderV3DecomposeArgv } from "../../../../src/lib/work-unit/decompose-command-renderer.js";

describe("store decomposition commands", () => {
  it.each([
    ["finish preview", () => decomposeFinishArgv("origin"), ["--finish"]],
    ["finish apply", () => decomposeFinishArgv("origin", "sha256:approved"), ["--finish", "--apply", "sha256:approved"]],
    ["discard preview", () => decomposeDiscardArgv("origin"), ["--discard"]],
    ["discard apply", () => decomposeDiscardArgv("origin", "sha256:approved"), ["--discard", "--apply", "sha256:approved"]],
    ["revision starter", () => decomposeReviseArgv("origin"), ["--revise"]],
    ["revision preview", () => decomposeReviseArgv("origin", { cutMapPath: "maps/the cut.json" }), ["--revise", "maps/the cut.json"]],
    ["revision apply", () => decomposeReviseArgv("origin", { cutMapPath: "maps/the cut.json", authority: "sha256:approved" }),
      ["--revise", "maps/the cut.json", "--apply", "sha256:approved"]],
  ] as const)("builds %s without a legacy finish map operand", (_name, build, operands) => {
    expect(build()).toEqual(["arc", "decompose", "origin", ...operands]);
  });

  it("renders opaque revision paths with the shared shell-safe renderer", () => {
    expect(renderV3DecomposeArgv(decomposeReviseArgv("origin", { cutMapPath: "the cut's map.json" })))
      .toBe("arc decompose origin --revise 'the cut'\"'\"'s map.json'");
  });
});
