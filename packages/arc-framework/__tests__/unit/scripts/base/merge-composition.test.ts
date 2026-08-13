/** Production base-merge cleanup behavior at the Git boundary. */

import { describe, expect, it } from "vitest";

import type { ExecResult, GitExec } from "../../../../src/lib/git/exec.js";
import { createBaseMergePort } from "../../../../src/scripts/base/merge-composition.js";

const oid = (character: string): string => character.repeat(40);

describe("base merge composition", () => {
  it("aborts a conflicting merge before exposing the conflict verdict", async () => {
    const state = { head: oid("c"), clean: true, merging: false };
    const ok = (stdout = ""): ExecResult => ({ stdout, stderr: "" });
    const exec: GitExec = async (_command, args) => {
      if (args[0] === "status") return ok(state.clean ? "" : "UU conflict.txt");
      if (args[0] === "rev-parse" && args.at(-1) === "HEAD") return ok(state.head);
      if (args[0] === "rev-parse" && args.at(-1) === "MERGE_HEAD") {
        if (!state.merging) throw new Error("no merge");
        return ok(oid("a"));
      }
      if (args[0] === "merge" && args[1] === "--no-edit") {
        state.clean = false;
        state.merging = true;
        throw new Error("conflict");
      }
      if (args[0] === "merge" && args[1] === "--abort") {
        state.clean = true;
        state.merging = false;
        return ok();
      }
      throw new Error(`unexpected Git invocation: ${args.join(" ")}`);
    };
    const port = createBaseMergePort({ cwd: "/repo", baseBranch: "main", exec });

    await expect(port.mergeAppendOnly(oid("a"))).resolves.toBe("conflict");
    expect(state).toEqual({ head: oid("c"), clean: true, merging: false });
  });
});
