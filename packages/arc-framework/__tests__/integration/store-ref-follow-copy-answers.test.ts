/** Fresh nonpublishing answers and explicit endings preserve already-published follow history. */
import { expect, it } from "vitest";
import { followAccountFixture, interruptFollowAccount, advanceFollowAccount, followAccountRemoteRefs, followAccountAdvisory } from "../helpers/store/follow-account.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { MigrateReportSchema, type RefStorePorts } from "../../src/lib/store/index.js";

const pending = "refs/arc/tmp/migrate/pending-copy/";
const choices = (["read", "off"] as const).flatMap(answer => (["confirmed", "unknown"] as const).map(outcome => ({ answer, outcome })));

it.each(choices.flatMap(row => (["original", "transferred"] as const).map(boundary => ({ ...row, boundary }))))(
  "accepts a fresh $answer answer for the same $boundary key after $outcome publication", async ({ answer, outcome, boundary }) => {
  const f = await followAccountFixture(); await interruptFollowAccount(f, outcome);
  let current = f.h.destinationDirectory;
  if (boundary === "transferred") {
    current = await advanceFollowAccount(f); let interrupted = false;
    const ports: RefStorePorts = { ...f.ports, execInput: async (args, input, options) => {
      const result = await f.original.execInput(args, input, options);
      if (!interrupted && args.includes("update-ref") && input.includes("refs/arc/tmp/migrate/copied/report ") && input.includes(pending + "record ")) {
        interrupted = true; throw new Error("Transferred push account before recording");
      }
      return result;
    } };
    await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: f.root, ports })).rejects.toThrow("Transferred push account before recording");
  }
  const before = await followAccountRemoteRefs(f, current), source = await followAccountRemoteRefs(f, f.h.origin);
  const result = (await invokeStoreRemote(["backing", answer, "--json"], { cwd: f.root, ports: f.ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Current nonpublishing answer refused");
  const report = MigrateReportSchema.parse(result.result.report);
  expect(report.notices.filter(row => row.condition.includes(followAccountAdvisory.condition)))
    .toEqual([expect.objectContaining({ remedy: followAccountAdvisory.remedy })]);
  if (outcome === "unknown") expect(report.notices).toContainEqual(expect.objectContaining({
    condition: expect.stringContaining("could not be established"), remedy: expect.anything(),
  }));
  expect(result.result.remotes).toContainEqual(expect.objectContaining({ name: "backing", role: answer, url: current }));
  expect(await followAccountRemoteRefs(f, current)).toBe(before);
  expect(await followAccountRemoteRefs(f, f.h.origin)).toBe(source);
  expect((await f.original.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"], { cwd: f.root })).stdout).toBe("");
}, 30_000);
