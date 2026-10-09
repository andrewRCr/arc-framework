import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureGitExcludePattern, type GitExcludeFs } from "../../../src/lib/git/exclude.js";
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
});
