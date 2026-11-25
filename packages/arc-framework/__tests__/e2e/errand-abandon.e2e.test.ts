/** Abandonment completes after its invoking checkout has been removed. */

import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, runArc, runArcAnchoredSequence } from "./helpers.js";

const execFileAsync = promisify(execFile);
const ABANDON_TIMEOUT_MS = 60_000;

it("abandons from its own checkout, retains the capture, and retires the local and remote identity", async () => {
  const primary = await createTempRepo("arc-abandon-own-");
  const remote = `${primary}-remote.git`;
  let spawned: string | null = null;
  const git = async (args: string[]) => (await execFileAsync("git", args, { cwd: primary })).stdout.trim();
  try {
    const init = await runArc(["init", "--yes", "--name", "test-project"], primary);
    expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    const configPath = join(primary, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    const full = config.replace("branch.protection: partial", "branch.protection: full");
    expect(full).not.toBe(config);
    await writeFile(configPath, full, "utf8");
    await git(["add", "-A"]);
    const tree = await git(["write-tree"]);
    const head = await git(["commit-tree", tree, "-m", "initialized fixture"]);
    await git(["update-ref", "HEAD", head]);
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(["remote", "add", "origin", remote]);
    await git(["push", "-u", "origin", "main"]);
    const inboxPath = join(primary, ".arc", "user", "test-user", "USER-INBOX.md");
    await mkdir(join(primary, ".arc", "user", "test-user"), { recursive: true });
    const capture = "# User Inbox\n\n## Errand\n\n### `[ ]` **Discard capture**\n\n"
      + "- _Disposition:_ `execute-bound`\n\n- _Observation:_ retain this capture.\n\n---\n";
    await writeFile(inboxPath, capture, "utf8");

    const result = await runArcAnchoredSequence([
      ["errand", "open", "discard-own", "--isolate", "--from-inbox", "Discard capture", "--json"],
      { args: ["errand", "abandon", "discard-own", "--json"], cwdFromPreviousJson: "allocation.checkoutPath" },
      { args: ["status", "--session-init", "--json"], cwd: primary },
    ], primary, { timeout: ABANDON_TIMEOUT_MS });
    const opened = result.results[0] as { allocation?: { checkoutPath?: unknown } };
    spawned = typeof opened?.allocation?.checkoutPath === "string" ? opened.allocation.checkoutPath : null;
    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(spawned).not.toBeNull();
    expect(result.results[1]).toMatchObject({
      outcome: "applied", operation: "errand-abandon", checkoutPath: spawned,
      subject: { kind: "errand", slug: "discard-own" },
      settlement: { kind: "capture", disposition: "retained", originEntry: "Discard capture" },
    });
    if (spawned === null) throw new Error("Missing allocated checkout");
    await expect(access(spawned)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(inboxPath, "utf8")).toBe(capture.replace('- _Disposition:_ `execute-bound`\n\n', ""));
    expect(await git(["branch", "--list", "chore/discard-own"])).toBe("");
    await expect(git(["cat-file", "-p", "refs/arc/user/test-user/errands:discard-own"])).rejects.toThrow();
    const remoteTip = (await git(["ls-remote", "origin", "refs/arc/user/test-user/errands"])).split(/\s/u)[0];
    expect(remoteTip).toBe(await git(["rev-parse", "refs/arc/user/test-user/errands"]));
    expect(result.results[2]).toMatchObject({
      derivedLocusState: { value: { entering: { row: { kind: "free-primary" } } } },
      orphanBranchSweep: { value: { orphans: [] } },
    });
  } finally {
    if (spawned !== null) {
      await git(["worktree", "remove", "--force", spawned]).catch(() => undefined);
      await cleanupTempDir(spawned);
    }
    await cleanupTempDir(primary);
    await cleanupTempDir(remote);
  }
}, ABANDON_TIMEOUT_MS);
