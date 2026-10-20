import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readGitBlobEntries } from "../../src/lib/io-context.js";

const git = promisify(execFile);
let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-bulk-index-"));
  await git("git", ["init", "-q"], { cwd: root });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
});

describe("bulk Git blob reads", () => {
  it("reads the explicitly selected index without modifying either index", async () => {
    const path = "notes résumé.md";
    const mainBytes = Buffer.from("main index\0bytes\n");
    const alternateBytes = Buffer.from("alternate index\0bytes\n");
    await writeFile(join(root, path), mainBytes);
    await git("git", ["add", "--", path], { cwd: root });
    const indexFile = join(root, ".git", "alternate-index");
    await writeFile(indexFile, await readFile(join(root, ".git", "index")));
    await writeFile(join(root, path), alternateBytes);
    await git("git", ["add", "--", path], { cwd: root, env: { ...process.env, GIT_INDEX_FILE: indexFile } });
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
