/** Nature-typed ordinary identities retain their branch through real CLI re-entry. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcAnchoredSequence } from "./helpers.js";

describe("ordinary Errand branch types", () => {
  it.each(["fix", "refactor", "hotfix"])("opens and resumes the same %s generation without changing its branch", async (type) => {
    const cwd = await createTempRepo("arc-errand-type-");
    const remote = `${cwd}-remote.git`;
    onTestFinished(async () => { await cleanupTempDir(cwd); await cleanupTempDir(remote); });
    const init = await runArc(["init", "--yes", "--name", "typed-errand"], cwd);
    expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    const configPath = join(cwd, ".arc/system/arc-config.yml");
    const config = (await readFile(configPath, "utf8")).replace("branch.protection: partial", "branch.protection: full")
      .replace("session.remote_sync: enabled", "session.remote_sync: disabled");
    await writeFile(configPath, config);
    await git(cwd, ["add", "-A"]);
    const tree = await git(cwd, ["write-tree"]);
    const head = await git(cwd, ["commit-tree", tree, "-m", "initialize typed Errand fixture"]);
    await git(cwd, ["update-ref", "HEAD", head]);
    await git(cwd, ["init", "--bare", "--initial-branch=main", remote]);
    await git(cwd, ["remote", "add", "origin", remote]);
    await git(cwd, ["push", "-u", "origin", "main"]);
    const designated = await runArc(["store", "remote", "origin", "push"], cwd);
    expect(designated.exitCode, designated.stderr).toBe(0);
    const slug = "repair-output";
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", slug, "--type", type, "--json"],
      { command: ["git", "push", "origin", "HEAD"], cwdFromPreviousJson: "allocation.checkoutPath" },
      { args: ["errand", "leave", slug, "--state", "paused", "--json"], reuseResolvedCwd: true },
      { args: ["errand", "open", slug, "--json"], cwd },
    ], cwd, { timeout: 90_000 });
    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    expect(sequence.results).toHaveLength(3);
    const [opened, left, resumed] = sequence.results;
    // The store suffixes the branch with the generation it mints.
    expect(opened).toMatchObject({ outcome: "applied", identity: {
      branch: expect.stringMatching(new RegExp(`^${type}/${slug}-[0-9a-f]{8}$`, "u")), state: "open",
    } });
    const identity = (opened as { identity: { branch: string; claimId: string } }).identity;
    const branch = identity.branch;
    expect(left).toMatchObject({ outcome: "applied", settlement: { state: "paused" } });
    expect(resumed).toMatchObject({ outcome: "applied", identity: { branch, claimId: identity.claimId, state: "open" } });
    expect(await git(cwd, ["branch", "--show-current"])).toBe(branch);
    const record = await readStoreRecord(cwd, SlugSchema.parse("test-user"),
      recordReferences["work-item/record"](OwnerIdentitySchema.parse({ type: "work-item", name: slug })));
    expect(JSON.parse(record.content)).toMatchObject({ branch, claimId: identity.claimId, state: "open" });
  }, 120_000);
});
