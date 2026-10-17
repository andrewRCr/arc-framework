/** Project identity checks before automatic state designation. */

import { mkdir, unlink, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createRefSyncCheckout } from "../helpers/store/ref-sync.js";
import { makeGitExec } from "../helpers/integration.js";
import { dirname, join } from "node:path";
import { isGitProcessError } from "../../src/lib/git/process-error.js";
import { createServer } from "node:http";
import type { Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { createRefClock } from "../helpers/store/ref-clock.js";
import { createRefStore } from "../../src/lib/store/create.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { RecordReferenceSchema, PullResultSchema, runStoreMigrate } from "../../src/lib/store/index.js";

const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const localId = "34567890-1234-4234-8234-123456789abc";
const foreignId = "abcdef01-1234-4234-8234-123456789abc";
const provenance = { verb: "init", lifecycleAction: "seed" };

async function putIdentity(store: Awaited<ReturnType<typeof refSyncFixture>>["a"]["store"], projectId: string) {
  return success(await store.write({ action: "put", reference: identity, expected: null,
    content: JSON.stringify({ projectId }), provenance }));
}

describe("automatic designation project check", () => {
  it("refuses a foreign registry before setting a role or merging its identity", async () => {
    const h = await refSyncFixture();
    await putIdentity(h.a.store, foreignId);
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await putIdentity(h.b.store, localId);
    const before = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const result = PullResultSchema.parse(success(await h.b.store.pull()));
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ remote: "origin", role: "candidate", status: "failed", failure: {
      code: "refused", class: "terminal", condition: expect.stringContaining(localId),
      message: expect.stringContaining(foreignId), remedy: { argv: ["arc", "store", "remote", "origin", "off"] },
    } }]);
    expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
    expect((await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout).toBe(before);
    expect(success(await h.b.store.read({ reference: identity })).content).toContain(localId);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
    await h.b.exec("git", ["config", "remote.origin.arc-state", "off"]);
    expect((await runStoreMigrate(h.b.ports)).status).toBe("ok");
    expect(success(await h.b.store.pull())).toEqual({ states: [{ status: "no-remote" }], pulls: [] });
  });

  it("ends a held designation fetch at the operation deadline and allows a repaired retry", async () => {
    const h = await refSyncFixture(), clock = createRefClock(new Date(0), 0);
    await putIdentity(h.a.store, localId);
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await putIdentity(h.b.store, localId);
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    let admit: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => { admit = resolve; });
    const sockets = new Set<Socket>();
    const server = createServer(() => admit?.());
    server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing HTTP endpoint");
    let redirected = false;
    const store = createRefStore({ ...h.b.ports, ...clock, exec: async (command, args, options) => {
      if (!redirected && args.includes("fetch")) {
        redirected = true;
        await h.b.exec("git", ["remote", "set-url", "origin", `http://127.0.0.1:${address.port}/repo`]);
      }
      return h.b.ports.exec(command, args, options);
    } });
    const pending = store.pull();
    void pending.catch(() => undefined);
    try {
      await Promise.race([ready, pending.then(() => { throw new Error("Designation ended before HTTP admission"); })]);
      const waiting = Symbol("waiting");
      clock.advance(119_999);
      expect(await Promise.race([pending, delay(20).then(() => waiting)])).toBe(waiting);
      clock.advance(1);
      const ended = await Promise.race([pending, delay(1000).then(() => waiting)]);
      expect(ended).not.toBe(waiting);
      if (typeof ended === "symbol") throw new Error("The designation fetch outlived its deadline");
      const result = PullResultSchema.parse(success(ended));
      expect(result.states).toEqual([]);
      expect(result.pulls).toMatchObject([{ status: "failed", role: "candidate", failure: { code: "unreachable", cause: "timeout" } }]);
      expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
      expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
      await h.b.exec("git", ["remote", "set-url", "origin", h.origin]);
      expect(success(await store.pull()).pulls).toMatchObject([{ status: "pulled", role: "state" }]);
    } finally {
      clock.advance(120_000);
      await pending.catch(() => undefined);
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 10_000);


  it("refuses a native per-ref fetch rejection and succeeds after its lock is removed", async () => {
    const h = await refSyncFixture();
    await putIdentity(h.a.store, localId);
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await putIdentity(h.b.store, localId);
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    expect((await h.b.exec("git", ["rev-parse", "--show-ref-format"])).stdout).toBe("files");
    const lock = join(h.b.root, ".git", "refs", "arc", "tmp", "designate", "origin", "registry.lock");
    await mkdir(dirname(lock), { recursive: true });
    await writeFile(lock, "held by the test\n");
    const reports: string[] = [];
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      try {
        const result = await h.b.ports.exec(command, args, options);
        if (args.includes("fetch")) reports.push(result.stdout);
        return result;
      } catch (error) {
        if (args.includes("fetch") && isGitProcessError(error)) reports.push(error.stdout);
        throw error;
      }
    } });
    const result = PullResultSchema.parse(success(await store.pull()));
    expect(reports.join("\n")).toMatch(/^! [0-9a-f]+ [0-9a-f]+ refs\/arc\/tmp\/designate\/origin\/registry$/mu);
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ status: "failed", role: "candidate", failure: { code: "refused", class: "terminal" } }]);
    expect((await h.b.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
    await unlink(lock);
    expect(success(await store.pull()).pulls).toMatchObject([{ status: "pulled", role: "state" }]);
  }, 15_000);

  it.each(["matching", "absent"] as const)("designates a remote whose project ID is %s", async (mode) => {
    const h = await refSyncFixture();
    if (mode === "matching") await putIdentity(h.a.store, localId);
    else success(await h.a.store.write({ action: "put", expected: null, content: "{}", provenance,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "server", owner: { type: "project", name: "project" } }) }));
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await putIdentity(h.b.store, localId);
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const result = PullResultSchema.parse(success(await h.b.store.pull()));
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ role: "state", status: "pulled" }]);
    expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
    expect(success(await h.b.store.read({ reference: identity })).content).toContain(localId);
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
  });

  it("adopts the published identity into a teammate's unrelated registry without losing its records", async () => {
    const h = await refSyncFixture();
    await putIdentity(h.a.store, localId);
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    const counter = RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "teammate", owner: { type: "project", name: "project" } });
    success(await h.b.store.write({ action: "put", reference: counter, content: "{}", expected: null, provenance }));
    const localTip = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
    const remoteTip = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout;
    await h.b.exec("git", ["fetch", "--no-tags", "origin", remoteTip]);
    await expect(h.b.exec("git", ["merge-base", localTip, remoteTip], { objectAccess: "local-only" }))
      .rejects.toMatchObject({ kind: "nonzero-exit", exitCode: 1 });
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const result = PullResultSchema.parse(success(await h.b.store.pull()));
    expect(result.states).toEqual([]);
    expect(result.pulls).toMatchObject([{ role: "state", status: "pulled" }]);
    expect(success(await h.b.store.read({ reference: identity })).content).toContain(localId);
    expect(success(await h.b.store.read({ reference: counter })).content).toBe("{}");
  });


  it("clears stale candidate tips before fetching and drops them after the decision", async () => {
    const h = await refSyncFixture();
    await putIdentity(h.a.store, localId);
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await putIdentity(h.b.store, localId);
    const old = (await h.b.git(["rev-parse", "refs/arc/project/registry"])).stdout;
    const incoming = (await h.remote("git", ["rev-parse", "refs/arc/project/registry"])).stdout;
    expect(old).not.toBe(incoming);
    const temporary = "refs/arc/tmp/designate/origin/registry";
    await h.b.git(["update-ref", temporary, old]);
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const reports: string[] = [];
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("fetch")) reports.push(result.stdout);
      return result;
    } });
    expect(success(await store.pull()).pulls).toMatchObject([{ status: "pulled", role: "state" }]);
    expect(reports.join("\n")).toMatch(new RegExp(`^\\* 0+ ${incoming} ${temporary}$`, "mu"));
    expect((await h.b.git(["for-each-ref", "--format=%(refname)", "refs/arc/tmp/designate/"])).stdout).toBe("");
    expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
  });


  it.each([false, true])("holds the full candidate closure before designation in a bitmap-backed blobless clone, initially deny repair: %s", async (denyRepair) => {
    const h = await refSyncFixture();
    const code = await plantRef(h.a.root, "refs/heads/shared-counter", [{ path: "counter.json", content: "{}" }],
      { parents: [(await h.a.exec("git", ["rev-parse", "HEAD"])).stdout] });
    await h.a.exec("git", ["push", "origin", "refs/heads/shared-counter:refs/heads/shared-counter"]);
    await putIdentity(h.a.store, localId);
    success(await h.a.store.write({ action: "put", expected: null, content: "{}", provenance,
      reference: RecordReferenceSchema.parse({ kind: "project-registry/counter", key: "server", owner: { type: "project", name: "project" } }) }));
    await h.a.git(["push", "origin", "refs/arc/*:refs/arc/*"]);
    await h.remote("git", ["config", "uploadpack.allowFilter", "true"]);
    await h.remote("git", ["repack", "-ad", "--write-bitmap-index"]);
    const root = join(h.a.root, "partial-project");
    await h.a.exec("git", ["clone", "--filter=blob:none", "--no-checkout", "--branch", "shared-counter", pathToFileURL(h.origin).href, root]);
    const git = makeGitExec(root);
    for (const [key, value] of [["arc.identity", "andrew"], ["user.name", "Partial clone"], ["user.email", "partial@example.test"],
      ["protocol.version", "0"], ["remote.origin.arc-state", "push"]]) await git("git", ["config", key!, value!]);
    const partial = await createRefSyncCheckout(root, "default", h.origin);
    await putIdentity(partial.store, localId);
    await partial.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    const blob = code.blobs.get("counter.json");
    if (!blob) throw new Error("Missing shared counter blob");
    await expect(partial.exec("git", ["cat-file", "-e", blob], { objectAccess: "local-only" })).rejects.toBeDefined();
    let missingBeforeDesignation: boolean | undefined;
    let blocked = denyRepair;
    const store = createRefStore({ ...partial.ports, exec: async (command, args, options) => {
      if (args[0] === "config" && args[1] === "remote.origin.arc-state" && args[2] === "push") {
        try { await partial.exec("git", ["cat-file", "-e", blob], { objectAccess: "local-only" }); missingBeforeDesignation = false; }
        catch (error) { if (!isGitProcessError(error)) throw error; missingBeforeDesignation = true; }
      }
      return partial.ports.exec(command, blocked && args.includes("fetch") ? args.filter((arg) => arg !== "--refetch") : args, options);
    } });
    if (blocked) {
      const failed = success(await store.pull());
      expect(failed.states).toEqual([]);
      expect(failed.pulls).toMatchObject([{ role: "candidate", status: "failed", failure: {
        code: "refused", class: "terminal", condition: expect.stringContaining(blob),
      } }]);
      expect(missingBeforeDesignation).toBeUndefined();
      expect((await partial.exec("git", ["config", "--list"])).stdout).not.toContain("remote.origin.arc-state");
      blocked = false;
    }
    expect(success(await store.pull()).pulls).toMatchObject([{ role: "state", status: "pulled" }]);
    expect(missingBeforeDesignation).toBe(false);
    await partial.exec("git", ["cat-file", "-e", blob], { objectAccess: "local-only" });
  }, 30_000);

});
