/** Native Git and filesystem discovery agree on marker path bytes and physical traversal. */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readGitDirectories } from "../../src/lib/git/directories.js";
import { gitExec } from "../../src/lib/io-context.js";

const run = promisify(execFile);
const roots: string[] = [];
const files = { lstat, realpath, readFile: (path: string) => readFile(path, "utf8") };
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

describe("Git marker whitespace at the native boundary", () => {
  it.skipIf(process.platform === "win32").each(["\n", "\r\n", ""].flatMap(eol => [
    { kind: "gitfile", eol }, { kind: "commondir", eol },
  ]))("preserves $kind coordinates with ending $eol", async ({ kind, eol }) => {
    const root = await mkdtemp(join(tmpdir(), "arc-git-marker-native-"));
    roots.push(root);
    const checkout = join(root, "checkout"), commonDir = join(root, " common \v\f\n\t");
    await gitExec("git", ["init", "--quiet", "--separate-git-dir", commonDir, checkout], { cwd: root });
    await writeFile(join(checkout, ".git"), `gitdir: ../ common \v\f\n\t${eol}`);
    const native = async (argument: string): Promise<string> => {
      const env = { ...process.env };
      delete env.FORCE_COLOR;
      const result = await run("git", ["rev-parse", "--path-format=absolute", argument], { cwd: checkout, env });
      return result.stdout.replace(/\n$/u, "");
    };
    // A symlink before '..' must traverse the physical parent for both marker kinds.
    const physical = join(root, "physical"), privateDir = join(physical, " private \v\f\n\t");
    await mkdir(join(physical, "child"), { recursive: true });
    await mkdir(privateDir);
    await symlink(join(physical, "child"), join(root, "link"), "junction");
    await writeFile(join(checkout, ".git"), `gitdir: ${kind === "gitfile" ? "../link/../ private \v\f\n\t" : "../physical/ private \v\f\n\t"}${eol}`);
    await writeFile(join(privateDir, "HEAD"), "ref: refs/heads/main\n");
    await writeFile(join(privateDir, "commondir"), `${kind === "commondir" ? "../../link/../../ common \v\f\n\t" : "../../ common \v\f\n\t"}${eol}`);
    const discovered = await readGitDirectories(checkout, files);
    expect(discovered).toEqual({ gitDir: privateDir, commonDir });
    expect(discovered.gitDir).toBe(await native("--absolute-git-dir"));
    expect(discovered.commonDir).toBe(await native("--git-common-dir"));
  }, 10_000);
});
