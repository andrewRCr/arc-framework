import { expect, it } from "vitest";
import { createRemoteMover, switchFixture } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";

it.each(["tracking", "pruned keeper"] as const)("preserves a partly activated receiver's newer %s on retry", async (mode) => {
  const h = await switchFixture("upstream", "backing");
  let interrupted = false;
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, exec: async (command, args, options) => {
    if (!interrupted && args.includes("config") && args.includes("remote.upstream.arc-state") && args.at(-1) === "off") {
      interrupted = true;
      throw new Error("Stopped before relinquishing the source role");
    }
    return h.ports.exec(command, args, options);
  } })).rejects.toThrow("Stopped before relinquishing the source role");
  const ref = "refs/arc/user/andrew/personal", tracking = "refs/arc-remotes/backing/user/andrew/personal";
  const seen = "refs/arc/tmp/seen/backing/user/andrew/personal";
  const old = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", ref])).stdout.trim();
  const rows = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--format=%(objectname) %(path)", old])).stdout.trim().split("\n");
  const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
  const next = await plantRef(h.destinationDirectory, ref, entries, { gitDir: h.destinationDirectory, parents: [old] });
  success(await h.store.pull());
  expect((await h.a.git(["rev-parse", tracking])).stdout.trim()).toBe(next.tip);
  if (mode === "pruned keeper") {
    await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", ref]);
    success(await h.store.pull());
    expect((await h.a.git(["rev-parse", seen])).stdout.trim()).toBe(next.tip);
  }
  const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", tracking, seen])).stdout;
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", tracking, seen])).stdout).toBe(before);
  if (mode === "tracking") {
    await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "update-ref", "-d", ref]);
    success(await h.store.pull());
  }
  const divergent = await plantRef(h.destinationDirectory, ref, entries, { gitDir: h.destinationDirectory });
  const notices = success(await h.store.pull()).pulls.flatMap(pull => pull.notices);
  expect(notices).toContainEqual(expect.objectContaining({ kind: "history-diverged", ref, local: next.tip, remote: divergent.tip }));
  expect((await h.a.git(["rev-parse", seen])).stdout.trim()).toBe(next.tip);
}, 60_000);

it("preserves observations made after a same-name backing undo has reactivated its source", async () => {
  const h = await switchFixture("backing", "backing");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "backing.repointed") throw new Error("Stopped before forward role activation");
  } })).rejects.toThrow("Stopped before forward role activation");
  const peer = await createRemoteMover(h, h.destinationDirectory, "return-mover");
  expect((await invokeStoreMigrate(["--to", h.origin], peer.ports)).status).toBe("ok");
  let restoring = false;
  await expect(invokeStoreMigrate([], { ...h.ports, exec: async (command, args, options) => {
    if (args.includes("remote") && args.includes("set-url") && args.at(-1) === h.origin) restoring = true;
    const result = await h.ports.exec(command, args, options);
    if (restoring && args.includes("config") && args.includes("remote.backing.arc-state") && args.at(-1) === "push") {
      throw new Error("Stopped after source reactivation");
    }
    return result;
  } })).rejects.toThrow("Stopped after source reactivation");
  const ref = "refs/arc/user/andrew/personal", tracking = "refs/arc-remotes/backing/user/andrew/personal";
  const old = (await h.remote("git", ["rev-parse", ref])).stdout.trim();
  const rows = (await h.remote("git", ["ls-tree", "-r", "--format=%(objectname) %(path)", old])).stdout.trim().split("\n");
  const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
  const newer = await plantRef(h.origin, ref, entries, { gitDir: h.origin, parents: [old], message: "After undo activation" });
  await h.a.git(["fetch", "--refmap=", "--", h.origin, `${ref}:${tracking}`]);
  const before = (await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout;
  expect(before).toContain(newer.tip);
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout).toBe(before);
});

it("keeps newer heads while leaving the source of an activated follow", async () => {
  const h = await followFixture(undefined, "backing");
  const side = h.follower, moved = "refs/arc-remotes/backing/project/moved";
  const oldObservation = (await side.git(["rev-parse", moved])).stdout.trim();
  let interrupted = false;
  const ports = { ...side.ports, exec: async (...input: Parameters<typeof side.ports.exec>) => {
    const [, args] = input, result = await side.ports.exec(...input);
    if (!interrupted && args.includes("config") && args.includes("remote.backing.arc-state") && args.at(-1) === "push"
      && (await side.git(["remote", "get-url", "backing"])).stdout.trim() === h.destinationDirectory) {
      interrupted = true;
      await side.git(["update-ref", moved, oldObservation]);
      throw new Error("Stopped before old forwarding cleanup");
    }
    return result;
  } };
  const attempt = invokeStoreRemote(["backing", "push", "--json"], { cwd: side.root, ports });
  await expect(attempt).rejects.toThrow("Stopped before old forwarding cleanup");
  const ref = "refs/arc/user/andrew/personal", tracking = "refs/arc-remotes/backing/user/andrew/personal";
  const old = (await side.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", ref])).stdout.trim();
  const rows = (await side.exec("git", [`--git-dir=${h.destinationDirectory}`, "ls-tree", "-r", "--format=%(objectname) %(path)", old])).stdout.trim().split("\n");
  const entries = rows.map(row => ({ oid: row.slice(0, 40), path: row.slice(41), mode: "100644" as const }));
  const newer = await plantRef(h.destinationDirectory, ref, entries, { gitDir: h.destinationDirectory, parents: [old], message: "After follow activation" });
  await side.git(["fetch", "--refmap=", "--", h.destinationDirectory, `${ref}:${tracking}`]);
  const seen = "refs/arc/tmp/seen/backing/user/andrew/personal";
  await side.git(["update-ref", seen, newer.tip]);
  expect((await invokeStoreMigrate(["--leave-source"], side.ports)).status).toBe("ok");
  expect((await side.git(["rev-parse", tracking])).stdout.trim()).toBe(newer.tip);
  expect((await side.git(["rev-parse", seen])).stdout.trim()).toBe(newer.tip);
  expect((await side.git(["for-each-ref", "--format=%(refname)", moved])).stdout).toBe("");
});
