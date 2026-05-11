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

  describe("worktree-vs-origin alignment (notes target)", () => {
    const REV_LIST_LEFT_RIGHT_PREFIX = "rev-list --left-right --count";

    function notesResponses(): Record<string, ExecResult | ResponseFn> {
      return {
        [REBASE_MERGE_PATH]: { stdout: "/repo/.git/rebase-merge", stderr: "" },
        [REBASE_APPLY_PATH]: { stdout: "/repo/.git/rebase-apply", stderr: "" },
        [CONFIG_GET_FETCH]: {
          stdout: "+refs/heads/*:refs/remotes/origin/*\n+refs/notes/arc/user/*:refs/notes/arc/user/*",
          stderr: "",
        },
      };
    }

    it("clean worktree (ahead=0, behind=0) → no alignment condition", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "0\t0\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "notes",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("local-ahead → blocks with ahead-count guidance", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "2\t0\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "notes",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(false);
      const cond = result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin");
      expect(cond?.disposition).toBe("block");
      expect(cond?.worktreeAlignment).toEqual({ state: "local-ahead", ahead: 2, behind: 0 });
      expect(cond?.guidance).toContain("2");
      expect(cond?.guidance).toContain("feature/x");
      expect(cond?.guidance).toContain("push the worktree first");
    });

    it("behind → blocks with behind-specific guidance", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "0\t3\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "notes",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(false);
      const cond = result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin");
      expect(cond?.disposition).toBe("block");
      expect(cond?.worktreeAlignment).toEqual({ state: "behind", ahead: 0, behind: 3 });
      expect(cond?.guidance).toContain("3");
      expect(cond?.guidance).toContain("behind");
    });

    it("diverged → blocks with diverged-specific guidance", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "2\t3\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "notes",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(false);
      const cond = result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin");
      expect(cond?.disposition).toBe("block");
      expect(cond?.worktreeAlignment).toEqual({ state: "diverged", ahead: 2, behind: 3 });
      expect(cond?.guidance).toContain("diverged");
      expect(cond?.guidance).toMatch(/rebase|merge/);
    });

    it("target='both' suppresses the alignment condition (paired-push owns worktree leg)", async () => {
      const responses = notesResponses();
      responses[REV_PARSE_HEAD] = { stdout: "feature/x", stderr: "" };
      responses[REV_PARSE_UPSTREAM] = { stdout: "origin/feature/x", stderr: "" };
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("rev-list should not run on target=both");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "both",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("worktreeBranch omitted on target='notes' → no probe, no condition", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("rev-list should not run when worktreeBranch is omitted");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({ exec, access, target: "notes" });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("probe failure (rev-list throws) → no condition; allow with no regression", async () => {
      const responses = notesResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("fatal: ambiguous argument 'origin/feature/x': unknown revision");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "notes",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });
  });

  describe("worktree-vs-origin alignment (worktree target)", () => {
    const REV_LIST_LEFT_RIGHT_PREFIX = "rev-list --left-right --count";

    function worktreeResponses(): Record<string, ExecResult | ResponseFn> {
      return {
        [REBASE_MERGE_PATH]: { stdout: "/repo/.git/rebase-merge", stderr: "" },
        [REBASE_APPLY_PATH]: { stdout: "/repo/.git/rebase-apply", stderr: "" },
        [REV_PARSE_HEAD]: { stdout: "feature/x", stderr: "" },
        [REV_PARSE_UPSTREAM]: { stdout: "origin/feature/x", stderr: "" },
      };
    }

    it("clean worktree (ahead=0, behind=0) → no alignment condition", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "0\t0\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("local-ahead → allows single-leg worktree push", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "2\t0\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("behind → blocks single-leg worktree push with behind-specific guidance", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "0\t3\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(false);
      const cond = result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin");
      expect(cond?.disposition).toBe("block");
      expect(cond?.worktreeAlignment).toEqual({ state: "behind", ahead: 0, behind: 3 });
    });

    it("diverged → blocks single-leg worktree push with diverged-specific guidance", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = {
        stdout: "2\t3\n",
        stderr: "",
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(false);
      const cond = result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin");
      expect(cond?.disposition).toBe("block");
      expect(cond?.worktreeAlignment).toEqual({ state: "diverged", ahead: 2, behind: 3 });
    });

    it("worktreeBranch omitted on target='worktree' → no alignment probe, no condition", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("rev-list should not run when worktreeBranch is omitted");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({ exec, access, target: "worktree" });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("probe failure (rev-list throws) → no condition; allow with no regression", async () => {
      const responses = worktreeResponses();
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("fatal: ambiguous argument 'origin/feature/x': unknown revision");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      expect(result.allowed).toBe(true);
      expect(
        result.conditions.find((c) => c.kind === "worktree-not-aligned-with-origin"),
      ).toBeUndefined();
    });

    it("worktree branch with no upstream blocks before alignment probe runs", async () => {
      const responses = worktreeResponses();
      responses[REV_PARSE_UPSTREAM] = () => {
        throw new Error("fatal: no upstream configured for branch 'feature/x'");
      };
      responses[`${REV_LIST_LEFT_RIGHT_PREFIX} HEAD...origin/feature/x`] = () => {
        throw new Error("rev-list should not run when no-upstream blocks");
      };
      const { exec } = buildExec(responses);
      const access = buildAccess([]);

      const result = await runPushabilityStatus({
        exec,
        access,
        target: "worktree",
        worktreeBranch: "feature/x",
      });

      // Both no-upstream and the alignment probe-failure-fallback may surface;
      // no-upstream is the deterministic block. Alignment is non-blocking when
      // it cannot probe.
      expect(result.allowed).toBe(false);
      expect(result.conditions.find((c) => c.kind === "no-upstream-branch")).toBeDefined();
    });
  });
});
