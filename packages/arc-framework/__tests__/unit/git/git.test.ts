import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  captureGitIndexState,
  checkGitAvailable,
  isGitRepo,
  gitConfigGet,
  gitConfigSet,
  gitConfigUnset,
  gitMergeFile,
} from "../../../src/lib/git/exec.js";

describe("captureGitIndexState", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
  });

  it("commits unchanged exact index bytes through the Git lock protocol", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-index-state-"));
    roots.push(root);
    const run = promisify(execFile);
    await run("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, "tracked"), "tracked\n");
    await run("git", ["add", "tracked"], { cwd: root });
    await writeFile(join(root, "intent"), "intent\n");
    await run("git", ["add", "-N", "intent"], { cwd: root });
    const indexPath = (await run("git", ["rev-parse", "--git-path", "index"], { cwd: root })).stdout.trim();
    const before = await readFile(join(root, indexPath));
    const gitExec = async (cmd: string, args: string[], options?: { cwd?: string; indexFile?: string }) => {
      const result = await run(cmd, args, {
        cwd: options?.cwd,
        env: options?.indexFile === undefined
          ? process.env
          : { ...process.env, GIT_INDEX_FILE: options.indexFile },
      });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    const transaction = await captureGitIndexState(gitExec, root);
    await transaction.commit();

    expect(await readFile(join(root, indexPath))).toEqual(before);
    expect((await run("git", ["status", "--porcelain=v2"], { cwd: root })).stdout).toContain(" .A ");
  });

  it("refuses a transaction while another Git index lock is present", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-index-state-"));
    roots.push(root);
    const run = promisify(execFile);
    await run("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, "tracked"), "tracked\n");
    await run("git", ["add", "tracked"], { cwd: root });
    const indexPath = join(root, (await run("git", ["rev-parse", "--git-path", "index"], { cwd: root })).stdout.trim());
    const gitExec = async (cmd: string, args: string[], options?: { cwd?: string }) => {
      const result = await run(cmd, args, { cwd: options?.cwd });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    await writeFile(`${indexPath}.lock`, "other writer");

    await expect(captureGitIndexState(gitExec, root)).rejects.toMatchObject({ code: "EEXIST" });
    expect(await readFile(`${indexPath}.lock`, "utf8")).toBe("other writer");
  });

  it("refuses to overwrite an index changed outside the held lock", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-index-state-"));
    roots.push(root);
    const run = promisify(execFile);
    await run("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, "tracked"), "tracked\n");
    await run("git", ["add", "tracked"], { cwd: root });
    const indexPath = join(root, (await run("git", ["rev-parse", "--git-path", "index"], { cwd: root })).stdout.trim());
    const gitExec = async (cmd: string, args: string[], options?: { cwd?: string }) => {
      const result = await run(cmd, args, { cwd: options?.cwd });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    const transaction = await captureGitIndexState(gitExec, root);
    const changed = Buffer.from("outside-lock writer");
    await writeFile(indexPath, changed);

    await expect(transaction.commit()).rejects.toThrow(/index changed/iu);
    expect(await readFile(indexPath)).toEqual(changed);
    await transaction.rollback();
    await expect(readFile(`${indexPath}.lock`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("discards a candidate index mutated by failed staging without changing the real index", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-index-state-"));
    roots.push(root);
    const run = promisify(execFile);
    await run("git", ["init", "-q"], { cwd: root });
    await writeFile(join(root, "tracked"), "tracked\n");
    await run("git", ["add", "tracked"], { cwd: root });
    const indexPath = join(root, (await run("git", ["rev-parse", "--git-path", "index"], { cwd: root })).stdout.trim());
    const before = await readFile(indexPath);
    const gitExec = async (cmd: string, args: string[], options?: { cwd?: string; indexFile?: string }) => {
      const result = await run(cmd, args, {
        cwd: options?.cwd,
        env: options?.indexFile === undefined
          ? process.env
          : { ...process.env, GIT_INDEX_FILE: options.indexFile },
      });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    const transaction = await captureGitIndexState(gitExec, root);
    await writeFile(join(root, "candidate"), "candidate\n");
    await expect((async () => {
      try {
        await gitExec("git", ["add", "--", "candidate"], {
          cwd: root,
          indexFile: transaction.indexFile,
        });
        expect(await readFile(transaction.indexFile)).not.toEqual(before);
        throw new Error("injected staging failure after candidate mutation");
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    })()).rejects.toThrow("injected staging failure");

    expect(await readFile(indexPath)).toEqual(before);
    expect((await run("git", ["diff", "--cached", "--name-only"], { cwd: root })).stdout).toBe("tracked\n");
    await expect(readFile(transaction.indexFile)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("checkGitAvailable", () => {
  it("returns true when git is on PATH", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "git version 2.43.0" });
    const result = await checkGitAvailable(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("git", ["--version"]);
  });

  it("returns false when git is missing", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await checkGitAvailable(mockExec);
    expect(result).toBe(false);
  });
});

describe("isGitRepo", () => {
  it("returns true inside a valid git repository", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "true\n" });
    const result = await isGitRepo(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("git", [
      "rev-parse",
      "--is-inside-work-tree",
    ]);
  });

  it("returns false when not inside a git repo", async () => {
    const mockExec = vi
      .fn()
      .mockRejectedValue(new Error("fatal: not a git repository"));
    const result = await isGitRepo(mockExec);
    expect(result).toBe(false);
  });
});

describe("gitConfigGet", () => {
  it("retrieves a config value by key", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "main\n" });
    const result = await gitConfigGet(mockExec, "init.defaultBranch");
    expect(result).toBe("main");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "--get",
      "init.defaultBranch",
    ]);
  });

  it("returns undefined when key does not exist", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("exit code 1"));
    const result = await gitConfigGet(mockExec, "nonexistent.key");
    expect(result).toBeUndefined();
  });
});

describe("gitConfigSet", () => {
  it("writes a config value with no scope flag when scope is omitted", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "" });
    await gitConfigSet(mockExec, "arc.identity", "andrew");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "arc.identity",
      "andrew",
    ]);
  });

  it.each(["local", "global", "system"] as const)(
    "adds --%s flag when scope is %s",
    async (scope) => {
      const mockExec = vi.fn().mockResolvedValue({ stdout: "" });
      await gitConfigSet(mockExec, "arc.releaseOptedIn", "true", scope);
      expect(mockExec).toHaveBeenCalledWith("git", [
        "config",
        `--${scope}`,
        "arc.releaseOptedIn",
        "true",
      ]);
    },
  );
});

describe("gitConfigUnset", () => {
  it("unsets a config value via --unset when key is present", async () => {
    const mockExec = vi
      .fn()
      .mockResolvedValueOnce({ stdout: "true\n" }) // --get returns existing value
      .mockResolvedValueOnce({ stdout: "" }); // --unset succeeds
    await gitConfigUnset(mockExec, "arc.releaseOptedIn");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "--unset",
      "arc.releaseOptedIn",
    ]);
  });

  it("returns no-op success when key is absent (skips --unset)", async () => {
    const mockExec = vi
      .fn()
      .mockRejectedValueOnce(new Error("exit code 1")); // --get fails (absent key)
    await expect(
      gitConfigUnset(mockExec, "missing.key"),
    ).resolves.toBeUndefined();
    expect(mockExec).not.toHaveBeenCalledWith("git", [
      "config",
      "--unset",
      "missing.key",
    ]);
  });
});

describe("gitMergeFile", () => {
  it("returns clean content when no conflicts", async () => {
    const merged = "line 1\nline 2\nline 3\n";
    const mockExec = vi.fn().mockResolvedValue({ stdout: merged });
    const result = await gitMergeFile(
      mockExec,
      "current.txt",
      "base.txt",
      "other.txt",
    );
    expect(result).toEqual({ content: merged, hasConflicts: false });
    expect(mockExec).toHaveBeenCalledWith("git", [
      "merge-file",
      "-p",
      "current.txt",
      "base.txt",
      "other.txt",
    ]);
  });

  it("returns conflict markers when merge has conflicts", async () => {
    const conflictContent =
      "<<<<<<< current.txt\nours\n=======\ntheirs\n>>>>>>> other.txt\n";
    const error = Object.assign(new Error("exit code 1"), {
      code: 1,
      stdout: conflictContent,
    });
    const mockExec = vi.fn().mockRejectedValue(error);
    const result = await gitMergeFile(
      mockExec,
      "current.txt",
      "base.txt",
      "other.txt",
    );
    expect(result).toEqual({ content: conflictContent, hasConflicts: true });
  });

  it("returns conflict markers when merge-file reports multiple conflicts", async () => {
    const conflictContent = "<<<<<<< current.txt\nours\n=======\ntheirs\n>>>>>>> other.txt\n";
    const error = Object.assign(new Error("exit code 2"), {
      code: 2,
      stdout: conflictContent,
    });
    const mockExec = vi.fn().mockRejectedValue(error);

    await expect(gitMergeFile(
      mockExec,
      "current.txt",
      "base.txt",
      "other.txt",
    )).resolves.toEqual({ content: conflictContent, hasConflicts: true });
  });

  it("throws when input files are missing", async () => {
    const error = Object.assign(new Error("git merge-file failed"), {
      code: 255,
      stderr: "fatal: could not open 'missing.txt' for reading",
    });
    const mockExec = vi.fn().mockRejectedValue(error);
    await expect(
      gitMergeFile(mockExec, "missing.txt", "base.txt", "other.txt"),
    ).rejects.toThrow("could not open");
  });
});
