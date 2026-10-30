/** Configuration answers belong to one public operation and refresh at guarded changes. */
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createRefStore, RecordReferenceSchema, type RefStorePorts } from "../../src/lib/store/index.js";
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

function observeConfiguration(ports: RefStorePorts) {
  let sequence = 0;
  const held = new Set<number>(), seen = new Map<string, number>();
  const duplicates: string[] = [], unlocked = new Map<string, number>(), underLocks = new Set<string>();
  const record = (args: string[]) => {
    const at = args.indexOf("config");
    if (at < 0 || !args.includes("--null") || !args.some((arg) => ["--list", "--get-regexp", "--get-all"].includes(arg))) return;
    const repository = args.filter((arg) => arg.startsWith("--git-dir=")).at(-1) ?? ports.checkoutRoot;
    const key = JSON.stringify([repository, args.slice(at + 1)]), bound = Math.max(0, ...held);
    if ((seen.get(key) ?? -1) >= bound) duplicates.push(key);
    seen.set(key, ++sequence);
    if (held.size) underLocks.add(key);
    else unlocked.set(key, (unlocked.get(key) ?? 0) + 1);
  };
  return { duplicates, unlocked, underLocks, ports: { ...ports,
    exec: async (...args: Parameters<RefStorePorts["exec"]>) => { record(args[1]); return ports.exec(...args); },
    rawExec: async (...args: Parameters<RefStorePorts["rawExec"]>) => { record(args[0]); return ports.rawExec(...args); },
    lock: async (...args: Parameters<RefStorePorts["lock"]>) => {
      const release = await ports.lock(...args), stamp = ++sequence;
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
});

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
