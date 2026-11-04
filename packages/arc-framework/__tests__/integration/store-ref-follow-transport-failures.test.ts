/** Native follows retain their recorded work when comparison evidence cannot resolve its configured source. */
import { join, resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";

const move = "refs/arc/tmp/migrate/move";
const cases = (["code", "backing"] as const).flatMap(source =>
  (["line-break", "missing-url", "malformed-config"] as const).map(fault => ({ source, fault })));

async function witnessUrlFault(ports: RefStorePorts, directory: string, remote: string, initiallyArmed = true,
  fault: "line-break" | "missing-url" | "malformed-config" = "line-break") {
  const key = `remote.${remote}.url`, gitDir = `--git-dir=${directory}`;
  const original = (await ports.exec("git", [gitDir, "config", "--get", key])).stdout.replace(/\r?\n$/u, "");
  const settings = (await ports.exec("git", [gitDir, "config", "--null", "--get-regexp", `^remote\\.${remote}\\.`])).stdout
    .split("\0").filter(Boolean).map(row => [row.slice(0, row.indexOf("\n")), row.slice(row.indexOf("\n") + 1)] as const);
  const flags = { injected: false, validated: false };
  let heldLayouts = 0, armed = initiallyArmed;
  const faulty: RefStorePorts = { ...ports, lock: async (...args) => {
    const release = await ports.lock(...args);
    if (args[0] !== "layout") return release;
    heldLayouts++;
    return async () => { try { await release(); } finally { heldLayouts--; } };
  }, rawExec: async (args, options) => {
    const owner = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length);
    if (fault === "malformed-config" && armed && heldLayouts > 0 && !flags.injected && owner && resolve(owner) === resolve(directory)
      && args.includes("config") && args.includes("--list") && args.includes("--includes")) {
      flags.injected = true;
      const path = join(directory, "config"), original = await readFile(path);
      await writeFile(path, Buffer.concat([original, Buffer.from("\n[unclosed\n")]));
      try { return await ports.rawExec(args, options); }
      catch (error) { flags.validated = isGitProcessError(error) && isCompletedGitFailure(error); throw error; }
      finally { await writeFile(path, original); }
    }
    const result = await ports.rawExec(args, options);
    if (fault === "line-break" && armed && heldLayouts > 0 && !flags.injected && owner && resolve(owner) === resolve(directory)
      && args.includes("config") && args.includes("--list") && args.includes("--includes")) {
      flags.injected = true;
      await ports.exec("git", [gitDir, "config", key, `${original}\nextra`]);
    }
    return result;
  }, exec: async (command, args, options) => {
    const owner = args.find(arg => arg.startsWith("--git-dir="))?.slice("--git-dir=".length) ?? join(ports.checkoutRoot, ".git");
    const targeted = args.includes("get-url") && args.at(-1) === remote && resolve(owner) === resolve(directory);
    if (fault === "missing-url" && armed && heldLayouts > 0 && !flags.injected && targeted) {
      flags.injected = true;
      await ports.exec("git", [gitDir, "config", "--remove-section", `remote.${remote}`]);
    }
    try {
      const result = await ports.exec(command, args, options);
      if (flags.injected && args.includes("config") && args.includes("--get-all") && args.at(-1) === key) flags.validated = true;
      return result;
    } catch (error) {
      if (fault === "missing-url" && flags.injected && targeted) flags.validated = isGitProcessError(error) && isCompletedGitFailure(error);
      throw error;
    }
  } };
  return { ports: faulty, flags, arm: () => { armed = true; },
    repair: async () => {
      if (fault === "line-break") await ports.exec("git", [gitDir, "config", key, original]);
      else if (fault === "missing-url") for (const [setting, value] of settings) await ports.exec("git", [gitDir, "config", "--add", setting, value]);
    } };
}

async function remoteRefs(h: Awaited<ReturnType<typeof followFixture>>) {
  const args = ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"];
  return { source: (await h.remote("git", args)).stdout,
    destination: (await h.follower.exec("git", [`--git-dir=${h.destinationDirectory}`, ...args])).stdout };
}

it.each(cases)("retains a recorded follow resume after $fault from $source", async ({ source, fault }) => {
  const h = await followFixture(undefined, source), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.recorded") throw new Error("Pause recorded follow"); },
  } })).rejects.toThrow("Pause recorded follow");
  const tip = (await follower.exec("git", ["rev-parse", move])).stdout.trim(), before = await remoteRefs(h);
  const directory = source === "code" ? join(follower.root, ".git") : join(follower.root, ".git", "arc", "store");
  const broken = await witnessUrlFault(follower.ports, directory, h.sourceName, true, fault);
  const refused = await invokeStoreMigrate([], broken.ports);
  expect(broken.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining(fault === "line-break" ? "line break" : h.sourceName), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["rev-parse", move])).stdout.trim()).toBe(tip);
  expect(await remoteRefs(h)).toEqual(before);
  await broken.repair();
  expect(await invokeStoreMigrate([], broken.ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(cases)("refuses follow judgment after $fault from $source", async ({ source, fault }) => {
  const h = await followFixture(undefined, source), follower = h.follower, before = await remoteRefs(h);
  const directory = source === "code" ? join(follower.root, ".git") : join(follower.root, ".git", "arc", "store");
  const broken = await witnessUrlFault(follower.ports, directory, h.sourceName, true, fault);
  const refused = await invokeStoreMigrate([], broken.ports);
  expect(broken.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining(fault === "line-break" ? "line break" : h.sourceName), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(await remoteRefs(h)).toEqual(before);
  await broken.repair();
  expect(await invokeStoreMigrate([], broken.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: broken.ports })).result)
    .toMatchObject({ status: "ok" });
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);

it.each(cases)("retains switched follow cleanup after $fault from $source", async ({ source, fault }) => {
  const h = await followFixture(undefined, source), follower = h.follower;
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause switched follow"); },
  } })).rejects.toThrow("Pause switched follow");
  const tip = (await follower.exec("git", ["rev-parse", move])).stdout.trim(), before = await remoteRefs(h);
  const broken = await witnessUrlFault(follower.ports, join(follower.root, ".git", "arc", "store"), "backing", false, fault);
  const ports: RefStorePorts = { ...broken.ports, migrateStep: async step => { if (step === "follow.read-destination") broken.arm(); } };
  const refused = await invokeStoreMigrate([], ports);
  expect(broken.flags).toEqual({ injected: true, validated: true });
  expect(refused).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: expect.stringContaining(fault === "line-break" ? "line break" : "backing"), remedy: { argv: ["arc", "store", "migrate"] } } });
  expect((await follower.exec("git", ["rev-parse", move])).stdout.trim()).toBe(tip);
  expect(await remoteRefs(h)).toEqual(before);
  await broken.repair();
  expect(await invokeStoreMigrate([], ports)).toMatchObject({ status: "ok" });
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);
