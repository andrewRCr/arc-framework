/** Configuration answers belong to one public operation and refresh at guarded changes. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, runStoreRemote, type RefStorePorts } from "../../src/lib/store/index.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";

const provenance = { verb: "edit", lifecycleAction: "save" };
const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "operation.md", owner: { type: "person", name: "andrew" } });

async function pending(layout: "default" | "separate") {
  const h = await refSyncFixture(layout);
  const first = success(await h.a.store.write({ action: "put", reference: personal, expected: null, content: "Before.\n", provenance }));
  if (!first.version) throw new Error("The seeded document has no version");
  success(await h.a.store.push());
  success(await h.a.store.write({ action: "put", reference: personal, expected: first.version, content: "Pending.\n", provenance }));
  return h;
}

interface ConfigurationRead { key: string; sequence: number; locked: boolean; output?: string }

/** Record configuration reads and writes in order; `afterLock` acts as another process just as a lock is taken. */
function observeConfiguration(ports: RefStorePorts, afterLock?: (seen: ReadonlyMap<string, number>) => Promise<boolean>) {
  let sequence = 0, changedAt: number | undefined;
  const held = new Set<number>(), seen = new Map<string, number>();
  const duplicates: string[] = [], unlocked = new Map<string, number>(), underLocks = new Set<string>();
  const reads: ConfigurationRead[] = [], writes: { repository: string; sequence: number }[] = [];
  const record = (args: string[]): ConfigurationRead | undefined => {
    const at = args.indexOf("config");
    if (at < 0) return undefined;
    const repository = args.filter((arg) => arg.startsWith("--git-dir=")).at(-1) ?? ports.checkoutRoot;
    if (!args.includes("--null") || !args.some((arg) => ["--list", "--get-regexp", "--get-all"].includes(arg))) {
      if (!args.some((arg) => ["--get", "--get-all", "--get-regexp", "--list"].includes(arg))) writes.push({ repository, sequence: ++sequence });
      return undefined;
    }
    const key = JSON.stringify([repository, args.slice(at + 1)]), bound = Math.max(0, ...held);
    if ((seen.get(key) ?? -1) >= bound) duplicates.push(key);
    seen.set(key, ++sequence);
    if (held.size) underLocks.add(key);
    else unlocked.set(key, (unlocked.get(key) ?? 0) + 1);
    const read = { key, sequence, locked: held.size > 0 };
    reads.push(read);
    return read;
  };
  const decode = (stdout: string | Uint8Array) => typeof stdout === "string" ? stdout : new TextDecoder().decode(stdout);
  return { duplicates, unlocked, underLocks, reads, writes, changedAt: () => changedAt, ports: { ...ports,
    exec: async (...args: Parameters<RefStorePorts["exec"]>) => {
      const read = record(args[1]), result = await ports.exec(...args);
      if (read) read.output = decode(result.stdout);
      return result;
    },
    rawExec: async (...args: Parameters<RefStorePorts["rawExec"]>) => {
      const read = record(args[0]), result = await ports.rawExec(...args);
      if (read) read.output = decode(result.stdout);
      return result;
    },
    lock: async (...args: Parameters<RefStorePorts["lock"]>) => {
      const release = await ports.lock(...args);
      if (changedAt === undefined && afterLock && await afterLock(seen)) changedAt = ++sequence;
      const stamp = ++sequence;
      held.add(stamp);
      return async () => { try { await release(); } finally { held.delete(stamp); } };
    },
  } satisfies RefStorePorts };
}

describe.each(["default", "separate"] as const)("operation configuration (%s)", (layout) => {
  it("reads each repeated lookup once until a new lock requires a fresh answer", async () => {
    const h = await pending(layout);
    const observed = observeConfiguration(h.a.ports);
    const result = success(await createRefStore(observed.ports).push());
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    const designation = JSON.stringify([`--git-dir=${join(h.a.root, ".git")}`, ["--null", "--list", "--includes"]]);
    expect(observed.unlocked.get(designation)).toBe(1);
    expect(observed.duplicates).toEqual([]);
    expect(observed.underLocks.size).toBeGreaterThan(0);
    expect(success(await h.a.store.read({ reference: personal })).content).toBe("Pending.\n");
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("Pending.\n");
  }, 60_000);

  it("reads another process's configuration change under the next lock and serves that answer after release", async () => {
    const h = await pending(layout);
    const designation = JSON.stringify([`--git-dir=${join(h.a.root, ".git")}`, ["--null", "--list", "--includes"]]);
    const observed = observeConfiguration(h.a.ports, async (seen) => {
      if (!seen.has(designation)) return false;
      await h.a.exec("git", ["config", "operationprobe.marker", "changed"]);
      return true;
    });
    const result = success(await createRefStore(observed.ports).push());
    expect(result.publishes).toContainEqual(expect.objectContaining({ status: "pushed" }));
    const changedAt = observed.changedAt();
    expect(changedAt).toBeDefined();
    const reads = observed.reads.filter(({ key }) => key === designation);
    const before = reads.filter(({ sequence }) => sequence < changedAt!), after = reads.filter(({ sequence }) => sequence > changedAt!);
    expect(before.length).toBeGreaterThan(0);
    expect(before.every(({ output }) => !output?.includes("operationprobe.marker"))).toBe(true);
    expect(after[0]).toMatchObject({ locked: true, output: expect.stringContaining("operationprobe.marker\nchanged") });
    expect(observed.duplicates).toEqual([]);
    expect(reads.at(-1)?.output).toContain("operationprobe.marker\nchanged");
    expect(observed.unlocked.get(designation)).toBe(1);
    success(await h.b.store.pull());
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("Pending.\n");
  }, 60_000);
});

it("reads the separate store's configuration again after a command writes it", async () => {
  const h = await refSyncFixture("separate");
  const store = `--git-dir=${join(h.a.root, ".git", "arc", "store")}`;
  const designation = JSON.stringify([store, ["--null", "--list", "--includes"]]);
  const observed = observeConfiguration(h.a.ports);
  expect(await runStoreRemote(observed.ports, { remote: "backing", role: "read" })).toMatchObject({ status: "ok",
    result: { remotes: expect.arrayContaining([expect.objectContaining({ name: "backing", role: "read" })]) } });
  const write = observed.writes.find(({ repository }) => repository === store);
  expect(write).toBeDefined();
  const reads = observed.reads.filter(({ key }) => key === designation);
  expect(reads.some(({ sequence }) => sequence < write!.sequence)).toBe(true);
  expect(reads.find(({ sequence }) => sequence > write!.sequence)?.output).toContain("remote.backing.arc-state\nread");
  expect((await h.a.git(["config", "remote.backing.arc-state"])).stdout).toBe("read");
}, 60_000);

it.each(["default", "separate"] as const)("forwards a zero lock wait through the scoped %s context", async (layout) => {
  const f = await createRefReadFixture();
  if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  let observed: number | undefined, requested = false;
  const store = createRefStore({ ...f.ports,
    lock: async (ref, waitMs) => {
      if (ref === "zero-wait-probe") { requested = true; observed = waitMs; }
      return f.ports.lock(ref, waitMs);
    },
    actor: async function (this: Pick<RefStorePorts, "lock">, identity) {
      const release = await this.lock("zero-wait-probe", 0);
      await release();
      return f.ports.actor(identity);
    },
  });
  const record = success(await store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "personal/document", key: "zero.md", owner: { type: "person", name: "andrew" } }),
    content: "Zero wait preserved.\n", provenance }));
  expect(requested).toBe(true);
  expect(observed).toBe(0);
  expect(success(await store.read({ reference: record.reference })).content).toBe("Zero wait preserved.\n");
});
