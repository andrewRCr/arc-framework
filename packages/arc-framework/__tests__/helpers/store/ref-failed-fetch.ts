/** Scripted native boundaries for public pulls that end with a rowless fetch failure. */

import { join, resolve } from "node:path";
import { createRefStore } from "../../../src/lib/store/create.js";
import { GitProcessError } from "../../../src/lib/git/process-error.js";
import type { RefStorePorts } from "../../../src/lib/store/ports.js";
import { makeGitProcessError } from "../git-exec-fake.js";
import { createRefClock } from "./ref-clock.js";

export const fetchStateRef = "refs/arc/work/12345678-1234-4234-8234-123456789abc";
export const fetchStateTip = "1".repeat(40);
let sequence = 0;

/** Configuration explicitly selects the code repository; tracking and keeper namespaces start empty. */
export function failedFetchFixture(input: {
  probeFailure?: { at: "observation" | "refs" | "worktree" | "objects" | "walk"; kind: "completed" | "canceled" | "signaled" | "spawn" | "untyped" };
  refs?: readonly [string, string][]; heads?: readonly { path: string; oid: string }[];
  missing?: readonly string[]; missingCommits?: readonly string[]; stderr?: string;
  canceled?: "canceled" | "deadline"; walkFailure?: boolean; canceledProbe?: boolean;
} = {}) {
  const root = resolve("failed-fetch-fixtures", String(++sequence)), gitDir = join(root, ".git");
  const refs = new Map([[fetchStateRef, fetchStateTip], ...input.refs ?? []]);
  const missing = new Set(input.missing), calls: { args: readonly string[]; input?: string }[] = [];
  const clock = createRefClock();
  let fetched = false, probeError: unknown;
  const stderr = input.stderr ?? "fatal: failed to receive state objects\n";
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected failed-fetch fixture I/O"); };
  const absent = (path: string) => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  function listed(args: readonly string[]): string {
    const prefixes = args.slice(args.indexOf("for-each-ref") + 1).filter(arg => !arg.startsWith("--"));
    return [...refs].filter(([ref]) => !prefixes.length || prefixes.some(prefix => ref.startsWith(prefix))).map(([ref, oid]) =>
      args.includes("--format=%(refname)") ? `${ref}\n` : args.includes("--format=%(refname) %(objectname)")
        ? `${ref} ${oid}\n` : `${oid} ${ref}\n`).join("");
  }
  const ports: RefStorePorts = {
    checkoutRoot: root, ...clock, identity: async () => null, backingRepository: async () => null,
    actor: unexpected, lock: async () => async () => {}, random: () => 0.5, execInput: unexpected,
    exec: async (command, args, options) => {
      calls.push({ args, input: options?.input });
      if (args.includes("fetch")) {
        fetched = true;
        if (input.canceled === "deadline") clock.advance(3_600_000);
        throw makeGitProcessError({ command, args, stderr, stdout: "",
          ...input.canceled ? { isCanceled: true } : { exitCode: 128 } });
      }
      if (input.canceledProbe && args[0] === "worktree") {
        clock.advance(3_600_000);
        throw makeGitProcessError({ command, args, isCanceled: true, stderr: "" });
      }
      const stage = args[0] === "worktree" ? "worktree" : args[0] === "cat-file" ? "objects"
        : args[0] === "rev-list" ? "walk" : args[0] === "for-each-ref" && args.includes("--format=%(objectname) %(refname)") ? "refs"
          : args[0] === "for-each-ref" && args.some(arg => arg.startsWith("refs/arc/tmp/seen/")) ? "observation" : null;
      if (fetched && input.probeFailure?.at === stage) {
        const kind = input.probeFailure.kind;
        probeError = kind === "untyped" ? new TypeError("untyped diagnostic failure") : kind === "spawn"
          ? new GitProcessError({ command, args, kind: "spawn-failure", stderr: "secondary diagnostic failure" }) : makeGitProcessError({ command, args,
          stderr: "secondary diagnostic failure", ...kind === "canceled" ? { isCanceled: true } : kind === "signaled"
            ? { exitCode: 128, signal: "SIGTERM" } : { exitCode: 128 } });
        throw probeError;
      }
      let stdout: string;
      if (args[0] === "for-each-ref") stdout = listed(args);
      else if (args[0] === "worktree") stdout = (input.heads ?? [{ path: root, oid: fetchStateTip }])
        .map(({ path, oid }) => `worktree ${path}\0HEAD ${oid}\0detached\0\0`).join("");
      else if (args[0] === "cat-file" && args[1] === "--batch-check") stdout = (options?.input ?? "").trimEnd().split("\n")
        .map(oid => missing.has(oid) ? `${oid} missing\n` : `${oid} commit 200\n`).join("");
      else if (args[0] === "rev-list") {
        if (input.walkFailure) throw makeGitProcessError({ command, args, exitCode: 128, stderr: "fatal: revision walk failed\n" });
        stdout = `${fetchStateTip}\n` + (input.missingCommits ?? []).map(oid => `?${oid}\n`).join("");
      } else throw new Error(`Unexpected Git fixture command: ${args.join(" ")}`);
      return { stdout, stderr: "" };
    },
    rawExec: async args => {
      const stdout = args.includes("config") ? "remote.origin.url\n/receiver.git\0remote.origin.arc-state\npush\0"
        : args[0] === "for-each-ref" ? listed(args) : undefined;
      if (stdout === undefined) throw new Error(`Unexpected raw Git fixture command: ${args.join(" ")}`);
      return { stdout: Buffer.from(stdout), stderr: new Uint8Array() };
    },
    fs: { lstat: async path => {
      if (path === gitDir) return { mtimeMs: 0, isDirectory: () => true } as Awaited<ReturnType<RefStorePorts["fs"]["lstat"]>>;
      throw absent(path);
    }, readFile: async path => { throw absent(path); }, readBytes: unexpected, writeBytes: unexpected,
    readdir: unexpected, mkdir: unexpected, writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected,
    realpath: unexpected, rename: unexpected, removeDirectory: unexpected },
  };
  return { store: createRefStore(ports), calls, stderr, probeError: () => probeError };
}
