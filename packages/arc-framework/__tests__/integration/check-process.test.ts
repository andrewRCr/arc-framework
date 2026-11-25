/** Declared check commands report a short notice through a file the process boundary names and removes. */
import { execFileSync } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runCheckProcess } from "../../src/lib/checks/process.js";
import { bindCapturedEnvironment, captureEnvironmentInputs } from "../../src/lib/checks/environment-inputs.js";

const roots: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function checkout(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-check-process-"));
  roots.push(root);
  return root;
}

it.each(["PATH", "absolute"] as const)("reports an unresolved %s executable as never started and runs it after repair", async lookup => {
  const root = await checkout();
  const bin = join(root, "bin");
  await mkdir(bin);
  const executable = join(bin, process.platform === "win32" ? "native-check.cmd" : "native-check");
  const command = lookup === "absolute" ? executable : "native-check";
  const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "PATH"));
  environment[process.platform === "win32" ? "pAtH" : "PATH"] = bin;
  const missing = await runCheckProcess([command], root, undefined, { environment });
  expect(missing).toMatchObject({ started: false, exitCode: 1, stdout: "" });
  await writeFile(executable, process.platform === "win32" ? "@echo repaired\r\n" : "#!/bin/sh\nprintf 'repaired\\n'\n", { mode: 0o755 });
  const repaired = await runCheckProcess([command], root, undefined, { environment });
  expect(repaired).toMatchObject({ started: true, exitCode: 0, stdout: "repaired" });
});

function writesNotice(text: string): string[] {
  return [process.execPath, "-e",
    `require("node:fs").writeFileSync(process.env.ARC_CHECK_NOTICE, ${JSON.stringify(text)}); console.log(process.env.ARC_CHECK_NOTICE)`];
}

it("joins every line a command and its runner write to the notice file, then removes the file", async () => {
  const result = await runCheckProcess(writesNotice("\n  ran locally: build-vm unreachable  \n\nwaited 8m 13s for the heavy-test slot\n"), await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0, notice: "ran locally: build-vm unreachable; waited 8m 13s for the heavy-test slot" });
  await expect(access(result.stdout)).rejects.toMatchObject({ code: "ENOENT" });
});

it("bounds a notice to one short line", async () => {
  const result = await runCheckProcess(writesNotice("x".repeat(500)), await checkout());
  expect(result.notice).toBe("x".repeat(200));
});

it("keeps a notice to plain text on one line", async () => {
  const result = await runCheckProcess(writesNotice("connecting\rran\u001b[2K on\tbuild-vm\nsecond line"), await checkout());
  expect(result.notice).toBe("connecting; ran [2K on build-vm; second line");
  const later = await runCheckProcess(writesNotice("\r\nran\u001b[2K on\tbuild-vm"), await checkout());
  expect(later.notice).toBe("ran [2K on build-vm");
});

it("reads only the start of a notice file", async () => {
  const result = await runCheckProcess([process.execPath, "-e",
    "require(\"node:fs\").writeFileSync(process.env.ARC_CHECK_NOTICE, \"\\n\".repeat(64 * 1024) + \"late line\")"], await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0 });
  expect(result).not.toHaveProperty("notice");
});

it("runs the command without a notice file when none can be created", async () => {
  const root = await checkout();
  const unusable = join(root, "not-a-directory");
  await writeFile(unusable, "");
  for (const name of ["TMPDIR", "TMP", "TEMP"]) vi.stubEnv(name, unusable);
  vi.stubEnv("ARC_CHECK_NOTICE", "/inherited/notice");
  const result = await runCheckProcess([process.execPath, "-e", "console.log(process.env.ARC_CHECK_NOTICE ?? \"unset\")"], root);
  expect(result).toMatchObject({ started: true, exitCode: 0, stdout: "unset" });
  expect(result).not.toHaveProperty("notice");
});

it("reports no notice when the command writes none, and replaces an inherited notice path", async () => {
  vi.stubEnv("ARC_CHECK_NOTICE", "/inherited/notice");
  const result = await runCheckProcess([process.execPath, "-e", "console.log(process.env.ARC_CHECK_NOTICE)"], await checkout());
  expect(result).toMatchObject({ started: true, exitCode: 0 });
  expect(result.stdout).not.toBe("/inherited/notice");
  expect(result).not.toHaveProperty("notice");
});

it("recognizes a runner's not-run line before truncating the display notice", async () => {
  const command = writesNotice("ran remotely: " + "x".repeat(220) + "\nnot run: VM connection dropped\n");
  command[2] += "; process.exitCode = 1";
  const result = await runCheckProcess(command, await checkout());
  expect(result).toMatchObject({ started: true, notRunReason: "VM connection dropped" });
  expect(result.notice).toHaveLength(200);
});

it.each([
  { text: "not run: successful command's advisory", exit: 0 },
  { text: "diagnostic mentions not run: without a marker", exit: 1 },
])("requires a nonzero exit and a line-prefix marker: $text", async ({ text, exit }) => {
  const command = writesNotice(text);
  command[2] += `; process.exitCode = ${exit}`;
  const result = await runCheckProcess(command, await checkout());
  expect(result.exitCode).toBe(exit);
  expect(result).not.toHaveProperty("notRunReason");
});

it.each([false, true])("scopes command and raw-output probe environments, rawStdout=%s", async rawStdout => {
  vi.stubEnv("GIT_DIR", "/other");
  vi.stubEnv("git_dir", "/other");
  vi.stubEnv("GiT_WoRk_TrEe", "/other");
  vi.stubEnv("ARC_REMOTE_CHECKS", "required");
  const result = await runCheckProcess([process.execPath, "-e",
    "process.stdout.write(JSON.stringify({selectors:Object.keys(process.env).filter(k=>['GIT_DIR','GIT_WORK_TREE'].includes(k.toUpperCase())),control:process.env.ARC_REMOTE_CHECKS})+'\\n')"],
  await checkout(), undefined, { rawStdout });

  expect(result).toMatchObject({ started: true, exitCode: 0 });
  expect(JSON.parse(result.stdout)).toEqual({ selectors: [], control: "required" });
  expect(result.stdout.endsWith("\n")).toBe(rawStdout);
});

it.each([false, true])("replays supplied frozen inputs before engine channels, filesMode=%s", async filesMode => {
  const root = await checkout();
  await writeFile(join(root, "input"), "captured bytes");
  const capture = await captureEnvironmentInputs({ MODE: "value", DATA: "file", ABSENT: "value" }, root,
    { environment: { MODE: "literal value", DATA: "input" } });
  try {
    const environment = bindCapturedEnvironment(capture.bindings, { ...process.env, MODE: "ambient", ABSENT: "ambient",
      GIT_DIR: "/wrong/repository", GIT_INDEX_FILE: "/wrong/index", ARC_CHECK_TREE: "wrong", ARC_CHECK_BASE: "wrong",
      ARC_CHECK_MERGED: "wrong", ARC_CHECK_NOTICE: "/wrong/notice", arc_check_tree: "wrong" });
    const program = "process.stdout.write(JSON.stringify({mode:process.env.MODE,data:require('node:fs').readFileSync(process.env.DATA,'utf8'),absent:process.env.ABSENT,git:process.env.GIT_DIR,index:process.env.GIT_INDEX_FILE,tree:process.env.ARC_CHECK_TREE,base:process.env.ARC_CHECK_BASE,merged:process.env.ARC_CHECK_MERGED,mixed:Object.entries(process.env).find(([name])=>name==='arc_check_tree')?.[1],noticeReplaced:process.env.ARC_CHECK_NOTICE!=='/wrong/notice'}))";
    const result = await runCheckProcess([process.execPath, "-e", program], root,
      filesMode ? { tree: "checked", base: "base", merged: ["parent"] } : undefined,
      { environment, rawStdout: true, ...(filesMode ? { indexFile: "/selected/index" } : {}) });
    expect(result).toMatchObject({ started: true, exitCode: 0 });
    expect(JSON.parse(result.stdout)).toEqual({ mode: "literal value", data: "captured bytes", noticeReplaced: true,
      ...(filesMode ? { tree: "checked", base: "base", merged: "parent", index: "/selected/index" } : {}) });
  } finally { await capture.dispose(); }
});

it.runIf(process.platform !== "win32")("refuses a writer-less FIFO input promptly and captures its repaired regular file", async () => {
  const root = await checkout();
  execFileSync("mkfifo", [join(root, "pipe.secret")]);
  const refused = captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: "pipe.secret" } });
  await expect(refused).rejects.toThrow(/environment_inputs binding INPUT:.*regular file.*retry/u);
  await expect(refused).rejects.not.toThrow("pipe.secret");
  await writeFile(join(root, "repaired"), "usable");
  const repaired = await captureEnvironmentInputs({ INPUT: "file" }, root, { environment: { INPUT: "repaired" } });
  try { expect(repaired.bindings.INPUT).toMatchObject({ state: "file", bytes: 6 }); }
  finally { await repaired.dispose(); }
}, 2000);
