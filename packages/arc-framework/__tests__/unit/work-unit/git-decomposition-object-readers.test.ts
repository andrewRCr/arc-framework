import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  readAncestry,
  readTreeEntry,
} from "../../../src/lib/work-unit/git-decomposition-object-readers.js";

const ANCESTOR = "a".repeat(40);
const DESCENDANT = "b".repeat(40);

function ancestryExec(outcome: "ancestor" | "not-ancestor" | "unresolvable"): GitExec {
  return async (_command, args) => {
    if (args[0] === "rev-parse") {
      const ref = args[2]?.replace(/\^\{commit\}$/u, "");
      if (outcome === "unresolvable" && ref === DESCENDANT) throw new Error("missing");
      return { stdout: `${ref}\n` };
    }
    if (args[0] === "merge-base") {
      if (outcome === "ancestor") return { stdout: "" };
      throw Object.assign(new Error("not an ancestor"), { exitCode: 1 });
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("git decomposition object readers", () => {
  it.each([
    ["ancestor", "ancestor"],
    ["not-ancestor", "not-ancestor"],
    ["unresolvable", "unresolvable"],
  ] as const)("reports %s ancestry distinctly", async (outcome, expected) => {
    expect(await readAncestry(ancestryExec(outcome), ANCESTOR, DESCENDANT)).toBe(expected);
  });

  it("distinguishes an absent path from a malformed or duplicate tree entry", async () => {
    const path = ".arc/example.md";
    const absent: GitExec = async () => ({ stdout: "" });
    const malformed: GitExec = async () => ({ stdout: "malformed\0" });
    const duplicate: GitExec = async () => ({
      stdout: `100644 blob ${"c".repeat(40)}\t${path}\0${
        `100644 blob ${"d".repeat(40)}\t${path}\0`
      }`,
    });

    await expect(readTreeEntry(absent, ANCESTOR, path)).resolves.toBeNull();
    await expect(readTreeEntry(malformed, ANCESTOR, path)).resolves.toBe(false);
    await expect(readTreeEntry(duplicate, ANCESTOR, path)).resolves.toBe(false);
  });
});
