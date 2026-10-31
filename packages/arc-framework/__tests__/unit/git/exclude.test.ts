import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGitExcludePattern, ensureGitExcludePatterns, type GitExcludeFs } from "../../../src/lib/git/exclude.js";
import { nodeWorktreeMarkerIgnoreFs } from "../../../src/lib/git/worktree-marker.js";
import type { GitExec } from "../../../src/lib/git/exec.js";

describe("clone-local Git excludes", () => {
  let root: string;
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "arc-exclude-")); });
  afterEach(async () => { await rm(root, { recursive: true, force: true }); });
  const pattern = ".arc/system/.internal/schemas/";
  function exec(rawPath: string): GitExec {
    return async (_command, _args, options) => ({ stdout: options?.cwd === root ? `${rawPath}\n` : "/wrong-root/exclude" });
  }

  it.each([false, true])("reports the absolute path for a missing file, absolute Git path=%s", async (absolute) => {
    const path = join(root, ".git/info/exclude");
    expect(await ensureGitExcludePattern(root, pattern, exec(absolute ? path : ".git/info/exclude"), nodeWorktreeMarkerIgnoreFs))
      .toEqual({ ok: true, path });
    expect(await readFile(path, "utf8")).toBe(`${pattern}\n`);
  });

  it("leaves a CRLF file with its exact existing pattern untouched", async () => {
    const path = join(root, ".git/info/exclude");
    await mkdir(dirname(path), { recursive: true });
    const contents = `# local\r\n${pattern}\r\n`;
    await writeFile(path, contents);
    expect(await ensureGitExcludePattern(root, pattern, exec(path), nodeWorktreeMarkerIgnoreFs)).toEqual({ ok: true, path });
    expect(await readFile(path, "utf8")).toBe(contents);
  });

  it("retains the original error and resolved path after Git answers", async () => {
    const error = new Error("unreadable");
    const fs: GitExcludeFs = { ...nodeWorktreeMarkerIgnoreFs, readFile: async () => { throw error; } };
    expect(await ensureGitExcludePattern(root, pattern, exec(".git/info/exclude"), fs)).toEqual({
      ok: false, path: join(root, ".git/info/exclude"), error,
    });
  });

  it("retains the Git error without claiming a resolved path", async () => {
    const error = new Error("Git unavailable");
    const failed: GitExec = async () => { throw error; };
    expect(await ensureGitExcludePattern(root, pattern, failed, nodeWorktreeMarkerIgnoreFs)).toEqual({ ok: false, error });
  });

  describe("a pattern list", () => {
    const patterns = [".arc/active/", ".arc/backlog/", ".arc/completed/"];
    function counted(rawPath: string): { exec: GitExec; fs: GitExcludeFs; gitCalls: () => number; writes: () => number } {
      let gitCalls = 0;
      let writes = 0;
      const inner = exec(rawPath);
      return {
        exec: async (command, args, options) => { gitCalls += 1; return inner(command, args, options); },
        fs: { ...nodeWorktreeMarkerIgnoreFs, writeFile: async (path, content) => {
          writes += 1;
          await nodeWorktreeMarkerIgnoreFs.writeFile(path, content);
        } },
        gitCalls: () => gitCalls,
        writes: () => writes,
      };
    }

    it("lands several patterns in one write, in order, after the existing content", async () => {
      const path = join(root, ".git/info/exclude");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "# local\n");
      const io = counted(".git/info/exclude");
      expect(await ensureGitExcludePatterns(root, patterns, io.exec, io.fs)).toEqual({ ok: true, path });
      expect(await readFile(path, "utf8")).toBe(`# local\n${patterns.join("\n")}\n`);
      expect({ gitCalls: io.gitCalls(), writes: io.writes() }).toEqual({ gitCalls: 1, writes: 1 });
    });

    it("skips patterns already present and appends only the rest", async () => {
      const path = join(root, ".git/info/exclude");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, ".arc/backlog/\r\n");
      expect(await ensureGitExcludePatterns(root, patterns, exec(path), nodeWorktreeMarkerIgnoreFs)).toEqual({ ok: true, path });
      expect(await readFile(path, "utf8")).toBe(".arc/backlog/\r\n.arc/active/\n.arc/completed/\n");
    });

    it("does not write a file that already holds every pattern", async () => {
      const path = join(root, ".git/info/exclude");
      await mkdir(dirname(path), { recursive: true });
      const contents = `${[...patterns].reverse().join("\n")}\n`;
      await writeFile(path, contents);
      const fs: GitExcludeFs = { ...nodeWorktreeMarkerIgnoreFs, writeFile: async () => { throw new Error("written"); } };
      expect(await ensureGitExcludePatterns(root, patterns, exec(path), fs)).toEqual({ ok: true, path });
      expect(await readFile(path, "utf8")).toBe(contents);
    });

    it("ends an unterminated last line before the first appended pattern", async () => {
      const path = join(root, ".git/info/exclude");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, "# local");
      expect(await ensureGitExcludePatterns(root, patterns, exec(path), nodeWorktreeMarkerIgnoreFs)).toEqual({ ok: true, path });
      expect(await readFile(path, "utf8")).toBe(`# local\n${patterns.join("\n")}\n`);
    });

    it("returns a failed path lookup and writes nothing", async () => {
      const error = new Error("Git unavailable");
      const failed: GitExec = async () => { throw error; };
      const fs: GitExcludeFs = { ...nodeWorktreeMarkerIgnoreFs, writeFile: async () => { throw new Error("written"); } };
      expect(await ensureGitExcludePatterns(root, patterns, failed, fs)).toEqual({ ok: false, error });
      await expect(readFile(join(root, ".git/info/exclude"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    });
  });
});
