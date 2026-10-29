/** Native process boundary shared by declared checks and CI invocation playback. */
import { mkdtemp, open, rm } from "node:fs/promises";
import { constants, tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { whichCommandSync } from "which-command";
import { environmentForGitCwd, sanitizeGitRepositoryEnvironment } from "../git/process-executor.js";
import { displayLines, NOTICE_LIMIT } from "./display-text.js";
import { CHECK_EXECUTION_ENVIRONMENT, type CheckContentContext } from "./environment-policy.js";

/** The exit status a shell reports for a command a signal ended: 128 plus the signal's number. */
function signalExitCode(signal: NodeJS.Signals | undefined): number | undefined {
  const number = signal === undefined ? undefined : constants.signals[signal];
  return number === undefined ? undefined : 128 + number;
}

/** Bytes read from the start of a notice file, so a large write to it never reaches memory. */
const NOTICE_READ_BYTES = 4096;

function checkEnvironment(cwd: string, noticeFile?: string, content?: CheckContentContext, indexFile?: string, supplied?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const inherited = supplied === undefined ? environmentForGitCwd(cwd) ?? process.env : sanitizeGitRepositoryEnvironment(supplied);
  const env = Object.fromEntries(Object.entries(inherited).filter(([name]) => !CHECK_EXECUTION_ENVIRONMENT.has(name.toUpperCase())));
  if (noticeFile !== undefined) env.ARC_CHECK_NOTICE = noticeFile;
  if (indexFile !== undefined) env.GIT_INDEX_FILE = indexFile;
  if (content !== undefined) {
    env.ARC_CHECK_TREE = content.tree;
    if (content.base !== undefined) env.ARC_CHECK_BASE = content.base;
    if (content.merged?.length) env.ARC_CHECK_MERGED = content.merged.join(" ");
  }
  return env;
}

async function readNoticeStart(noticeFile: string): Promise<string> {
  const handle = await open(noticeFile, "r");
  try {
    const buffer = Buffer.alloc(NOTICE_READ_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function readNotice(noticeFile: string, exitCode: number): Promise<{ notice?: string; notRunReason?: string }> {
  // The command and a runner wrapping it may each write a line, so every line is kept.
  const lines = displayLines(await readNoticeStart(noticeFile).catch(() => ""));
  const notRun = exitCode === 0 ? undefined : lines.find(line => line.startsWith("not run:"));
  return { ...(lines.length === 0 ? {} : { notice: lines.join("; ").slice(0, NOTICE_LIMIT) }),
    ...(notRun === undefined ? {} : { notRunReason: notRun.slice("not run:".length).trim().slice(0, NOTICE_LIMIT) || "runner reported no check result" }) };
}

/**
 * Spawn a check through the same native executable and environment boundary as local requests. The command, and
 * any runner wrapping it, may append lines such as where it ran or how long it waited to the file `ARC_CHECK_NOTICE`
 * names; each appends rather than replacing the file, so neither erases the other's, and the lines are joined into
 * one short notice. A nonzero exit with a `not run:` line reports unavailable execution separately.
 * The notice is best effort: when no file can be created, the command runs without one.
 * @param command - Literal executable and arguments
 * @param cwd - Check working directory
 * @param content - Coordinates exposed to file checks
 * @param policy - Shell, output, checked-index and optional supplied child-environment policy
 * @returns Native execution status, with a signal's end reported as a shell's exit status for it, diagnostics, and
 * any notice the command reported
 */
export async function runCheckProcess(command: readonly string[], cwd: string, content?: CheckContentContext, policy: { shell?: boolean; rawStdout?: boolean; indexFile?: string; environment?: NodeJS.ProcessEnv } = {}): Promise<{ started: boolean; exitCode: number; stdout: string; output: string; notice?: string; notRunReason?: string }> {
  const noticeDirectory = await mkdtemp(join(tmpdir(), "arc-check-notice-")).catch(() => undefined);
  const noticeFile = noticeDirectory === undefined ? undefined : join(noticeDirectory, "notice");
  try {
    const executable = command[0] ?? "";
    const env = checkEnvironment(cwd, noticeFile, content, policy.indexFile, policy.environment);
    // An unresolved Windows command falls back to cmd.exe, whose failure is not a check result.
    if (process.platform === "win32" && !policy.shell && !resolvesOnWindows(executable, cwd, env)) {
      return { started: false, exitCode: 1, stdout: "", output: "Check executable was not found; check its path and PATH, then retry." };
    }
    const result = await execa(executable, command.slice(1), {
      cwd, env, extendEnv: false, stdin: "ignore",
      reject: false, shell: policy.shell ?? false, stripFinalNewline: !policy.rawStdout,
    });
    const started = result.exitCode !== undefined || result.signal !== undefined;
    const exitCode = result.exitCode ?? signalExitCode(result.signal) ?? 1;
    const notice = noticeFile === undefined ? {} : await readNotice(noticeFile, exitCode);
    return { started, exitCode, stdout: result.stdout,
      output: [result.stdout, result.stderr, ...(!started ? [result.originalMessage] : [])].filter(Boolean).join("\n"),
      ...notice };
  } finally {
    if (noticeDirectory !== undefined) await rm(noticeDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function resolvesOnWindows(executable: string, cwd: string, env: NodeJS.ProcessEnv): boolean {
  const pathName = Object.keys(env).reverse().find(name => name.toUpperCase() === "PATH");
  try { return whichCommandSync(executable, { cwd, path: pathName === undefined ? "" : env[pathName] ?? "" }) !== undefined; }
  catch { return false; }
}
