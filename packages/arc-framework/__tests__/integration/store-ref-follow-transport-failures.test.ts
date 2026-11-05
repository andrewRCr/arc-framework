/** Native follows retain their recorded work when comparison evidence cannot resolve its configured source. */
import { join, resolve } from "node:path";
import { readFile, rename, writeFile } from "node:fs/promises";
import { expect, it } from "vitest";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";
import { isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";

const move = "refs/arc/tmp/migrate/move";
const cases = (["code", "backing"] as const).flatMap(source =>
  (["line-break", "missing-url", "malformed-config"] as const).map(fault => ({ source, fault })));

async function witnessUrlFault(ports: RefStorePorts, directory: string, remote: string, initiallyArmed = true,
  fault: "line-break" | "missing-url" | "malformed-config" = "line-break", persistent = false,
  lookupFailure?: "canceled" | "signaled" | "untyped") {
  const key = `remote.${remote}.url`, gitDir = `--git-dir=${directory}`;
  const original = (await ports.exec("git", [gitDir, "config", "--get", key])).stdout.replace(/\r?\n$/u, "");
  const settings = (await ports.exec("git", [gitDir, "config", "--null", "--get-regexp", `^remote\\.${remote}\\.`])).stdout
    .split("\0").filter(Boolean).map(row => [row.slice(0, row.indexOf("\n")), row.slice(row.indexOf("\n") + 1)] as const);
  const flags = { injected: false, validated: false };
  let heldLayouts = 0, armed = initiallyArmed;
  let failure: unknown;
  let damagedConfig: { path: string; original: Buffer } | undefined;
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
      if (lookupFailure) {
        failure = lookupFailure === "untyped" ? new Error("Unrelated lookup failure") : makeGitProcessError({ command: "git", args,
          ...lookupFailure === "canceled" ? { isCanceled: true } : { signal: "SIGTERM" }, stderr: "Interrupted comparison lookup" });
        throw failure;
      }
      const path = join(directory, "config"), original = await readFile(path);
      await writeFile(path, Buffer.concat([original, Buffer.from("\n[unclosed\n")]));
      try { return await ports.rawExec(args, options); }
      catch (error) { flags.validated = isGitProcessError(error) && isCompletedGitFailure(error); throw error; }
      finally {
        if (persistent) damagedConfig = { path, original };
        else await writeFile(path, original);
      }
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
  return { ports: faulty, flags, failure: () => failure, arm: () => { armed = true; },
    repair: async () => {
      if (damagedConfig) { await writeFile(damagedConfig.path, damagedConfig.original); damagedConfig = undefined; }
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

it.each((["pointer", "named"] as const).flatMap(candidate =>
  (["persistent", "canceled", "signaled", "untyped"] as const).map(fault => ({ candidate, fault }))))(
  "preserves departed-source fallback policy for $candidate $fault lookup", async ({ candidate, fault }) => {
  const h = await followFixture(), follower = h.follower, remote = candidate === "pointer" ? "backing" : "next";
  if (candidate === "named") {
    await writeFile(follower.config, "# The destination is a code remote.\n");
    await follower.exec("git", ["remote", "add", remote, h.destinationDirectory]);
  }
  const gathering = "refs/arc/tmp/follow/candidate/retained/project/moved";
  await follower.exec("git", ["fetch", "--no-tags", h.origin, `+refs/arc/project/moved:${gathering}`]);
  const held = (await follower.exec("git", ["rev-parse", gathering])).stdout.trim();
  const before = await remoteRefs(h), config = join(follower.root, ".git", "config"), original = await readFile(config);
  const roles = (await follower.exec("git", ["config", "--get-regexp", "arc-state$"])).stdout;
  let armed = false, injected = false, validated = false, failure: unknown;
  const ports: RefStorePorts = { ...follower.ports, exec: async (command, args, options) => {
    if (armed && !injected && (args.includes("get-url") || args.includes("--get-url"))
      && args.at(-1) === (candidate === "pointer" ? h.destinationDirectory : remote)) {
      injected = true;
      if (fault !== "persistent") {
        failure = fault === "untyped" ? new Error("Unrelated fallback lookup failure") : makeGitProcessError({ command: "git", args,
          ...fault === "canceled" ? { isCanceled: true } : { signal: "SIGTERM" }, stderr: "Interrupted fallback lookup" });
        throw failure;
      }
      await writeFile(config, Buffer.concat([original, Buffer.from("\n[unclosed\n")]));
      try { return await follower.ports.exec(command, args, options); }
      catch (error) { validated = isGitProcessError(error) && isCompletedGitFailure(error); throw error; }
    }
    try { return await follower.ports.exec(command, args, options); }
    finally { if (args.includes("fetch") && options?.input?.includes("refs/arc/tmp/follow/source/")) armed = true; }
  } };
  await rename(h.origin, h.origin + ".offline");
  try {
    const observed: unknown = await invokeStoreMigrate([], ports).catch(error => error);
    expect(injected).toBe(true);
    if (fault === "persistent") {
      expect(validated).toBe(true);
      expect(await readFile(config, "utf8")).toContain("[unclosed");
      expect(observed).toMatchObject({ status: "refused", refusal: { code: "store", refusal: {
        code: "unreachable", class: "recoverable", remedy: { text: expect.stringContaining("Repair the old remote") },
      } } });
    } else expect(observed).toBe(failure);
  } finally {
    await writeFile(config, original);
    await rename(h.origin + ".offline", h.origin);
  }
  expect((await follower.exec("git", ["for-each-ref", "--format=%(objectname)", gathering])).stdout.trim())
    .toBe(fault === "persistent" ? held : "");
  expect((await follower.exec("git", ["config", "--get-regexp", "arc-state$"])).stdout).toBe(roles);
  expect(await remoteRefs(h)).toEqual(before);
  expect(await invokeStoreMigrate([], ports)).toMatchObject({ status: "designation-needed", remote });
  expect((await invokeStoreRemote([remote, "push", "--json"], { cwd: follower.root, ports })).result).toMatchObject({ status: "ok" });
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


it.each(["code", "backing"] as const)("retains a %s follow judgment refusal until code configuration is repaired", async source => {
  const h = await followFixture(undefined, source), follower = h.follower, before = await remoteRefs(h);
  const gathering = "refs/arc/tmp/follow/source/project/moved";
  await follower.exec("git", ["fetch", "--no-tags", h.origin, `+refs/arc/project/moved:${gathering}`]);
  const held = (await follower.exec("git", ["rev-parse", gathering])).stdout.trim();
  const directory = join(follower.root, ".git");
  const broken = await witnessUrlFault(follower.ports, directory, "origin", true, "malformed-config", true);
  try {
    const observed: unknown = await invokeStoreMigrate([], broken.ports).catch(error => error);
    expect(broken.flags).toEqual({ injected: true, validated: true });
    expect(await readFile(join(directory, "config"), "utf8")).toContain("[unclosed");
    expect(observed).toMatchObject({ status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
      remedy: { argv: ["arc", "store", "migrate"] } } });
  } finally { await broken.repair(); }
  expect((await follower.exec("git", ["rev-parse", gathering])).stdout.trim()).toBe(held);
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", move])).stdout).toBe("");
  expect(await remoteRefs(h)).toEqual(before);
  expect(await invokeStoreMigrate([], broken.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
  expect((await invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: broken.ports })).result)
    .toMatchObject({ status: "ok" });
  expect(success(await follower.store.read({ reference: follower.unpublished })).content).toBe("Unpublished follower data.\n");
}, 60_000);


it.each((["code", "backing"] as const).flatMap(source => (["canceled", "signaled", "untyped"] as const)
  .map(kind => ({ source, kind }))))("cleans follow judgment gathering after $source $kind lookup failure", async ({ source, kind }) => {
  const h = await followFixture(undefined, source), follower = h.follower, gathering = "refs/arc/tmp/follow/source/project/moved";
  await follower.exec("git", ["fetch", "--no-tags", h.origin, `+refs/arc/project/moved:${gathering}`]);
  const before = await remoteRefs(h);
  const broken = await witnessUrlFault(follower.ports, join(follower.root, ".git"), "origin", true, "malformed-config", false, kind);
  const observed: unknown = await invokeStoreMigrate([], broken.ports).catch(error => error);
  expect(broken.flags.injected).toBe(true);
  expect(observed).toBe(broken.failure());
  expect((await follower.exec("git", ["for-each-ref", "--format=%(refname)", gathering])).stdout).toBe("");
  expect(await remoteRefs(h)).toEqual(before);
  expect(await invokeStoreMigrate([], broken.ports)).toMatchObject({ status: "designation-needed", remote: "backing" });
}, 60_000);
