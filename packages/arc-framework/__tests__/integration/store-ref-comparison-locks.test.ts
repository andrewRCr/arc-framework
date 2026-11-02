/** Comparison admission yields layout while another operation owns the remote's keeper lease. */
import { AdvisoryLockTimeoutError } from "../../src/lib/advisory-lock.js";
import { followFixture } from "../helpers/store/follow.js";
import { invokeStoreRemote } from "../helpers/store/remote-command.js";
import { invokeStoreMigrate } from "../helpers/store/migrate-command.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { createRefClock } from "../helpers/store/ref-clock.js";
import { success } from "../helpers/store/suite-tools.js";

const personal = (key: string) => RecordReferenceSchema.parse({ kind: "personal/document", key,
  owner: { type: "person", name: "andrew" } });
const provenance = { verb: "user", lifecycleAction: "save" };

it.each(["default", "separate"] as const)("yields layout during keeper contention, retains lock budgets, and publishes under both leases (%s)", async layout => {
  const h = await refSyncFixture(layout), clock = createRefClock(new Date(0), 0);
  success(await h.a.store.write({ action: "put", reference: personal("seed.md"), expected: null, content: "seed\n", provenance }));
  success(await h.a.store.push()); success(await h.b.store.pull());
  success(await h.b.store.write({ action: "put", reference: personal("pending.md"), expected: null, content: "pending\n", provenance }));
  const lease = `refs/arc/tmp/seen/${h.remoteName}`, held = new Set<string>(), waits: number[] = [];
  let fetched = false, armed = true, releaseBlocker: (() => Promise<void>) | undefined, bothObserved = false;
  let waiting: () => void = () => {}, resume: () => void = () => {};
  const entered = new Promise<void>(resolve => { waiting = resolve; });
  const continuing = new Promise<void>(resolve => { resume = resolve; });
  const publisher = createRefStore({ ...h.b.ports, ...clock,
    lock: async (name, waitMs) => {
      if (fetched && armed && name === "layout") {
        armed = false;
        releaseBlocker = await h.b.ports.lock(lease);
        clock.advance(112_000);
      }
      if (fetched && name === lease) {
        waits.push(waitMs ?? -1);
        if (releaseBlocker && waitMs !== 0) { waiting(); await continuing; }
      }
      const release = await h.b.ports.lock(name, waitMs);
      held.add(name);
      return async () => { try { await release(); } finally { held.delete(name); } };
    },
    exec: async (command, args, options) => {
      if (fetched && held.has("layout") && held.has(lease) && args.includes("get-url")) {
        for (const name of ["layout", lease]) {
          const path = join(h.b.root, ".git", "arc", "locks", `${name}.lock`);
          expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ pid: process.pid, token: expect.any(String) });
        }
        bothObserved = true;
      }
      const result = await h.b.ports.exec(command, args, options);
      if (args.includes("fetch")) fetched = true;
      return result;
    },
  });
  const pending = publisher.push(); void pending.catch(() => undefined);
  try {
    await Promise.race([entered, pending.then(() => { throw new Error("Publisher did not wait for the held keeper lease"); })]);
    const sibling = createRefStore({ ...h.b.ports,
      lock: (name, waitMs) => h.b.ports.lock(name, name === "layout" ? 100 : waitMs),
    });
    const written = await sibling.write({ action: "put", reference: personal("during-wait.md"), expected: null,
      content: "written while waiting\n", provenance });
    expect(written.status, JSON.stringify(written)).toBe("ok");
    success(await h.a.store.write({ action: "put", reference: personal("incoming.md"), expected: null, content: "incoming\n", provenance }));
    success(await h.a.store.push());
    await releaseBlocker?.(); releaseBlocker = undefined;
    const pulled = success(await sibling.pull());
    expect(pulled.pulls.every(row => row.status !== "failed"), JSON.stringify(pulled)).toBe(true);
    expect(success(await sibling.read({ reference: personal("incoming.md") })).content).toBe("incoming\n");
    resume();
    const published = success(await pending);
    expect(published.publishes.every(row => row.status !== "failed"), JSON.stringify(published)).toBe(true);
    expect(waits[0]).toBe(0);
    expect(waits.some(wait => wait > 0 && wait <= 8_000)).toBe(true);
    expect(waits.every(wait => wait >= 0 && wait <= 8_000)).toBe(true);
    expect(bothObserved).toBe(true);
    expect(held.size).toBe(0);
    success(await h.a.store.pull());
    expect(success(await h.a.store.read({ reference: personal("pending.md") })).content).toBe("pending\n");
    expect(success(await h.a.store.read({ reference: personal("during-wait.md") })).content).toBe("written while waiting\n");
  } finally { await releaseBlocker?.(); releaseBlocker = undefined; resume(); await pending.catch(() => undefined); }
}, 30_000);


it("bounds a deadline-free follow's comparison retry and resumes after its live keeper holder releases", async () => {
  const h = await followFixture(), follower = h.follower, clock = createRefClock(new Date(0), 0);
  await expect(invokeStoreRemote(["backing", "push", "--json"], { cwd: follower.root, ports: { ...follower.ports,
    migrateStep: async step => { if (step === "follow.switched") throw new Error("Pause before cleanup"); },
  } })).rejects.toThrow("Pause before cleanup");
  const source = (await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout;
  let holder: (() => Promise<void>) | undefined, expired = false, lockPath = "";
  try {
    const stopped = await invokeStoreMigrate([], { ...follower.ports, ...clock, lock: async (name, waitMs) => {
      if (!expired && name.startsWith("refs/arc/tmp/seen/") && waitMs === 0 && !holder) holder = await follower.ports.lock(name);
      if (holder && waitMs !== 0 && name.startsWith("refs/arc/tmp/seen/")) {
        await expect(follower.ports.lock(name, 0)).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);
        expired = true; clock.advance(120_000); await holder(); holder = undefined;
      }
      try { return await follower.ports.lock(name, waitMs); }
      catch (error) { if (error instanceof AdvisoryLockTimeoutError) lockPath = error.lockPath; throw error; }
    } });
    expect(expired).toBe(true);
    expect(stopped).toMatchObject({ status: "refused", refusal: { code: "store",
      refusal: { code: "lock-held", lock: lockPath, condition: "The lock remained held for 120000ms.",
        remedy: { text: expect.stringContaining("retry") } } } });
    expect((await h.remote("git", ["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout).toBe(source);
  } finally { await holder?.(); }
  expect((await invokeStoreMigrate([], { ...follower.ports, ...clock })).status).toBe("ok");
  expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout.trim()).toBe("refs/arc/project/moved");
});
