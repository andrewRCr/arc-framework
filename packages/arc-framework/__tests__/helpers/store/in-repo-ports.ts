/** Faithful filesystem and Git dependencies for repository-store fixtures. */
import * as fs from "node:fs/promises";
import type { GitExec, GitExecInput } from "../../../src/lib/git/exec.js";
import { atomicCreateFile, atomicWriteFile } from "../../../src/lib/fs.js";
import type { StorePorts } from "../../../src/lib/store/ports.js";
import type { Store } from "../../../src/lib/store/contract.js";
import { selectStore } from "../../../src/lib/store/create.js";
import { createDefaultStorePorts } from "../../../src/lib/store/default-store-ports.js";
import { IN_REPO_STORE_OVERRIDE } from "../../../src/lib/store/selection.js";

/** Build the in-repo store over the given ports, whatever the default factory builds.
 * @param ports - The checkout's ports, used as they are.
 * @returns The lazy in-repo store, reporting `stateOffBranch` false.
 */
export function inRepoStore(ports: StorePorts): Store {
  return selectStore(ports, { [IN_REPO_STORE_OVERRIDE]: "1" });
}

/** Build the in-repo store over a checkout's default ports, whatever the default factory builds.
 * @param checkoutRoot - The checkout the store reads and writes.
 * @param exec - The Git executor its ports run, when the test supplies one.
 * @returns The lazy in-repo store, reporting `stateOffBranch` false.
 */
export function inRepoStoreAt(checkoutRoot: string, exec?: GitExec): Store {
  return inRepoStore(createDefaultStorePorts({ checkoutRoot, ...(exec === undefined ? {} : { exec }) }));
}

export function testStorePorts(checkoutRoot: string, exec: GitExec, execInput: GitExecInput): StorePorts {
  return {
    checkoutRoot, exec, execInput,
    fs: {
      readFile: (path) => fs.readFile(path, "utf8"),
      readdir: (path) => fs.readdir(path, { withFileTypes: true }),
      lstat: fs.lstat, mkdir: fs.mkdir, writeFile: atomicWriteFile,
      exclusiveCreate: atomicCreateFile,
      unlink: fs.unlink,
    },
    clock: () => new Date("2026-01-01T00:00:00Z"),
    identity: async () => null, remote: async () => null,
    locks: { tracked: async (operation) => operation(), notes: async (operation) => operation() },
  };
}
