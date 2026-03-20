import { describe, it, expect, vi } from "vitest";
import {
  checkGitAvailable,
  isGitRepo,
  gitConfigGet,
  gitConfigSet,
  gitMergeFile,
  configureNotesRefspec,
} from "../../../src/lib/git/exec.js";

describe("checkGitAvailable", () => {
  it("returns true when git is on PATH", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "git version 2.43.0" });
    const result = await checkGitAvailable(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("git", ["--version"]);
  });

  it("throws with clear error when git is missing", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("ENOENT"));
    await expect(checkGitAvailable(mockExec)).rejects.toThrow(
      "git is not installed or not on PATH",
    );
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
  it("writes a config value", async () => {
    const mockExec = vi.fn().mockResolvedValue({ stdout: "" });
    await gitConfigSet(mockExec, "arc.identity", "andrew");
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "arc.identity",
      "andrew",
    ]);
  });
});

describe("configureNotesRefspec", () => {
  const REFSPEC = "+refs/notes/arc/user/*:refs/notes/arc/user/*";

  it("adds refspec when remote.origin exists and refspec is absent", async () => {
    const mockExec = vi.fn()
      // gitConfigGet for remote.origin.url
      .mockResolvedValueOnce({ stdout: "git@github.com:org/repo.git\n" })
      // git config --get-all remote.origin.fetch
      .mockResolvedValueOnce({ stdout: "+refs/heads/*:refs/remotes/origin/*\n" })
      // git config --add
      .mockResolvedValueOnce({ stdout: "" });

    const result = await configureNotesRefspec(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "--add",
      "remote.origin.fetch",
      REFSPEC,
    ]);
  });

  it("skips add when refspec is already present", async () => {
    const mockExec = vi.fn()
      .mockResolvedValueOnce({ stdout: "git@github.com:org/repo.git\n" })
      .mockResolvedValueOnce({
        stdout: `+refs/heads/*:refs/remotes/origin/*\n${REFSPEC}\n`,
      });

    const result = await configureNotesRefspec(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it("returns false when no remote origin exists", async () => {
    const mockExec = vi.fn()
      .mockRejectedValueOnce(new Error("exit code 1"));

    const result = await configureNotesRefspec(mockExec);
    expect(result).toBe(false);
    expect(mockExec).toHaveBeenCalledTimes(1);
  });

  it("adds refspec when no fetch entries exist yet", async () => {
    const mockExec = vi.fn()
      .mockResolvedValueOnce({ stdout: "git@github.com:org/repo.git\n" })
      // --get-all fails (no entries)
      .mockRejectedValueOnce(new Error("exit code 1"))
      .mockResolvedValueOnce({ stdout: "" });

    const result = await configureNotesRefspec(mockExec);
    expect(result).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("git", [
      "config",
      "--add",
      "remote.origin.fetch",
      REFSPEC,
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

  it("throws when input files are missing", async () => {
    const error = new Error(
      "fatal: could not open 'missing.txt' for reading",
    );
    const mockExec = vi.fn().mockRejectedValue(error);
    await expect(
      gitMergeFile(mockExec, "missing.txt", "base.txt", "other.txt"),
    ).rejects.toThrow("could not open");
  });
});
