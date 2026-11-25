/** Native command wrappers for session-init's process-boundary fixtures. */
import { chmod, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

interface GitTraceHarness {
  binDir: string;
  logPath: string;
  batchInputPath: string;
  env: Record<string, string>;
  nativeTrace?: true;
}

async function writeWindowsWrapper(dir: string, name: string, body: string): Promise<void> {
  await writeFile(join(dir, `${name}.cjs`), body);
  await writeFile(join(dir, `${name}.cmd`), `@"${process.execPath}" "%~dp0${name}.cjs" %*\r\n`);
}

/** Trace Git reads and inject the requested refusal without changing the real Git repository. */
export async function createGitTraceHarness(options: { nativeTrace?: boolean } = {}): Promise<GitTraceHarness> {
  const binDir = await mkdtemp(join(tmpdir(), "arc-session-init-git-trace-"));
  const logPath = join(binDir, "git.log");
  const batchInputPath = join(binDir, "batch-input.txt");
  if (options.nativeTrace) {
    return { binDir, logPath, batchInputPath, nativeTrace: true, env: { GIT_TRACE2_EVENT: logPath } };
  }
  if (process.platform === "win32") {
    await writeWindowsWrapper(binDir, "git", String.raw`
const { appendFileSync, readFileSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const args = process.argv.slice(2);
const command = args.join(" ");
// One append per record keeps concurrent probes from interleaving fields.
appendFileSync(process.env.ARC_GIT_TRACE_LOG, [process.cwd(), ...args, ""].join("\t") + "\n");
if (process.env.ARC_GIT_TRACE_HISTORY === "shallow" && command.includes("rev-parse --is-shallow-repository")) {
  console.log("true");
  process.exit(0);
}
if (process.env.ARC_GIT_TRACE_FAIL === "remote" && command.includes("ls-remote --heads origin")) {
  console.error("network is unreachable");
  process.exit(1);
}
const batch = command.includes("cat-file --batch-check");
if (process.env.ARC_GIT_TRACE_FAIL === "batch" && batch) {
  readFileSync(0);
  console.error("local object inspection denied");
  process.exit(1);
}
const userRefs = ["refs/notes/arc/user/", "refs/arc/user/", "refs/arc/tmp/transient-discovery/"];
const writes = ["fetch", "update-ref", "symbolic-ref", "branch", "pack-objects", "index-pack", "maintenance", "gc"];
if (process.env.ARC_GIT_TRACE_REJECT_CODE_WRITES === "1"
    && !userRefs.some(ref => command.includes(ref)) && writes.some(write => command.startsWith(write))) {
  console.error("code-repository metadata write denied");
  process.exit(97);
}
const input = batch ? readFileSync(0) : undefined;
if (batch) writeFileSync(process.env.ARC_GIT_TRACE_BATCH_INPUT, input);
const result = spawnSync("git", args, {
  env: { ...process.env, PATH: process.env.ARC_GIT_REAL_PATH },
  stdio: [batch ? "pipe" : "inherit", "inherit", "inherit"],
  input,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
`);
  } else {
    const wrapperPath = join(binDir, "git");
    await writeFile(wrapperPath, [
      "#!/bin/sh",
      // Append each record in one write: concurrent probes must not interleave its fields.
      "__arc_record=$(printf '%s\\t' \"$PWD\" \"$@\")",
      "printf '%s\\n' \"$__arc_record\" >> \"$ARC_GIT_TRACE_LOG\"",
      "case \"$ARC_GIT_TRACE_HISTORY:$*\" in",
      "  shallow:*\"rev-parse --is-shallow-repository\"*) printf '%s\\n' 'true'; exit 0 ;;",
      "esac",
      "case \"$ARC_GIT_TRACE_FAIL:$*\" in",
      "  remote:*\"ls-remote --heads origin\"*)",
      "    printf '%s\\n' 'network is unreachable' >&2; exit 1 ;;",
      "  batch:*\"cat-file --batch-check\"*)",
      "    /bin/cat > /dev/null; printf '%s\\n' 'local object inspection denied' >&2; exit 1 ;;",
      "esac",
      "case \"$ARC_GIT_TRACE_REJECT_CODE_WRITES:$*\" in",
      "  1:*refs/notes/arc/user/*|1:*refs/arc/user/*|1:*refs/arc/tmp/transient-discovery/*) ;;",
      "  1:fetch*|1:update-ref*|1:symbolic-ref*|1:branch*|1:pack-objects*|1:index-pack*|1:maintenance*|1:gc*)",
      "    printf '%s\\n' 'code-repository metadata write denied' >&2; exit 97 ;;",
      "esac",
      "case \" $* \" in",
      "  *\" cat-file --batch-check\"*)",
      "    /bin/cat > \"$ARC_GIT_TRACE_BATCH_INPUT\"",
      "    PATH=\"$ARC_GIT_REAL_PATH\" exec git \"$@\" < \"$ARC_GIT_TRACE_BATCH_INPUT\" ;;",
      "esac",
      "PATH=\"$ARC_GIT_REAL_PATH\" exec git \"$@\"",
      "",
    ].join("\n"));
    await chmod(wrapperPath, 0o755);
  }
  const realPath = process.env.PATH ?? "";
  return { binDir, logPath, batchInputPath, env: {
    PATH: `${binDir}${delimiter}${realPath}`,
    ARC_GIT_REAL_PATH: realPath,
    ARC_GIT_TRACE_LOG: logPath,
    ARC_GIT_TRACE_BATCH_INPUT: batchInputPath,
  } };
}

/** Decode the same tab-separated records on either host platform. */
export async function readGitTrace(harness: GitTraceHarness): Promise<string[][]> {
  const content = await readFile(harness.logPath, "utf8");
  if (harness.nativeTrace) {
    const events = content.trim().split("\n").filter(Boolean).map(line => JSON.parse(line) as {
      event: string; sid: string; argv: string[]; worktree: string;
    });
    const worktrees = new Map(events.filter(event => event.event === "def_repo")
      .map(event => [event.sid, event.worktree]));
    return events.filter(event => event.event === "start")
      .map(event => [worktrees.get(event.sid) ?? "", ...event.argv.slice(1)]);
  }
  return content.trim().split("\n").filter(Boolean).map(line => line.split("\t").filter(Boolean));
}

/** Install a logged GitHub CLI stub, optionally serving an open PR and its draft transition. */
export async function writeGhStub(binDir: string, logPath: string, allowPr: boolean): Promise<Record<string, string>> {
  if (process.platform === "win32") {
    await writeWindowsWrapper(binDir, "gh", String.raw`
const { appendFileSync } = require("node:fs");
const args = process.argv.slice(2);
appendFileSync(process.env.ARC_TEST_GH_LOG, args.join(" ") + "\n");
if (${String(allowPr)} && args[0] === "pr" && args[1] === "view") {
  console.log(JSON.stringify({ state: "OPEN", isDraft: false }));
} else if (!(${String(allowPr)} && args[0] === "pr" && args[1] === "ready")) process.exit(2);
`);
  } else {
    const script = join(binDir, "gh");
    await writeFile(script, [
      "#!/bin/sh",
      "printf '%s\\n' \"$*\" >> \"$ARC_TEST_GH_LOG\"",
      ...(allowPr ? [
        "if [ \"$1\" = pr ] && [ \"$2\" = view ]; then",
        "  printf '%s\\n' '{\"state\":\"OPEN\",\"isDraft\":false}'; exit 0",
        "fi",
        "if [ \"$1\" = pr ] && [ \"$2\" = ready ]; then exit 0; fi",
      ] : []),
      "exit 2",
      "",
    ].join("\n"));
    await chmod(script, 0o755);
  }
  return { ARC_TEST_GH_LOG: logPath, PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}` };
}
