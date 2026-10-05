/** Faithful filesystem and Git dependencies for repository-store fixtures. */
import * as fs from "node:fs/promises";
import type { GitExec, GitExecInput } from "../../../src/lib/git/exec.js";
import { atomicWriteFile } from "../../../src/lib/fs.js";
import type { StorePorts } from "../../../src/lib/store/ports.js";

export function testStorePorts(checkoutRoot: string, exec: GitExec, execInput: GitExecInput): StorePorts {
  return {
    checkoutRoot, exec, execInput,
    fs: {
      readFile: (path) => fs.readFile(path, "utf8"),
      readdir: (path) => fs.readdir(path, { withFileTypes: true }),
      lstat: fs.lstat, mkdir: fs.mkdir, writeFile: atomicWriteFile,
      exclusiveCreate: (path, content) => fs.writeFile(path, content, { flag: "wx", encoding: "utf8" }),
      unlink: fs.unlink,
    },
    clock: () => new Date("2026-01-01T00:00:00Z"),
    identity: async () => null, remote: async () => null,
    locks: { tracked: async (operation) => operation(), notes: async (operation) => operation() },
  };
}
