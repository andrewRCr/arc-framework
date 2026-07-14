/** Exact-head git-object reads used by hosted Codex guidance and SHA markers. */

import type { GitExec } from "../../../../lib/git/exec.js";
import type { CodexGuidanceObjectReader } from "./guidance.js";

function safeObjectPath(path: string): boolean {
  return path.length > 0
    && !path.startsWith("/")
    && !path.includes(":")
    && !path.includes("\0")
    && !path.split("/").includes("..");
}

async function exactCommit(exec: GitExec, headSha: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${headSha}^{commit}`]);
    return stdout.trim() === headSha;
  } catch {
    return false;
  }
}

/** Git-backed exact-head text reader with missing and unreadable outcomes separated. */
export class GitCodexObjectReader implements CodexGuidanceObjectReader {
  private readonly exec: GitExec;

  constructor(exec: GitExec) {
    this.exec = exec;
  }

  async readText(headSha: string, path: string): Promise<
    | { kind: "ok"; observedHeadSha: string; content: string }
    | { kind: "missing" }
    | { kind: "unreadable" }
  > {
    if (!safeObjectPath(path) || !await exactCommit(this.exec, headSha)) return { kind: "unreadable" };
    try {
      await this.exec("git", ["cat-file", "-e", `${headSha}:${path}`]);
    } catch {
      return { kind: "missing" };
    }
    try {
      const { stdout } = await this.exec("git", ["show", `${headSha}:${path}`]);
      return { kind: "ok", observedHeadSha: headSha, content: stdout };
    } catch {
      return { kind: "unreadable" };
    }
  }
}

/** Resolve an abbreviated commit only when git maps it uniquely to the frozen head. */
export async function resolveCodexCommitPrefix(
  exec: GitExec,
  prefix: string,
  frozenHeadSha: string,
): Promise<string | null> {
  if (!/^[a-f0-9]{7,40}$/u.test(prefix)) return null;
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", `${prefix}^{commit}`]);
    const resolved = stdout.trim();
    return resolved === frozenHeadSha ? resolved : null;
  } catch {
    return null;
  }
}
