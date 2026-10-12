/** Native process boundary shared by declared checks and CI invocation playback. */
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { environmentForGitCwd } from "../git/process-executor.js";
import type { CheckContentContext } from "../../handlers/check/run.js";

/** Longest notice a check may report, so it stays one short line of the summary. */
const NOTICE_LIMIT = 200;
/** Bytes read from the start of a notice file, so a large write to it never reaches memory. */
const NOTICE_READ_BYTES = 4096;

function checkEnvironment(cwd: string, noticeFile?: string, content?: CheckContentContext, indexFile?: string): NodeJS.ProcessEnv {
  const env = { ...(environmentForGitCwd(cwd) ?? process.env) };
  delete env.ARC_CHECK_BASE;
  delete env.ARC_CHECK_TREE;
  delete env.ARC_CHECK_MERGED;
  delete env.ARC_CHECK_NOTICE;
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

async function readNotice(noticeFile: string): Promise<string | undefined> {
  const text = await readNoticeStart(noticeFile).catch(() => "");
  const line = text.split(/\r?\n/u).map(part => part.trim()).find(part => part !== "");
  return line?.slice(0, NOTICE_LIMIT);
}

/**
 * Spawn a check through the same native executable and environment boundary as local requests. The command may
 * write a one-line notice, such as where it ran, to the file `ARC_CHECK_NOTICE` names. The notice is best effort:
 * when no file can be created, the command runs without one.
 * @param command - Literal executable and arguments
 * @param cwd - Check working directory
 * @param content - Coordinates exposed to file checks
 * @param policy - Shell, output and checked-index policy
 * @returns Native execution status, diagnostics, and any notice the command reported
 */
export async function runCheckProcess(command: readonly string[], cwd: string, content?: CheckContentContext, policy: { shell?: boolean; rawStdout?: boolean; indexFile?: string } = {}): Promise<{ started: boolean; exitCode: number; stdout: string; output: string; notice?: string }> {
  const noticeDirectory = await mkdtemp(join(tmpdir(), "arc-check-notice-")).catch(() => undefined);
  const noticeFile = noticeDirectory === undefined ? undefined : join(noticeDirectory, "notice");
  try {
    const result = await execa(command[0] ?? "", command.slice(1), {
      cwd, env: checkEnvironment(cwd, noticeFile, content, policy.indexFile), extendEnv: false, stdin: "ignore",
      reject: false, shell: policy.shell ?? false, stripFinalNewline: !policy.rawStdout,
    });
    const started = result.exitCode !== undefined || result.signal !== undefined;
    const notice = noticeFile === undefined ? undefined : await readNotice(noticeFile);
    return { started, exitCode: result.exitCode ?? 1, stdout: result.stdout,
      output: [result.stdout, result.stderr, ...(!started ? [result.originalMessage] : [])].filter(Boolean).join("\n"),
      ...(notice === undefined ? {} : { notice }) };
  } finally {
    if (noticeDirectory !== undefined) await rm(noticeDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}
