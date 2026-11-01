/** An isolated Errand's checkout takes the projection's lock through the actual CLI, or keeps another tool's. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repairCliFixture, repairCli } from "../helpers/repair-cli.js";
import { readWorktreeLock } from "../helpers/worktree-lock.js";
import { PROJECTION_LOCK_REASON } from "../../src/lib/git/worktree-removal.js";

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
  expect(warning).toContain(`git worktree unlock ${path}`);
}, TIMEOUT_MS);
