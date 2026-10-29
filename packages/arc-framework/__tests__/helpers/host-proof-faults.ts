/** Native host-probe process failures altered at the Git boundary. */
import { GitProcessError } from "../../src/lib/git/process-error.js";

export const hostProofFaults = ["signal", "missing-status", "transport", "unrelated-ref", "unrelated-reason"] as const;
export type HostProofFault = typeof hostProofFaults[number];

export function alterHostFailure(error: GitProcessError, fault: HostProofFault): GitProcessError {
  return new GitProcessError({ kind: "nonzero-exit", command: error.command, args: error.args,
    exitCode: fault === "missing-status" ? undefined : error.exitCode,
    signal: fault === "signal" ? "SIGTERM" : undefined,
    stdout: fault === "transport" ? "" : fault === "unrelated-ref" ? error.stdout.replaceAll(/refs\/[^\s:]+/gu, "refs/heads/unrelated")
      : fault === "unrelated-reason" ? error.stdout.replaceAll(/\([^\n]*\)/gu, "(unrelated failure)") : error.stdout,
    stderr: fault === "transport" || fault === "unrelated-reason"
      ? error.stderr.split("\n").filter(line => line.includes("packet:")).join("\n") + "\nfatal: the remote end hung up unexpectedly" : error.stderr,
  });
}
