/** Failure-path coverage for the real wrapped Git subprocess adapter. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRemoteRefsContainingHead,
  createSpawnGit,
  stripNoWrap,
} from "../../../../src/handlers/release/commit-cli.js";
import { createGitExec } from "../../../../src/lib/io-context.js";
import { isGitProcessError } from "../../../../src/lib/git/process-error.js";
import { cleanupTempDir, createTempRepo } from "../../../helpers/integration.js";

const execFileAsync = promisify(execFile);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("createSpawnGit", () => {
  it("scrubs repository-local environment and returns exact non-zero status", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.stubEnv("GIT_DIR", "/poisoned/repository");
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");

    const result = await createSpawnGit()({ args: ["--arc-invalid-option"], cwd: process.cwd() });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("arc-invalid-option");
    expect(result.stderr).not.toContain("poisoned/repository");
  });

  it("returns Git's exit status when Git closes before consuming piped stdin", async () => {
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    const result = await createSpawnGit()({
      args: ["--arc-invalid-option", "-F", "-"],
      cwd: process.cwd(),
      stdin: Buffer.alloc(16 * 1024 * 1024, "x"),
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("arc-invalid-option");
  });

  it("rejects transport failures through the typed taxonomy", async () => {
    await expect(createSpawnGit()({
      args: ["-m", "message"],
      cwd: "/arc-path-that-does-not-exist",
    })).rejects.toSatisfy((error: unknown) => isGitProcessError(error) && error.kind === "spawn-failure");
  });
});

describe("createRemoteRefsContainingHead", () => {
  let repository = "";

  afterEach(async () => {
    if (repository !== "") await cleanupTempDir(repository);
    repository = "";
  });

  async function git(args: string[]): Promise<void> {
    await execFileAsync("git", args, { cwd: repository });
  }

  it("reads an unborn HEAD as on no remote-tracking ref", async () => {
    repository = await createTempRepo("arc-release-amend-refs-");

    await expect(createRemoteRefsContainingHead(createGitExec())({ cwd: repository })).resolves.toEqual([]);
  });

  it("names each remote-tracking ref holding HEAD, skipping symbolic refs, and none past them", async () => {
    repository = await createTempRepo("arc-release-amend-refs-");
    await git(["commit", "--allow-empty", "-m", "one"]);
    await git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    await git(["update-ref", "refs/remotes/upstream/topic", "HEAD"]);
    await git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
    const list = createRemoteRefsContainingHead(createGitExec());

    await expect(list({ cwd: repository })).resolves.toEqual(["origin/main", "upstream/topic"]);

    await git(["commit", "--allow-empty", "-m", "two"]);
    await expect(list({ cwd: repository })).resolves.toEqual([]);
  });

  it("propagates a Git failure other than an unborn HEAD", async () => {
    await expect(createRemoteRefsContainingHead(createGitExec())({
      cwd: "/arc-path-that-does-not-exist",
    })).rejects.toSatisfy(isGitProcessError);
  });
});

describe("stripNoWrap", () => {
  it("strips only the wrapper's leading escape hatch", () => {
    expect(stripNoWrap(["--no-wrap", "-m", "subject"])).toEqual({
      argv: ["-m", "subject"],
      wrap: false,
    });
  });

  it.each([
    ["-m", "--no-wrap"],
    ["-F", "--no-wrap"],
    ["--", "--no-wrap"],
  ])("preserves --no-wrap when it is a Git operand in %j", (...args) => {
    expect(stripNoWrap(args)).toEqual({ argv: args, wrap: true });
  });
});
