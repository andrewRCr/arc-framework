/** Overlap discovery from a clone created before remote work began. */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcAnchored } from "./helpers.js";

const execFileAsync = promisify(execFile);
const DISCOVERY_TIMEOUT_MS = 90_000;

async function commitFixture(cwd: string, message: string): Promise<void> {
  await git(cwd, ["add", "-A"]);
  const parent = await git(cwd, ["rev-parse", "--verify", "HEAD"]).catch(() => null);
  const head = await git(cwd, ["commit-tree", await git(cwd, ["write-tree"]), ...(parent === null ? [] : ["-p", parent]), "-m", message]);
  await git(cwd, ["update-ref", "HEAD", head, ...(parent === null ? [] : [parent])]);
}

it("checks live work-unit and Errand branches absent from the caller's tracking refs", async () => {
  const writer = await createTempRepo("arc-live-overlap-");
  const remote = `${writer}-remote.git`;
  const reader = `${writer}-reader`;
  try {
    const initialized = await runArc(["init", "--yes", "--name", "live-overlap"], writer);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    const configPath = join(writer, ".arc", "system", "arc-config.yml");
    await writeFile(configPath, (await readFile(configPath, "utf8"))
      .replace("branch.protection: partial", "branch.protection: full"));
    await commitFixture(writer, "initialize fixture");
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(writer, ["remote", "add", "origin", remote]);
    await git(writer, ["push", "-u", "origin", "main"]);
    await execFileAsync("git", ["clone", remote, reader]);
    await git(reader, ["config", "arc.identity", "test-user"]);

    await git(writer, ["switch", "-c", "feat/later-wu"]);
    await mkdir(join(writer, ".arc", "active"), { recursive: true });
    await writeFile(join(writer, ".arc", "active", "meta-later-wu.md"), renderMetaFile("later-wu", {
      state: "Active", owner: "test-user", branch: "feat/later-wu", workClass: "Light",
    }));
    await writeFile(join(writer, "wu-target.txt"), "work-unit change\n");
    await commitFixture(writer, "start remote work unit");
    await git(writer, ["push", "origin", "feat/later-wu"]);
    await git(writer, ["switch", "main"]);

    const opened = await runArcAnchored(["errand", "open", "later-errand", "--json"], writer);
    expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
    expect(JSON.parse(opened.stdout)).toMatchObject({ outcome: "applied" });
    await writeFile(join(writer, "errand-target.txt"), "Errand change\n");
    await commitFixture(writer, "work on remote errand");
    await git(writer, ["push", "origin", "chore/later-errand"]);

    expect(await git(reader, ["for-each-ref", "--format=%(refname)",
      "refs/remotes/origin/feat/later-wu", "refs/remotes/origin/chore/later-errand"])).toBe("");
    const args = ["errand", "check", "--target", "wu-target.txt", "--target", "errand-target.txt", "--json"];
    const local = await runArc([...args, "--local"], reader);
    expect(local.exitCode, local.stdout + local.stderr).toBe(0);
    expect(JSON.parse(local.stdout)).toMatchObject({ overlaps: [], reachable: false });

    const online = await runArc(args, reader);
    expect(online.exitCode, online.stdout + online.stderr).toBe(0);
    const result = JSON.parse(online.stdout) as {
      reachable: boolean; overlaps: Array<{ branch: string; matchedPaths: string[] }>;
    };
    expect(result.reachable).toBe(true);
    expect(result.overlaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ branch: "origin/feat/later-wu", matchedPaths: ["wu-target.txt"] }),
      expect.objectContaining({ branch: "origin/chore/later-errand", matchedPaths: ["errand-target.txt"] }),
    ]));
    expect(result.overlaps).toHaveLength(2);
    expect(await git(reader, ["branch", "--show-current"])).toBe("main");
    expect(await git(reader, ["for-each-ref", "--format=%(refname)", "refs/heads"])).toBe("refs/heads/main");
  } finally {
    await cleanupTempDir(reader);
    await cleanupTempDir(writer);
    await cleanupTempDir(remote);
  }
}, DISCOVERY_TIMEOUT_MS);
