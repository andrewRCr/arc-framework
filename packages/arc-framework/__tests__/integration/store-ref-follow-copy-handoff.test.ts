/** A fresh accepted follow can account an earlier unrecorded copy without reusing its publication license. */
import { expect, it } from "vitest";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { createKindRegistry, MigrateReportSchema, type RefStorePorts, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

it.each((["push", "read", "off"] as const).flatMap(answer =>
  (["original", "changed", "withdrawn"] as const).flatMap(source =>
    (source === "original" ? ["confirmed", "accepted", "unlanded", "unread", "handoff"] as const : source === "withdrawn" && answer === "push" ? ["confirmed", "migrate", "migrate-blocked", "migrate-handoff"] as const : ["confirmed"] as const)
      .map(boundary => ({ answer, source, boundary })))))(
  "hands a $boundary old copy to a fresh $answer answer after the source is $source", async ({ answer, source, boundary }) => {
  const h = await lateFollowFixture(), original = h.follower.ports, root = h.follower.root;
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const advisory = { condition: "Inspect the follower's combined documents.", remedy: { text: "Save their combined text." } };
  const personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const oldSource = await plantRef(root, "refs/testing/old-follow-source", [...entries,
    { path: "andrew/source-before-handoff.md", content: "Source data.\n" }], { parents: [before] });
  const oldDestination = await plantRef(root, "refs/testing/old-follow-destination", [...entries,
    { path: "andrew/destination-before-handoff.md", content: "Destination data.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.origin, `${oldSource.tip}:${personal}`], { cwd: root });
  await original.exec("git", ["push", h.destinationDirectory, `${oldDestination.tip}:${personal}`], { cwd: root });
  let armed = true, published = false;
  const check: WriteCheck = async () => armed ? [{ rule: "follower-documents", ...advisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => { if (step === "follow.copied") throw new Error("Paused before follow record"); },
    exec: async (command, args, options) => {
      const copying = args.includes("push") && args.includes(h.destinationDirectory);
      if (copying && boundary === "unlanded") throw makeGitProcessError({ command, args, timedOut: true, stderr: "No send before timeout." });
      const result = await original.exec(command, args, options);
      if (copying) published = true;
      return result;
    },
    execInput: async (args, input, options) => {
      if (["accepted", "unread"].includes(boundary) && published && args.includes("update-ref")) throw new Error("Paused before follow record");
      return original.execInput(args, input, options);
    } };
  const first = () => invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  if (boundary === "unlanded") expect((await first()).result).toMatchObject({ status: "refused" });
  else await expect(first()).rejects.toThrow("Paused before follow record");
  const pending = "refs/arc/tmp/migrate/pending-copy/";
  expect((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toContain(pending + "record");
  armed = false;
  const current = join(h.a.root, "current-home.git"); await h.a.exec("git", ["init", "--bare", current]);
  expect(await invokeStoreMigrate(["--to", current], h.ports)).toMatchObject({ status: "ok" });
  await writeFile(h.follower.config, `storage.backing_repository: ${JSON.stringify(current)}\n`);
  if (source === "changed") {
    await original.exec("git", ["fetch", "--no-tags", h.destinationDirectory, "refs/arc/project/moved"], { cwd: root });
    await original.exec("git", ["push", "--force", h.origin, "FETCH_HEAD:refs/arc/project/moved"], { cwd: root });
  } else if (source === "withdrawn") await h.remote("git", ["update-ref", "-d", "refs/arc/project/moved"]);
  const old = (await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout;
  const retryPorts: RefStorePorts = { ...ports, migrateStep: undefined, execInput: original.execInput,
    exec: async (command, args, options) => {
      if (boundary === "unread" && args.includes("fetch") && args.includes(h.destinationDirectory)) {
        throw makeGitProcessError({ command, args, timedOut: true, stderr: "Original destination unavailable." });
      }
      return original.exec(command, args, options);
    } };
  if (boundary === "handoff") {
    let interrupted = false;
    await expect(invokeStoreRemote(["backing", answer, "--json"], { cwd: root, ports: { ...retryPorts,
      execInput: async (args, input, options) => {
        const result = await original.execInput(args, input, options);
        if (!interrupted && args.includes("update-ref") && input.includes("refs/arc/tmp/migrate/copied/report ") && input.includes(pending + "record ")) {
          interrupted = true; throw new Error("Account transferred before continuation");
        }
        return result;
      },
    } })).rejects.toThrow("Account transferred before continuation");
  }
  if (boundary === "migrate" || boundary === "migrate-blocked" || boundary === "migrate-handoff") {
    if (boundary === "migrate-blocked") {
      await original.exec("git", ["remote", "add", "another-home", current], { cwd: root });
      await original.exec("git", ["config", "remote.another-home.arc-state", "push"], { cwd: root });
    }
    if (boundary === "migrate-handoff") {
      let interrupted = false;
      await expect(invokeStoreMigrate([], { ...retryPorts, execInput: async (args, input, options) => {
        const result = await original.execInput(args, input, options);
        if (!interrupted && args.includes("update-ref") && input.includes("refs/arc/tmp/migrate/copied/report ") && input.includes(pending + "record ")) {
          interrupted = true; throw new Error("Withdrawn account transferred before tracking drop");
        }
        return result;
      } })).rejects.toThrow("Withdrawn account transferred before tracking drop");
    }
    const reconciled = await invokeStoreMigrate([], retryPorts);
    expect(reconciled.status, JSON.stringify(reconciled)).toBe(boundary === "migrate-blocked" ? "refused" : "ok");
    const report = reconciled.status === "ok" ? reconciled.result
      : reconciled.status === "refused" && reconciled.refusal.code !== "import-refused" ? reconciled.refusal.report : undefined;
    expect.soft(report?.notices.filter(row => row.condition.includes(advisory.condition))).toEqual([expect.objectContaining({ remedy: advisory.remedy })]);
    expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toBe("");
    expect.soft((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout).toBe(old);
    if (boundary === "migrate-blocked") await original.exec("git", ["config", "remote.another-home.arc-state", "off"], { cwd: root });
    expect(await invokeStoreMigrate(["--leave-source", "--to", current], original)).toMatchObject({ status: "ok" });
    return;
  }
  const resumed = (await invokeStoreRemote(["backing", answer, "--json"], { cwd: root, ports: retryPorts })).result;
  if (source === "withdrawn") {
    expect(resumed.status, JSON.stringify(resumed)).toBe("refused");
    if (resumed.status !== "refused" || resumed.refusal.code === "import-refused") throw new Error("Expected ordinary designation refusal");
    expect.soft(resumed.refusal).toMatchObject({ code: "role-conflict", remedy: { argv: ["arc", "store", "migrate", "--to", current] } });
    const report = MigrateReportSchema.safeParse(resumed.refusal.report);
    expect.soft(report.success, JSON.stringify(resumed)).toBe(true);
    if (report.success) expect.soft(report.data.notices.filter(row => row.condition.includes(advisory.condition))).toEqual([expect.objectContaining({ remedy: advisory.remedy })]);
    expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toBe("");
    expect.soft((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout).toBe(old);
    expect(await invokeStoreMigrate(["--leave-source", "--to", current], original)).toMatchObject({ status: "ok" });
    return;
  }
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Fresh follow answer did not complete");
  const report = MigrateReportSchema.safeParse(resumed.result.report);
  expect.soft(report.success, JSON.stringify(resumed)).toBe(true);
  if (report.success) expect.soft(report.data.notices.filter(row => row.condition.includes(advisory.condition))).toEqual([expect.objectContaining({ remedy: advisory.remedy })]);
  expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", pending], { cwd: root })).stdout).toBe("");
  expect.soft((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout).toBe(old);
  if (["accepted", "unlanded", "unread"].includes(boundary)) {
    expect.soft(report.success && report.data.notices.some(notice => notice.condition.includes("could not be established"))).toBe(true);
    expect.soft((await original.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/accounted-copy/"], { cwd: root })).stdout).toContain("/tips/");
  }
  expect.soft(resumed.result.remotes).toContainEqual(expect.objectContaining({ name: "backing", role: answer, url: current }));
}, 30_000);
