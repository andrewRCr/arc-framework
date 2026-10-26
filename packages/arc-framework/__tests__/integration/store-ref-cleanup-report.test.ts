/** Restarted remote cleanup preserves landed deletion actions and late-merge remedies. */
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createKindRegistry, MigrateReportSchema, type RefStorePorts, type MigrateReport, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { missingSourceFixture } from "../helpers/store/leave-source.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { chmod, mkdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

it.each([false, true])("matches a completed move's registry actions in trial with existing destination %s", async existing => {
  const h = await switchFixture(), ref = "refs/arc/project/registry";
  if (existing) await h.remote("git", ["push", h.destinationDirectory, `${ref}:${ref}`]);
  const trial = await invokeStoreMigrate(["--to", h.to, "--trial"], h.ports);
  const moved = await invokeStoreMigrate(["--to", h.to], h.ports);
  expect(trial.status, JSON.stringify(trial)).toBe("ok");
  expect(moved.status, JSON.stringify(moved)).toBe("ok");
  if (trial.status !== "ok" || moved.status !== "ok") throw new Error("Move did not complete");
  const actions = (report: MigrateReport) => report.refs.filter(row => row.ref === ref).map(row => row.action).sort();
  expect(actions(moved.result)).toEqual(existing ? ["delete", "merge"] : ["copy", "delete", "merge"]);
  expect(actions(trial.result)).toEqual(actions(moved.result));
}, 30_000);

it.each(["remote", "follow"] as const)("retains the %s cleanup's landed deletions after an interruption", async kind => {
  const followed = kind === "follow" ? await lateFollowFixture() : null;
  const h = followed ?? await switchFixture();
  const ports = followed ? followed.follower.ports : h.ports;
  const root = followed ? followed.follower.root : h.a.root;
  let removed: string[] = [];
  const interrupted = { ...ports, migrateStep: async (step: string) => {
    if (step === `${kind}.delete`) removed = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"]))
      .stdout.split("\n").filter(ref => ref && ref !== "refs/arc/project/moved");
    if (step === `${kind}.deleted`) throw new Error("Paused after cleanup deletion");
  } };
  const start = kind === "remote" ? () => invokeStoreMigrate(["--to", h.to], interrupted)
    : () => invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports: interrupted });
  await expect(start()).rejects.toThrow("Paused after cleanup deletion");
  expect(removed.length).toBeGreaterThan(0);
  const resumed = await invokeStoreMigrate([], ports);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Cleanup did not resume");
  for (const ref of removed) expect(resumed.result.refs.filter(row => row.ref === ref && row.action === "delete")).toHaveLength(1);
}, 30_000);

it.each((["remote", "follow"] as const).flatMap(kind => (["after-report", "before-report", "before-journal"] as const).map(boundary => ({ kind, boundary }))))(
  "retains a late $kind re-copy advisory and remedy after $boundary interruption", async ({ kind, boundary }) => {
  const followed = kind === "follow" ? await lateFollowFixture() : null;
  const h = followed ?? await switchFixture();
  const original = followed ? followed.follower.ports : h.ports;
  const root = followed ? followed.follower.root : h.a.root;
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS);
  const advisory = { condition: "Inspect the late merged documents.", remedy: { text: "Save their combined result." } };
  const personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", kind === "remote" ? h.origin : h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const diverged = await plantRef(root, "refs/testing/destination", [...entries,
    { path: "andrew/destination-late.md", content: "Destination-only data.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.destinationDirectory, `${diverged.tip}:${personal}`], { cwd: root });
  let armed = false, late = false, published = false;
  const check: WriteCheck = async () => armed ? [{ rule: "late-documents", ...advisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => {
      if (step === `${kind}.switched` && !late) {
        late = true; armed = true;
        const planted = await plantRef(root, "refs/testing/late-copy", [...entries, { path: "andrew/late.md", content: "Late cleanup data.\n" }], { parents: [before] });
        await original.exec("git", ["push", h.origin, `${planted.tip}:refs/arc/user/andrew/personal`], { cwd: root });
      }
      if (boundary === "after-report" && step === `${kind}.recopied`) throw new Error("Paused during cleanup re-copy");
    },
    execInput: async (args, input, options) => {
      if (boundary === "before-report" && armed && args.includes("update-ref") && input.includes("update refs/arc/tmp/migrate/copied/report ")) {
        throw new Error("Paused during cleanup re-copy");
      }
      if (boundary === "before-journal" && armed && published && args.includes("update-ref")) throw new Error("Paused during cleanup re-copy");
      return original.execInput(args, input, options);
    },
    exec: async (...args) => {
      const result = await original.exec(...args);
      if (armed && args[1].includes("push") && args[1].includes(h.destinationDirectory)) published = true;
      return result;
    } };
  const start = kind === "remote" ? () => invokeStoreMigrate(["--to", h.to], ports)
    : () => invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  await expect(start()).rejects.toThrow("Paused during cleanup re-copy");
  armed = false;
  const resumed = await invokeStoreMigrate([], { ...ports, migrateStep: undefined, execInput: original.execInput, exec: original.exec });
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Cleanup did not resume");
  const report: MigrateReport = resumed.result;
  expect(report.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining(advisory.condition), remedy: advisory.remedy }));
}, 30_000);

it.each((["remote", "follow", "leave-source"] as const).flatMap(kind =>
  (["report-storage", "after-report", "journal-storage", "transport-before", "transport-after", "receiver-refusal"] as const).map(failure => ({ kind, failure }))))(
  "settles the initial $kind copy report after $failure", async ({ kind, failure }) => {
  const leaving = kind === "leave-source" ? await missingSourceFixture() : null;
  const following = kind === "follow" ? await lateFollowFixture() : null;
  const h = leaving ?? following ?? await switchFixture();
  const side = leaving?.follower ?? following?.follower;
  const original = side?.ports ?? h.ports, root = side?.root ?? h.a.root;
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", kind === "remote" ? h.origin : h.destinationDirectory, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const source = await plantRef(root, "refs/testing/source-copy", [...entries, { path: "andrew/source-copy.md", content: "Late source data.\n" }], { parents: [before] });
  const destination = await plantRef(root, "refs/testing/destination-copy", [...entries, { path: "andrew/destination-copy.md", content: "Destination data.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.destinationDirectory, `${destination.tip}:${personal}`], { cwd: root });
  if (kind === "leave-source") await original.exec("git", ["update-ref", "refs/arc-remotes/origin/user/andrew/personal", source.tip], { cwd: root });
  else await original.exec("git", ["push", h.origin, `${source.tip}:${personal}`], { cwd: root });
  const advisory = { condition: `Inspect the ${kind} merged documents.`, remedy: { text: "Preserve the combined copy result." } };
  const beforeDestination = (await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout;
  const hookDir = join(root, "copy-report-hooks"), hook = join(hookDir, "pre-receive");
  if (failure === "receiver-refusal") {
    await mkdir(hookDir); await writeFile(hook, "#!/bin/sh\nexit 1\n"); await chmod(hook, 0o700);
    await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "config", "core.hooksPath", hookDir], { cwd: root });
  }
  let armed = true;
  const check: WriteCheck = async () => armed ? [{ rule: "copy-documents", ...advisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => {
      if (armed && failure === "after-report" && step === `${kind === "leave-source" ? "leave" : kind}.copied`) throw new Error("Paused copy persistence");
    },
    execInput: async (args, input, options) => {
      if (armed && args.includes("update-ref") && (failure === "report-storage" && input.includes("refs/arc/tmp/migrate/copied/report ")
        || failure === "journal-storage" && input.includes("refs/arc/tmp/migrate/pending-copy/record "))) throw new Error("Paused copy persistence");
      return original.execInput(args, input, options);
    },
    exec: async (command, args, options) => {
      const copying = armed && args.includes("push") && args.includes(h.destinationDirectory);
      if (copying && failure === "transport-before") throw makeGitProcessError({ command, args, timedOut: true, stderr: "Copy transport timed out before sending." });
      const result = await original.exec(command, args, options);
      if (copying && failure === "transport-after") throw makeGitProcessError({ command, args, timedOut: true, stderr: "Copy transport timed out after receiver acceptance." });
      return result;
    } };
  const start = async () => kind === "follow"
    ? (await invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports })).result
    : invokeStoreMigrate(kind === "remote" ? ["--to", h.to] : ["--leave-source", "--to", h.to], ports);
  if (failure === "report-storage" || failure === "after-report" || failure === "journal-storage") await expect(start()).rejects.toThrow("Paused copy persistence");
  else expect(await start()).toMatchObject({ status: "refused" });
  if (["journal-storage", "transport-before", "receiver-refusal"].includes(failure)) {
    expect((await original.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(objectname) %(refname)", "refs/arc/"], { cwd: root })).stdout)
      .toBe(beforeDestination);
  }
  if (failure === "receiver-refusal") await unlink(hook);
  armed = false;
  if (kind === "remote" && failure === "after-report") {
    const interruptedAgain = await invokeStoreMigrate([], { ...ports, migrateStep: undefined, execInput: original.execInput,
      exec: async (command, args, options) => {
        if (args.includes("push") && args.includes(h.destinationDirectory)) {
          throw makeGitProcessError({ command, args, timedOut: true, stderr: "A later copy transport timed out before sending." });
        }
        return original.exec(command, args, options);
      } });
    expect(interruptedAgain).toMatchObject({ status: "refused" });
  }
  const retryPorts = { ...ports, migrateStep: undefined, execInput: original.execInput, exec: original.exec };
  const resumed = kind === "follow" ? (await invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports: retryPorts })).result
    : await invokeStoreMigrate(kind === "remote" ? failure === "receiver-refusal" ? ["--to", h.to] : [] : ["--leave-source", "--to", h.to], retryPorts);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Initial copy did not resume");
  const report = MigrateReportSchema.parse("report" in resumed.result ? resumed.result.report : resumed.result);
  expect(report.notices.filter(notice => notice.condition.includes(advisory.condition)))
    .toEqual(failure === "report-storage" || failure === "after-report" || failure === "transport-after" ? [expect.objectContaining({ remedy: advisory.remedy })] : []);
  expect((await original.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/pending-copy/"], { cwd: root })).stdout).toBe("");
}, 30_000);

it.each(["remote", "follow"] as const)("reconstructs %s deletions when reporting is interrupted after the receiver accepted them", async kind => {
  const followed = kind === "follow" ? await lateFollowFixture() : null;
  const h = followed ?? await switchFixture(), original = followed ? followed.follower.ports : h.ports;
  const root = followed ? followed.follower.root : h.a.root;
  let removed: string[] = [];
  const ports: RefStorePorts = { ...original,
    migrateStep: async step => {
      if (step === `${kind}.delete`) removed = (await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"]))
        .stdout.split("\n").filter(ref => ref && ref !== "refs/arc/project/moved");
    },
    execInput: async (args, input, options) => {
      if (args.includes("update-ref") && input.includes("delete refs/arc/tmp/migrate/copied/deleting/")
        && input.includes("refs/arc/tmp/migrate/copied/report")) throw new Error("Paused before deletion report persistence");
      return original.execInput(args, input, options);
    },
  };
  const start = kind === "remote" ? () => invokeStoreMigrate(["--to", h.to], ports)
    : () => invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  await expect(start()).rejects.toThrow("Paused before deletion report persistence");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect(removed.length).toBeGreaterThan(0);
  const resumed = await invokeStoreMigrate([], original);
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Cleanup did not resume");
  for (const ref of removed) expect(resumed.result.refs.filter(row => row.ref === ref && row.action === "delete")).toHaveLength(1);
}, 30_000);
