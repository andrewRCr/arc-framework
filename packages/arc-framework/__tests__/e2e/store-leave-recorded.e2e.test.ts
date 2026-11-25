/** Explicit record endings preserve publications when remote cleanup can no longer succeed. */
import { rm } from "node:fs/promises";
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { runArcNoTty } from "./helpers.js";

it("ends a switched move through the CLI after the old receiver is deleted", async () => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.switched") throw new Error("Pause before cleanup");
  } })).rejects.toThrow("Pause before cleanup");
  await rm(h.origin, { recursive: true, force: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    const blocked = await runArcNoTty(["store", "migrate", "--json"], h.a.root);
    expect(JSON.parse(blocked.stdout)).toMatchObject({ status: "refused", refusal: { code: "move-unfinished" } });
  }
  const ended = await runArcNoTty(["store", "migrate", "--leave-source", "--json"], h.a.root);
  expect(ended.exitCode, ended.stdout + ended.stderr).toBe(0);
  expect(JSON.parse(ended.stdout)).toMatchObject({ status: "ok", result: { notices: expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining(h.origin) }),
  ]) } });
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
}, 60_000);

it.each(["remote.switched", "remote.deleted"])("ends a deleted-destination move through the CLI after %s", async step => {
  const h = await switchFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async current => {
    if (current === step) throw new Error("Pause move");
  } })).rejects.toThrow("Pause move");
  const root = (await h.remote("git", ["rev-parse", "refs/arc/project/moved"])).stdout.trim();
  await rm(h.destinationDirectory, { recursive: true, force: true });
  const ended = await runArcNoTty(["store", "migrate", "--leave-source", "--json"], h.a.root);
  expect(ended.exitCode, ended.stdout + ended.stderr).toBe(0);
  const forwarding = (await h.remote("git", ["for-each-ref", "--format=%(objectname)", "refs/arc/project/moved"])).stdout.trim();
  expect(forwarding).toBe(step === "remote.deleted" ? root : "");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/move"])).stdout).toBe("");
}, 60_000);
