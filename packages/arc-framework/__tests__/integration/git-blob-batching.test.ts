import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { environmentForGitCwd, readGitBlobEntries } from "../../src/lib/io-context.js";
import {
  assertIndexedMarkdownCheckerAlignment,
  resolveIndexedMarkdownCheckerPaths,
} from "../../src/lib/markdown/checker-alignment.js";
import { createIndexedMarkdownReader } from "../../src/lib/markdown/indexed-reader.js";

const execute = promisify(execFile);
let root: string;
const git = (args: readonly string[], indexFile?: string) => execute("git", [...args], {
  cwd: root,
  env: { ...environmentForGitCwd(root), ...(indexFile === undefined ? {} : { GIT_INDEX_FILE: indexFile }) },
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-bulk-index-"));
  await git(["init", "-q"]);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

describe("bulk Git blob reads", () => {
  it("refuses checker bytes restaged after discovery and accepts repaired alignment", async () => {
    const path = "packages/arc-framework/src/checker.ts";
    const original = "export const value = 1;\n";
    const restaged = "export const value = 2;\n";
    await mkdir(join(root, "packages/arc-framework/src"), { recursive: true });
    await writeFile(join(root, path), original);
    await git(["add", "--", path]);
    const reader = createIndexedMarkdownReader();
    const runtimePaths = await resolveIndexedMarkdownCheckerPaths({ root, ...reader, entryPaths: [path] });
    await writeFile(join(root, path), restaged);
    await git(["add", "--", path]);
    await writeFile(join(root, path), original);
    const options = { root, ...reader, readFile, runtimePaths };

    await expect(assertIndexedMarkdownCheckerAlignment(options)).rejects.toThrow(
      `Indexed Markdown checker differs from executing worktree bytes: ${path}`,
    );
    await writeFile(join(root, path), restaged);
    await expect(assertIndexedMarkdownCheckerAlignment(options)).resolves.toBeUndefined();
  });

  it("reads the explicitly selected index without modifying either index", async () => {
    const path = "notes résumé.md";
    const mainBytes = Buffer.from("main index\0bytes\n");
    const alternateBytes = Buffer.from("alternate index\0bytes\n");
    await writeFile(join(root, path), mainBytes);
    await git(["add", "--", path]);
    const indexFile = join(root, ".git", "alternate-index");
    await writeFile(indexFile, await readFile(join(root, ".git", "index")));
    await writeFile(join(root, path), alternateBytes);
    await git(["add", "--", path], indexFile);
    const mainIndex = await readFile(join(root, ".git", "index"));
    const alternateIndex = await readFile(indexFile);
    const options = { objectAccess: "local-only" as const, indexFile };

    const selected = await readGitBlobEntries(root, null, [path, "absent.md"], options);
    expect([...selected.keys()]).toEqual([path]);
    expect(Buffer.from(selected.get(path)!.bytes)).toEqual(alternateBytes);
    expect(selected.get(path)!.mode).toBe("100644");
    const ordinary = await readGitBlobEntries(root, null, [path]);
    expect(Buffer.from(ordinary.get(path)!.bytes)).toEqual(mainBytes);
    expect(await readFile(join(root, ".git", "index"))).toEqual(mainIndex);
    expect(await readFile(indexFile)).toEqual(alternateIndex);
    expect(await readFile(join(root, path))).toEqual(alternateBytes);
  });
});
