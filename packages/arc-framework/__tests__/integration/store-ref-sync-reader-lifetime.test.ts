/** Sync calls share native readers between structural refresh events. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRefStore, RecordReferenceSchema } from "../../src/lib/store/index.js";
import type { RefStorePorts } from "../../src/lib/store/ports.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { refSyncFixture } from "../helpers/store/ref-sync.js";
import { success } from "../helpers/store/suite-tools.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";

interface TraceEvent { event: string; sid: string; argv?: string[] }
const provenance = { verb: "test-sync", lifecycleAction: "update" };
afterEach(() => vi.unstubAllEnvs());
async function trace(path: string): Promise<TraceEvent[]> {
  return (await readFile(path, "utf8")).trim().split("\n").map((line) => JSON.parse(line) as TraceEvent);
}

describe.each(["default", "separate"] as const)("sync operation readers (%s)", (layout) => {
  it.each(["pull", "push"] as const)("shares readers between refresh events during %s", async (operation) => {
    const h = await refSyncFixture(layout);
    const seeded = success(await h.a.store.write({ action: "put", expected: null,
      reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
      content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
    const personal = RecordReferenceSchema.parse({ kind: "personal/document", key: "notes.md", owner: { type: "person", name: "andrew" } });
    success(await h.a.store.write({ action: "put", expected: null, reference: personal, content: "left\nseparator\nright\n", provenance }));
    success(await h.a.store.push()); success(await h.b.store.pull());
    const a = success(await h.a.store.read({ reference: personal }));
    const b = success(await h.b.store.read({ reference: personal }));
    success(await h.a.store.write({ action: "put", reference: personal, expected: a.version, content: "LEFT\nseparator\nright\n", provenance }));
    success(await h.b.store.write({ action: "put", reference: personal, expected: b.version, content: "left\nseparator\nRIGHT\n", provenance }));
    success(await h.a.store.push());
    const created = new Set<string>();
    let readOwnCommit = false;
    const store = createRefStore({ ...h.b.ports,
      exec: async (command, args, options) => {
        const result = await h.b.ports.exec(command, args, options);
        if (args.includes("commit-tree")) created.add(result.stdout.trim());
        return result;
      },
      rawExec: async (args, options) => {
        if (args.includes("cat-file") && options?.batchReader) {
          const input = new TextDecoder().decode(options.input);
          if ([...created].some((oid) => input.includes(oid))) readOwnCommit = true;
        }
        return h.b.ports.rawExec(args, options);
      },
    });
    const path = join(h.b.root, "sync-reader-trace.json");
    vi.stubEnv("GIT_TRACE2_EVENT", path);
    expect(await store[operation]()).toMatchObject({ status: "ok" });
    const events = await trace(path);
    const rootDepth = Math.min(...events.filter(({ event }) => event === "start").map(({ sid }) => sid.split("/").length));
    const open = new Map<string, string>();
    const started = new Set<string>();
    for (const event of events) {
      if (event.event === "exit") for (const [repository, sid] of open) if (sid === event.sid) open.delete(repository);
      if (event.event !== "start") continue;
      if (event.sid.split("/").length === rootDepth && event.argv?.some((arg) => ["fetch", "maintenance", "gc"].includes(arg))) {
        expect(open.size).toBe(0);
        started.clear();
      }
      if (event.argv?.includes("cat-file") && event.argv.includes("--batch")) {
        const repository = event.argv.find((arg) => arg.startsWith("--git-dir=")) ?? h.b.root;
        expect(started.has(repository)).toBe(false);
        started.add(repository); open.set(repository, event.sid);
      }
    }
    expect(started.size).toBeGreaterThan(0);
    expect(open.size).toBe(0);
    vi.unstubAllEnvs();
    expect(success(await h.b.store.read({ reference: personal })).content).toBe("LEFT\nseparator\nRIGHT\n");
    expect(success(await h.b.store.read({ reference: seeded.reference })).content).toBe(makeMetaFixture("alpha"));
    if (operation === "push") expect(readOwnCommit).toBe(true);
    if (operation === "push") expect((await h.remote("git", ["for-each-ref", "--format=%(refname)", "refs/arc/user/"])).stdout).toContain("personal");
  }, 60_000);
});

it.each(["default", "separate"] as const)("preserves an unknown execInput option through the scoped %s context", async (layout) => {
  const f = await createRefReadFixture();
  if (layout === "separate") await f.exec("git", ["config", "remote.origin.arc-state", "off"]);
  const futureDeadline = { commitMayFinish: true };
  const controls = { cwd: f.root, futureDeadline };
  let observed: unknown, invoked = false;
  const store = createRefStore({ ...f.ports,
    execInput: async (args, input, options) => {
      if (input === "forwarding probe") observed = options;
      return f.ports.execInput(args, input, options);
    },
    actor: async function (this: Pick<RefStorePorts, "execInput">, identity) {
      invoked = true;
      await this.execInput(["hash-object", "--stdin"], "forwarding probe", controls);
      return f.ports.actor(identity);
    },
  });
  const record = success(await store.write({ action: "put", expected: null,
    reference: RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    content: makeMetaFixture("alpha"), placement: { kind: "active" }, provenance }));
  expect(invoked).toBe(true);
  expect(observed).toMatchObject({ futureDeadline });
  expect(success(await store.read({ reference: record.reference })).content).toBe(makeMetaFixture("alpha"));
}, 30_000);
