import { describe, expect, it } from "vitest";

import type { RawGitExec } from "../../../src/lib/git/exec.js";
import { observeGitMergeFeasibility } from "../../../src/lib/git/merge-feasibility.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

const oid = (character: string): string => character.repeat(40);
const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);
const result = (value: string) => ({ stdout: bytes(value) });

function mergeExec(outcome: "clean" | "conflict" | "malformed" | "failed" | "unsupported"): RawGitExec {
  return async (args) => {
    if (args[0] === "rev-parse") return result(`${oid("c")}\n`);
    if (args[0] !== "merge-tree") throw new Error(`unexpected Git call: ${args.join(" ")}`);
    if (!args.includes("--name-only")) {
      if (outcome === "unsupported" && args.includes("--merge-base")) {
        throw makeGitProcessError({ command: "git", args, exitCode: 129, stderr: "unknown option" });
      }
      return result(`${oid("d")}\n`);
    }
    if (outcome === "clean") return result(`${oid("e")}\n`);
    if (outcome === "malformed") return result("not-an-object-id\n");
    if (outcome === "failed") {
      throw makeGitProcessError({ command: "git", args, exitCode: 2, stderr: "merge-tree failed" });
    }
    throw makeGitProcessError({ command: "git", args,
      exitCode: 1,
      stdout: `${oid("e")}\0z.ts\0ROADMAP.md\0z.ts\0`,
      stderr: "conflict",
    });
  };
}

const input = {
  base: oid("a"),
  head: oid("b"),
};

describe("exact-pair Git merge feasibility", () => {
  it("returns clean for a merge-tree composition without conflicts", async () => {
    await expect(observeGitMergeFeasibility({
      ...input,
      exec: mergeExec("clean"),
      classify: () => "reviewable",
    })).resolves.toEqual({ state: "clean", ...input });
  });

  it("keeps conflicts confined to regenerable paths distinct", async () => {
    await expect(observeGitMergeFeasibility({
      ...input,
      exec: mergeExec("conflict"),
      classify: () => "regenerable",
    })).resolves.toEqual({
      state: "regenerable-conflict",
      ...input,
      paths: ["ROADMAP.md", "z.ts"],
    });
  });

  it("classifies any wider conflict as substantive", async () => {
    await expect(observeGitMergeFeasibility({
      ...input,
      exec: mergeExec("conflict"),
      classify: (path) => path === "ROADMAP.md" ? "regenerable" : "reviewable",
    })).resolves.toEqual({
      state: "substantive-conflict",
      ...input,
      paths: ["ROADMAP.md", "z.ts"],
    });
  });

  it.each([
    ["unsupported", "write-tree capability is unavailable"],
    ["malformed", "malformed output"],
    ["failed", "merge-tree failed"],
  ] as const)("returns useful unavailable evidence for %s merge-tree evidence", async (outcome, detail) => {
    const observed = await observeGitMergeFeasibility({
      ...input,
      exec: mergeExec(outcome),
      classify: () => "reviewable",
    });
    expect(observed).toMatchObject({ state: "unavailable", ...input });
    expect(observed).toHaveProperty("detail", expect.stringContaining(detail));
  });
});
