/** First-designation acquisition preserves explicit answers completed while asynchronous work waits. */
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, runStoreRemote, runStoreMigrate } from "../../src/lib/store/index.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { access } from "node:fs/promises";
import { join } from "node:path";

const identity = RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project" } });
const content = '{"projectId":"34567890-1234-4234-8234-123456789abc"}';
const provenance = { verb: "init", lifecycleAction: "seed" };

it("reconciles the current designation when automatic acquisition completes before layout admission", async () => {
  const h = await refSyncFixture();
  for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity,
    expected: null, content, provenance }));
  success(await h.a.store.push());
  await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  let admitted = false;
  const migrated = await runStoreMigrate({ ...h.b.ports, lock: async (key, ...args) => {
    if (key === "layout" && !admitted) {
      admitted = true;
      success(await h.b.store.pull());
      expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout).toBe("push");
    }
    return h.b.ports.lock(key, ...args);
  } }, {});
  expect(admitted).toBe(true);
  expect(migrated).toMatchObject({ status: "ok" });
  expect(success(await h.b.store.read({ reference: identity })).content).toBe(content);
  for (const name of ["store", "store-migrate-build", "store-migrate-old"]) {
    await expect(access(join(h.b.root, ".git/arc", name))).rejects.toMatchObject({ code: "ENOENT" });
  }
  for (const result of [success(await h.b.store.pull()), success(await h.b.store.push())]) {
    expect(result.states).toEqual([]);
    expect(result.pulls.filter(({ status }) => status === "failed")).toEqual([]);
  }
}, 60_000);

it("revalidates an explicit publisher after automatic designation completes during its preflight", async () => {
  const h = await refSyncFixture(), other = await refSyncFixture();
  for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity,
    expected: null, content, provenance }));
  success(await h.a.store.push());
  await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
  await h.b.exec("git", ["remote", "add", "other", other.origin]);
  let release!: () => void, entered!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const ports = { ...h.b.ports, exec: async (...args: Parameters<typeof h.b.ports.exec>) => {
    const result = await h.b.ports.exec(...args);
    if (args[1].includes("fetch") && args[2]?.input?.includes(":refs/arc/tmp/designate/other/")) {
      entered();
      await waiting;
    }
    return result;
  } };
  const setting = runStoreRemote(ports, { remote: "other", role: "push" });
  try {
    await started;
    success(await h.b.store.pull());
    const config = async () => (await h.b.exec("git", ["config", "--get-regexp", "^remote\\..*\\.arc-state$"])).stdout;
    const refs = async () => (await h.b.git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/arc/"])).stdout
      .split("\n").filter(row => row && !row.startsWith("refs/arc/tmp/")).sort();
    const before = { config: await config(), refs: await refs() };
    expect(before.config).toContain("remote.origin.arc-state push");
    release();
    expect(await setting).toMatchObject({ status: "refused", refusal: { code: "role-conflict", class: "recoverable",
      condition: expect.stringContaining("origin") } });
    expect({ config: await config(), refs: await refs() }).toEqual(before);
    for (const name of ["store", "store-migrate-build", "store-migrate-old"]) {
      await expect(access(join(h.b.root, ".git/arc", name))).rejects.toMatchObject({ code: "ENOENT" });
    }
    expect(await runStoreRemote(h.b.ports, { remote: "other", role: "push" }))
      .toMatchObject({ status: "refused", refusal: { code: "role-conflict" } });
    expect(success(await h.b.store.read({ reference: identity })).content).toBe(content);
  } finally {
    release();
    await setting;
  }
});

describe.each(["off", "read"] as const)("explicit %s during first designation", role => {
  it("preserves the answer completed during automatic project acquisition and on retry", async () => {
    const h = await refSyncFixture();
    for (const checkout of [h.a, h.b]) success(await checkout.store.write({ action: "put", reference: identity,
      expected: null, content, provenance }));
    success(await h.a.store.push());
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    let answered = false;
    const store = createRefStore({ ...h.b.ports, exec: async (command, args, options) => {
      const result = await h.b.ports.exec(command, args, options);
      if (!answered && args.includes("fetch") && (options?.input?.split(/\r?\n/u) ?? []).some(arg => arg.includes(":refs/arc/tmp/designate/"))) {
        answered = true;
        expect(await runStoreRemote(h.b.ports, { remote: "origin", role })).toMatchObject({ status: "ok" });
      }
      return result;
    } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const pulled = success(await store.pull());
      expect(answered).toBe(true);
      expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe(role);
      expect(pulled.states).toEqual([{ status: "no-remote" }]);
      expect(pulled.pulls.filter(outcome => outcome.role === "state")).toEqual([]);
      if (role === "read") expect(pulled.pulls).toContainEqual(expect.objectContaining({ remote: "origin", role: "read",
        status: expect.stringMatching(/^(pulled|noop)$/u) }));
      expect(success(await store.read({ reference: identity })).content).toBe(content);
    }
  });

  it("preserves the answer completed while the first backing pointer waits and on retry", async () => {
    const h = await refSyncFixture();
    await h.b.exec("git", ["config", "--unset", "remote.origin.arc-state"]);
    let answered = false;
    const store = createRefStore({ ...h.b.ports, backingRepository: async () => {
      if (!answered) {
        answered = true;
        expect(await runStoreRemote(h.b.ports, { remote: "origin", role })).toMatchObject({ status: "ok" });
      }
      return h.origin;
    } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const pulled = success(await store.pull());
      expect(answered).toBe(true);
      expect((await h.b.exec("git", ["config", "remote.origin.arc-state"])).stdout.trim()).toBe(role);
      expect((await h.b.git(["remote"])).stdout).not.toMatch(/^backing$/mu);
      expect(pulled.states).toEqual([{ status: "no-remote" }]);
      expect(pulled.pulls.filter(outcome => outcome.role === "state")).toEqual([]);
    }
  });
});
