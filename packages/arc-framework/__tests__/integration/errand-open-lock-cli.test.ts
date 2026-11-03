/** An isolated Errand's checkout takes the projection's lock through the actual CLI, or keeps another tool's. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { repairCliFixture, repairCli, withRepairStore } from "../helpers/repair-cli.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { lockSpawnedCheckout, PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";
import { quoteShellArgument } from "../../src/lib/release/commit-message-retry.js";
import * as ioModule from "../../src/lib/io-context.js";
import { handleErrandOpen } from "../../src/handlers/errand.js";
import { ErrandOperationResultSchema } from "../../src/lib/errand/operation-result.js";
import { scanRegisteredWorktrees } from "../../src/lib/git/worktree-roster.js";
import { readWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { makeInteractionContext } from "../helpers/interaction-context.js";
import { runHandlerAt } from "../helpers/handler.js";

const TIMEOUT_MS = 30_000;

async function fixture(postCreate = "") {
  const f = await repairCliFixture();
  const configPath = join(f.cwd, ".arc/system/arc-config.yml");
  const config = (await readFile(configPath, "utf8"))
    .replace(/^worktree\.location_template:.*$/mu, "worktree.location_template: .arc-checkouts/{name}")
    .replace(/^worktree\.post_create:.*$/mu, `worktree.post_create: ${postCreate}`);
  await writeFile(configPath, config);
  await f.exec("git", ["commit", "-am", "Place checkouts inside the fixture"]);
  await writeFile(join(f.cwd, ".git/info/exclude"), ".arc-checkouts/\n", { flag: "a" });
  return f;
}

function spawnedPath(run: { result: unknown }): string {
  const result = run.result as { outcome?: string; allocation?: { kind?: string; checkoutPath?: string } } | null;
  if (result?.allocation?.kind !== "spawned" || result.allocation.checkoutPath === undefined) {
    throw new Error(`Expected a spawned Errand checkout: ${JSON.stringify(run.result)}`);
  }
  return result.allocation.checkoutPath;
}

it("finds a replayed open's checkout under the projection's lock, keeps it, and succeeds without a warning", async () => {
  const f = await fixture();
  const argv = ["errand", "open", "replayed", "--isolate", "--intent", "Replay the open", "--json"];
  const first = await repairCli(f, argv);
  expect(first, first.stdout + first.stderr).toMatchObject({ result: { outcome: "applied" } });
  const path = spawnedPath(first);
  expect(await readWorktreeLock(f.exec, path)).toBe(PROJECTION_LOCK_REASON);

  const replay = await repairCli(f, argv);
  expect(replay, replay.stdout + replay.stderr).toMatchObject({ result: { outcome: expect.stringMatching(/^(applied|idempotent)$/u) } });
  expect(spawnedPath(replay)).toBe(path);
  expect(replay.stderr).not.toContain("warning:");
  expect(await readWorktreeLock(f.exec, path)).toBe(PROJECTION_LOCK_REASON);
}, TIMEOUT_MS);

it("keeps a lock another tool set on the spawned checkout first and warns naming the checkout and its reason", async () => {
  const f = await fixture("git worktree lock --reason provisioning-tool .");
  const opened = await repairCli(f, ["errand", "open", "foreign", "--isolate", "--intent", "Keep the tool's lock", "--json"]);
  expect(opened, opened.stdout + opened.stderr).toMatchObject({ result: { outcome: "applied" } });
  const path = spawnedPath(opened);
  expect(await readWorktreeLock(f.exec, path)).toBe("provisioning-tool");
  const warning = opened.stderr.split("\n").find((line) => line.startsWith("warning: ")) ?? "";
  expect(warning, opened.stderr).toContain(path);
  expect(warning).toContain("provisioning-tool");
  expect(warning).toContain(`git worktree unlock ${quoteShellArgument(path)}`);
}, TIMEOUT_MS);

it("refuses successful open after sole lock failure, retains its claim and ready marker, and allows repaired replay", async () => {
  const f = await fixture();
  const slug = "lock-failed";
  const original = ioModule.createUserIOContext;
  const factory = vi.spyOn(ioModule, "createUserIOContext").mockImplementation(() => {
    const io = original();
    return { ...io, exec: async (command, args, options) => {
      if (args[0] === "worktree" && args[1] === "lock") {
        throw makeGitProcessError({ command, args, exitCode: 128, stderr: "lock denied" });
      }
      return io.exec(command, args, options);
    } };
  });
  const open = () => withRepairStore(f.h.context.store, () => runHandlerAt(f.cwd, () =>
    handleErrandOpen(slug, { isolate: true, intent: "Retain failed protection", json: true },
      makeInteractionContext({ noInput: true, yes: "compatibility" })),
  ));
  let failed;
  try { failed = await open(); }
  finally { factory.mockRestore(); }
  const result = ErrandOperationResultSchema.parse(JSON.parse(failed.stdout));
  expect(failed.exitCode, failed.stdout + failed.stderr).toBe(1);
  expect(result).toMatchObject({ outcome: "error", error: { code: "locus.errand-open.provision" } });
  expect(failed.stdout).toContain("lock denied");
  expect(failed.stdout).toContain("git worktree lock --reason");
  const roster = await scanRegisteredWorktrees(f.exec);
  if (!roster.ok) throw new Error(roster.message);
  const checkout = roster.worktrees.find((row) => !row.primary);
  if (checkout === undefined) throw new Error("The placed checkout was not retained");
  const marker = await readWorktreeMarker(checkout.path);
  expect(marker).toMatchObject({ kind: "present", marker: { provisioning: "ready" } });
  expect(await readWorktreeLock(f.exec, checkout.path)).toBeUndefined();
  expect(await lockSpawnedCheckout(f.exec, checkout.path)).toEqual({ kind: "locked" });
  const replay = await open();
  const replayed = ErrandOperationResultSchema.parse(JSON.parse(replay.stdout));
  expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
  expect(replayed).toMatchObject({ outcome: "idempotent", allocation: { kind: "spawned", checkoutPath: checkout.path } });
  expect(await readWorktreeMarker(checkout.path)).toEqual(marker);
  expect(await readWorktreeLock(f.exec, checkout.path)).toBe(PROJECTION_LOCK_REASON);
}, TIMEOUT_MS);
