import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../../../../src/lib/git/exec.js";
import {
  GitCodexObjectReader,
  resolveCodexCommitPrefix,
} from "../../../../../../src/scripts/review-gate/providers/codex/git-object.js";

const HEAD = "a".repeat(40);

describe("Codex exact-head git object reads", () => {
  it("reads guidance from the pinned commit object", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse") return { stdout: `${HEAD}\n` };
      if (args[0] === "cat-file") return { stdout: "" };
      if (args[0] === "show") return { stdout: "# guidance\n" };
      throw new Error("unexpected command");
    };
    await expect(new GitCodexObjectReader(exec).readText(HEAD, "AGENTS.md")).resolves.toEqual({
      kind: "ok",
      observedHeadSha: HEAD,
      content: "# guidance\n",
    });
  });

  it("rejects a drifting head or unsafe object path", async () => {
    const exec: GitExec = async () => ({ stdout: `${"b".repeat(40)}\n` });
    const reader = new GitCodexObjectReader(exec);
    await expect(reader.readText(HEAD, "AGENTS.md")).resolves.toEqual({ kind: "unreadable" });
    await expect(reader.readText(HEAD, "../AGENTS.md")).resolves.toEqual({ kind: "unreadable" });
  });

  it("resolves a commit prefix only when it uniquely names the frozen head", async () => {
    const exact: GitExec = async () => ({ stdout: `${HEAD}\n` });
    const stale: GitExec = async () => ({ stdout: `${"b".repeat(40)}\n` });
    await expect(resolveCodexCommitPrefix(exact, HEAD.slice(0, 12), HEAD)).resolves.toBe(HEAD);
    await expect(resolveCodexCommitPrefix(stale, HEAD.slice(0, 12), HEAD)).resolves.toBeNull();
  });
});
