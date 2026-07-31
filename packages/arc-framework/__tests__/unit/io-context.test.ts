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
