/** The ref backend's ports composed from an operational store caller's ports. */

import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composeRefStorePorts } from "../../../../src/lib/store/selection.js";
import { createDefaultStorePorts } from "../../../../src/lib/store/default-ports.js";
import type { StoreFileAccess, StorePorts } from "../../../../src/lib/store/ports.js";
import type { GitExec } from "../../../../src/lib/git/exec.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";

const checkoutRoot = resolve("/composed-checkout");
const SUPPORTED = "git version 2.53.0\n";

function missing(path: string): Error {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
}

/** In-memory file access holding a `.git` directory, recording every path it is asked about. */
function memoryFiles(): StoreFileAccess & { files: Map<string, string>; touched: string[]; realpath(path: string): Promise<string> } {
  const files = new Map<string, string>();
  const touched: string[] = [];
  const directories = new Set([join(checkoutRoot, ".git")]);
  return {
    files, touched,
    readFile: async (path) => { touched.push(path); const content = files.get(path); if (content === undefined) throw missing(path); return content; },
    readdir: async (path) => { touched.push(path); return []; },
    lstat: async (path) => {
      touched.push(path);
      if (!directories.has(path) && !files.has(path)) throw missing(path);
      const directory = directories.has(path);
      return { size: 0, mtimeMs: 0, isFile: () => !directory, isDirectory: () => directory, isSymbolicLink: () => false };
    },
    mkdir: async (path) => { touched.push(path); directories.add(path); },
    writeFile: async (path, content) => { touched.push(path); files.set(path, content); },
    exclusiveCreate: async (path, content) => {
      touched.push(path);
      if (files.has(path)) throw Object.assign(new Error(`EEXIST: ${path}`), { code: "EEXIST" });
      files.set(path, content);
    },
    unlink: async (path) => { touched.push(path); files.delete(path); },
    realpath: async (path) => path,
  };
}

function callerPorts(overrides: Partial<StorePorts> = {}): StorePorts {
  const refuse = async (): Promise<never> => { throw new Error("The caller's notes and tracked locks are not consulted"); };
  return {
    checkoutRoot,
    exec: async (_command, args) => {
      if (args[0] === "--version") return { stdout: SUPPORTED, stderr: "" };
      return { stdout: `ran ${args.join(" ")}`, stderr: "" };
    },
    execInput: async (args) => args[0] === "--version" ? SUPPORTED : "",
    fs: memoryFiles(),
    clock: () => new Date("2026-05-01T00:00:00Z"),
    identity: async () => null,
    remote: async () => "upstream",
    locks: { tracked: refuse, notes: refuse },
    ...overrides,
  };
}

describe("ref store ports composed from the caller's", () => {
  it("carries an identity the caller supplies", async () => {
    const ports = await composeRefStorePorts(callerPorts({ identity: async () => SlugSchema.parse("alice") }));
    expect(await ports.identity()).toBe("alice");
  });

  it("carries the caller's file access and clock", async () => {
    const fs = memoryFiles();
    fs.files.set(join(checkoutRoot, "marker"), "from the caller");
    const ports = await composeRefStorePorts(callerPorts({ fs, clock: () => new Date("2026-05-02T00:00:00Z") }));
    expect(await ports.fs.readFile(join(checkoutRoot, "marker"))).toBe("from the caller");
    expect(ports.clock().toISOString()).toBe("2026-05-02T00:00:00.000Z");
  });

  it("runs the caller's Git executor behind the Git floor", async () => {
    const calls: string[] = [];
    const exec: GitExec = async (_command, args) => {
      calls.push(args.join(" "));
      return { stdout: args[0] === "--version" ? "git version 2.43.0\n" : "listed", stderr: "" };
    };
    const ports = await composeRefStorePorts(callerPorts({ exec }));
    await expect(ports.exec("git", ["for-each-ref"])).rejects.toThrow(/Git 2\.43\.0 is below the required Git 2\.53/u);
    expect(calls).toEqual(["--version"]);
  });

  it("passes a supported Git's calls through to the caller's executor", async () => {
    const ports = await composeRefStorePorts(callerPorts());
    expect((await ports.exec("git", ["for-each-ref"])).stdout).toBe("ran for-each-ref");
  });

  it("serializes ref writes through its own lock over the caller's file access, never the caller's locks", async () => {
    const fs = memoryFiles();
    const ports = await composeRefStorePorts(callerPorts({ fs }));
    const release = await ports.lock("refs/arc/project/registry");
    const lockPath = join(checkoutRoot, ".git", "arc", "locks", "refs/arc/project/registry.lock");
    expect(fs.files.has(lockPath)).toBe(true);
    await release();
    expect(fs.files.has(lockPath)).toBe(false);
  });

  it("keeps the configured identity resolution of the default store ports", async () => {
    const exec: GitExec = async (_command, args) => ({
      stdout: args[0] === "--version" ? SUPPORTED : "configured-person\0", stderr: "" });
    const ports = await composeRefStorePorts(createDefaultStorePorts({ checkoutRoot, exec }));
    expect(await ports.identity()).toBe("configured-person");
  });
});
