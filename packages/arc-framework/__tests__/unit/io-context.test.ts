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
  readGitBlobEntries,
  readGitBlobEntry,
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
        return { stdout: Buffer.from(`100644 blob ${oid}\0`), stderr: Buffer.alloc(0) };
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

  it.each([
    ["index", null],
    ["tree", "HEAD"],
  ] as const)("represents an exact %s gitlink by its object ID without reading the commit", async (_kind, ref) => {
    const oid = "c".repeat(40);
    mocks.execa.mockImplementation(async (_command: string, args: string[]) => {
      if (args.includes("ls-files")) {
        return { stdout: Buffer.from(`160000 ${oid} 0\tvendor/library\0`), stderr: Buffer.alloc(0) };
      }
      if (args.includes("ls-tree")) {
        return { stdout: Buffer.from(`160000 commit ${oid}\0`), stderr: Buffer.alloc(0) };
      }
      throw new Error(`gitlink must not read its commit object: ${args.join(" ")}`);
    });

    await expect(readGitBlobEntry("/repo", ref, "vendor/library"))
      .resolves.toEqual({ mode: "160000", bytes: new TextEncoder().encode(oid) });
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
    ["multiple", Buffer.from(`100644 blob ${"d".repeat(40)}\0${"100644"} blob ${"e".repeat(40)}\0`)],
    ["invalid object id", Buffer.from("100644 blob abcdef\0")],
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

describe("readGitBlobEntries", () => {
  it.each([
    ["index", null],
    ["tree", "HEAD"],
  ] as const)("reads many exact %s leaves through one scoped metadata batch", async (_source, ref) => {
    const firstOid = "a".repeat(40);
    const secondOid = "b".repeat(40);
    const gitlinkOid = "c".repeat(40);
    const calls: string[][] = [];
    mocks.execa.mockImplementation(async (
      _command: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv; input?: Uint8Array },
    ) => {
      calls.push(args);
      if (args[0] !== "--no-lazy-fetch" || options.env?.GIT_NO_LAZY_FETCH !== "1") {
        throw new Error("object inspection allowed lazy acquisition");
      }
      if (args[1] === "ls-files") {
        return {
          stdout: Buffer.from([
            `100644 ${firstOid} 0\talpha.txt\0`,
            `100755 ${secondOid} 0\tscript.sh\0`,
            `160000 ${gitlinkOid} 0\tvendor/library\0`,
            `100644 ${"d".repeat(40)} 0\tunrelated.txt\0`,
          ].join("")),
          stderr: Buffer.alloc(0),
        };
      }
      if (args[1] === "ls-tree") {
        return {
          stdout: Buffer.from([
            `100644 blob ${firstOid}\talpha.txt\0`,
            `100755 blob ${secondOid}\tscript.sh\0`,
            `160000 commit ${gitlinkOid}\tvendor/library\0`,
            `100644 blob ${"d".repeat(40)}\tunrelated.txt\0`,
          ].join("")),
          stderr: Buffer.alloc(0),
        };
      }
      const input = Buffer.from(options.input ?? []).toString("utf8");
      if (args[1] === "cat-file" && args[2]?.startsWith("--batch-check=")) {
        expect(input).toBe(`${secondOid}\n${firstOid}\n`);
        return {
          stdout: Buffer.from(`${secondOid} blob 4\n${firstOid} blob 3\n`),
          stderr: Buffer.alloc(0),
        };
      }
      if (args[1] === "cat-file" && args[2] === "--batch") {
        expect(input).toBe(`${secondOid}\n${firstOid}\n`);
        return {
          stdout: Buffer.concat([
            Buffer.from(`${secondOid} blob 4\n`),
            Buffer.from([4, 5, 6, 7]),
            Buffer.from("\n"),
            Buffer.from(`${firstOid} blob 3\n`),
            Buffer.from([1, 2, 3]),
            Buffer.from("\n"),
          ]),
          stderr: Buffer.alloc(0),
        };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    const entries = await readGitBlobEntries(
      "/repo",
      ref,
      ["script.sh", "missing.txt", "vendor/library", "alpha.txt"],
      { objectAccess: "local-only" },
    );

    expect(entries).toEqual(new Map([
      ["script.sh", { mode: "100755", bytes: Buffer.from([4, 5, 6, 7]) }],
      ["vendor/library", { mode: "160000", bytes: new TextEncoder().encode(gitlinkOid) }],
      ["alpha.txt", { mode: "100644", bytes: Buffer.from([1, 2, 3]) }],
    ]));
    const lookupCalls = calls.filter((args) => args[1] === (ref === null ? "ls-files" : "ls-tree"));
    expect(lookupCalls).toHaveLength(1);
    const separator = lookupCalls[0]?.indexOf("--") ?? -1;
    expect(separator).toBeGreaterThan(0);
    expect(lookupCalls[0]?.slice(separator + 1)).toEqual([
      ":(literal)script.sh",
      ":(literal)missing.txt",
      ":(literal)vendor/library",
      ":(literal)alpha.txt",
    ]);
    expect(calls.filter((args) => args[1] === "cat-file")).toHaveLength(2);
  });

  it("partitions large literal path lists and merges their metadata", async () => {
    const paths = Array.from({ length: 1_000 }, (_unused, index) =>
      `candidate/${String(index).padStart(4, "0")}-${"x".repeat(32)}.txt`);
    const firstOid = "a".repeat(40);
    const lastOid = "b".repeat(40);
    const lookupCalls: string[][] = [];
    mocks.execa.mockImplementation(async (
      _command: string,
      args: string[],
      options: { input?: Uint8Array },
    ) => {
      if (args[0] === "ls-files") {
        lookupCalls.push(args);
        const records = [
          args.includes(`:(literal)${paths[0]}`) ? `100644 ${firstOid} 0\t${paths[0]}\0` : "",
          args.includes(`:(literal)${paths.at(-1)}`) ? `100755 ${lastOid} 0\t${paths.at(-1)}\0` : "",
        ];
        return { stdout: Buffer.from(records.join("")), stderr: Buffer.alloc(0) };
      }
      const input = Buffer.from(options.input ?? []).toString("utf8");
      if (args[0] === "cat-file" && args[1]?.startsWith("--batch-check=")) {
        expect(input).toBe(`${firstOid}\n${lastOid}\n`);
        return {
          stdout: Buffer.from(`${firstOid} blob 1\n${lastOid} blob 1\n`),
          stderr: Buffer.alloc(0),
        };
      }
      if (args[0] === "cat-file" && args[1] === "--batch") {
        expect(input).toBe(`${firstOid}\n${lastOid}\n`);
        return {
          stdout: Buffer.from(`${firstOid} blob 1\na\n${lastOid} blob 1\nb\n`),
          stderr: Buffer.alloc(0),
        };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    await expect(readGitBlobEntries("/repo", null, paths)).resolves.toEqual(new Map([
      [paths[0], { mode: "100644", bytes: Buffer.from("a") }],
      [paths.at(-1), { mode: "100755", bytes: Buffer.from("b") }],
    ]));

    expect(lookupCalls.length).toBeGreaterThan(1);
    expect(lookupCalls.flatMap((args) => {
      const separator = args.indexOf("--");
      expect(separator).toBeGreaterThan(0);
      return args.slice(separator + 1);
    })).toEqual(paths.map((path) => `:(literal)${path}`));
  });

  it.each(["1", "2", "3"])("names the requested path in a malformed stage-%s index refusal", async (stage) => {
    mocks.execa.mockResolvedValue({
      stdout: Buffer.from(`100644 ${"a".repeat(40)} ${stage}\twanted.txt\0`),
      stderr: Buffer.alloc(0),
    });

    await expect(readGitBlobEntries("/repo", null, ["wanted.txt"]))
      .rejects.toThrow(/Cannot resolve exact index blobs.*wanted\.txt/u);
  });

  it("rejects an invalid index object ID and names its requested path", async () => {
    mocks.execa.mockResolvedValue({
      stdout: Buffer.from("100644 abcdef 0\twanted.txt\0"),
      stderr: Buffer.alloc(0),
    });

    await expect(readGitBlobEntries("/repo", null, ["wanted.txt"]))
      .rejects.toThrow(/Cannot resolve exact index blobs.*wanted\.txt/u);
  });

  it("rejects a truncated batch object response", async () => {
    const oid = "a".repeat(40);
    mocks.execa.mockImplementation(async (_command: string, args: string[]) => {
      if (args[0] === "ls-tree") {
        return {
          stdout: Buffer.from(`100644 blob ${oid}\twanted.txt\0`),
          stderr: Buffer.alloc(0),
        };
      }
      if (args[0] === "cat-file" && args[1]?.startsWith("--batch-check=")) {
        return { stdout: Buffer.from(`${oid} blob 3\n`), stderr: Buffer.alloc(0) };
      }
      if (args[0] === "cat-file" && args[1] === "--batch") {
        return { stdout: Buffer.from(`${oid} blob 3\nxy`), stderr: Buffer.alloc(0) };
      }
      throw new Error(`unexpected git command: ${args.join(" ")}`);
    });

    await expect(readGitBlobEntries("/repo", "HEAD", ["wanted.txt"]))
      .rejects.toThrow("Cannot read exact Git blob objects");
  });
});
