import { expect, it } from "vitest";

import type { RefStorePorts } from "../../src/lib/store/index.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { plantRef, removeLooseObject } from "../helpers/store/ref-plant.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { switchFixture } from "../helpers/store/remote-move.js";
import { success } from "../helpers/store/suite-tools.js";

async function localFetchLoss(original: RefStorePorts, selected: (args: readonly string[], input: string) => boolean) {
  const ref = "refs/heads/migration-local-loss", root = original.checkoutRoot;
  const { tip } = await plantRef(root, ref, [], { message: "Independent local migration fetch tip" });
  const bytes = (await original.rawExec(["cat-file", "commit", tip])).stdout;
  let removed = false, lastFetch = "";
  const ports: RefStorePorts = { ...original, exec: async (command, args, options) => {
    if (args.includes("fetch")) lastFetch = args.join(" ");
    if (!removed && args.includes("fetch") && selected(args, options?.input ?? "")) {
      removed = true; await removeLooseObject(root, tip);
    }
    return original.exec(command, args, options);
  } };
  return { ports, ref, tip, get removed() { return removed; }, get lastFetch() { return lastFetch; },
    repair: async () => Buffer.from((await original.rawExec(["hash-object", "-t", "commit", "-w", "--stdin"], { input: bytes })).stdout).toString().trim(),
  };
}

function expectLocalLoss(result: unknown, ref: string) {
  expect(result).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
    code: "refused", class: "terminal", condition: expect.stringContaining(ref),
    remedy: { text: expect.stringMatching(/^Restore the missing local object/u) },
  } } });
}

it.each(["code", "backing"] as const)("preserves local fetch loss while judging a follow from %s", async source => {
  const h = await followFixture(undefined, source), follower = h.follower;
  const loss = await localFetchLoss(follower.ports, (args, input) => args.includes(h.origin) && input.includes(":refs/arc/tmp/follow/source/"));
  const tracking = async () => (await follower.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/"])).stdout;
  const before = await tracking(), configuration = (await follower.exec("git", ["config", "--local", "--list"])).stdout;
  expectLocalLoss(await invokeStoreMigrate([], loss.ports), loss.ref);
  expect(loss.removed, loss.lastFetch).toBe(true);
  expect(await tracking()).toBe(before);
  expect((await follower.exec("git", ["config", "--local", "--list"])).stdout).toBe(configuration);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/follow/"])).stdout).toBe("");
  expect(await loss.repair()).toBe(loss.tip);
  expect(await invokeStoreMigrate([], loss.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: loss.ports })).result.status).toBe("ok");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(["code", "backing"] as const)("retains a recorded move when its destination read has local loss from %s", async source => {
  const h = await switchFixture(source, source === "code" ? "backing" : "code");
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports,
    migrateStep: async step => { if (step === "remote.forwarded") throw new Error("Pause after forwarding"); },
  })).rejects.toThrow("Pause after forwarding");
  const move = "refs/arc/tmp/migrate/move";
  const before = (await h.a.exec("git", ["rev-parse", move])).stdout.trim();
  const sourceRefs = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const loss = await localFetchLoss(h.ports, (args, input) => args.includes(h.destinationDirectory) && input.includes(":refs/arc/tmp/migrate/remote/"));
  expectLocalLoss(await invokeStoreMigrate(["--leave-source"], loss.ports), loss.ref);
  expect(loss.removed, loss.lastFetch).toBe(true);
  expect((await h.a.exec("git", ["rev-parse", move])).stdout.trim()).toBe(before);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(sourceRefs);
  expect(await loss.repair()).toBe(loss.tip);
  expect((await invokeStoreMigrate(["--leave-source"], loss.ports)).status).toBe("ok");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
}, 60_000);

it("retains a pending historical copy attempt when its destination fetch loses a local tip", async () => {
  const h = await switchFixture(), original = h.ports, root = h.a.root, personal = "refs/arc/user/andrew/personal";
  await original.exec("git", ["fetch", "--no-tags", h.origin, personal], { cwd: root });
  const before = (await original.exec("git", ["rev-parse", "FETCH_HEAD"], { cwd: root })).stdout.trim();
  const entries = await capturedEntries({ root, ports: original }, before);
  const diverged = await plantRef(root, "refs/testing/diverged", [...entries,
    { path: "andrew/destination-late.md", content: "Destination data.\n" }], { parents: [before] });
  await original.exec("git", ["push", h.destinationDirectory, `${diverged.tip}:${personal}`], { cwd: root });
  let armed = false, published = false;
  const interrupted: RefStorePorts = { ...original,
    migrateStep: async step => {
      if (armed || step !== "remote.switched") return;
      armed = true;
      const source = await plantRef(root, "refs/testing/late", [...entries,
        { path: "andrew/source-late.md", content: "Late source data.\n" }], { parents: [before] });
      await original.exec("git", ["push", h.origin, `${source.tip}:${personal}`], { cwd: root });
    },
    execInput: async (args, input, options) => {
      if (armed && published && args.includes("update-ref")) throw new Error("Interrupted late copy");
      return original.execInput(args, input, options);
    },
    exec: async (command, args, options) => {
      const result = await original.exec(command, args, options);
      if (armed && args.includes("push") && args.includes(h.destinationDirectory)) published = true;
      return result;
    },
  };
  await expect(invokeStoreMigrate(["--to", h.to], interrupted)).rejects.toThrow("Interrupted late copy");
  const pending = "refs/arc/tmp/migrate/pending-copy/", move = "refs/arc/tmp/migrate/move";
  const held = async () => (await h.a.exec("git", ["for-each-ref", "--format=%(refname) %(objectname)", pending, move,
    "refs/arc/tmp/migrate/accounted-copy/"])).stdout;
  const retained = await held();
  expect(JSON.parse((await h.a.exec("git", ["show", `${pending}record`])).stdout).attempt).toEqual({
    changes: expect.arrayContaining([expect.objectContaining({ ref: personal, next: expect.any(String) })]),
    report: expect.objectContaining({ refs: expect.any(Array), notices: expect.any(Array) }),
  });
  const loss = await localFetchLoss(original, (args, input) => args.includes(h.destinationDirectory) && input.includes(":refs/arc/tmp/migrate/remote/"));
  expectLocalLoss(await invokeStoreMigrate(["--leave-source"], loss.ports), loss.ref);
  expect(loss.removed, loss.lastFetch).toBe(true);
  expect(await held()).toBe(retained);
  expect(await loss.repair()).toBe(loss.tip);
  const ended = await invokeStoreMigrate(["--leave-source"], loss.ports);
  expect(ended.status).toBe("ok");
  if (ended.status !== "ok") throw new Error("The repaired copy did not finish accounting");
  expect(ended.result.notices.some(notice => notice.condition.includes("could not be established"))).toBe(false);
  expect(await held()).toBe("");
  for (const content of ["Late source data.", "Destination data."]) {
    expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "grep", "-F", content, personal])).stdout).toContain(content);
  }
}, 60_000);
