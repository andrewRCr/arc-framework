import { createRefClock } from "../helpers/store/ref-clock.js";
import { unconfirmedCancellation } from "../helpers/store/unconfirmed-cancellation.js";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { refCarryFixture, carriedBranch, carriedDocument, carryProvenance } from "../helpers/store/ref-carry.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { success } from "../helpers/store/suite-tools.js";
import { createRefStore, PushInputSchema, PushResultSchema, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { GitProcessError, isCompletedGitFailure, isGitProcessError } from "../../src/lib/git/process-error.js";
import { makeGitProcessError } from "../helpers/git-exec-fake.js";

async function codeRaceFixture(mode: "leased" | "unleased", layout: "default" | "separate" = "default") {
  const h = await refCarryFixture(layout);
  success(await h.a.store.push());
  await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
  const code = await plantRef(h.a.root, carriedBranch, [{ path: "local.txt", content: "Our code.\n" }],
    { parents: mode === "leased" ? [] : [h.code.tip] });
  const other = await plantRef(h.b.root, carriedBranch, [{ path: "remote.txt", content: "Other code.\n" }]);
  await h.b.exec("git", ["push", "origin", `${carriedBranch}:refs/test/code-race`]);
  const before = success(await h.a.store.read({ reference: carriedDocument }));
  success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version,
    content: "State after code race.\n", provenance: carryProvenance }));
  const marker = join(h.origin, "code-moved"), hook = join(h.origin, "hooks", "update");
  await writeFile(hook, `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${other.tip}' "$2" || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
  return { h, code, other };
}

describe("carried branch receiver races", () => {
  it.each([
    { layout: "default", fault: "invalid-config", receiver: "native receiver" },
    { layout: "separate", fault: "removed-remote", receiver: "legacy receiver contract" },
  ] as const)(
    "retains a typed $layout carried result with $receiver after $fault observation and retries configuration repair", async ({ layout, fault }) => {
    const race = await carriedObservationFixture(layout), { h, ports, receiverTip } = race;
    const configPath = join(h.a.root, ".git", "config"), config = await readFile(configPath);
    let changed = false, nativeFailure: unknown;
    const store = createRefStore({ ...ports, exec: async (command, args, options) => {
      if (!changed && carriedTransportLookup(args, layout, h.origin)
        && existsSync(join(h.origin, "code-moved"))) {
        changed = true;
        if (fault === "invalid-config") await writeFile(configPath, Buffer.concat([config, Buffer.from("\n[unclosed\n")]));
        else await h.a.exec("git", ["config", "--remove-section", "remote.origin"]);
        try { return await ports.exec(command, args, options); }
        catch (error) { nativeFailure = error; throw error; }
        finally { await writeFile(configPath, config); }
      }
      return ports.exec(command, args, options);
    } });
    const observed: unknown = await store.push({ carry: { ref: carriedBranch } }).catch(error => error);
    expect(changed).toBe(true);
    expect(isCompletedGitFailure(nativeFailure)).toBe(true);
    expect(await readFile(configPath)).toEqual(config);
    expect(observed).toMatchObject({ status: "ok", result: { carry: { ref: carriedBranch,
      status: "unreachable", cause: "error", message: expect.stringContaining("Repair") } } });
    if (typeof observed !== "object" || observed === null || !("result" in observed)) throw new Error("Push returned no result");
    const result = PushResultSchema.parse(observed.result);
    expect(result.pulls).toContainEqual(expect.objectContaining({ remote: h.remoteName }));
    expect(success(await store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(receiverTip);
    await expectRepairedCarry(race, store);
  }, 60_000);

  it.each((["default", "separate"] as const).flatMap(layout =>
    (["canceled", "signaled", "untyped"] as const).map(kind => ({ layout, kind,
      receiver: layout === "default" ? "native receiver" : "legacy receiver contract" }))))(
    "propagates a $layout $kind observation failure with $receiver and retries", async ({ layout, kind }) => {
    const race = await carriedObservationFixture(layout), { h, ports } = race;
    let armed = true, failure: Error | undefined;
    const store = createRefStore({ ...ports, exec: async (command, args, options) => {
      if (armed && carriedTransportLookup(args, layout, h.origin)
        && existsSync(join(h.origin, "code-moved"))) {
        armed = false;
        failure = kind === "untyped" ? new TypeError("The carried transport observer failed")
          : makeGitProcessError({ command, args, ...kind === "canceled" ? { isCanceled: true as const }
            : { signal: "SIGTERM", exitCode: 128 } });
        throw failure;
      }
      return ports.exec(command, args, options);
    } });
    const observed: unknown = await store.push({ carry: { ref: carriedBranch } }).catch(error => error);
    expect(failure).toBeDefined();
    expect(observed).toBe(failure);
    expect(success(await store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
    await expectRepairedCarry(race, store);
  }, 60_000);

  it.each(([
    { point: "listing", kind: "unexpected" }, { point: "listing", kind: "spawn-failure" },
    { point: "config", kind: "unexpected" }, { point: "config", kind: "nonzero-exit" },
    { point: "ancestry", kind: "unexpected" }, { point: "ancestry", kind: "nonzero-exit" },
  ] as const))(
    "holds publication after a local $kind at post-rejection $point observation and retries", async ({ point, kind }) => {
    const { h, code, other } = await codeRaceFixture("unleased");
    if (point === "ancestry") await h.a.exec("git", ["fetch", "origin", "refs/test/code-race:refs/test/known-code-race"]);
    const cause = kind === "spawn-failure" ? Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" })
      : kind === "nonzero-exit" ? Object.assign(new Error("Local Git observation failed"), { exitCode: 128 })
      : new TypeError("The local receiver observer failed");
    let broken = true, failure: GitProcessError | undefined;
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      const selected = point === "listing" ? args.includes("ls-remote") && args.includes("--refs") && args.includes(carriedBranch)
        : point === "config" ? args.includes("config") && args.includes("--get-regexp") : args.includes("merge-base") && args.includes(other.tip);
      if (broken && selected && existsSync(join(h.origin, "code-moved"))) {
        failure = new GitProcessError({ kind, command, args, cause,
          ...kind === "nonzero-exit" ? { exitCode: 128, stderr: "fatal: local observer failure" } : {} });
        throw failure;
      }
      return h.a.ports.exec(command, args, options);
    } });
    const observed: unknown = await store.push({ carry: { ref: carriedBranch } }).then(result => result, error => error);
    expect(failure).toBeDefined();
    if (point === "config" && kind === "nonzero-exit") expect(observed).toMatchObject({ status: "ok", result: {
      publishes: expect.arrayContaining([expect.objectContaining({ status: "failed",
        failure: expect.objectContaining({ code: "refused", message: expect.stringContaining("local observer failure") }) })]),
    } });
    else {
      expect(observed).toBe(failure);
      expect(observed).toMatchObject({ kind, cause });
    }
    expect(success(await store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    broken = false;
    expect(success(await store.push({ carry: { ref: carriedBranch, expect: other.tip } })).carry)
      .toEqual({ ref: carriedBranch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  }, 60_000);
  it("preserves cancellation warnings from the receiver listing and retries after repair", async () => {
    const { h, code, other } = await codeRaceFixture("unleased"), clock = createRefClock(new Date(0), 0);
    let armed = true;
    const store = createRefStore({ ...h.a.ports, ...clock, exec: async (command, args, options) => {
      if (armed && args.includes("ls-remote") && args.includes(carriedBranch)) {
        armed = false; clock.advance(5_000); await Promise.resolve();
        throw unconfirmedCancellation(args, "Original receiver listing cancellation.");
      }
      return h.a.ports.exec(command, args, options);
    } });
    const result = PushResultSchema.parse(success(await store.push({ carry: { ref: carriedBranch } })));
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "unreachable", cause: "timeout",
      message: expect.stringContaining("descendant processes not confirmed ended") });
    expect(result.carry).toMatchObject({ message: expect.stringContaining("Original receiver listing cancellation.") });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    expect(success(await store.push({ carry: { ref: carriedBranch, expect: other.tip } })).carry)
      .toEqual({ ref: carriedBranch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });
  it("still publishes state when the carried receiver tip cannot be read", async () => {
    const { h, other } = await codeRaceFixture("leased");
    const store = createRefStore({ ...h.a.ports, exec: (command, args, options) => {
      const targetAt = args.indexOf("--") + 1;
      return h.a.ports.exec(command, args.includes("ls-remote") && args.includes("--refs")
        ? args.map((arg, index) => index === targetAt ? join(h.origin, "missing.git") : arg) : args, options);
    } });
    const result = PushResultSchema.parse(success(await store.push(PushInputSchema.parse({ carry: { ref: carriedBranch, expect: h.code.tip } }))));
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "unreachable", cause: "error" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });
  it("attributes a receiver race on an ordered code leg without blocking state", async () => {
    const { h, other } = await codeRaceFixture("unleased", "separate");
    let observed = "";
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      try { return await h.a.ports.exec(command, args, options); }
      catch (error) {
        if (args.includes("push") && !observed) observed = (await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim();
        throw error;
      }
    } });
    const result = PushResultSchema.parse(success(await store.push({ carry: { ref: carriedBranch } })));
    expect(observed).toBe(other.tip);
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "raced" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    await expect(h.a.exec("git", ["cat-file", "-e", other.tip], { objectAccess: "local-only" })).rejects.toBeDefined();
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });
  it.each(["leased", "unleased"] as const)("attributes every atomic collateral row using the %s carried branch", async (mode) => {
    const { h, code, other } = await codeRaceFixture(mode);
    let observed = "", porcelain = "";
    const observations: string[] = [];
    const store = createRefStore({ ...h.a.ports, exec: async (command, args, options) => {
      try {
        const result = await h.a.ports.exec(command, args, options);
        if (args.includes("ls-remote") && args.includes("--refs")) observations.push(result.stdout);
        return result;
      } catch (error) {
        if (args.includes("push") && !observed) {
          observed = (await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim();
          if (isGitProcessError(error)) porcelain = error.stdout;
        }
        throw error;
      }
    } });
    const input = PushInputSchema.parse({ carry: { ref: carriedBranch, ...mode === "leased" ? { expect: h.code.tip } : {} } });
    const result = PushResultSchema.parse(success(await store.push(input)));
    expect(observed).toBe(other.tip);
    const rows = porcelain.split("\n").filter((line) => line.startsWith("!\t"));
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every((line) => line.includes("atomic transaction failed"))).toBe(true);
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "raced" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed", families: ["personal"] }));
    expect(observations).toHaveLength(1);
    expect(observations[0]).toContain(other.tip);
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(other.tip);
    expect((await h.a.exec("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    await expect(h.a.exec("git", ["cat-file", "-e", other.tip], { objectAccess: "local-only" })).rejects.toBeDefined();
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
  });

  it("keeps an unattributed atomic failure terminal when the carried commit includes the moved tip", async () => {
    const h = await refCarryFixture("default");
    success(await h.a.store.push());
    await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
    const middle = await plantRef(h.a.root, "refs/heads/middle", [{ path: "middle.txt", content: "Included intermediate code.\n" }], { parents: [h.code.tip] });
    const code = await plantRef(h.a.root, carriedBranch, [{ path: "local.txt", content: "Later code.\n" }], { parents: [middle.tip] });
    await h.a.exec("git", ["push", "origin", `${middle.tip}:refs/test/compatible-code`]);
    const before = success(await h.a.store.read({ reference: carriedDocument }));
    success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version,
      content: "Pending unattributed state.\n", provenance: carryProvenance }));
    const marker = join(h.origin, "compatible-code-moved");
    await writeFile(join(h.origin, "hooks", "update"), `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${middle.tip}' "$2" || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "failed", failure: expect.objectContaining({
      code: "refused", class: "terminal", message: expect.stringContaining("atomic transaction failed"),
    }) }));
    expect(result.carry).toMatchObject({ ref: carriedBranch, status: "refused", reason: "remote-rejected" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(middle.tip);
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Pending unattributed state.\n");
    const next = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(next.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("Pending unattributed state.\n");
  });

  it("releases an unattributed code leg when the next pull finds its state already published", async () => {
    const h = await refCarryFixture("default"), state = "refs/arc/user/andrew/personal";
    success(await h.a.store.push()); success(await h.b.store.pull());
    const published = (await h.remote("git", ["rev-parse", state])).stdout.trim();
    await h.a.exec("git", ["push", "origin", `${carriedBranch}:${carriedBranch}`]);
    const middle = await plantRef(h.a.root, "refs/heads/middle", [{ path: "middle.txt", content: "Included code.\n" }], { parents: [h.code.tip] });
    const code = await plantRef(h.a.root, carriedBranch, [{ path: "later.txt", content: "Final code.\n" }], { parents: [middle.tip] });
    const before = success(await h.a.store.read({ reference: carriedDocument }));
    success(await h.a.store.write({ action: "put", reference: carriedDocument, expected: before.version, content: "Already included state.\n", provenance: carryProvenance }));
    await h.a.git(["push", "origin", `${state}:refs/test/included-state`, `${middle.tip}:refs/test/included-code`]);
    await h.b.git(["fetch", "origin", `refs/test/included-state:${state}`]);
    const extra = RecordReferenceSchema.parse({ ...carriedDocument, key: "remote-extra.md" });
    success(await h.b.store.write({ action: "put", reference: extra, expected: null, content: "Other state.\n", provenance: carryProvenance }));
    const incoming = (await h.b.git(["rev-parse", state])).stdout.trim();
    await h.b.git(["push", "origin", `${state}:refs/test/other-state`]);
    const marker = join(h.origin, "both-moved");
    await writeFile(join(h.origin, "hooks", "update"), `#!/bin/sh
if test "$1" = '${carriedBranch}' && ! test -f '${marker}'; then
  git update-ref "$1" '${middle.tip}' "$2" || exit 2
  git update-ref '${state}' '${incoming}' '${published}' || exit 2
  printf done > '${marker}'
fi
exit 0
`, { mode: 0o755 });
    const result = PushResultSchema.parse(success(await h.a.store.push({ carry: { ref: carriedBranch } })));
    expect(result.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "reconciled", families: ["personal"], retryCount: 1 }));
    expect((await h.remote("git", ["rev-parse", state])).stdout.trim()).toBe(incoming);
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
    expect(success(await h.a.store.read({ reference: carriedDocument })).content).toBe("Already included state.\n");
    expect(success(await h.a.store.read({ reference: extra })).content).toBe("Other state.\n");
  });
});

function carriedTransportLookup(args: string[], layout: "default" | "separate", origin: string): boolean {
  return layout === "default" ? args.includes("ls-remote") && args.includes("--get-url") && args.at(-1) === origin
    : args.includes("remote") && args.includes("get-url") && args.includes("--push") && args.at(-1) === "origin";
}

async function carriedObservationFixture(layout: "default" | "separate") {
  const race = await codeRaceFixture("unleased", layout), { h, code, other } = race;
  if (layout === "default") return { ...race, ports: h.a.ports, receiverTip: other.tip };
  // Replay a complete Git 2.43 receiver rejection at GitExec; lookup and repair still use native Git.
  await h.a.exec("git", ["push", "origin", `${code.tip}:refs/test/rejected-code`]);
  await h.remote("git", ["update-ref", "-d", "refs/test/rejected-code", code.tip]);
  let replay = true;
  const ports = { ...h.a.ports, exec: async (...args: Parameters<typeof h.a.ports.exec>) => {
    if (replay && args[1].includes("push") && args[1].some(arg => arg.endsWith(`:${carriedBranch}`))) {
      replay = false;
      await h.remote("git", ["update-ref", carriedBranch, other.tip, h.code.tip]);
      await writeFile(join(h.origin, "code-moved"), "done");
      throw makeGitProcessError({ command: args[0], args: args[1], exitCode: 1,
        stdout: `To ${h.origin}\n!\t${code.tip}:${carriedBranch}\t[remote rejected] (failed to update ref)\nDone\n`,
        stderr: `remote: error: cannot lock ref '${carriedBranch}': is at ${other.tip} but expected ${h.code.tip}        \n`
          + `error: failed to push some refs to '${h.origin}'\n` });
    }
    return h.a.ports.exec(...args);
  } };
  return { ...race, ports, receiverTip: other.tip };
}

async function expectRepairedCarry({ h, code, receiverTip }: Awaited<ReturnType<typeof carriedObservationFixture>>,
  store: ReturnType<typeof createRefStore>): Promise<void> {
  expect(success(await store.push({ carry: { ref: carriedBranch, expect: receiverTip } })).carry)
    .toEqual({ ref: carriedBranch, status: "pushed" });
  expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(code.tip);
  success(await h.b.store.pull());
  expect(success(await h.b.store.read({ reference: carriedDocument })).content).toBe("State after code race.\n");
}
