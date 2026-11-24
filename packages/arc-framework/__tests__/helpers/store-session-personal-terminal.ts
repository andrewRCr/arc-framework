/** Drive a real confirmation prompt from the packaged CLI with a POSIX pseudo-terminal. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RunResult } from "../e2e/helpers.js";
import { assertCliBuilt, CLI_PATH } from "./cli-spawn.js";
import { CALL_LIMIT } from "./call-limit.js";
import { recordCliInvocationForCurrentTest } from "./test-cost-timeout.js";

const execFileAsync = promisify(execFile);
const terminal = String.raw`
import errno, fcntl, os, pty, struct, sys, termios

pid, terminal_fd = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 160, 0, 0))
    os.execv(sys.argv[3], sys.argv[3:])

transcript = bytearray()
answered = False
team_answered = False
while True:
    try:
        data = os.read(terminal_fd, 65536)
    except OSError as error:
        if error.errno != errno.EIO:
            raise
        break
    if not data:
        break
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()
    transcript.extend(data)
    if not team_answered and b"Enable multi-developer coordination?" in transcript:
        team_answered = True
        os.write(terminal_fd, b"\r")
    if not answered and sys.argv[1].encode() in transcript:
        answered = True
        os.write(terminal_fd, b"\x03" if sys.argv[2] == "cancel" else b"\x1b[C\r")

os.close(terminal_fd)
sys.exit(os.waitstatus_to_exitcode(os.waitpid(pid, 0)[1]))
`;

/** Wait for the exact selected identity prompt before sending a decline or cancellation. */
export async function refuseIdentityAtTerminal(root: string, args: string[], identity: string, response: "decline" | "cancel"): Promise<RunResult> {
  assertCliBuilt();
  recordCliInvocationForCurrentTest(CALL_LIMIT);
  const env = { ...process.env, CI: "", NO_COLOR: "1", ARC_DISABLE_UPDATE_CHECKS: "1", TERM: "xterm" };
  try {
    const result = await execFileAsync("python3", ["-c", terminal, `Is '${identity}' your identity?`, response,
      process.execPath, CLI_PATH, ...args], { cwd: root, env, timeout: CALL_LIMIT });
    return { ...result, exitCode: 0 };
  } catch (error) {
    const result = error as { code?: number | string; stdout?: string; stderr?: string };
    return { exitCode: typeof result.code === "number" ? result.code : -1,
      stdout: result.stdout ?? "", stderr: result.stderr || String(error) };
  }
}
