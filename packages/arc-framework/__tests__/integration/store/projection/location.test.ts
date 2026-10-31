/** Where a checkout's projection index lives, over a real repository with a linked worktree. */
import { execFile } from "node:child_process";
import { access, lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTempRepoCore, removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import type { GitDirectoryFileAccess } from "../../../../src/lib/git/directories.js";
import { createExecaGitExec } from "../../../../src/lib/git/process-executor.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { StateVersionSchema } from "../../../../src/lib/store/identity.js";
import { PROJECTION_INDEX_FILE, writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { decodeProjectionIndex, type ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import {
  ensureProjectionStateFolder, locateProjection, PROJECTION_STATE_FOLDER,
} from "../../../../src/lib/store/projection/location.js";

// A write into the stopped folder lands half its content, then stops, as a process killed partway would.
const stopped = vi.hoisted(() => ({ folder: undefined as string | undefined }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const writeFile: typeof actual.writeFile = async (path, data, options) => {
    const folder = stopped.folder;
    if (folder === undefined || typeof path !== "string" || !path.startsWith(folder) || typeof data !== "string") {
      return actual.writeFile(path, data, options);
    }
    await actual.writeFile(path, data.slice(0, data.length / 2), options);
    throw new Error("the write stopped partway");
  };
  return { ...actual, writeFile, default: { ...actual, writeFile } };
});

const run = promisify(execFile);
const git = createExecaGitExec();
const fs: GitDirectoryFileAccess = { lstat, readFile: (path) => readFile(path, "utf8"), realpath };
const noGit: GitExec = async (_cmd, args) => { throw new Error(`no Git process expected: git ${args.join(" ")}`); };
const directories: string[] = [];
afterEach(async () => {
  stopped.folder = undefined;
  await removeGitBackedDirs(directories.splice(0));
});

function index(state: string): ProjectionIndex {
  return {
    format: 1, state: StateVersionSchema.parse(state),
    projectedUnder: {
      view: { mode: "mine", pins: [] }, identity: SlugSchema.parse("andrew"), claim: null, layoutActive: "nested",
    },
    withheldCopies: [], tripwires: {}, ignoreFiles: null, entries: {},
  };
}

async function gitDirOf(checkout: string): Promise<string> {
  return realpath((await run("git", ["rev-parse", "--absolute-git-dir"], { cwd: checkout })).stdout.trim());
}

/** A primary with one commit and a linked worktree beside it. */
async function repositoryWithWorktree(): Promise<{ primary: string; linked: string }> {
  const primary = await createTempRepoCore({ prefix: "arc-projection-location-" });
  directories.push(primary);
  await run("git", ["commit", "--allow-empty", "-m", "initial"], { cwd: primary });
  const parent = await mkdtemp(join(tmpdir(), "arc-projection-linked-"));
  directories.push(parent);
  const linked = join(parent, "linked");
  await run("git", ["worktree", "add", "-b", "linked", linked], { cwd: primary });
  return { primary, linked };
}

describe("the projection's state folder", () => {
  it("reads the primary's and a linked worktree's Git directories from .git, and lands each index in its own", async () => {
    const { primary, linked } = await repositoryWithWorktree();
    for (const [checkout, state] of [[primary, "state-primary"], [linked, "state-linked"]] as const) {
      const location = await locateProjection(checkout, { fs, exec: noGit });
      expect(await realpath(location.gitDir)).toBe(await gitDirOf(checkout));
      expect(await ensureProjectionStateFolder(location)).toBe("ready");
      await writeProjectionIndex(location, index(state));
    }
    for (const [checkout, state] of [[primary, "state-primary"], [linked, "state-linked"]] as const) {
      const written = await readFile(join(await gitDirOf(checkout), PROJECTION_STATE_FOLDER, PROJECTION_INDEX_FILE), "utf8");
      expect(decodeProjectionIndex(JSON.parse(written)).data).toEqual(index(state));
    }
  });

  it("reads the primary as the primary and a linked worktree as not, with no Git process", async () => {
    const { primary, linked } = await repositoryWithWorktree();
    expect((await locateProjection(primary, { fs, exec: noGit })).primary).toBe(true);
    expect((await locateProjection(linked, { fs, exec: noGit })).primary).toBe(false);
  });

  it("falls back to Git where .git reads as neither a folder nor a gitdir marker", async () => {
    const { linked } = await repositoryWithWorktree();
    const marker = join(linked, ".git");
    const unreadable: GitDirectoryFileAccess = {
      ...fs, readFile: async (path) => (path === marker ? "not a marker\n" : fs.readFile(path)),
    };
    const calls: string[][] = [];
    const exec: GitExec = async (cmd, args, options) => { calls.push(args); return git(cmd, args, options); };
    const location = await locateProjection(linked, { fs: unreadable, exec });
    expect(calls).toEqual([["rev-parse", "--absolute-git-dir"]]);
    expect(await realpath(location.gitDir)).toBe(await gitDirOf(linked));
    expect(location.primary).toBe(false);
  });

  it("leaves the previous index readable when a write stops before its rename", async () => {
    const { linked } = await repositoryWithWorktree();
    const location = await locateProjection(linked, { fs, exec: noGit });
    await ensureProjectionStateFolder(location);
    await writeProjectionIndex(location, index("state-before"));
    stopped.folder = location.stateDir;
    await expect(writeProjectionIndex(location, index("state-after"))).rejects.toThrow("the write stopped partway");
    stopped.folder = undefined;
    const written = await readFile(join(location.stateDir, PROJECTION_INDEX_FILE), "utf8");
    expect(decodeProjectionIndex(JSON.parse(written)).data).toEqual(index("state-before"));
  });

  it("reads a removed Git directory as gone, and neither creating the folder nor writing recreates it", async () => {
    const { linked } = await repositoryWithWorktree();
    const location = await locateProjection(linked, { fs, exec: noGit });
    await rm(location.gitDir, { recursive: true, force: true });
    expect(await ensureProjectionStateFolder(location)).toBe("gone");
    await expect(writeProjectionIndex(location, index("state-gone"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(location.gitDir)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
