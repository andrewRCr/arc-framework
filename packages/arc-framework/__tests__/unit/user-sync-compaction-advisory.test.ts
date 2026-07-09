import { describe, expect, it } from "vitest";

import { inspectNotesCompactionAdvisory } from "../../src/lib/user-sync/index.js";
import type { GitExec } from "../../src/lib/git/index.js";

const NOTES_REF = "refs/notes/arc/user/andrew";

function execWithRevListOutput(stdout: string): GitExec {
  return async (_cmd, args) => {
    if (args[0] === "rev-list" && args[1] === "--count" && args[2] === NOTES_REF) {
      return { stdout, stderr: "" };
    }
    throw new Error(`unexpected git call: ${args.join(" ")}`);
  };
}

describe("inspectNotesCompactionAdvisory", () => {
  it("suggests compaction only when history exceeds the threshold", async () => {
    await expect(inspectNotesCompactionAdvisory(execWithRevListOutput("5\n"), NOTES_REF, 5))
      .resolves.toEqual({ historyCommitCount: 5, threshold: 5, shouldSuggest: false });

    await expect(inspectNotesCompactionAdvisory(execWithRevListOutput("6\n"), NOTES_REF, 5))
      .resolves.toEqual({ historyCommitCount: 6, threshold: 5, shouldSuggest: true });
  });

  it("falls back to zero when the notes history cannot be counted", async () => {
    const throwingExec: GitExec = async () => {
      throw new Error("no such ref");
    };

    await expect(inspectNotesCompactionAdvisory(throwingExec, NOTES_REF, 5))
      .resolves.toEqual({ historyCommitCount: 0, threshold: 5, shouldSuggest: false });
    await expect(inspectNotesCompactionAdvisory(execWithRevListOutput("not-a-number\n"), NOTES_REF, 5))
      .resolves.toEqual({ historyCommitCount: 0, threshold: 5, shouldSuggest: false });
  });
});
