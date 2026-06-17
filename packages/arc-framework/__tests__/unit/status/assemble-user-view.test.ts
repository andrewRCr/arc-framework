import { describe, it, expect, vi } from "vitest";

import { assembleStatusUserView } from "../../../src/lib/status/assemble-user-view.js";
import type { ExecResult, GitExec } from "../../../src/lib/git/exec.js";

/**
 * Exec stub answering the reads the assembled view makes in local-only mode:
 * `for-each-ref` (local tracking refs) and `worktree list` (the roster scan).
 * `ls-remote` is never reached on the local-only path.
 */
function makeExec(overrides: { forEachRef?: string; worktreeList?: string } = {}): GitExec {
  return vi.fn(async (_cmd, args): Promise<ExecResult> => {
    if (args[0] === "for-each-ref") return { stdout: overrides.forEachRef ?? "", stderr: "" };
    if (args[0] === "worktree") return { stdout: overrides.worktreeList ?? "", stderr: "" };
    if (args[0] === "ls-remote") throw new Error("ls-remote must not run on the local-only path");
    return { stdout: "", stderr: "" };
  });
}

describe("assembleStatusUserView", () => {
  it("binds the seams and renders the two-section view over empty local state", async () => {
    const view = await assembleStatusUserView({
      cwd: "/repo-with-no-planned-metas",
      exec: makeExec(),
      identity: "andrew",
      teamMode: false,
      localOnly: true,
      readFile: () => Promise.reject(new Error("no cache")),
      readdir: () => Promise.resolve([]),
    });

    expect(view.source).toBe("rendered");
    expect(view.output).toContain("## In Flight");
    expect(view.output).toContain("## Ready");
    expect(view.output).toContain("No in-flight work units for `andrew`.");
    expect(view.output).toContain("No ready work units for `andrew`.");
  });

  it("short-circuits when no identity is resolved (the view is identity-scoped)", async () => {
    const exec = makeExec();
    const view = await assembleStatusUserView({
      cwd: "/repo",
      exec,
      identity: null,
      teamMode: false,
      localOnly: true,
      readFile: () => Promise.reject(new Error("unused")),
      readdir: () => Promise.resolve([]),
    });

    expect(view.source).toBe("no-identity");
    expect(exec).not.toHaveBeenCalled();
  });
});
