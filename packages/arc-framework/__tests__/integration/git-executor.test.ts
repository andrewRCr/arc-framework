import { execPath } from "node:process";
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createUserIOContext,
  gitExec,
  gitExecInput,
  prepareGitRefVerification,
  readGitBlobBytes,
} from "../../src/lib/io-context.js";
import { boundedFetch, boundedGitInvocation } from "../../src/lib/git/exec.js";
import { deleteRemoteBranch } from "../../src/lib/work-unit/mutators/reconcile-branch.js";
import {
  createExecaGitExec,
  createExecaGitExecInput,
  MAX_GIT_OUTPUT_BYTES,
} from "../../src/lib/git/process-executor.js";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { realGitDiff } from "../../src/handlers/installation.js";

const tempDirs: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("production GitExec", () => {
  it("uses argument arrays, cwd, raw stderr, and compatible stdout normalization", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-git-"));
    tempDirs.push(root);
    const canonicalRoot = await realpath(root);
    const script = [
      "process.stdout.write(`${process.cwd()}\\n${process.argv[1]}\\n\\n`);",
      "process.stderr.write('diagnostic\\n');",
    ].join("");

    const result = await gitExec(execPath, ["-e", script, "argument with spaces"], { cwd: root });
    const [reportedCwd, argument] = result.stdout.split("\n");

    expect(reportedCwd).toBeDefined();
    expect(await realpath(reportedCwd ?? "")).toBe(canonicalRoot);
    expect(argument).toBe("argument with spaces");
    expect(result.stderr).toBe("diagnostic\n");
  });

  it("captures stdout beyond the execFile default buffer under the 64 MiB ceiling", async () => {
    expect(MAX_GIT_OUTPUT_BYTES).toBe(64 * 1024 * 1024);
    const outputBytes = (1024 * 1024) + 1;

    const result = await gitExec(execPath, [
      "-e",
      `process.stdout.write("x".repeat(${outputBytes}))`,
    ]);

    expect(result.stdout).toHaveLength(outputBytes);
  });

  it("scrubs repository-local variables when cwd selects the repository", async () => {
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

  it("preserves inherited environment when an alternate index is supplied without cwd", async () => {
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

  it("applies forbidden terminal policy per invocation without blocking explicit process completion", async () => {
    const exec = createExecaGitExec();
    const forbidden = {
      terminalPrompts: "forbidden",
      presenters: "forbidden",
      ambientStdin: "closed",
    } as const;
    const script = [
      "let input = '';",
      "process.stdin.on('data', (chunk) => { input += chunk; });",
      "process.stdin.on('end', () => process.stdout.write(JSON.stringify({",
      "terminal: process.env.GIT_TERMINAL_PROMPT,",
      "editor: process.env.GIT_EDITOR,",
      "pager: process.env.GIT_PAGER,",
      "input",
      "})));",
    ].join("");

    const forbiddenResult = await exec(execPath, ["-e", script], { interaction: forbidden });
    expect(JSON.parse(forbiddenResult.stdout)).toEqual({
      terminal: "0",
      editor: "true",
      pager: "cat",
      input: "",
    });

    const ordinary = await exec(execPath, ["-e", "process.stdout.write(process.env.GIT_TERMINAL_PROMPT ?? 'unset')"]);
    expect(ordinary.stdout).toBe(process.env.GIT_TERMINAL_PROMPT ?? "unset");
  });

  it("pins diagnostics to the stable C locale only when requested", async () => {
    const script = "process.stdout.write(JSON.stringify({ LC_ALL: process.env.LC_ALL, LANG: process.env.LANG }))";

    const stable = await gitExec(execPath, ["-e", script], { diagnosticLocale: "stable" });
    expect(JSON.parse(stable.stdout)).toEqual({ LC_ALL: "C", LANG: "C" });

    const ordinary = await gitExec(execPath, ["-e", script]);
    expect(JSON.parse(ordinary.stdout)).toEqual({
      LC_ALL: process.env.LC_ALL,
      LANG: process.env.LANG,
    });
  });

  it("normalizes non-zero, canceled, output-limit, and spawn failures", async () => {
    await expect(gitExec("git", ["not-a-command"])).rejects.toMatchObject({
      kind: "nonzero-exit",
      exitCode: 1,
    });

    const controller = new AbortController();
    const canceled = gitExec(execPath, ["-e", "setInterval(() => {}, 1_000)"], {
      signal: controller.signal,
    });
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ kind: "canceled", isCanceled: true });

    const limitedExec = createExecaGitExec(128);
    const limited = limitedExec(execPath, ["-e", "process.stdout.write('x'.repeat(1_024))"]);
    await expect(limited).rejects.toSatisfy((error: unknown) => {
      return isGitProcessError(error)
        && error.kind === "output-limit"
        && error.isMaxBuffer
        && error.stdout.length > 0
        && error.stdout.length <= 128;
    });

    const spawnRoot = await mkdtemp(join(tmpdir(), "arc-execa-spawn-"));
    tempDirs.push(spawnRoot);
    await expect(gitExec("git", ["--version"], { cwd: join(spawnRoot, "missing") }))
      .rejects.toMatchObject({ kind: "spawn-failure" });
  });

  it("classifies a missing branch fetched from a local bare remote", async () => {
    const root = await createGitRepo("arc-absent-ref-");
    const remote = await mkdtemp(join(tmpdir(), "arc-absent-ref-remote-"));
    tempDirs.push(remote);
    await gitExec("git", ["init", "--bare"], { cwd: remote });
    await gitExec("git", ["remote", "add", "origin", remote], { cwd: root });
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const result = await boundedFetch(boundExec, "missing-branch", 1_000);

    expect(result.outcome).toBe("error");
    if (result.outcome !== "error") return;
    expect(result.error).toMatchObject({
      kind: "nonzero-exit",
      exitCode: 128,
      expectedOutcome: "absent-remote-ref",
    });
  });

  it("relabels only a caller-aborted production invocation as timeout", async () => {
    const root = await createGitRepo("arc-bounded-timeout-");
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const result = await boundedGitInvocation(boundExec, ["cat-file", "--batch"], 25);

    expect(result).toEqual({ outcome: "timeout" });
  });

  it("classifies a real rejected production lease as stale", async () => {
    const root = await createGitRepo("arc-stale-lease-");
    const remote = await mkdtemp(join(tmpdir(), "arc-stale-lease-remote-"));
    tempDirs.push(remote);
    await gitExec("git", ["init", "--bare"], { cwd: remote });
    await gitExec("git", ["remote", "add", "origin", remote], { cwd: root });
    const { stdout: expectedOid } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    await gitExec("git", ["push", "origin", `HEAD:refs/heads/lease-race`], { cwd: root });
    await writeFile(join(root, "seed.txt"), "advanced", "utf8");
    await gitExec("git", ["commit", "-am", "advance lease target"], { cwd: root });
    await gitExec("git", ["push", "origin", `HEAD:refs/heads/lease-race`], { cwd: root });
    const boundExec = (command: string, args: string[], options = {}) =>
      gitExec(command, args, { ...options, cwd: root });

    const outcome = await deleteRemoteBranch(boundExec, "origin", "lease-race", expectedOid);

    expect(outcome).toBe("stale");
  });
});

describe("production GitExecInput", () => {
  it("feeds stdin unchanged and preserves raw stdout", async () => {
    const input = "payload with spaces\nand a final newline\n";

    const stdout = await gitExecInput(["hash-object", "--stdin"], input);
    const second = await gitExecInput(["hash-object", "--stdin"], input);

    expect(stdout).toMatch(/^[0-9a-f]{40,64}\n$/u);
    expect(second).toBe(stdout);
  });

  it("pins stdin-fed Git plumbing to an explicit repository", async () => {
    const root = await createGitRepo("arc-execa-input-cwd-");
    const input = `repository-local-${root}\n`;

    const object = (await gitExecInput(["hash-object", "-w", "--stdin"], input, { cwd: root })).trim();
    const stored = await gitExec("git", ["cat-file", "-p", object], { cwd: root });

    expect(stored.stdout).toBe(input.trimEnd());
  });

  it("retains partial process-capped output in typed output-limit failures", async () => {
    const limitedInput = createExecaGitExecInput(256);
    const input = "HEAD\n".repeat(100);

    await expect(limitedInput(["cat-file", "--batch-check"], input)).rejects.toSatisfy((error: unknown) => {
      return isGitProcessError(error)
        && error.kind === "output-limit"
        && error.stdout.length > 0
        && error.diagnosticStdout.length <= error.stdout.length
        && error.expectedOutcome === undefined;
    });
  });
});

describe("installation diff adapter", () => {
  it("keeps no-change and changed exit statuses as domain results", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-diff-"));
    tempDirs.push(root);
    const left = join(root, "left.txt");
    const right = join(root, "right.txt");
    await writeFile(left, "same\n", "utf8");
    await writeFile(right, "same\n", "utf8");

    await expect(realGitDiff(left, right)).resolves.toBe("");
    await writeFile(right, "different\n", "utf8");
    await expect(realGitDiff(left, right)).resolves.toContain("different");
  });

  it("rejects spawn failures through the typed taxonomy", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-execa-diff-spawn-"));
    tempDirs.push(root);
    const invalidExecutable = join(root, "invalid-git.exe");
    await writeFile(invalidExecutable, "not an executable", "utf8");

    await expect(realGitDiff("left", "right", invalidExecutable))
      .rejects.toSatisfy((error: unknown) => isGitProcessError(error) && error.kind === "spawn-failure");
  });
});

describe("process-backed IO adapters", () => {
  it("preserves terminal execa failures from prepared ref verification", async () => {
    const root = await createGitRepo("arc-ref-verification-failure-");
    const { stdout: head } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const { stdout: ref } = await gitExec("git", ["symbolic-ref", "HEAD"], { cwd: root });
    const hook = join(root, ".git", "hooks", "reference-transaction");
    await writeFile(hook, [
      "#!/bin/sh",
      'if [ "$1" = "prepared" ]; then',
      "  echo 'reference transaction denied' >&2",
      "  exit 1",
      "fi",
      "",
    ].join("\n"), "utf8");
    await chmod(hook, 0o755);

    await expect(prepareGitRefVerification(root, ref, head)).rejects.toSatisfy((error: unknown) => {
      return isGitProcessError(error)
        && error.kind === "nonzero-exit"
        && error.cause !== undefined
        && error.stderr.includes("reference transaction denied");
    });
  });

  it("holds a prepared ref verification lock until release", async () => {
    const root = await createGitRepo("arc-ref-verification-");
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

  it("preserves arbitrary index and tree blob bytes while distinguishing absence from invalid refs", async () => {
    const root = await createGitRepo("arc-read-git-blob-");
    const bytes = new Uint8Array([0, 1, 2, 10, 13, 127, 128, 254, 255]);
    await writeFile(join(root, "binary.dat"), bytes);
    await gitExec("git", ["add", "binary.dat"], { cwd: root });

    await expect(readGitBlobBytes(root, null, "binary.dat")).resolves.toEqual(bytes);
    await gitExec("git", ["commit", "-m", "binary"], { cwd: root });
    await expect(readGitBlobBytes(root, "HEAD", "binary.dat")).resolves.toEqual(bytes);

    await expect(readGitBlobBytes(root, "HEAD", "missing.txt")).resolves.toBeNull();
    await expect(readGitBlobBytes(root, "missing-ref", "seed.txt")).rejects.toSatisfy(isGitProcessError);
  });

  it("returns null when a notes ref is corrupt", async () => {
    const root = await createGitRepo("arc-read-note-");
    const { stdout: head } = await gitExec("git", ["rev-parse", "HEAD"], { cwd: root });
    const notesDir = join(root, ".git", "refs", "notes");
    await mkdir(notesDir, { recursive: true });
    await writeFile(join(notesDir, "corrupt"), "not-an-object\n", "utf8");

    await expect(createUserIOContext().readNote("refs/notes/corrupt", head)).resolves.toBeNull();
  });

  it("writes and reads large note content through execa stdin without interpolation", async () => {
    const root = await createGitRepo("arc-large-note-");
    vi.stubEnv("GIT_AUTHOR_NAME", "ARC Test");
    vi.stubEnv("GIT_AUTHOR_EMAIL", "arc-test@example.com");
    vi.stubEnv("GIT_COMMITTER_NAME", "ARC Test");
    vi.stubEnv("GIT_COMMITTER_EMAIL", "arc-test@example.com");
    const ref = `refs/notes/arc-execa-test-${process.pid}`;
    const content = `literal $() and spaces\n${"payload\n".repeat(32_768)}`;
    const ambientNotesBefore = await gitExec(
      "git",
      ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/notes"],
      { cwd: process.cwd() },
    );

    try {
      await gitExecInput(
        ["notes", `--ref=${ref}`, "add", "-f", "-F", "-", "HEAD"],
        content,
        { cwd: root },
      );
      await expect(gitExec("git", ["notes", `--ref=${ref}`, "show", "HEAD"], { cwd: root }))
        .resolves.toMatchObject({ stdout: content.trimEnd() });
    } finally {
      await gitExec("git", ["update-ref", "-d", ref], { cwd: root });
    }
    await expect(gitExec(
      "git",
      ["for-each-ref", "--format=%(refname)%09%(objectname)", "refs/notes"],
      { cwd: process.cwd() },
    )).resolves.toEqual(ambientNotesBefore);
  });
});

async function createGitRepo(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(root);
  await gitExec("git", ["init"], { cwd: root });
  await gitExec("git", ["config", "user.email", "test@example.com"], { cwd: root });
  await gitExec("git", ["config", "user.name", "Test"], { cwd: root });
  await writeFile(join(root, "seed.txt"), "seed", "utf8");
  await gitExec("git", ["add", "seed.txt"], { cwd: root });
  await gitExec("git", ["commit", "-m", "seed"], { cwd: root });
  return root;
}
