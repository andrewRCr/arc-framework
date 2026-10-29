import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, type RefStorePorts } from "../../src/lib/store/index.js";
import { switchFixture, oppositeMoveFixture, createRemoteMover } from "../helpers/store/remote-move.js";
import { followFixture, lateFollowFixture } from "../helpers/store/follow.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const key = "refs/arc/tmp/seen/backing";
const record = "refs/arc/tmp/migrate/move";
const provenance = { verb: "save", lifecycleAction: "save" };

function pausedTrackingPull(ports: RefStorePorts) {
  let enter!: () => void, resume!: () => void;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const paused = new Promise<void>((resolve) => { resume = resolve; });
  let armed = true, running: ReturnType<ReturnType<typeof createRefStore>["pull"]> | undefined;
  const store = createRefStore({ ...ports, exec: async (command, args, options) => {
    const result = await ports.exec(command, args, options);
    if (armed && args.includes("fetch") && (options?.input?.split(/\r?\n/u) ?? []).some((arg) => arg.includes(":refs/arc-remotes/backing/"))) {
      armed = false; enter(); await paused;
    }
    return result;
  } });
  return {
    start: async (): Promise<void> => {
      running = store.pull();
      await Promise.race([entered, running.then(() => { throw new Error("The sibling pull ended before its tracking fetch paused"); })]);
    },
    finish: async () => { resume(); return running; },
  };
}

async function roots(side: { git: (args: string[]) => Promise<{ stdout: string }> }): Promise<string> {
  return (await side.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc-remotes/backing/", "refs/arc/tmp/seen/backing/"])).stdout;
}

it("keeps a remote switch out of a sibling pull's fetched comparison heads until its lease ends", async () => {
  const h = await switchFixture("backing", "backing"), sibling = pausedTrackingPull(h.ports);
  let before = "", recorded = "", reached = false;
  const ports = { ...h.ports,
    lock: (name: string, wait?: number) => h.ports.lock(name, name === key ? 1 : wait),
    migrateStep: async (step: string) => {
      if (step !== "remote.pointer") return;
      reached = true; await sibling.start(); before = await roots(h.a);
      recorded = (await h.a.exec("git", ["rev-parse", record])).stdout;
    },
  };
  try {
    const refused = await invokeStoreMigrate(["--to", h.to], ports);
    expect(reached).toBe(true);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect(await roots(h.a)).toBe(before);
    expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
    expect((await h.a.exec("git", ["rev-parse", record])).stdout).toBe(recorded);
  } finally { await sibling.finish(); }
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe("");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
});

it("keeps a backing repoint out of a sibling pull's fetched comparison heads until its lease ends", async () => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "kept.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Kept across repoint.\n", provenance }));
  success(await h.a.store.push());
  const sibling = pausedTrackingPull(h.a.ports);
  let before = "", reached = false;
  const ports = { ...h.a.ports, backingRepository: async () => destination.origin,
    lock: async (name: string, wait?: number) => {
      const release = await h.a.ports.lock(name, name === key ? 1 : wait);
      if (name === "layout" && !reached) { reached = true; await sibling.start(); before = await roots(h.a); }
      return release;
    },
  };
  try {
    const refused = (await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root, ports })).result;
    expect(reached).toBe(true);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect(await roots(h.a)).toBe(before);
    expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(h.origin);
    expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("push");
  } finally { await sibling.finish(); }
  const repaired = (await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root,
    ports: { ...h.a.ports, backingRepository: async () => destination.origin } })).result;
  expect(repaired).toMatchObject({ status: "ok" });
  expect((await h.a.git(["remote", "get-url", "backing"])).stdout).toBe(destination.origin);
  expect(await roots(h.a)).toBe("");
  expect(success(await h.a.store.read({ reference })).content).toBe("Kept across repoint.\n");
});

it("holds a backing read follow before replacing its source comparison roots", async () => {
  const h = await followFixture(undefined, "backing"), follower = h.follower;
  const before = await roots(follower), release = await follower.ports.lock(key);
  try {
    const refused = (await invokeStoreRemote(["backing", "read", "--json"], { cwd: follower.root,
      ports: { ...follower.ports, lock: (name, wait) => follower.ports.lock(name, name === key ? 1 : wait) } })).result;
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect(await roots(follower)).toBe(before);
    expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe(record);
  } finally { await release(); }
  expect((await invokeStoreMigrate([], follower.ports)).status).toBe("ok");
  expect((await follower.git(["remote", "get-url", "backing"])).stdout).toBe(h.destinationDirectory);
  expect((await follower.git(["config", "remote.backing.arc-state"])).stdout).toBe("read");
  expect(await roots(follower)).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
});

it("holds a switch undo before dropping comparison heads another fetch owns", async () => {
  const h = await oppositeMoveFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "layout.designation") throw new Error("Paused inside designation");
  } })).rejects.toThrow("Paused inside designation");
  expect((await invokeStoreMigrate(["--to", h.origin], h.peerPorts)).status).toBe("ok");
  const before = await roots(h.a), recorded = (await h.a.exec("git", ["rev-parse", record])).stdout;
  const release = await h.ports.lock(key);
  try {
    const refused = await invokeStoreMigrate([], { ...h.ports, lock: (name, wait) => h.ports.lock(name, name === key ? 1 : wait) });
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect(await roots(h.a)).toBe(before);
    expect((await h.a.exec("git", ["rev-parse", record])).stdout).toBe(recorded);
  } finally { await release(); }
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect(await h.ports.backingRepository()).toBeNull();
  expect(await roots(h.a)).toBe("");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
});

it("holds a later follow's tracking write until the destination keeper lease ends", async () => {
  const h = await lateFollowFixture(true), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Paused before cleanup"); },
  } })).rejects.toThrow("Paused before cleanup");
  const mover = await createRemoteMover(h, h.destinationDirectory, "onward-mover"), onward = join(mover.root, "onward.git");
  await mover.exec("git", ["init", "--bare", onward]);
  expect((await invokeStoreMigrate(["--to", onward], mover.ports)).status).toBe("ok");
  const moved = "refs/arc-remotes/backing/project/moved";
  const forwarding = (await mover.exec("git", [`--git-dir=${h.destinationDirectory}`, "rev-parse", "refs/arc/project/moved"])).stdout;
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  const before = await roots(follower), recorded = (await follower.exec("git", ["rev-parse", record])).stdout;
  let reached = false;
  const release = await follower.ports.lock(key);
  try {
    const refused = await invokeStoreMigrate([], { ...follower.ports,
      lock: (name, wait) => follower.ports.lock(name, name === key ? 1 : wait),
      migrateStep: async step => { if (step === "follow.read-destination") reached = true; },
    });
    expect(reached).toBe(true);
    expect(refused).toMatchObject({ status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable" } } });
    expect(await roots(follower)).toBe(before);
    expect((await follower.exec("git", ["rev-parse", record])).stdout).toBe(recorded);
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  } finally { await release(); }
  const repaired = await invokeStoreMigrate([], follower.ports);
  expect(repaired.status).toBe("ok");
  if (repaired.status === "ok") expect(repaired.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("later move") }));
  expect((await follower.git(["rev-parse", moved])).stdout).toBe(forwarding);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);

it("returns a recoverable recorded move when native Git loses a comparison-head transaction", async () => {
  const h = await switchFixture("backing", "backing");
  const ref = "refs/arc-remotes/backing/user/andrew/personal", race = (await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout;
  let armed = false, raced = false;
  const refused = await invokeStoreMigrate(["--to", h.to], { ...h.ports,
    migrateStep: async step => { if (step === "remote.switch") armed = true; },
    execInput: async (args, input, options) => {
      if (armed && !raced && args.includes("update-ref") && input.includes(ref)) {
        raced = true; await h.a.git(["update-ref", ref, race]);
      }
      return h.ports.execInput(args, input, options);
    },
  });
  expect(raced).toBe(true);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringMatching(/changed|race/iu), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await h.a.git(["rev-parse", ref])).stdout).toBe(race);
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", record])).stdout).toBe(record);
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect(success(await h.store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
});

it("returns a recoverable stop when a backing setting loses a native comparison-head transaction", async () => {
  const h = await refSyncFixture("separate"), destination = await refSyncFixture();
  const reference = RecordReferenceSchema.parse({ owner: { type: "person", name: "andrew" }, kind: "personal/document", key: "setting-race.md" });
  success(await h.a.store.write({ action: "put", reference, expected: null, content: "Published basis.\n", provenance }));
  success(await h.a.store.push());
  const current = success(await h.a.store.read({ reference }));
  success(await h.a.store.write({ action: "put", reference, expected: current.version, content: "Kept newer local content.\n", provenance }));
  const ref = "refs/arc-remotes/backing/user/andrew/personal", race = (await h.a.git(["rev-parse", "refs/arc/user/andrew/personal"])).stdout;
  let raced = false;
  const refused = (await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root,
    ports: { ...h.a.ports, backingRepository: async () => destination.origin, execInput: async (args, input, options) => {
      if (!raced && args.includes("update-ref") && input.includes(ref)) {
        raced = true; await h.a.git(["update-ref", ref, race]);
      }
      return h.a.ports.execInput(args, input, options);
    } },
  })).result;
  expect(raced).toBe(true);
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable" } });
  expect((await h.a.git(["rev-parse", ref])).stdout).toBe(race);
  expect((await invokeStoreRemote(["backing", "read", "--json"], { cwd: h.a.root,
    ports: { ...h.a.ports, backingRepository: async () => destination.origin } })).result.status).toBe("ok");
  expect(success(await h.a.store.read({ reference })).content).toBe("Kept newer local content.\n");
});
