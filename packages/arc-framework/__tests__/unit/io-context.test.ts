import { execPath } from "node:process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createUserIOContext, gitExec, prepareGitRefVerification } from "../../src/lib/io-context.js";

const tempDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("gitExec", () => {
  it("captures stdout beyond the execFile default buffer", async () => {
    const outputBytes = (1024 * 1024) + 1;

    const result = await gitExec(execPath, [
      "-e",
      `process.stdout.write("x".repeat(${outputBytes}))`,
    ]);

    expect(result.stdout).toHaveLength(outputBytes);
  });

  it("scrubs repository-local Git variables when cwd selects the repository", async () => {
    const localGitVariables = [
      "GIT_ALTERNATE_OBJECT_DIRECTORIES",
      "GIT_CONFIG",
      "GIT_CONFIG_PARAMETERS",
      "GIT_CONFIG_COUNT",
      "GIT_OBJECT_DIRECTORY",
      "GIT_DIR",
      "GIT_WORK_TREE",
      "GIT_IMPLICIT_WORK_TREE",
      "GIT_GRAFT_FILE",
      "GIT_INDEX_FILE",
      "GIT_NO_REPLACE_OBJECTS",
      "GIT_REPLACE_REF_BASE",
      "GIT_PREFIX",
      "GIT_SHALLOW_FILE",
      "GIT_COMMON_DIR",
    ];
    for (const variable of localGitVariables) vi.stubEnv(variable, `inherited-${variable}`);
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");

    const script = [
      `const keys = ${JSON.stringify(localGitVariables)};`,
      "const present = keys.filter((key) => process.env[key] !== undefined);",
      "process.stdout.write(JSON.stringify({ present, sentinel: process.env.ARC_TEST_SENTINEL }));",
    ].join("");
    const result = await gitExec(execPath, ["-e", script], { cwd: process.cwd() });

    expect(JSON.parse(result.stdout)).toEqual({ present: [], sentinel: "preserved" });
  });

  it("preserves the inherited environment when an index file is supplied without cwd", async () => {
    vi.stubEnv("ARC_TEST_SENTINEL", "preserved");
    const indexFile = "/tmp/arc-test-index";
    const script = [
      "process.stdout.write(JSON.stringify({",
      "sentinel: process.env.ARC_TEST_SENTINEL,",
      "indexFile: process.env.GIT_INDEX_FILE",
      "}));",
    ].join("");

    const result = await gitExec(execPath, ["-e", script], { indexFile });

    expect(JSON.parse(result.stdout)).toEqual({ sentinel: "preserved", indexFile });
  });

  it("holds a prepared ref verification lock until release", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-ref-verification-"));
    tempDirs.push(root);
    await gitExec("git", ["init"], { cwd: root });
    await gitExec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await gitExec("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "seed.txt"), "seed", "utf8");
    await gitExec("git", ["add", "seed.txt"], { cwd: root });
    await gitExec("git", ["commit", "-m", "seed"], { cwd: root });
    const { stdout: first } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    await writeFile(join(root, "seed.txt"), "next", "utf8");
    await gitExec("git", ["commit", "-am", "next"], { cwd: root });
    const { stdout: second } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const { stdout: ref } = await gitExec("git", ["symbolic-ref", "HEAD"], { cwd: root });
    await gitExec("git", ["reset", "--hard", first], { cwd: root });

    const lease = await prepareGitRefVerification(root, ref, first);
    try {
      await expect(gitExec("git", ["update-ref", ref, second, first], { cwd: root })).rejects.toThrow();
      await expect(gitExec("git", ["rev-parse", ref], { cwd: root })).resolves.toMatchObject({ stdout: first });
    } finally {
      await lease.release();
    }

    await expect(gitExec("git", ["update-ref", ref, second, first], { cwd: root })).resolves.toBeDefined();
    await expect(gitExec("git", ["rev-parse", ref], { cwd: root })).resolves.toMatchObject({ stdout: second });
  });
});

describe("createUserIOContext readDir", () => {
  it("terminates cleanly when a nested symlink points back to an ancestor", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-user-dir-"));
    tempDirs.push(root);
    const drafts = join(root, "drafts");
    await mkdir(drafts);
    await writeFile(join(drafts, "idea.md"), "hello", "utf8");
    await symlink(root, join(drafts, "loop"), "dir");

    const entries = await createUserIOContext().readDir(root);

    expect(entries).toEqual([{ name: "drafts/idea.md", size: 5 }]);
  });

  it("skips an entry that disappears between directory listing and stat", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-user-dir-"));
    tempDirs.push(root);
    await writeFile(join(root, "kept.md"), "hello", "utf8");
    await symlink(join(root, "already-gone.md"), join(root, "vanished.md"), "file");

    const entries = await createUserIOContext().readDir(root);

    expect(entries).toEqual([{ name: "kept.md", size: 5 }]);
  });
});

describe("createUserIOContext readNote", () => {
  it("returns null when the notes ref is corrupt", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-note-"));
    tempDirs.push(root);
    await gitExec("git", ["init"], { cwd: root });
    await gitExec("git", ["config", "user.email", "test@example.com"], { cwd: root });
    await gitExec("git", ["config", "user.name", "Test"], { cwd: root });
    await writeFile(join(root, "seed.txt"), "seed", "utf8");
    await gitExec("git", ["add", "seed.txt"], { cwd: root });
    await gitExec("git", ["commit", "-m", "seed"], { cwd: root });
    const { stdout: head } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const notesDir = join(root, ".git", "refs", "notes");
    await mkdir(notesDir, { recursive: true });
    await writeFile(join(notesDir, "corrupt"), "not-an-object\n", "utf8");

    const note = await createUserIOContext().readNote("refs/notes/corrupt", head);

    expect(note).toBeNull();
  });
});
