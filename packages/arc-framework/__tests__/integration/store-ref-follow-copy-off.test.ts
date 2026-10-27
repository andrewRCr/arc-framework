/** Source-off escapes retire their matching follow account and retain its actual or uncertain report. */
import { expect, it } from "vitest";
import { join } from "node:path";
import { followAccountFixture, interruptFollowAccount, followAccountRemoteRefs, followAccountAdvisory } from "../helpers/store/follow-account.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { MigrateReportSchema, type RefStorePorts } from "../../src/lib/store/index.js";

it.each((["code", "backing"] as const).flatMap(source => (["forwarded", "withdrawn", "unreadable"] as const)
  .flatMap(state => (["confirmed", "unknown"] as const).map(outcome => ({ source, state, outcome })))))(
  "ends a $source follow with $outcome history when turning its $state old source off", async ({ source, state, outcome }) => {
  const f = await followAccountFixture(source); await interruptFollowAccount(f, outcome);
  if (state === "withdrawn") await f.h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
  const before = await followAccountRemoteRefs(f, f.h.destinationDirectory), old = await followAccountRemoteRefs(f, f.h.origin);
  let setting = true;
  const ports: RefStorePorts = { ...f.ports, exec: async (command, args, options) => {
    if (args.includes("fetch") && (state === "unreadable" && args.includes(f.h.origin)
      || setting && outcome === "unknown" && args.includes(f.h.destinationDirectory) && (options?.input?.split(/\r?\n/u) ?? []).some(arg => arg.includes("refs/arc/work/*:")))) {
      throw makeGitProcessError({ command, args, timedOut: true, stderr: "Historical receiver temporarily unreadable." });
    }
    return f.ports.exec!(command, args, options);
  } };
  const remote = source === "code" ? "origin" : "backing";
  const result = (await invokeStoreRemote([remote, "off", "--json"], { cwd: f.root, ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Source off refused");
  expect.soft(result.result.remotes).toContainEqual(expect.objectContaining({ name: remote, role: "off" }));
  const report = MigrateReportSchema.safeParse(result.result.report);
  expect.soft(report.success, JSON.stringify(result)).toBe(true);
  if (report.success) {
    expect.soft(report.data.notices.filter(row => row.condition.includes(followAccountAdvisory.condition)))
      .toEqual([expect.objectContaining({ remedy: followAccountAdvisory.remedy })]);
    if (outcome === "unknown") expect.soft(report.data.notices).toContainEqual(expect.objectContaining({
      condition: expect.stringContaining("could not be established"), remedy: expect.anything(),
    }));
  }
  expect(await followAccountRemoteRefs(f, f.h.destinationDirectory)).toBe(before);
  expect(await followAccountRemoteRefs(f, f.h.origin)).toBe(old);
  expect.soft((await f.original.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"], { cwd: f.root })).stdout).toBe("");
  setting = false;
  f.restoreReceiver();
  await f.original.exec("git", ["remote", "add", "current-home", f.h.destinationDirectory], { cwd: f.root });
  const designated = (await invokeStoreRemote(["current-home", "push", "--own-state", "--json"], { cwd: f.root, ports })).result;
  expect.soft(designated.status, JSON.stringify(designated)).toBe("ok");
  const next = join(f.root, "after-source-off.git"); await f.original.exec("git", ["init", "--bare", next], { cwd: f.root });
  expect.soft(await invokeStoreMigrate(["--to", next], ports)).toMatchObject({ status: "ok" });
  expect.soft(await followAccountRemoteRefs(f, next)).toContain("refs/arc/project/registry");
}, 30_000);
