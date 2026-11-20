/** Abandonment completes after its invoking checkout has been removed. */

import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { expect, it } from "vitest";

import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { readStoreRecord, seedStore } from "../helpers/store/seed-store.js";
import { cleanupTempDir, createTempRepo, runArc, runArcAnchoredSequence } from "./store-default.js";

const execFileAsync = promisify(execFile);
const ABANDON_TIMEOUT_MS = 60_000;
const IDENTITY = SlugSchema.parse("test-user");
const INBOX = recordReferences["personal/inbox"](OwnerIdentitySchema.parse({ type: "person", name: "test-user" }));

it("abandons from its own checkout, retains the capture, and retires the identity", async () => {
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
    const designated = await runArc(["store", "remote", "origin", "push"], primary);
    expect(designated.exitCode, designated.stderr).toBe(0);
    const capture = "# User Inbox\n\n## Errand\n\n### `[ ]` **Discard capture**\n\n"
      + "- _Id:_ `0a1b2c3d`\n- _Created:_ `2026-11-01`\n\n- _Observation:_ retain this capture.\n";
    await seedStore(primary, IDENTITY, [{ reference: INBOX, content: capture,
      expected: (await readStoreRecord(primary, IDENTITY, INBOX)).version }]);

    const result = await runArcAnchoredSequence([
      ["errand", "open", "discard-own", "--isolate", "--from-inbox", "personal:0a1b2c3d", "--json"],
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
      settlement: { kind: "capture", disposition: "retained", originEntry: "personal:0a1b2c3d" },
    });
    if (spawned === null) throw new Error("Missing allocated checkout");
    await expect(access(spawned)).rejects.toMatchObject({ code: "ENOENT" });
    // On the store, opening from the inbox moved the capture into the Errand's description; abandoning returns it.
    const inbox = (await readStoreRecord(primary, IDENTITY, INBOX)).content;
    expect(inbox).toContain("### `[ ]` **Discard capture**");
    expect(inbox).toContain("- _Id:_ `0a1b2c3d`");
    expect(inbox).toContain("- _Observation:_ retain this capture.");
    expect(await git(["branch", "--list", "chore/discard-own-*"])).toBe("");
    const errand = await readStoreRecord(primary, IDENTITY, recordReferences["work-item/record"](
      OwnerIdentitySchema.parse({ type: "work-item", name: "discard-own" })));
    expect(errand.placement?.kind).toBe("completed");
    // The store publishes state only through `arc sync`, so the verb leaves nothing on the remote to retire.
    expect(await git(["ls-remote", "origin", "refs/arc/*"])).toBe("");
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
