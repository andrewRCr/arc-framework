import { removeGitBackedDirs } from "../helpers/temp-repo.js";
import { execFile } from "node:child_process";
import { access, chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createExecaGitExec, createExecaGitExecInput, createExecaRawGitExec } from "../../src/lib/git/process-executor.js";
import { createSpawnRawGitExec } from "../../src/lib/change-facts.js";
import type { GitExecOptions } from "../../src/lib/git/exec.js";

const execFileAsync = promisify(execFile);
const exec = createExecaGitExec();
const roots: string[] = [];
const children = new Set<number>();

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const pid of children) kill(pid);
  children.clear();
  await removeGitBackedDirs(roots.splice(0));
});

function kill(pid: number): void {
  try { process.kill(pid, "SIGKILL"); } catch { /* Already exited. */ }
}

async function processes(): Promise<{ pid: number; parent: number; command: string }[]> {
  const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid=,ppid=,args="]);
  return stdout.trim().split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/u.exec(line);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] ?? "" }] : [];
  });
}

async function waitForProcess(token: string): Promise<number> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const child = (await processes()).find((row) => row.command.includes(token) && /^(?:\S*\/)?git(?:\s|$)/u.test(row.command));
    if (child) {
      children.add(child.pid);
      return child.pid;
    }
    await delay(10);
  }
  throw new Error(`Git process did not become ready: ${token}`);
}

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-git-cancel-"));
  roots.push(root);
  await exec("git", ["init", root]);
  await exec("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-m", "seed"], { cwd: root });
  return root;
}

async function canceledWithin(pending: Promise<unknown>, controller: AbortController): Promise<void> {
  const started = performance.now();
  controller.abort();
  const result = await Promise.race([
    pending.then(() => ({ kind: "completed" }), (error: unknown) => error),
    delay(900).then(() => ({ kind: "still-running" })),
  ]);
  expect(result).toMatchObject({ kind: "canceled", isCanceled: true });
  expect(performance.now() - started).toBeLessThan(1_000);
}

describe.skipIf(process.platform === "win32")("Git process cancellation", () => {
  it.each(["stdin", "raw", "native raw"])("ends a %s ref update waiting on another writer's lock", async (variant) => {
    const root = await repository();
    const ref = `refs/heads/${basename(root)}`;
    await mkdir(join(root, ".git", "refs", "heads"), { recursive: true });
    await writeFile(join(root, ".git", `${ref}.lock`), "held");
    const { stdout: oid } = await exec("git", ["rev-parse", "HEAD"], { cwd: root });
    const controller = new AbortController();
    const options = { cwd: root, signal: controller.signal };
    const args = [`--git-dir=${join(root, ".git")}`, "-c", "core.filesRefLockTimeout=30000", "update-ref", "--stdin"];
    const input = `update ${ref} ${oid}\n`;
    const pending = variant === "stdin"
      ? createExecaGitExecInput()(args, input, options)
      : (variant === "raw" ? createExecaRawGitExec() : createSpawnRawGitExec())(args, {
        ...options, input: Buffer.from(input),
      });
    void pending.catch(() => undefined);
    try {
      await waitForProcess(`--git-dir=${join(root, ".git")}`);
      await canceledWithin(pending, controller);
    } finally {
      controller.abort();
      for (const pid of children) kill(pid);
      await pending.catch(() => undefined);
    }
  });
});

function invoke(variant: string, args: string[], options: GitExecOptions): Promise<unknown> {
  if (variant === "plain") return exec("git", args, options);
  if (variant === "stdin") return createExecaGitExecInput()(args, "", options);
  return (variant === "raw" ? createExecaRawGitExec() : createSpawnRawGitExec())(args, options);
}

async function rememberTree(pid: number): Promise<number[]> {
  const rows = await processes();
  const tree = [pid];
  for (let index = 0; index < tree.length; index += 1) {
    for (const row of rows.filter((row) => row.parent === tree[index])) tree.push(row.pid);
  }
  for (const child of tree) children.add(child);
  return tree;
}

async function expectEnded(pids: number[]): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await processes();
    if (!rows.some((row) => pids.includes(row.pid) && !row.command.includes("<defunct>"))) return;
    await delay(5);
  }
  expect((await processes()).filter((row) => pids.includes(row.pid) && !row.command.includes("<defunct>"))).toEqual([]);
}

describe.skipIf(process.platform === "win32")("Git descendant cancellation", () => {
  it.each(["plain", "stdin", "raw", "native raw"])("ends the %s HTTP transport with its hung fetch", async (variant) => {
    const root = await repository();
    const sockets = new Set<Socket>();
    let admitted: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admitted = resolve; });
    const server = createServer(() => admitted?.());
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing local HTTP address");
    const controller = new AbortController();
    const pending = invoke(variant, [
      `--git-dir=${join(root, ".git")}`, "fetch", `http://127.0.0.1:${address.port}/repo`,
    ], { cwd: root, signal: controller.signal });
    void pending.catch(() => undefined);
    try {
      await ready;
      const pid = await waitForProcess(`--git-dir=${join(root, ".git")}`);
      const tree = await rememberTree(pid);
      expect(tree.length).toBeGreaterThan(1);
      await canceledWithin(pending, controller);
      await expectEnded(tree);
    } finally {
      controller.abort();
      for (const pid of children) kill(pid);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await pending.catch(() => undefined);
    }
  });

  it.each(["plain", "stdin", "raw", "native raw"])("ends the %s push hook and its sleeping child", async (variant) => {
    const root = await repository();
    const remote = await mkdtemp(join(tmpdir(), "arc-git-cancel-remote-"));
    roots.push(remote);
    await exec("git", ["init", "--bare", remote]);
    const ready = join(root, "hook-ready");
    const hook = join(root, ".git", "hooks", "pre-push");
    await writeFile(hook, `#!/bin/sh\nsleep 30 &\nhelper=$!\nprintf '%s\\n' "$$" "$helper" > '${ready}'\nwait "$helper"\n`);
    await chmod(hook, 0o755);
    const controller = new AbortController();
    const pending = invoke(variant, [
      `--git-dir=${join(root, ".git")}`, "push", remote, "HEAD:refs/heads/test",
    ], { cwd: root, signal: controller.signal });
    void pending.catch(() => undefined);
    try {
      let hookPids: number[] = [];
      for (let attempt = 0; attempt < 300; attempt += 1) {
        hookPids = await readFile(ready, "utf8").then((text) => text.trim().split("\n").map(Number), () => []);
        if (hookPids.length === 2) break;
        await delay(10);
      }
      expect(hookPids).toHaveLength(2);
      const pid = await waitForProcess(`--git-dir=${join(root, ".git")}`);
      const tree = await rememberTree(pid);
      expect(tree).toEqual(expect.arrayContaining(hookPids));
      await canceledWithin(pending, controller);
      await expectEnded(tree);
    } finally {
      controller.abort();
      for (const pid of children) kill(pid);
      await pending.catch(() => undefined);
    }
  });
});

describe.skipIf(process.platform === "win32")("Git cancellation admission and spawn policy", () => {
  it.each(["plain", "stdin", "raw", "native raw"])("refuses a pre-aborted %s invocation before its side effect", async (variant) => {
    const root = await repository();
    const sentinel = join(root, "should-not-exist");
    const controller = new AbortController();
    controller.abort(new Error("custom cancellation reason"));
    await expect(invoke(variant, ["-c", `alias.sentinel=!echo touched > '${sentinel}'`, "sentinel"], {
      cwd: root, signal: controller.signal,
    })).rejects.toMatchObject({ kind: "canceled", isCanceled: true });
    await expect(access(sentinel)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["plain", "stdin", "raw", "native raw"].flatMap((variant) => [
    { variant, withSignal: false }, { variant, withSignal: true },
  ]))("keeps the caller's process group for $variant with signal=$withSignal", async ({ variant, withSignal }) => {
    const root = await repository();
    const observed = join(root, "hook-process-group");
    const hook = join(root, ".git", "hooks", "reference-transaction");
    await writeFile(hook, `#!/bin/sh\nif [ "$1" = prepared ]; then ps -o pgid= -p $$ > '${observed}'; fi\n`);
    await chmod(hook, 0o755);
    const { stdout: parentGroup } = await execFileAsync("ps", ["-o", "pgid=", "-p", String(process.pid)]);
    const controller = new AbortController();
    await invoke(variant, ["update-ref", "refs/heads/normal-completion", "HEAD"], {
      cwd: root, ...(withSignal ? { signal: controller.signal } : {}),
    });
    expect((await readFile(observed, "utf8")).trim()).toBe(parentGroup.trim());
    const { stdout: ref } = await exec("git", ["rev-parse", "refs/heads/normal-completion"], { cwd: root });
    const { stdout: head } = await exec("git", ["rev-parse", "HEAD"], { cwd: root });
    expect(ref).toBe(head);
  });
});
