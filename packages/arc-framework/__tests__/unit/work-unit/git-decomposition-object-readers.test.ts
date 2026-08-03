import { describe, expect, it } from "vitest";

import { digestBytes } from "../../../src/lib/canonical/canonical-json.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  readAncestry,
  readTreeEntry,
  stateMatches,
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

  it.each([
    ["changed content", "100644", "blob", "different", { kind: "file", mode: "100644" }],
    ["content-equal mode change", "100755", "blob", "expected", { kind: "file", mode: "100644" }],
    ["create inversion", "100644", "blob", "expected", { kind: "absent" }],
    ["delete inversion", null, null, "expected", { kind: "file", mode: "100644" }],
    ["symbolic link", "120000", "blob", "expected", { kind: "file", mode: "100644" }],
    ["gitlink", "160000", "commit", "expected", { kind: "file", mode: "100644" }],
    ["tree", "040000", "tree", "expected", { kind: "file", mode: "100644" }],
  ] as const)("refuses a %s path state", async (_case, mode, type, bytesKind, expectedShape) => {
    const path = ".arc/example.md";
    const expectedBytes = new TextEncoder().encode("expected");
    const oid = "c".repeat(40);
    const exec: GitExec = async () => ({
      stdout: mode === null ? "" : `${mode} ${type} ${oid}\t${path}\0`,
    });
    const expected = expectedShape.kind === "absent"
      ? { kind: "absent" as const }
      : {
          kind: "file" as const,
          mode: expectedShape.mode,
          contentDigest: digestBytes(expectedBytes),
        };
    await expect(stateMatches(
      {
        exec,
        readBlob: async () => new TextEncoder().encode(bytesKind),
      },
      ANCESTOR,
      path,
      expected,
    )).resolves.toBe(false);
  });

  it("distinguishes an unreadable path state from a proven mismatch", async () => {
    const path = ".arc/example.md";
    const unreadable: GitExec = async () => {
      throw new Error("tree unavailable");
    };

    await expect(stateMatches(
      {
        exec: unreadable,
        readBlob: async () => new Uint8Array(),
      },
      ANCESTOR,
      path,
      { kind: "absent" },
    )).resolves.toBeNull();
  });
});
