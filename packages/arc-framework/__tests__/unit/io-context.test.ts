import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
}));

vi.mock("execa", () => ({ execa: mocks.execa }));

import {
  createUserIOContext,
  readGitBlobBytes,
  readGitObjectBytes,
} from "../../src/lib/io-context.js";

const tempDirs: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("createUserIOContext readDir", () => {
  it("terminates cleanly when a nested symlink points back to an ancestor", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-user-dir-"));
    tempDirs.push(root);
    const drafts = join(root, "drafts");
    await mkdir(drafts);
    await writeFile(join(drafts, "idea.md"), "hello", "utf8");
    await symlink(root, join(drafts, "loop"), "dir");

    const entries = await createUserIOContext().readDir(root);

    expect(entries).toEqual([{ name: "drafts/idea.md", size: 5 }]);
  });

  it("skips an entry that disappears between directory listing and stat", async () => {
    const root = await mkdtemp(join(tmpdir(), "arc-read-user-dir-"));
    tempDirs.push(root);
    await writeFile(join(root, "kept.md"), "hello", "utf8");
    await symlink(join(root, "already-gone.md"), join(root, "vanished.md"), "file");

    const entries = await createUserIOContext().readDir(root);

    expect(entries).toEqual([{ name: "kept.md", size: 5 }]);
  });
});

describe("readGitObjectBytes", () => {
  it("reads a gitlink identity as a commit object", async () => {
    mocks.execa.mockImplementation(async (_command, args: string[]) => ({
      stdout: Buffer.from(args[1] ?? ""),
      stderr: Buffer.alloc(0),
    }));

    await expect(readGitObjectBytes("/repo", "a".repeat(40), "gitlink"))
      .resolves.toEqual(Buffer.from("commit"));
  });
});

describe("readGitBlobBytes", () => {
  function mockLookupOutput(command: "ls-files" | "ls-tree", stdout: Uint8Array): void {
    mocks.execa.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === command) {
        return { stdout: Buffer.from(stdout), stderr: Buffer.alloc(0) };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });
  }

  it("reads an exact tree blob without allowing lazy object acquisition", async () => {
    const oid = "a".repeat(40);
    const bytes = Buffer.from([0, 1, 10, 128, 255]);
    mocks.execa.mockImplementation(async (
      _command: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      if (args[0] !== "--no-lazy-fetch" || options.env?.GIT_NO_LAZY_FETCH !== "1") {
        throw new Error("object inspection allowed lazy acquisition");
      }
      if (args[1] === "ls-tree") {
        return { stdout: Buffer.from(`blob ${oid}\0`), stderr: Buffer.alloc(0) };
      }
      if (args[1] === "cat-file") {
        return { stdout: bytes, stderr: Buffer.alloc(0) };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    await expect(readGitBlobBytes("/repo", "HEAD", "binary.dat", { objectAccess: "local-only" }))
      .resolves.toEqual(bytes);
  });

  it("reads an exact index blob without allowing lazy object acquisition", async () => {
    const oid = "b".repeat(40);
    const bytes = Buffer.from([255, 128, 13, 10, 0]);
    mocks.execa.mockImplementation(async (
      _command: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv },
    ) => {
      if (args[0] !== "--no-lazy-fetch" || options.env?.GIT_NO_LAZY_FETCH !== "1") {
        throw new Error("object inspection allowed lazy acquisition");
      }
      if (args[1] === "ls-files") {
        return { stdout: Buffer.from(`100644 ${oid} 0\tbinary.dat\0`), stderr: Buffer.alloc(0) };
      }
      if (args[1] === "cat-file") {
        return { stdout: bytes, stderr: Buffer.alloc(0) };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    await expect(readGitBlobBytes("/repo", null, "binary.dat", { objectAccess: "local-only" }))
      .resolves.toEqual(bytes);
  });

  it("reads index metadata without decoding non-UTF-8 path bytes", async () => {
    const oid = "c".repeat(40);
    const bytes = Buffer.from([1, 2, 3]);
    mocks.execa.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "ls-files") {
        return {
          stdout: Buffer.concat([
            Buffer.from(`100644 ${oid} 0\t`),
            Buffer.from([0x80, 0]),
          ]),
          stderr: Buffer.alloc(0),
        };
      }
      if (args[0] === "cat-file") return { stdout: bytes, stderr: Buffer.alloc(0) };
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    await expect(readGitBlobBytes("/repo", null, "invalid-byte"))
      .resolves.toEqual(bytes);
  });

  it.each([
    ["tree", "HEAD"],
    ["index", null],
  ] as const)("returns null for empty %s output", async (_source, ref) => {
    mockLookupOutput(ref === null ? "ls-files" : "ls-tree", Buffer.alloc(0));

    await expect(readGitBlobBytes("/repo", ref, "missing.dat")).resolves.toBeNull();
  });

  it("rejects invalid UTF-8 tree output", async () => {
    mockLookupOutput("ls-tree", Buffer.from([0x80, 0]));

    await expect(readGitBlobBytes("/repo", "HEAD", "invalid-byte"))
      .rejects.toBeInstanceOf(TypeError);
  });

  it.each([
    ["malformed", Buffer.from("not-a-tree-record\0")],
    ["multiple", Buffer.from(`blob ${"d".repeat(40)}\0blob ${"e".repeat(40)}\0`)],
    ["invalid object id", Buffer.from("blob abcdef\0")],
  ])("rejects %s tree output", async (_case, stdout) => {
    mockLookupOutput("ls-tree", stdout);

    await expect(readGitBlobBytes("/repo", "HEAD", "invalid.dat"))
      .rejects.toThrow("Cannot resolve an exact tree blob");
  });

  it.each([
    ["malformed", Buffer.from("not-an-index-record\0")],
    [
      "multiple",
      Buffer.from(`100644 ${"d".repeat(40)} 0\tone\0` + `100644 ${"e".repeat(40)} 0\ttwo\0`),
    ],
    ["invalid object id", Buffer.from("100644 abcdef 0\tinvalid.dat\0")],
  ])("rejects %s index output", async (_case, stdout) => {
    mockLookupOutput("ls-files", stdout);

    await expect(readGitBlobBytes("/repo", null, "invalid.dat"))
      .rejects.toThrow("Cannot resolve an exact index blob");
  });
});
