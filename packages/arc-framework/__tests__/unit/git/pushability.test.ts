import { describe, it, expect } from "vitest";

import { runPushabilityStatus } from "../../../src/lib/git/pushability.js";
import type {
  ExecResult,
  GitExec,
  GitExecOptions,
} from "../../../src/lib/git/index.js";

type ResponseFn = (
  args: string[],
  options?: GitExecOptions,
) => ExecResult | Promise<ExecResult>;

function buildExec(
  responses: Record<string, ExecResult | ResponseFn>,
): { exec: GitExec; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: GitExec = async (cmd, args, options) => {
    calls.push({ cmd, args });
    const key = matchKey(args, responses);
    if (key === null) {
      throw new Error(`unmatched git invocation: ${cmd} ${args.join(" ")}`);
    }
    const entry = responses[key];
    if (entry === undefined) {
      throw new Error(`matched key '${key}' has no response`);
    }
    return typeof entry === "function" ? entry(args, options) : entry;
  };
  return { exec, calls };
}

function matchKey(
  args: string[],
  responses: Record<string, unknown>,
): string | null {
  for (const key of Object.keys(responses)) {
    const tokens = key.split(" ");
    if (tokens.every((token, i) => token === "*" || args[i] === token)) {
      return key;
    }
  }
  return null;
}

/** Build an access function whose `present` paths resolve, others reject. */
function buildAccess(present: string[]): (path: string) => Promise<void> {
  const set = new Set(present);
  return async (path: string) => {
    if (!set.has(path)) {
      throw new Error(`ENOENT: no such file or directory, access '${path}'`);
    }
  };
}

const REBASE_MERGE_PATH = "rev-parse --git-path rebase-merge";
const REBASE_APPLY_PATH = "rev-parse --git-path rebase-apply";
const REV_PARSE_HEAD = "rev-parse --abbrev-ref HEAD";
const REV_PARSE_UPSTREAM = "rev-parse --abbrev-ref @{upstream}";
const CONFIG_GET_FETCH = "config --get-all remote.origin.fetch";
const CONFIG_GET_ORIGIN_URL = "config --get remote.origin.url";

/** Common exec responses for a clean repository (no rebase, on branch 'main'). */
function cleanRepoResponses(): Record<string, ExecResult | ResponseFn> {
  return {
    [REBASE_MERGE_PATH]: { stdout: "/repo/.git/rebase-merge", stderr: "" },
    [REBASE_APPLY_PATH]: { stdout: "/repo/.git/rebase-apply", stderr: "" },
    [REV_PARSE_HEAD]: { stdout: "main", stderr: "" },
    [REV_PARSE_UPSTREAM]: { stdout: "origin/main", stderr: "" },
    [CONFIG_GET_FETCH]: {
      stdout: "+refs/heads/*:refs/remotes/origin/*\n+refs/notes/arc/user/*:refs/notes/arc/user/*",
      stderr: "",
    },
  };
}

describe("runPushabilityStatus", () => {
  it("happy path: no blocking conditions returns allowed for target 'both'", async () => {
    const { exec } = buildExec(cleanRepoResponses());
    const access = buildAccess([]);

    const result = await runPushabilityStatus({ exec, access, target: "both" });

    expect(result.allowed).toBe(true);
    expect(result.conditions).toEqual([]);
  });

  it("rebase-in-progress (rebase-merge form) blocks both targets", async () => {
    const { exec } = buildExec(cleanRepoResponses());
    const access = buildAccess(["/repo/.git/rebase-merge"]);

    const result = await runPushabilityStatus({ exec, access, target: "both" });

    expect(result.allowed).toBe(false);
    const rebase = result.conditions.find((c) => c.kind === "rebase-in-progress");
    expect(rebase?.rebaseForm).toBe("rebase-merge");
    expect(rebase?.disposition).toBe("block");
    expect(rebase?.guidance).toContain("git rebase --continue");
  });

  it("rebase-in-progress (rebase-apply form, e.g. `git am`) blocks both targets", async () => {
    const { exec } = buildExec(cleanRepoResponses());
    const access = buildAccess(["/repo/.git/rebase-apply"]);

    const result = await runPushabilityStatus({ exec, access, target: "both" });

    expect(result.allowed).toBe(false);
    const rebase = result.conditions.find((c) => c.kind === "rebase-in-progress");
    expect(rebase?.rebaseForm).toBe("rebase-apply");
    expect(rebase?.disposition).toBe("block");
    expect(rebase?.guidance).toContain("git am --continue");
  });

  it("detached HEAD blocks worktree target with guidance", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_HEAD] = { stdout: "HEAD", stderr: "" };
    const { exec } = buildExec(responses);
    const access = buildAccess([]);

    const result = await runPushabilityStatus({ exec, access, target: "worktree" });

    expect(result.allowed).toBe(false);
    const detached = result.conditions.find((c) => c.kind === "detached-head");
    expect(detached?.disposition).toBe("block");
    expect(detached?.guidance).toContain("HEAD is detached");
  });

  it("worktree branch with no upstream blocks target 'worktree' with -u guidance", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_HEAD] = { stdout: "feature/x", stderr: "" };
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'feature/x'");
    };
    const { exec } = buildExec(responses);
    const access = buildAccess([]);

    const result = await runPushabilityStatus({ exec, access, target: "worktree" });

    expect(result.allowed).toBe(false);
    const noUpstream = result.conditions.find((c) => c.kind === "no-upstream-branch");
    expect(noUpstream?.disposition).toBe("block");
    expect(noUpstream?.branch).toBe("feature/x");
    expect(noUpstream?.guidance).toBe("Set upstream first: `git push -u origin feature/x`");
  });

  it("worktree branch with no upstream does NOT block target 'notes'", async () => {
    const responses = cleanRepoResponses();
    responses[REV_PARSE_HEAD] = { stdout: "feature/x", stderr: "" };
    responses[REV_PARSE_UPSTREAM] = () => {
      throw new Error("fatal: no upstream configured for branch 'feature/x'");
    };
    const { exec } = buildExec(responses);
    const access = buildAccess([]);

    const result = await runPushabilityStatus({ exec, access, target: "notes" });

    expect(result.allowed).toBe(true);
    expect(result.conditions.find((c) => c.kind === "no-upstream-branch")).toBeUndefined();
  });

  it("notes-ref refspec missing on target 'notes' auto-configures and re-probe shows installed", async () => {
    const fetchOutputs = ["+refs/heads/*:refs/remotes/origin/*"];
    const { exec, calls } = buildExec({
      [REBASE_MERGE_PATH]: { stdout: "/repo/.git/rebase-merge", stderr: "" },
      [REBASE_APPLY_PATH]: { stdout: "/repo/.git/rebase-apply", stderr: "" },
      [CONFIG_GET_FETCH]: () => ({ stdout: fetchOutputs[0] ?? "", stderr: "" }),
      [CONFIG_GET_ORIGIN_URL]: { stdout: "git@github.com:owner/repo.git", stderr: "" },
      "config --add remote.origin.fetch *": (args) => {
        const refspec = args[args.length - 1];
        if (typeof refspec === "string") {
          fetchOutputs[0] = `${fetchOutputs[0] ?? ""}\n${refspec}`;
        }
        return { stdout: "", stderr: "" };
      },
    });
    const access = buildAccess([]);

    const first = await runPushabilityStatus({ exec, access, target: "notes" });

    expect(first.allowed).toBe(true);
    const refspec = first.conditions.find((c) => c.kind === "missing-notes-refspec");
    expect(refspec?.disposition).toBe("auto-fixed");
    expect(refspec?.guidance).toContain("auto-configured");

    expect(
      calls.some((c) =>
        c.args[0] === "config"
          && c.args[1] === "--add"
          && c.args[2] === "remote.origin.fetch"
          && c.args[3] === "+refs/notes/arc/user/*:refs/notes/arc/user/*",
      ),
    ).toBe(true);

    const second = await runPushabilityStatus({ exec, access, target: "notes" });
    expect(second.conditions.find((c) => c.kind === "missing-notes-refspec")).toBeUndefined();
  });

  it("force-push required (diverged worktree) surfaces advisory condition", async () => {
    const { exec } = buildExec(cleanRepoResponses());
    const access = buildAccess([]);

    const result = await runPushabilityStatus({
      exec,
      access,
      target: "worktree",
      worktreeSyncState: "diverged",
    });

    expect(result.allowed).toBe(true);
    const force = result.conditions.find((c) => c.kind === "force-push-required");
    expect(force?.disposition).toBe("advisory");
    expect(force?.guidance).toContain("diverged");
  });
});
