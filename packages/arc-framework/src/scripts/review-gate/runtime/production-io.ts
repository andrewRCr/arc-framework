/**
 * Production transport and authenticated git executor for the review-gate shells.
 *
 * The App installation token authenticates the HTTP boundary only; git transport
 * fetches (private-repo lane and coverage reads) authenticate through the narrow
 * workflow read token, injected as a per-invocation `http.extraheader` so it never
 * lands in a persisted remote URL or the process environment of the git subprocess.
 * The credential is passed in the subprocess argument list for the invocation.
 *
 * @module
 */

import { execFile } from "node:child_process";

import type { ExecResult, GitExec, GitExecOptions } from "../../../lib/git/exec.js";
import type { HttpFetch } from "../hosts/github/api/http.js";
import { GhProcessError, type ProcessRunner } from "./gh-action-port.js";

/** Node global `fetch` as the transport boundary; the `Response` satisfies `HttpResponse`. */
export const productionFetch: HttpFetch = (url, init) => globalThis.fetch(url, init);

const MAX_GIT_STDOUT_BYTES = 64 * 1024 * 1024;
const MAX_PROCESS_STDOUT_BYTES = 8 * 1024 * 1024;

/** `child_process.execFile`-backed git executor; retains stdout on non-zero exit for callers. */
export function execFileGitExec(cmd: string, args: string[], options?: GitExecOptions): Promise<ExecResult> {
  return new Promise<ExecResult>((resolve, reject) => {
    execFile(
      cmd,
      args,
      { signal: options?.signal, cwd: options?.cwd, maxBuffer: MAX_GIT_STDOUT_BYTES, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error !== null) {
          const failure: Error & { stdout?: string } = error;
          failure.stdout = stdout;
          reject(failure);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

/** Wrap a base executor so every git invocation carries the read token as an auth header. */
export function createAuthenticatedGitExec(gitToken: string, base: GitExec = execFileGitExec): GitExec {
  const credential = Buffer.from(`x-access-token:${gitToken}`, "utf8").toString("base64");
  const header = `http.extraheader=AUTHORIZATION: basic ${credential}`;
  return (cmd, args, options) => base(cmd, ["-c", header, ...args], options);
}

/** `execFile` process boundary for repository-only `gh` action launchers. */
export const productionProcessRunner: ProcessRunner = {
  run(command, args, options) {
    return new Promise((resolve, reject) => {
      execFile(command, args, {
        signal: options?.signal,
        maxBuffer: MAX_PROCESS_STDOUT_BYTES,
        encoding: "utf8",
      }, (error, stdout, stderr) => {
        if (error !== null) {
          if (error.name === "AbortError") {
            const aborted = new Error(error.message, { cause: error });
            aborted.name = "AbortError";
            reject(aborted);
            return;
          }
          reject(new GhProcessError(/(?:HTTP\s+)?(?:401|403)|auth(?:entication|orization| token)|not logged into any GitHub hosts|no authentication information found/iu.test(stderr)
            ? "authentication-failure"
            : "host-failure"));
          return;
        }
        resolve({ stdout });
      });
    });
  },
};
