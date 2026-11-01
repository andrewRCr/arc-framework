import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createRefStore } from "../../../../src/lib/store/create.js";
import type { RefStorePorts } from "../../../../src/lib/store/ports.js";
import { makeGitProcessError } from "../../../helpers/git-exec-fake.js";

const VERSION = "git version 2.43.0\n";

function missing(path: string): Error {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
}

/** A Git older than the lazy-fetch guard: a local-only call on the named port is rejected as an unknown global option,
 * while a plain `--version` answers; the raw port lists no refs where it is not the one rejecting.
 */
function olderGitPorts(rejecting: "exec" | "rawExec"): RefStorePorts {
  const checkoutRoot = resolve("/repository");
  const gitDirectory = join(checkoutRoot, ".git");
  const reject = (args: readonly string[]): never => {
    throw makeGitProcessError({ command: "git", args: ["--no-lazy-fetch", ...args], exitCode: 129,
      stderr: "unknown option: --no-lazy-fetch" });
  };
  const unexpected = async (): Promise<never> => { throw new Error("Unexpected I/O"); };
  return {
    exec: async (_command, args, options) => {
      if (args[0] === "--version" && options?.objectAccess === undefined) return { stdout: VERSION, stderr: "" };
      if (rejecting === "exec" && options?.objectAccess === "local-only") return reject(args);
      throw new Error(`Unexpected Git call: ${args.join(" ")}`);
    },
    execInput: unexpected,
    rawExec: async (args, options) => {
      if (args[0] === "--version" && options?.objectAccess === undefined) {
        return { stdout: new TextEncoder().encode(VERSION), stderr: new Uint8Array() };
      }
      if (options?.objectAccess === "local-only" && rejecting === "rawExec") return reject(args);
      if (args[0] === "for-each-ref") return { stdout: new Uint8Array(), stderr: new Uint8Array() };
      throw new Error(`Unexpected Git call: ${args.join(" ")}`);
    },
    fs: { readFile: async (path) => { throw missing(path); }, readBytes: unexpected, writeBytes: unexpected,
      readdir: unexpected, lstat: async (path) => {
        if (path === gitDirectory) return { isDirectory: () => true } as Awaited<ReturnType<RefStorePorts["fs"]["lstat"]>>;
        throw missing(path);
      }, mkdir: unexpected, writeFile: unexpected, exclusiveCreate: unexpected, unlink: unexpected, rename: unexpected,
      realpath: unexpected, removeDirectory: unexpected },
    checkoutRoot, identity: async () => null, backingRepository: unexpected, actor: unexpected,
    lock: async () => async () => {}, clock: () => new Date(0), sleep: { wait: unexpected, bound: unexpected },
    random: () => 0.5,
  };
}

describe("ref store Git floor on a local-only call", () => {
  const floor = /Git 2\.43\.0 is below the required Git 2\.53/u;

  it("names the version found when the byte executor's first listing is refused", async () => {
    await expect(createRefStore(olderGitPorts("rawExec")).version()).rejects.toThrow(floor);
  });

  it("names the version found when the plain executor's maintenance is refused", async () => {
    await expect(createRefStore(olderGitPorts("exec")).maintain()).rejects.toThrow(floor);
  });
});
