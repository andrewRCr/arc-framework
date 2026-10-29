/** Cancellation owns backpressured stdin through controller settlement for every input adapter. */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { expect, it, onTestFinished } from "vitest";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";
import { quoteShellArgument } from "../../src/lib/release/commit-message-retry.js";

const run = promisify(execFile);

it.each(["native raw", "execa raw", "execa stdin", "execa plain"])("settles backpressured %s input without an unhandled stream error and permits the next invocation", async (variant) => {
  const root = await createTempRepoCore();
  const ready = join(root, "input-ready"), blocked = join(root, "blocked-input.mjs"), driver = join(root, "cancel-input.mjs");
  onTestFinished(async () => {
    const pid = Number(await readFile(ready, "utf8").catch(() => ""));
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, "SIGKILL"); } catch { /* The cancellation already ended its owned child. */ }
    }
    await removeGitBackedDir(root);
  });
  await writeFile(blocked, `import { writeFileSync, writeSync } from "node:fs";
writeSync(1, Buffer.from([65, 0, 128, 255]));
writeSync(2, "Pending input child ready");
writeFileSync(process.argv[2], String(process.pid));
process.stdin.pause();
setInterval(() => {}, 1000);
`);
  await writeFile(driver, `import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
const [nativeSource, execaSource, cwd, ready, alias, variant] = process.argv.slice(2);
const { createSpawnRawGitExec } = await import(nativeSource);
const { createExecaRawGitExec, createExecaGitExecInput, createExecaGitExec } = await import(execaSource);
const controller = new AbortController();
const raw = variant === "native raw" ? createSpawnRawGitExec(cwd) : createExecaRawGitExec(cwd);
const stdin = createExecaGitExecInput(), plain = createExecaGitExec();
const invoke = (args, input, signal) => variant === "execa stdin"
  ? stdin(args, input.toString("utf8"), { cwd, signal })
  : variant === "execa plain" ? plain("git", args, { cwd, input: input.toString("utf8"), signal })
    : raw(args, { input, signal });
const processes = async () => {
  const { stdout } = process.platform === "win32"
    ? await promisify(execFile)("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.CommandLine)" }'])
    : await promisify(execFile)("ps", ["-A", "-o", "pid=,args="]);
  return stdout.split(/\\r?\\n/u).flatMap(line => {
    const match = /^\\s*(\\d+)\\s+(.*)$/u.exec(line);
    return match ? [{ pid: Number(match[1]), command: match[2] }] : [];
  });
};
let settled = false;
const pending = invoke(["--git-dir=" + cwd + "/.git", "-c", "alias.arc-input-probe=" + alias, "arc-input-probe"],
  Buffer.alloc(16 * 1024 * 1024, 65), controller.signal).then(
    () => { settled = true; return { kind: "unexpected-success" }; }, error => { settled = true; return error; });
try {
  let started = false;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await access(ready).then(() => true, () => false)) { started = true; break; }
    await delay(10);
  }
  assert(started, "The child must start without consuming its 16 MiB input");
  await delay(25);
  assert.equal(settled, false, "Input must remain pending before cancellation");
  // The alias carries the marker in forward-slash form on Windows, as the shell needs it.
  const marker = ready.replaceAll("\\\\", "/");
  const owned = (await processes()).filter(row => row.pid !== process.pid && row.command.replaceAll("\\\\", "/").includes(marker))
    .map(row => row.pid);
  assert(owned.length >= 2, "Observe Git and its blocked input consumer before cancellation");
  controller.abort();
  const failure = await Promise.race([pending, delay(2500, undefined, { ref: false }).then(() => ({ kind: "still-running" }))]);
  assert.equal(failure.kind, "canceled");
  assert.equal(failure.isCanceled, true);
  assert.equal(failure.stdout, Buffer.from([65, 0, 128, 255]).toString(variant.endsWith("raw") ? "latin1" : "utf8"));
  assert.equal(failure.stderr, "Pending input child ready");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!(await processes()).some(row => owned.includes(row.pid) && !row.command.includes("<defunct>"))) break;
    await delay(10);
  }
  assert.deepEqual((await processes()).filter(row => owned.includes(row.pid) && !row.command.includes("<defunct>")), []);
  const next = await invoke(["hash-object", "--stdin"], Buffer.from("after cancellation"));
  assert.match(typeof next === "string" ? next : (typeof next.stdout === "string" ? next.stdout : Buffer.from(next.stdout).toString("utf8")), /^[0-9a-f]{40,64}\\n?$/u);
  await delay(25); // Late unhandled rejections or stream errors must still fail this isolated controller.
  process.stdout.write(JSON.stringify({ kind: failure.kind, isCanceled: failure.isCanceled, nextSucceeded: true, cleaned: owned.length }));
} finally { controller.abort(); }
`);
  const shellPath = (value: string) => quoteShellArgument(process.platform === "win32" ? value.replaceAll("\\", "/") : value);
  const alias = `!${shellPath(process.execPath)} ${shellPath(blocked)} ${shellPath(ready)}`;
  const { stdout } = await run(process.execPath, ["--unhandled-rejections=strict", "--import", "tsx", driver,
    new URL("../../src/lib/change-facts.ts", import.meta.url).href,
    new URL("../../src/lib/git/process-executor.ts", import.meta.url).href, root, ready, alias, variant], {
    cwd: process.cwd(), timeout: 15_000,
    env: { ...process.env, FORCE_COLOR: undefined, LC_ALL: "C", LANG: "C" },
  });
  expect(JSON.parse(stdout)).toMatchObject({ kind: "canceled", isCanceled: true, nextSucceeded: true });
  expect(JSON.parse(stdout).cleaned).toBeGreaterThanOrEqual(2);
}, 20_000);

it.skipIf(process.platform === "win32")("cancels a backpressured native batch reader and reopens the same scope without stream errors", async () => {
  const root = await createTempRepoCore();
  const driver = join(root, "cancel-batch-input.mjs"), ready = join(root, "batch-pids");
  onTestFinished(async () => {
    const pids = await readFile(ready, "utf8").then(text => text.trim().split(/\s+/u).map(Number), () => []);
    for (const pid of pids) {
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, "SIGKILL"); } catch { /* Already reaped by cancellation or scope close. */ }
      }
    }
    await removeGitBackedDir(root);
  });
  await writeFile(driver, String.raw`import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
const [executorSource, batchSource, cwd, ready] = process.argv.slice(2);
const { createExecaRawGitExec } = await import(executorSource);
const { GitBatchReadScope } = await import(batchSource);
const scope = new GitBatchReadScope(), controller = new AbortController(), pids = [];
const raw = createExecaRawGitExec(cwd), args = ["--git-dir=" + cwd + "/.git", "cat-file", "--batch"];
const options = { objectAccess: "local-only", batchReader: scope };
const processes = async () => {
  const { stdout } = await promisify(execFile)("ps", ["-A", "-o", "pid=,stat=,args="]);
  return stdout.split(/\r?\n/u).flatMap(line => {
    const match = /^\s*(\d+)\s+(\S+)\s+(.*)$/u.exec(line);
    return match ? [{ pid: Number(match[1]), state: match[2], command: match[3] }] : [];
  });
};
const readers = async () => (await processes()).filter(row =>
  row.command.includes(args[0]) && /cat-file --batch(?:\s|$)/u.test(row.command));
const remember = async pid => { pids.push(pid); await writeFile(ready, pids.join("\n")); };
let pending;
try {
  const content = Buffer.from("batch reader remains usable");
  const oid = Buffer.from((await raw(["hash-object", "-w", "--stdin"], { input: content })).stdout).toString("utf8").trim();
  const input = Buffer.from(oid + "\n"), expected = Buffer.concat([Buffer.from(oid + " blob " + content.length + "\n"), content, Buffer.from("\n")]);
  assert.deepEqual(Buffer.from((await raw(args, { ...options, input })).stdout), expected);
  const initial = await readers();
  assert.equal(initial.length, 1, "The ordinary raw route must create a native persistent cat-file process");
  const pid = initial[0].pid;
  await remember(pid);
  assert.deepEqual(Buffer.from((await raw(args, { ...options, input })).stdout), expected);
  assert.deepEqual((await readers()).map(row => row.pid), [pid], "Successful reads must reuse the same native process");
  // Stop real Git after warm-up: it cannot drain stdin while the next 16 MiB write is pending.
  process.kill(pid, "SIGSTOP");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await readers()).some(row => row.pid === pid && row.state.includes("T"))) break;
    await delay(10);
  }
  assert((await readers()).some(row => row.pid === pid && row.state.includes("T")), "Git must be stopped before input admission");
  let settled = false;
  pending = raw(args, { ...options, input: Buffer.from("A".repeat(16 * 1024 * 1024 - 1) + "\n"), signal: controller.signal })
    .then(() => { settled = true; return { kind: "unexpected-success" }; }, error => { settled = true; return error; });
  await delay(25);
  assert.equal(settled, false, "The persistent reader's oversized write must remain pending");
  assert((await readers()).some(row => row.pid === pid && row.state.includes("T")), "The same native reader remains unable to consume input");
  controller.abort();
  const failure = await Promise.race([pending, delay(2500, undefined, { ref: false }).then(() => ({ kind: "still-running" }))]);
  assert.equal(failure.kind, "canceled");
  assert.equal(failure.isCanceled, true);
  assert(!(await processes()).some(row => row.pid === pid && !row.state.startsWith("Z")), "Cancellation must reap the stopped reader");
  assert.deepEqual(Buffer.from((await raw(args, { ...options, input })).stdout), expected);
  const reopened = await readers();
  assert.equal(reopened.length, 1);
  assert.notEqual(reopened[0].pid, pid, "The canceled reader must be evicted from the same scope");
  await remember(reopened[0].pid);
  await scope.close();
  assert.deepEqual(await readers(), [], "Scope close must reap the replacement reader");
  await delay(25); // Observe late unhandled rejection/stream-error crashes in this isolated controller.
  process.stdout.write(JSON.stringify({ kind: failure.kind, isCanceled: failure.isCanceled, nextSucceeded: true, cleaned: pids.length }));
} finally {
  controller.abort();
  for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch {} }
  await pending;
  await scope.close();
}
`);
  const { stdout } = await run(process.execPath, ["--unhandled-rejections=strict", "--import", "tsx", driver,
    new URL("../../src/lib/git/process-executor.ts", import.meta.url).href,
    new URL("../../src/lib/git/batch-reader.ts", import.meta.url).href, root, ready], {
    cwd: process.cwd(), timeout: 15_000,
    env: { ...process.env, FORCE_COLOR: undefined, LC_ALL: "C", LANG: "C" },
  });
  expect(JSON.parse(stdout)).toEqual({ kind: "canceled", isCanceled: true, nextSucceeded: true, cleaned: 2 });
}, 20_000);
