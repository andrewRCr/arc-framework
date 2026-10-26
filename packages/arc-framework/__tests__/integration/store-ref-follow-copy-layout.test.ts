/** Historical copy evidence and reports survive ordinary layout changes and interrupted source-off settings. */
import { expect, it } from "vitest";
import { join } from "node:path";
import { followAccountFixture, interruptFollowAccount, followAccountRemoteRefs, followAccountAdvisory } from "../helpers/store/follow-account.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { MigrateReportSchema, type MigrateReport, type RefStorePorts } from "../../src/lib/store/index.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

type Fixture = Awaited<ReturnType<typeof followAccountFixture>>;

async function checkAccount(f: Fixture, report: MigrateReport, outcome: "confirmed" | "unknown"): Promise<void> {
  expect(report.notices.filter(row => row.condition.includes(followAccountAdvisory.condition)))
    .toEqual([expect.objectContaining({ remedy: followAccountAdvisory.remedy })]);
  if (outcome !== "unknown") return;
  const notice = report.notices.find(row => row.condition.includes("could not be established"));
  expect(notice).toMatchObject({ remedy: { text: expect.stringContaining("git show ") } });
  const ref = /git show (\S+) /u.exec(notice?.remedy?.text ?? "")?.[1];
  if (!ref) throw new Error("The uncertainty notice has no inspectable record");
  const read = f.original.exec("git", ["show", ref], { cwd: f.root });
  await expect(read, "The reported inspection command must still work").resolves.toMatchObject({ stdout: expect.any(String) });
  const record = JSON.parse((await read).stdout) as { attempt: { changes: { next: string | null }[] } };
  expect(record.attempt.changes.length).toBeGreaterThan(0);
  for (const change of record.attempt.changes) if (change.next) {
    expect((await f.original.exec("git", ["cat-file", "-t", change.next], { cwd: f.root })).stdout.trim()).toBe("commit");
  }
}

it.each(["code", "backing"] as const)("keeps a %s source's uncertain evidence through both ordinary layout directions", async source => {
  const f = await followAccountFixture(source); await interruptFollowAccount(f, "unknown");
  const before = await followAccountRemoteRefs(f, f.h.destinationDirectory), old = await followAccountRemoteRefs(f, f.h.origin);
  const remote = source === "code" ? "origin" : "backing";
  const result = (await invokeStoreRemote([remote, "off", "--json"], { cwd: f.root, ports: f.ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Source off refused");
  const report = MigrateReportSchema.parse(result.result.report);
  await checkAccount(f, report, "unknown");
  f.restoreReceiver();
  await f.original.exec("git", ["remote", "add", "current-home", f.h.destinationDirectory], { cwd: f.root });
  await f.original.exec("git", ["config", "remote.pushDefault", "current-home"], { cwd: f.root });
  expect((await invokeStoreRemote(["current-home", "push", "--own-state", "--json"], { cwd: f.root, ports: f.ports })).result)
    .toMatchObject({ status: "ok", result: { layout: "default" } });
  await checkAccount(f, report, "unknown");
  expect((await invokeStoreRemote(["current-home", "off", "--json"], { cwd: f.root, ports: f.ports })).result)
    .toMatchObject({ status: "ok", result: { layout: "separate" } });
  await checkAccount(f, report, "unknown");
  expect(await followAccountRemoteRefs(f, f.h.destinationDirectory)).toBe(before);
  expect(await followAccountRemoteRefs(f, f.h.origin)).toBe(old);
}, 30_000);

it.each((["confirmed", "unknown"] as const).flatMap(outcome =>
  (["layout.record", "layout.rename", "layout.delete"] as const).map(boundary => ({ outcome, boundary }))))(
  "recovers $outcome source-off history after interruption at $boundary", async ({ outcome, boundary }) => {
  const f = await followAccountFixture(); await interruptFollowAccount(f, outcome);
  const before = await followAccountRemoteRefs(f, f.h.destinationDirectory), old = await followAccountRemoteRefs(f, f.h.origin);
  await expect(invokeStoreRemote(["origin", "off", "--json"], { cwd: f.root, ports: { ...f.ports,
    migrateStep: async step => { if (step === boundary) throw new Error("Interrupted source-off layout"); },
  } })).rejects.toThrow("Interrupted source-off layout");
  let report: MigrateReport;
  if (boundary === "layout.record") {
    const result = (await invokeStoreRemote(["origin", "off", "--json"], { cwd: f.root, ports: f.ports })).result;
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Source-off retry refused");
    report = MigrateReportSchema.parse(result.result.report);
  } else {
    const result = await invokeStoreMigrate([], f.ports);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Recorded layout retry refused");
    report = result.result;
  }
  await checkAccount(f, report, outcome);
  expect((await f.original.exec("git", ["config", "remote.origin.arc-state"], { cwd: f.root })).stdout.trim()).toBe("off");
  expect(await followAccountRemoteRefs(f, f.h.destinationDirectory)).toBe(before);
  expect(await followAccountRemoteRefs(f, f.h.origin)).toBe(old);
}, 30_000);

it.each((["code", "backing"] as const).flatMap(source => (["confirmed", "unknown"] as const)
  .flatMap(outcome => (["read", "off"] as const).flatMap(answer => (["follow.record", "follow.recorded"] as const)
    .map(boundary => ({ source, outcome, answer, boundary }))))))(
  "carries $source $outcome history through $boundary for $answer after an interrupted off", async ({ source, outcome, answer, boundary }) => {
  const f = await followAccountFixture(source); await interruptFollowAccount(f, outcome);
  let interrupted = false;
  const ports: RefStorePorts = { ...f.ports, exec: async (command, args, options) => {
    if (source === "backing" && args.includes("fetch") && args.includes(f.h.origin)) {
      throw makeGitProcessError({ command, args, timedOut: true, stderr: "Old source temporarily unreadable." });
    }
    return f.ports.exec!(command, args, options);
  }, execInput: async (args, input, options) => {
    const result = await f.original.execInput(args, input, options);
    if (!interrupted && args.includes("update-ref") && input.includes("refs/arc/tmp/migrate/copied/report ") && input.includes("delete refs/arc/tmp/migrate/pending-copy/record ")) {
      interrupted = true; throw new Error("Historical account transferred before source off");
    }
    return result;
  } };
  await expect(invokeStoreRemote([source === "code" ? "origin" : "backing", "off", "--json"], { cwd: f.root, ports }))
    .rejects.toThrow("Historical account transferred before source off");
  await expect(invokeStoreRemote(["backing", answer, "--json"], { cwd: f.root, ports: { ...f.ports,
    migrateStep: async step => { if (step === boundary) throw new Error("Interrupted fresh answer"); },
  } })).rejects.toThrow("Interrupted fresh answer");
  const result = boundary === "follow.recorded" ? await invokeStoreMigrate([], f.ports)
    : (await invokeStoreRemote(["backing", answer, "--json"], { cwd: f.root, ports: f.ports })).result;
  expect(result.status, JSON.stringify(result)).toBe("ok");
  if (result.status !== "ok") throw new Error("Fresh recorded answer refused");
  await checkAccount(f, MigrateReportSchema.parse("report" in result.result ? result.result.report : result.result), outcome);
}, 30_000);

it.each((["confirmed", "unknown"] as const).flatMap(outcome => (["remote", "migrate", "trial", "leave"] as const).map(continuation => ({ outcome, continuation })) ))(
  "recovers $outcome history through $continuation when a withdrawn backing-off write is interrupted", async ({ outcome, continuation }) => {
  const f = await followAccountFixture("backing"); await interruptFollowAccount(f, outcome);
  await f.h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
  await expect(invokeStoreRemote(["backing", "off", "--json"], { cwd: f.root, ports: { ...f.ports,
    exec: async (command, args, options) => {
      if (args.includes("config") && args.includes("remote.backing.arc-state") && args.includes("off")) throw new Error("Interrupted backing off write");
      return f.ports.exec!(command, args, options);
    },
  } })).rejects.toThrow("Interrupted backing off write");
  if (continuation === "migrate" || continuation === "leave") {
    f.restoreReceiver();
    const result = await invokeStoreMigrate(continuation === "leave" ? ["--leave-source", "--to", f.h.destinationDirectory] : [], f.ports);
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("No-target recovery refused");
    await checkAccount(f, result.result, outcome);
  } else {
    if (continuation === "trial") {
      f.restoreReceiver();
      await f.original.exec("git", [`--git-dir=${join(f.root, ".git/arc/store")}`, "remote", "set-url", "backing", f.h.destinationDirectory], { cwd: f.root });
      const destination = join(f.root, "trial-destination.git");
      await f.original.exec("git", ["init", "--bare", destination], { cwd: f.root });
      const trial = await invokeStoreMigrate(["--to", destination, "--trial"], f.ports);
      expect(trial, JSON.stringify(trial)).toMatchObject({ status: "ok" });
    }
    const result = (await invokeStoreRemote(["backing", "off", "--json"], { cwd: f.root, ports: f.ports })).result;
    expect(result.status, JSON.stringify(result)).toBe("ok");
    if (result.status !== "ok") throw new Error("Backing off retry refused");
    expect(result.result.report, "The interrupted source-off account must be returned").toBeDefined();
    await checkAccount(f, MigrateReportSchema.parse(result.result.report), outcome);
  }
}, 30_000);

it("preserves an unrelated pending copy when the source transport changes before an off layout switch", async () => {
  const f = await followAccountFixture(); await interruptFollowAccount(f, "unknown");
  const refs = () => f.original.exec("git", ["for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/tmp/migrate/pending-copy/"], { cwd: f.root });
  const held = (await refs()).stdout;
  expect(held).toContain("pending-copy/record");
  await f.original.exec("git", ["remote", "set-url", "origin", f.h.origin + "/."], { cwd: f.root });
  expect((await invokeStoreRemote(["origin", "off", "--json"], { cwd: f.root, ports: f.ports })).result)
    .toMatchObject({ status: "ok", result: { layout: "separate" } });
  expect((await refs()).stdout).toBe(held);
}, 30_000);
