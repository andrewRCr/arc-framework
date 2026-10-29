import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initIdentityPromptSite } from "../../src/prompts/identity-prompt-sites.js";
import { resolveInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import type { UserFetchResult } from "../../src/commands/user.js";
import type { SyncOutput } from "../../src/lib/sync-output.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { scriptGitExec } from "../helpers/git-exec-fake.js";

const mockLog = {
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
};

vi.mock("@clack/prompts", () => ({
  log: mockLog,
}));

const {
  isMissingRemoteError,
  isRemoteError,
  reportUserFetchOutcome,
  requireGitRepo,
  requireSetupGitRepo,
  resolveIdentityWithPrompt,
  resolveUserIdentity,
  runWithSpinner,
} = await import("../../src/handlers/shared.js");

describe("shared handler Git boundaries", () => {
  const identityExec: GitExec = async () => ({ stdout: "bound-identity\0" });
  const outsideRepoExec: GitExec = async () => ({ stdout: "false\n" });

  it("resolves user identity through the supplied executor", async () => {
    expect(await resolveUserIdentity(identityExec)).toBe("bound-identity");
    expect(await resolveIdentityWithPrompt(initIdentityPromptSite, resolveInteractionContext({
      noInput: true, machineReadable: false, ci: false, promptInputIsTTY: false, promptOutputIsTTY: false, yes: "absent",
    }), identityExec)).toBe("bound-identity");
  });

  it("refuses a repository when the supplied executor reports none", async () => {
    expect(await requireGitRepo(outsideRepoExec)).toBe(false);
  });
});

describe("runWithSpinner", () => {
  it("stops with the failure label and rethrows the operation error", async () => {
    let started: string | undefined;
    let stopped: string | undefined;
    const spinner = {
      start: (message?: string) => { started = message; },
      stop: (message?: string) => { stopped = message; },
    };
    const output = { spinner: () => spinner } as unknown as SyncOutput;
    const error = new Error("operation failed");

    await expect(
      runWithSpinner(output, "Working...", async () => Promise.reject(error), "Done."),
    ).rejects.toBe(error);

    expect(started).toBe("Working...");
    expect(stopped).toBe("Failed.");
  });
});

describe("handlers/shared remote fetch reporting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("reports a missing origin as missing configuration", () => {
    const result = {
      kind: "remote-unavailable",
      error: new Error("fatal: No such remote 'origin'"),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "fetch");

    expect(isMissingRemoteError(result.error.message)).toBe(true);
    expect(isRemoteError(result.error.message)).toBe(true);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("No remote configured"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("git remote add origin"));
    expect(process.exitCode).toBe(1);
  });

  it("reports remote access failures without calling them missing configuration", () => {
    const result = {
      kind: "remote-unavailable",
      error: new Error("fatal: Could not read from remote repository."),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "pull");

    expect(isMissingRemoteError(result.error.message)).toBe(false);
    expect(isRemoteError(result.error.message)).toBe(true);
    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("Remote unavailable"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("network, authentication"));
    expect(mockLog.error).not.toHaveBeenCalledWith(expect.stringContaining("No remote configured"));
    expect(process.exitCode).toBe(1);
  });

  it("explains that pull refuses diverged refs and directs to inspection", () => {
    const result = {
      kind: "refused-diverged",
      localTip: "a".repeat(40),
      remoteTip: "b".repeat(40),
    } satisfies UserFetchResult;

    reportUserFetchOutcome(result, "andrew", "pull");

    expect(mockLog.error).toHaveBeenCalledWith(expect.stringContaining("pull refuses diverged notes refs"));
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining("arc user status"));
    expect(process.exitCode).toBe(1);
  });
});

describe("setup layout probe failures", () => {
  beforeEach(() => { process.exitCode = undefined; });
  afterEach(() => { process.exitCode = undefined; });

  function layoutExec(failure: "roster" | "common" | null): GitExec {
    const roster = `worktree /repo\0HEAD ${"0".repeat(40)}\0branch refs/heads/main\0\0`;
    return scriptGitExec([
      {
        match: { predicate: (argv) => argv[0] === "rev-parse" && argv[1] === "--is-inside-work-tree" },
        responses: [{ stdout: "true\n", stderr: "" }],
      },
      {
        match: { predicate: (argv) => argv[0] === "worktree" },
        responses: [failure === "roster"
          ? { failure: { exitCode: 128, stderr: "worktree list unavailable" } }
          : { stdout: roster, stderr: "" }],
      },
      {
        match: { predicate: (argv) => argv.includes("--git-common-dir") },
        responses: [failure === "common"
          ? { failure: { exitCode: 128, stderr: "common directory unavailable" } }
          : { stdout: "/repo/.git\n", stderr: "" }],
      },
    ]).exec;
  }

  it.each(["roster", "common"] as const)("refuses a failed %s read and allows retry after repair", async (failure) => {
    expect(await requireSetupGitRepo(layoutExec(failure), "init")).toBe(false);
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    expect(await requireSetupGitRepo(layoutExec(null), "init")).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
});
