/** Integration parity with Git's final trailer-block parser. */

import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { parseCommitMessage } from "../../src/lib/commit-check/parser.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function parseWithGit(message: string): Promise<Array<{ key: string; value: string }>> {
  const root = await mkdtemp(join(tmpdir(), "arc-commit-trailers-"));
  roots.push(root);
  const path = join(root, "message");
  await writeFile(path, message);
  const { stdout } = await execFileAsync("git", ["interpret-trailers", "--parse", path]);
  return stdout
    .trimEnd()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(":");
      return { key: line.slice(0, separator), value: line.slice(separator + 1).trimStart() };
    });
}

describe("commit parser trailer parity", () => {
  it.each([
    "feature(api): description\n\nBody.\n\nTrace: one\nContext: final\n",
    "feature(api): description\n\nContext: first\n continuation\nContext: last\n",
    "feature(api): description\n\nContext: final\n   \t\n",
    "feature(api): description\n\nContext: body-shaped\nBody prose follows.\n",
  ])("matches git interpret-trailers --parse", async (message) => {
    const gitTrailers = await parseWithGit(message);
    const parsed = parseCommitMessage(message);

    expect(parsed.trailers.map(({ key, value }) => ({ key, value }))).toEqual(gitTrailers);
  });
});
