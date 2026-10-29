/** Native competing migrations settle through receiver leases without stranding their copies. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStoreCommandPorts } from "../../src/commands/store-ports.js";
import { createRefStore } from "../../src/lib/store/index.js";
import { createRemoteMover, switchFixture, oppositeMoveFixture, personal, provenance } from "../helpers/store/remote-move.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { convergeFollowers } from "../helpers/store/follow.js";

it("accounts an unconfirmed accepted re-copy when the destination moves onward before the original switch", async () => {
  const h = await oppositeMoveFixture();
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused before original switch");
  } })).rejects.toThrow("Paused before original switch");
  let published = false;
  await expect(invokeStoreMigrate([], { ...h.ports,
    exec: async (command, args, options) => {
      const result = await h.ports.exec(command, args, options);
      if (args.includes("push") && args.includes(h.destinationDirectory)) published = true;
      return result;
    },
    execInput: (args, input, options) => {
      if (published && args.includes("update-ref")) throw new Error("Accepted re-copy before acknowledgment");
      return h.ports.execInput(args, input, options);
    },
  })).rejects.toThrow("Accepted re-copy before acknowledgment");
  const pending = "refs/arc/tmp/migrate/pending-copy/record";
  const account = JSON.parse((await h.a.exec("git", ["show", pending])).stdout) as {
    attempt: { changes: { ref: string; expected: string | null; next: string | null }[] };
  };
  expect(account.attempt.changes.some(row => row.expected !== null && row.next !== row.expected)).toBe(true);
  const mover = await createRemoteMover(h, h.destinationDirectory, "onward-before-switch");
  const onward = join(h.b.root, "onward-before-switch.git");
  await h.b.exec("git", ["init", "--bare", onward]);
  expect(await invokeStoreMigrate(["--to", onward], mover.ports)).toMatchObject({ status: "ok" });
  const ended = await invokeStoreMigrate([], h.ports);
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  if (ended.status !== "ok") throw new Error("The overtaken pre-switch move did not end");
  expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("before its switch") }));
  expect(ended.result.notices).toContainEqual(expect.objectContaining({ condition: expect.stringContaining("could not be established") }));
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", pending, "refs/arc/tmp/migrate/move"])).stdout).toBe("");
  const kept = (await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/accounted-copy/"])).stdout;
  expect(kept).toContain("/record"); expect(kept).toContain("/tips/");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout)
    .toBe("refs/arc/project/moved");
  expect((await h.remote("git", ["grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.b.exec("git", [`--git-dir=${onward}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
}, 60_000);

async function competingFixture() {
  const h = await switchFixture();
  success(await h.b.store.pull());
  await mkdir(join(h.b.root, ".arc", "system"), { recursive: true });
  const config = join(h.b.root, ".arc", "system", "arc-config.yml");
  await writeFile(config, "# The losing clone's pointer stays untouched.\n");
  const production = createStoreCommandPorts(h.b.root);
  const ports = { ...production, ...h.b.ports, backingRepository: production.backingRepository };
  const loserDestination = join(h.b.root, "loser.git");
  await h.b.exec("git", ["init", "--bare", loserDestination]);
  return { ...h, peerPorts: ports, peerConfig: config, loserDestination };
}

it("ends the second move before switching and forwards the copy it leaves to the winner", async () => {
  const h = await competingFixture();
  const { peerPorts: ports, peerConfig: config, loserDestination } = h;
  let winner: Awaited<ReturnType<typeof invokeStoreMigrate>> | undefined;
  const loser = await invokeStoreMigrate(["--to", loserDestination], { ...ports, migrateStep: async step => {
    if (step === "remote.forward") winner = await invokeStoreMigrate(["--to", h.to], h.ports);
  } });
  expect(winner?.status, JSON.stringify(winner)).toBe("ok");
  expect(loser.status, JSON.stringify(loser)).toBe("ok");
  const sourceRecord = (await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout;
  expect((await h.b.exec("git", [`--git-dir=${loserDestination}`, "show", "refs/arc/project/moved:moved.json"])).stdout).toBe(sourceRecord);
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect(await readFile(config, "utf8")).toBe("# The losing clone's pointer stays untouched.\n");
  expect(success(await createRefStore(ports).read({ reference: personal })).content).toBe("Shared state.\n");
  expect((await h.b.exec("git", [`--git-dir=${loserDestination}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  if (loser.status === "ok") expect(loser.result.notices).toEqual(expect.arrayContaining([
    expect.objectContaining({ condition: expect.stringContaining("refs/arc/user/andrew/personal") }),
    expect.objectContaining({ condition: expect.stringContaining(loserDestination) }),
  ]));
  const stores = await convergeFollowers(h.destinationDirectory, [{ root: h.a.root, ports: h.ports }, { root: h.b.root, ports }]);
  for (const store of stores) expect(success(await store.read({ reference: h.pending })).content).toBe("Pending local state.\n");
}, 60_000);

it("continues crossing copies that carry each other's move versions until one forward wins", async () => {
  const h = await oppositeMoveFixture();
  const pause = (boundary: string) => async (step: string) => { if (step === boundary) throw new Error(`Paused ${boundary}`); };
  const recorded = async (side: typeof h.a) => JSON.parse((await side.exec("git", ["show", "refs/arc/tmp/migrate/move:move.json"])).stdout) as { registryCommit: string };
  await expect(invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: pause("remote.copied") })).rejects.toThrow("Paused remote.copied");
  const first = await recorded(h.a);
  await expect(invokeStoreMigrate(["--to", h.origin], { ...h.peerPorts, migrateStep: pause("remote.copied") })).rejects.toThrow("Paused remote.copied");
  const second = await recorded(h.b);
  await h.remote("git", ["merge-base", "--is-ancestor", first.registryCommit, "refs/arc/project/registry"]);
  await invokeStoreMigrate([], { ...h.ports, migrateStep: pause("remote.forward") }).catch(error => {
    if (!(error instanceof Error) || error.message !== "Paused remote.forward") throw error;
  });
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "log", "--format=%H", "refs/arc/project/registry"])).stdout.trim().split("\n")).toContain(second.registryCommit);
  // Both copies carried the other move's version, while neither receiver had a forwarding record.
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await invokeStoreMigrate([], h.peerPorts)).status).toBe("ok");
  expect((await invokeStoreMigrate([], h.ports)).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  for (const side of [h.a, h.b]) expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect((await h.b.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
}, 60_000);

it("restarts a lost copy lease and preserves the destination's later forwarding record on its source", async () => {
  const h = await oppositeMoveFixture();
  const onward = join(h.b.root, "onward.git");
  await h.b.exec("git", ["init", "--bare", onward]);
  let winner: Awaited<ReturnType<typeof invokeStoreMigrate>> | undefined;
  const ended = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.copy" && !winner) winner = await invokeStoreMigrate(["--to", onward], h.peerPorts);
  } });
  expect(winner?.status, JSON.stringify(winner)).toBe("ok");
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  const forward = (await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "show", "refs/arc/project/moved:moved.json"])).stdout;
  expect((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout).toBe(forward);
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.remote("git", ["grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  expect((await h.b.exec("git", [`--git-dir=${onward}`, "grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
  for (const side of [h.a, h.b]) expect((await side.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect(await readFile(h.config, "utf8")).not.toContain("storage.backing_repository");
}, 60_000);

it("ends an opposite-direction move whose forwarding push loses to the other copy", async () => {
  const h = await oppositeMoveFixture();
  let winner: Awaited<ReturnType<typeof invokeStoreMigrate>> | undefined;
  const loser = await invokeStoreMigrate(["--to", h.to], { ...h.ports, migrateStep: async step => {
    if (step === "remote.forward" && !winner) winner = await invokeStoreMigrate(["--to", h.origin], h.peerPorts);
  } });
  expect(winner?.status, JSON.stringify(winner)).toBe("ok");
  expect(loser.status, JSON.stringify(loser)).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout).toBe("");
  expect((await h.a.exec("git", [`--git-dir=${h.destinationDirectory}`, "for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.a.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe("push");
  expect(await readFile(h.config, "utf8")).not.toContain("storage.backing_repository");
  expect((await h.a.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.b.git(["remote", "get-url", "backing"])).stdout.trim()).toBe(h.origin);
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
  expect((await h.remote("git", ["grep", "-F", "Shared state.", "refs/arc/user/andrew/personal"])).stdout).toContain("Shared state.");
}, 60_000);

it("keeps the last landed copy lease when a later copy loses a ref lease and another move wins", async () => {
  const h = await competingFixture();
  await expect(invokeStoreMigrate(["--to", h.loserDestination], { ...h.peerPorts, migrateStep: async step => {
    if (step === "remote.copied") throw new Error("Paused landed copy");
  } })).rejects.toThrow("Paused landed copy");
  let winner: Awaited<ReturnType<typeof invokeStoreMigrate>> | undefined;
  const ended = await invokeStoreMigrate([], { ...h.peerPorts, migrateStep: async step => {
    if (step !== "remote.copy" || winner) return;
    const ref = "refs/arc/user/andrew/personal";
    const before = (await h.b.exec("git", [`--git-dir=${h.loserDestination}`, "rev-parse", ref])).stdout.trim();
    success(await h.b.store.write({ action: "put", reference: personal, expected: success(await h.b.store.read({ reference: personal })).version,
      content: "A destination writer changed this copy.\n", provenance }));
    await h.b.exec("git", ["push", `--force-with-lease=${ref}:${before}`, h.loserDestination, `${ref}:${ref}`]);
    winner = await invokeStoreMigrate(["--to", h.to], h.ports);
  } });
  expect(winner?.status, JSON.stringify(winner)).toBe("ok");
  expect(ended.status, JSON.stringify(ended)).toBe("ok");
  expect((await h.b.exec("git", [`--git-dir=${h.loserDestination}`, "for-each-ref", "--format=%(refname)", "refs/arc/project/moved"])).stdout.trim()).toBe("refs/arc/project/moved");
  expect((await h.b.exec("git", [`--git-dir=${h.loserDestination}`, "show", "refs/arc/project/moved:moved.json"])).stdout)
    .toBe((await h.remote("git", ["show", "refs/arc/project/moved:moved.json"])).stdout);
  expect((await h.b.exec("git", [`--git-dir=${h.loserDestination}`, "grep", "-F", "A destination writer changed this copy.", "refs/arc/user/andrew/personal"])).stdout).toContain("A destination writer changed this copy.");
  expect((await h.b.exec("git", ["for-each-ref", "--format=%(refname)", "refs/arc/tmp/migrate/"])).stdout).toBe("");
}, 60_000);
