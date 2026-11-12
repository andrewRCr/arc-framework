/** Explicit endings retain the historical report owned by a recorded nonpublishing successor. */
import { expect, it } from "vitest";
import { followAccountFixture, interruptFollowAccount, advanceFollowAccount, followAccountRemoteRefs, followAccountAdvisory } from "../helpers/store/follow-account.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";

const pending = "refs/arc/tmp/migrate/pending-copy/";
const choices = (["read", "off"] as const).flatMap(answer => (["confirmed", "unknown"] as const).map(outcome => ({ answer, outcome })));

it.each(choices)("retains $outcome history when explicitly ending a recorded $answer successor", async ({ answer, outcome }) => {
  const f = await followAccountFixture(); await interruptFollowAccount(f, outcome);
  const current = await advanceFollowAccount(f);
  const before = await followAccountRemoteRefs(f, current), source = await followAccountRemoteRefs(f, f.h.origin);
  await expect(invokeStoreRemote(["backing", answer, "--json"], { cwd: f.root, ports: { ...f.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Recorded nonpublishing successor"); },
  } })).rejects.toThrow("Recorded nonpublishing successor");
  const result = await invokeStoreMigrate(["--leave-source"], f.ports);
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Recorded ending refused");
  expect.soft(result.result.notices.filter(row => row.condition.includes(followAccountAdvisory.condition)))
    .toEqual([expect.objectContaining({ remedy: followAccountAdvisory.remedy })]);
  if (outcome === "unknown") expect.soft(result.result.notices).toContainEqual(expect.objectContaining({
    condition: expect.stringContaining("could not be established"), remedy: expect.anything(),
  }));
  expect(await followAccountRemoteRefs(f, current)).toBe(before);
  expect(await followAccountRemoteRefs(f, f.h.origin)).toBe(source);
  expect((await f.original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: f.root })).stdout).toBe("");
  expect((await invokeStoreRemote(["backing", answer, "--json"], { cwd: f.root, ports: f.ports })).result).toMatchObject({ status: "ok" });
}, 30_000);
