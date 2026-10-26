/** Restarted remote cleanup preserves landed deletion actions and late-merge remedies. */
import { expect, it } from "vitest";
import { switchFixture } from "../helpers/store/remote-move.js";
import { lateFollowFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createKindRegistry, type RefStorePorts, type MigrateReport, type WriteCheck } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";

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

it.each(["remote", "follow"] as const)("retains a late %s re-copy advisory and remedy after an interruption", async kind => {
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
  let armed = false, late = false;
  const check: WriteCheck = async () => armed ? [{ rule: "late-documents", ...advisory }] : [];
  const ports: RefStorePorts = { ...original, registry: { ...registry, "personal/document": { ...registry["personal/document"], check } },
    migrateStep: async step => {
      if (step === `${kind}.switched` && !late) {
        late = true; armed = true;
        const planted = await plantRef(root, "refs/testing/late-copy", [...entries, { path: "andrew/late.md", content: "Late cleanup data.\n" }], { parents: [before] });
        await original.exec("git", ["push", h.origin, `${planted.tip}:refs/arc/user/andrew/personal`], { cwd: root });
      }
      if (step === `${kind}.recopied`) throw new Error("Paused after cleanup re-copy");
    } };
  const start = kind === "remote" ? () => invokeStoreMigrate(["--to", h.to], ports)
    : () => invokeStoreRemote(["backing", "push", "--json"], { cwd: root, ports });
  await expect(start()).rejects.toThrow("Paused after cleanup re-copy");
  const resumed = await invokeStoreMigrate([], { ...ports, migrateStep: undefined });
  expect(resumed.status, JSON.stringify(resumed)).toBe("ok");
  if (resumed.status !== "ok") throw new Error("Cleanup did not resume");
  const report: MigrateReport = resumed.result;
  expect(report.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining(advisory.condition), remedy: advisory.remedy }));
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
