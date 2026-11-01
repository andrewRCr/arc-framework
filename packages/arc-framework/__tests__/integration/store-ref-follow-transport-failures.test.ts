/** Native follows retain their recorded work when comparison evidence cannot resolve its configured source. */
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";

const move = "refs/arc/tmp/migrate/move";

async function witnessUrlFault(ports: RefStorePorts, directory: string, remote: string, initiallyArmed = true) {
  const key = `remote.${remote}.url`, gitDir = `--git-dir=${directory}`;
  const original = (await ports.exec("git", [gitDir, "config", "--get", key])).stdout.replace(/\r?\n$/u, "");
  const flags = { injected: false, validated: false };
  let heldLayouts = 0, armed = initiallyArmed;
  const faulty: RefStorePorts = { ...ports, lock: async (...args) => {
    const release = await ports.lock(...args);
    if (args[0] !== "layout") return release;
    heldLayouts++;
    return async () => { try { await release(); } finally { heldLayouts--; } };
  }, rawExec: async (args, options) => {
    const result = await ports.rawExec(args, options);
    const owner = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length);
    if (armed && heldLayouts > 0 && !flags.injected && owner && resolve(owner) === resolve(directory)
      && args.includes("config") && args.includes("--list") && args.includes("--includes")) {
      flags.injected = true;
      await ports.exec("git", [gitDir, "config", key, `${original}\nextra`]);
    }
    return result;
  }, exec: async (command, args, options) => {
    const result = await ports.exec(command, args, options);
    if (flags.injected && args.includes("config") && args.includes("--get-all") && args.at(-1) === key) flags.validated = true;
    return result;
  } };
  return { ports: faulty, flags, arm: () => { armed = true; },
    repair: async () => { await ports.exec("git", [gitDir, "config", key, original]); } };
}

async function remoteRefs(h: Awaited<ReturnType<typeof followFixture>>) {
  const args = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"];
  return { source: (await h.remote("git", args)).stdout,
    destination: (await h.follower.exec("git", [`--git-dir=${h.destinationDirectory}`, ...args])).stdout };
}

it.each(["code", "backing"] as const)("retains a recorded follow resume when its source witness URL fails from %s", async source => {
  const h = await followFixture(undefined, source), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Pause recorded follow"); },
  } })).rejects.toThrow("Pause recorded follow");
  const tip = (await follower.exec("git", ["rev-parse", move])).stdout.trim(), before = await remoteRefs(h);
  const directory = source === "code" ? join(follower.root, ".git") : join(follower.root, ".git", "arc", "store");
  const fault = await witnessUrlFault(follower.ports, directory, h.sourceName);
  const refused = await invokeStoreMigrate([], fault.ports);
  expect(fault.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining("line break"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["rev-parse", move])).stdout.trim()).toBe(tip);
  expect(await remoteRefs(h)).toEqual(before);
  await fault.repair();
  expect(await invokeStoreMigrate([], fault.ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(["code", "backing"] as const)("refuses follow judgment when its source witness URL fails from %s", async source => {
  const h = await followFixture(undefined, source), follower = h.follower, before = await remoteRefs(h);
  const directory = source === "code" ? join(follower.root, ".git") : join(follower.root, ".git", "arc", "store");
  const fault = await witnessUrlFault(follower.ports, directory, h.sourceName);
  const refused = await invokeStoreMigrate([], fault.ports);
  expect(fault.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining("line break"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(await remoteRefs(h)).toEqual(before);
  await fault.repair();
  expect(await invokeStoreMigrate([], fault.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: fault.ports })).result)
    .toMatchObject({ status: "ok" });
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(["code", "backing"] as const)("retains switched follow cleanup when its destination witness URL fails from %s", async source => {
  const h = await followFixture(undefined, source), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause switched follow"); },
  } })).rejects.toThrow("Pause switched follow");
  const tip = (await follower.exec("git", ["rev-parse", move])).stdout.trim(), before = await remoteRefs(h);
  const fault = await witnessUrlFault(follower.ports, join(follower.root, ".git", "arc", "store"), "backing", false);
  const ports: RefStorePorts = { ...fault.ports, migrateStep: async step => { if (step === "follow.read-destination") fault.arm(); } };
  const refused = await invokeStoreMigrate([], ports);
  expect(fault.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining("line break"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["rev-parse", move])).stdout.trim()).toBe(tip);
  expect(await remoteRefs(h)).toEqual(before);
  await fault.repair();
  expect(await invokeStoreMigrate([], ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);
