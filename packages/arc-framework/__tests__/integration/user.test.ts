/**
 * Integration tests for the user command (save/load/add).
 *
 * Runs against real temporary git repos with real git notes to verify
 * serialization round-trips, ancestor walking, and user directory management.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

import {
  createTempRepo,
  cleanupTempDir,
  initInTempRepo,
  makeGitExec,
  execFileAsync,
  getInternalTemplatePath,
  DEFAULT_PROMPTS,
} from "../helpers/integration.js";
import {
  runUserSave,
  runUserLoad,
  runUserAdd,
  runUserPush,
  runUserPull,
  UserSaveError,
} from "../../src/commands/user.js";
import type { UserIOContext } from "../../src/commands/user.js";
import type { DirEntry } from "../../src/lib/user-sync.js";

// --- Test Helpers ---

/** Read directory entries with name and size (real filesystem). */
async function readUserDir(dirPath: string): Promise<DirEntry[]> {
  let names: string[];
  try {
    names = await readdir(dirPath);
  } catch {
    return [];
  }
  const entries: DirEntry[] = [];
  for (const name of names) {
    const s = await stat(join(dirPath, name));
    if (s.isFile()) {
      entries.push({ name, size: s.size });
    }
  }
  return entries;
}

/** Write content to a git note via stdin piping (real implementation). */
function writeGitNote(cwd: string) {
  return (ref: string, content: string, commit: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const proc = spawn("git", [
        "notes", "--ref", ref, "add", "-f", "-F", "-", commit,
      ], { cwd });
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git notes add failed (code ${code}): ${stderr}`));
      });
      proc.on("error", reject);
      proc.stdin.write(content);
      proc.stdin.end();
    });
  };
}

/** Read content from a git note (real implementation). */
function readGitNote(cwd: string) {
  return async (ref: string, commit: string): Promise<string | null> => {
    try {
      const { stdout } = await execFileAsync("git", [
        "notes", "--ref", ref, "show", commit,
      ], { cwd });
      return stdout;
    } catch {
      return null;
    }
  };
}

/** Build a real UserIOContext for a temp repo. */
function makeUserIO(cwd: string): UserIOContext {
  return {
    exec: makeGitExec(cwd),
    readFile: (path) => readFile(path, "utf-8"),
    writeFile: (path, content) => writeFile(path, content, "utf-8"),
    mkdir: (path, opts) =>
      import("node:fs/promises").then((fs) =>
        fs.mkdir(path, opts).then(() => undefined),
      ),
    readDir: readUserDir,
    writeNote: writeGitNote(cwd),
    readNote: readGitNote(cwd),
  };
}

/** Create a bare remote repo and add it as origin to the working repo. */
async function addBareRemote(cwd: string): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const remoteDir = await mkdtemp(join(tmpdir(), "arc-remote-"));
  await execFileAsync("git", ["init", "--bare", remoteDir]);
  await execFileAsync("git", ["remote", "add", "origin", remoteDir], { cwd });
  // Push the main branch so origin has a valid ref
  await execFileAsync("git", ["push", "-u", "origin", "HEAD"], { cwd });
  return remoteDir;
}

/** Create a commit in a temp repo. */
async function makeCommit(cwd: string, message: string): Promise<string> {
  await execFileAsync("git", ["commit", "--allow-empty", "-m", message], { cwd });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
  return stdout.trim();
}

// --- Tests ---

describe("user save and load", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Full init creates user directory with SESSION-NOTES.md
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    // Need at least one commit for git notes to attach to
    await makeCommit(tempDir, "initial commit");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("save serializes user dir files to git note, load restores them", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Add some content to SESSION-NOTES.md
    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
      "# Session Notes\nWorking on feature X",
      "utf-8",
    );

    // Save
    const saveResult = await runUserSave({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(saveResult.fileCount).toBeGreaterThanOrEqual(1);
    expect(saveResult.warnings).toEqual([]);

    // Modify the local file to verify load overwrites
    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
      "modified locally",
      "utf-8",
    );

    // Load
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fileCount).toBe(saveResult.fileCount);
    expect(loadResult!.fromAncestor).toBe(false);

    // Verify restored content
    const restored = await readFile(
      join(userDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Session Notes\nWorking on feature X");
  });

  it("load walks ancestors when HEAD has no note", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
      "# Ancestor content",
      "utf-8",
    );

    // Save on current commit
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Make two more commits (no save on these)
    await makeCommit(tempDir, "second commit");
    await makeCommit(tempDir, "third commit");

    // Load should find the note on the ancestor
    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fromAncestor).toBe(true);

    const restored = await readFile(
      join(userDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Ancestor content");
  });

  it("returns null when no note found anywhere", async () => {
    const io = makeUserIO(tempDir);

    const loadResult = await runUserLoad({
      cwd: tempDir, io, identity: "test-user",
    });
    expect(loadResult).toBeNull();
  });

  it("throws UserSaveError when user dir is empty", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "empty-user");
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(userDir, { recursive: true }),
    );

    await expect(
      runUserSave({ cwd: tempDir, io, identity: "empty-user" }),
    ).rejects.toThrow(UserSaveError);
  });
});

describe("user add", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "first-user");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("creates user directory with SESSION-NOTES.md", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "none",
    });

    const sessionNotes = await readFile(
      join(tempDir, ".arc", "user", "new-dev", "SESSION-NOTES.md"),
      "utf-8",
    );
    expect(sessionNotes).toContain("Session Notes");
  });

  it("includes ATOMIC-INBOX.md when pm.mode is arc-in-git", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "arc-in-git",
    });

    const inbox = await readFile(
      join(tempDir, ".arc", "user", "new-dev", "ATOMIC-INBOX.md"),
      "utf-8",
    );
    expect(inbox).toContain("Atomic");
  });

  it("adds gitignore entry for the new user directory", async () => {
    const io = makeUserIO(tempDir);

    await runUserAdd({
      cwd: tempDir,
      io,
      identity: "new-dev",
      internalTemplateDir: getInternalTemplatePath(),
      pmMode: "none",
    });

    const gitignore = await readFile(
      join(tempDir, ".gitignore"), "utf-8",
    );
    expect(gitignore).toContain(".arc/user/new-dev/");
  });
});

describe("user push and pull", () => {
  let tempDir: string;
  let remoteDir: string;
  let cloneDir: string | undefined;

  beforeEach(async () => {
    tempDir = await initInTempRepo(DEFAULT_PROMPTS, "test-user");
    await makeCommit(tempDir, "initial commit");
    remoteDir = await addBareRemote(tempDir);
    cloneDir = undefined;
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
    await cleanupTempDir(remoteDir);
    if (cloneDir) await cleanupTempDir(cloneDir);
  });

  it("push sends notes ref to remote, pull retrieves it in a clone", async () => {
    const io = makeUserIO(tempDir);
    const userDir = join(tempDir, ".arc", "user", "test-user");

    // Save a note locally
    await writeFile(
      join(userDir, "SESSION-NOTES.md"),
      "# Portable notes",
      "utf-8",
    );
    await runUserSave({ cwd: tempDir, io, identity: "test-user" });

    // Push to remote
    await runUserPush({ io, identity: "test-user" });

    // Verify the note ref exists on the remote
    const { stdout: remoteRefs } = await execFileAsync(
      "git", ["ls-remote", remoteDir],
    );
    expect(remoteRefs).toContain("refs/notes/arc/user/test-user");

    // Clone into a second repo and pull the notes
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    cloneDir = await mkdtemp(join(tmpdir(), "arc-clone-"));
    await execFileAsync("git", ["clone", remoteDir, cloneDir]);
    await execFileAsync(
      "git", ["config", "user.email", "clone@test.com"], { cwd: cloneDir },
    );
    await execFileAsync(
      "git", ["config", "user.name", "Clone User"], { cwd: cloneDir },
    );

    const cloneIO = makeUserIO(cloneDir);

    // Pull the notes ref
    await runUserPull({ io: cloneIO, identity: "test-user" });

    // Load from the pulled note
    const cloneUserDir = join(cloneDir, ".arc", "user", "test-user");
    await import("node:fs/promises").then((fs) =>
      fs.mkdir(cloneUserDir, { recursive: true }),
    );
    const loadResult = await runUserLoad({
      cwd: cloneDir, io: cloneIO, identity: "test-user",
    });
    expect(loadResult).not.toBeNull();
    expect(loadResult!.fileCount).toBeGreaterThanOrEqual(1);

    // Verify content arrived
    const restored = await readFile(
      join(cloneUserDir, "SESSION-NOTES.md"), "utf-8",
    );
    expect(restored).toBe("# Portable notes");
  });
});
